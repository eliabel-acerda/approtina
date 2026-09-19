// Painel injetado dentro da própria página do instagram.com (dentro de uma
// Shadow DOM, para não vazar nem sofrer interferência do CSS do site).
//
// Rodar dentro da página é o que faz as fotos de perfil carregarem: o CDN do
// Instagram bloqueia pedidos de imagem vindos de fora do próprio site (ex.:
// de um popup de extensão), mas aceita quando o <img> é criado a partir do
// documento real do instagram.com, com o referer real da página.
(function () {
  const HOST_ID = "ig-unfollow-checker-host";
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host{
        all: initial;
        --bg:#faf9f7; --panel:#fff; --ink:#22201c; --ink-soft:#6b6357;
        --line:#e6e2da; --accent:#4e6c9e; --danger:#b3543f; --warn:#8a5a1f; --warn-bg:#fbf1de;
      }
      *{ box-sizing:border-box; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
      .panel{
        position:fixed; top:16px; right:16px; width:380px; max-height:calc(100vh - 32px);
        background:var(--bg); color:var(--ink); border:1px solid var(--line); border-radius:14px;
        box-shadow:0 12px 32px rgba(0,0,0,.25); z-index:2147483647; overflow:hidden;
        display:flex; flex-direction:column; font-size:13.5px;
      }
      .panel[hidden]{ display:none; }
      header{padding:12px 14px 10px; border-bottom:1px solid var(--line); background:var(--panel); display:flex; align-items:flex-start; justify-content:space-between; gap:8px;}
      header h1{font-size:14.5px; margin:0 0 2px; font-weight:700;}
      header .who{color:var(--ink-soft); font-size:12px;}
      .close-btn{background:none; border:none; color:var(--ink-soft); font-size:18px; line-height:1; cursor:pointer; padding:2px 4px;}
      .close-btn:hover{color:var(--ink);}
      .warn{
        margin:10px 14px 0; padding:8px 10px; background:var(--warn-bg); color:var(--warn);
        border:1px solid #eddcb6; border-radius:8px; font-size:11.5px; line-height:1.4;
      }
      .actions{display:flex; gap:8px; padding:10px 14px;}
      button{ font-family:inherit; cursor:pointer; border-radius:8px; font-weight:600; }
      #syncBtn{ flex:1; background:var(--accent); color:#fff; border:none; padding:9px 10px; font-size:13px; }
      #syncBtn:disabled{opacity:.6; cursor:default;}
      .status{padding:0 14px 8px; color:var(--ink-soft); font-size:11.5px; min-height:14px;}
      .search{padding:0 14px 8px;}
      .search input{ width:100%; padding:7px 9px; border:1px solid var(--line); border-radius:8px; font-size:12.5px; }
      .summary{padding:0 14px 8px; color:var(--ink-soft); font-size:11.5px;}
      ul#list{list-style:none; margin:0; padding:0 8px 12px; overflow-y:auto; flex:1;}
      li{ display:flex; align-items:center; gap:8px; padding:6px 6px; border-radius:8px; }
      li:hover{background:var(--panel);}
      li img{width:32px; height:32px; border-radius:50%; object-fit:cover; display:block;}
      .avatar{
        width:32px; height:32px; border-radius:50%; flex:none; overflow:hidden;
        display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:13px;
      }
      .u-info{flex:1; min-width:0;}
      .u-info .uname{
        display:block; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        color:var(--ink); text-decoration:none;
      }
      .u-info .uname:hover{color:var(--accent); text-decoration:underline;}
      .u-info .fname{color:var(--ink-soft); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
      .unfollow-btn{
        flex:none; background:#fff; color:var(--danger); border:1px solid var(--danger);
        padding:6px 9px; font-size:11.5px; border-radius:7px;
      }
      .unfollow-btn:disabled{opacity:.5; cursor:default;}
      .unfollow-btn.confirm{background:var(--danger); color:#fff;}
      .empty{padding:24px 14px; text-align:center; color:var(--ink-soft); font-size:12.5px;}
    </style>
    <div class="panel" id="panel" hidden>
      <header>
        <div>
          <h1>Quem não me segue de volta</h1>
          <div class="who" id="whoLine">Nenhum dado sincronizado ainda.</div>
        </div>
        <button class="close-btn" id="closeBtn" title="Fechar" aria-label="Fechar">×</button>
      </header>
      <div class="warn">
        Esta extensão só lê os dados de seguidores/seguindo da sua própria conta.
        Cada "Deixar de seguir" é uma ação sua, um clique por vez — não existe
        fila nem loop automático. Como sua conta já recebeu uma limitação do
        Instagram, a extensão agora impõe uma pausa mínima entre sincronizações
        e entre unfollows, e se travar sozinha por um tempo ao detectar
        qualquer sinal de limite vindo do Instagram.
      </div>
      <div class="actions"><button id="syncBtn">Sincronizar dados</button></div>
      <div class="status" id="statusLine"></div>
      <div class="search"><input id="searchInput" type="text" placeholder="Filtrar por usuário..." /></div>
      <div class="summary" id="summaryLine"></div>
      <ul id="list"></ul>
    </div>
  `;

  const panel = shadow.getElementById("panel");
  const syncBtn = shadow.getElementById("syncBtn");
  const closeBtn = shadow.getElementById("closeBtn");
  const statusLine = shadow.getElementById("statusLine");
  const whoLine = shadow.getElementById("whoLine");
  const summaryLine = shadow.getElementById("summaryLine");
  const searchInput = shadow.getElementById("searchInput");
  const listEl = shadow.getElementById("list");

  let currentResult = null;
  let filterText = "";

  const ERROR_MESSAGES = {
    NOT_LOGGED_IN: "Você precisa estar logado no instagram.com.",
    RATE_LIMITED: "O Instagram limitou as requisições temporariamente. A extensão vai ficar pausada por um tempo antes de tentar de novo.",
    ACCOUNT_LIMITED: "O Instagram sinalizou uma limitação de ação nesta conta. Pare de usar a extensão até ela ser removida — normalmente exige um tempo sem nenhuma automação.",
  };
  function friendlyError(err) {
    if (err.startsWith("BLOCKED:")) {
      const [, mins, reason] = err.split(":");
      return `Pausado por segurança (${reason}). Tente de novo em ~${mins} min.`;
    }
    if (err.startsWith("COOLDOWN_SYNC:")) {
      return `Para não sobrecarregar sua conta, espere ~${err.split(":")[1]} min antes de sincronizar de novo.`;
    }
    if (err.startsWith("COOLDOWN_UNFOLLOW:")) {
      return `Espere ${err.split(":")[1]}s antes do próximo unfollow.`;
    }
    return ERROR_MESSAGES[err] || `Erro: ${err}`;
  }

  function colorFromUsername(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
    return `hsl(${hash % 360}, 55%, 45%)`;
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
        img.addEventListener("load", () => avatarWrap.replaceChildren(img), { once: true });
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

  // Depois de um unfollow real, desabilita os botões visíveis pelo mesmo
  // intervalo que o background já está aplicando, pra não incentivar uma
  // sequência de cliques rápidos que pareça automação.
  function startUnfollowCooldown(seconds) {
    const buttons = () => Array.from(listEl.querySelectorAll(".unfollow-btn"));
    let remaining = seconds;
    const originalLabels = new Map(buttons().map((b) => [b, b.textContent]));
    const tick = () => {
      for (const b of buttons()) {
        if (b.disabled && !b.dataset.cooldown) continue;
        b.dataset.cooldown = "1";
        b.disabled = true;
        b.textContent = `Aguarde ${remaining}s`;
      }
      remaining -= 1;
      if (remaining < 0) {
        clearInterval(timer);
        for (const b of buttons()) {
          if (b.dataset.cooldown) {
            delete b.dataset.cooldown;
            b.disabled = false;
            b.textContent = originalLabels.get(b) || "Deixar de seguir";
          }
        }
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
  }

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
      if (res.cooldownSeconds) startUnfollowCooldown(res.cooldownSeconds);
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

  closeBtn.addEventListener("click", () => { panel.hidden = true; });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "TOGGLE_PANEL") {
      panel.hidden = !panel.hidden;
    }
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
})();
