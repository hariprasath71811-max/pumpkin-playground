'use strict';
/**
 * record-demo.js — headless demo recorder for Pumpkin Playground (PlayPath).
 *
 * Walks Home → Arcade (plays Catch, Whack-a-Mole, Flappy, Pumpkin-Man) →
 * Hall of Fame → Home while recording a 1280x720 webm.
 *
 * Usage (server must be running on :8777):
 *   node tools/record-demo.js
 *
 * Output: demo.webm in the project folder.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = 'http://localhost:8777/';
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'demo.webm');
const TMP = path.join(ROOT, '.demo-video');

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: { dir: TMP, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const video = page.video();

  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  const nav = async hash => {
    await page.click(`.nav-links a[href="${hash}"]`);
    await wait(1500);
  };

  try {
    /* 1 — HOME: hero + the four "Pick your poison" cards with badges */
    await page.goto(BASE + '#home', { waitUntil: 'load' });
    await wait(3000);
    await page.evaluate(() =>
      document.querySelector('.home-strip').scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(2800);

    /* 2 — ARCADE */
    await nav('#games');
    await wait(900);

    /* 3 — PUMPKIN CATCH ~6s: click only orange pixels (pumpkins, never books) */
    await page.click('#catchStart');
    await wait(600);
    const box = await page.locator('#catchCanvas').boundingBox();
    const catchEnd = Date.now() + 5400;
    while (Date.now() < catchEnd) {
      const pt = await page.evaluate(() => {
        const c = document.getElementById('catchCanvas');
        const g = c.getContext('2d');
        const w = c.width, h = c.height;
        const d = g.getImageData(0, 0, w, h).data;
        const hits = [];
        for (let y = 0; y < h * 0.86; y += 4) {
          for (let x = 0; x < w; x += 4) {
            const i = (y * w + x) * 4;
            // pumpkin orange (#E85D30 / #F5794C); books are dark, bg is cream
            if (d[i] > 190 && d[i + 1] > 70 && d[i + 1] < 180 && d[i + 2] < 95) hits.push([x, y]);
          }
        }
        if (!hits.length) return null;
        const p = hits[(Math.random() * hits.length) | 0];
        return { x: p[0], y: p[1], w, h };
      });
      if (pt && box) {
        await page.mouse.click(box.x + pt.x * box.width / pt.w, box.y + pt.y * box.height / pt.h);
      }
      await wait(240);
    }
    await wait(900);

    /* 4 — WHACK-A-MOLE ~6s: whack every mole that pops up */
    await page.click('#whackStart');
    await wait(500);
    const whackEnd = Date.now() + 5400;
    while (Date.now() < whackEnd) {
      const p = await page.evaluate(() => {
        const m = document.querySelector('#whackGrid .mole.up');
        if (!m) return null;
        const r = m.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.75 };
      });
      if (p && p.y > 8 && p.y < 712) await page.mouse.click(p.x, p.y);
      await wait(110);
    }
    await wait(700);

    /* 5 — FLAPPY PUMPKIN ~6s: Space-tap rhythm; hold the game-over modal if we crash */
    await page.click('#flapStart');
    await wait(700);
    const flapEnd = Date.now() + 4800;
    while (Date.now() < flapEnd) {
      const dead = await page.evaluate(
        () => !document.getElementById('flapOver').classList.contains('is-hidden'));
      if (dead) break;
      await page.keyboard.press('Space');
      await wait(360);
    }
    await wait(1900);

    /* 6 — PUMPKIN-MAN ~7s: start and cycle through the maze */
    await page.click('#pacStart');
    await wait(500);
    const keys = ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowRight',
                  'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight'];
    for (const k of keys) {
      await page.keyboard.press(k);
      await wait(760);
    }
    await wait(400);

    /* 7 — HALL OF FAME: show the four scoreboards */
    await nav('#about');
    await page.evaluate(() => {
      const g = document.querySelector('.hof-grid') || document.querySelector('#about .container');
      if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    await wait(3200);

    /* 8 — back HOME for the outro */
    await nav('#home');
    await wait(1800);

    await context.close();
    const tmpPath = await video.path();
    if (fs.existsSync(OUT)) fs.rmSync(OUT);
    fs.renameSync(tmpPath, OUT);
    fs.rmSync(TMP, { recursive: true, force: true });

    const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
    console.log('VIDEO_OK ' + OUT + ' (' + mb + ' MB)');
    console.log(errors.length ? 'PAGE_ERRORS:\n' + errors.join('\n') : 'PAGE_ERRORS: none');
  } catch (err) {
    console.error('FAILED: ' + ((err && err.stack) || err));
    if (errors.length) console.error('PAGE_ERRORS:\n' + errors.join('\n'));
    try { await context.close(); } catch (_) { /* ignore */ }
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
})();
