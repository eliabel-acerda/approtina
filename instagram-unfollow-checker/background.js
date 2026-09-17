// Service worker: busca (somente leitura) seguidores/seguindo usando a sessão
// já autenticada do próprio usuário no instagram.com, e executa unfollow
// individual apenas quando explicitamente solicitado pelo popup (um clique
// do usuário = uma ação, sem laços automáticos nem atrasos artificiais).

const IG_APP_ID = "936619743392459"; // id público da web app do Instagram, usado pelo próprio site
const BASE = "https://www.instagram.com";
const PAGE_SIZE = 50;

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
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
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
    // pequena pausa só para não disparar dezenas de requisições de leitura
    // em sequência instantânea; isto pagina a MESMA consulta que o próprio
    // site faz ao rolar a lista de seguidores/seguindo, não automatiza ações de escrita.
    await new Promise((r) => setTimeout(r, 300));
  }
  return list;
}

async function syncNotFollowingBack(sendProgress) {
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
  const csrftoken = await getCookie("csrftoken");
  if (!csrftoken) throw new Error("NOT_LOGGED_IN");
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
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const data = await res.json().catch(() => ({}));
  if (data.status && data.status !== "ok") throw new Error("UNFOLLOW_FAILED");
  return true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "SYNC") {
    syncNotFollowingBack((progress) => {
      chrome.runtime.sendMessage({ type: "SYNC_PROGRESS", progress }).catch(() => {});
    })
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true; // resposta assíncrona
  }

  if (msg?.type === "UNFOLLOW") {
    unfollowUser(msg.userId)
      .then(async () => {
        const { igUnfollowCheckerResult } = await chrome.storage.local.get("igUnfollowCheckerResult");
        if (igUnfollowCheckerResult) {
          igUnfollowCheckerResult.notFollowingBack = igUnfollowCheckerResult.notFollowingBack.filter(
            (u) => String(u.id) !== String(msg.userId)
          );
          await chrome.storage.local.set({ igUnfollowCheckerResult });
        }
        sendResponse({ ok: true });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
});
