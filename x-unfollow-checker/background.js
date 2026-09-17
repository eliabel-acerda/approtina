// Service worker: busca (somente leitura) seguidores/seguindo usando a sessão
// já autenticada do próprio usuário no x.com, e executa unfollow individual
// apenas quando explicitamente solicitado pelo painel injetado na página (um
// clique do usuário = uma ação). Os limites de segurança abaixo (intervalo
// mínimo entre sincronizações, intervalo mínimo entre unfollows, e pausa
// longa automática ao primeiro sinal de limitação da conta) já nascem
// ativados aqui — não são um remendo posterior.

const BASE = "https://x.com";
const ALT_BASE = "https://twitter.com"; // cookies de sessões mais antigas podem viver aqui
const PAGE_SIZE = 40;

// Bearer token público usado pelo próprio cliente web do X (não é secreto:
// vem embutido no bundle JS do site e é o mesmo para qualquer sessão). Se o
// X trocar esse valor, as chamadas abaixo passam a responder 401 — nesse
// caso é preciso capturar o valor atual no Network tab (ver README).
const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAAFQODgEAAAAAVHTp76lzh3rFzcHbmHVvQxYYpTw=ckAlMINMjmCwxUcaXbAN4XqJVdgMJhqqe1oRB9HXjEZ2rn3O6";

// --- Limites de segurança -------------------------------------------------
const SAFETY_KEY = "xSafetyState";
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
  for (const url of [BASE, ALT_BASE]) {
    const cookie = await chrome.cookies.get({ url, name });
    if (cookie) return cookie.value;
  }
  return null;
}

async function getCurrentUserId() {
  const raw = await getCookie("twid"); // formato "u=1234567890" (às vezes urlencoded)
  if (!raw) throw new Error("NOT_LOGGED_IN");
  const decoded = decodeURIComponent(raw);
  const match = decoded.match(/u=(\d+)/);
  if (!match) throw new Error("NOT_LOGGED_IN");
  return match[1];
}

async function xHeaders(extra = {}) {
  const csrf = await getCookie("ct0");
  return {
    Authorization: `Bearer ${BEARER_TOKEN}`,
    "x-csrf-token": csrf || "",
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-client-language": "en",
    Referer: `${BASE}/`,
    ...extra,
  };
}

