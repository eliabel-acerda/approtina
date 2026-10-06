// Painel da Peneira, injetado dentro da própria página do instagram.com
// (Shadow DOM, pra não vazar nem sofrer interferência do CSS do site).
//
// Rodar dentro da página é o que faz as fotos de perfil carregarem: o CDN do
// Instagram bloqueia pedidos de imagem vindos de fora do próprio site, mas
// aceita quando o <img> é criado a partir do documento real do instagram.com.
//
// A fila é assistida: ela guia um perfil por vez, mas cada unfollow só
// acontece quando o usuário clica. Nada é disparado sozinho.
(function () {
  const HOST_ID = "pn-peneira-host";
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host{
        all: initial;
        --bg:#f7f9f8; --panel:#fff; --ink:#1f2321; --ink-soft:#5f6763;
        --line:#dfe5e2; --accent:#2f6b5c; --accent-dark:#24564a; --danger:#b3543f;
        --warn:#8a5a1f; --warn-bg:#fbf1de;
      }
      *{ box-sizing:border-box; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; }
      [hidden]{display:none !important;}
      .panel{
        position:fixed; top:16px; right:16px; width:390px; max-height:calc(100vh - 32px);
        background:var(--bg); color:var(--ink); border:1px solid var(--line); border-radius:14px;
        box-shadow:0 12px 32px rgba(0,0,0,.25); z-index:2147483647; overflow:hidden;
        display:flex; flex-direction:column; font-size:13.5px;
      }
      header{padding:12px 14px 10px; border-bottom:1px solid var(--line); background:var(--panel); display:flex; align-items:flex-start; justify-content:space-between; gap:8px;}
      header h1{font-size:15px; margin:0 0 2px; font-weight:800; letter-spacing:.01em;}
      header .who{color:var(--ink-soft); font-size:12px;}
      .close-btn{background:none; border:none; color:var(--ink-soft); font-size:18px; line-height:1; cursor:pointer; padding:2px 4px;}
      .close-btn:hover{color:var(--ink);}
      .warn{
        margin:10px 14px 0; padding:8px 10px; background:var(--warn-bg); color:var(--warn);
        border:1px solid #eddcb6; border-radius:8px; font-size:11.5px; line-height:1.4;
      }
      .actions{display:flex; gap:8px; padding:10px 14px;}
      button{ font-family:inherit; cursor:pointer; border-radius:8px; font-weight:600; }
      button:disabled{opacity:.55; cursor:default;}
      #syncBtn{ flex:1; background:var(--accent); color:#fff; border:none; padding:9px 10px; font-size:13px; }
      .status{padding:0 14px 8px; color:var(--ink-soft); font-size:11.5px; min-height:14px;}
      .search{padding:0 14px 8px;}
      .search input{ width:100%; padding:7px 9px; border:1px solid var(--line); border-radius:8px; font-size:12.5px; }
      .summary{padding:0 14px 6px; color:var(--ink-soft); font-size:11.5px;}
      .selbar{display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 14px 8px;}
      .selbar label{display:flex; align-items:center; gap:6px; font-size:12px; color:var(--ink-soft); cursor:pointer;}
      .selbar input{width:16px; height:16px; accent-color:var(--accent);}
      #queueBtn{background:var(--accent); color:#fff; border:none; padding:7px 11px; font-size:12px;}
      ul#list{list-style:none; margin:0; padding:0 8px 12px; overflow-y:auto; flex:1;}
      li{ display:flex; align-items:center; gap:8px; padding:6px 6px; border-radius:8px; }
      li:hover{background:var(--panel);}
      li input[type=checkbox]{width:16px; height:16px; flex:none; accent-color:var(--accent); cursor:pointer;}
      .avatar img{width:100%; height:100%; border-radius:50%; object-fit:cover; display:block;}
      .avatar{
        width:32px; height:32px; border-radius:50%; flex:none; overflow:hidden;
        display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:13px;
      }
      .u-info{flex:1; min-width:0;}
      .uname{
        display:block; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        color:var(--ink); text-decoration:none;
      }
      .uname:hover{color:var(--accent); text-decoration:underline;}
      .fname{color:var(--ink-soft); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
      .unfollow-btn{
        flex:none; background:#fff; color:var(--danger); border:1px solid var(--danger);
        padding:6px 9px; font-size:11.5px; border-radius:7px;
      }
      .unfollow-btn.confirm{background:var(--danger); color:#fff;}
      .empty{padding:24px 14px; text-align:center; color:var(--ink-soft); font-size:12.5px;}

      .queue{margin:10px 14px 12px; padding:14px; background:var(--panel); border:1px solid var(--line); border-radius:12px; display:flex; flex-direction:column; gap:12px;}
      .q-top{display:flex; align-items:center; justify-content:space-between; gap:8px;}
      .q-top strong{font-size:13.5px;}
      .q-progress{font-size:12px; color:var(--ink-soft); font-variant-numeric:tabular-nums;}
      .q-bar{height:6px; border-radius:6px; background:#e6ece9; overflow:hidden;}
      .q-bar div{height:100%; width:0; background:var(--accent); transition:width .25s ease;}
      .q-card{display:flex; align-items:center; gap:12px; min-height:56px;}
      .q-card .avatar{width:52px; height:52px; font-size:20px;}
      .q-card .uname{font-size:15px;}
      .q-card .fname{font-size:12.5px;}
      .q-actions{display:flex; gap:8px;}
      #qUnfollow{flex:1; background:var(--danger); color:#fff; border:none; padding:12px 10px; font-size:14px; font-variant-numeric:tabular-nums;}
      #qSkip{background:#fff; color:var(--ink); border:1px solid var(--line); padding:12px 14px; font-size:13px;}
      .q-meta{font-size:12px; color:var(--ink-soft); line-height:1.45; min-height:16px;}
      .q-meta.alert{color:var(--warn); background:var(--warn-bg); border:1px solid #eddcb6; border-radius:8px; padding:8px 10px;}
      .q-foot{display:flex; align-items:center; justify-content:space-between; gap:8px;}
      .q-foot label{display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--ink-soft); cursor:pointer;}
      .q-foot input{accent-color:var(--accent);}
      .link-btn{background:none; border:none; color:var(--ink-soft); font-size:11.5px; text-decoration:underline; padding:2px 0;}
      .link-btn.confirm{color:var(--danger); font-weight:700;}
      .q-done{display:flex; flex-direction:column; gap:10px; font-size:13px; line-height:1.5;}
      #qClose{align-self:flex-start; background:var(--accent); color:#fff; border:none; padding:8px 12px; font-size:12.5px;}
    </style>
    <div class="panel" id="panel" hidden>
      <header>
        <div>
          <h1>Peneira</h1>
          <div class="who" id="whoLine">Nenhum dado sincronizado ainda.</div>
        </div>
        <button class="close-btn" id="closeBtn" title="Fechar" aria-label="Fechar">×</button>
      </header>
      <div class="warn">
        A Peneira só lê os dados de seguidores/seguindo da sua própria conta.
        Cada unfollow é um clique seu — a fila só mostra o próximo perfil.
        Há uma pausa mínima entre unfollows, e tudo trava por um tempo se o
        Instagram sinalizar qualquer limite.
      </div>

      <section class="queue" id="queueBox" hidden>
        <div class="q-top">
          <strong>Fila de unfollow</strong>
          <span class="q-progress" id="qProgress"></span>
        </div>
        <div class="q-bar"><div id="qBarFill"></div></div>
        <div id="qActive">
          <div class="q-card" id="qCard"></div>
        </div>
        <div class="q-actions" id="qActions">
          <button id="qUnfollow">Deixar de seguir</button>
          <button id="qSkip">Pular</button>
        </div>
        <div class="q-meta" id="qMeta"></div>
        <div class="q-done" id="qDone" hidden>
          <div id="qDoneText"></div>
          <button id="qClose">Voltar para a lista</button>
        </div>
        <div class="q-foot" id="qFoot">
          <label><input type="checkbox" id="qSound" checked /> Avisar quando liberar</label>
          <button class="link-btn" id="qExit">Sair da fila</button>
        </div>
      </section>

      <div id="listView">
        <div class="actions"><button id="syncBtn">Sincronizar dados</button></div>
        <div class="status" id="statusLine"></div>
        <div class="search"><input id="searchInput" type="text" placeholder="Filtrar por usuário..." aria-label="Filtrar por usuário" /></div>
        <div class="summary" id="summaryLine"></div>
        <div class="selbar" id="selBar" hidden>
          <label><input type="checkbox" id="selAll" /> Selecionar todos</label>
          <button id="queueBtn" disabled>Montar fila (0)</button>
        </div>
      </div>
      <ul id="list"></ul>
    </div>
  `;

  const $ = (id) => shadow.getElementById(id);
  const panel = $("panel");
  const syncBtn = $("syncBtn");
  const statusLine = $("statusLine");
  const whoLine = $("whoLine");
  const summaryLine = $("summaryLine");
  const searchInput = $("searchInput");
  const listEl = $("list");
  const listView = $("listView");
  const selBar = $("selBar");
  const selAll = $("selAll");
  const queueBtn = $("queueBtn");
  const queueBox = $("queueBox");
  const qProgress = $("qProgress");
  const qBarFill = $("qBarFill");
  const qActive = $("qActive");
  const qCard = $("qCard");
  const qActions = $("qActions");
  const qUnfollow = $("qUnfollow");
  const qSkip = $("qSkip");
  const qMeta = $("qMeta");
  const qDone = $("qDone");
  const qDoneText = $("qDoneText");
  const qFoot = $("qFoot");
  const qSound = $("qSound");
  const qExit = $("qExit");

  const QUEUE_KEY = "pnQueue";
  const PREFS_KEY = "pnPrefs";
  const HIGH_DAILY = 50;

  let currentResult = null;
  let filterText = "";
  const selected = new Set();
  let queue = null; // { pending: [user], total, done, skipped }
  let dailyCount = 0;
  let cooldownTimer = null;

  const ERROR_MESSAGES = {
    NOT_LOGGED_IN: "Você precisa estar logado no instagram.com.",
    RATE_LIMITED: "O Instagram limitou as requisições temporariamente. A extensão vai ficar pausada por um tempo.",
    ACCOUNT_LIMITED: "O Instagram sinalizou uma limitação de ação nesta conta. Pare por hoje — normalmente é preciso um tempo sem nenhuma ação em sequência.",
    UNFOLLOW_FAILED: "O Instagram não confirmou esse unfollow. Tente de novo mais tarde ou pule.",
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
    if (/extension context invalidated/i.test(err)) {
      return "A extensão foi atualizada/recarregada. Atualize esta página (F5) e tente de novo.";
    }
    return ERROR_MESSAGES[err] || `Erro: ${err}`;
  }

  function colorFromUsername(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
    return `hsl(${hash % 360}, 45%, 42%)`;
  }

  function makeAvatar(u) {
    const wrap = document.createElement("div");
    wrap.className = "avatar";
    wrap.style.background = colorFromUsername(u.username);
    wrap.textContent = (u.username[0] || "?").toUpperCase();
    if (u.avatar) {
      const img = document.createElement("img");
      img.alt = "";
      img.addEventListener("load", () => wrap.replaceChildren(img), { once: true });
      img.src = u.avatar;
    }
    return wrap;
  }

  function makeInfo(u) {
    const info = document.createElement("div");
    info.className = "u-info";
    const uname = document.createElement("a");
    uname.className = "uname";
    uname.href = `https://www.instagram.com/${encodeURIComponent(u.username)}/`;
    uname.target = "_blank";
    uname.rel = "noopener noreferrer";
    uname.textContent = "@" + u.username;
    info.appendChild(uname);
    if (u.fullName) {
      const fname = document.createElement("div");
      fname.className = "fname";
      fname.textContent = u.fullName;
      info.appendChild(fname);
    }
    return info;
  }

  function filteredUsers() {
    if (!currentResult) return [];
    return currentResult.notFollowingBack.filter((u) =>
      !filterText || u.username.toLowerCase().includes(filterText) || (u.fullName || "").toLowerCase().includes(filterText)
    );
  }

  function updateSelectionUi() {
    const visible = filteredUsers();
    const visibleSelected = visible.filter((u) => selected.has(String(u.id))).length;
    selAll.checked = visible.length > 0 && visibleSelected === visible.length;
    selAll.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
    queueBtn.textContent = `Montar fila (${selected.size})`;
    queueBtn.disabled = selected.size === 0;
  }

  function updateSummary() {
    if (!currentResult) return;
    const { followingCount, followersCount, notFollowingBack } = currentResult;
    summaryLine.textContent = `Você segue ${followingCount} · é seguido por ${followersCount} · ${notFollowingBack.length} não seguem de volta`;
  }

  function render() {
    const inQueue = !!queue;
    queueBox.hidden = !inQueue;
    listView.hidden = inQueue;
    listEl.hidden = inQueue;
    if (inQueue) return renderQueue();

    if (!currentResult) {
      whoLine.textContent = "Nenhum dado sincronizado ainda.";
      summaryLine.textContent = "";
      selBar.hidden = true;
      listEl.innerHTML = "";
      return;
    }

    const { me, updatedAt, notFollowingBack } = currentResult;
    whoLine.textContent = `${me ? "@" + me : "Sua conta"} · atualizado ${new Date(updatedAt).toLocaleString("pt-BR")}`;
    updateSummary();

    // Quem já saiu da lista (unfollow feito) não pode continuar selecionado.
    const ids = new Set(notFollowingBack.map((u) => String(u.id)));
    for (const id of [...selected]) if (!ids.has(id)) selected.delete(id);

    const filtered = filteredUsers();
    selBar.hidden = notFollowingBack.length === 0;
    updateSelectionUi();

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="empty">${notFollowingBack.length === 0 ? "Todo mundo que você segue, te segue de volta." : "Nenhum resultado para o filtro."}</div>`;
      return;
    }

    listEl.innerHTML = "";
    for (const u of filtered) {
      const li = document.createElement("li");

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = selected.has(String(u.id));
      check.setAttribute("aria-label", `Selecionar @${u.username}`);
      check.addEventListener("change", () => {
        if (check.checked) selected.add(String(u.id));
        else selected.delete(String(u.id));
        updateSelectionUi();
      });

      const btn = document.createElement("button");
      btn.className = "unfollow-btn";
      btn.textContent = "Deixar de seguir";
      btn.addEventListener("click", () => handleUnfollowClick(u, btn, li));

      li.append(check, makeAvatar(u), makeInfo(u), btn);
      listEl.appendChild(li);
    }
  }

  // --- Unfollow avulso, direto na lista (dois cliques) ----------------------

  function startListCooldown(seconds) {
    const buttons = () => Array.from(listEl.querySelectorAll(".unfollow-btn"));
    let remaining = seconds;
    const tick = () => {
      for (const b of buttons()) {
        b.dataset.cooldown = "1";
        b.disabled = true;
        b.textContent = `Aguarde ${remaining}s`;
      }
      remaining -= 1;
      if (remaining < 0) {
        clearInterval(timer);
        for (const b of buttons()) {
          delete b.dataset.cooldown;
          b.disabled = false;
          b.textContent = "Deixar de seguir";
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
    performListUnfollow(user, btn, li);
  }

  async function performListUnfollow(user, btn, li) {
    btn.disabled = true;
    btn.textContent = "...";
    try {
      const res = await chrome.runtime.sendMessage({ type: "UNFOLLOW", userId: user.id });
      if (!res.ok) throw new Error(res.error);
      dailyCount = res.dailyCount ?? dailyCount;
      removeFromResult(user.id);
      selected.delete(String(user.id));
      li.remove();
      updateSummary();
      updateSelectionUi();
      statusLine.textContent = `@${user.username} deixou de ser seguido. Hoje: ${dailyCount}.`;
      if (res.cooldownSeconds) startListCooldown(res.cooldownSeconds);
    } catch (err) {
      statusLine.textContent = friendlyError(err.message || String(err));
      btn.disabled = false;
      btn.dataset.armed = "0";
      btn.classList.remove("confirm");
      btn.textContent = "Deixar de seguir";
    }
  }

  function removeFromResult(userId) {
    if (!currentResult) return;
    currentResult.notFollowingBack = currentResult.notFollowingBack.filter((u) => String(u.id) !== String(userId));
  }

  // --- Fila assistida -------------------------------------------------------

  async function saveQueue() {
    if (queue) await chrome.storage.local.set({ [QUEUE_KEY]: queue });
    else await chrome.storage.local.remove(QUEUE_KEY);
  }

  async function startQueue() {
    const users = currentResult.notFollowingBack.filter((u) => selected.has(String(u.id)));
    if (users.length === 0) return;
    queue = { pending: users, total: users.length, done: 0, skipped: 0 };
    selected.clear();
    await saveQueue();
    qMeta.textContent = "";
    render();
  }

  function setMeta(text, alert = false) {
    qMeta.textContent = text;
    qMeta.classList.toggle("alert", alert);
  }

  function dailyNote() {
    if (dailyCount >= HIGH_DAILY) {
      return {
        text: `Você já deixou de seguir ${dailyCount} perfis hoje. O Instagram costuma limitar quem faz muitos no mesmo dia — considere continuar amanhã. A fila fica salva.`,
        alert: true,
      };
    }
    return { text: `Hoje: ${dailyCount} unfollow${dailyCount === 1 ? "" : "s"}.`, alert: false };
  }

  function renderQueue() {
    const handled = queue.done + queue.skipped;
    const finished = queue.pending.length === 0;
    qProgress.textContent = finished ? `${queue.total} de ${queue.total}` : `${handled + 1} de ${queue.total}`;
    qBarFill.style.width = `${Math.round((handled / queue.total) * 100)}%`;

    qActive.hidden = finished;
    qActions.hidden = finished;
    qFoot.hidden = finished;
    qDone.hidden = !finished;

    if (finished) {
      clearCooldown();
      qDoneText.textContent = `Fila concluída: ${queue.done} deixado${queue.done === 1 ? "" : "s"} de seguir, ${queue.skipped} pulado${queue.skipped === 1 ? "" : "s"}.`;
      setMeta(dailyNote().text, dailyNote().alert);
      return;
    }

    const u = queue.pending[0];
    qCard.replaceChildren(makeAvatar(u), makeInfo(u));
    if (!cooldownTimer) {
      qUnfollow.disabled = false;
      qUnfollow.textContent = "Deixar de seguir";
    }
    const note = dailyNote();
    if (!qMeta.dataset.sticky) setMeta(note.text, note.alert);
  }

  function clearCooldown() {
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = null;
  }

  function startQueueCooldown(seconds) {
    clearCooldown();
    let remaining = seconds;
    qUnfollow.disabled = true;
    const tick = () => {
      if (remaining <= 0) {
        clearCooldown();
        qUnfollow.disabled = false;
        qUnfollow.textContent = "Deixar de seguir";
        if (queue && queue.pending.length) announceReady(queue.pending[0]);
        return;
      }
      qUnfollow.textContent = `Liberado em ${remaining}s`;
      remaining -= 1;
    };
    tick();
    cooldownTimer = setInterval(tick, 1000);
  }

  // Aviso de "próximo liberado": um bipe curto, e, se a aba estiver em
  // segundo plano, uma notificação do sistema e um prefixo no título da aba.
  let originalTitle = null;
  function announceReady(user) {
    if (!qSound.checked) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
      osc.onended = () => ctx.close();
    } catch (_) {}
    if (document.hidden) {
      chrome.runtime.sendMessage({ type: "NOTIFY_READY", username: user.username }).catch(() => {});
      if (originalTitle === null) originalTitle = document.title;
      document.title = `(Liberado) ${originalTitle}`;
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && originalTitle !== null) {
      document.title = originalTitle;
      originalTitle = null;
    }
  });

  async function queueUnfollow() {
    const user = queue.pending[0];
    qUnfollow.disabled = true;
    qUnfollow.textContent = "...";
    delete qMeta.dataset.sticky;
    try {
      const res = await chrome.runtime.sendMessage({ type: "UNFOLLOW", userId: user.id });
      if (!res.ok) throw new Error(res.error);
      dailyCount = res.dailyCount ?? dailyCount;
      removeFromResult(user.id);
      queue.pending.shift();
      queue.done += 1;
      await saveQueue();
      if (queue.pending.length && res.cooldownSeconds) startQueueCooldown(res.cooldownSeconds);
      renderQueue();
    } catch (err) {
      const msg = err.message || String(err);
      if (msg.startsWith("COOLDOWN_UNFOLLOW:")) {
        startQueueCooldown(Number(msg.split(":")[1]) || 20);
        return;
      }
      qUnfollow.disabled = false;
      qUnfollow.textContent = "Deixar de seguir";
      qMeta.dataset.sticky = "1";
      setMeta(friendlyError(msg), true);
    }
  }

  async function queueSkip() {
    queue.pending.shift();
    queue.skipped += 1;
    delete qMeta.dataset.sticky;
    await saveQueue();
    renderQueue();
  }

  let exitArmTimer = null;
  async function queueExit() {
    if (qExit.dataset.armed !== "1") {
      qExit.dataset.armed = "1";
      qExit.textContent = `Confirmar saída (${queue.pending.length} na fila)`;
      qExit.classList.add("confirm");
      exitArmTimer = setTimeout(() => {
        qExit.dataset.armed = "0";
        qExit.textContent = "Sair da fila";
        qExit.classList.remove("confirm");
      }, 3000);
      return;
    }
    clearTimeout(exitArmTimer);
    qExit.dataset.armed = "0";
    qExit.textContent = "Sair da fila";
    qExit.classList.remove("confirm");
    await closeQueue();
  }

  async function closeQueue() {
    clearCooldown();
    queue = null;
    delete qMeta.dataset.sticky;
    await saveQueue();
    render();
  }

  // --- Carregamento e eventos ----------------------------------------------

  async function loadFromStorage() {
    const data = await chrome.storage.local.get(["igUnfollowCheckerResult", QUEUE_KEY, PREFS_KEY]);
    if (data.igUnfollowCheckerResult) currentResult = data.igUnfollowCheckerResult;
    if (data[QUEUE_KEY]) queue = data[QUEUE_KEY];
    if (data[PREFS_KEY] && typeof data[PREFS_KEY].sound === "boolean") qSound.checked = data[PREFS_KEY].sound;
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_DAILY" });
      if (res && res.ok) dailyCount = res.dailyCount;
    } catch (_) {}
    render();
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

  selAll.addEventListener("change", () => {
    for (const u of filteredUsers()) {
      if (selAll.checked) selected.add(String(u.id));
      else selected.delete(String(u.id));
    }
    render();
  });
  queueBtn.addEventListener("click", startQueue);
  qUnfollow.addEventListener("click", queueUnfollow);
  qSkip.addEventListener("click", queueSkip);
  qExit.addEventListener("click", queueExit);
  $("qClose").addEventListener("click", closeQueue);
  qSound.addEventListener("change", () => chrome.storage.local.set({ [PREFS_KEY]: { sound: qSound.checked } }));
  $("closeBtn").addEventListener("click", () => { panel.hidden = true; });

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
