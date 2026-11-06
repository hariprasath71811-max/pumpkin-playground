/* =========================================================================
   Pumpkin Playground — games.js
   Four self-contained games: Pumpkin Catch, Spooky Whack-a-Mole,
   Flappy Pumpkin and Pumpkin-Man (a compact Pac-Man style maze chase).
   Every game exposes: start(), reset(), pause(), resume()
   ========================================================================= */
(function (global) {
  'use strict';

  const PP = global.PP;
  const { $, $$, clamp, rand, pick, sfx, store, boards, celebrate } = PP;

  /* ------------------------------------------------------------------
     shared: frame-locked round timer (pauses with its game loop)
     ------------------------------------------------------------------ */
  function createTimer(onTick, onEnd) {
    let remaining = 0, active = false, lastSec = -1;
    return {
      start(secs) { remaining = secs; lastSec = -1; active = true; onTick(secs); },
      tick(dt) {
        if (!active) return;
        remaining -= dt;
        const sec = Math.max(0, Math.ceil(remaining));
        if (sec !== lastSec) { lastSec = sec; onTick(sec); }
        if (remaining <= 0) { active = false; onEnd(); }
      },
      stop() { active = false; },
      running() { return active; }
    };
  }

  function verdicts(score, table) {
    for (let i = 0; i < table.length; i++) if (score >= table[i].min) return table[i].text;
    return table[table.length - 1].text;
  }

  /* ==================================================================
     GAME 1 — PUMPKIN CATCH
     ================================================================== */
  function createCatch() {
    const card = $('#card-catch');
    if (!card) return null;

    const wrap = $('#catchWrap'), canvas = $('#catchCanvas');
    const ctx = canvas.getContext('2d');
    const overlay = $('#catchOverlay'), over = $('#catchOver');
    const elScore = $('[data-stat="score"]', card);
    const elBest  = $('[data-stat="best"]', card);
    const elTime  = $('[data-stat="time"]', card);

    let W = 320, H = 240, dpr = 1;
    let items = [], pops = [], parts = [];
    let running = false, suspended = false, score = 0, elapsed = 0;
    let spawnAcc = 0, rafId = 0, lastT = 0, shakeT = 0, chompSeed = 0;

    const ROUND = 30;
    const timer = createTimer(
      s => { elTime.textContent = s; if (s <= 5 && s > 0) sfx.tick(); },
      end
    );

    /* ---------------- sizing ---------------- */
    function resize() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = wrap.clientHeight || Math.round(w * .75);
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      W = w; H = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    /* ---------------- helpers ---------------- */
    function bump(el) {
      if (!el) return;
      const host = el.parentElement;
      host.classList.remove('is-bumped');
      void host.offsetWidth;
      host.classList.add('is-bumped');
      setTimeout(() => host.classList.remove('is-bumped'), 420);
    }

    function burst(x, y, color, n, power) {
      const count = n || 14;
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(40, power || 190);
        parts.push({
          x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
          life: rand(.35, .8), max: .8, r: rand(2, 5), color: color
        });
      }
      if (parts.length > 260) parts.splice(0, parts.length - 260);
    }

    function spawn() {
      const isBook = Math.random() < .3;
      const r = isBook ? rand(20, 25) : rand(22, 29);
      const boost = 1 + Math.min(elapsed / ROUND, 1) * .9;
      items.push({
        type: isBook ? 'book' : 'pumpkin',
        x: rand(r + 6, W - r - 6),
        y: -r - 8,
        r: r,
        vy: rand(72, 118) * boost,
        rot: rand(-.35, .35),
        vr: rand(-1, 1),
        color: pick(['#1B382B', '#2C5A47', '#8A5A3B', '#40608F', '#7A4A8A'])
      });
    }

    /* ---------------- drawing ---------------- */
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawPumpkin(x, y, r, rot) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = '#3E7A4E';
      ctx.beginPath(); ctx.ellipse(0, -r * .92, r * .15, r * .3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#E85D30';
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * .84, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F5794C';
      [-.5, .5].forEach(o => { ctx.beginPath(); ctx.ellipse(o * r, 0, r * .4, r * .8, 0, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = '#E85D30';
      ctx.beginPath(); ctx.ellipse(0, 0, r * .3, r * .82, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFDE9B';
      ctx.beginPath(); ctx.moveTo(-r * .5, -r * .26); ctx.lineTo(-r * .18, -r * .26); ctx.lineTo(-r * .34, r * .04); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * .5, -r * .26); ctx.lineTo(r * .18, -r * .26); ctx.lineTo(r * .34, r * .04); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * .44, r * .3);
      ctx.lineTo(-r * .22, r * .46); ctx.lineTo(-r * .04, r * .3);
      ctx.lineTo(.14 * r, r * .46); ctx.lineTo(.32 * r, r * .3);
      ctx.lineTo(-r * .36, r * .3); ctx.lineTo(-r * .36, r * .56); ctx.lineTo(r * .36, r * .56); ctx.lineTo(r * .44, r * .3);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    function drawBook(x, y, r, rot, color) {
      const w = r * 1.7, h = r * 1.3;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = 'rgba(27,56,43,.2)';
      roundRect(-w / 2 + 2, -h / 2 + 4, w, h, 5); ctx.fill();
      ctx.fillStyle = color;
      roundRect(-w / 2, -h / 2, w, h, 5); ctx.fill();
      ctx.fillStyle = '#FFFDF8';
      roundRect(-w / 2 + w * .6, -h / 2 + 4, w * .32, h - 8, 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.fillRect(-w / 2 + 6, -h / 2 + 7, w * .34, 2.5);
      ctx.fillRect(-w / 2 + 6, -h / 2 + 13, w * .24, 2.5);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 3, 4, h - 6);
      ctx.restore();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // falling items (+ particle trails)
      items.forEach(it => {
        if (it.type === 'pumpkin') drawPumpkin(it.x, it.y, it.r, it.rot);
        else drawBook(it.x, it.y, it.r, it.rot, it.color);
      });

      // particles
      parts.forEach(p => {
        ctx.save();
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      // floating score labels
      pops.forEach(p => {
        ctx.save();
        ctx.globalAlpha = clamp(p.life / .75, 0, 1);
        ctx.font = '800 21px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(249,247,241,.85)';
        ctx.strokeText(p.txt, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.txt, p.x, p.y);
        ctx.restore();
      });
    }

    /* ---------------- loop ---------------- */
    function loop(t) {
      if (!running || suspended) return;
      const dt = Math.min((t - lastT) / 1000, .05);
      lastT = t;
      elapsed += dt;

      timer.tick(dt);
      if (!running) return;

      spawnAcc += dt;
      const interval = clamp(.62 - elapsed * .011, .27, .62);
      if (spawnAcc >= interval) { spawnAcc = 0; spawn(); }

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.y += it.vy * dt;
        it.rot += it.vr * dt;
        // particle trail
        if (Math.random() < .34) {
          parts.push({
            x: it.x + rand(-it.r * .5, it.r * .5), y: it.y - it.r * .5,
            vx: rand(-16, 16), vy: rand(-6, 26),
            life: .5, max: .5, r: rand(1.5, 3.4),
            color: it.type === 'pumpkin' ? '#F5794C' : 'rgba(27,56,43,.35)'
          });
        }
        if (it.y - it.r > H + 34) items.splice(i, 1);
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 340 * dt;
        if (p.life <= 0) parts.splice(i, 1);
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.life -= dt; p.y -= 36 * dt;
        if (p.life <= 0) pops.splice(i, 1);
      }

      draw();
      rafId = global.requestAnimationFrame(loop);
    }

    /* ---------------- flow ---------------- */
    function reset() {
      items = []; pops = []; parts = [];
      score = 0; elapsed = 0; spawnAcc = 0; chompSeed = 0;
      elScore.textContent = '0';
      elTime.textContent = ROUND;
      timer.stop();
    }

    function start() {
      resize(); reset();
      running = true; suspended = false;
      overlay.classList.add('is-hidden'); over.classList.add('is-hidden');
      timer.start(ROUND);
      sfx.pop();
      lastT = global.performance.now();
      global.cancelAnimationFrame(rafId);
      rafId = global.requestAnimationFrame(loop);
    }

    function stopLoops() {
      running = false; suspended = false;
      timer.stop();
      global.cancelAnimationFrame(rafId);
    }

    function end() {
      stopLoops();
      $('#catchFinal').textContent = score;
      const res = boards.add('catch', score);
      elBest.textContent = boards.best('catch');
      $('#catchVerdict').textContent = res.isRecord
        ? '🏆 New personal best!'
        : verdicts(score, [
            { min: 300, text: 'Certified gourd goblin 👻' },
            { min: 180, text: 'Textbook dodger extraordinaire' },
            { min: 90,  text: 'Respectably silly' },
            { min: 1,   text: 'The homework won this round' },
            { min: -1,  text: 'You clicked absolutely nothing' }
          ]);
      over.classList.remove('is-hidden');
      if (res.isRecord) { celebrate(card); sfx.win(); PP.toast('🎃 New Pumpkin Catch record: ' + score); }
      else sfx.lose();
      if (global.PPmain && global.PPmain.renderBoards) global.PPmain.renderBoards();
    }

    function pointer(e) {
      if (!running) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (W / rect.width);
      const y = (e.clientY - rect.top) * (H / rect.height);

      let hit = -1;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        const dx = x - it.x, dy = y - it.y, rr = it.r * 1.22;
        if (dx * dx + dy * dy <= rr * rr) { hit = i; break; }
      }
      if (hit === -1) return;

      const it = items[hit];
      items.splice(hit, 1);
      chompSeed++;

      if (it.type === 'pumpkin') {
        score += 10;
        pops.push({ x: it.x, y: it.y, txt: '+10', color: '#1B382B', life: .75 });
        burst(it.x, it.y, '#E85D30', 16, 210);
        burst(it.x, it.y, '#FFC24D', 8, 150);
        sfx.good();
        bump(elScore);
      } else {
        score = Math.max(0, score - 20);
        pops.push({ x: it.x, y: it.y, txt: '−20', color: '#E85D30', life: .75 });
        burst(it.x, it.y, '#1B382B', 18, 230);
        sfx.bad();
        shakeT = performance.now();
        wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake');
        setTimeout(() => wrap.classList.remove('shake'), 360);
        bump(elScore);
      }
      elScore.textContent = score;
    }

    /* ---------------- wiring ---------------- */
    canvas.addEventListener('pointerdown', pointer, { passive: false });
    $('#catchStart').addEventListener('click', start);
    $('#catchAgain').addEventListener('click', start);
    $('#catchReset').addEventListener('click', () => {
      stopLoops(); reset();
      overlay.classList.remove('is-hidden'); over.classList.add('is-hidden');
      elBest.textContent = boards.best('catch');
      draw();
      sfx.ui();
    });

    if ('ResizeObserver' in global) new ResizeObserver(resize).observe(wrap);
    else global.addEventListener('resize', resize);

    elBest.textContent = boards.best('catch');
    resize();

    return {
      id: 'catch',
      start, reset, layout: resize,
      pause() { if (running) { suspended = true; global.cancelAnimationFrame(rafId); } },
      resume() { if (running && suspended) { suspended = false; lastT = global.performance.now(); rafId = global.requestAnimationFrame(loop); } }
    };
  }

  /* ==================================================================
     GAME 2 — SPOOKY WHACK-A-MOLE
     ================================================================== */
  function createWhack() {
    const card = $('#card-whack');
    if (!card) return null;

    const wrap = $('#whackWrap'), grid = $('#whackGrid');
    const overlay = $('#whackOverlay'), over = $('#whackOver');
    const elScore = $('[data-stat="score"]', card);
    const elBest  = $('[data-stat="best"]', card);
    const elTime  = $('[data-stat="time"]', card);
    const badge   = $('#whackCombo');

    const FACES = ['🎃', '🎃', '👻', '🎃', '🎃'];
    const ROUND = 30;
    const COMBO_WINDOW = 1.7;

    // combo timer bar (appended once)
    const bar = document.createElement('div');
    bar.className = 'combo-timer';
    bar.innerHTML = '<i></i>';
    bar.style.opacity = '0';
    wrap.appendChild(bar);
    const barFill = bar.firstElementChild;

    const cells = [];
    for (let i = 0; i < 9; i++) {
      const hole = document.createElement('div');
      hole.className = 'hole';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mole';
      btn.setAttribute('aria-label', 'Whack pumpkin ' + (i + 1));
      btn.innerHTML = '<span>' + FACES[i % FACES.length] + '</span>';
      hole.appendChild(btn);
      grid.appendChild(hole);
      cells.push({ el: btn, active: false, hideT: 0 });
    }

    let running = false, suspended = false, score = 0, combo = 0, comboAt = 0;
    let spawnT = 0, rafId = 0, lastT = 0;

    const timer = createTimer(
      s => { elTime.textContent = s; if (s <= 5 && s > 0) sfx.tick(); },
      end
    );

    function multiplier() { return Math.min(5, 1 + Math.floor(combo / 3)); }

    function showBadge(mega) {
      if (combo < 1) { badge.classList.remove('show'); bar.style.opacity = '0'; return; }
      badge.textContent = '×' + multiplier() + ' · ' + combo + ' combo';
      badge.classList.toggle('mega', multiplier() >= 5);
      badge.classList.add('show');
      bar.style.opacity = '1';
      if (mega) {
        badge.style.animation = 'none'; void badge.offsetWidth;
        badge.style.animation = '';
      }
    }

    function breakCombo() {
      combo = 0;
      badge.classList.remove('show');
      bar.style.opacity = '0';
      barFill.style.transform = 'scaleX(0)';
    }

    function hide(cell) {
      if (cell.hideT) { clearTimeout(cell.hideT); cell.hideT = 0; }
      cell.el.classList.remove('up', 'hit');
      cell.active = false;
    }

    function clearAll() {
      cells.forEach(hide);
      if (spawnT) { clearTimeout(spawnT); spawnT = 0; }
    }

    function popUp() {
      if (!running) return;
      const free = cells.filter(c => !c.active);
      if (free.length) {
        const cell = pick(free);
        cell.active = true;
        cell.el.classList.remove('hit');
        cell.el.classList.add('up');
        const life = rand(520, 950) * (1 - Math.min(score / 900, .42));
        cell.hideT = setTimeout(() => {
          if (cell.active && running) {
            cell.el.classList.remove('up');
            cell.active = false;
            if (combo > 0) breakCombo();          // an escaped mole drops your combo
          }
          cell.hideT = 0;
        }, life);
      }
      spawnT = setTimeout(popUp, rand(230, 540) * (1 - Math.min(score / 1400, .42)));
    }

    function loop(t) {
      if (!running || suspended) return;
      const dt = Math.min((t - lastT) / 1000, .05);
      lastT = t;
      timer.tick(dt);
      if (!running) return;

      if (combo > 0) {
        const left = 1 - (global.performance.now() - comboAt) / (COMBO_WINDOW * 1000);
        if (left <= 0) breakCombo();
        else barFill.style.transform = 'scaleX(' + clamp(left, 0, 1) + ')';
      }
      rafId = global.requestAnimationFrame(loop);
    }

    function reset() {
      clearAll(); running = false; suspended = false;
      score = 0; breakCombo();
      global.cancelAnimationFrame(rafId);
      elScore.textContent = '0';
      elTime.textContent = ROUND;
      timer.stop();
    }

    function start() {
      reset();
      running = true;
      overlay.classList.add('is-hidden'); over.classList.add('is-hidden');
      timer.start(ROUND);
      sfx.pop();
      lastT = global.performance.now();
      rafId = global.requestAnimationFrame(loop);
      spawnT = setTimeout(popUp, 300);
    }

    function end() {
      running = false;
      clearAll();
      timer.stop();
      global.cancelAnimationFrame(rafId);
      breakCombo();
      $('#whackFinal').textContent = score;
      const res = boards.add('whack', score);
      elBest.textContent = boards.best('whack');
      $('#whackVerdict').textContent = res.isRecord
        ? '🏆 New personal best!'
        : verdicts(score, [
            { min: 900, text: 'Hammer certified 🔨' },
            { min: 550, text: 'Gourd demolition expert' },
            { min: 260, text: 'A respectable haunting' },
            { min: 1,   text: 'The pumpkins outsmarted you' },
            { min: -1,  text: 'Nine holes, zero whacks' }
          ]);
      over.classList.remove('is-hidden');
      if (res.isRecord) { celebrate(card); sfx.win(); PP.toast('🔨 New Whack-a-Mole record: ' + score); }
      else sfx.lose();
      if (global.PPmain && global.PPmain.renderBoards) global.PPmain.renderBoards();
    }

    /* whack input */
    function splatAt(clientX, clientY) {
      const r = wrap.getBoundingClientRect();
      const s = document.createElement('div');
      s.className = 'splat';
      s.style.left = (clientX - r.left) + 'px';
      s.style.top = (clientY - r.top) + 'px';
      wrap.appendChild(s);
      setTimeout(() => s.remove(), 460);
    }

    grid.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!running) return;
      splatAt(e.clientX, e.clientY);
      const btn = e.target.closest ? e.target.closest('.mole') : null;
      if (!btn) return;
      const cell = cells.find(c => c.el === btn);
      if (!cell || !cell.active) return;

      cell.el.classList.remove('up');
      cell.el.classList.add('hit');
      if (cell.hideT) { clearTimeout(cell.hideT); cell.hideT = 0; }
      cell.active = false;

      combo++;
      comboAt = global.performance.now();
      const mult = multiplier();
      const gained = 10 * mult;
      score += gained;
      elScore.textContent = score;
      showBadge(true);
      if (mult >= 3) sfx.combo(mult); else sfx.whack();

      setTimeout(() => { cell.el.classList.remove('hit'); }, 300);
    }, { passive: false });

    $('#whackStart').addEventListener('click', start);
    $('#whackAgain').addEventListener('click', start);
    $('#whackReset').addEventListener('click', () => {
      reset();
      overlay.classList.remove('is-hidden'); over.classList.add('is-hidden');
      elBest.textContent = boards.best('whack');
      sfx.ui();
    });

    elBest.textContent = boards.best('whack');

    return {
      id: 'whack',
      start, reset, layout: function () {},
      pause() {
        if (!running) return;
        suspended = true;
        global.cancelAnimationFrame(rafId);
        if (spawnT) { clearTimeout(spawnT); spawnT = 0; }
        cells.forEach(c => { if (c.hideT) { clearTimeout(c.hideT); c.hideT = 0; } });
      },
      resume() {
        if (!running || !suspended) return;
        suspended = false;
        lastT = global.performance.now();
        rafId = global.requestAnimationFrame(loop);
        spawnT = setTimeout(popUp, 260);
        cells.forEach(c => { if (c.active) c.hideT = setTimeout(() => { c.active = false; c.el.classList.remove('up'); }, 700); });
      }
    };
  }

  /* ==================================================================
     GAME 3 — PUMPKIN-MAN (Pac-Man style maze)
     ================================================================== */
  function createPacman() {
    const card = $('#card-pacman');
    if (!card) return null;

    const wrap = $('#pacWrap'), canvas = $('#pacCanvas');
    const ctx = canvas.getContext('2d');
    const overlay = $('#pacOverlay'), over = $('#pacOver');
    const elScore = $('[data-stat="score"]', card);
    const elBest  = $('[data-stat="best"]', card);
    const elLevel = $('[data-stat="level"]', card);
    const elLives = $('#pacLives');
    const elPowerFill = $('#pacPowerFill'), elPowerPct = $('#pacPowerPct');

    const W = 19, H = 15;
    const START = { c: 9, r: 13 };
    const GHOST_HOMES = [{ c: 7, r: 7 }, { c: 11, r: 7 }, { c: 9, r: 5 }];
    const DIRS = {
      up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
    };
    const DIR_LIST = [DIRS.up, DIRS.left, DIRS.down, DIRS.right];
    const FRIGHT_TIME = 8;

    // classic wavy ghosts — red, pink, cyan
    const GHOST_DEFS = [
      { type: 'ghost', color: '#E0455F', name: 'Rush' },
      { type: 'ghost', color: '#FF7EB6', name: 'Blush' },
      { type: 'ghost', color: '#3ED6E8', name: 'Chill' }
    ];

    // verified offline with tools/check-maze.js:
    // 160 open cells, 0 dead ends, everything reachable from START
    const MAP = [
      '###################',
      '#o......###......o#',
      '#.###.#.###.#.###.#',
      '#.#...#.....#...#.#',
      '#.#.#.###.#.###.#.#',
      '#.................#',
      '#...#...###...#...#',
      '#...#...###...#...#',
      '#...#...###...#...#',
      '#.................#',
      '#.#.#.###.#.###.#.#',
      '#.#.....#.#.....#.#',
      '#.#.....#.#.....#.#',
      '#.................#',
      '###################'
    ];

    let walls = null, seeds = null, seedsLeft = 0;
    let player = null, ghosts = [];
    let score = 0, lives = 3, level = 1;
    let state = 'idle';           // idle | ready | play | dying | clear | over
    let stateT = 0;
    let frightT = 0, frightChain = 0;
    let invulnT = 0;
    let rafId = 0, lastT = 0, suspended = false, running = false;
    let chomp = 0, chompDir = 1, facing = DIRS.left;
    let seedTotal = 0;
    let powerPct = 0;

    let cw = 0, ch = 0, dpr = 1, cell = 20, ox = 0, oy = 0;
    let wallLayer = null;          // cached neon maze, rebuilt on resize only

    /* ---------------- level layout ---------------- */
    function buildWalls() {
      const g = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        const row = MAP[y] || '';
        for (let x = 0; x < W; x++) g[y * W + x] = row.charAt(x) === '#' ? 1 : 0;
      }
      return g;
    }

    function isWall(x, y) {
      if (x < 0 || y < 0 || x >= W || y >= H) return true;
      return walls[y * W + x] === 1;
    }

    function openNeighbours(c, r) {
      const out = [];
      for (let i = 0; i < DIR_LIST.length; i++) {
        const d = DIR_LIST[i];
        if (!isWall(c + d.x, r + d.y)) out.push(d);
      }
      return out;
    }

    // flood fill from the player start so we only ever place seeds / ghosts
    // on cells that are genuinely reachable
    function reachableCells() {
      const seen = new Uint8Array(W * H);
      const q = [[START.c, START.r]];
      seen[START.r * W + START.c] = 1;
      const out = [];
      while (q.length) {
        const cur = q.shift();
        out.push({ c: cur[0], r: cur[1] });
        const nbrs = openNeighbours(cur[0], cur[1]);
        for (let i = 0; i < nbrs.length; i++) {
          const nx = cur[0] + nbrs[i].x, ny = cur[1] + nbrs[i].y;
          const idx = ny * W + nx;
          if (!seen[idx]) { seen[idx] = 1; q.push([nx, ny]); }
        }
      }
      return { cells: out, seen: seen };
    }

    function plantSeeds() {
      const reach = reachableCells();
      seeds = new Uint8Array(W * H);
      seedsLeft = 0;
      const power = {};
      power['1,1'] = 1;
      power[(W - 2) + ',1'] = 1;
      power['1,' + (H - 2)] = 1;
      power[(W - 2) + ',' + (H - 2)] = 1;
      reach.cells.forEach(p => {
        const key = p.c + ',' + p.r;
        if (p.c === START.c && p.r === START.r) return;
        if (GHOST_HOMES.some(g => g.c === p.c && g.r === p.r)) return;
        const isPower = !!power[key];
        seeds[p.r * W + p.c] = isPower ? 2 : 1;
        seedsLeft++;
      });
      seedTotal = seedsLeft;
      return reach;
    }

    /* ---------------- entities ---------------- */
    function makeEntity(c, r, speed) {
      return {
        col: c, row: r, from: { c: c, r: r }, to: { c: c, r: r },
        t: 1, moving: false, dir: { x: 0, y: 0 }, want: null, speed: speed
      };
    }

    function entityPos(e) {
      if (!e.moving) return { x: e.col, y: e.row };
      return {
        x: e.from.c + (e.to.c - e.from.c) * e.t,
        y: e.from.r + (e.to.r - e.from.r) * e.t
      };
    }

    function advance(e, dt, decide) {
      if (!e.moving) {
        const first = decide(e);
        if (!first) return;
        e.from = { c: e.col, r: e.row };
        e.to = { c: e.col + first.x, r: e.row + first.y };
        e.dir = first; e.moving = true; e.t = 0;
      }
      e.t += e.speed * dt;
      let guard = 0;
      while (e.t >= 1 && guard++ < 6) {
        e.t -= 1;
        e.col = e.to.c; e.row = e.to.r;
        e.moving = false;
        const next = decide(e);
        if (next) {
          e.from = { c: e.col, r: e.row };
          e.to = { c: e.col + next.x, r: e.row + next.y };
          e.dir = next; e.moving = true;
        } else {
          e.from = { c: e.col, r: e.row };
          e.to = { c: e.col, r: e.row };
          break;
        }
      }
    }

    function playerSpeed() { return 6.2; }
    function ghostSpeed(base) { return base + Math.min(level - 1, 6) * .32; }

    function decidePlayer(e) {
      const opts = openNeighbours(e.col, e.row);
      if (!opts.length) return null;
      if (e.want) {
        for (let i = 0; i < opts.length; i++) {
          if (opts[i].x === e.want.x && opts[i].y === e.want.y) return opts[i];
        }
      }
      for (let i = 0; i < opts.length; i++) {
        if (opts[i].x === e.dir.x && opts[i].y === e.dir.y) return opts[i];
      }
      return null;
    }

    function decideGhost(e) {
      const opts = openNeighbours(e.col, e.row);
      if (!opts.length) return null;

      // arrived back home: drop the "eyes" state and rejoin the hunt
      if (e.mode === 'eyes' && e.col === e.home.c && e.row === e.home.r) {
        e.mode = 'normal';
        e.speed = e.baseSpeed * (frightT > 0 ? .78 : 1);
      }

      const revX = -e.dir.x, revY = -e.dir.y;
      let pool = opts.filter(o => !(o.x === revX && o.y === revY));
      if (!pool.length) pool = opts;

      if (e.mode === 'eyes') {
        // head home as fast as possible
        pool.sort((a, b) => dist(e.col + a.x, e.row + a.y, e.home.c, e.home.r) -
                            dist(e.col + b.x, e.row + b.y, e.home.c, e.home.r));
        return pool[0];
      }

      if (frightT > 0) {
        return Math.random() < .78 ? pick(pool) : pool[0];
      }

      const pp = entityPos(player);
      const tx = Math.round(pp.x), ty = Math.round(pp.y);
      pool.sort((a, b) => dist(e.col + a.x, e.row + a.y, tx, ty) -
                          dist(e.col + b.x, e.row + b.y, tx, ty));
      if (Math.random() < .74) return pool[0];
      return pick(pool);
    }

    function dist(x1, y1, x2, y2) { const a = x1 - x2, b = y1 - y2; return a * a + b * b; }

    /* ---------------- sizing ---------------- */
    function resize() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = wrap.clientHeight || Math.round(w * H / W);
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      cw = w; ch = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cell = Math.min(cw / W, ch / H);
      ox = (cw - cell * W) / 2;
      oy = (ch - cell * H) / 2;
      buildWallLayer();
      draw();
    }

    const cx = c => ox + (c + .5) * cell;
    const cy = r => oy + (r + .5) * cell;

    /* ---------------- drawing ---------------- */
    /* Neon maze: rendered once per resize into an offscreen canvas.
       Every wall cell contributes the two offset lines along each edge
       that faces a corridor, which produces a crisp double-line outline. */
    function buildWallLayer() {
      wallLayer = null;
      const cv = document.createElement('canvas');
      cv.width = canvas.width;
      cv.height = canvas.height;
      const g = cv.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      // midnight base + deep indigo wall blocks
      g.fillStyle = '#070A16';
      g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#141A38';
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!isWall(x, y)) continue;
          g.fillRect(ox + x * cell, oy + y * cell, cell + .6, cell + .6);
        }
      }

      const edges = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!isWall(x, y)) continue;
          const px = ox + x * cell, py = oy + y * cell;
          if (!isWall(x, y - 1)) edges.push({ x1: px, y1: py, x2: px + cell, y2: py, nx: 0, ny: 1 });
          if (!isWall(x, y + 1)) edges.push({ x1: px, y1: py + cell, x2: px + cell, y2: py + cell, nx: 0, ny: -1 });
          if (!isWall(x - 1, y)) edges.push({ x1: px, y1: py, x2: px, y2: py + cell, nx: 1, ny: 0 });
          if (!isWall(x + 1, y)) edges.push({ x1: px + cell, y1: py, x2: px + cell, y2: py + cell, nx: -1, ny: 0 });
        }
      }

      const stroke = (off, color, glow) => {
        g.save();
        g.strokeStyle = color;
        g.lineWidth = Math.max(1.3, cell * .062);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.shadowColor = glow;
        g.shadowBlur = cell * .55;
        g.beginPath();
        for (let i = 0; i < edges.length; i++) {
          const e = edges[i];
          const dx = e.nx * off, dy = e.ny * off;
          g.moveTo(e.x1 + dx, e.y1 + dy);
          g.lineTo(e.x2 + dx, e.y2 + dy);
        }
        g.stroke();
        g.restore();
      };

      stroke(cell * .11, '#FFD9A8', '#FF7C3A');   // hot orange inner line
      stroke(cell * .27, '#C9A6FF', '#9B5DE5');   // violet outer line
      wallLayer = cv;
    }

    function drawSeeds(now) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const v = seeds[y * W + x];
          if (!v) continue;
          const px = cx(x), py = cy(y);
          if (v === 1) {
            // floating glowing seed
            const bob = Math.sin(now * 2.4 + x * 1.7 + y * 2.3) * cell * .07;
            const sy = py + bob;
            ctx.fillStyle = 'rgba(255,194,77,.13)';
            ctx.beginPath(); ctx.arc(px, sy, cell * .40, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,194,77,.28)';
            ctx.beginPath(); ctx.arc(px, sy, cell * .21, 0, Math.PI * 2); ctx.fill();
            ctx.save();
            ctx.translate(px, sy);
            ctx.rotate(-.65);
            ctx.fillStyle = '#FFF0C8';
            ctx.beginPath(); ctx.ellipse(0, 0, cell * .09, cell * .13, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          } else {
            drawCandy(px, py, now, x * 1.3 + y * 2.1);
          }
        }
      }
    }

    function drawCandy(px, py, now, seed) {
      const pulse = 1 + Math.sin(now * 4.4 + seed) * .17;
      const r = cell * .30 * pulse;
      ctx.save();
      ctx.translate(px, py);
      ctx.shadowColor = '#FF7C4E';
      ctx.shadowBlur = cell * .85;
      ctx.fillStyle = '#FFC24D';
      ctx.beginPath();
      ctx.moveTo(-r * 1.5, 0); ctx.lineTo(-r * .78, -r * .6); ctx.lineTo(-r * .78, r * .6);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 1.5, 0); ctx.lineTo(r * .78, -r * .6); ctx.lineTo(r * .78, r * .6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#FF8A4C';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,231,184,.85)';
      ctx.beginPath(); ctx.arc(-r * .3, -r * .32, r * .26, 0, Math.PI * 2); ctx.fill();
      // spooky little face
      ctx.fillStyle = '#5B1E0B';
      ctx.beginPath(); ctx.moveTo(-r * .46, -r * .1); ctx.lineTo(-r * .12, -r * .1);
      ctx.lineTo(-r * .29, r * .2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * .46, -r * .1); ctx.lineTo(r * .12, -r * .1);
      ctx.lineTo(r * .29, r * .2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    function roundRectPath(x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    function drawPlayer(x, y, scale) {
      const r = cell * .47 * (scale == null ? 1 : scale);
      const ang = Math.atan2(facing.y, facing.x);
      const open = chomp * .42;          // mouth half-angle, opens toward `facing`

      ctx.save();
      ctx.translate(x, y);

      // warm glow + pumpkin body
      ctx.save();
      ctx.shadowColor = 'rgba(255,140,60,.95)';
      ctx.shadowBlur = cell * .5;
      const grad = ctx.createRadialGradient(-r * .3, -r * .35, r * .12, 0, 0, r);
      grad.addColorStop(0, '#FFA05A');
      grad.addColorStop(.55, '#F5793A');
      grad.addColorStop(1, '#D9501F');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // ribs
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = 'rgba(150,48,14,.32)';
      ctx.lineWidth = Math.max(1, r * .07);
      [-.6, -.22, .22, .6].forEach(o => {
        ctx.beginPath();
        ctx.ellipse(0, 0, r * Math.abs(o), r, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();

      // chomping mouth, cut toward the direction of travel
      ctx.fillStyle = '#070A16';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r + .6, ang - open, ang + open);
      ctx.closePath();
      ctx.fill();

      // stem (always upright)
      ctx.fillStyle = '#3E7A4E';
      roundRectPath(-r * .1, -r * 1.22, r * .2, r * .44, r * .09);
      ctx.fill();

      // carved glowing eyes (always upright, clear of the mouth wedge)
      ctx.save();
      ctx.shadowColor = '#FFC24D';
      ctx.shadowBlur = cell * .32;
      ctx.fillStyle = '#FFDE9B';
      ctx.beginPath();
      ctx.moveTo(-r * .6, -r * .58); ctx.lineTo(-r * .16, -r * .58); ctx.lineTo(-r * .38, -r * .28);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * .6, -r * .58); ctx.lineTo(r * .16, -r * .58); ctx.lineTo(r * .38, -r * .28);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      ctx.restore();
    }

    function drawGhost(x, y, g, now) {
      const r = cell * .45;
      const frightened = g.mode !== 'eyes' && frightT > 0;
      const flash = frightened && frightT < 2 && Math.floor(now * 6) % 2 === 0;

      ctx.save();
      ctx.translate(x, y);

      if (g.mode === 'eyes') {
        drawEyes(r, g.dir, true);
        ctx.restore();
        return;
      }

      const body = frightened ? (flash ? '#3F51C4' : '#2A3486') : g.color;

      ctx.save();
      ctx.shadowColor = body;
      ctx.shadowBlur = frightened ? cell * .45 : cell * .3;

      // dome
      ctx.beginPath();
      ctx.arc(0, -r * .12, r, Math.PI, 0);
      // wavy skirt, undulating over time
      const bottom = r * .92;
      const waves = 4;
      ctx.lineTo(r, bottom);
      for (let i = 0; i < waves; i++) {
        const x0 = r - (i + .5) * (2 * r / waves);
        const x1 = r - (i + 1) * (2 * r / waves);
        const dip = r * (.2 + .17 * (Math.sin(now * 6 + i * 1.6 + (g.phase || 0)) * .5 + .5));
        ctx.quadraticCurveTo(x0, bottom - dip, x1, bottom);
      }
      ctx.closePath();
      ctx.fillStyle = body;
      ctx.fill();
      ctx.restore();

      if (frightened) {
        // dark blue body + flashing eyes
        const eyeCol = flash ? '#FFC24D' : '#FFFFFF';
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(-r * .36, -r * .16, r * .15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(r * .36, -r * .16, r * .15, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = eyeCol;
        ctx.lineWidth = Math.max(1.5, cell * .07);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-r * .5, r * .34);
        ctx.lineTo(-r * .25, r * .16); ctx.lineTo(0, r * .34); ctx.lineTo(r * .25, r * .16); ctx.lineTo(r * .5, r * .34);
        ctx.stroke();
      } else {
        drawEyes(r, g.dir, false);
      }

      ctx.restore();
    }

    function drawEyes(r, dir, big, offsetY) {
      const oy2 = offsetY || -r * .2;
      const rad = big ? r * .34 : r * .28;
      const pr = rad * .52;
      const dx = (dir ? dir.x : 0) * rad * .4;
      const dy = (dir ? dir.y : 0) * rad * .4;
      [-1, 1].forEach(s => {
        const ex = s * r * .4;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.ellipse(ex, oy2, rad, rad * 1.1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1B382B';
        ctx.beginPath(); ctx.arc(ex + dx, oy2 + dy, pr, 0, Math.PI * 2); ctx.fill();
      });
    }

    function drawCenterText(text, sub) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(7,10,22,.8)';
      ctx.fillRect(0, ch * .42, cw, sub ? ch * .2 : ch * .14);
      ctx.fillStyle = '#FFC24D';
      ctx.font = '800 ' + Math.round(cell * .95) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(text, cw / 2, ch * .42 + cell * 1.25);
      if (sub) {
        ctx.fillStyle = '#C9A6FF';
        ctx.font = '700 ' + Math.round(cell * .55) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText(sub, cw / 2, ch * .42 + cell * 2.15);
      }
      ctx.restore();
    }

    function draw() {
      if (!cw) return;
      const now = global.performance.now() / 1000;

      if (wallLayer) ctx.drawImage(wallLayer, 0, 0, cw, ch);
      else { ctx.fillStyle = '#070A16'; ctx.fillRect(0, 0, cw, ch); }
      drawSeeds(now);

      const p = entityPos(player);
      let pScale = 1;
      if (state === 'dying') {
        const k = clamp(stateT / 1.35, 0, 1);
        pScale = 1 - k;
        ctx.save();
        ctx.globalAlpha = clamp(1 - k * .9, .1, 1);
      }

      drawPlayer(cx(p.x), cy(p.y), pScale);
      if (state === 'dying') ctx.restore();

      ghosts.forEach(g => {
        const gp = entityPos(g);
        const blink = invulnT > 0 && Math.floor(now * 8) % 2 === 0;
        if (blink && state === 'play') return;
        drawGhost(cx(gp.x), cy(gp.y), g, now);
      });

      if (state === 'ready') drawCenterText('READY!', 'Level ' + level);
      else if (state === 'clear') drawCenterText('MAZE CLEAR!', '+1 life bonus next level');
      else if (state === 'over') drawCenterText('GAME OVER', 'Press start to try again');
    }

    /* ---------------- HUD ---------------- */
    function renderHud() {
      elScore.textContent = score;
      elLevel.textContent = level;
      let html = '';
      for (let i = 0; i < 3; i++) html += '<span class="' + (i < lives ? '' : 'lost') + '">🎃</span>';
      elLives.innerHTML = html;
      elPowerFill.style.width = (powerPct * 100).toFixed(1) + '%';
      elPowerPct.textContent = frightT > 0 ? Math.ceil(frightT) + 's' : '—';
    }

    /* ---------------- flow ---------------- */
    function resetEntities() {
      player = makeEntity(START.c, START.r, playerSpeed());
      player.want = null;
      facing = DIRS.left;
      ghosts = GHOST_DEFS.map((def, i) => {
        const home = GHOST_HOMES[i % GHOST_HOMES.length];
        const baseSpeed = ghostSpeed(4.4 + i * .35);
        const g = makeEntity(home.c, home.r, baseSpeed);
        g.baseSpeed = baseSpeed;
        g.mode = 'normal';
        g.home = home;
        g.def = def;
        g.type = def.type;
        g.color = def.color;
        g.phase = i * 2.1;
        g.dir = DIRS.left;
        return g;
      });
      frightT = 0; frightChain = 0; invulnT = 2.2; powerPct = 0;
      chomp = .3;
    }

    function setState(next, secs) {
      state = next;
      stateT = secs || 0;
    }

    function hardReset() {
      walls = buildWalls();
      score = 0; lives = 3; level = 1;
      plantSeeds();
      resetEntities();
      setState('idle', 0);
      elBest.textContent = boards.best('pacman');
      renderHud();
    }

    function start() {
      walls = buildWalls();
      score = 0; lives = 3; level = 1;
      plantSeeds();
      resetEntities();
      running = true; suspended = false;
      overlay.classList.add('is-hidden'); over.classList.add('is-hidden');
      setState('ready', 1.4);
      sfx.ready();
      renderHud();
      lastT = global.performance.now();
      global.cancelAnimationFrame(rafId);
      rafId = global.requestAnimationFrame(loop);
    }

    function stopLoops() {
      running = false; suspended = false;
      global.cancelAnimationFrame(rafId);
    }

    function gameOver() {
      stopLoops();
      setState('over', 0);
      $('#pacFinal').textContent = score;
      const res = boards.add('pacman', score);
      elBest.textContent = boards.best('pacman');
      $('#pacVerdict').textContent = res.isRecord
        ? '🏆 New personal best!'
        : verdicts(score, [
            { min: 4000, text: 'Maze wizard. Absolute menace.' },
            { min: 2000, text: 'Respectable seed consumption' },
            { min: 700,  text: 'You met the ghosts. Briefly.' },
            { min: 1,    text: 'The thesis caught up with you' },
            { min: -1,   text: 'You spawned and immediately regretted it' }
          ]);
      over.classList.remove('is-hidden');
      draw();
      if (res.isRecord) { celebrate(card); sfx.win(); PP.toast('👾 New Pumpkin-Man record: ' + score); }
      else sfx.lose();
      if (global.PPmain && global.PPmain.renderBoards) global.PPmain.renderBoards();
    }

    function nextLevel() {
      level++;
      plantSeeds();
      resetEntities();
      setState('ready', 1.3);
      sfx.level();
      renderHud();
    }

    function die() {
      setState('dying', 1.35);
      sfx.death();
      breakComboPac();
    }

    function breakComboPac() { frightChain = 0; }

    function respawnAfterDeath() {
      lives--;
      renderHud();
      if (lives <= 0) { gameOver(); return; }
      resetEntities();
      setState('ready', 1.1);
      sfx.ready();
      renderHud();
    }

    function eatSeed() {
      const v = seeds[player.row * W + player.col];
      if (!v) return;
      seeds[player.row * W + player.col] = 0;
      seedsLeft--;

      if (v === 1) {
        score += 10;
        chompDir = 1;
        sfx.chomp(Math.floor(score / 10));
      } else {
        score += 50;
        frightT = Math.max(4, FRIGHT_TIME - (level - 1) * .6);
        frightChain = 0;
        ghosts.forEach(g => { if (g.mode === 'normal') g.speed = g.baseSpeed * .78; });
        sfx.power();
        PP.burstAt(.5, .5);
      }
      renderHud();

      if (seedsLeft <= 0) {
        setState('clear', 1.7);
        sfx.level();
        PP.celebrate(wrap);
      }
    }

    function checkCollisions() {
      if (state !== 'play') return;
      const p = entityPos(player);
      for (let i = 0; i < ghosts.length; i++) {
        const g = ghosts[i];
        if (g.mode === 'eyes') continue;
        const gp = entityPos(g);
        if (dist(p.x, p.y, gp.x, gp.y) > .58 * .58) continue;

        if (frightT > 0) {
          frightChain++;
          const gained = 200 * Math.pow(2, Math.min(frightChain - 1, 3));
          score += gained;
          g.mode = 'eyes';
          g.speed = 12;
          sfx.eatGhost();
          PP.toast('👻 + ' + gained + ' chomped ' + g.def.name);
          renderHud();
        } else if (invulnT <= 0) {
          die();
          return;
        }
      }
    }

    /* ---------------- loop ---------------- */
    function loop(t) {
      if (!running || suspended) return;
      const dt = Math.min((t - lastT) / 1000, .05);
      lastT = t;

      if (stateT > 0) {
        stateT -= dt;
        if (stateT <= 0) {
          if (state === 'ready') setState('play', 0);
          else if (state === 'clear') nextLevel();
          else if (state === 'dying') { respawnAfterDeath(); }
        }
      }

      if (state === 'play' || state === 'ready') {
        if (state === 'play' && invulnT > 0) invulnT = Math.max(0, invulnT - dt);
        if (frightT > 0) {
          frightT = Math.max(0, frightT - dt);
          if (frightT === 0) {
            ghosts.forEach(g => { if (g.mode === 'normal') g.speed = g.baseSpeed; });
            frightChain = 0;
          }
        }
        powerPct = frightT > 0 ? frightT / FRIGHT_TIME : 0;

        // player
        player.speed = playerSpeed();
        const beforeC = player.col, beforeR = player.row;
        advance(player, dt, decidePlayer);
        if (state === 'play' && (player.col !== beforeC || player.row !== beforeR)) eatSeed();

        // chomp animation
        if (player.moving) {
          chomp += chompDir * dt * 7;
          if (chomp > 1) { chomp = 1; chompDir = -1; }
          if (chomp < .05) { chomp = .05; chompDir = 1; }
          if (player.dir.x || player.dir.y) facing = player.dir;
        }

        // ghosts
        if (state === 'play') {
          ghosts.forEach(g => advance(g, dt, decideGhost));
          checkCollisions();
        }
      } else if (state === 'dying') {
        chomp += chompDir * dt * 3;
      }

      elPowerFill.style.width = (powerPct * 100).toFixed(1) + '%';
      elPowerPct.textContent = frightT > 0 ? Math.ceil(frightT) + 's' : '—';

      draw();
      rafId = global.requestAnimationFrame(loop);
    }

    /* ---------------- input ---------------- */
    function setWant(name) {
      const d = DIRS[name];
      if (!d || !player) return;
      player.want = d;
      if (!running && state === 'idle') { /* queue only */ }
    }

    const KEY_MAP = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right'
    };

    function onKey(e) {
      if (PP.router.current() !== 'games') return;
      const dir = KEY_MAP[e.key];
      if (!dir) return;
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      e.preventDefault();
      setWant(dir);
    }
    global.addEventListener('keydown', onKey, { passive: false });

    $('#pacStart').addEventListener('click', start);
    $('#pacStartSide').addEventListener('click', start);
    $('#pacAgain').addEventListener('click', start);
    $('#pacReset').addEventListener('click', () => {
      stopLoops();
      hardReset();
      overlay.classList.remove('is-hidden'); over.classList.add('is-hidden');
      setState('idle', 0);
      draw();
      sfx.ui();
    });

    if ('ResizeObserver' in global) new ResizeObserver(resize).observe(wrap);
    else global.addEventListener('resize', resize);

    hardReset();
    resize();

    return {
      id: 'pacman',
      start, reset: hardReset, layout: resize,
      /* read-only state dump — handy for debugging and automated tests */
      snapshot() {
        return {
          state: state, score: score, lives: lives, level: level,
          seedsLeft: seedsLeft, frightT: frightT, invulnT: invulnT,
          player: { c: player.col, r: player.row },
          pos: entityPos(player),
          walls: Array.from(walls),
          seeds: Array.from(seeds),
          ghosts: ghosts.map(g => ({ c: g.col, r: g.row, mode: g.mode, pos: entityPos(g) }))
        };
      },
      pause() { if (running) { suspended = true; global.cancelAnimationFrame(rafId); } },
      resume() { if (running && suspended) { suspended = false; lastT = global.performance.now(); rafId = global.requestAnimationFrame(loop); } }
    };
  }

  /* ==================================================================
     GAME 3 — FLAPPY PUMPKIN
     ================================================================== */
  function createFlappy() {
    const card = $('#card-flappy');
    if (!card) return null;

    const wrap = $('#flapWrap'), canvas = $('#flapCanvas');
    const ctx = canvas.getContext('2d');
    const overlay = $('#flapOverlay'), over = $('#flapOver');
    const elScore = $('[data-stat="score"]', card);
    const elBest  = $('[data-stat="best"]', card);
    const elFlaps = $('[data-stat="flaps"]', card);

    let W = 320, H = 240, dpr = 1, groundH = 22;
    let running = false, suspended = false, state = 'ready';
    let score = 0, flaps = 0, readyT = 0, spawnT = 0, clock = 0;
    let bird = null, obstacles = [], parts = [], pops = [], stars = [];
    let rafId = 0, lastT = 0;

    // physics — derived from the canvas box on every resize.
    // Gravity is deliberately light (~46% of a "normal" arcade pull) so the
    // pumpkin drifts down instead of plummeting, and each hop stays gentle.
    let GRAV = 1750, FLAP = -330, SPEED = 150, GAP = 150, O_W = 62;

    /* ---------------- sizing ---------------- */
    function resize() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = wrap.clientHeight || Math.round(w * .75);
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      W = w; H = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      groundH = Math.max(16, H * .09);
      GRAV = H * 3.9;                           // ~46% gentler fall
      // flap impulse cut ~37% (0.30 → 0.12 apex factor): a subtle, controllable
      // hop that peaks around 12% of the play height instead of launching.
      FLAP = -Math.sqrt(2 * GRAV * H * .12);
      SPEED = clamp(W * .26, 100, 185);         // relaxed, readable scroll
      GAP = clamp(H * .33, 108, 195);
      O_W = clamp(W * .17, 46, 78);

      stars = [];
      for (let i = 0; i < 46; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H * .92, r: rand(.6, 1.8), p: rand(0, 6.3) });
      }
      draw();
    }

    const groundY = () => H - groundH;
    const birdR = () => clamp(H * .062, 13, 26);
    const spawnGap = () => clamp(W * .5, 140, 240) / SPEED;

    function bump(el) {
      if (!el) return;
      const host = el.parentElement;
      host.classList.remove('is-bumped');
      void host.offsetWidth;
      host.classList.add('is-bumped');
      setTimeout(() => host.classList.remove('is-bumped'), 420);
    }

    function rr(x, y, w, h, r) {
      const rad = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    }

    /* ---------------- obstacles ---------------- */
    function spawnObstacle() {
      const half = GAP / 2;
      const min = half + 12;
      const max = groundY() - half - 12;
      obstacles.push({
        x: W + O_W,
        gapY: rand(Math.min(min, max), Math.max(min, max)),
        passed: false,
        type: Math.random() < .5 ? 'book' : 'vine',
        seed: Math.floor(rand(0, 4))
      });
    }

    function drawBookColumn(o, y, h, fromTop) {
      if (h <= 4) return;
      const colors = ['#8A4A3B', '#3F6FA8', '#7A4A8A', '#4E8A5A', '#B0603A'];
      const bands = Math.max(1, Math.round(h / Math.max(18, H * .1)));
      const bh = h / bands;
      for (let i = 0; i < bands; i++) {
        const by = y + i * bh;
        ctx.fillStyle = colors[(i + o.seed) % colors.length];
        rr(o.x, by + 1, O_W, Math.max(3, bh - 2), 4); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.14)';
        ctx.fillRect(o.x + 4, by + 3, 3, Math.max(2, bh - 6));
        // page block on the gap side of the stack
        ctx.fillStyle = 'rgba(255,253,245,.92)';
        const py = fromTop ? by + bh - 5 : by + 2;
        ctx.fillRect(o.x + O_W * .2, py, O_W * .6, 3);
      }
      // bookend plank facing the gap
      const capH = Math.max(7, H * .036);
      const capY = fromTop ? y + h - capH : y;
      ctx.fillStyle = '#F4E9D4';
      rr(o.x - 5, capY, O_W + 10, capH, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(27,56,43,.4)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    function drawVineColumn(o, y, h, fromTop) {
      if (h <= 4) return;
      ctx.fillStyle = '#2C6B39';
      rr(o.x, y, O_W, h, 9); ctx.fill();
      ctx.fillStyle = '#3E8C4C';
      rr(o.x + O_W * .16, y, O_W * .36, h, 7); ctx.fill();

      const leaves = Math.max(1, Math.floor(h / Math.max(24, H * .13)));
      for (let i = 0; i < leaves; i++) {
        const ly = y + (i + .55) * (h / leaves);
        const side = (i + o.seed) % 2 ? 1 : -1;
        const lx = side > 0 ? o.x + O_W * .8 : o.x + O_W * .2;
        ctx.fillStyle = (i + o.seed) % 3 ? '#57B85F' : '#79D67A';
        ctx.beginPath();
        ctx.ellipse(lx, ly, O_W * .2, O_W * .11, side * .55, 0, Math.PI * 2);
        ctx.fill();
      }

      // leafy knob on the gap end
      const capY = fromTop ? y + h : y;
      ctx.fillStyle = '#6ECF6E';
      ctx.beginPath();
      ctx.ellipse(o.x + O_W / 2, capY + (fromTop ? -3 : 3), O_W * .4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawObstacle(o) {
      const topEnd = o.gapY - GAP / 2;
      const botStart = o.gapY + GAP / 2;
      if (o.type === 'book') {
        drawBookColumn(o, 0, topEnd, true);
        drawBookColumn(o, botStart, groundY() - botStart, false);
      } else {
        drawVineColumn(o, 0, topEnd, true);
        drawVineColumn(o, botStart, groundY() - botStart, false);
      }
    }

    function circleRect(bx, by, rad, rx, ry, rw, rh) {
      const nx = clamp(bx, rx, rx + rw);
      const ny = clamp(by, ry, ry + rh);
      const dx = bx - nx, dy = by - ny;
      return dx * dx + dy * dy <= rad * rad;
    }

    function hitsObstacle(bx, by, rad) {
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (bx + rad < o.x || bx - rad > o.x + O_W) continue;
        const topEnd = o.gapY - GAP / 2;
        const botStart = o.gapY + GAP / 2;
        if (circleRect(bx, by, rad, o.x, 0, O_W, topEnd)) return true;
        if (circleRect(bx, by, rad, o.x, botStart, O_W, groundY() - botStart)) return true;
      }
      return false;
    }

    /* ---------------- drawing ---------------- */
    function drawBird(x, y, rot) {
      const r = birdR();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);

      ctx.save();
      ctx.shadowColor = 'rgba(255,140,60,.95)';
      ctx.shadowBlur = r * .9;
      const grad = ctx.createRadialGradient(-r * .3, -r * .35, r * .12, 0, 0, r);
      grad.addColorStop(0, '#FFA05A');
      grad.addColorStop(.55, '#F5793A');
      grad.addColorStop(1, '#D9501F');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = 'rgba(150,48,14,.3)';
      ctx.lineWidth = Math.max(1, r * .08);
      [-.55, .55].forEach(o => {
        ctx.beginPath(); ctx.ellipse(0, 0, r * Math.abs(o), r, 0, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.restore();

      ctx.fillStyle = '#3E7A4E';
      rr(-r * .1, -r * 1.24, r * .2, r * .44, r * .09); ctx.fill();

      ctx.fillStyle = '#FFDE9B';
      ctx.beginPath();
      ctx.moveTo(-r * .6, -r * .36); ctx.lineTo(-r * .18, -r * .36); ctx.lineTo(-r * .39, -.04 * r);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * .6, -r * .36); ctx.lineTo(r * .18, -r * .36); ctx.lineTo(r * .39, -.04 * r);
      ctx.closePath(); ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-r * .52, r * .18);
      ctx.lineTo(-r * .3, r * .44); ctx.lineTo(-r * .1, r * .2);
      ctx.lineTo(r * .1, r * .44); ctx.lineTo(r * .3, r * .2);
      ctx.lineTo(r * .52, r * .44); ctx.lineTo(r * .52, r * .14);
      ctx.lineTo(-r * .52, r * .14);
      ctx.closePath(); ctx.fill();

      ctx.restore();
    }

    function drawGround() {
      const gy = groundY();
      ctx.fillStyle = '#161232';
      ctx.fillRect(0, gy, W, H - gy);
      ctx.fillStyle = '#2A2456';
      ctx.fillRect(0, gy, W, 3);
      ctx.fillStyle = '#3E8C4C';
      for (let x = -4; x < W; x += 15) {
        ctx.beginPath();
        ctx.moveTo(x, gy + 1); ctx.lineTo(x + 5, gy - 6); ctx.lineTo(x + 10, gy + 1);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#E85D30';
      for (let x = 18; x < W; x += 74) {
        ctx.beginPath(); ctx.ellipse(x, gy + groundH * .55, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
      }
    }

    function draw() {
      if (!W || !bird) return;

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0A0E20');
      bg.addColorStop(.74, '#131A3E');
      bg.addColorStop(1, '#1B2452');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // twinkling stars
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        ctx.globalAlpha = .35 + .45 * (Math.sin(clock * 1.6 + s.p) * .5 + .5);
        ctx.fillStyle = '#FFEFC4';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      obstacles.forEach(drawObstacle);
      drawGround();

      parts.forEach(p => {
        ctx.save();
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      pops.forEach(p => {
        ctx.save();
        ctx.globalAlpha = clamp(p.life / .7, 0, 1);
        ctx.font = '800 20px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(10,14,32,.85)';
        ctx.strokeText(p.txt, p.x, p.y);
        ctx.fillStyle = '#FFC24D';
        ctx.fillText(p.txt, p.x, p.y);
        ctx.restore();
      });

      drawBird(bird.x, bird.y, bird.rot);

      if (state === 'ready' && running) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '800 ' + Math.max(13, Math.round(H * .06)) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(237,233,255,.92)';
        ctx.fillText('SPACE or CLICK to flap', W / 2, H * .18);
        ctx.restore();
      }
    }

    /* ---------------- loop ---------------- */
    function loop(t) {
      if (!running || suspended) return;
      const dt = Math.min((t - lastT) / 1000, .05);
      lastT = t;
      clock += dt;

      const br = birdR();

      if (state === 'ready') {
        readyT -= dt;
        bird.y = H * .44 + Math.sin(clock * 4.2) * H * .035;
        bird.vy = 0;
        bird.rot = Math.sin(clock * 4.2) * .12;
        if (readyT <= 0) state = 'play';
      } else {
        bird.vy += GRAV * dt;
        bird.y += bird.vy * dt;
        bird.rot = clamp(bird.vy / 700, -.5, 1.05);

        if (bird.y < br) { bird.y = br; if (bird.vy < 0) bird.vy = 0; }

        spawnT -= dt;
        if (spawnT <= 0) { spawnObstacle(); spawnT = spawnGap(); }

        for (let i = obstacles.length - 1; i >= 0; i--) {
          const o = obstacles[i];
          o.x -= SPEED * dt;
          if (!o.passed && o.x + O_W * .5 < bird.x - br) {
            o.passed = true;
            score++;
            elScore.textContent = score;
            pops.push({ x: bird.x + br + 6, y: bird.y - br - 4, txt: '+1', life: .7 });
            sfx.coin();
            bump(elScore);
          }
          if (o.x + O_W < -40) obstacles.splice(i, 1);
        }

        if (hitsObstacle(bird.x, bird.y, br) || bird.y + br >= groundY()) { crash(); return; }
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 260 * dt;
        if (p.life <= 0) parts.splice(i, 1);
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.life -= dt; p.y -= 34 * dt;
        if (p.life <= 0) pops.splice(i, 1);
      }

      draw();
      rafId = global.requestAnimationFrame(loop);
    }

    /* ---------------- flow ---------------- */
    function reset() {
      score = 0; flaps = 0; spawnT = 0; clock = 0;
      obstacles = []; parts = []; pops = [];
      bird = { x: W * .3, y: H * .45, vy: 0, rot: 0 };
      state = 'ready'; readyT = .9;
      elScore.textContent = '0';
      elFlaps.textContent = '0';
    }

    function start() {
      resize(); reset();
      running = true; suspended = false;
      overlay.classList.add('is-hidden'); over.classList.add('is-hidden');
      sfx.pop();
      lastT = global.performance.now();
      global.cancelAnimationFrame(rafId);
      rafId = global.requestAnimationFrame(loop);
    }

    function stopLoops() {
      running = false; suspended = false;
      global.cancelAnimationFrame(rafId);
    }

    function crash() {
      for (let i = 0; i < 22; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(50, 240);
        parts.push({
          x: bird.x, y: bird.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
          life: rand(.4, .9), max: .9, r: rand(2, 5),
          color: pick(['#E85D30', '#FFC24D', '#FF7C4E', '#57B85F'])
        });
      }
      wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake');
      setTimeout(() => wrap.classList.remove('shake'), 380);
      sfx.crash();
      draw();
      end();
    }

    function end() {
      stopLoops();
      state = 'over';
      $('#flapFinal').textContent = score;
      const res = boards.add('flappy', score);
      elBest.textContent = boards.best('flappy');
      $('#flapVerdict').textContent = res.isRecord
        ? '🏆 New personal best!'
        : verdicts(score, [
            { min: 40, text: 'Certified air pumpkin 🍂' },
            { min: 25, text: 'Vine-swinging prodigy' },
            { min: 12, text: 'Respectable hovering' },
            { min: 1,  text: 'The homework won this round' },
            { min: -1, text: 'You never really left the ground' }
          ]);
      over.classList.remove('is-hidden');
      if (res.isRecord) { celebrate(card); sfx.win(); PP.toast('🍂 New Flappy Pumpkin record: ' + score); }
      else sfx.lose();
      if (global.PPmain && global.PPmain.renderBoards) global.PPmain.renderBoards();
    }

    function flap() {
      if (!running) return;
      if (state === 'ready') state = 'play';
      if (state !== 'play') return;
      bird.vy = FLAP;
      flaps++;
      elFlaps.textContent = flaps;
      sfx.flap();
      for (let i = 0; i < 5; i++) {
        parts.push({
          x: bird.x - birdR() * .7, y: bird.y + birdR() * .5,
          vx: rand(-80, -22), vy: rand(-34, 44),
          life: rand(.3, .55), max: .55, r: rand(1.6, 3.6),
          color: pick(['#57B85F', '#79D67A', '#FFC24D'])
        });
      }
    }

    /* ---------------- input ---------------- */
    wrap.addEventListener('pointerdown', e => {
      if (!running) return;
      e.preventDefault();
      flap();
    }, { passive: false });

    function onKey(e) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (PP.router.current() !== 'games') return;
      const tag = e.target && e.target.tagName;
      if (tag && /^(INPUT|TEXTAREA)$/.test(tag)) return;
      if (!running) return;
      e.preventDefault();
      flap();
    }
    global.addEventListener('keydown', onKey, { passive: false });

    $('#flapStart').addEventListener('click', start);
    $('#flapAgain').addEventListener('click', start);
    $('#flapReset').addEventListener('click', () => {
      stopLoops();
      reset();
      state = 'idle';
      overlay.classList.remove('is-hidden'); over.classList.add('is-hidden');
      elBest.textContent = boards.best('flappy');
      draw();
      sfx.ui();
    });

    if ('ResizeObserver' in global) new ResizeObserver(resize).observe(wrap);
    else global.addEventListener('resize', resize);

    elBest.textContent = boards.best('flappy');
    resize();
    reset();
    draw();

    return {
      id: 'flappy',
      start, reset, layout: resize,
      pause() { if (running) { suspended = true; global.cancelAnimationFrame(rafId); } },
      resume() { if (running && suspended) { suspended = false; lastT = global.performance.now(); rafId = global.requestAnimationFrame(loop); } }
    };
  }

  /* ==================================================================
     registry
     ================================================================== */
  const registry = { catch: null, whack: null, flappy: null, pacman: null };
  let resizeBound = false;

  function boot() {
    registry.catch = createCatch();
    registry.whack = createWhack();
    registry.flappy = createFlappy();
    registry.pacman = createPacman();

    // ResizeObserver handles most cases, but a hidden view (display:none)
    // can miss its callback entirely — re-run the layout pass explicitly
    // whenever the arcade is shown or the window changes size.
    if (!resizeBound) {
      resizeBound = true;
      let rt = 0;
      global.addEventListener('resize', () => {
        clearTimeout(rt);
        rt = setTimeout(layoutAll, 90);
      }, { passive: true });
      if (global.visualViewport) {
        global.visualViewport.addEventListener('resize', layoutAll, { passive: true });
      }
    }
  }

  function layoutAll() { Object.keys(registry).forEach(k => registry[k] && registry[k].layout()); }

  PP.games = {
    boot,
    layoutAll,
    get(id) { return registry[id]; },
    pauseAll() { Object.keys(registry).forEach(k => registry[k] && registry[k].pause()); },
    resumeAll() { Object.keys(registry).forEach(k => registry[k] && registry[k].resume()); },
    resetAll() { Object.keys(registry).forEach(k => registry[k] && registry[k].reset()); }
  };
})(window);
