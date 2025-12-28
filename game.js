(() => {
  const $ = (s) => document.querySelector(s);

  // --- UI
  const ui = {
    cv: $("#cv"),
    bgVideo: $("#bgVideo"),

    hudMode: $("#hudMode"),
    hudHp: $("#hudHp"),
    hudWave: $("#hudWave"),
    hudTime: $("#hudTime"),
    hudScore: $("#hudScore"),
    hudRank: $("#hudRank"),

    bombCd: $("#bombCd"),
    dashCd: $("#dashCd"),

    intro: $("#intro"),
    introVideo: $("#introVideo"),
    btnStart: $("#btnStart"),
    btnSkip: $("#btnSkip"),

    menu: $("#menu"),
    btnSound: $("#btnSound"),
    btnGetId: $("#btnGetId"),
    btnPlay: $("#btnPlay"),
    btnHow: $("#btnHow"),
    btnHowBack: $("#btnHowBack"),
    btnLeaders: $("#btnLeaders"),
    myId: $("#myId"),
    myRank: $("#myRank"),
    best: $("#best"),
    chain: $("#chain"),

    how: $("#how"),

    perk: $("#perk"),
    perkList: $("#perkList"),

    leaders: $("#leaders"),
    btnLeadersClose: $("#btnLeadersClose"),
    tabLocal: $("#tabLocal"),
    tabChain: $("#tabChain"),
    listLocal: $("#listLocal"),
    listChain: $("#listChain"),
    btnCopyBoard: $("#btnCopyBoard"),
    btnReset: $("#btnReset"),

    over: $("#over"),
    overTitle: $("#overTitle"),
    overScore: $("#overScore"),
    overBest: $("#overBest"),
    overRank: $("#overRank"),
    overKills: $("#overKills"),
    btnShare: $("#btnShare"),
    btnCopyLink: $("#btnCopyLink"),
    btnAgain: $("#btnAgain"),
    btnMenu: $("#btnMenu"),

    btnBomb: $("#btnBomb"),
    btnFire: $("#btnFire"),
    btnDash: $("#btnDash"),

    toast: $("#toast"),
  };

  // --- Crash overlay in case of errors (so you never get “nothing works” again)
  window.addEventListener("error", (e) => {
    toast("JS ERROR: " + (e?.message || "unknown"));
    console.error(e);
  });

  // --- Helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  const now = () => performance.now();

  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => ui.toast.classList.remove("show"), 1300);
  }

  function vibrate(p) {
    if (navigator.vibrate) navigator.vibrate(p);
  }

  // --- Storage keys
  const LS = {
    id: "vl_id",
    best: "vl_best",
    runs: "vl_runs",
    sound: "vl_sound",
  };

  // --- Sound (WebAudio) + Intro sound handling
  let soundOn = (localStorage.getItem(LS.sound) ?? "1") === "1";
  let audioCtx = null;

  function ensureAudio() {
    if (!soundOn) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function sfx(freq = 440, dur = 0.05, type = "sine", gain = 0.06) {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  // --- ID / chain leaderboard in URL (без сервера)
  function makeId() {
    const t = Date.now().toString(36).slice(-6);
    const r = Math.random().toString(36).slice(2, 6);
    return (t + r).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function parseUrl() {
    const u = new URL(location.href);
    const c = u.searchParams.get("c") || "";
    const p = u.searchParams.get("p") || "";
    const chain = c
      .split(".")
      .map((x) => x.replace(/[^A-Z0-9]/gi, "").toUpperCase())
      .filter(Boolean)
      .slice(0, 180);

    // p: ID~SCORE.ID~SCORE...
    const board = [];
    if (p) {
      p.split(".")
        .slice(0, 40)
        .forEach((tok) => {
          const [idRaw, scRaw] = tok.split("~");
          const id = (idRaw || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
          const sc = Number(scRaw || "0");
          if (id && Number.isFinite(sc) && sc >= 0) board.push({ id, score: Math.floor(sc) });
        });
    }
    return { chain, board };
  }

  function mergeBoard(a, b) {
    const m = new Map();
    [...a, ...b].forEach((e) => {
      const prev = m.get(e.id);
      if (!prev || e.score > prev.score) m.set(e.id, { id: e.id, score: e.score });
    });
    return [...m.values()];
  }

  function buildShareLink(myEntry) {
    const u = new URL(location.href);
    u.search = "";
    const chain = [...state.chain];
    if (state.id) chain.push(state.id);

    const merged = mergeBoard(state.chainBoard, myEntry ? [myEntry] : []);
    merged.sort((x, y) => y.score - x.score);
    const top = merged.slice(0, 12);

    if (chain.length) u.searchParams.set("c", chain.join("."));
    if (top.length) u.searchParams.set("p", top.map((e) => `${e.id}~${e.score}`).join("."));
    u.searchParams.set("v", "z2");
    return u.toString();
  }

  // --- Ranks
  const RANKS = [
    { name: "Rookie", min: 0 },
    { name: "Runner", min: 800 },
    { name: "Slayer", min: 1800 },
    { name: "Warlord", min: 3200 },
    { name: "Doom", min: 4800 },
    { name: "Myth", min: 6800 },
  ];
  function rankFor(score) {
    let r = RANKS[0].name;
    for (const it of RANKS) if (score >= it.min) r = it.name;
    return r;
  }

  // --- State
  const parsed = parseUrl();
  const state = {
    mode: "intro", // intro/menu/play/perk/over
    id: localStorage.getItem(LS.id) || "",
    best: Number(localStorage.getItem(LS.best) || "0"),
    runs: [],
    chain: parsed.chain,
    chainBoard: parsed.board,

    // run
    time: 75.0,
    score: 0,
    kills: 0,
    wave: 1,
    hp: 3,

    // upgrades
    dmg: 1,
    fireRate: 0.12,
    bombRadius: 140,
    moveSpeed: 9.0,

    // cooldowns
    bombCd: 0,
    dashCd: 0,

    // input
    firing: false,
    pointerDown: false,
    targetX: 0,
    targetY: 0,

    // shake
    shake: 0,

    // wave system
    nextPerkAtWave: 2,
    spawnedThisWave: 0,
    needKillsForWave: 10,
  };

  try {
    state.runs = JSON.parse(localStorage.getItem(LS.runs) || "[]") || [];
    if (!Array.isArray(state.runs)) state.runs = [];
  } catch {
    state.runs = [];
  }

  // --- Canvas setup
  const cv = ui.cv;
  const ctx = cv.getContext("2d", { alpha: true });
  const G = { w: 0, h: 0, dpr: 1, last: now() };

  function resize() {
    const r = cv.getBoundingClientRect();
    G.dpr = Math.min(2.25, window.devicePixelRatio || 1);
    cv.width = Math.floor(r.width * G.dpr);
    cv.height = Math.floor(r.height * G.dpr);
    G.w = cv.width;
    G.h = cv.height;

    player.x = G.w * 0.5;
    player.y = G.h * 0.78;
    state.targetX = player.x;
    state.targetY = player.y;
  }
  window.addEventListener("resize", resize);
  resize();

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  // --- Entities
  const player = { x: G.w * 0.5, y: G.h * 0.78, r: 18, inv: 0, vx: 0, vy: 0 };
  const bullets = [];
  const zombies = [];
  const particles = [];

  function burst(x, y, n, kind = "g") {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(120, 740) * G.dpr;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rnd(0.16, 0.62),
        t: 0,
        kind,
        r: rnd(1.2, 3.2) * G.dpr,
      });
    }
  }

  function spawnZombie(type = "normal") {
    const x = rnd(60, G.w - 60);
    const y = -60 * G.dpr;

    let hp = 1 + Math.floor((state.wave - 1) / 3);
    let sp = (75 + state.wave * 7) * G.dpr;
    let r = (16 + rnd(-2, 2)) * G.dpr;

    if (type === "runner") {
      sp *= 1.45;
      hp = Math.max(1, hp - 1);
      r *= 0.92;
    }
    if (type === "tank") {
      sp *= 0.72;
      hp += 2;
      r *= 1.25;
    }
    if (type === "boss") {
      sp *= 0.65;
      hp += 10 + state.wave;
      r *= 1.7;
    }

    zombies.push({
      x,
      y,
      r,
      hp,
      maxHp: hp,
      sp,
      wob: rnd(0, 10),
      type,
    });
  }

  function pickZombieType() {
    if (state.wave % 5 === 0 && state.spawnedThisWave === 0) return "boss";
    const r = Math.random();
    if (state.wave >= 3 && r < 0.18) return "runner";
    if (state.wave >= 4 && r < 0.32) return "tank";
    return "normal";
  }

  // --- UI sync
  function show(el, on) {
    el.classList.toggle("show", !!on);
  }
  function hearts(hp) {
    return "♥".repeat(Math.max(0, hp)) + "·".repeat(Math.max(0, 3 - hp));
  }

  function syncHud() {
    ui.hudMode.textContent = state.mode.toUpperCase();
    ui.hudHp.textContent = hearts(state.hp);
    ui.hudWave.textContent = String(state.wave);
    ui.hudTime.textContent = state.time.toFixed(1);
    ui.hudScore.textContent = String(Math.floor(state.score));
    ui.hudRank.textContent = rankFor(state.best);

    ui.bombCd.textContent = state.bombCd > 0 ? `${state.bombCd.toFixed(1)}s` : "READY";
    ui.dashCd.textContent = state.dashCd > 0 ? `${state.dashCd.toFixed(1)}s` : "READY";
  }

  function syncMenu() {
    ui.myId.textContent = state.id || "—";
    ui.best.textContent = String(state.best);
    ui.myRank.textContent = rankFor(state.best);
    ui.chain.textContent = String((state.id ? state.chain.length + 1 : state.chain.length) || 0);
  }

  // --- Leaderboards
  function renderBoards() {
    const local = [...state.runs].sort((a, b) => b.score - a.score).slice(0, 10);
    ui.listLocal.innerHTML = local.length
      ? local
          .map(
            (r, i) => `
        <div class="item">
          <div>
            <div class="mono">#${i + 1} ${new Date(r.ts).toLocaleDateString()} ${new Date(r.ts)
              .toLocaleTimeString()
              .slice(0, 5)}</div>
            <div class="k">WAVE ${r.wave} · KILLS ${r.kills}</div>
          </div>
          <div class="badge">${r.score}</div>
        </div>`
          )
          .join("")
      : `<div class="item"><div>Сыграй пару раз — тут появится топ.</div><div class="badge">—</div></div>`;

    const chainMerged = mergeBoard(state.chainBoard, state.id ? [{ id: state.id, score: state.best }] : []);
    chainMerged.sort((a, b) => b.score - a.score);
    ui.listChain.innerHTML = chainMerged.length
      ? chainMerged
          .slice(0, 10)
          .map(
            (e, i) => `
        <div class="item">
          <div>
            <div class="mono">${e.id === state.id ? "YOU • " : ""}${e.id}</div>
            <div class="k">${rankFor(e.score)}</div>
          </div>
          <div class="badge">#${i + 1} · ${e.score}</div>
        </div>`
          )
          .join("")
      : `<div class="item"><div>Пока пусто. Выиграй и шарь ссылку.</div><div class="badge">—</div></div>`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    vibrate(10);
    sfx(760, 0.04, "triangle", 0.06);
  }

  async function shareOrCopy(url) {
    const text = `☣ VIRAL LINK — побей мой рекорд: ${state.best}\n${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "VIRAL LINK", text, url });
      else await copyText(url);
      toast("DONE");
    } catch {
      await copyText(url);
      toast("LINK COPIED");
    }
  }

  // --- Game flow
  function join() {
    if (state.id) return;
    state.id = makeId();
    localStorage.setItem(LS.id, state.id);
    toast(`ID: ${state.id}`);
    sfx(720, 0.05, "triangle", 0.06);
    vibrate([10, 30, 10]);
    syncMenu();
  }

  function resetRun() {
    state.mode = "play";
    state.time = 75.0;
    state.score = 0;
    state.kills = 0;
    state.wave = 1;
    state.hp = 3;

    state.dmg = 1;
    state.fireRate = 0.12;
    state.bombRadius = 140;
    state.moveSpeed = 9.0;

    state.bombCd = 0;
    state.dashCd = 0;
    state.shake = 0;

    state.nextPerkAtWave = 2;
    state.spawnedThisWave = 0;
    state.needKillsForWave = 10;

    bullets.length = 0;
    zombies.length = 0;
    particles.length = 0;

    player.x = G.w * 0.5;
    player.y = G.h * 0.78;
    player.vx = player.vy = 0;
    player.inv = 0;

    spawnTimer = 0;
    fireTimer = 0;

    toast("GO!");
    sfx(520, 0.05, "sine", 0.05);
    vibrate(10);
  }

  function endRun() {
    state.mode = "over";

    const score = Math.floor(state.score);
    if (score > state.best) {
      state.best = score;
      localStorage.setItem(LS.best, String(state.best));
      toast("NEW BEST!");
      sfx(920, 0.08, "triangle", 0.08);
      vibrate([20, 25, 20]);
    }

    state.runs.push({ score, wave: state.wave, kills: state.kills, ts: Date.now() });
    state.runs = state.runs.slice(-80);
    localStorage.setItem(LS.runs, JSON.stringify(state.runs));

    if (state.id) state.chainBoard = mergeBoard(state.chainBoard, [{ id: state.id, score: state.best }]);

    ui.overScore.textContent = String(score);
    ui.overBest.textContent = String(state.best);
    ui.overRank.textContent = rankFor(state.best);
    ui.overKills.textContent = String(state.kills);

    show(ui.over, true);
    show(ui.menu, false);
    show(ui.how, false);
    show(ui.leaders, false);
    show(ui.perk, false);

    syncMenu();
  }

  // --- Perks (между волнами)
  const PERKS = [
    { key: "firerate", title: "Rapid Fire", desc: "-15% fire delay", apply: () => (state.fireRate = Math.max(0.06, state.fireRate * 0.85)) },
    { key: "damage", title: "High Damage", desc: "+1 bullet damage", apply: () => (state.dmg += 1) },
    { key: "radius", title: "Bigger Bomb", desc: "+22% bomb radius", apply: () => (state.bombRadius *= 1.22) },
    { key: "speed", title: "Move Boost", desc: "+12% move speed", apply: () => (state.moveSpeed *= 1.12) },
    { key: "hp", title: "Serum", desc: "+1 HP (max 3)", apply: () => (state.hp = Math.min(3, state.hp + 1)) },
  ];

  function openPerk() {
    state.mode = "perk";
    show(ui.perk, true);
    show(ui.menu, false);
    show(ui.how, false);
    show(ui.leaders, false);
    show(ui.over, false);

    // choose 3 random perks
    const pool = [...PERKS].sort(() => Math.random() - 0.5).slice(0, 3);
    ui.perkList.innerHTML = pool
      .map(
        (p) => `
        <button class="perkBtn" data-perk="${p.key}" type="button">
          ${p.title}
          <span class="desc">${p.desc}</span>
        </button>`
      )
      .join("");

    ui.perkList.querySelectorAll(".perkBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        ensureAudio();
        const key = btn.getAttribute("data-perk");
        const perk = pool.find((x) => x.key === key);
        if (perk) perk.apply();
        show(ui.perk, false);
        state.mode = "play";
        state.nextPerkAtWave = state.wave + 2;
        sfx(880, 0.05, "triangle", 0.07);
        toast("UPGRADED");
      });
    });
  }

  // --- Shooting / abilities
  let fireTimer = 0;
  let spawnTimer = 0;

  function nearestZombie() {
    let best = null;
    let bestD = Infinity;
    for (const z of zombies) {
      const d = dist2(player.x, player.y, z.x, z.y);
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    return best;
  }

  function fireBullet() {
    const z = nearestZombie();
    let tx = z ? z.x : player.x;
    let ty = z ? z.y : player.y - 200 * G.dpr;

    const dx = tx - player.x;
    const dy = ty - player.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len,
      uy = dy / len;

    const sp = 820 * G.dpr;
    bullets.push({
      x: player.x + ux * 20 * G.dpr,
      y: player.y + uy * 20 * G.dpr,
      vx: ux * sp,
      vy: uy * sp,
      r: 3.2 * G.dpr,
      dmg: state.dmg,
      life: 0.9,
      t: 0,
    });

    burst(player.x + ux * 22 * G.dpr, player.y + uy * 22 * G.dpr, 8, "c");
    sfx(560 + rnd(-40, 40), 0.02, "square", 0.03);
  }

  function bomb() {
    if (state.bombCd > 0) return;
    state.bombCd = 9.5;

    const R = state.bombRadius * G.dpr;
    let killed = 0;

    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i];
      if (dist2(player.x, player.y, z.x, z.y) <= R * R) {
        z.hp -= 999;
        zombies.splice(i, 1);
        killed++;
        state.kills++;
        state.score += 130 + state.wave * 8;
        burst(z.x, z.y, 26, "g");
      }
    }

    state.shake = Math.min(1, state.shake + 0.55);
    burst(player.x, player.y, 70, "p");
    vibrate([20, 40, 20]);
    sfx(180, 0.08, "sawtooth", 0.06);

    toast(killed ? `BOMB: +${killed}` : "BOMB");
  }

  function dash() {
    if (state.dashCd > 0) return;
    state.dashCd = 6.5;

    // impulse away from nearest zombie (or up)
    const z = nearestZombie();
    let dx = z ? player.x - z.x : 0;
    let dy = z ? player.y - z.y : -1;
    const len = Math.max(1, Math.hypot(dx, dy));
    dx /= len;
    dy /= len;

    player.vx += dx * 28;
    player.vy += dy * 28;
    player.inv = Math.max(player.inv, 0.75);

    burst(player.x, player.y, 26, "c");
    vibrate(10);
    sfx(820, 0.03, "triangle", 0.05);
  }

  // --- Draw
  function col(kind) {
    if (kind === "c") return ["rgba(86,214,255,0.92)", "rgba(86,214,255,0.22)"];
    if (kind === "p") return ["rgba(176,140,255,0.92)", "rgba(176,140,255,0.22)"];
    if (kind === "r") return ["rgba(255,59,110,0.92)", "rgba(255,59,110,0.22)"];
    return ["rgba(125,255,204,0.92)", "rgba(125,255,204,0.22)"];
  }

  function drawVignette(t) {
    const gx = (Math.sin(t * 0.0012) * 0.5 + 0.5) * G.w;
    const gy = (Math.cos(t * 0.0011) * 0.5 + 0.5) * G.h;
    const gr = ctx.createRadialGradient(gx, gy, 10, gx, gy, Math.max(G.w, G.h));
    gr.addColorStop(0, "rgba(125,255,204,0.10)");
    gr.addColorStop(0.6, "rgba(0,0,0,0)");
    gr.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, G.w, G.h);
  }

  function drawPlayer(t) {
    const tt = t * 0.001;
    const pulse = 1 + Math.sin(tt * 8) * 0.08;
    const r = player.r * G.dpr * pulse;

    ctx.save();
    ctx.shadowBlur = 30 * G.dpr;
    ctx.shadowColor = player.inv > 0 ? "rgba(86,214,255,0.35)" : "rgba(125,255,204,0.30)";

    const g = ctx.createRadialGradient(player.x, player.y, 3, player.x, player.y, r * 2.3);
    g.addColorStop(0, player.inv > 0 ? "rgba(86,214,255,0.92)" : "rgba(125,255,204,0.95)");
    g.addColorStop(0.55, "rgba(26,242,166,0.50)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r * 1.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 12 * G.dpr;
    ctx.shadowColor = "rgba(255,255,255,0.12)";
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.beginPath();
    ctx.arc(player.x, player.y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawZombies(t) {
    const tt = t * 0.001;
    for (const z of zombies) {
      const wob = Math.sin(tt * 6 + z.wob) * 0.12;

      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.rotate(wob);

      let glow = "rgba(255,59,110,0.24)";
      let fill = "rgba(255,59,110,0.86)";
      if (z.type === "runner") { glow = "rgba(86,214,255,0.18)"; fill = "rgba(86,214,255,0.75)"; }
      if (z.type === "tank") { glow = "rgba(176,140,255,0.20)"; fill = "rgba(176,140,255,0.78)"; }
      if (z.type === "boss") { glow = "rgba(255,59,110,0.30)"; fill = "rgba(255,59,110,0.92)"; }

      ctx.shadowBlur = 24 * G.dpr;
      ctx.shadowColor = glow;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(0, 0, z.r * 1.05, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.arc(0, 0, z.r * 0.72, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(-z.r * 0.22, -z.r * 0.12, z.r * 0.10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( z.r * 0.22, -z.r * 0.12, z.r * 0.10, 0, Math.PI * 2); ctx.fill();

      // hp ring
      const hpRatio = clamp(z.hp / z.maxHp, 0, 1);
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = "rgba(255,255,255,0.20)";
      ctx.lineWidth = 2 * G.dpr;
      ctx.beginPath();
      ctx.arc(0, 0, z.r * 1.28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpRatio);
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawBullets() {
    for (const b of bullets) {
      ctx.save();
      ctx.shadowBlur = 16 * G.dpr;
      ctx.shadowColor = "rgba(86,214,255,0.22)";
      ctx.fillStyle = "rgba(86,214,255,0.92)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      const k = 1 - p.t / p.life;
      if (k <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.2 * dt;
      p.vy *= 1 - 2.2 * dt;

      const [f, glow] = col(p.kind);
      ctx.save();
      ctx.globalAlpha = k * 0.9;
      ctx.shadowBlur = 16 * G.dpr;
      ctx.shadowColor = glow;
      ctx.fillStyle = f;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.8 + k * 0.9), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // --- Update loop
  function step(dt, t) {
    // background video try play
    if (ui.bgVideo && ui.bgVideo.paused) ui.bgVideo.play().catch(() => {});

    // mode visuals (menu/intro/perk/over just idle draw)
    ctx.save();

    // shake
    state.shake = Math.max(0, state.shake - dt * 3.2);
    if (state.shake > 0) ctx.translate(rnd(-1, 1) * state.shake * 10 * G.dpr, rnd(-1, 1) * state.shake * 10 * G.dpr);

    ctx.clearRect(0, 0, G.w, G.h);
    drawVignette(t);

    // idle particles
    drawParticles(dt);
    drawPlayer(t);

    if (state.mode !== "play") {
      ctx.restore();
      syncHud();
      return;
    }

    // timers
    state.time = Math.max(0, state.time - dt);
    if (state.time <= 0) {
      endRun();
      ctx.restore();
      return;
    }

    // cooldowns
    state.bombCd = Math.max(0, state.bombCd - dt);
    state.dashCd = Math.max(0, state.dashCd - dt);
    player.inv = Math.max(0, player.inv - dt);

    // movement (player follows finger smoothly)
    const follow = state.pointerDown ? 1 : 0;
    const dx = (state.targetX - player.x);
    const dy = (state.targetY - player.y);
    player.vx += dx * dt * state.moveSpeed * 0.12 * follow;
    player.vy += dy * dt * state.moveSpeed * 0.12 * follow;

    player.vx *= (1 - dt * 2.6);
    player.vy *= (1 - dt * 2.6);
    player.x += player.vx * 60;
    player.y += player.vy * 60;

    const padX = 44 * G.dpr;
    const padYTop = 120 * G.dpr;
    const padYBot = 92 * G.dpr;
    player.x = clamp(player.x, padX, G.w - padX);
    player.y = clamp(player.y, padYTop, G.h - padYBot);

    // waves: kills -> next wave
    if (state.kills >= state.needKillsForWave) {
      state.wave += 1;
      state.needKillsForWave += 10 + state.wave * 2;
      state.spawnedThisWave = 0;
      toast("WAVE " + state.wave);
      sfx(780, 0.05, "triangle", 0.06);

      if (state.wave === state.nextPerkAtWave) {
        openPerk();
        ctx.restore();
        syncHud();
        return;
      }
    }

    // spawn
    spawnTimer += dt;
    const base = Math.max(0.12, 0.55 - state.wave * 0.04);
    while (spawnTimer >= base) {
      spawnTimer -= base;
      const type = pickZombieType();
      spawnZombie(type);
      state.spawnedThisWave++;
      if (state.wave >= 6 && Math.random() < 0.35) { spawnZombie(pickZombieType()); state.spawnedThisWave++; }
    }

    // fire
    if (state.firing) {
      fireTimer += dt;
      while (fireTimer >= state.fireRate) {
        fireTimer -= state.fireRate;
        fireBullet();
      }
    } else {
      fireTimer = Math.min(fireTimer, state.fireRate * 0.5);
    }

    // bullets update + collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.t += dt;
      if (b.t >= b.life) { bullets.splice(i, 1); continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (Math.random() < 0.35) particles.push({ x: b.x, y: b.y, vx: rnd(-80, 80) * G.dpr, vy: rnd(-80, 80) * G.dpr, life: rnd(0.12, 0.28), t: 0, kind: "c", r: rnd(1, 2.4) * G.dpr });

      for (let j = zombies.length - 1; j >= 0; j--) {
        const z = zombies[j];
        const rr = z.r + b.r;
        if (dist2(b.x, b.y, z.x, z.y) <= rr * rr) {
          bullets.splice(i, 1);
          z.hp -= b.dmg;
          burst(b.x, b.y, 10, "c");

          if (z.hp <= 0) {
            zombies.splice(j, 1);
            state.kills++;
            const add = (z.type === "boss" ? 520 : z.type === "tank" ? 190 : z.type === "runner" ? 140 : 120) + state.wave * 8;
            state.score += add;
            burst(z.x, z.y, z.type === "boss" ? 70 : 28, z.type === "tank" ? "p" : "g");
            state.shake = Math.min(1, state.shake + (z.type === "boss" ? 0.30 : 0.12));
            sfx(660 + rnd(-50, 50), 0.03, "triangle", 0.05);
            vibrate(6);
          }
          break;
        }
      }
    }

    // zombies move + damage player
    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i];
      const ddx = player.x - z.x;
      const ddy = player.y - z.y;
      const len = Math.max(1, Math.hypot(ddx, ddy));
      const ux = ddx / len, uy = ddy / len;
      const wob = Math.sin((t * 0.001) * 3 + z.wob) * 0.22;

      z.x += (ux + wob) * z.sp * dt;
      z.y += (uy - wob) * z.sp * dt;

      // hit
      const rr = z.r + player.r * G.dpr;
      if (dist2(z.x, z.y, player.x, player.y) <= rr * rr) {
        if (player.inv <= 0) {
          state.hp -= 1;
          player.inv = 0.95;
          state.shake = Math.min(1, state.shake + 0.45);
          burst(player.x, player.y, 40, "r");
          vibrate([15, 40, 15]);
          sfx(140, 0.08, "sawtooth", 0.06);
          toast(state.hp > 0 ? "HIT!" : "DOWN!");
          if (state.hp <= 0) { endRun(); ctx.restore(); return; }
        }
      }
    }

    // draw
    drawZombies(t);
    drawBullets();
    drawPlayer(t);
    drawParticles(dt);

    ctx.restore();
    syncHud();
  }

  // --- Input
  function setTargetFromEvent(e) {
    const r = cv.getBoundingClientRect();
    state.targetX = (e.clientX - r.left) * G.dpr;
    state.targetY = (e.clientY - r.top) * G.dpr;
  }

  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    ensureAudio();
    state.pointerDown = true;
    setTargetFromEvent(e);
  });

  cv.addEventListener("pointermove", (e) => {
    if (!state.pointerDown) return;
    setTargetFromEvent(e);
  });

  cv.addEventListener("pointerup", () => (state.pointerDown = false));
  cv.addEventListener("pointercancel", () => (state.pointerDown = false));

  // Fire button hold
  ui.btnFire.addEventListener("pointerdown", () => { ensureAudio(); state.firing = true; });
  ui.btnFire.addEventListener("pointerup", () => (state.firing = false));
  ui.btnFire.addEventListener("pointercancel", () => (state.firing = false));
  ui.btnFire.addEventListener("pointerleave", () => (state.firing = false));

  ui.btnBomb.addEventListener("click", () => { ensureAudio(); if (state.mode === "play") bomb(); });
  ui.btnDash.addEventListener("click", () => { ensureAudio(); if (state.mode === "play") dash(); });

  // --- Buttons / overlays
  ui.btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    localStorage.setItem(LS.sound, soundOn ? "1" : "0");
    ui.btnSound.textContent = soundOn ? "SOUND: ON" : "SOUND: OFF";
    toast(soundOn ? "SOUND ON" : "SOUND OFF");
    sfx(740, 0.03, "triangle", 0.05);
  });

  ui.btnGetId.addEventListener("click", join);

  ui.btnPlay.addEventListener("click", () => {
    ensureAudio();
    join();
    show(ui.menu, false);
    show(ui.how, false);
    show(ui.leaders, false);
    show(ui.over, false);
    show(ui.perk, false);
    resetRun();
  });

  ui.btnHow.addEventListener("click", () => show(ui.how, true));
  ui.btnHowBack.addEventListener("click", () => show(ui.how, false));

  ui.btnLeaders.addEventListener("click", () => {
    renderBoards();
    show(ui.leaders, true);
  });
  ui.btnLeadersClose.addEventListener("click", () => show(ui.leaders, false));

  ui.tabLocal.addEventListener("click", () => {
    ui.tabLocal.classList.add("on");
    ui.tabChain.classList.remove("on");
    ui.listLocal.classList.remove("hidden");
    ui.listChain.classList.add("hidden");
  });
  ui.tabChain.addEventListener("click", () => {
    ui.tabChain.classList.add("on");
    ui.tabLocal.classList.remove("on");
    ui.listChain.classList.remove("hidden");
    ui.listLocal.classList.add("hidden");
  });

  ui.btnCopyBoard.addEventListener("click", async () => {
    const local = [...state.runs].sort((a, b) => b.score - a.score).slice(0, 10);
    const txt = local.map((r, i) => `#${i + 1} ${r.score} (W${r.wave} K${r.kills})`).join("\n");
    await copyText(txt || "EMPTY");
    toast("COPIED");
  });

  ui.btnReset.addEventListener("click", () => {
    state.runs = [];
    localStorage.removeItem(LS.runs);
    toast("RESET");
    renderBoards();
  });

  ui.btnShare.addEventListener("click", () => {
    const link = buildShareLink({ id: state.id, score: state.best });
    shareOrCopy(link);
  });

  ui.btnCopyLink.addEventListener("click", async () => {
    const link = buildShareLink({ id: state.id, score: state.best });
    await copyText(link);
    toast("LINK COPIED");
  });

  ui.btnAgain.addEventListener("click", () => {
    ensureAudio();
    show(ui.over, false);
    resetRun();
  });

  ui.btnMenu.addEventListener("click", () => {
    state.mode = "menu";
    show(ui.over, false);
    show(ui.menu, true);
    syncMenu();
  });

  // --- Intro behavior: autoplay muted, tap enables sound
  function startIntroMuted() {
    state.mode = "intro";
    show(ui.intro, true);
    show(ui.menu, false);
    try {
      ui.introVideo.muted = true;
      ui.introVideo.play().catch(() => {});
    } catch {}
  }

  function leaveIntroToMenu() {
    show(ui.intro, false);
    show(ui.menu, true);
    state.mode = "menu";
    syncMenu();
  }

  ui.btnSkip.addEventListener("click", () => {
    try { ui.introVideo.pause(); } catch {}
    leaveIntroToMenu();
  });

  ui.btnStart.addEventListener("click", () => {
    ensureAudio();
    try {
      ui.introVideo.muted = false;
      ui.introVideo.play().catch(() => {});
    } catch {}
    sfx(740, 0.05, "triangle", 0.06);
    setTimeout(() => leaveIntroToMenu(), 650);
  });

  ui.introVideo.addEventListener("ended", leaveIntroToMenu);

  // --- Main loop
  function loop(t) {
    const dt = clamp((t - G.last) / 1000, 0, 0.033);
    G.last = t;
    step(dt, t);
    requestAnimationFrame(loop);
  }

  // --- Boot
  function boot() {
    // bg video
    ui.bgVideo?.play().catch(() => {});
    // merge chain board with your best
    if (state.id) state.chainBoard = mergeBoard(state.chainBoard, [{ id: state.id, score: state.best }]);
    // menu UI
    ui.btnSound.textContent = soundOn ? "SOUND: ON" : "SOUND: OFF";
    syncMenu();
    syncHud();
    // intro first
    startIntroMuted();
    requestAnimationFrame(loop);
    toast("LOADED");
  }

  boot();
})();
