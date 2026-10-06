// Service worker: busca (somente leitura) seguidores/seguindo usando a sessão
// já autenticada do próprio usuário no instagram.com, e executa unfollow
// individual apenas quando explicitamente solicitado pelo painel injetado na
// página (um clique do usuário = uma ação). Os limites de segurança abaixo
// (intervalo mínimo entre sincronizações, intervalo mínimo entre unfollows,
// e pausa longa automática ao primeiro sinal de limitação do Instagram)
// existem porque esta conta já recebeu uma limitação — o objetivo é reduzir
// o padrão de tráfego que se parece com automação, não é uma garantia.

const IG_APP_ID = "936619743392459"; // id público da web app do Instagram, usado pelo próprio site
const BASE = "https://www.instagram.com";
const PAGE_SIZE = 25; // parecido com o tamanho de página que o próprio site pede ao rolar a lista

// --- Limites de segurança -------------------------------------------------
// O Instagram já aplicou uma limitação nesta conta, então estes controles
// vivem aqui no background (não na UI) para valerem mesmo que o painel seja
// fechado e reaberto: uma sincronização não pode começar antes de um
// intervalo mínimo, um unfollow não pode ser disparado logo depois do
// anterior, e qualquer sinal de limitação vindo do Instagram (429, ou um
// corpo de resposta com checkpoint/feedback/challenge_required) trava a
// extensão inteira por um bom tempo, sem tentar de novo sozinha.
const SAFETY_KEY = "igSafetyState";
const MIN_SYNC_INTERVAL_MS = 20 * 60 * 1000; // 20 min entre sincronizações completas
const UNFOLLOW_INTERVAL_BASE_MS = 20 * 1000; // 20-35s entre unfollows manuais, com variação
const UNFOLLOW_INTERVAL_JITTER_MS = 15 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000; // 30 min após um 429
const ACCOUNT_LIMITED_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h após sinal de limitação da conta

async function getSafetyState() {
  const { [SAFETY_KEY]: state } = await chrome.storage.local.get(SAFETY_KEY);
  return state || {};
}

async function patchSafetyState(patch) {
  const state = await getSafetyState();
  const next = { ...state, ...patch };
  await chrome.storage.local.set({ [SAFETY_KEY]: next });
  return next;
}

function minutesLeft(untilTs) {
  return Math.max(1, Math.ceil((untilTs - Date.now()) / 60000));
}

async function assertNotBlocked() {
  const state = await getSafetyState();
  if (state.blockedUntil && state.blockedUntil > Date.now()) {
    throw new Error(`BLOCKED:${minutesLeft(state.blockedUntil)}:${state.blockedReason || "seguranca"}`);
  }
}

async function getCookie(name) {
  const cookie = await chrome.cookies.get({ url: BASE, name });
  return cookie ? cookie.value : null;
}