async function fetchJSON(url, options = {}) {
  const headers = await xHeaders(options.headers);
  const res = await fetch(url, { credentials: "include", ...options, headers });
  if (res.status === 401) throw new Error("NOT_LOGGED_IN");
  if (res.status === 429) {
    await patchSafetyState({ blockedUntil: Date.now() + RATE_LIMIT_COOLDOWN_MS, blockedReason: "limite de requisições do X" });
    throw new Error("RATE_LIMITED");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (/temporarily (locked|restricted)|account.*(suspended|locked)|"code":\s*(326|64)/i.test(body)) {
      await patchSafetyState({ blockedUntil: Date.now() + ACCOUNT_LIMITED_COOLDOWN_MS, blockedReason: "limitação de ação na conta" });
      throw new Error("ACCOUNT_LIMITED");
    }
    throw new Error(`HTTP_${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

function mapUser(u) {
  const avatar = u.profile_image_url_https ? u.profile_image_url_https.replace("_normal.", "_200x200.") : "";
  return { id: u.id_str || String(u.id), username: u.screen_name, fullName: u.name || "", avatar };
}

async function fetchAllEdges(kind, onProgress) {
  // kind: "following" -> friends/list.json, "followers" -> followers/list.json
  const path = kind === "following" ? "friends" : "followers";
  let cursor = "-1";
  const list = [];
  for (;;) {
    const url = new URL(`${BASE}/i/api/1.1/${path}/list.json`);
    url.searchParams.set("count", String(PAGE_SIZE));
    url.searchParams.set("cursor", cursor);
    url.searchParams.set("skip_status", "true");
    url.searchParams.set("include_user_entities", "false");
    const page = await fetchJSON(url.toString());
    const users = page.users || [];
    for (const u of users) list.push(mapUser(u));
    onProgress && onProgress(kind, list.length);
    const next = page.next_cursor_str;
    if (!next || next === "0" || next === cursor || users.length === 0) break;
    cursor = next;
    // Pausa variável (2.5-4.5s) entre páginas, parecida com o ritmo de
    // alguém rolando a lista manualmente.
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

  const userId = await getCurrentUserId();
  sendProgress({ stage: "me", username: null });

  const following = await fetchAllEdges("following", (kind, n) => sendProgress({ stage: "following", count: n }));
  const followers = await fetchAllEdges("followers", (kind, n) => sendProgress({ stage: "followers", count: n }));

  const followerIds = new Set(followers.map((u) => u.id));
  const notFollowingBack = following
    .filter((u) => !followerIds.has(u.id))
    .sort((a, b) => a.username.localeCompare(b.username));

  const result = {
    me: null,
    updatedAt: Date.now(),
    followingCount: following.length,
    followersCount: followers.length,
    notFollowingBack,
  };
  await chrome.storage.local.set({ xUnfollowCheckerResult: result });
  return result;
}

async function unfollowUser(userId) {
  await assertNotBlocked();
  const state = await getSafetyState();
  const now = Date.now();
  if (state.nextUnfollowAllowedAt && now < state.nextUnfollowAllowedAt) {
    throw new Error(`COOLDOWN_UNFOLLOW:${Math.ceil((state.nextUnfollowAllowedAt - now) / 1000)}`);
  }
  const csrf = await getCookie("ct0");
  if (!csrf) throw new Error("NOT_LOGGED_IN");

  const cooldownMs = UNFOLLOW_INTERVAL_BASE_MS + Math.random() * UNFOLLOW_INTERVAL_JITTER_MS;
  await patchSafetyState({ nextUnfollowAllowedAt: now + cooldownMs });

  const headers = await xHeaders({ "Content-Type": "application/x-www-form-urlencoded" });
  const res = await fetch(`${BASE}/i/api/1.1/friendships/destroy.json`, {
    method: "POST",
    credentials: "include",
    headers,
    body: `user_id=${encodeURIComponent(userId)}`,
  });
  if (res.status === 401) throw new Error("NOT_LOGGED_IN");
  if (res.status === 429) {
    await patchSafetyState({ blockedUntil: Date.now() + RATE_LIMIT_COOLDOWN_MS, blockedReason: "limite de requisições do X" });
    throw new Error("RATE_LIMITED");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (/temporarily (locked|restricted)|account.*(suspended|locked)|"code":\s*(326|64)/i.test(body)) {
      await patchSafetyState({ blockedUntil: Date.now() + ACCOUNT_LIMITED_COOLDOWN_MS, blockedReason: "limitação de ação na conta" });
      throw new Error("ACCOUNT_LIMITED");
    }
    throw new Error(`HTTP_${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return { cooldownSeconds: Math.ceil(cooldownMs / 1000) };
}

// O ícone da extensão não abre popup: ele liga/desliga o painel que o
// content script já injetou na própria página do x.com/twitter.com. Fora
// dessas páginas, abre o site numa aba nova em vez de tentar injetar.
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && (tab.url.startsWith(BASE) || tab.url.startsWith(ALT_BASE))) {
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
        const { xUnfollowCheckerResult } = await chrome.storage.local.get("xUnfollowCheckerResult");
        if (xUnfollowCheckerResult) {
          xUnfollowCheckerResult.notFollowingBack = xUnfollowCheckerResult.notFollowingBack.filter(
            (u) => String(u.id) !== String(msg.userId)
          );
          await chrome.storage.local.set({ xUnfollowCheckerResult });
        }
        sendResponse({ ok: true, cooldownSeconds });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
});
