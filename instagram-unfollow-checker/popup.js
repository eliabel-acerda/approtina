const syncBtn = document.getElementById("syncBtn");
const statusLine = document.getElementById("statusLine");
const whoLine = document.getElementById("whoLine");
const summaryLine = document.getElementById("summaryLine");
const searchInput = document.getElementById("searchInput");
const listEl = document.getElementById("list");

let currentResult = null;
let filterText = "";

const ERROR_MESSAGES = {
  NOT_LOGGED_IN: "Você precisa estar logado no instagram.com nesta aba do navegador.",
  RATE_LIMITED: "O Instagram limitou as requisições temporariamente. Aguarde alguns minutos e tente novamente.",
};

function friendlyError(err) {
  return ERROR_MESSAGES[err] || `Erro: ${err}`;
}

function colorFromUsername(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function render() {
  if (!currentResult) {
    whoLine.textContent = "Nenhum dado sincronizado ainda.";
    summaryLine.textContent = "";
    listEl.innerHTML = "";
    return;
  }

  const { me, updatedAt, followingCount, followersCount, notFollowingBack } = currentResult;
  whoLine.textContent = `${me ? "@" + me : "Sua conta"} · atualizado ${new Date(updatedAt).toLocaleString("pt-BR")}`;
  summaryLine.textContent = `Você segue ${followingCount} · é seguido por ${followersCount} · ${notFollowingBack.length} não seguem de volta`;

  const filtered = notFollowingBack.filter((u) =>
    !filterText || u.username.toLowerCase().includes(filterText) || (u.fullName || "").toLowerCase().includes(filterText)
  );

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty">${notFollowingBack.length === 0 ? "Todo mundo que você segue, te segue de volta 🎉" : "Nenhum resultado para o filtro."}</div>`;
    return;
  }

  listEl.innerHTML = "";
  for (const u of filtered) {
    const li = document.createElement("li");

    const avatarWrap = document.createElement("div");
    avatarWrap.className = "avatar";
    avatarWrap.style.background = colorFromUsername(u.username);
    avatarWrap.textContent = (u.username[0] || "?").toUpperCase();

    if (u.avatar) {
      const img = document.createElement("img");
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("load", () => avatarWrap.replaceChildren(img), { once: true });
      // O CDN do Instagram costuma bloquear a foto quando pedida fora do
      // contexto da própria página; se falhar, fica o avatar de iniciais.
      img.addEventListener("error", () => {}, { once: true });
      img.src = u.avatar;
    }

    const info = document.createElement("div");
    info.className = "u-info";
    const uname = document.createElement("a");
    uname.className = "uname";
    uname.href = `https://www.instagram.com/${encodeURIComponent(u.username)}/`;
    uname.target = "_blank";
    uname.rel = "noopener noreferrer";
    uname.textContent = "@" + u.username;
    const fname = document.createElement("div");
    fname.className = "fname";
    fname.textContent = u.fullName || "";
    info.appendChild(uname);
    if (u.fullName) info.appendChild(fname);

    const btn = document.createElement("button");
    btn.className = "unfollow-btn";
    btn.textContent = "Deixar de seguir";
    btn.addEventListener("click", () => handleUnfollowClick(u, btn, li));

    li.appendChild(avatarWrap);
    li.appendChild(info);
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

// Diálogos nativos (confirm/alert) fecham o popup de extensões no Chrome,
// então a confirmação é feita com um segundo clique dentro do próprio botão.
function handleUnfollowClick(user, btn, li) {
  if (btn.dataset.armed !== "1") {
    btn.dataset.armed = "1";
    btn.textContent = "Confirmar?";
    btn.classList.add("confirm");
    setTimeout(() => {
      if (btn.dataset.armed === "1" && btn.isConnected) {
        btn.dataset.armed = "0";
        btn.textContent = "Deixar de seguir";
        btn.classList.remove("confirm");
      }
    }, 3000);
    return;
  }
  performUnfollow(user, btn, li);
}

async function performUnfollow(user, btn, li) {
  btn.disabled = true;
  btn.textContent = "...";
  try {
    const res = await chrome.runtime.sendMessage({ type: "UNFOLLOW", userId: user.id });
    if (!res.ok) throw new Error(res.error);
    currentResult.notFollowingBack = currentResult.notFollowingBack.filter((u) => String(u.id) !== String(user.id));
    li.remove();
    summaryLine.textContent = `Você segue ${currentResult.followingCount} · é seguido por ${currentResult.followersCount} · ${currentResult.notFollowingBack.length} não seguem de volta`;
  } catch (err) {
    statusLine.textContent = friendlyError(err.message || String(err));
    btn.disabled = false;
    btn.dataset.armed = "0";
    btn.classList.remove("confirm");
    btn.textContent = "Deixar de seguir";
  }
}

async function loadFromStorage() {
  const { igUnfollowCheckerResult } = await chrome.storage.local.get("igUnfollowCheckerResult");
  if (igUnfollowCheckerResult) {
    currentResult = igUnfollowCheckerResult;
    render();
  }
}

syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true;
  statusLine.textContent = "Sincronizando... isso pode levar um pouco em contas com muitos seguidores.";
  try {
    const res = await chrome.runtime.sendMessage({ type: "SYNC" });
    if (!res.ok) throw new Error(res.error);
    currentResult = res.result;
    statusLine.textContent = "Sincronização concluída.";
    render();
  } catch (err) {
    statusLine.textContent = friendlyError(err.message || String(err));
  } finally {
    syncBtn.disabled = false;
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "SYNC_PROGRESS") {
    const p = msg.progress;
    if (p.stage === "me") statusLine.textContent = p.username ? `Conectado como @${p.username}. Carregando listas...` : "Conectado à sua conta. Carregando listas...";
    if (p.stage === "following") statusLine.textContent = `Carregando quem você segue... (${p.count})`;
    if (p.stage === "followers") statusLine.textContent = `Carregando seus seguidores... (${p.count})`;
  }
});

searchInput.addEventListener("input", () => {
  filterText = searchInput.value.trim().toLowerCase();
  render();
});

loadFromStorage();