function igHeaders(extra = {}) {
  return {
    "X-IG-App-ID": IG_APP_ID,
    "X-Requested-With": "XMLHttpRequest",
    ...extra,
  };
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, { credentials: "include", ...options, headers: igHeaders(options.headers) });
  if (res.status === 401) throw new Error("NOT_LOGGED_IN");
  if (res.status === 429) {
    await patchSafetyState({ blockedUntil: Date.now() + RATE_LIMIT_COOLDOWN_MS, blockedReason: "limite de requisições do Instagram" });
    throw new Error("RATE_LIMITED");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (/checkpoint_required|feedback_required|challenge_required/i.test(body)) {
      await patchSafetyState({ blockedUntil: Date.now() + ACCOUNT_LIMITED_COOLDOWN_MS, blockedReason: "limitação de ação na conta" });
      throw new Error("ACCOUNT_LIMITED");
    }
    throw new Error(`HTTP_${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

// O Instagram guarda o id numérico da conta logada no cookie "ds_user_id"
// assim que você faz login no site. Usamos isso em vez de chamar o endpoint
// interno de "current_user" (que o Instagram muda com frequência e às vezes
// responde 400 fora do contexto exato da própria página).
async function getCurrentUser() {
  const userId = await getCookie("ds_user_id");
  if (!userId) throw new Error("NOT_LOGGED_IN");

  let username = null;
  try {
    const data = await fetchJSON(`${BASE}/api/v1/accounts/current_user/?edit=true`);
    username = data?.user?.username || null;
  } catch (_) {
    // best-effort: sem o nome de usuário a extensão ainda funciona,
    // só não mostra o "@usuario" no cabeçalho.
  }
  return { id: userId, username };
}

async function fetchAllEdges(kind, userId, onProgress) {
  // kind: "followers" | "following"
  let maxId = "";
  const list = [];
  for (;;) {
    const url = new URL(`${BASE}/api/v1/friendships/${userId}/${kind}/`);
    url.searchParams.set("count", String(PAGE_SIZE));
    if (maxId) url.searchParams.set("max_id", maxId);
    const page = await fetchJSON(url.toString());
    const users = page.users || [];
    for (const u of users) {
      list.push({ id: u.pk || u.id, username: u.username, fullName: u.full_name || "", avatar: u.profile_pic_url || "" });
    }
    onProgress && onProgress(kind, list.length);
    if (!page.next_max_id || users.length === 0) break;
    maxId = page.next_max_id;
    // Pausa variável (2.5-4.5s) entre páginas de leitura, parecida com o
    // ritmo de alguém rolando a lista manualmente, em vez de um intervalo
    // fixo curto que é mais fácil de reconhecer como automação.
    await new Promise((r) => setTimeout(r, 2500 + Math.random() * 2000));
  }
  return list;
}

async function syncNotFollowingBack(sendProgress) {
  await assertNotBlocked();
  const state = await getSafetyState();
  if (state.nextSyncAllowedAt && Date.now() < state.nextSyncAllowedAt) {
    throw new Error(`COOLDOWN_SYNC:${minutesLeft(state.nextSyncAllowedAt)}`);
  }
  await patchSafetyState({ nextSyncAllowedAt: Date.now() + MIN_SYNC_INTERVAL_MS });

  const me = await getCurrentUser();
  sendProgress({ stage: "me", username: me.username });

  const following = await fetchAllEdges("following", me.id, (kind, n) => sendProgress({ stage: "following", count: n }));
  const followers = await fetchAllEdges("followers", me.id, (kind, n) => sendProgress({ stage: "followers", count: n }));

  const followerIds = new Set(followers.map((u) => String(u.id)));
  const notFollowingBack = following
    .filter((u) => !followerIds.has(String(u.id)))
    .sort((a, b) => a.username.localeCompare(b.username));

  const result = {
    me: me.username,
    updatedAt: Date.now(),
    followingCount: following.length,
    followersCount: followers.length,
    notFollowingBack,
  };
  await chrome.storage.local.set({ igUnfollowCheckerResult: result });
  return result;
}

async function unfollowUser(userId) {
  await assertNotBlocked();
  const state = await getSafetyState();
  const now = Date.now();
  if (state.nextUnfollowAllowedAt && now < state.nextUnfollowAllowedAt) {
    throw new Error(`COOLDOWN_UNFOLLOW:${Math.ceil((state.nextUnfollowAllowedAt - now) / 1000)}`);
  }
  const csrftoken = await getCookie("csrftoken");
  if (!csrftoken) throw new Error("NOT_LOGGED_IN");

  const cooldownMs = UNFOLLOW_INTERVAL_BASE_MS + Math.random() * UNFOLLOW_INTERVAL_JITTER_MS;
  await patchSafetyState({ nextUnfollowAllowedAt: now + cooldownMs });

  const res = await fetch(`${BASE}/api/v1/web/friendships/${userId}/unfollow/`, {
    method: "POST",
    credentials: "include",
    headers: igHeaders({
      "X-CSRFToken": csrftoken,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${BASE}/`,
    }),
    body: "",
  });
  if (res.status === 401) throw new Error("NOT_LOGGED_IN");
  if (res.status === 429) {
    await patchSafetyState({ blockedUntil: Date.now() + RATE_LIMIT_COOLDOWN_MS, blockedReason: "limite de requisições do Instagram" });
    throw new Error("RATE_LIMITED");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (/checkpoint_required|feedback_required|challenge_required/i.test(body)) {
      await patchSafetyState({ blockedUntil: Date.now() + ACCOUNT_LIMITED_COOLDOWN_MS, blockedReason: "limitação de ação na conta" });
      throw new Error("ACCOUNT_LIMITED");
    }
    throw new Error(`HTTP_${res.status}`);
  }
  const data = await res.json().catch(() => ({}));
  if (data.status && data.status !== "ok") throw new Error("UNFOLLOW_FAILED");
  return { cooldownSeconds: Math.ceil(cooldownMs / 1000) };
}

// O ícone da extensão não abre popup: ele liga/desliga o painel que o
// content script já injetou na própria página do instagram.com. Fora do
// instagram.com, abre o site numa aba nova em vez de tentar injetar.
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.startsWith(BASE)) {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" }).catch(() => {});
  } else {
    chrome.tabs.create({ url: `${BASE}/` });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "SYNC") {
    const tabId = sender.tab && sender.tab.id;
    syncNotFollowingBack((progress) => {
      if (tabId != null) chrome.tabs.sendMessage(tabId, { type: "SYNC_PROGRESS", progress }).catch(() => {});
    })
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true; // resposta assíncrona
  }

  if (msg?.type === "UNFOLLOW") {
    unfollowUser(msg.userId)
      .then(async ({ cooldownSeconds }) => {
        const { igUnfollowCheckerResult } = await chrome.storage.local.get("igUnfollowCheckerResult");
        if (igUnfollowCheckerResult) {
          igUnfollowCheckerResult.notFollowingBack = igUnfollowCheckerResult.notFollowingBack.filter(
            (u) => String(u.id) !== String(msg.userId)
          );
          await chrome.storage.local.set({ igUnfollowCheckerResult });
        }
        sendResponse({ ok: true, cooldownSeconds });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
});
