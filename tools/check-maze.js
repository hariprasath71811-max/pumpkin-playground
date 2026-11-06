/* Offline maze verifier — run with: node tools/check-maze.js
   Checks: 19x15 map, border walls, flood-fill reachability from the player
   start, no orphan cells, power-pellet corners open, ghost homes open. */
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

const W = 19, H = 15;
const START = { c: 9, r: 13 };
const GHOST_HOMES = [{ c: 7, r: 7 }, { c: 11, r: 7 }, { c: 9, r: 5 }];
const POWER = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]];

let fail = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + msg);
  if (!cond) fail++;
};

console.log('map dimensions');
ok(MAP.length === H, `rows = ${MAP.length} (want ${H})`);
MAP.forEach((row, i) => {
  if (row.length !== W) ok(false, `row ${i} length = ${row.length} (want ${W}): "${row}"`);
});

const isWall = (x, y) =>
  x < 0 || y < 0 || x >= W || y >= H || MAP[y][x] === '#';

console.log('\nborder');
let borderOk = true;
for (let x = 0; x < W; x++) if (!isWall(x, 0) || !isWall(x, H - 1)) borderOk = false;
for (let y = 0; y < H; y++) if (!isWall(0, y) || !isWall(W - 1, y)) borderOk = false;
ok(borderOk, 'all border cells are walls');

console.log('\nflood fill from player start');
const seen = new Uint8Array(W * H);
const q = [[START.c, START.r]];
seen[START.r * W + START.c] = 1;
let head = 0;
while (head < q.length) {
  const [c, r] = q[head++];
  [[0, -1], [-1, 0], [0, 1], [1, 0]].forEach(([dx, dy]) => {
    const nc = c + dx, nr = r + dy;
    if (isWall(nc, nr)) return;
    const i = nc + nr * W;
    if (seen[i]) return;
    seen[i] = 1;
    q.push([nc, nr]);
  });
}

let open = 0, unreachable = 0, openList = [];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (isWall(x, y)) continue;
    open++;
    openList.push([x, y]);
    if (!seen[x + y * W]) unreachable++;
  }
ok(unreachable === 0, `${open} open cells, ${unreachable} unreachable from start`);

console.log('\ncritical cells');
ok(!isWall(START.c, START.r), `player start (${START.c},${START.r}) is open`);
GHOST_HOMES.forEach((g, i) =>
  ok(!isWall(g.c, g.r), `ghost home ${i} (${g.c},${g.r}) is open`));
POWER.forEach(([x, y]) => ok(!isWall(x, y), `power pellet (${x},${y}) is open`));

console.log('\ndead ends (open cells with a single open neighbour)');
const dead = openList.filter(([x, y]) => {
  const n = [[0, -1], [-1, 0], [0, 1], [1, 0]]
    .filter(([dx, dy]) => !isWall(x + dx, y + dy)).length;
  return n === 1;
});
console.log('  info  ' + dead.length + ' dead-end cell(s): ' +
  JSON.stringify(dead.map(([x, y]) => `${x},${y}`)));

console.log('\nseed budget');
const homes = new Set(GHOST_HOMES.map(g => g.c + ',' + g.r));
homes.add(START.c + ',' + START.r);
const plantable = openList.filter(([x, y]) => !homes.has(x + ',' + y));
console.log(`  info  ${plantable.length} plantable cells ` +
  `(${plantable.length - POWER.length} seeds + ${POWER.length} candies)`);

console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(fail ? 1 : 0);
