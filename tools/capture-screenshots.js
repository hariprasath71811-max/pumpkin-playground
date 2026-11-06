'use strict';
/** capture-screenshots.js — 1920x1080 gallery screenshots for the Devpost submission.
 * Usage (server must be running on :8777):
 *   node tools/capture-screenshots.js
 * Output: assets/screenshots/01_hero_home.png … 05_hall_of_fame.png
 * The Hall of Fame boards are pre-seeded with sample scores so the leaderboard
 * shot shows real entries instead of the empty state.
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = 'http://localhost:8777/';
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'screenshots');

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  // Seed plausible Hall of Fame entries (same shape as boards.add writes).
  await context.addInitScript(() => {
    try {
      const now = Date.now(), D = 86400000;
      const seed = (key, rows) => localStorage.setItem(key,
        JSON.stringify(rows.map(([s, n, d]) => ({ s, n, d: now - d * D }))));
      seed('pp_board_catch', [[280, 'Anonymous Goblin', 2], [190, 'Pumpkin Pro', 5],
        [120, 'Homework Dodger', 9], [80, 'Anonymous Goblin', 12]]);
      seed('pp_board_whack', [[640, 'Anonymous Goblin', 1], [520, 'Mole Bane', 4],
        [310, 'Hammer Time', 8], [180, 'Anonymous Goblin', 14]]);
      seed('pp_board_flappy', [[14, 'Anonymous Goblin', 3], [11, 'Vine Whisperer', 6],
        [7, 'Book Hater', 10], [4, 'Anonymous Goblin', 15]]);
      seed('pp_board_pacman', [[1840, 'Anonymous Goblin', 2], [1260, 'Neon Chomper', 7],
        [940, 'Seed Snack', 11], [520, 'Anonymous Goblin', 13]]);
    } catch (e) { /* ignore */ }
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // Ensure all fade-reveal classes have 'in' so nothing is mid-fade.
  const settle = async (ms = 500) => {
    await page.evaluate(() => {
      document.querySelectorAll('.rv').forEach(el => el.classList.add('in'));
    });
    await wait(ms);
  };
  const shot = async name => {
    await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    console.log('captured ' + name);
  };

  try {
    /* ---------- 01 hero home ---------- */
    await page.goto(BASE + '#home', { waitUntil: 'load' });
    await wait(2600);
    await page.hover('#pumpkinStage').catch(() => {});
    await wait(700);
    await settle();
    await shot('01_hero_home.png');

    /* ---------- 02 arcade overview (top row running) ---------- */
    await page.click('.nav-links a[href="#games"]');
    await wait(1600);
    await settle(600);
    // Start all three games briefly so they're in a clean running-but-not-over state.
    await page.click('#catchStart');
    await wait(150);
    await page.click('#whackStart');
    await wait(150);
    await page.click('#flapStart');
    await wait(150);
    // Immediately reset Flappy to ready state so no modal appears.
    await page.click('#flapReset');
    await wait(300);
    // Make sure at least one mole is up for the shot.
    for (let i = 0; i < 6; i++) {
      const up = await page.evaluate(() => !!document.querySelector('#whackGrid .mole.up'));
      if (up) break;
      await wait(150);
    }
    // Scroll view-games into view so the arcade grid is fully visible.
    await page.evaluate(() => window.scrollTo(0, document.getElementById('view-games').offsetTop));
    await wait(350);
    await settle(350);
    await shot('02_arcade_overview.png');

    /* ---------- 03 flappy pumpkin mid-game ---------- */
    await page.click('#flapReset');           // fresh round, ensures ready state
    await wait(300);
    await page.click('#flapStart');
    await wait(280);
    // Tap Space 4 times to get into a mid-game rhythm (bird alive, no game-over yet).
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Space'); await wait(400); }
    // Force the flap canvas into view so the bird+obstacles are fully visible.
    await page.evaluate(() => document.getElementById('card-flappy').scrollIntoView({ block: 'center' }));
    await wait(350);
    await settle(350);
    await shot('03_flappy_pumpkin.png');

    /* ---------- 04 pumpkin-man maze ---------- */
    await page.click('#pacStart');
    await wait(2300);                          // READY! banner clears
    // Move the Pac-Man through a short corridor so the maze is in progress.
    for (const k of ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp']) {
      await page.keyboard.press(k);
      await wait(600);
    }
    await page.evaluate(() => document.getElementById('pacWrap').scrollIntoView({ block: 'center' }));
    await wait(350);
    await settle(350);
    await shot('04_pumpkin_man_maze.png');

    /* ---------- 05 hall of fame + excuse generator ---------- */
    await page.click('.nav-links a[href="#about"]');
    await wait(1600);
    await settle(600);
    // Generate an excuse so the excuse card is present and visible.
    await page.click('#excuseBtn');
    await wait(2600);                          // excuse lands, toast fades out
    // Scroll so both the leaderboard grid and the excuse card fit in the 1080px viewport.
    await page.evaluate(() => window.scrollTo(0, document.getElementById('view-about').offsetTop));
    await wait(450);
    // Compute how far we need to scroll down so the excuse card's bottom is at most at y=1080.
    const over = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#view-about .card')];
      const excuse = cards.find(c => c.textContent.includes('Academic Excuse'));
      if (!excuse) return 0;
      const r = excuse.getBoundingClientRect();
      // We have 1080px height; the excuse card starts somewhere above. If its bottom is below 1080, scroll it into view.
      const needed = Math.max(0, r.bottom - 1050);
      return needed;
    });
    if (over > 0) { await page.evaluate(dy => window.scrollBy(0, dy), over); await wait(450); }
    await settle(350);
    await shot('05_hall_of_fame.png');

    console.log('DONE -> ' + OUT);
    console.log(errors.length ? 'PAGE_ERRORS:\\n' + errors.join('\\n') : 'PAGE_ERRORS: none');
  } catch (err) {
    console.error('FAILED: ' + ((err && err.stack) || err));
    if (errors.length) console.error('PAGE_ERRORS:\\n' + errors.join('\\n'));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
})();