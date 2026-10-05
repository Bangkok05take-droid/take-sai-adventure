// バランス確認用の簡易AI（参考値）：node tests/balance.js
// 階層ごとの到達率・収入（お金＋お宝の売値）を、装備と帰還する階を変えて調べる。
const TS = require('./load');
const { Data: D, Game: G, Dungeon: DG } = TS;

function walkTo(S, t) {
  const run = S.run, m = run.map, p = run.player;
  const dist = DG.distances(m, t.x, t.y);
  let best = null, bd = dist[p.y * m.w + p.x];
  if (bd <= 0) return false;
  for (const [dir, [dx, dy]] of Object.entries(G.DIRS)) {
    const nx = p.x + dx, ny = p.y + dy;
    if (!G.canStep(m, p.x, p.y, dx, dy) || G.enemyAt(run, nx, ny)) continue;
    const d = dist[ny * m.w + nx];
    if (d >= 0 && d < bd) { bd = d; best = dir; }
  }
  if (!best) return false;
  return G.act(S, { type: 'move', dir: best }).consumed;
}
function danger(run, x, y) { return run.enemies.some((e) => e.charge && e.charge.tiles.some((t) => t.x === x && t.y === y)); }

// 1ターン分の行動。帰るなら 'home'
function step(S, opt) {
  const run = S.run, p = run.player;
  const use = (pred) => { const it = run.bag.find(pred); if (it) { G.act(S, { type: 'use', uid: it.uid }); return true; } return false; };
  const type = (t) => (i) => G.def(i).type === t;
  // 装備
  for (const t of ['weapon', 'shield']) {
    const best = run.bag.filter(type(t)).sort((a, b) => (G.def(b).atk || G.def(b).def) + b.plus - (G.def(a).atk || G.def(a).def) - a.plus)[0];
    if (best && !best.eq) { G.act(S, { type: 'equip', uid: best.uid }); return; }
  }
  // 予告攻撃の範囲から逃げる
  if (danger(run, p.x, p.y)) {
    for (const [dir, [dx, dy]] of Object.entries(G.DIRS)) {
      const nx = p.x + dx, ny = p.y + dy;
      if (G.canStep(run.map, p.x, p.y, dx, dy) && !G.enemyAt(run, nx, ny) && !danger(run, nx, ny)) { G.act(S, { type: 'move', dir }); return; }
    }
  }
  const vis = G.visibleEnemies(run);
  if (p.hp < p.maxhp * 0.4) {
    if (use((i) => i.id === 'big_herb' || i.id === 'herb' || i.id === 'elixir')) return;
    if (vis.length >= 2 && use(type('sleep'))) return;
    if (vis.length && use(type('warp'))) return;
    if (opt.cautious && p.hp < p.maxhp * 0.25 && run.bag.some((i) => i.id === 'return_scroll')) return 'home';
  }
  if (p.poison && p.hp < p.maxhp * 0.6 && use((i) => i.id === 'antidote' || i.id === 'herb')) return;
  if (p.hunger < 15 && use(type('food'))) return;
  if (vis.length >= 3 && use(type('fire'))) return;
  const adj = run.enemies.find((e) => G.adjacent(run, p, e));
  if (adj) {
    const dir = G.dirOf(adj.x - p.x, adj.y - p.y);
    const st = run.bag.find((i) => i.id === 'thunder_staff' && i.charges > 0);
    if (st && (adj.boss || D.ENEMIES[adj.type].def >= 12)) { G.act(S, { type: 'use', uid: st.uid, dir }); return; }
    G.act(S, { type: 'move', dir }); return;
  }
  const F = D.FLOORS[run.floor];
  if (F.boss && run.enemies.some((e) => e.boss)) {
    const b = run.enemies.find((e) => e.boss);
    if (b.rest > 0 || !b.charge) { if (!walkTo(S, b)) G.act(S, { type: 'wait' }); } else G.act(S, { type: 'wait' });
    return;
  }
  // 帰還判断
  if (run.floor >= opt.returnAt && (G.onReturnPoint(run) || G.onPortal(run))) return 'home';
  if (run.floor === D.MAX_FLOOR) {
    const orb = run.floorItems.find((f) => f.item && f.item.id === 'wish_orb');
    if (orb) { if (!walkTo(S, orb)) G.act(S, { type: 'pickup' }); return; }
    if (G.onPortal(run)) return 'home';
    if (!walkTo(S, run.portal)) G.act(S, { type: 'wait' });
    return;
  }
  const want = run.floorItems.filter((f) => run.explored[f.y * run.map.w + f.x] && (f.gold || run.bag.length < D.BAG_SIZE));
  want.sort((a, b) => Math.max(Math.abs(a.x - p.x), Math.abs(a.y - p.y)) - Math.max(Math.abs(b.x - p.x), Math.abs(b.y - p.y)));
  if (want.length && walkTo(S, want[0])) return;
  if (run.floor >= opt.returnAt && run.returnPoint) { if (!walkTo(S, run.returnPoint)) G.act(S, { type: 'wait' }); return; }
  if (run.floor >= opt.returnAt && run.portal) { if (!walkTo(S, run.portal)) G.act(S, { type: 'wait' }); return; }
  // 未探索の部屋を少し見る（収入のため）→ 階段
  if (opt.explore) {
    const room = run.map.rooms.find((r) => !run.explored[(r.y + (r.h >> 1)) * run.map.w + r.x + (r.w >> 1)]);
    if (room && run.turn - (run._floorStart || 0) < 140 && walkTo(S, { x: room.x + (room.w >> 1), y: room.y + (room.h >> 1) })) return;
  }
  if (G.onStairs(run)) { G.act(S, { type: 'descend' }); run._floorStart = run.turn; return; }
  if (!run.stairs || !walkTo(S, run.stairs)) G.act(S, { type: 'wait' });
}

