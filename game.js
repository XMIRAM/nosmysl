(() => {
  const $ = (s) => document.querySelector(s);

  // ===== UI
  const ui = {
    cv: $("#cv"),
    hudMode: $("#hudMode"),
    hudCase: $("#hudCase"),
    hudTime: $("#hudTime"),
    hudScore: $("#hudScore"),
    hudRank: $("#hudRank"),

    loadPct: $("#loadPct"),
    barFill: $("#barFill"),

    menu: $("#menu"),
    how: $("#how"),
    leaders: $("#leaders"),
    result: $("#result"),

    btnPlay: $("#btnPlay"),
    btnJoin: $("#btnJoin"),
    btnHow: $("#btnHow"),
    btnHowBack: $("#btnHowBack"),
    btnLeaders: $("#btnLeaders"),
    btnLeadersBack: $("#btnLeadersBack"),
    btnAgain: $("#btnAgain"),
    btnMenu: $("#btnMenu"),
    btnReset: $("#btnReset"),
    btnCopyBoard: $("#btnCopyBoard"),

    btnShare: $("#btnShare"),
    btnCopy: $("#btnCopy"),
    btnSound: $("#btnSound"),

    tabChain: $("#tabChain"),
    tabLocal: $("#tabLocal"),
    listChain: $("#listChain"),
    listLocal: $("#listLocal"),

    myId: $("#myId"),
    fromId: $("#fromId"),
    chainLen: $("#chainLen"),
    bestScore: $("#bestScore"),

    resScore: $("#resScore"),
    resRank: $("#resRank"),
    resBest: $("#resBest"),
    resLoad: $("#resLoad"),
    resultTitle: $("#resultTitle"),
    resultDesc: $("#resultDesc"),

    toast: $("#toast"),

    introWrap: $("#introWrap"),
    introVideo: $("#introVideo"),
    btnIntro: $("#btnIntro"),
  };

  // ===== Storage keys
  const LS = {
    id: "vl_id",
    best: "vl_best",
    localRuns: "vl_runs",
    sound: "vl_sound",
  };

  // ===== helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const now = () => performance.now();

  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => ui.toast.classList.remove("show"), 1300);
  }

  function vibrate(p = 10) { if (navigator.vibrate) navigator.vibrate(p); }

  // ===== Audio (tiny synth)
  let audioCtx = null;
  let soundOn = (localStorage.getItem(LS.sound) ?? "1") === "1";
  function ensureAudio() {
    if (!soundOn) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function sfx(freq, dur, type="sine", gain=0.06) {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  // ===== ID
  function makeId() {
    const t = Date.now().toString(36).slice(-6);
    const r = Math.random().toString(36).slice(2, 6);
    return (t + r).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  // ===== URL: chain + board inside link
  function parseUrl() {
    const u = new URL(location.href);
    const c = u.searchParams.get("c") || "";
    const p = u.searchParams.get("p") || "";
    const chain = c.split(".").map(x => x.replace(/[^A-Z0-9]/gi,"").toUpperCase()).filter(Boolean).slice(0, 200);

    // p format: ID~SCORE.ID~SCORE...
    const board = [];
    if (p) {
      p.split(".").slice(0, 60).forEach(tok => {
        const [idRaw, scRaw] = tok.split("~");
        const id = (idRaw || "").replace(/[^A-Z0-9]/gi,"").toUpperCase();
        const sc = Number(scRaw || "0");
        if (id && Number.isFinite(sc) && sc >= 0) board.push({ id, score: Math.floor(sc) });
      });
    }
    return { chain, board };
  }

  function buildShareLink(extraEntry) {
    const u = new URL(location.href);
    u.search = "";
    const chain = [...state.chain];
    if (state.id) chain.push(state.id);

    // merge chain board (best per id), keep top 12 for compact link
    const merged = mergeBoard(state.chainBoard, extraEntry ? [extraEntry] : []);
    merged.sort((a,b)=>b.score-a.score);
    const top = merged.slice(0, 12);

    if (chain.length) u.searchParams.set("c", chain.join("."));
    if (top.length) u.searchParams.set("p", top.map(e => `${e.id}~${e.score}`).join("."));
    u.searchParams.set("v", "2");
    return u.toString();
  }

  function mergeBoard(boardA, boardB) {
    const map = new Map();
    [...boardA, ...boardB].forEach(e => {
      const prev = map.get(e.id);
      if (!prev || e.score > prev.score) map.set(e.id, { id: e.id, score: e.score });
    });
    return [...map.values()];
  }

  // ===== Ranks
  const RANKS = [
    { name: "Rookie", min: 0 },
    { name: "Carrier", min: 900 },
    { name: "Outbreak", min: 1800 },
    { name: "Plague", min: 2800 },
    { name: "Apocalypse", min: 4000 },
  ];
  function rankFor(score) {
    let r = RANKS[0].name;
    for (const it of RANKS) if (score >= it.min) r = it.name;
    return r;
  }

  // ===== State
  const parsed = parseUrl();
  const state = {
    id: localStorage.getItem(LS.id) || "",
    best: Number(localStorage.getItem(LS.best) || "0"),
    chain: parsed.chain,
    chainBoard: parsed.board,

    // local runs list [{score, load, ts}]
    runs: [],
    // game
    mode: "menu", // menu | play | result
    time: 45.0,
    score: 0,
    load: 0,        // 0..100
    combo: 0,
    mult: 1,
    fever: 0,       // seconds remaining
    playing: false,

    // control
    targetX: 0,
    targetY: 0,
    touchDown: false,
  };

  try {
    state.runs = JSON.parse(localStorage.getItem(LS.localRuns) || "[]") || [];
    if (!Array.isArray(state.runs)) state.runs = [];
  } catch { state.runs = []; }

  // ===== Orientation: portrait only
  function checkOrientation(){
    document.body.classList.toggle("landscape", window.innerWidth > window.innerHeight);
  }
  window.addEventListener("resize", checkOrientation);
  window.addEventListener("orientationchange", checkOrientation);
  checkOrientation();

  // ===== Intro handling
  function setupIntro(){
    // if intro.mp4 missing -> hide block
    if (!ui.introVideo) return;
    ui.introVideo.addEventListener("error", () => {
      if (ui.introWrap) ui.introWrap.style.display = "none";
    });
    ui.btnIntro?.addEventListener("click", () => {
      try {
        if (ui.introVideo.paused) { ui.introVideo.muted = false; ui.introVideo.play(); ui.btnIntro.textContent = "PAUSE"; }
        else { ui.introVideo.pause(); ui.btnIntro.textContent = "PLAY"; }
      } catch {}
    });
  }

  // ===== UI sync
  function infectorId() {
    return state.chain.length ? state.chain[state.chain.length - 1] : "PATIENT ZERO";
  }
  function caseNum() {
    // you are chain length + 1 when you have an ID
    return state.id ? `#${state.chain.length + 1}` : "—";
  }
  function updateTopUI() {
    ui.hudMode.textContent = state.mode.toUpperCase();
    ui.hudCase.textContent = caseNum();
    ui.hudTime.textContent = state.time.toFixed(1);
    ui.hudScore.textContent = String(Math.floor(state.score));
    ui.loadPct.textContent = `${Math.floor(state.load)}%`;
    ui.barFill.style.width = `${clamp(state.load, 0, 100)}%`;

    ui.hudRank.textContent = rankFor(state.best);

    ui.myId.textContent = state.id || "—";
    ui.fromId.textContent = infectorId();
    ui.chainLen.textContent = String((state.id ? state.chain.length + 1 : state.chain.length) || 0);
    ui.bestScore.textContent = String(state.best);
  }

  function showOverlay(el, on) {
    el.classList.toggle("show", !!on);
  }

  function join() {
    if (state.id) return;
    state.id = makeId();
    localStorage.setItem(LS.id, state.id);
    updateTopUI();
    toast(`Твой ID: ${state.id}`);
    vibrate([10, 30, 10]);
    sfx(740, 0.05, "triangle", 0.06);
  }

  // ===== Leaderboards
  function renderLeaderboards() {
    // chain board + local
    const chainMerged = mergeBoard(state.chainBoard, state.id ? [{ id: state.id, score: state.best }] : []);
    chainMerged.sort((a,b)=>b.score-a.score);

    ui.listChain.innerHTML = "";
    if (!chainMerged.length) {
      ui.listChain.innerHTML = `<div class="item"><div>Пока пусто. Выиграй и шарь ссылку.</div><div class="badge">—</div></div>`;
    } else {
      chainMerged.slice(0, 10).forEach((e, i) => {
        const me = state.id && e.id === state.id;
        ui.listChain.insertAdjacentHTML("beforeend", `
          <div class="item">
            <div>
              <div class="mono">${me ? "YOU • " : ""}${e.id}</div>
              <div class="k">${rankFor(e.score)}</div>
            </div>
            <div class="badge">#${i+1} • ${e.score}</div>
          </div>
        `);
      });
    }

    ui.listLocal.innerHTML = "";
    const localSorted = [...state.runs].sort((a,b)=>b.score-a.score).slice(0, 10);
    if (!localSorted.length) {
      ui.listLocal.innerHTML = `<div class="item"><div>Сыграй пару раз — тут появится топ.</div><div class="badge">—</div></div>`;
    } else {
      localSorted.forEach((r,i) => {
        ui.listLocal.insertAdjacentHTML("beforeend", `
          <div class="item">
            <div>
              <div class="mono">${new Date(r.ts).toLocaleDateString()} ${new Date(r.ts).toLocaleTimeString().slice(0,5)}</div>
              <div class="k">LOAD ${r.load}%</div>
            </div>
            <div class="badge">#${i+1} • ${r.score}</div>
          </div>
        `);
      });
    }
  }

  // ===== Game engine (Canvas)
  const cv = ui.cv;
  const ctx = cv.getContext("2d", { alpha: true });

  const G = {
    w: 0, h: 0, dpr: 1,
    tPrev: now(),
    shake: 0,
  };

  function resizeCanvas() {
    const rect = cv.getBoundingClientRect();
    G.dpr = Math.min(2.25, window.devicePixelRatio || 1);
    cv.width = Math.floor(rect.width * G.dpr);
    cv.height = Math.floor(rect.height * G.dpr);
    G.w = cv.width;
    G.h = cv.height;

    // initial target
    state.targetX = G.w * 0.5;
    state.targetY = G.h * 0.78;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Entities
  const player = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    r: 18,
    hp: 3,
  };

  const drops = [];    // vials / antidotes / mutagens
  const particles = [];

  function resetRun() {
    state.time = 45.0;
    state.score = 0;
    state.load = 0;
    state.combo = 0;
    state.mult = 1;
    state.fever = 0;
    player.hp = 3;

    drops.length = 0;
    particles.length = 0;

    player.x = G.w * 0.5;
    player.y = G.h * 0.78;
    player.vx = player.vy = 0;

    G.shake = 0;
    updateTopUI();
  }

  function spawnDrop() {
    // difficulty ramp by time
    const prog = 1 - (state.time / 45);
    const speed = rnd(260, 340) + prog * 160;
    const x = rnd(36, G.w - 36);
    const y = -30;

    // types: vial 65%, antidote 28%, mutagen 7%
    const roll = Math.random();
    let type = "vial";
    if (roll > 0.65 && roll <= 0.93) type = "antidote";
    if (roll > 0.93) type = "mutagen";

    const baseR = type === "mutagen" ? 15 : 13;
    drops.push({
      type,
      x, y,
      vx: rnd(-22, 22) * (G.dpr/1.2),
      vy: speed,
      r: baseR * (G.dpr/1.2),
      spin: rnd(-3, 3),
      a: 1,
    });
  }

  function burst(x,y, n, kind="good") {
    for (let i=0;i<n;i++){
      const ang = rnd(0, Math.PI*2);
      const sp = rnd(120, 520);
      particles.push({
        x, y,
        vx: Math.cos(ang)*sp,
        vy: Math.sin(ang)*sp,
        life: rnd(0.25, 0.7),
        t: 0,
        kind,
        r: rnd(1.2, 3.2) * G.dpr,
      });
    }
  }

  function drawBackground(t) {
    // subtle moving vignette + grid
    ctx.save();
    const tt = t * 0.001;
    const gx = (Math.sin(tt*0.7)*0.5+0.5)*G.w;
    const gy = (Math.cos(tt*0.6)*0.5+0.5)*G.h;

    const rad = ctx.createRadialGradient(gx, gy, 10, gx, gy, Math.max(G.w,G.h));
    rad.addColorStop(0, "rgba(125,255,204,0.10)");
    rad.addColorStop(0.55, "rgba(0,0,0,0)");
    rad.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = rad;
    ctx.fillRect(0,0,G.w,G.h);

    // micro grid
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = "rgba(125,255,204,0.22)";
    ctx.lineWidth = 1 * G.dpr;
    const step = Math.floor(34 * G.dpr);
    ctx.beginPath();
    for (let x=0; x<=G.w; x+=step) { ctx.moveTo(x,0); ctx.lineTo(x,G.h); }
    for (let y=0; y<=G.h; y+=step) { ctx.moveTo(0,y); ctx.lineTo(G.w,y); }
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(t) {
    const tt = t*0.001;
    const pulse = 1 + Math.sin(tt*8) * (state.fever>0 ? 0.08 : 0.04);
    const r = player.r * G.dpr * pulse;

    // outer glow
    ctx.save();
    ctx.shadowBlur = 24 * G.dpr;
    ctx.shadowColor = state.fever>0 ? "rgba(255,255,255,0.25)" : "rgba(125,255,204,0.28)";
    const grad = ctx.createRadialGradient(player.x, player.y, 2, player.x, player.y, r*2.2);
    grad.addColorStop(0, state.fever>0 ? "rgba(255,255,255,0.85)" : "rgba(125,255,204,0.95)");
    grad.addColorStop(0.55, state.fever>0 ? "rgba(125,255,204,0.65)" : "rgba(26,242,166,0.62)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r*1.25, 0, Math.PI*2);
    ctx.fill();

    // core
    ctx.shadowBlur = 10 * G.dpr;
    ctx.shadowColor = "rgba(125,255,204,0.22)";
    ctx.fillStyle = state.fever>0 ? "rgba(255,255,255,0.92)" : "rgba(125,255,204,0.92)";
    ctx.beginPath();
    ctx.arc(player.x, player.y, r*0.58, 0, Math.PI*2);
    ctx.fill();

    // orbit ring
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = state.fever>0 ? "rgba(255,255,255,0.35)" : "rgba(125,255,204,0.35)";
    ctx.lineWidth = 2 * G.dpr;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r*0.95, tt*2.2, tt*2.2 + Math.PI*1.55);
    ctx.stroke();

    ctx.restore();
  }

  function drawDrop(d) {
    ctx.save();
    ctx.globalAlpha = d.a;

    if (d.type === "vial") {
      ctx.shadowBlur = 18 * G.dpr;
      ctx.shadowColor = "rgba(125,255,204,0.25)";
      ctx.fillStyle = "rgba(125,255,204,0.90)";
    } else if (d.type === "antidote") {
      ctx.shadowBlur = 18 * G.dpr;
      ctx.shadowColor = "rgba(255,60,110,0.24)";
      ctx.fillStyle = "rgba(255,60,110,0.90)";
    } else {
      ctx.shadowBlur = 18 * G.dpr;
      ctx.shadowColor = "rgba(170,120,255,0.22)";
      ctx.fillStyle = "rgba(170,120,255,0.90)";
    }

    // capsule-ish shape
    const r = d.r * G.dpr * 0.95;
    ctx.translate(d.x, d.y);
    ctx.rotate(d.spin);
    ctx.beginPath();
    ctx.roundRect(-r*0.75, -r*1.05, r*1.5, r*2.1, r*0.75);
    ctx.fill();

    // inner shine
    ctx.globalAlpha = d.a * 0.35;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.roundRect(-r*0.38, -r*0.86, r*0.38, r*1.72, r*0.32);
    ctx.fill();

    ctx.restore();
  }

  function drawParticles(dt) {
    for (let i=particles.length-1;i>=0;i--){
      const p = particles[i];
      p.t += dt;
      const k = 1 - (p.t / p.life);
      if (k <= 0) { particles.splice(i,1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1 - 1.8*dt);
      p.vy *= (1 - 1.8*dt);

      ctx.save();
      ctx.globalAlpha = clamp(k,0,1) * 0.9;
      ctx.shadowBlur = 14 * G.dpr;
      ctx.shadowColor = p.kind === "bad" ? "rgba(255,60,110,0.25)" : "rgba(125,255,204,0.22)";
      ctx.fillStyle = p.kind === "bad" ? "rgba(255,60,110,0.9)" : "rgba(125,255,204,0.9)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.7 + k*0.9), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function collide(a, bX, bY, bR) {
    const dx = a.x - bX;
    const dy = a.y - bY;
    const rr = (a.r*G.dpr) + bR;
    return dx*dx + dy*dy <= rr*rr;
  }

  // ===== Gameplay: drop spawn scheduler
  let spawnAcc = 0;

  function step(dt, t) {
    // camera shake
    const shake = G.shake > 0 ? G.shake : 0;
    G.shake = Math.max(0, G.shake - dt * 7);

    ctx.save();
    if (shake > 0) {
      const sx = rnd(-1,1) * shake * 10 * G.dpr;
      const sy = rnd(-1,1) * shake * 10 * G.dpr;
      ctx.translate(sx, sy);
    }

    // clear
    ctx.clearRect(0,0,G.w,G.h);
    drawBackground(t);

    if (state.mode === "play") {
      // time
      state.time = Math.max(0, state.time - dt);
      if (state.fever > 0) state.fever = Math.max(0, state.fever - dt);

      // difficulty ramp: more spawns
      const prog = 1 - (state.time / 45);
      const spawnRate = 0.28 - prog*0.11; // seconds per drop
      spawnAcc += dt;
      while (spawnAcc >= spawnRate) {
        spawnAcc -= spawnRate;
        spawnDrop();
        if (prog > 0.55 && Math.random() < 0.25) spawnDrop();
      }

      // player follows touch target with spring
      const stiffness = 18;
      const damp = 7.5;
      const dx = state.targetX - player.x;
      const dy = state.targetY - player.y;
      player.vx += dx * stiffness * dt;
      player.vy += dy * stiffness * dt;
      player.vx *= (1 - damp*dt);
      player.vy *= (1 - damp*dt);
      player.x += player.vx * dt * 60;
      player.y += player.vy * dt * 60;
      player.x = clamp(player.x, 24*G.dpr, G.w - 24*G.dpr);
      player.y = clamp(player.y, 90*G.dpr, G.h - 60*G.dpr);

      // drops
      for (let i=drops.length-1;i>=0;i--){
        const d = drops[i];
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.spin += d.vx * 0.002 * dt;

        // offscreen
        if (d.y > G.h + 80) {
          drops.splice(i,1);
          // missed vial lowers combo slightly
          if (d.type === "vial") state.combo = Math.max(0, state.combo - 1);
          continue;
        }

        // collision
        if (collide(player, d.x, d.y, d.r*G.dpr)) {
          drops.splice(i,1);

          if (d.type === "vial") {
            // score / load
            state.combo += 1;
            const comboBonus = clamp(state.combo, 0, 25);
            const feverMul = state.fever>0 ? 2 : 1;
            state.mult = 1 + comboBonus * 0.04;
            const gain = 6 + comboBonus*0.18;
            state.load = clamp(state.load + gain, 0, 100);

            const addScore = (70 + comboBonus*8) * state.mult * feverMul;
            state.score += addScore;

            burst(d.x, d.y, state.fever>0 ? 28 : 16, "good");
            vibrate(6);
            sfx(680 + comboBonus*6, 0.03, "triangle", 0.05);

            // FEVER trigger
            if (state.load >= 100 && state.fever <= 0) {
              state.fever = 7.5;
              burst(player.x, player.y, 90, "good");
              toast("FEVER MODE ⚡ x2");
              vibrate([20, 30, 20]);
              sfx(940, 0.06, "sine", 0.07);
            }

          } else if (d.type === "antidote") {
            state.combo = 0;
            state.mult = 1;
            state.load = clamp(state.load - 16, 0, 100);
            player.hp = Math.max(0, player.hp - 1);
            burst(d.x, d.y, 26, "bad");
            G.shake = Math.min(1, G.shake + 0.35);
            vibrate([12, 35, 12]);
            sfx(180, 0.06, "sawtooth", 0.06);

            if (player.hp <= 0) {
              // end run (lose)
              endRun(false);
            }

          } else { // mutagen
            // gives big score and protects load a bit
            const feverMul = state.fever>0 ? 2 : 1;
            state.score += 220 * feverMul;
            state.load = clamp(state.load + 10, 0, 100);
            burst(d.x, d.y, 34, "good");
            vibrate(10);
            sfx(780, 0.05, "square", 0.04);
          }
        }
      }

      // passive load decay if no fever
      if (state.fever <= 0) {
        state.load = clamp(state.load - dt * 1.55, 0, 100);
      } else {
        // fever glow points
        state.score += dt * 18; // tiny drip points
      }

      // draw drops
      for (const d of drops) drawDrop(d);

      // particles and player
      drawParticles(dt);
      drawPlayer(t);

      // win/lose by time
      if (state.time <= 0) {
        endRun(state.load >= 100);
      }
    } else {
      // menu idle animation (floating particles)
      if (Math.random() < 0.08) {
        particles.push({
          x: rnd(0, G.w), y: rnd(0, G.h),
          vx: rnd(-30,30), vy: rnd(-30,30),
          life: rnd(0.7, 1.4), t: 0, kind: "good", r: rnd(1.0, 2.2)*G.dpr
        });
      }
      drawParticles(dt);
      // show a decorative idle player
      player.x = G.w * 0.5 + Math.sin(t*0.0013)*40*G.dpr;
      player.y = G.h * 0.62 + Math.cos(t*0.0011)*30*G.dpr;
      drawPlayer(t);
    }

    ctx.restore();

    updateTopUI();
  }

  function endRun(win) {
    state.mode = "result";
    state.playing = false;

    const sc = Math.floor(state.score);
    const ld = Math.floor(state.load);

    // store run
    state.runs.push({ score: sc, load: ld, ts: Date.now() });
    state.runs = state.runs.slice(-60);
    localStorage.setItem(LS.localRuns, JSON.stringify(state.runs));

    if (sc > state.best) {
      state.best = sc;
      localStorage.setItem(LS.best, String(state.best));
    }

    // Update chain board in-memory
    if (state.id) {
      state.chainBoard = mergeBoard(state.chainBoard, [{ id: state.id, score: state.best }]);
    }

    // Result UI
    ui.resScore.textContent = String(sc);
    ui.resLoad.textContent = `${ld}%`;
    ui.resBest.textContent = String(state.best);
    ui.resRank.textContent = rankFor(state.best);

    if (win) {
      ui.resultTitle.textContent = "UNLOCKED ☣";
      ui.resultDesc.textContent = "Ты набрал 100%. Теперь можешь заразить ссылкой (и лидербордом).";
      $("#shareRow").style.display = "flex";
      sfx(860, 0.07, "triangle", 0.07);
      vibrate([20, 25, 20]);
    } else {
      ui.resultTitle.textContent = "TRY AGAIN";
      ui.resultDesc.textContent = "Время/HP закончились. Дожми до 100% LOAD и побей рекорд.";
      $("#shareRow").style.display = "none";
      sfx(140, 0.08, "sawtooth", 0.06);
      vibrate(20);
    }

    showOverlay(ui.result, true);
    showOverlay(ui.menu, false);
  }

  function startGame() {
    join(); // авто-join чтобы игра была “живой” сразу
    resetRun();
    state.mode = "play";
    state.playing = true;
    showOverlay(ui.menu, false);
    showOverlay(ui.result, false);
    showOverlay(ui.how, false);
    showOverlay(ui.leaders, false);
    toast("GO!");
    sfx(520, 0.05, "sine", 0.05);
    vibrate(10);
  }

  // ===== Input
  function setTargetFromEvent(e) {
    const rect = cv.getBoundingClientRect();
    const x = (e.clientX - rect.left) * G.dpr;
    const y = (e.clientY - rect.top) * G.dpr;
    state.targetX = x;
    state.targetY = y;
  }

  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    state.touchDown = true;
    setTargetFromEvent(e);
    // first interaction enables audio
    ensureAudio();
  });

  cv.addEventListener("pointermove", (e) => {
    if (!state.touchDown) return;
    setTargetFromEvent(e);
  });

  cv.addEventListener("pointerup", () => {
    state.touchDown = false;
  });

  // ===== Buttons
  ui.btnJoin.addEventListener("click", join);
  ui.btnPlay.addEventListener("click", startGame);

  ui.btnAgain.addEventListener("click", startGame);
  ui.btnMenu.addEventListener("click", () => {
    state.mode = "menu";
    showOverlay(ui.result, false);
    showOverlay(ui.menu, true);
    toast("MENU");
  });

  ui.btnHow.addEventListener("click", () => showOverlay(ui.how, true));
  ui.btnHowBack.addEventListener("click", () => showOverlay(ui.how, false));

  ui.btnLeaders.addEventListener("click", () => {
    renderLeaderboards();
    showOverlay(ui.leaders, true);
  });
  ui.btnLeadersBack.addEventListener("click", () => showOverlay(ui.leaders, false));

  ui.tabChain.addEventListener("click", () => {
    ui.tabChain.classList.add("on"); ui.tabLocal.classList.remove("on");
    ui.listChain.classList.remove("hidden"); ui.listLocal.classList.add("hidden");
  });
  ui.tabLocal.addEventListener("click", () => {
    ui.tabLocal.classList.add("on"); ui.tabChain.classList.remove("on");
    ui.listLocal.classList.remove("hidden"); ui.listChain.classList.add("hidden");
  });

  ui.btnCopyBoard.addEventListener("click", async () => {
    const merged = mergeBoard(state.chainBoard, state.id ? [{ id: state.id, score: state.best }] : []);
    merged.sort((a,b)=>b.score-a.score);
    const txt = merged.slice(0, 10).map((e,i)=>`#${i+1} ${e.id} — ${e.score}`).join("\n");
    await copyText(txt);
    toast("BOARD copied");
  });

  ui.btnReset.addEventListener("click", () => {
    localStorage.removeItem(LS.best);
    localStorage.removeItem(LS.localRuns);
    state.best = 0;
    state.runs = [];
    toast("RESET");
    renderLeaderboards();
    updateTopUI();
  });

  ui.btnSound.addEventListener("click", () => {
    soundOn = !soundOn;
    localStorage.setItem(LS.sound, soundOn ? "1" : "0");
    ui.btnSound.textContent = soundOn ? "SOUND: ON" : "SOUND: OFF";
    toast(soundOn ? "Sound ON" : "Sound OFF");
  });
  ui.btnSound.textContent = soundOn ? "SOUND: ON" : "SOUND: OFF";

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      vibrate(10);
      sfx(760, 0.04, "triangle", 0.05);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  async function shareOrCopy(link) {
    const text = `☣ VIRAL LINK — попробуй побить мой рекорд\n${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "VIRAL LINK", text, url: link });
        toast("Shared");
      } else {
        await copyText(link);
        toast("Link copied");
      }
    } catch {
      await copyText(link);
      toast("Link copied");
    }
  }

  ui.btnShare.addEventListener("click", () => {
    const link = buildShareLink({ id: state.id, score: state.best });
    shareOrCopy(link);
  });
  ui.btnCopy.addEventListener("click", async () => {
    const link = buildShareLink({ id: state.id, score: state.best });
    await copyText(link);
    toast("Link copied");
  });

  // ===== Portrait-only + PWA
  function initPWA() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }

  // ===== RoundRect polyfill (Safari old)
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r){
      r = Math.min(r, w/2, h/2);
      this.beginPath();
      this.moveTo(x+r, y);
      this.arcTo(x+w, y, x+w, y+h, r);
      this.arcTo(x+w, y+h, x, y+h, r);
      this.arcTo(x, y+h, x, y, r);
      this.arcTo(x, y, x+w, y, r);
      this.closePath();
      return this;
    };
  }

  // ===== main loop
  function loop(t) {
    const dt = clamp((t - G.tPrev) / 1000, 0, 0.033);
    G.tPrev = t;
    step(dt, t);
    requestAnimationFrame(loop);
  }

  // ===== boot UI
  function boot() {
    setupIntro();

    if (!state.id) ui.btnJoin.textContent = "GET INFECTION ID";
    else ui.btnJoin.textContent = "ID READY";

    // show case and chain info
    ui.fromId.textContent = infectorId();
    ui.chainLen.textContent = String((state.id ? state.chain.length + 1 : state.chain.length) || 0);
    ui.myId.textContent = state.id || "—";

    updateTopUI();
    initPWA();

    // if intro exists, try autoplay muted
    try { ui.introVideo?.play(); } catch {}
    showOverlay(ui.menu, true);
    requestAnimationFrame(loop);
  }

  // ===== portrait overlay checker already running
  checkOrientation();

  // ===== If you came from link, keep chain board
  // Merge your own best into display (local only; share writes into link)
  state.chainBoard = mergeBoard(state.chainBoard, state.id ? [{ id: state.id, score: state.best }] : []);

  boot();
})();
