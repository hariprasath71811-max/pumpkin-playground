/* =========================================================================
   Pumpkin Playground — core.js
   Shared toolkit: dom, storage, boards, Web Audio SFX, confetti, toast,
   hash router. Nothing in here touches the DOM before main.js boots it.
   ========================================================================= */
(function (global) {
  'use strict';

  /* ------------------------------ dom utils ------------------------------ */
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand  = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
  const REDUCED = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COARSE  = global.matchMedia && global.matchMedia('(hover: none)').matches;

  /* ------------------------------ storage ------------------------------ */
  const store = {
    num(key, fallback) {
      const raw = global.localStorage.getItem(key);
      const n = parseInt(raw == null ? '' : raw, 10);
      return Number.isFinite(n) ? n : (fallback || 0);
    },
    setNum(key, v) { try { global.localStorage.setItem(key, String(v)); } catch (e) {} },
    str(key, fallback) {
      const v = global.localStorage.getItem(key);
      return v === null ? fallback : v;
    },
    setStr(key, v) { try { global.localStorage.setItem(key, v); } catch (e) {} },
    json(key, fallback) {
      try {
        const v = JSON.parse(global.localStorage.getItem(key));
        return Array.isArray(v) ? v : fallback;
      } catch (e) { return fallback; }
    },
    setJson(key, v) { try { global.localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} },
    clearPrefix(prefix) {
      try {
        Object.keys(global.localStorage)
          .filter(k => k.indexOf(prefix) === 0)
          .forEach(k => global.localStorage.removeItem(k));
      } catch (e) {}
    }
  };

  /* ------------------------------ hall of fame ------------------------------ */
  const BOARD_KEYS = {
    catch: 'pp_board_catch',
    whack: 'pp_board_whack',
    flappy: 'pp_board_flappy',
    pacman: 'pp_board_pacman'
  };

  const boards = {
    games: Object.keys(BOARD_KEYS),
    name() { return (store.str('pp_name', '') || '').trim() || 'Anonymous Goblin'; },
    setName(n) { store.setStr('pp_name', (n || '').trim().slice(0, 18)); },
    list(game) { return store.json(BOARD_KEYS[game], []); },
    best(game) { const l = boards.list(game); return l.length ? l[0].s : 0; },
    add(game, score) {
      if (!BOARD_KEYS[game] || !(score > 0)) return { isRecord: false, rank: -1, list: boards.list(game) };
      const prevBest = boards.best(game);
      const entry = { s: Math.round(score), n: boards.name(), d: Date.now() };
      const list = boards.list(game);
      list.push(entry);
      list.sort((a, b) => b.s - a.s);
      const trimmed = list.slice(0, 5);
      store.setJson(BOARD_KEYS[game], trimmed);
      const rank = trimmed.indexOf(entry);
      return { isRecord: entry.s > prevBest, rank: rank, list: trimmed };
    },
    clear() { boards.games.forEach(g => store.setJson(BOARD_KEYS[g], [])); }
  };

  /* ------------------------------ web audio sfx ------------------------------ */
  let audioCtx = null;
  let muted = store.str('pp_muted', '0') === '1';

  function ac() {
    if (!audioCtx) {
      try { audioCtx = new (global.AudioContext || global.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} }
    return audioCtx;
  }

  function tone(opts) {
    if (muted) return;
    const c = ac(); if (!c) return;
    const o = {
      freq: 440, to: 0, dur: .1, type: 'sine', vol: .13, delay: 0
    };
    for (const k in opts) o[k] = opts[k];
    try {
      const t0 = c.currentTime + o.delay;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = o.type;
      osc.frequency.setValueAtTime(o.freq, t0);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + o.dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(o.vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(t0); osc.stop(t0 + o.dur + 0.05);
    } catch (e) {}
  }

  function noise(dur, vol, delay) {
    if (muted) return;
    const c = ac(); if (!c) return;
    try {
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource(); src.buffer = buf;
      const g = c.createGain(); g.gain.value = vol || .1;
      const t0 = c.currentTime + (delay || 0);
      g.gain.setValueAtTime(vol || .1, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(g); g.connect(c.destination); src.start(t0);
    } catch (e) {}
  }

  const sfx = {
    ui:      () => tone({ freq: 520, to: 700, dur: .08, type: 'triangle', vol: .1 }),
    pop:     () => { tone({ freq: 620, to: 980, dur: .1, type: 'triangle', vol: .15 }); },
    coin:    () => { tone({ freq: 780, dur: .06, type: 'square', vol: .09 }); tone({ freq: 1180, dur: .12, type: 'square', vol: .08, delay: .06 }); },
    good:    () => tone({ freq: 540, to: 820, dur: .09, type: 'square', vol: .1 }),
    bad:     () => tone({ freq: 210, to: 85, dur: .19, type: 'sawtooth', vol: .13 }),
    whack:   () => { noise(.07, .16); tone({ freq: 150, to: 60, dur: .08, type: 'square', vol: .14 }); },
    combo:   (n) => tone({ freq: 500 + n * 110, to: 900 + n * 130, dur: .1, type: 'triangle', vol: .13 }),
    tick:    () => tone({ freq: 460, dur: .05, type: 'sine', vol: .08 }),
    win:     () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: .17, type: 'triangle', vol: .13, delay: i * .095 })),
    lose:    () => [440, 370, 294, 220].forEach((f, i) => tone({ freq: f, dur: .2, type: 'sine', vol: .12, delay: i * .11 })),
    chomp:   (i) => tone({ freq: i % 2 ? 260 : 340, to: i % 2 ? 340 : 260, dur: .06, type: 'square', vol: .07 }),
    power:   () => { tone({ freq: 300, to: 1200, dur: .32, type: 'sawtooth', vol: .11 }); tone({ freq: 150, to: 900, dur: .34, type: 'square', vol: .07, delay: .04 }); },
    eatGhost:() => { tone({ freq: 900, to: 240, dur: .22, type: 'square', vol: .12 }); tone({ freq: 1200, to: 400, dur: .2, type: 'triangle', vol: .09, delay: .05 }); },
    death:   () => { tone({ freq: 700, to: 90, dur: .7, type: 'sawtooth', vol: .14 }); noise(.5, .06, .1); },
    ready:   () => { tone({ freq: 880, dur: .1, type: 'sine', vol: .11 }); tone({ freq: 660, dur: .12, type: 'sine', vol: .1, delay: .12 }); },
    flap:    () => tone({ freq: 460, to: 780, dur: .08, type: 'triangle', vol: .11 }),
    crash:   () => { noise(.3, .17); tone({ freq: 190, to: 55, dur: .38, type: 'sawtooth', vol: .15 }); },
    level:   () => [660, 880, 1100, 880, 1320].forEach((f, i) => tone({ freq: f, dur: .13, type: 'triangle', vol: .12, delay: i * .085 }))
  };

  const mute = {
    get() { return muted; },
    set(v) { muted = !!v; store.setStr('pp_muted', muted ? '1' : '0'); mute.render(); if (!muted) sfx.ui(); },
    toggle() { mute.set(!muted); },
    render() {
      $$('#muteBtn, #muteIcon, #muteIcon2, #muteLabel2').forEach(el => {
        if (el.id === 'muteIcon' || el.id === 'muteIcon2') el.textContent = muted ? '🔇' : '🔊';
        if (el.id === 'muteLabel2') el.textContent = muted ? 'Sound off' : 'Sound on';
      });
      const btn = $('#muteBtn');
      if (btn) {
        btn.setAttribute('aria-pressed', String(muted));
        btn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
        btn.title = muted ? 'Unmute' : 'Mute';
      }
    }
  };

  /* ------------------------------ confetti ------------------------------ */
  const PALETTE = ['#E85D30', '#1B382B', '#FFC24D', '#DBEDE1', '#FF7C4E', '#E6E1F4'];

  function burstAt(x, y) {
    if (REDUCED || typeof global.confetti !== 'function') return;
    try {
      global.confetti({ particleCount: 100, spread: 78, startVelocity: 46, ticks: 160,
        origin: { x: x, y: y }, colors: PALETTE, disableForReducedMotion: true });
      setTimeout(() => global.confetti({ particleCount: 60, spread: 115, scalar: .9, ticks: 140,
        origin: { x: x, y: y }, colors: PALETTE, disableForReducedMotion: true }), 200);
    } catch (e) {}
  }

  function celebrate(target) {
    let x = .5, y = .5;
    const el = typeof target === 'string' ? $(target) : target;
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      if (r.width || r.height) {
        x = clamp((r.left + r.width / 2) / (global.innerWidth || 1), .06, .94);
        y = clamp((r.top + r.height * .35) / (global.innerHeight || 1), .12, .88);
      }
    }
    burstAt(x, y);
  }

  /* ------------------------------ toast ------------------------------ */
  let toastT = null;
  function toast(msg, ms) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), ms || 2600);
  }

  /* ------------------------------ date formatting ------------------------------ */
  function shortDate(ts) {
    try {
      return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) { return ''; }
  }

  /* ------------------------------ hash router ------------------------------ */
  const ROUTES = ['home', 'games', 'about'];
  const router = (function () {
    const subs = [];
    let current = null;

    function parse() {
      const raw = (global.location.hash || '').replace(/^#\/?/, '').toLowerCase();
      return ROUTES.indexOf(raw) !== -1 ? raw : 'home';
    }

    function emit(route, prev) {
      subs.forEach(fn => { try { fn(route, prev); } catch (e) { console.error(e); } });
    }

    function apply(force) {
      const route = parse();
      if (route === current && !force) return;
      const prev = current;
      current = route;
      emit(route, prev);
    }

    global.addEventListener('hashchange', () => apply(false));

    return {
      start() { apply(true); },
      on(fn) { subs.push(fn); return fn; },
      current() { return current; },
      go(route) {
        if (ROUTES.indexOf(route) === -1) return;
        if (current === route) { global.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }); return; }
        global.location.hash = route;
      },
      routes: ROUTES
    };
  })();

  /* ------------------------------ reveal on scroll ------------------------------ */
  let revealIO = null;
  const observed = new Set();
  function observeReveals(root) {
    if (!('IntersectionObserver' in global) || REDUCED) {
      $$('.rv', root || document).forEach(el => el.classList.add('in'));
      return;
    }
    if (!revealIO) {
      revealIO = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
        });
      }, { threshold: .08, rootMargin: '0px 0px -30px 0px' });
    }
    $$('.rv', root || document).forEach(el => {
      if (observed.has(el)) return;
      observed.add(el);
      revealIO.observe(el);
    });
  }

  /* ------------------------------ export ------------------------------ */
  global.PP = {
    $, $$, clamp, rand, randInt, pick, REDUCED, COARSE,
    store, boards, sfx, mute, celebrate, burstAt, toast, shortDate,
    router, observeReveals
  };
})(window);
