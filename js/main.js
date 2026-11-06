/* =========================================================================
   Pumpkin Playground — main.js
   Wires navigation, the hash router, the interactive hero pumpkin,
   the Hall of Fame, the excuse generator and the toolbar controls.
   ========================================================================= */
(function (global) {
  'use strict';

  const PP = global.PP;
  const { $, $$, boards, sfx, mute, toast, router, COARSE, REDUCED, store, shortDate } = PP;

  /* ==================================================================
     reveals
     ================================================================== */
  const REVEAL_SEL = '.view-head, .section-head, .hero-copy, .hero-art, .card';
  let revealTimer = 0;

  function markReveals() {
    $$(REVEAL_SEL).forEach(el => {
      if (el.classList.contains('rv')) return;
      el.classList.add('rv');
      // safety net: never leave content invisible if the observer misbehaves
      clearTimeout(revealTimer);
      revealTimer = setTimeout(() => $$('.rv:not(.in)').forEach(n => n.classList.add('in')), 4000);
    });
  }

  /* ==================================================================
     Hall of Fame
     ================================================================== */
  function renderBoards() {
    $$('#hofGrid .board-card').forEach(card => {
      const game = card.getAttribute('data-board');
      const list = boards.list(game);
      const ol = $('[data-list]', card);
      const empty = $('[data-empty]', card);
      if (!ol) return;

      ol.innerHTML = '';
      if (!list.length) {
        if (empty) empty.style.display = '';
        ol.style.display = 'none';
        return;
      }
      if (empty) empty.style.display = 'none';
      ol.style.display = '';

      list.forEach((entry, i) => {
        const li = document.createElement('li');
        li.style.animationDelay = (i * 55) + 'ms';
        const who = document.createElement('div');
        who.className = 'who';
        const b = document.createElement('b');
        b.textContent = entry.n || 'Anonymous Goblin';
        const span = document.createElement('span');
        span.textContent = shortDate(entry.d) + (i === 0 ? ' · champion' : '');
        who.appendChild(b); who.appendChild(span);

        const rank = document.createElement('span');
        rank.className = 'rank';
        rank.textContent = String(i + 1);

        const val = document.createElement('span');
        val.className = 'val';
        val.textContent = entry.s;

        li.appendChild(rank); li.appendChild(who); li.appendChild(val);
        ol.appendChild(li);
      });
    });

    // refresh every visible "best" stat
    $$('[data-stat="best"]').forEach(el => {
      const card = el.closest('[data-game]');
      if (!card) return;
      const id = card.getAttribute('data-game');
      el.textContent = boards.best(id);
    });
  }

  global.PPmain = { renderBoards: renderBoards };

  /* ==================================================================
     navigation
     ================================================================== */
  function moveIndicator() {
    const indicator = $('.nav-indicator');
    if (!indicator) return;
    const active = $('.nav-links a.is-active');
    if (!active || !active.offsetWidth) { indicator.style.opacity = '0'; return; }
    indicator.style.opacity = '1';
    indicator.style.width = active.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + active.offsetLeft + 'px)';
  }

  function initNav() {
    const menuBtn = $('#menuBtn'), menu = $('#mobileMenu');
    if (menuBtn && menu) {
      menuBtn.addEventListener('click', () => {
        const open = menu.hasAttribute('hidden');
        if (open) menu.removeAttribute('hidden'); else menu.setAttribute('hidden', '');
        menuBtn.setAttribute('aria-expanded', String(open));
        menuBtn.firstElementChild.textContent = open ? '✕' : '☰';
        sfx.ui();
      });
    }

    const nav = $('#nav');
    let ticking = false;
    global.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      global.requestAnimationFrame(() => {
        nav.classList.toggle('is-stuck', global.scrollY > 8);
        ticking = false;
      });
    }, { passive: true });

    // sound toggle (navbar + arcade toolbar)
    [['#muteBtn', '#muteBtn'], ['#muteBtn2', '#muteBtn2']].forEach(pair => {
      const btn = $(pair[0]);
      if (!btn) return;
      btn.addEventListener('click', () => {
        mute.toggle();
        if (pair[0] === '#muteBtn') {
          btn.classList.remove('ringing'); void btn.offsetWidth; btn.classList.add('ringing');
        }
        if (!mute.get()) toast('🔇 Sound muted'); else toast('🔊 Sound on', 1500);
      });
    });

    mute.render();
    global.addEventListener('resize', moveIndicator);
  }

  /* ==================================================================
     router / views
     ================================================================== */
  function initRouter() {
    router.on((route, prev) => {
      $$('.view').forEach(v => v.classList.toggle('is-active', v.getAttribute('data-route') === route));

      $$('.nav-links a[data-route], .mobile-menu a[data-route]').forEach(a => {
        a.classList.toggle('is-active', a.getAttribute('data-route') === route);
        if (a.getAttribute('data-route') === route) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      moveIndicator();

      // close the mobile drawer
      const menu = $('#mobileMenu');
      if (menu && !menu.hasAttribute('hidden')) {
        menu.setAttribute('hidden', '');
        const mb = $('#menuBtn');
        if (mb) { mb.setAttribute('aria-expanded', 'false'); mb.firstElementChild.textContent = '☰'; }
      }

      // pause whatever is running while its page is hidden
      if (route === 'games') { PP.games.layoutAll(); PP.games.resumeAll(); }
      else PP.games.pauseAll();

      if (prev !== null) global.scrollTo({ top: 0, behavior: 'auto' });

      const view = $('.view.is-active');
      if (view && prev !== null) {
        try { view.focus({ preventScroll: true }); } catch (e) { view.focus(); }
      }
      markReveals();
      PP.observeReveals();
    });

    router.start();
  }

  /* ==================================================================
     interactive hero pumpkin
     ================================================================== */
  function initPumpkin() {
    const stage = $('#pumpkinStage'), tilt = $('#pumpkinTilt'), hint = $('#stageHint');
    if (!stage || !tilt) return;

    if (hint && COARSE) hint.innerHTML = '<span aria-hidden="true">👆</span> Tap the pumpkin';

    let dragging = false;
    let active = false;
    let startX = 0, startY = 0;

    stage.setAttribute('tabindex', '0');
    stage.setAttribute('role', 'button');
    stage.setAttribute('aria-label', 'Jack-o-lantern with gaming lore. Activate to reveal cards.');

    function setTilt(nx, ny) {
      const rx = clampNum(-ny * 16, -18, 18);
      const ry = clampNum(nx * 20, -22, 22);
      tilt.style.transform =
        'perspective(760px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translate3d(' +
        (nx * 10).toFixed(1) + 'px,' + (ny * 8).toFixed(1) + 'px,0)';
    }
    function resetTilt() { tilt.style.transform = ''; }
    function clampNum(v, a, b) { return Math.min(b, Math.max(a, v)); }

    function setActive(v) {
      active = v;
      stage.classList.toggle('is-active', v);
      stage.setAttribute('aria-expanded', String(v));
    }

    stage.addEventListener('pointerdown', e => {
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      stage.classList.add('is-dragging');
      setActive(true);
      sfx.pop();
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    });

    stage.addEventListener('pointermove', e => {
      const r = stage.getBoundingClientRect();
      const nx = clampNum(((e.clientX - r.left) / r.width - .5) * 2, -1, 1);
      const ny = clampNum(((e.clientY - r.top) / r.height - .5) * 2, -1, 1);
      setTilt(nx, ny);
      if (dragging) e.preventDefault();
    });

    function release(e) {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('is-dragging');
      resetTilt();
      // on touch there is no hover, so let the cards stay open until the next tap
      if (!COARSE) setTimeout(() => { if (!dragging) setActive(false); }, 220);
      if (e && Math.abs(e.clientX - startX) < 6 && Math.abs(e.clientY - startY) < 6 && COARSE) {
        setActive(!active);
      }
    }
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
    stage.addEventListener('pointerleave', e => {
      if (!dragging && !COARSE) { setActive(false); resetTilt(); }
    });

    stage.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(!active); sfx.pop(); }
      if (e.key === 'Escape') setActive(false);
    });

    document.addEventListener('pointerdown', e => {
      if (active && !stage.contains(e.target)) setActive(false);
    }, true);
  }

  /* ==================================================================
     academic excuse generator
     ================================================================== */
  const EXCUSES = [
    'My <b>cat committed the code</b> and the pipeline is now sentient. I must supervise it.',
    'I am conducting a longitudinal study on whether pumpkins improve grades. Sample size: one.',
    'My calendar spontaneously combusted, so technically every deadline moved to "someday".',
    'I am loading the syllabus into my brain. It said <b>404: motivation not found</b>.',
    'The library was closed for an unscheduled exorcism. Very reasonable. Very loud.',
    'I am stress-testing the campus Wi-Fi by watching pixels fall in a grid pattern.',
    'My dominant hand has been seconded to a national whack-a-mole strategic reserve.',
    'I am practicing <b>radical inactivity</b> — it is a core unit in my imaginary major.',
    'A ghost told me the deadline is a social construct. The ghost had a point.',
    'I dropped my textbook and it opened to a page about procrastination. That counts as reading.',
    'My productivity app crashed and now I am trapped in this one. Send snacks.',
    'I am beta-testing a maze-running career. So far: excellent reflexes, terrible GPA.',
    'The professor said "think outside the box", so I am in a pumpkin-shaped box now.',
    'I am pre-studying for a course I have not enrolled in, using games I should not be playing.',
    'Mercury is in retrograde, and so am I — repeatedly — through the same corridor.',
    'My to-do list achieved sentience and immediately took a nap. I am honouring its wishes.',
    'I am gathering primary sources for my dissertation on <b>why dots are delicious</b>.',
    'The assignment is not late, it is <b>temporally flexible</b>. Peer review pending.',
    'I am waiting for inspiration. It has ghosted me, which feels on-brand for this arcade.',
    'I calculated the expected grade and the number was haunted. I am taking precautions.',
    'My chair rejected my posture, so I am now reclining into a gaming position for health.',
    'A pumpkin looked at me judgmentally. I must prove something to it. It is personal now.',
    'I am not avoiding work — I am <b>building the hand-eye coordination the syllabus demands</b>.',
    'The deadline moved. Not by me. I am as surprised as you are.'
  ];

  function initExcuses() {
    const btn = $('#excuseBtn'), out = $('#excuseOut'), copy = $('#excuseCopy');
    if (!btn || !out) return;
    let current = '';
    let lastIdx = -1;

    btn.addEventListener('click', () => {
      let i = Math.floor(Math.random() * EXCUSES.length);
      if (EXCUSES.length > 1) while (i === lastIdx) i = Math.floor(Math.random() * EXCUSES.length);
      lastIdx = i;
      current = EXCUSES[i].replace(/<\/?b>/g, '');
      out.innerHTML = '<p>' + EXCUSES[i] + '</p>';
      out.classList.remove('fresh'); void out.offsetWidth; out.classList.add('fresh');
      if (copy) copy.disabled = false;
      sfx.coin();
      btn.animate
        ? btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(.94)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' })
        : null;
    });

    if (copy) {
      copy.addEventListener('click', () => {
        if (!current) return;
        const done = () => { copy.textContent = 'Copied!'; sfx.coin(); setTimeout(() => copy.textContent = 'Copy', 1600); };
        if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(current).then(done).catch(fallback);
        } else fallback();

        function fallback() {
          const ta = document.createElement('textarea');
          ta.value = current;
          ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); done(); } catch (e) {}
          ta.remove();
        }
      });
    }
  }

  /* ==================================================================
     toolbar, name tag, keyboard niceties
     ================================================================== */
  function initToolbar() {
    const resetBtn = $('#resetScoresBtn');
    if (resetBtn) {
      let armed = false, armT = 0;
      resetBtn.addEventListener('click', () => {
        if (!armed) {
          armed = true;
          resetBtn.textContent = '⚠ Tap again to wipe everything';
          resetBtn.classList.add('is-danger');
          clearTimeout(armT);
          armT = setTimeout(() => {
            armed = false;
            resetBtn.textContent = '↺ Reset all high scores';
            resetBtn.classList.remove('is-danger');
          }, 3200);
          sfx.tick();
          return;
        }
        armed = false;
        clearTimeout(armT);
        resetBtn.textContent = '↺ Reset all high scores';
        resetBtn.classList.remove('is-danger');
        boards.clear();
        renderBoards();
        PP.games.resetAll();
        $$('.view.is-active .overlay').forEach(o => o.classList.remove('is-hidden'));
        const co = $('#catchOver'), wo = $('#whackOver'), fo = $('#flapOver'), po = $('#pacOver');
        [co, wo, fo, po].forEach(o => o && o.classList.add('is-hidden'));
        $('#catchOverlay') && $('#catchOverlay').classList.remove('is-hidden');
        $('#whackOverlay') && $('#whackOverlay').classList.remove('is-hidden');
        $('#flapOverlay') && $('#flapOverlay').classList.remove('is-hidden');
        $('#pacOverlay') && $('#pacOverlay').classList.remove('is-hidden');
        toast('🧹 High scores wiped. The pumpkins forget you.');
        sfx.bad();
      });
    }

    const nameInput = $('#playerName'), saveName = $('#saveName');
    if (nameInput && saveName) {
      nameInput.value = boards.name() === 'Anonymous Goblin' ? '' : boards.name();
      const save = () => {
        boards.setName(nameInput.value);
        nameInput.value = boards.name();
        renderBoards();
        toast('✅ Playing as ' + boards.name());
        sfx.coin();
      };
      saveName.addEventListener('click', save);
      nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    }
  }

  /* ==================================================================
     boot
     ================================================================== */
  function init() {
    PP.games.boot();
    markReveals();
    PP.observeReveals();
    renderBoards();
    initNav();
    initPumpkin();
    initExcuses();
    initToolbar();
    initRouter();          // last: fires the first route
    setTimeout(moveIndicator, 120);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const menu = $('#mobileMenu');
        if (menu && !menu.hasAttribute('hidden')) {
          menu.setAttribute('hidden', '');
          $('#menuBtn').setAttribute('aria-expanded', 'false');
          $('#menuBtn').firstElementChild.textContent = '☰';
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