function sim(opt, n) {
  const out = { reach: {}, deaths: 0, home: 0, income: [], turns: [], cleared: 0 };
  for (let s = 0; s < n; s++) {
    const S = G.newState();
    if (opt.gear) for (const [id, plus] of opt.gear) { const it = G.makeItem(S, id, { plus, eq: true }); S.village.bag.push(it); }
    else { G.takeLoan(S, 'weapon'); }
    G.takeLoan(S, 'food');
    for (const id of opt.extra || []) S.village.bag.push(G.makeItem(S, id));
    G.depart(S, 5000 + s);
    let r;
    while (!S.run.over && S.run.turn < 6000) {
      r = step(S, opt);
      if (r === 'home') { if (G.onReturnPoint(S.run) || G.onPortal(S.run)) G.act(S, { type: 'returnHome' }); else G.useReturnScroll(S); break; }
    }
    const run = S.run;
    out.reach[run.floor] = (out.reach[run.floor] || 0) + 1;
    out.turns.push(run.turn);
    if (run.over && run.result.type === 'dead') out.deaths++;
    else if (run.over) {
      out.home++;
      const value = run.runGold + run.bag.reduce((a, i) => a + (G.def(i).type === 'treasure' ? G.sellPrice(i) : 0), 0);
      out.income.push(value);
      if (run.result.orb) out.cleared++;
    }
  }
  const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
  return { home: out.home + '/' + n, deaths: out.deaths, avgIncomeIfHome: avg(out.income), avgTurns: avg(out.turns), cleared: out.cleared,
    reach: Object.entries(out.reach).sort((a, b) => a[0] - b[0]).map(([f, c]) => f + ':' + c).join(' ') };
}

const N = +process.argv[2] || 12;
const plans = [
  ['貸出装備・3階で帰還', { returnAt: 3, explore: true, cautious: true }],
  ['貸出装備・6階で帰還', { returnAt: 6, explore: true, cautious: true }],
  ['貸出装備・9階で帰還', { returnAt: 9, explore: true, cautious: true }],
  ['貸出装備・最深を目指す', { returnAt: 99, explore: true }],
  ['中装備(鉄+3/亀甲+3)・12階で帰還', { returnAt: 12, explore: true, cautious: true, gear: [['iron_katana', 3], ['turtle_shield', 3]], extra: ['herb', 'herb', 'khaoniao'] }],
  ['中装備・最深を目指す', { returnAt: 99, explore: true, gear: [['iron_katana', 3], ['turtle_shield', 3]], extra: ['herb', 'herb', 'khaoniao'] }],
  ['上装備(翠玉+5/苔石+5)・21階で帰還', { returnAt: 21, explore: true, cautious: true, gear: [['jade_sword', 5], ['moss_shield', 5]], extra: ['big_herb', 'big_herb', 'khaoniao', 'sleep_incense'] }],
  ['最上装備(結晶+8/結晶+8)・最深', { returnAt: 99, explore: true, gear: [['crystal_blade', 8], ['crystal_shield', 8]], extra: ['big_herb', 'big_herb', 'elixir', 'khaoniao', 'khaoniao', 'sleep_incense'] }],
];
for (const [name, opt] of plans) console.log(name.padEnd(28), JSON.stringify(sim(opt, N)));
