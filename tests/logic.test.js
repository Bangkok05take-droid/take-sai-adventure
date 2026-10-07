// ゲーム処理の自動テスト：node tests/logic.test.js
const TS = require('./load');
const { Data: D, Game: G, Dungeon: DG, Save: SV, RNG: R } = TS;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('  NG  ' + name + '\n      ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n      ')); }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ` expected ${String(JSON.stringify(b)).slice(0, 200)} got ${String(JSON.stringify(a)).slice(0, 200)}`); }

function newRun(seed = 1, setup) {
  const S = G.newState();
  if (setup) setup(S);
  const r = G.depart(S, seed);
  assert(r.ok, 'depart failed: ' + r.msg);
  return S;
}
// 敵をすべて消し、指定位置に置き直す
function clearEnemies(S) { S.run.enemies = []; }
function openSpot(run, nearX, nearY) {
  // プレイヤーの部屋内の空きマス
  const room = DG.roomAt(run.map, run.player.x, run.player.y);
  return room;
}
function bigRoomFloor(S) {
  // テスト用の単純な1部屋マップ
  const run = S.run, m = run.map;
  m.tiles.fill(DG.WALL);
  m.rooms = [{ id: 0, x: 2, y: 2, w: 20, h: 12 }];
  for (let y = 2; y < 14; y++) for (let x = 2; x < 22; x++) m.tiles[y * m.w + x] = DG.FLOOR;
  run.player.x = 5; run.player.y = 5;
  run.enemies = []; run.floorItems = [];
  run.stairs = { x: 20, y: 12 }; run.returnPoint = null; run.portal = null;
  G.updateVision(run);
}
function addEnemy(S, type, x, y) {
  const run = S.run;
  const e = { id: run.nextEnemyId++, type, x, y, hp: 999, maxhp: 999, atk: 1, def: 0, exp: 1, sleep: 0, tx: null, ty: null, acts: 0, dir: 'down' };
  run.enemies.push(e);
  return e;
}

// ボスを倒す（テスト用：HPを1にして隣から攻撃）
function defeatBoss(S) {
  const run = S.run, b = run.enemies.find((e) => e.boss);
  b.hp = 1; b.sleep = 99; b.charge = null; run.hazards = [];
  run.enemies = run.enemies.filter((e) => e === b || !e.summoned);
  run.player.hp = run.player.maxhp = 9999;
  for (const [dir, [dx, dy]] of Object.entries(G.DIRS)) {
    const x = b.x - dx, y = b.y - dy;
    if (G.canStep(run.map, x, y, dx, dy) && !G.enemyAt(run, x, y)) { run.player.x = x; run.player.y = y; G.updateVision(run);
      for (let i = 0; i < 60 && run.enemies.includes(b); i++) G.act(S, { type: 'move', dir });
      return; }
  }
  throw new Error('cannot reach boss');
}
function goDown(S) {
  const run = S.run;
  if (G.F(run).boss && run.enemies.some((e) => e.boss)) defeatBoss(S);
  run.player.x = run.stairs.x; run.player.y = run.stairs.y;
  G.act(S, { type: 'descend' });
}
function goToFloor(S, f) { while (S.run.floor < f) goDown(S); }

console.log('ダンジョン生成');
test('多数のシードで各章のボスの階まで：入口から階段・帰還の祠・全道具・全敵に到達でき、不正配置がない', () => {
  let checked = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const S = newRun(seed, (S0) => { S0.village.story.chapter = ((seed - 1) % 5) + 1; });
    for (let f = 1; f <= G.maxFloor(S.run); f++) {
      if (f > 1) goDown(S);
      const run = S.run, m = run.map, p = run.player;
      eq(run.floor, f);
      eq(run.map.w, D.MAP.w);
      const dist = DG.distances(m, p.x, p.y);
      const reach = (o) => dist[o.y * m.w + o.x] >= 0;
      assert(DG.passable(m, p.x, p.y), 'player on wall');
      const boss = G.F(run, f).boss;
      if (!boss) { assert(run.stairs && reach(run.stairs), `stairs unreachable seed${seed} f${f}`); assert(!DG.same(run.stairs, p), 'stairs on start'); }
      else { assert(!run.stairs, 'no stairs before boss'); assert(run.enemies.some((e) => e.boss && e.type === boss), 'boss exists'); }
      if (f === 25 && !boss) { assert(run.returnPoint && reach(run.returnPoint), 'return point'); assert(!DG.same(run.returnPoint, run.stairs)); }
      eq(!!run.returnPoint, f === 25 && !boss, 'return point only on 25F (not on a boss floor)');
      if (boss) assert(run.enemies.every((e) => e.boss), 'no normal enemies on a boss floor');
      for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] !== DG.WALL) assert(dist[i] >= 0, `isolated tile seed${seed} f${f}`);
      const pos = new Set();
      for (const it of run.floorItems) {
        assert(DG.passable(m, it.x, it.y) && reach(it), 'item on wall');
        const k = it.x + ',' + it.y;
        assert(!pos.has(k), 'items overlap'); pos.add(k);
        assert(!DG.same(it, run.stairs) && !DG.same(it, run.returnPoint) && !DG.same(it, p), 'item on special tile');
      }
      const epos = new Set();
      for (const e of run.enemies) {
        assert(DG.passable(m, e.x, e.y) && reach(e), 'enemy on wall');
        const k = e.x + ',' + e.y;
        assert(!epos.has(k), 'enemies overlap'); epos.add(k);
        assert(!pos.has(k), 'enemy on item');
        assert(!DG.same(e, p), 'enemy on player');
        // 開始直後の包囲を避ける：最初の部屋には敵を置かない
        if (!e.boss) assert(DG.roomAt(m, e.x, e.y) !== DG.roomAt(m, p.x, p.y), 'enemy in start room');
        assert(Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) > 1, 'enemy adjacent at start');
      }
      if (boss) {
        defeatBoss(S);
        assert(run.portal && reach(run.portal), 'portal after boss');
        assert(!run.stairs, 'no stairs below the chapter boss');
        for (const it of run.floorItems) { assert(!DG.same(it, run.portal), 'item on portal'); assert(!DG.same(it, run.stairs), 'item on stairs'); }
      }
      checked++;
    }
  }
  console.log('      (' + checked + ' フロアを確認)');
});

console.log('ターン処理');
test('1回の移動で、起きている各敵がちょうど1回行動する', () => {
  const S = newRun(5); bigRoomFloor(S);
  const es = [addEnemy(S, 'frog', 15, 10), addEnemy(S, 'frog', 18, 3), addEnemy(S, 'jelly', 10, 12)];
  for (let i = 0; i < 5; i++) {
    const before = es.map((e) => e.acts), t = S.run.turn;
    const r = G.act(S, { type: 'move', dir: i % 2 ? 'left' : 'right' });
    assert(r.consumed);
    eq(S.run.turn, t + 1, 'turn');
    es.forEach((e, k) => eq(e.acts, before[k] + 1, 'enemy acts'));
  }
});
test('遅い敵（石ガメ）は2ターンに1回、眠っている敵は動かない', () => {
  const S = newRun(6); bigRoomFloor(S);
  const t = addEnemy(S, 'turtle', 15, 10), z = addEnemy(S, 'frog', 18, 12);
  z.sleep = 5;
  for (let i = 0; i < 4; i++) G.act(S, { type: 'wait' });
  eq(t.acts, 2, 'turtle'); eq(z.acts, 0, 'sleeping'); eq(z.sleep, 1);
});
test('壁への移動・向き変更・メニュー相当の操作はターンを消費しない', () => {
  const S = newRun(7); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 15, 10);
  S.run.player.x = 2; S.run.player.y = 5; G.updateVision(S.run);
  const r = G.act(S, { type: 'move', dir: 'left' });
  assert(!r.consumed); eq(S.run.turn, 0); eq(e.acts, 0);
  G.act(S, { type: 'face', dir: 'up' }); eq(S.run.turn, 0);
});
test('敵のいる方向へ移動すると攻撃になり、位置は変わらない', () => {
  const S = newRun(8); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 6, 5);
  const hp = e.hp;
  let hits = 0;
  for (let i = 0; i < 10; i++) { G.act(S, { type: 'move', dir: 'right' }); if (e.hp < hp) hits++; }
  eq(S.run.player.x, 5); assert(e.hp < hp, 'damaged');
});
test('敵の攻撃で1階のHP満タンから一撃死しない（ガマ蛙の最大ダメージ）', () => {
  const S = newRun(9);
  const max = Math.round(D.ENEMIES.frog.atk * 1.15);
  assert(max < S.run.player.maxhp / 3, 'frog too strong');
});

console.log('8方向の移動と角抜け防止');
test('斜め移動は1ターン、8方向すべて動ける', () => {
  const S = newRun(50); bigRoomFloor(S);
  const run = S.run; run.player.x = 10; run.player.y = 8;
  for (const [dir, [dx, dy]] of Object.entries(G.DIRS)) {
    const x = run.player.x, y = run.player.y, t = run.turn;
    const r = G.act(S, { type: 'move', dir });
    assert(r.consumed, dir); eq(run.turn, t + 1, dir); eq(run.player.x, x + dx, dir); eq(run.player.y, y + dy, dir);
  }
});
test('斜めに隣接する敵を攻撃できる', () => {
  const S = newRun(51); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 6, 6);
  let hit = false;
  for (let i = 0; i < 6; i++) { G.act(S, { type: 'move', dir: 'downright' }); if (e.hp < 999) hit = true; }
  assert(hit, 'diagonal attack'); eq(S.run.player.x, 5);
});
// 角のあるマップ： (5,5) から右下 (6,6) へ。 (6,5) が壁
function cornerMap(S) {
  bigRoomFloor(S);
  const m = S.run.map; m.tiles[5 * m.w + 6] = DG.WALL; G.updateVision(S.run);
}
test('壁の角をすり抜けて斜めに移動・攻撃できない（ターン消費なし）', () => {
  const S = newRun(52); cornerMap(S);
  let r = G.act(S, { type: 'move', dir: 'downright' });
  assert(!r.consumed); eq(S.run.player.x, 5); eq(S.run.turn, 0);
  const e = addEnemy(S, 'frog', 6, 6);
  r = G.act(S, { type: 'move', dir: 'downright' });
  assert(!r.consumed && e.hp === 999, 'no corner attack');
  // 反対側の角も同様
  const m = S.run.map; m.tiles[5 * m.w + 6] = DG.FLOOR; m.tiles[6 * m.w + 5] = DG.WALL;
  r = G.act(S, { type: 'move', dir: 'downright' });
  assert(!r.consumed && e.hp === 999, 'no corner attack 2');
});
test('敵も壁の角越しには攻撃・移動しない', () => {
  const S = newRun(53); cornerMap(S);
  const e = addEnemy(S, 'frog', 6, 6); e.atk = 50;
  const hp = S.run.player.hp;
  for (let i = 0; i < 3; i++) { S.run.player.x = 5; S.run.player.y = 5; e.x = 6; e.y = 6; G.updateVision(S.run); G.act(S, { type: 'wait' }); }
  // 角越しなので攻撃は来ない（敵は回り込もうとして動く）
  eq(S.run.player.hp, hp, 'no damage through corner');
});
test('敵は斜めから近づいて攻撃してくる', () => {
  const S = newRun(54); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 8, 8); e.atk = 3;
  G.act(S, { type: 'wait' }); // (8,8) -> (7,7)
  eq(e.x, 7); eq(e.y, 7);
  G.act(S, { type: 'wait' }); // -> (6,6) 斜めに隣接
  eq(e.x, 6); eq(e.y, 6);
  const hp = S.run.player.hp; let hit = false;
  for (let i = 0; i < 5; i++) { G.act(S, { type: 'wait' }); if (S.run.player.hp < hp) hit = true; }
  assert(hit, 'diagonal enemy attack'); eq(e.x, 6);
});
test('稲妻の杖は斜めにも飛び、角で止まる', () => {
  const S = newRun(55); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 8, 8);
  const st = G.makeItem(S, 'thunder_staff', { charges: 3 }); S.run.bag.push(st);
  G.act(S, { type: 'use', uid: st.uid, dir: 'downright' });
  eq(e.hp, 999 - 30, 'diagonal bolt');
  const m = S.run.map; m.tiles[5 * m.w + 6] = DG.WALL; e.hp = 999; e.x = 6; e.y = 6;
  G.act(S, { type: 'use', uid: st.uid, dir: 'downright' });
  eq(e.hp, 999, 'blocked by corner');
});
test('吹き矢ザルは斜め一直線からも撃つが、角越しには撃たない', () => {
  const S = newRun(56); bigRoomFloor(S);
  const mk = addEnemy(S, 'monkey', 8, 8);
  assert(G.clearLine(S.run, mk, S.run.player, 4), 'diagonal line');
  const m = S.run.map; m.tiles[6 * m.w + 7] = DG.WALL;
  assert(!G.clearLine(S.run, mk, S.run.player, 4), 'corner blocks');
});

console.log('ダッシュ');
// 部屋(2..21 x 2..13) の右に長い通路、途中に分かれ道
function corridorFloor(S) {
  bigRoomFloor(S);
  const m = S.run.map;
  for (let x = 22; x < 31; x++) m.tiles[8 * m.w + x] = DG.CORR;   // 通路 y=8
  for (let y = 9; y < 12; y++) m.tiles[y * m.w + 27] = DG.CORR;   // x=27 で下へ分岐
  S.run.stairs = { x: 3, y: 13 };
  G.updateVision(S.run);
}
function dashUntilStop(S, dir, max = 50) {
  let n = 0, out;
  do { out = G.dashStep(S, dir); if (out.res.consumed) n++; } while (!out.stop && n < max);
  return { n, stop: out.stop };
}
test('ダッシュは1マスごとに1ターン進み、敵も毎回1回行動。壁の前で止まる', () => {
  const S = newRun(60); bigRoomFloor(S);
  const run = S.run;
  // 見えない場所の敵（部屋の外の別区画）
  const m = run.map; m.tiles[20 * m.w + 30] = DG.FLOOR; m.rooms.push({ id: 1, x: 30, y: 20, w: 1, h: 1 });
  const e = addEnemy(S, 'turtle', 30, 20); e.type = 'frog';
  run.player.x = 5; run.player.y = 4; G.updateVision(run);
  const t0 = run.turn;
  const r = dashUntilStop(S, 'right');
  eq(r.stop, 'wall'); eq(run.player.x, 21); eq(run.turn - t0, r.n); eq(r.n, 16);
  eq(e.acts, r.n, 'enemy acted once per step');
});
test('ダッシュ：新しく敵が見えたら止まり、押した先の敵には自動攻撃しない', () => {
  const S = newRun(61); corridorFloor(S);
  const run = S.run;
  const e = addEnemy(S, 'frog', 30, 8); e.sleep = 99;
  run.player.x = 27; run.player.y = 8; G.updateVision(run);
  let ctx = G.dashContext(S), out;
  do { out = G.dashStep(S, 'right', ctx); } while (!out.stop);
  eq(out.stop, 'enemy'); eq(run.player.x, 29);
  const t = run.turn;
  out = G.dashStep(S, 'right', G.dashContext(S));
  eq(out.stop, 'attackBlocked'); eq(e.hp, 999); eq(run.turn, t);
});
test('ダッシュ：安全停止のあと押し直すと、すでに見えている敵では止まらず進める（動けなくならない）', () => {
  const S = newRun(69); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 15, 12); e.sleep = 99;
  // 旧仕様なら毎回「敵が見えた」で止まっていた状況
  const ctx = G.dashContext(S); let out, n = 0;
  do { out = G.dashStep(S, 'right', ctx); n++; } while (!out.stop && n < 40);
  eq(out.stop, 'wall'); eq(S.run.player.x, 21); eq(n, 16);
});
test('ダッシュ：通路の分かれ道・部屋の出入りで止まる', () => {
  const S = newRun(62); corridorFloor(S);
  const run = S.run; run.player.x = 18; run.player.y = 8; G.updateVision(run);
  let r = dashUntilStop(S, 'right');
  eq(r.stop, 'room'); eq(run.player.x, 23, 'stop after leaving room (doorway counts as room)');
  r = dashUntilStop(S, 'right');
  eq(r.stop, 'branch'); eq(run.player.x, 27);
  r = dashUntilStop(S, 'right');
  eq(r.stop, 'wall'); eq(run.player.x, 30);
});
test('ダッシュ：足元の道具・階段で止まる', () => {
  const S = newRun(63); bigRoomFloor(S);
  const run = S.run;
  run.floorItems.push({ x: 9, y: 5, item: G.makeItem(S, 'herb') });
  let r = dashUntilStop(S, 'right');
  eq(r.stop, 'item'); eq(run.player.x, 9);
  run.player.x = 3; run.player.y = 5; run.stairs = { x: 3, y: 9 }; G.updateVision(run);
  r = dashUntilStop(S, 'down');
  eq(r.stop, 'stairs'); eq(run.player.y, 9);
});
test('ダッシュ：被ダメージ・HP/満腹度が新たに危険域になると止まる。危険域から押し直すと進める', () => {
  const S = newRun(64); bigRoomFloor(S);
  const p = S.run.player;
  p.hunger = 0; p.starveAcc = 1; p.hp = 25;
  let out = G.dashStep(S, 'right', G.dashContext(S)); eq(out.stop, 'damage');
  p.hunger = 50; p.hp = 10;
  let ctx = G.dashContext(S);  // 開始時点で危険域でない
  p.hp = 9; ctx.danger = false;
  out = G.dashStep(S, 'right', ctx); eq(out.stop, 'danger', 'newly dangerous');
  // すでに危険域から押し直した場合は進み続ける（壁まで）
  ctx = G.dashContext(S); assert(ctx.danger);
  const x = p.x; let n = 0;
  do { out = G.dashStep(S, 'right', ctx); n++; } while (!out.stop && n < 30);
  assert(p.x > x + 3, 'keeps moving'); eq(out.stop, 'wall');
  p.hp = p.maxhp; p.hunger = 11; p.hungerAcc = D.PLAYER.hungerTurns - 1; p.x = 3; G.updateVision(S.run);
  out = G.dashStep(S, 'right', G.dashContext(S)); eq(out.stop, 'danger', 'hunger hits 10');
});
test('ダッシュの1歩ごとに敵が1回ずつ行動し、満腹度も減る（省略しない）', () => {
  const S = newRun(66); bigRoomFloor(S);
  const run = S.run; const m = run.map;
  m.tiles[20 * m.w + 30] = DG.FLOOR; m.rooms.push({ id: 1, x: 30, y: 20, w: 1, h: 1 });
  const e = addEnemy(S, 'frog', 30, 20);
  run.player.x = 3; run.player.y = 4; run.player.hungerAcc = 0; G.updateVision(run);
  const ctx = G.dashContext(S); let out, n = 0;
  do { out = G.dashStep(S, 'right', ctx); if (out.res.consumed) n++; } while (!out.stop);
  eq(e.acts, n); eq(run.turn, n); eq(run.player.hunger, 100 - Math.floor(n / D.PLAYER.hungerTurns));
});
console.log('通常移動の長押し');
test('長押し：隣に敵が来たら止まる・攻撃になったら止まる（攻撃を繰り返さない）', () => {
  const S = newRun(67); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 9, 5); e.sleep = 99;
  let r = G.act(S, { type: 'move', dir: 'right' }); eq(G.walkCheck(S, 'right', r), null);
  r = G.act(S, { type: 'move', dir: 'right' }); eq(G.walkCheck(S, 'right', r), null);
  r = G.act(S, { type: 'move', dir: 'right' }); eq(G.walkCheck(S, 'right', r), 'near'); eq(S.run.player.x, 8);
  r = G.act(S, { type: 'move', dir: 'right' }); eq(G.walkCheck(S, 'right', r), 'attackBlocked', 'attack stops hold');
  r = G.act(S, { type: 'move', dir: 'upleft' }); eq(G.walkCheck(S, 'upleft', r), null, 'diagonal walk ok');
});
console.log('休息（向きボタン長押し）');
test('休息：1回ごとに通常の待機1ターン。自然回復・敵の行動・満腹度は待機と同じ', () => {
  const A = newRun(80); bigRoomFloor(A); const B = newRun(80); bigRoomFloor(B);
  // 見えない場所の敵（両方に同じ配置）
  for (const S of [A, B]) { const m = S.run.map; m.tiles[20 * m.w + 30] = DG.FLOOR; m.rooms.push({ id: 1, x: 30, y: 20, w: 1, h: 1 }); addEnemy(S, 'frog', 30, 20); S.run.player.hp = 10; }
  for (let i = 0; i < 12; i++) { G.restStep(A); G.act(B, { type: 'wait' }); }
  eq(SV.serialize(A), SV.serialize(B), 'rest == wait');
  assert(A.run.player.hp > 10, 'natural regen'); eq(A.run.turn, 12); eq(A.run.enemies[0].acts, 12);
});
test('休息：開始できない条件（敵が見える・HP満タン・満腹度危険・毒）は1ターンも進めない', () => {
  const S = newRun(81); bigRoomFloor(S); const p = S.run.player;
  let r = G.restStep(S); eq(r.stop, 'full'); eq(S.run.turn, 0);
  p.hp = 10; p.hunger = 8; r = G.restStep(S); eq(r.stop, 'hunger'); eq(S.run.turn, 0);
  p.hunger = 80; p.poison = 3; r = G.restStep(S); eq(r.stop, 'poison'); eq(S.run.turn, 0);
  p.poison = 0; const e = addEnemy(S, 'frog', 15, 10); e.sleep = 99;
  r = G.restStep(S); eq(r.stop, 'enemy'); eq(S.run.turn, 0);
});
test('休息：全回復・敵の出現・被ダメージで止まる', () => {
  const S = newRun(82); bigRoomFloor(S); const p = S.run.player;
  p.hp = p.maxhp - 1; p.regenAcc = 0.99;
  let r = G.restStep(S); eq(r.stop, 'full'); eq(p.hp, p.maxhp);
  p.hp = 10; p.hunger = 0; p.starveAcc = 1;
  p.hunger = 50;
  // 通路の先（見えない所）から敵が近づいて視界に入る
  const S2 = newRun(83); corridorFloor(S2); const q = S2.run.player; q.x = 25; q.y = 8; q.hp = 10; G.updateVision(S2.run);
  const e = addEnemy(S2, 'frog', 29, 8);
  let n = 0; do { r = G.restStep(S2); n++; } while (!r.stop && n < 10);
  eq(r.stop, 'newEnemy'); assert(n <= 3, 'stopped promptly ' + n);
  const S3 = newRun(84); bigRoomFloor(S3); S3.run.player.hp = 10; S3.run.player.hunger = 0; S3.run.player.starveAcc = 1;
  S3.run.player.hunger = 0;
  r = G.restStep(S3); eq(r.stop, 'hunger', 'starving cannot rest');
});

console.log('持ち物の整理');
test('整理：種類順・同種は基本種類と強化値順。何度押しても同じ。数・強化値・装備・貸出は変わらない', () => {
  const S = G.newState();
  const mk = (id, ex) => G.makeItem(S, id, ex);
  const bag = [mk('golden_lotus'), mk('herb'), mk('amber_shard'), mk('return_scroll'), mk('bronze_sword', { plus: 1 }), mk('banana'),
    mk('turtle_shield', { eq: true }), mk('sleep_incense'), mk('wood_sword'), mk('antidote'), mk('bronze_sword', { plus: 3, eq: true }), mk('loan_rice'), mk('thunder_staff', { charges: 2 })];
  const before = JSON.stringify(bag.slice().sort((a, b) => a.uid - b.uid));
  G.sortItems(bag);
  const types = bag.map((i) => G.def(i).type);
  eq(types.join(','), 'weapon,weapon,weapon,shield,food,food,heal,cure,sleep,staff,return,material,treasure');
  eq(bag[0].id, 'wood_sword'); eq(bag[1].plus, 3); eq(bag[2].plus, 1);
  const once = bag.map((i) => i.uid).join();
  G.sortItems(bag); G.sortItems(bag);
  eq(bag.map((i) => i.uid).join(), once, 'stable');
  eq(JSON.stringify(bag.slice().sort((a, b) => a.uid - b.uid)), before, 'attributes unchanged');
  assert(bag.find((i) => i.plus === 3).eq && bag.find((i) => i.id === 'turtle_shield').eq, 'equipment kept');
});
test('探索中の整理はターンを消費しない（敵も動かない）', () => {
  const S = newRun(68); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 15, 10);
  S.run.bag.push(G.makeItem(S, 'herb'), G.makeItem(S, 'bronze_sword'));
  const t = S.run.turn;
  G.sortItems(S.run.bag);
  eq(S.run.turn, t); eq(e.acts, 0); eq(S.run.bag[0].id, 'bronze_sword');
});
test('ダッシュ：帰還地点で止まる', () => {
  const S = newRun(65); bigRoomFloor(S);
  S.run.returnPoint = { x: 8, y: 5 };
  const r = dashUntilStop(S, 'right');
  eq(r.stop, 'returnPoint'); eq(S.run.player.x, 8);
});

console.log('敵の役割と予告攻撃');
function realEnemy(S, type, x, y, floor) {
  const run = S.run; const old = run.floor; run.floor = floor || old;
  const e = G.makeEnemy(run, type, x, y); run.floor = old; run.enemies.push(e); G.updateVision(run); return e;
}
test('石像の戦士：隣で振りかぶり（予告）、離れればかわせて、その後に隙がある', () => {
  const S = newRun(70); bigRoomFloor(S);
  const p = S.run.player; p.hp = p.maxhp = 500;
  const e = realEnemy(S, 'statue', 6, 5, 9);
  let r = G.act(S, { type: 'wait' });
  assert(e.charge && r.events.some((x) => x.t === 'telegraph'), 'charging'); eq(p.hp, 500, 'no damage on telegraph');
  r = G.act(S, { type: 'move', dir: 'left' }); // 予告マスから離れる
  assert(!e.charge, 'resolved'); eq(p.hp, 500, 'dodged'); eq(e.rest, 1, 'gap after heavy');
  const x = e.x; G.act(S, { type: 'wait' }); eq(e.x, x, 'resting');
});
test('石像の戦士：その場にいると大ダメージ。眠らせると予告が中断', () => {
  const S = newRun(71); bigRoomFloor(S);
  const p = S.run.player; p.hp = p.maxhp = 500;
  const e = realEnemy(S, 'statue', 6, 5, 9);
  G.act(S, { type: 'wait' }); G.act(S, { type: 'wait' });
  assert(500 - p.hp >= Math.round(e.atk * 1.5), 'heavy hit ' + (500 - p.hp));
  const S2 = newRun(72); bigRoomFloor(S2);
  const e2 = realEnemy(S2, 'statue', 6, 5, 9);
  G.act(S2, { type: 'wait' }); assert(e2.charge);
  const inc = G.makeItem(S2, 'sleep_incense'); S2.run.bag.push(inc);
  const hp = S2.run.player.hp;
  G.act(S2, { type: 'use', uid: inc.uid });
  assert(!e2.charge, 'charge canceled by sleep'); eq(S2.run.player.hp, hp);
});
test('予告攻撃は見えていない敵からは始まらない（理不尽な大ダメージなし）', () => {
  const S = newRun(73); bigRoomFloor(S);
  const run = S.run, m = run.map;
  // 通路の先（見えない位置）に番兵
  for (let x = 22; x < 30; x++) m.tiles[5 * m.w + x] = DG.CORR;
  run.player.x = 21; run.player.y = 5; G.updateVision(run);
  const e = realEnemy(S, 'guard', 25, 5, 27);
  assert(!G.isVisible(run, 25, 5));
  G.act(S, { type: 'wait' });
  assert(!e.charge, 'no charge when unseen');
});
test('結晶ゴーレム：周囲8マスを予告してから攻撃。2マス離れればかわせる', () => {
  const S = newRun(74); bigRoomFloor(S);
  const p = S.run.player; p.hp = p.maxhp = 900;
  const e = realEnemy(S, 'golem', 6, 6, 22);
  for (let i = 0; i < 2 && !e.charge; i++) G.act(S, { type: 'wait' });
  assert(e.charge && e.charge.tiles.length >= 8, 'area telegraph');
  G.act(S, { type: 'move', dir: 'upleft' });
  for (let i = 0; i < 2 && e.charge; i++) G.act(S, { type: 'move', dir: 'left' });
  eq(p.hp >= 899, true, 'dodged area');
});
test('ヤミコウモリは1ターンに2歩動く', () => {
  const S = newRun(75); bigRoomFloor(S);
  const e = realEnemy(S, 'bat', 15, 5, 11);
  G.act(S, { type: 'wait' });
  eq(e.x, 13, 'two steps'); eq(e.acts, 1, 'one action');
});
test('苔の祈祷師は傷ついた仲間を回復する', () => {
  const S = newRun(76); bigRoomFloor(S);
  const ally = realEnemy(S, 'jelly', 18, 10, 12); ally.hp = 5;
  const sh = realEnemy(S, 'shaman', 15, 10, 12);
  ally.sleep = 50;
  G.act(S, { type: 'wait' });
  assert(ally.hp > 5, 'healed ' + ally.hp);
});
test('毒：かかると毎ターン減り自然回復しない。治った直後は再びかからない。薬草で治る', () => {
  const S = newRun(77); bigRoomFloor(S);
  const p = S.run.player; p.hp = p.maxhp = 200;
  p.poison = 3;
  G.act(S, { type: 'wait' }); assert(p.hp < 200, 'poison dmg');
  G.act(S, { type: 'wait' }); G.act(S, { type: 'wait' });
  eq(p.poison, 0); assert(p.poisonGuard > 0, 'guard');
  const lz = realEnemy(S, 'lizard', 6, 5, 16); lz.atk = 1;
  for (let i = 0; i < 8; i++) G.act(S, { type: 'wait' });
  eq(p.poison, 0, 'no repoison during guard');
  p.poison = 5; const h = G.makeItem(S, 'herb'); S.run.bag.push(h);
  G.act(S, { type: 'use', uid: h.uid }); eq(p.poison, 0, 'herb cures');
});
test('金ぴかザル：お金を盗んで逃げ、倒すと取り返せる', () => {
  const S = newRun(78); bigRoomFloor(S);
  const run = S.run; run.runGold = 200;
  const m = run.map; m.rooms.push({ id: 1, x: 25, y: 16, w: 4, h: 3 });
  for (let y = 16; y < 19; y++) for (let x = 25; x < 29; x++) m.tiles[y * m.w + x] = DG.FLOOR;
  const t = realEnemy(S, 'thief', 6, 5, 17);
  G.act(S, { type: 'wait' });
  eq(run.runGold, 170); eq(t.stolen, 30); assert(t.x >= 25, 'fled');
  t.hp = 1; t.x = 6; t.y = 5; t.flee = false; G.updateVision(run);
  for (let i = 0; i < 10 && run.enemies.includes(t); i++) G.act(S, { type: 'move', dir: 'right' });
  eq(run.runGold, 200, 'returned');
});
test('以前の版のボス（更新前から続く探索）：一定間隔で予告つきの大技、その後2ターンの隙。大ナマズ王は仲間を呼ぶ（上限あり）', () => {
  const S = newRun(79); delete S.run.chapter;   // 以前の版のルールの探索
  goToFloor(S, 20);
  const run = S.run, b = run.enemies.find((e) => e.boss);
  eq(b.type, 'catfish');
  run.player.hp = run.player.maxhp = 99999;
  run.player.x = b.x - 1; run.player.y = b.y; G.updateVision(run);
  let tele = 0, rests = 0;
  for (let i = 0; i < 40; i++) {
    const r = G.act(S, { type: 'wait' });
    if (r.events.some((x) => x.t === 'telegraph')) tele++;
    if (b.rest > 0) rests++;
  }
  assert(tele >= 4, 'telegraphs ' + tele); assert(rests >= 4, 'gaps');
  const minions = run.enemies.filter((e) => e.summoned).length;
  assert(minions >= 1 && minions <= 2, 'summons capped ' + minions);
});

console.log('道具・装備・満腹度');
test('薬草で回復、食料で満腹度回復、使うとターン消費', () => {
  const S = newRun(10); bigRoomFloor(S);
  const run = S.run;
  const h = G.makeItem(S, 'herb'); const b = G.makeItem(S, 'banana');
  run.bag.push(h, b);
  run.player.hp = 5; run.player.hunger = 20;
  let r = G.act(S, { type: 'use', uid: h.uid });
  assert(r.consumed); assert(run.player.hp >= 40 || run.player.hp === run.player.maxhp, 'healed ' + run.player.hp);
  r = G.act(S, { type: 'use', uid: b.uid });
  eq(run.player.hunger, 65); eq(run.turn, 2);
  assert(!run.bag.includes(h) && !run.bag.includes(b));
});
test('眠りのお香で見えている敵が眠る', () => {
  const S = newRun(11); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 9, 5);
  const it = G.makeItem(S, 'sleep_incense'); S.run.bag.push(it);
  G.act(S, { type: 'use', uid: it.uid });
  assert(e.sleep >= 9, 'sleeping ' + e.sleep);
  const x = e.x; G.act(S, { type: 'wait' }); eq(e.x, x);
});
test('稲妻の杖は直線上の最初の敵に当たり、残数が減る', () => {
  const S = newRun(12); bigRoomFloor(S);
  const e1 = addEnemy(S, 'turtle', 9, 5), e2 = addEnemy(S, 'frog', 12, 5);
  const st = G.makeItem(S, 'thunder_staff', { charges: 2 }); S.run.bag.push(st);
  G.act(S, { type: 'use', uid: st.uid, dir: 'right' });
  eq(e1.hp, 999 - 30); eq(e2.hp, 999); eq(st.charges, 1);
  G.act(S, { type: 'use', uid: st.uid, dir: 'right' });
  G.act(S, { type: 'use', uid: st.uid, dir: 'right' });
  eq(st.charges, 0); assert(S.run.bag.includes(st), 'empty staff stays');
});
test('装備で攻撃力・防御力が変わり、装備変更はターン消費。武器は1本だけ装備', () => {
  const S = newRun(13); bigRoomFloor(S);
  const run = S.run;
  const a0 = G.playerAtk(run);
  const sw = G.makeItem(S, 'iron_katana', { plus: 2 }), sw2 = G.makeItem(S, 'bronze_sword'), sh = G.makeItem(S, 'turtle_shield');
  run.bag.push(sw, sw2, sh);
  let r = G.act(S, { type: 'equip', uid: sw.uid }); assert(r.consumed);
  eq(G.playerAtk(run), a0 + 8);
  G.act(S, { type: 'equip', uid: sw2.uid });
  assert(!sw.eq && sw2.eq, 'one weapon');
  G.act(S, { type: 'equip', uid: sh.uid });
  eq(G.playerDef(run), 7); eq(run.turn, 3);
});
test('バッグ満杯で拾えず、床の道具も手持ちも消えない（ターン消費なし）', () => {
  const S = newRun(14); bigRoomFloor(S);
  const run = S.run;
  while (run.bag.length < D.BAG_SIZE) run.bag.push(G.makeItem(S, 'herb'));
  const lotus = G.makeItem(S, 'golden_lotus');
  run.floorItems.push({ x: 6, y: 5, item: lotus });
  G.act(S, { type: 'move', dir: 'right' });
  eq(run.bag.length, D.BAG_SIZE); assert(run.floorItems.some((f) => f.item === lotus), 'still on floor');
  const r = G.act(S, { type: 'pickup' }); assert(!r.consumed);
  // 1つ置くと拾える
  const herb = run.bag[run.bag.length - 1];
  run.player.x = 7; G.updateVision(run);
  G.act(S, { type: 'drop', uid: herb.uid });
  eq(run.bag.length, D.BAG_SIZE - 1);
  run.player.x = 6; G.updateVision(run);
  G.act(S, { type: 'pickup' });
  assert(run.bag.includes(lotus));
});
test('満腹度が減り、0になると自然回復せずHPが減り、空腹で倒れる', () => {
  const S = newRun(15); bigRoomFloor(S);
  const run = S.run, p = run.player;
  for (let i = 0; i < D.PLAYER.hungerTurns * 3; i++) G.act(S, { type: 'wait' });
  eq(p.hunger, 97);
  p.hp = 10; p.hunger = 1; p.hungerAcc = D.PLAYER.hungerTurns - 1;
  G.act(S, { type: 'wait' }); eq(p.hunger, 0);
  let guard = 0;
  while (!run.over && guard++ < 100) G.act(S, { type: 'wait' });
  assert(run.over, 'died');
  eq(run.result.type, 'dead'); eq(run.result.cause, '空腹で倒れた');
});
test('満腹度があるとHPが自然回復する', () => {
  const S = newRun(16); bigRoomFloor(S);
  S.run.player.hp = 10;
  for (let i = 0; i < 30; i++) G.act(S, { type: 'wait' });
  assert(S.run.player.hp > 10 + 5, 'regen ' + S.run.player.hp);
});

console.log('敗北・帰還');
test('敗北：持ち物と探索中のお金を失い、村の資金・倉庫・施設は残る', () => {
  const S = newRun(20, (S) => {
    S.village.funds = 500; S.village.stage = 2;
    S.village.storage.push(G.makeItem(S, 'golden_lotus'));
    S.village.bag.push(G.makeItem(S, 'iron_katana'));
  });
  bigRoomFloor(S);
  S.run.runGold = 300;
  S.run.player.hp = 1;
  const e = addEnemy(S, 'frog', 6, 5); e.atk = 50;
  let guard = 0;
  while (!S.run.over && guard++ < 50) G.act(S, { type: 'wait' });
  eq(S.run.result.type, 'dead'); assert(/ガマ蛙/.test(S.run.result.cause));
  const res = G.finishRun(S);
  eq(res.floor, 1); eq(S.run, null);
  eq(S.village.funds, 500); eq(S.village.bag.length, 0); eq(S.village.storage.length, 1); eq(S.village.stage, 2);
});
test('帰還の巻物：持ち物と探索中のお金を持ち帰り、巻物は消える。敵は動かない', () => {
  const S = newRun(21); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 9, 9);
  S.run.runGold = 123;
  S.run.bag.push(G.makeItem(S, 'jade_elephant'));
  const fundsBefore = S.village.funds;
  const r = G.useReturnScroll(S);
  assert(!r.consumed); eq(e.acts, 0); assert(S.run.over);
  G.finishRun(S);
  eq(S.village.funds, fundsBefore + 123);
  assert(S.village.bag.some((i) => i.id === 'jade_elephant'));
  assert(!S.village.bag.some((i) => i.id === 'return_scroll'), 'scroll removed');
});
test('帰還の祠は地下25階に1か所だけ。ボスの階には置かない（第1・2章は25階に届かず、第3章は25階がボス）。祠から帰れる', () => {
  const want = { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1, 6: 1 };
  for (let s = 0; s < 30; s++) {
    const ch = (s % 6) + 1, T = newRun(300 + s, (S0) => { S0.village.story.chapter = ch; });
    let count = 0;
    for (;;) {
      const r = T.run;
      if (r.returnPoint) { count++; eq(r.floor, 25); assert(!DG.same(r.returnPoint, r.stairs)); }
      if (r.floor === 25) eq(!!r.returnPoint, !G.F(r).boss, 'shrine on 25F unless boss floor');
      if (G.F(r).boss || r.floor >= 30) break;
      r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(T, { type: 'descend' });
    }
    eq(count, want[ch], 'shrines in chapter ' + ch);
  }
  const S = newRun(22, (S0) => { S0.village.story.chapter = 4; });
  while (S.run.floor < 25) { const p = S.run.player; p.x = S.run.stairs.x; p.y = S.run.stairs.y; G.act(S, { type: 'descend' }); }
  eq(S.run.floor, 25);
  S.run.player.x = S.run.returnPoint.x; S.run.player.y = S.run.returnPoint.y;
  G.act(S, { type: 'returnHome' });
  assert(S.run.over); eq(S.run.result.type, 'return');
  G.finishRun(S); eq(S.village.returns, 1); eq(S.village.bestFloor, 25);
});

console.log('村');
test('売買：お宝を売ると村の資金が増え、買うと減る。買値は必ず売値より高い', () => {
  const S = G.newState();
  S.village.funds = 0;
  const lotus = G.makeItem(S, 'golden_lotus'); S.village.bag.push(lotus);
  const r = G.sell(S, lotus.uid); assert(r.ok); eq(S.village.funds, 260);
  assert(G.buy(S, 'herb').ok); eq(S.village.funds, 230);
  for (const [id, d] of Object.entries(D.ITEMS)) if (d.price) assert(d.price > d.sell, 'price>sell ' + id);
  assert(!G.buy(S, 'elixir').ok, 'not in stage1 stock');
});
test('倉庫：預ける・取り出す、20枠の上限、拡張で40枠', () => {
  const S = G.newState();
  for (let i = 0; i < 25; i++) S.village.storage.length < 20 && S.village.storage.push(G.makeItem(S, 'herb'));
  const it = G.makeItem(S, 'banana'); S.village.bag.push(it);
  assert(!G.deposit(S, it.uid).ok, 'full at 20');
  S.village.funds = 1000; assert(G.upgradeVillage(S).ok); eq(S.village.stage, 2); eq(S.village.funds, 800);
  assert(G.deposit(S, it.uid).ok); eq(S.village.storage.length, 21);
  assert(G.withdraw(S, it.uid).ok); assert(S.village.bag.includes(it));
});
test('村の発展：費用を消費、資金不足では不可、3段階で鍛冶屋', () => {
  const S = G.newState();
  S.village.funds = 100; assert(!G.upgradeVillage(S).ok); eq(S.village.stage, 1);
  S.village.funds = 800; G.upgradeVillage(S); G.upgradeVillage(S);
  eq(S.village.stage, 3); eq(S.village.funds, 0); assert(!G.upgradeVillage(S).ok);
});
test('鍛冶屋：お金を払って+3まで強化。売値の上昇は強化費用より小さい', () => {
  const S = G.newState(); S.village.stage = 3; G.applyFacilities(S.village); S.village.funds = 10000;
  const sw = G.makeItem(S, 'bronze_sword'); S.village.bag.push(sw);
  for (let i = 0; i < 5; i++) G.smith(S, sw.uid);
  eq(sw.plus, 3); eq(S.village.funds, 10000 - 80 - 160 - 240);
  assert(D.SMITH.sellPerPlus < D.SMITH.cost(0));
  const loan = G.makeItem(S, 'wood_sword'); S.village.bag.push(loan);
  assert(!G.smith(S, loan.uid).ok, 'loan cannot be upgraded');
});
test('木刀なしの新規開始と再出発：木刀は渡されず自動装備もされない。素手で1階の敵を倒せ、2階から武器が拾える。持っている木刀は消えない', () => {
  const S = G.newState(), V = S.village;
  assert(!V.bag.some((i) => i.id === 'wood_sword'), 'no sword at start');
  assert(!G.loanStatus(S).weapon && !G.takeLoan(S, 'weapon').ok, 'no sword loan');
  G.takeLoan(S, 'food');
  for (let k = 0; k < 3; k++) {
    G.depart(S, 600 + k);
    assert(!S.run.bag.some((i) => i.id === 'wood_sword'), 'no sword in run');
    eq(G.equipped(S.run.bag, 'weapon'), null);
    assert(S.run.bag.some((i) => i.id === 'return_scroll'), 'return scroll kept');
    G.useReturnScroll(S); G.finishRun(S);
  }
  assert(!V.bag.some((i) => i.id === 'wood_sword'), 'still no sword after returns');
  // 素手でも1階の敵を倒せる（攻撃して倒れるまでの往復）
  let wins = 0;
  for (let s = 0; s < 20; s++) {
    const T = G.newState(); G.depart(T, 900 + s);
    const r = T.run, e = r.enemies.find((q) => !q.boss);
    if (!e) continue;
    let guard = 0;
    while (r.enemies.includes(e) && r.player.hp > 0 && guard++ < 60) {
      const p = r.player; let placed = false;
      for (const [dir, [dx, dy]] of Object.entries(G.DIRS)) { const x = e.x - dx, y = e.y - dy; if (!dx || !dy) if (G.canStep(r.map, x, y, dx, dy) && !G.enemyAt(r, x, y)) { p.x = x; p.y = y; G.updateVision(r); G.act(T, { type: 'move', dir }); placed = true; break; } }
      if (!placed) break;
    }
    if (!r.enemies.includes(e) && r.player.hp > 0) wins++;
  }
  assert(wins >= 18, 'bare hands beat floor-1 enemies: ' + wins + '/20');
  for (const f of [2, 3, 4]) assert(D.floorFor(1, f).items.some(([id]) => D.ITEMS[id].type === 'weapon'), 'weapon drops on ' + f);
  // 以前のセーブで持っていた木刀は、そのまま残る（装備もできる）
  const old = G.newState(); const ws = G.makeItem(old, 'wood_sword', { eq: true }); old.village.bag.push(ws);
  const back = TS.Save.deserialize(TS.Save.serialize(old));
  assert(back.village.bag.some((i) => i.id === 'wood_sword' && i.eq), 'old sword kept');
});
test('無料の貸出品・帰還の巻物では資金を増やせない', () => {
  const S = G.newState();
  assert(!G.takeLoan(S, 'weapon').ok, 'wood sword loan ended'); assert(G.takeLoan(S, 'food').ok);
  assert(!G.takeLoan(S, 'food').ok, 'no double food');
  const funds = S.village.funds;
  for (const it of S.village.bag.slice()) { assert(!G.sell(S, it.uid).ok); assert(!G.deposit(S, it.uid).ok); }
  eq(S.village.funds, funds);
  // 出発→すぐ帰還を繰り返しても巻物はたまらず、お金も増えない
  for (let i = 0; i < 5; i++) {
    G.depart(S, 100 + i);
    eq(S.run.bag.filter((x) => x.id === 'return_scroll').length, 1);
    const scroll = S.run.bag.find((x) => x.id === 'return_scroll');
    S.run.bag.forEach((x) => assert(x.id !== 'return_scroll' || !G.canSell(x)));
    assert(!G.canSell(scroll) && !G.canStore(scroll));
    G.useReturnScroll(S); G.finishRun(S);
    G.takeLoan(S, 'food');
  }
  eq(S.village.funds, funds);
  eq(S.village.bag.filter((x) => x.id === 'loan_rice').length, 1);
  eq(S.village.bag.filter((x) => x.id === 'wood_sword').length, 0);
  eq(S.village.bag.filter((x) => x.id === 'return_scroll').length, 0);
});
test('バッグが満杯だと出発できない（巻物が消えない）', () => {
  const S = G.newState();
  while (S.village.bag.length < D.BAG_SIZE) S.village.bag.push(G.makeItem(S, 'herb'));
  assert(!G.depart(S, 1).ok); eq(S.run, null);
});

console.log('お金の使い道（施設・鍛冶屋・食堂・展示室）');
test('施設：価格・解放条件・素材を確認でき、満たさないと建てられない。建てると効果が出る', () => {
  const S = G.newState(); const V = S.village;
  V.funds = 100000;
  let st = G.facilityStatus(S, 'storage3');
  assert(!st.unlocked && st.missing.includes('storage2') && st.missing.includes('floor10'), 'locked');
  assert(!G.buildFacility(S, 'storage3').ok);
  assert(G.buildFacility(S, 'storage2').ok); eq(G.storageSize(V), 40); eq(V.funds, 100000 - 200);
  V.bestFloor = 10; assert(G.buildFacility(S, 'storage3').ok); eq(G.storageSize(V), 60);
  V.bestFloor = 20; assert(G.buildFacility(S, 'storage4').ok); eq(G.storageSize(V), 80);
  assert(!G.buildFacility(S, 'storage4').ok, 'no double build');
  assert(G.buildFacility(S, 'smith1').ok); eq(G.smithMax(V), 3); eq(V.stage, 3);
  const before = V.funds;
  const r = G.buildFacility(S, 'smith2'); assert(!r.ok && /素材/.test(r.msg), 'needs materials'); eq(V.funds, before, 'no charge on failure');
  V.materials = { amber_shard: 3, bronze_shard: 2 };
  assert(G.buildFacility(S, 'smith2').ok); eq(G.smithMax(V), 5); eq(V.materials.amber_shard, 0); eq(V.materials.bronze_shard, 0);
  assert(G.buildFacility(S, 'lanterns').ok); assert(V.decor.lanterns);
  assert(!G.buildFacility(S, 'statue').ok, 'statue needs donations');
});
test('鍛冶屋：設備の段階で上限+3/+5/+8。+4以降は素材が必要', () => {
  const S = G.newState(); const V = S.village; V.funds = 100000; V.bestFloor = 30;
  G.buildFacility(S, 'storage2'); G.buildFacility(S, 'smith1');
  const sw = G.makeItem(S, 'jade_sword'); V.bag.push(sw);
  for (let i = 0; i < 5; i++) G.smith(S, sw.uid);
  eq(sw.plus, 3, 'cap +3 at Lv1');
  V.materials = { amber_shard: 5, bronze_shard: 5, crystal_shard: 5, gold_leaf: 5 };
  G.buildFacility(S, 'smith2');
  assert(G.smith(S, sw.uid).ok); eq(V.materials.amber_shard, 1); // 3使って建設、1使って強化
  assert(G.smith(S, sw.uid).ok); eq(sw.plus, 5); assert(!G.smith(S, sw.uid).ok, 'cap +5');
  G.buildFacility(S, 'smith3');
  for (let i = 0; i < 5; i++) G.smith(S, sw.uid);
  eq(sw.plus, 8, 'cap +8'); eq(V.materials.bronze_shard, 2); eq(V.materials.crystal_shard, 1); eq(V.materials.gold_leaf, 2);
  // 素材がないと強化できない（お金も減らない）
  const sh = G.makeItem(S, 'moss_shield', { plus: 7 }); V.bag.push(sh); V.materials.gold_leaf = 0;
  const f = V.funds; assert(!G.smith(S, sh.uid).ok); eq(V.funds, f);
  // 強化の総費用は売値の上昇よりずっと大きい
  let total = 0; for (let p = 0; p < 8; p++) total += D.SMITH.cost(p);
  assert(total > 8 * D.SMITH.sellPerPlus * 10, 'no profit from smithing');
});
test('食堂：料理は次の探索だけ有効、重ねがけ不可、帰還・敗北で終わる', () => {
  const S = G.newState(); const V = S.village; V.funds = 5000;
  assert(!G.buyMeal(S, 'gapao').ok, 'no diner');
  G.buildFacility(S, 'storage2'); G.buildFacility(S, 'diner');
  assert(G.buyMeal(S, 'gapao').ok); eq(V.meal, 'gapao');
  assert(G.buyMeal(S, 'tomyum').ok); eq(V.meal, 'tomyum', 'replaced, not stacked');
  const funds = V.funds;
  G.depart(S, 3);
  eq(S.run.meal, 'tomyum'); eq(V.meal, null);
  const atk = G.playerAtk(S.run);
  G.useReturnScroll(S); G.finishRun(S);
  G.depart(S, 4); assert(!S.run.meal, 'meal ended'); eq(G.playerAtk(S.run), atk - 3);
  G.useReturnScroll(S); G.finishRun(S);
  G.buyMeal(S, 'gapao'); G.depart(S, 5); eq(S.run.player.maxhp, 50); eq(S.run.player.hp, 50);
  eq(V.funds, funds - 150);
});
test('食堂：カオマンガイで満腹度が減りにくい', () => {
  const S = G.newState(); const V = S.village; V.funds = 5000;
  G.buildFacility(S, 'storage2'); G.buildFacility(S, 'diner'); G.buyMeal(S, 'kaomangai');
  G.depart(S, 6); bigRoomFloor(S);
  for (let i = 0; i < 120; i++) G.act(S, { type: 'wait' });
  eq(S.run.player.hunger, 100 - Math.floor(120 / G.hungerTurns(S.run)));
  assert(G.hungerTurns(S.run) > D.PLAYER.hungerTurns);
});
test('展示室：同じお宝は1回だけ寄贈でき、お礼も1回だけ。称号と飾りが解放される', () => {
  const S = G.newState(); const V = S.village; V.funds = 5000;
  G.buildFacility(S, 'storage2'); G.buildFacility(S, 'smith1'); G.buildFacility(S, 'museum');
  const a = G.makeItem(S, 'golden_lotus'), b = G.makeItem(S, 'golden_lotus'), h = G.makeItem(S, 'herb');
  V.bag.push(a, b, h);
  const f0 = V.funds;
  const r = G.donate(S, a.uid); assert(r.ok); eq(V.funds, f0 + Math.floor(260 * 0.3));
  assert(!G.donate(S, b.uid).ok, 'same item again'); eq(V.funds, f0 + 78); assert(V.bag.includes(b));
  assert(!G.donate(S, h.uid).ok, 'not a treasure');
  // 売る方が多くもらえる（売る・寄贈の選択）
  assert(G.sellPrice(b) > Math.floor(G.def(b).sell * D.MUSEUM_THANKS));
  for (const id of ['old_coin', 'jade_elephant']) { const it = G.makeItem(S, id); V.storage.push(it); G.donate(S, it.uid); }
  eq(G.donatedCount(V), 3); eq(G.title(V), '見習い収集家');
  assert(G.facilityStatus(S, 'statue').unlocked, 'statue unlocked');
  assert(!G.facilityStatus(S, 'fountain').unlocked);
});
test('浅い階でたまるお金で最初の施設に届き、大きな施設は高額', () => {
  const cheap = D.FACILITIES.filter((f) => f.req.length === 0).map((f) => f.price);
  assert(Math.min(...cheap) <= 300, 'first goal reachable in 1-2 returns');
  assert(G.facility('smith3').price >= 5000 && G.facility('storage4').price >= 3000, 'big goals');
  for (const m of Object.values(D.MEALS)) assert(m.price <= 200 && m.price >= 100);
  // 生活必需品は安い
  assert(D.ITEMS.herb.price <= 40 && D.ITEMS.banana.price <= 30);
});
test('次の目標の表示', () => {
  const S = G.newState(); S.village.funds = 50;
  let g = G.nextGoals(S); eq(g.can.length, 0); eq(g.next.id, 'storage2'); eq(g.need, 150);
  S.village.funds = 250; g = G.nextGoals(S); assert(g.can.some((f) => f.id === 'storage2'));
});

console.log('保存と読み込み');
test('探索途中を保存・読み込みしても状態が一致し、その後の展開も同じ（増殖しない）', () => {
  const S = newRun(30);
  const dirs = ['up', 'down', 'left', 'right'];
  for (let i = 0; i < 60 && !S.run.over; i++) G.act(S, { type: 'move', dir: dirs[(i * 7) % 4] });
  const text = SV.serialize(S);
  const L = SV.deserialize(text);
  eq(SV.serialize(L), text, 'roundtrip');
  for (let i = 0; i < 80; i++) {
    const a = { type: 'move', dir: dirs[(i * 3 + 1) % 4] };
    G.act(S, a); G.act(L, a);
  }
  eq(SV.serialize(L), SV.serialize(S), 'same future');
  // 何度読み込んでも道具や敵の数は同じ
  const counts = (X) => X.run ? X.run.floorItems.length + X.run.bag.length + X.run.enemies.length : -1;
  const L2 = SV.deserialize(SV.serialize(S)), L3 = SV.deserialize(SV.serialize(L2));
  eq(counts(L3), counts(S));
});
test('古い形式（項目が欠けた）データも読み込める', () => {
  const old = { version: 1, village: { funds: 77, stage: 2, bag: [], storage: [], nextUid: 5 }, run: null };
  const L = SV.deserialize(JSON.stringify(old));
  eq(L.village.funds, 77); eq(L.village.cleared, false); assert(L.settings && L.settings.sound === true);
  assert(SV.deserialize('壊れたデータ') === null);
});

const fs = require('fs'), path = require('path');
const fixture = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
test('旧セーブ（v1・探索途中）を移行：村・倉庫・装備・探索中の状態を引き継ぎ、続きから遊べる', () => {
  const raw = JSON.parse(fixture('save-v1-midrun.json'));
  const L = SV.deserialize(fixture('save-v1-midrun.json'));
  eq(L.version, D.SAVE_VERSION);
  eq(L.village.funds, raw.village.funds); eq(L.village.stage, raw.village.stage);
  eq(JSON.stringify(L.village.storage), JSON.stringify(raw.village.storage));
  eq(L.run.floor, 4); eq(L.run.turn, raw.run.turn); eq(L.run.player.hp, raw.run.player.hp);
  eq(JSON.stringify(L.run.bag), JSON.stringify(raw.run.bag));
  eq(JSON.stringify(L.run.enemies), JSON.stringify(raw.run.enemies));
  eq(L.run.player.poison, 0);
  // 続けて遊べる（4階→11階まで降りられる）
  for (let i = 0; i < 20; i++) G.act(L, { type: 'wait' });
  if (!L.run.over) { goToFloor(L, 11); eq(L.run.floor, 11); eq(D.FLOORS[11].theme, 'garden'); }
  // 再保存→再読み込みで一致
  const t = SV.serialize(L); eq(SV.serialize(SV.deserialize(t)), t);
});
test('旧セーブ（v1・10階クリア済み）を移行：旧記録として残し、30階の目標とは区別。お金・装備は減らない', () => {
  const raw = JSON.parse(fixture('save-v1-cleared.json'));
  const L = SV.deserialize(fixture('save-v1-cleared.json'));
  eq(L.village.legacyClear10, true); eq(L.village.cleared, false); eq(L.village.legacyClears, 1);
  eq(L.village.funds, raw.village.funds); eq(L.village.stage, 3); eq(L.village.bestFloor, 10);
  assert(L.village.built.storage2 && L.village.built.smith1, 'facilities from old stage'); eq(L.village.smithLv, 1); eq(L.village.storageLv, 2); eq(G.storageSize(L.village), 40);
  eq(JSON.stringify(L.village.bag), JSON.stringify(raw.village.bag));
  eq(JSON.stringify(L.village.storage), JSON.stringify(raw.village.storage));
  assert(G.depart(L, 5).ok, 'can depart');
});
test('旧セーブの探索途中に旧・宝珠があれば守護の輝石に置き換え、旧記録にする（新エンディング扱いにしない）', () => {
  const data = JSON.parse(fixture('save-v1-midrun.json'));
  data.run.bag.push({ uid: 999, id: 'wish_orb', plus: 0 });
  const L = SV.deserialize(JSON.stringify(data));
  assert(!L.run.bag.some((i) => i.id === 'wish_orb') && L.run.bag.some((i) => i.uid === 999 && i.id === 'guardian_gem'));
  eq(L.village.legacyClear10, true);
  G.useReturnScroll(L); const res = G.finishRun(L);
  assert(!res.orb && !L.village.cleared);
});

console.log('ボス・宝珠・エンディング');
test('第1章：10階・14階にボスはいない。15階でクロコダイン。倒すと報酬と帰還口（16階へは進めない）。帰ると第2章', () => {
  const S = newRun(40);
  eq(S.run.layout, D.LAYOUT); eq(G.maxFloor(S.run), 15);
  goToFloor(S, 10); assert(!G.F(S.run).boss && !S.run.enemies.some((e) => e.boss), 'no boss at 10');
  goToFloor(S, 14); assert(!S.run.enemies.some((e) => e.boss), 'no boss at 14');
  goToFloor(S, 15);
  const run = S.run;
  eq(run.enemies.find((e) => e.boss).type, 'croc');
  defeatBoss(S);
  assert(!run.stairs, 'no stairs (16F locked)'); assert(run.portal, 'portal');
  assert(run.floorItems.some((f) => f.item && f.item.id === 'dragon_shield'), 'reward');
  eq(S.village.story.defeated.croc, true); eq(S.village.story.chapter, 1, 'chapter advances on return');
  run.player.x = run.portal.x; run.player.y = run.portal.y;
  G.act(S, { type: 'returnHome' });
  const funds = S.village.funds;
  const res = G.finishRun(S);
  eq(res.chapterClear, 1); eq(S.village.story.chapter, 2); eq(S.village.funds, funds + res.gold + D.CHAPTERS[1].reward.funds);
  assert(S.village.story.rewardClaimed.croc && S.village.story.returnDone.croc);
  eq(S.village.story.pending.type, 'chapterClear'); eq(S.village.story.records, 2);
  assert(!S.village.cleared);
});
test('次の章も1階から。第2章の20階はフレイザード。章の報酬は二重に受け取れない', () => {
  const S = newRun(44);
  goToFloor(S, 15); defeatBoss(S); S.run.player.x = S.run.portal.x; S.run.player.y = S.run.portal.y; G.act(S, { type: 'returnHome' }); G.finishRun(S);
  const funds = S.village.funds;
  G.depart(S, 45); eq(S.run.floor, 1); eq(S.run.chapter, 2);
  goToFloor(S, 20); eq(S.run.enemies.find((e) => e.boss).type, 'flame');
  G.useReturnScroll(S); const r = G.finishRun(S);
  assert(!r.chapterClear && !r.rewardFunds, 'no reward without the boss'); eq(S.village.story.chapter, 2);
  eq(S.village.funds, funds + r.gold);
});
test('帰還して再出発すると1階から', () => {
  const S = newRun(43, (S0) => { S0.village.story.chapter = 4; }); goToFloor(S, 25);
  S.run.player.x = S.run.returnPoint.x; S.run.player.y = S.run.returnPoint.y;
  G.act(S, { type: 'returnHome' }); G.finishRun(S);
  G.depart(S, 44); eq(S.run.floor, 1);
});
test('素材は持ち帰ると素材箱に入り、売却・預入できない。倒れると失う', () => {
  const S = newRun(45); bigRoomFloor(S);
  S.run.bag.push(G.makeItem(S, 'amber_shard'), G.makeItem(S, 'amber_shard'), G.makeItem(S, 'crystal_shard'));
  G.useReturnScroll(S); const res = G.finishRun(S);
  eq(S.village.materials.amber_shard, 2); eq(S.village.materials.crystal_shard, 1); eq(res.materials.amber_shard, 2);
  assert(!S.village.bag.some((i) => G.def(i).type === 'material'));
  const it = G.makeItem(S, 'gold_leaf'); assert(!G.canSell(it));
  G.depart(S, 46); S.run.bag.push(G.makeItem(S, 'gold_leaf')); S.run.player.hp = 1;
  bigRoomFloor(S); const e = addEnemy(S, 'frog', 6, 5); e.atk = 99;
  for (let i = 0; i < 30 && !S.run.over; i++) G.act(S, { type: 'wait' });
  G.finishRun(S); assert(!S.village.materials.gold_leaf, 'lost on defeat');
});
test('新しい道具：煙玉・鈍足の粉・火炎の札・解毒の葉', () => {
  const S = newRun(47); bigRoomFloor(S);
  const run = S.run, m = run.map;
  m.rooms.push({ id: 1, x: 25, y: 16, w: 4, h: 3 });
  for (let y = 16; y < 19; y++) for (let x = 25; x < 29; x++) m.tiles[y * m.w + x] = DG.FLOOR;
  const e = addEnemy(S, 'frog', 8, 5), e2 = addEnemy(S, 'frog', 10, 9);
  const add = (id) => { const it = G.makeItem(S, id); run.bag.push(it); return it; };
  G.act(S, { type: 'use', uid: add('fire_charm').uid });
  eq(e.hp, 999 - 35); eq(e2.hp, 999 - 35);
  G.act(S, { type: 'use', uid: add('slow_powder').uid });
  assert(e.slow > 10, 'slowed');
  const acts = e.acts; for (let i = 0; i < 4; i++) G.act(S, { type: 'wait' });
  eq(e.acts - acts, 2, 'slowed enemy acts every other turn');
  run.player.poison = 5; run.player.hp = 10;
  G.act(S, { type: 'use', uid: add('antidote').uid }); eq(run.player.poison, 0); assert(run.player.hp >= 30 || run.player.hp > 10);
  G.act(S, { type: 'use', uid: add('smoke_ball').uid });
  eq(DG.roomAt(m, run.player.x, run.player.y).id, 1, 'warped to other room');
});

console.log('地形（四角い部屋・幅1マスの通路）');
test('多数のシードで：部屋は重ならない四角、通路は幅1マス（2×2の床・斜めだけの接触なし）、全マスに到達できる', () => {
  let maps = 0;
  for (let seed = 1; seed <= 300; seed++) for (let f = 1; f <= 30; f++) {
    if (D.BOSS_FLOORS[f]) continue;
    const g = DG.generate(f, R.create(seed * 1009 + f * 31)), m = g.map; maps++;
    const own = new Int16Array(m.w * m.h).fill(-1);
    for (const r of m.rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      eq(m.tiles[y * m.w + x], DG.FLOOR, 'room is filled rectangle');
      assert(own[y * m.w + x] < 0, 'rooms overlap'); own[y * m.w + x] = r.id;
    }
    for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === DG.FLOOR) assert(own[i] >= 0, 'FLOOR outside room');
    for (const r of m.rooms) { // 部屋のまわり1マスは壁か幅1の出入口。出入口どうしは隣り合わない
      for (let x = r.x - 1; x <= r.x + r.w; x++) for (const y of [r.y - 1, r.y + r.h]) {
        const t = m.tiles[y * m.w + x];
        if (x === r.x - 1 || x === r.x + r.w) eq(t, DG.WALL, 'room corner is wall');
        else if (t !== DG.WALL) { eq(t, DG.CORR); assert(m.tiles[y * m.w + x + 1] === DG.WALL || x + 1 === r.x + r.w, 'door width 1'); }
      }
    }
    assert(TS.DungeonCheck.shapeOk(m), 'shape seed ' + seed + ' f' + f);
    assert(TS.DungeonCheck.connected(m), 'connected');
    const d = DG.distances(m, g.start.x, g.start.y);
    assert(d[g.stairs.y * m.w + g.stairs.x] > 0, 'stairs reachable');
  }
  assert(maps > 8000);
});
test('ボス階：入口の前室と大広間を幅1マスの通路でつなぐ四角い部屋', () => {
  for (const f of Object.keys(D.BOSS_FLOORS)) {
    const g = DG.generate(+f, R.create(5)), m = g.map;
    assert(TS.DungeonCheck.shapeOk(m) && TS.DungeonCheck.connected(m));
    eq(m.rooms.length, 2);
  }
});
test('新しい地形でもダッシュは通路の分かれ道・部屋の出入りで止まり、角抜けなしで全域を歩ける', () => {
  let stops = { branch: 0, room: 0 };
  for (let seed = 1; seed <= 30; seed++) {
    const S = newRun(seed), run = S.run; run.enemies = []; run.floorItems = [];
    run.player.hp = run.player.maxhp = 9999;
    for (const dir of ['right', 'down', 'left', 'up', 'right', 'down']) {
      for (let k = 0; k < 40; k++) { const r = G.dashStep(S, dir); if (r.stop) { if (stops[r.stop] !== undefined) stops[r.stop]++; break; } }
    }
  }
  assert(stops.room > 0, 'room stops ' + JSON.stringify(stops));
});
test('今いる階の地形は作り直さない（保存・再開しても同じ。新しい生成は次の階から）', () => {
  const S = newRun(321); goToFloor(S, 4);
  const before = S.run.map.tiles.join('');
  const L = SV.deserialize ? SV.deserialize(SV.serialize(S)) : JSON.parse(JSON.stringify(S));
  eq(L.run.map.tiles.join(''), before);
});

console.log('上位の杖・どんそくの粉・消耗品');
test('雷帝の杖：いかずちの杖の約1.8倍。16階以降の出現表だけにあり、売値も高い。使用回数の仕組みは同じ', () => {
  const k = D.ITEMS.thunder_king_staff, t = D.ITEMS.thunder_staff;
  eq(k.type, 'staff'); assert(Math.abs(k.dmg / t.dmg - 1.8) < 0.01); assert(k.sell > t.sell * 2);
  for (let f = 1; f <= 30; f++) { const has = D.FLOORS[f].items.some((x) => x[0] === 'thunder_king_staff'); eq(has, f >= 16 && !D.FLOORS[f].boss, 'floor ' + f); }
  const w = D.FLOORS[22].items, tot = w.reduce((a, x) => a + x[1], 0), kw = w.find((x) => x[0] === 'thunder_king_staff')[1];
  assert(kw / tot < 0.03, 'rare'); 
  // 階で生成されるときも3〜5回
  let found = 0;
  for (let seed = 1; seed <= 300 && found < 3; seed++) { const S = newRun(seed, (S0) => { S0.village.story.chapter = 4; }); goToFloor(S, 16);
    for (const fi of S.run.floorItems) if (fi.item && fi.item.id === 'thunder_king_staff') { found++; assert(fi.item.charges >= 3 && fi.item.charges <= 5); } }
  assert(found > 0, 'appears on deep floors');
});
test('雷帝の杖：8方向の直線で最初の敵だけに54ダメージ、壁で止まる、回数を使い切ると不発', () => {
  const S = newRun(90); bigRoomFloor(S);
  const run = S.run, p = run.player;
  const st = G.makeItem(S, 'thunder_king_staff', { charges: 2 }); run.bag.push(st);
  const e1 = addEnemy(S, 'frog', p.x + 2, p.y + 2), e2 = addEnemy(S, 'frog', p.x + 4, p.y + 4); e1.def = 50;
  e1.atk = 0; e2.atk = 0;
  G.act(S, { type: 'use', uid: st.uid, dir: 'downright' });
  eq(e1.hp, 999 - 54, 'first enemy, ignores def'); eq(e2.hp, 999, 'second untouched'); eq(st.charges, 1);
  // 壁の手前で止まる（敵は壁の向こう）
  const turn = run.turn;
  run.player.x = 3; run.player.y = 5; const e3 = addEnemy(S, 'frog', 1, 5); e3.atk = 0;
  G.act(S, { type: 'use', uid: st.uid, dir: 'left' });
  eq(e3.hp, 999, 'stopped by wall'); eq(st.charges, 0); eq(run.turn, turn + 1, 'one turn');
  G.act(S, { type: 'use', uid: st.uid, dir: 'left' });
  eq(st.charges, 0); assert(run.log.some((l) => l.includes('何も出なかった')));
});
test('どんそくの粉：使うと1個減って1ターン。見えている敵だけ鈍足、効果は時間で切れ、敵が止まり続けない', () => {
  const S = newRun(91); bigRoomFloor(S);
  const run = S.run, p = run.player;
  p.hp = p.maxhp = 9999;
  const pw = G.makeItem(S, 'slow_powder'); run.bag.push(pw);
  const n0 = run.bag.length, t0 = run.turn;
  const near = addEnemy(S, 'frog', p.x + 4, p.y); near.atk = 0;
  // 見えていない敵（部屋の外の通路）
  const m = run.map; for (let x = 22; x < 28; x++) m.tiles[8 * m.w + x] = DG.CORR;
  const far = addEnemy(S, 'frog', 26, 8); far.atk = 0;
  assert(!G.isVisible(run, 26, 8));
  G.act(S, { type: 'use', uid: pw.uid });
  eq(run.bag.length, n0 - 1, 'consumed one'); eq(run.turn, t0 + 1, 'one turn');
  assert(near.slow > 0, 'visible slowed'); assert(!far.slow, 'unseen not slowed');
  // 鈍足中は2ターンに1回だけ動き、15ターンで切れて元に戻る
  let moves = 0, last = { x: near.x, y: near.y };
  p.x = 3; p.y = 12; G.updateVision(run);
  for (let i = 0; i < 16; i++) { G.act(S, { type: 'wait' }); if (near.x !== last.x || near.y !== last.y) moves++; last = { x: near.x, y: near.y }; }
  assert(moves >= 4 && moves <= 10, 'moves while slowed ' + moves);
  eq(near.slow, 0, 'expired');
  // 切れたあとは毎ターン動く
  near.x = p.x + 6; near.y = p.y; G.updateVision(run);
  let moves2 = 0; last = { x: near.x, y: near.y };
  for (let i = 0; i < 2; i++) { G.act(S, { type: 'wait' }); if (near.x !== last.x || near.y !== last.y) moves2++; last = { x: near.x, y: near.y }; }
  eq(moves2, 2, 'moves every turn after expiry');
});
test('どんそくの粉：見えている敵がいないときは効果なし（命中していない敵に効かない）', () => {
  const S = newRun(92); bigRoomFloor(S);
  const run = S.run; const pw = G.makeItem(S, 'slow_powder'); run.bag.push(pw);
  G.act(S, { type: 'use', uid: pw.uid });
  assert(run.log.some((l) => l.includes('粉は風に消えた')));
});

console.log('モンスターハウス');
function mhRun(seed, floor) {
  const keep = D.MONSTER_HOUSE.chance; D.MONSTER_HOUSE.chance = 1;
  try { const S = newRun(seed); goToFloor(S, floor); return S; } finally { D.MONSTER_HOUSE.chance = keep; }
}
test('6階以降の通常階に1部屋まで。開始部屋・帰還の碑の部屋・ボス階・5階以下には出ない。敵は重ならず深さに合う', () => {
  let made = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const S = mhRun(seed, 5);
    eq(S.run.map.monsterHouse, null, '5F none');
    for (let f = 6; f <= 13; f++) {
      goDownMH(S);
      const run = S.run, m = run.map;
      if (G.F(run).boss) { eq(m.monsterHouse, null, 'boss floor'); continue; }
      if (m.monsterHouse == null) continue;
      made++;
      const room = m.rooms.find((r) => r.id === m.monsterHouse);
      const inRoom = (o) => o.x >= room.x && o.x < room.x + room.w && o.y >= room.y && o.y < room.y + room.h;
      assert(!inRoom(run.player), 'not start room');
      if (run.returnPoint) assert(!inRoom(run.returnPoint), 'not return room');
      const mh = run.enemies.filter((e) => e.mh);
      assert(mh.length >= 4 && mh.length <= D.MONSTER_HOUSE.enemiesMax, 'count ' + mh.length);
      const pos = new Set(run.enemies.map((e) => e.x + ',' + e.y)); eq(pos.size, run.enemies.length, 'no overlap');
      assert(!pos.has(run.player.x + ',' + run.player.y));
      const allowed = D.FLOORS[f].enemies.map((x) => x[0]);
      for (const e of mh) { assert(allowed.includes(e.type), 'depth table'); assert(e.sleep > 0, 'asleep'); }
      assert(run.floorItems.filter(inRoom).length >= D.MONSTER_HOUSE.extraItems, 'treasure');
    }
  }
  assert(made > 30, 'made ' + made);
});
function goDownMH(S) { const keep = D.MONSTER_HOUSE.chance; D.MONSTER_HOUSE.chance = 1; try { goDown(S); } finally { D.MONSTER_HOUSE.chance = keep; } }
function enterMH(S) {
  const run = S.run, m = run.map, room = m.rooms.find((r) => r.id === m.monsterHouse);
  // 出入口のマス（部屋に隣接する通路）に立ち、部屋へ1歩入る
  for (let y = room.y - 1; y <= room.y + room.h; y++) for (let x = room.x - 1; x <= room.x + room.w; x++) {
    if (m.tiles[y * m.w + x] !== DG.CORR) continue;
    for (const [dir, [dx, dy]] of Object.entries(G.DIRS)) {
      const nx = x + dx, ny = y + dy;
      if (Math.abs(dx) + Math.abs(dy) !== 1 || !DG.roomAt(m, nx, ny) || DG.roomAt(m, nx, ny).id !== room.id) continue;
      run.enemies = run.enemies.filter((e) => !(e.x === nx && e.y === ny));
      run.player.x = x; run.player.y = y; G.updateVision(run);
      return { dir, door: { x, y } };
    }
  }
  throw new Error('no door');
}
test('初めて入ると「モンスターハウスだ！」、ダッシュは止まり、その直後のターンに敵は攻撃しない。2回目は出ない', () => {
  let tested = 0;
  for (let seed = 1; seed <= 40 && tested < 5; seed++) {
    const S = mhRun(seed, 6), run = S.run;
    if (run.map.monsterHouse == null) continue;
    tested++;
    run.player.hp = run.player.maxhp = 500;
    run.enemies = run.enemies.filter((e) => e.mh);   // 部屋の外の敵は除く（入室直後の攻撃だけを確かめる）
    const { dir, door } = enterMH(S);
    const hp = run.player.hp;
    const r = G.dashStep(S, dir);
    eq(r.stop, 'monsterHouse', 'dash stops');
    assert(r.res.events.some((e) => e.t === 'monsterHouse'));
    assert(run.log.includes('モンスターハウスだ！'));
    eq(run.player.hp, hp, 'no attack on the entry turn');
    assert(run.enemies.filter((e) => e.mh).every((e) => e.sleep === 0), 'woke up');
    // 通路へ逃げられる（出口は封鎖されない）
    const back = Object.keys(G.DIRS).find((d) => G.DIRS[d][0] === -G.DIRS[dir][0] && G.DIRS[d][1] === -G.DIRS[dir][1]);
    const res = G.act(S, { type: 'move', dir: back });
    assert(res.consumed && run.player.x === door.x && run.player.y === door.y, 'escaped to corridor');
    // 再入室で再び発生しない・敵や宝が増えない
    const nE = run.enemies.length, nI = run.floorItems.length;
    const res2 = G.act(S, { type: 'move', dir });
    assert(!res2.events.some((e) => e.t === 'monsterHouse'), 'once');
    assert(run.enemies.length <= nE && run.floorItems.length <= nI, 'no regeneration');
  }
  assert(tested >= 3, 'tested ' + tested);
});
// ---- 気配察知の巻物・足元の道具を使う・村の発展の一覧 ----
test('気配察知の巻物：1個消費して1ターン。この階の敵を覚え、階を移ると切れる。保存・再読み込みで残る。視界・地形・道具は変えない', () => {
  const S = newRun(71); const r = S.run;
  const it = G.makeItem(S, 'sense_scroll'); r.bag.push(it);
  const turn = r.turn, explored = r.explored.join(''), vis = G.visibleEnemies(r).length, n = r.bag.length;
  const res = G.act(S, { type: 'use', uid: it.uid });
  assert(res.consumed); eq(r.turn, turn + 1); eq(r.bag.length, n - 1); eq(r.sense, r.floor);
  eq(r.explored.join(''), explored, 'no terrain revealed'); eq(G.visibleEnemies(r).length, vis, 'vision unchanged');
  const L = SV.deserialize(SV.serialize(S)); eq(L.run.sense, L.run.floor, 'kept after reload');
  r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' });
  eq(r.sense, 0, 'cleared on new floor');
  // 遠くの敵が察知されていても、視界に入っていなければダッシュ・休息は止まらない
  r.sense = r.floor;
  const block = G.restBlock(S); assert(block !== 'enemy' || G.visibleEnemies(r).length > 0, 'rest not blocked by sensed enemies only');
  assert(D.SHOP_STOCK[2].includes('sense_scroll') && D.floorFor(1, 5).items.some(([id]) => id === 'sense_scroll') && !D.floorFor(1, 4).items.some(([id]) => id === 'sense_scroll'));
});
test('足元の道具をその場で使う：バッグ満杯でも使え、バッグは変わらず床の1個だけ減る。ターンは1。使えない種類・別の道具のuidでは何も起きない', () => {
  const S = newRun(72); const r = S.run, p = r.player;
  r.enemies = []; r.floorItems = [];
  while (r.bag.length < D.BAG_SIZE) r.bag.push(G.makeItem(S, 'banana'));
  const bagIds = r.bag.map((i) => i.uid).join(',');
  p.hp = 5;
  const herb = G.makeItem(S, 'herb'); r.floorItems.push({ x: p.x, y: p.y, item: herb });
  const t0 = r.turn;
  const res = G.act(S, { type: 'useFloor', uid: herb.uid });
  assert(res.consumed); eq(r.turn, t0 + 1); assert(p.hp > 5, 'healed');
  eq(r.floorItems.length, 0, 'floor item consumed'); eq(r.bag.map((i) => i.uid).join(','), bagIds, 'bag unchanged');
  // 二重に使えない（もう床にない）
  const again = G.act(S, { type: 'useFloor', uid: herb.uid }); assert(!again.consumed); eq(r.turn, t0 + 1);
  // 装備は使えない
  const sw = G.makeItem(S, 'bronze_sword'); r.floorItems.push({ x: p.x, y: p.y, item: sw });
  assert(!G.canUseFromFloor(r)); assert(!G.act(S, { type: 'useFloor', uid: sw.uid }).consumed); eq(r.floorItems.length, 1);
  r.floorItems = [];
  // 杖：床に残ったまま回数が減る（バッグから使うときと同じ）
  const st = G.makeItem(S, 'thunder_staff', { charges: 3 }); r.floorItems.push({ x: p.x, y: p.y, item: st });
  assert(G.act(S, { type: 'useFloor', uid: st.uid, dir: 'up' }).consumed); eq(st.charges, 2); eq(r.floorItems.length, 1);
});
test('村の発展の一覧：完成した項目は出さず、段階式の拡張は次の1段階だけ。完成しても効果と記録は残る', () => {
  const S = G.newState(), V = S.village; V.funds = 1e6; V.materials = { amber_shard: 9, bronze_shard: 9, crystal_shard: 9, gold_leaf: 9 }; V.bestFloor = 30;
  let ids = G.unbuiltFacilities(V).map((f) => f.id);
  assert(ids.includes('storage2') && !ids.includes('storage3') && !ids.includes('storage4'), ids.join());
  assert(G.buildFacility(S, 'storage2').ok);
  ids = G.unbuiltFacilities(V).map((f) => f.id);
  assert(!ids.includes('storage2') && ids.includes('storage3'), ids.join());
  eq(G.storageSize(V), 40, 'effect kept'); assert(G.hasFacility(V, 'storage2'), 'record kept');
  for (let k = 0; k < 40; k++) { const f = G.unbuiltFacilities(V).find((f) => G.facilityStatus(S, f.id).unlocked); if (!f) break; G.buildFacility(S, f.id); V.funds = 1e6; }
  V.donated = {}; for (const id of D.MUSEUM_ITEMS) V.donated[id] = true;
  for (let k = 0; k < 40; k++) { const f = G.unbuiltFacilities(V).find((f) => G.facilityStatus(S, f.id).unlocked); if (!f) break; G.buildFacility(S, f.id); V.funds = 1e6; }
  eq(G.unbuiltFacilities(V).length, 0, 'all built'); eq(G.storageSize(V), 80); eq(G.smithMax(V), 8);
});

// ---- 謎の旅商人 ----
function findMerchant(seed0, ch, minF) {
  for (let s = seed0; s < seed0 + 400; s++) {
    const S = G.newState(); S.village.story.chapter = ch || 3;
    G.depart(S, s);
    const r = S.run;
    while (r.floor < G.maxFloor(r) - 1) {
      r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' });
      if (r.merchant && r.floor >= (minF || 8)) return S;
    }
  }
  throw new Error('no merchant');
}
test('謎の旅商人：8階以降の約14%の階に、ふつうの部屋の角（入口・階段・道具・敵の上ではない）に出る。ボスの階・モンスターハウスには出ない', () => {
  let floors = 0, n = 0;
  for (let s = 0; s < 120; s++) {
    const S = G.newState(); S.village.story.chapter = 2; G.depart(S, 3000 + s); const r = S.run;
    while (true) {
      if (r.merchant) {
        const m = r.merchant, room = TS.Dungeon.roomAt(r.map, m.x, m.y);
        assert(room && room.id !== r.map.monsterHouse, 'in normal room');
        assert((m.x === room.x || m.x === room.x + room.w - 1) && (m.y === room.y || m.y === room.y + room.h - 1), 'corner');
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert(!(TS.Dungeon.passable(r.map, m.x + dx, m.y + dy) && !TS.Dungeon.roomAt(r.map, m.x + dx, m.y + dy)), 'not by a door');
        assert(!TS.Dungeon.same(r.stairs, m) && !G.itemAt(r, m.x, m.y) && !G.enemyAt(r, m.x, m.y), 'free tile');
        assert(r.floor >= D.MERCHANT.minFloor && !G.F(r).boss, 'floor rule');
      }
      if (r.floor >= 8) { floors++; if (r.merchant) n++; }
      if (G.F(r).boss || r.floor >= 30) break;
      r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' });
    }
    assert(!r.merchant, 'no merchant on boss floor');
  }
  const rate = n / floors;
  assert(rate > 0.09 && rate < 0.2, 'rate ' + rate);
  // 浅い階には貴重な素材を並べない
  for (let s = 0; s < 60; s++) {
    const S = findMerchant(5000 + s * 7, 2, 8), r = S.run;
    for (const g of r.merchant.stock) assert(r.floor >= D.MERCHANT.goods.find((x) => x.id === g.id).from, 'tier ' + g.id + '@' + r.floor);
    if (r.floor < 23) assert(!r.merchant.stock.some((g) => g.id === 'gold_leaf'), 'no gold leaf before 23F');
  }
});
test('謎の旅商人：同じ階を保存・再読み込みしても出現・場所・品ぞろえ・価格・在庫が変わらず、売り切れは復活しない', () => {
  const S = findMerchant(8100, 3, 13), r = S.run;
  const before = JSON.stringify(r.merchant);
  // 同じシード・同じ階なら同じ商人
  const S2 = G.newState(); S2.village.story.chapter = 3; G.depart(S2, r.seed);
  while (S2.run.floor < r.floor) { S2.run.player.x = S2.run.stairs.x; S2.run.player.y = S2.run.stairs.y; G.act(S2, { type: 'descend' }); }
  eq(JSON.stringify(S2.run.merchant), before, 'deterministic');
  S.village.funds = 99999;
  const g0 = r.merchant.stock[0];
  while (g0.left > 0) assert(G.merchantBuy(S, 0).ok);
  const L = SV.deserialize(SV.serialize(S));
  eq(L.run.merchant.stock[0].left, 0, 'sold out kept');
  assert(!G.merchantBuy(L, 0).ok, 'sold out after reload');
  eq(JSON.stringify(L.run.merchant.stock.slice(1)), JSON.stringify(r.merchant.stock.slice(1)), 'others kept');
});
test('謎の旅商人：買う前にお金と持ち物の空きを確かめる。探索中のお金から先に払い、足りない分は村の資金。ターンは進まず、在庫以上は買えない', () => {
  const S = findMerchant(8300, 3, 13), r = S.run, V = S.village, m = r.merchant;
  const g = m.stock[0], turn = r.turn, hp = r.player.hp;
  r.runGold = 100; V.funds = g.price - 101;
  let res = G.merchantBuy(S, 0);
  assert(!res.ok && /足りません/.test(res.msg), 'not enough');
  eq(r.runGold, 100); eq(V.funds, g.price - 101); eq(r.bag.length, 1);
  V.funds = g.price - 100;
  while (r.bag.length < D.BAG_SIZE) r.bag.push(G.makeItem(S, 'herb'));
  res = G.merchantBuy(S, 0);
  assert(!res.ok && /いっぱい/.test(res.msg), 'bag full'); eq(r.runGold, 100); eq(V.funds, g.price - 100);
  r.bag.pop();
  const left = g.left;
  res = G.merchantBuy(S, 0);
  assert(res.ok, res.msg); eq(res.paidRun, 100); eq(res.paidVillage, g.price - 100);
  eq(r.runGold, 0); eq(V.funds, 0); eq(g.left, left - 1);
  eq(r.bag[r.bag.length - 1].id, g.id);
  eq(r.turn, turn, 'no turn'); eq(r.player.hp, hp);
  // 連続で呼んでもお金がなければ2個目は買えない
  res = G.merchantBuy(S, 0); assert(!res.ok); eq(r.bag.length, D.BAG_SIZE);
  // 在庫を超えて買えない
  V.funds = 999999; r.bag.length = 3;
  while (g.left > 0) assert(G.merchantBuy(S, 0).ok);
  const n = r.bag.length; assert(!G.merchantBuy(S, 0).ok); eq(r.bag.length, n);
});
test('謎の旅商人：攻撃の対象にならない（ぶつかると話しかけるだけでターンは進まない）。敵は商人のマスに入らない。ダッシュ・長押しは商人のとなりで止まる', () => {
  const S = findMerchant(8500, 3, 13), r = S.run, m = r.merchant, p = r.player;
  const room = TS.Dungeon.roomAt(r.map, m.x, m.y);
  const sy = m.y === room.y ? 1 : -1, sx = m.x === room.x ? 1 : -1;   // 部屋の内側へ向かう向き
  r.enemies = [];
  p.x = m.x; p.y = m.y + sy; G.updateVision(r);
  const dir = sy > 0 ? 'up' : 'down', turn = r.turn;
  const res = G.act(S, { type: 'move', dir });
  assert(!res.consumed && res.events.some((e) => e.t === 'merchant') && !res.events.some((e) => e.t === 'hit'), 'talk, not attack');
  eq(r.turn, turn); eq(p.x, m.x); eq(p.y, m.y + sy);
  // ダッシュ：商人のマスへは進まず止まる
  eq(G.dashStep(S, dir, G.dashContext(S)).stop, 'merchant');
  // 2マス離れた所からのダッシュ・長押しは、となりで止まる
  p.x = m.x; p.y = m.y + sy * 3; G.updateVision(r);
  const d1 = G.dashStep(S, dir, G.dashContext(S));
  eq(d1.stop, null); const d2 = G.dashStep(S, dir, G.dashContext(S));
  eq(d2.stop, 'merchant'); eq(p.y, m.y + sy);
  p.x = m.x; p.y = m.y + sy * 2; G.updateVision(r);
  const w1 = G.act(S, { type: 'move', dir }); eq(G.walkCheck(S, dir, w1), 'merchant');
  // 敵は商人のマスに入らない（周りを何度も動かしても重ならない）
  p.x = m.x + sx * 2; p.y = m.y + sy * 2; G.updateVision(r);
  const ids = Object.keys(D.ENEMIES).filter((k) => !D.ENEMIES[k].boss && !D.ENEMIES[k].clone && D.ENEMIES[k].ai !== 'boss' && D.ENEMIES[k].ai !== 'clone');
  for (let t = 0; t < 4; t++) {
    r.enemies = [];
    // 商人をはさんだ向こう側に敵を置き、たけへ近づかせる
    for (const [dx, dy] of [[-sx, 0], [0, -sy], [-sx, -sy]]) {
      const x = m.x + dx, y = m.y + dy;
      if (TS.Dungeon.passable(r.map, x, y)) { const e = { id: 900 + r.enemies.length, type: ids[(t * 3 + r.enemies.length) % ids.length], x, y, hp: 50, maxhp: 50, atk: 1, def: 0, exp: 1, dir: 'down', sleep: 0 }; r.enemies.push(e); }
    }
    for (let k = 0; k < 8; k++) { G.act(S, { type: 'wait' }); assert(!r.enemies.some((e) => e.x === m.x && e.y === m.y), 'enemy on merchant'); }
  }
});
test('モンスターハウス：保存・再開しても敵とお宝は作り直されず、入ったかどうかも引き継ぐ', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const S = mhRun(seed, 6);
    if (S.run.map.monsterHouse == null) continue;
    const snap = JSON.stringify({ e: S.run.enemies, i: S.run.floorItems });
    const L = SV.deserialize(SV.serialize(S));
    eq(JSON.stringify({ e: L.run.enemies, i: L.run.floorItems }), snap, 'same before entering');
    eq(L.run.map.monsterHouse, S.run.map.monsterHouse);
    enterMH(L); const { dir } = enterMH(L);
    G.act(L, { type: 'move', dir });
    assert(L.run.mhTriggered);
    const L2 = SV.deserialize(SV.serialize(L));
    assert(L2.run.mhTriggered, 'triggered kept');
    return;
  }
  throw new Error('no MH found');
});

console.log('持ち物15枠');
test('バッグは15枠：14→15で拾える、15で拾えず消えない。購入・取り出し・貸出も15でお金や品物が消えない', () => {
  eq(D.BAG_SIZE, 15);
  const S = newRun(95); bigRoomFloor(S);
  const run = S.run, p = run.player;
  while (run.bag.length < 14) run.bag.push(G.makeItem(S, 'herb'));
  run.floorItems.push({ x: p.x + 1, y: p.y, item: G.makeItem(S, 'banana') });
  G.act(S, { type: 'move', dir: 'right' });
  eq(run.bag.length, 15, 'picked 15th');
  run.floorItems.push({ x: p.x + 1, y: p.y, item: G.makeItem(S, 'elixir') });
  G.act(S, { type: 'move', dir: 'right' });
  eq(run.bag.length, 15); assert(G.itemAt(run, p.x, p.y), 'left on floor, not lost');
  // 村
  const S2 = G.newState(), V = S2.village; V.funds = 1000;
  while (V.bag.length < 15) V.bag.push(G.makeItem(S2, 'herb'));
  const r1 = G.buy(S2, 'herb'); assert(!r1.ok); eq(V.funds, 1000, 'no charge'); eq(V.bag.length, 15);
  V.storage.push(G.makeItem(S2, 'banana'));
  const r2 = G.withdraw(S2, V.storage[0].uid); assert(!r2.ok); eq(V.storage.length, 1, 'kept in storage');
  assert(!G.takeLoan(S2, 'weapon').ok);
  V.bag.pop();
  assert(G.buy(S2, 'herb').ok); eq(V.bag.length, 15); eq(V.funds, 1000 - D.ITEMS.herb.price);
  // 出発には帰還の巻物の1枠が要る
  assert(!G.canDepart(S2).ok);
});
test('旧セーブ（12枠時代）の所持品はそのまま読み込める', () => {
  const fs = require('fs');
  for (const f of ['save-v1-midrun.json', 'save-v1-cleared.json']) {
    const raw = fs.readFileSync(require('path').join(__dirname, 'fixtures', f), 'utf8');
    const before = JSON.parse(raw);
    const L = SV.migrate ? SV.migrate(JSON.parse(raw)) : null;
    if (!L) continue;
    eq(L.village.bag.length, before.village.bag.length);
  }
});

console.log('章のボス（30階）と最終決戦（35階）');
function chapterRun(ch, seed, floor) {
  const S = newRun(seed, (S0) => { S0.village.story.chapter = ch; });
  eq(S.run.chapter, ch);
  goToFloor(S, floor);
  return S;
}
// ボス部屋の中で、ボスから見て (dx,dy) の位置にたけを置く
function placeNear(S, dx, dy) {
  const run = S.run, b = run.enemies.find((e) => e.boss);
  run.player.x = b.x + dx; run.player.y = b.y + dy; run.player.hp = run.player.maxhp = 5000;
  G.updateVision(run); return b;
}
const stepOk = (run, dir) => { const [dx, dy] = G.DIRS[dir]; return G.canStep(run.map, run.player.x, run.player.y, dx, dy) && !G.enemyAt(run, run.player.x + dx, run.player.y + dy); };
test('章ごとのボスの階：第1章15階・第2章20階・第3章25階・第4章30階・第5章30階（別々の章）。最終章は30階が通常の階で、31〜35階へ進め、35階に大魔王バーン', () => {
  const want = { 1: ['croc', 15], 2: ['flame', 20], 3: ['kill', 25], 4: ['baran', 30], 5: ['mist', 30] };
  for (const ch of [1, 2, 3, 4, 5]) {
    const [boss, fl] = want[ch];
    const S = chapterRun(ch, 200 + ch, fl);
    eq(S.run.enemies.filter((e) => e.boss).map((e) => e.type).join(), boss, 'only one boss'); eq(G.maxFloor(S.run), fl); eq(D.CHAPTERS[ch].goal, fl);
    for (let f = 1; f < fl; f++) assert(!G.F(S.run, f).boss, 'no boss above ' + f);
    eq(S.run.map.monsterHouse, null, 'no monster house on boss floor');
  }
  const S = chapterRun(6, 210, 30);
  assert(!S.run.enemies.some((e) => e.boss) && S.run.stairs, '30F normal in final');
  goToFloor(S, 31); eq(G.F(S.run).theme, 'demon');
  goToFloor(S, 35); eq(S.run.enemies.find((e) => e.boss).type, 'vearn'); eq(S.run.final.stage, 'battle1'); eq(G.maxFloor(S.run), 35);
});
test('クロコダイン：一直線の突進を予告し、横へずれればかわせて、そのあと2ターンの隙。隣では縦一列の大斧', () => {
  const S = chapterRun(1, 220, 15), run = S.run;
  const b = placeNear(S, 0, 4);   // 真下に4マス
  let r = G.act(S, { type: 'wait' });
  assert(b.charge && b.charge.kind === 'rush', 'rush telegraph');
  assert(b.charge.tiles.some((t) => t.x === run.player.x && t.y === run.player.y));
  const dir = stepOk(run, 'right') ? 'right' : 'left';
  const hp = run.player.hp;
  G.act(S, { type: 'move', dir });
  eq(run.player.hp, hp, 'dodged by stepping aside'); eq(b.rest, 2, 'gap after rush');
  // 隣で大斧
  const b2 = placeNear(S, 1, 0); b2.rest = 0; b2.cds = {}; b2.cycle = 2;
  G.act(S, { type: 'wait' });
  assert(b2.charge && b2.charge.tiles.some((t) => t.x === run.player.x && t.y === run.player.y), 'axe telegraph on player column');
});
test('フレイザード：炎と氷の床が交互に。印のない床が必ず残り、そこにいれば無傷。印の上で発動するとダメージ', () => {
  const S = chapterRun(2, 230, 20), run = S.run;
  placeNear(S, 0, 3);
  const kinds = [];
  for (let i = 0; i < 40 && kinds.length < 2; i++) {
    G.act(S, { type: 'wait' });
    if (run.hazards.length) {
      const k = run.hazards[0].kind; if (!kinds.includes(k)) kinds.push(k);
      const room = DG.roomAt(run.map, run.enemies.find((e) => e.boss).x, run.enemies.find((e) => e.boss).y);
      const safe = [];
      for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (!run.hazards.some((h) => h.x === x && h.y === y)) safe.push({ x, y });
      assert(safe.length >= room.w * room.h * 0.3, 'enough safe floor');
      // 印のない床へ移って待てば無傷
      const p = run.player, sp = safe.find((t) => !G.enemyAt(run, t.x, t.y) && Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y)) <= 2);
      assert(sp, 'safe tile within 2 steps');
      p.x = sp.x; p.y = sp.y; G.updateVision(run);
      const hp = p.hp, before = run.hazards.length;
      while (run.hazards.length) G.act(S, { type: 'wait' });
      assert(before > 0);
      // 鈍足・大技・火の玉の影響を除いた床だけの判定：床の印がない場所にいたのでダメージは床からではない
      assert(!run.log.slice(-6).some((l) => l.includes('の床！')), 'no floor damage on safe tile');
    }
  }
  eq(kinds.length, 2, 'fire and ice alternate ' + kinds);
});
test('キルバーン：分身2体（1回当てると消える幻）と罠。罠は一撃で倒れない上限つき。本体を倒すと分身も消える', () => {
  const S = chapterRun(3, 240, 25), run = S.run;
  const b = placeNear(S, 0, 3); run.player.hp = run.player.maxhp = 200;
  let clones = [];
  for (let i = 0; i < 6 && clones.length < 2; i++) { G.act(S, { type: 'wait' }); clones = run.enemies.filter((e) => e.type === 'kill_clone'); }
  eq(clones.length, 2, 'two clones');
  for (const c of clones) { eq(c.hp, 1); assert(D.ENEMIES[c.type].clone); }
  const pos = new Set(run.enemies.map((e) => e.x + ',' + e.y)); eq(pos.size, run.enemies.length, 'no overlap');
  // 罠のダメージ上限（最大HPの35%）
  run.hazards = []; b.cds = { clone: 9, trap: 0 }; b.charge = null; b.rest = 0;
  for (let i = 0; i < 4 && !run.hazards.length; i++) G.act(S, { type: 'wait' });
  assert(run.hazards.some((h) => h.kind === 'trap'), 'traps');
  const t = run.hazards[0]; run.player.x = t.x; run.player.y = t.y; run.enemies = run.enemies.filter((e) => e.boss); G.updateVision(run);
  const hp = run.player.hp;
  while (run.hazards.some((h) => h.x === t.x && h.y === t.y)) G.act(S, { type: 'wait' });
  assert(hp - run.player.hp <= Math.round(200 * 0.35) + 60, 'trap capped (plus boss hits)');
  // 分身を1回たたくと消える
  const S2 = chapterRun(3, 241, 25), r2 = S2.run; placeNear(S2, 0, 3);
  for (let i = 0; i < 6 && !r2.enemies.some((e) => e.type === 'kill_clone'); i++) G.act(S2, { type: 'wait' });
  const c = r2.enemies.find((e) => e.type === 'kill_clone');
  r2.player.x = c.x - 1; r2.player.y = c.y; c.hold = 5; G.updateVision(r2);
  if (G.canStep(r2.map, r2.player.x, r2.player.y, 1, 0) && DG.passable(r2.map, r2.player.x, r2.player.y)) {
    for (let i = 0; i < 5 && r2.enemies.includes(c); i++) G.act(S2, { type: 'move', dir: 'right' });
    assert(!r2.enemies.includes(c) && r2.log.includes('それは幻だった！'), 'clone vanished');
  }
  defeatBoss(S2); assert(!S2.run.enemies.some((e) => e.type === 'kill_clone'), 'clones gone with boss');
});
test('バラン：雷の印は3×3。2回動いて外へ出ればかわせる。剣技は一直線を予告し、そのあと2ターンの隙', () => {
  const S = chapterRun(4, 250, 30), run = S.run;
  const b = placeNear(S, 0, 4);
  for (let i = 0; i < 6 && !run.hazards.length; i++) G.act(S, { type: 'wait' });
  eq(run.hazards.length, 9, '3x3 bolt');
  const p = run.player, hp = p.hp;
  // 2回動いて外へ（右へ2マス、通れなければ左）
  const dir = stepOk(run, 'right') ? 'right' : 'left';
  G.act(S, { type: 'move', dir }); G.act(S, { type: 'move', dir });
  while (run.hazards.length) G.act(S, { type: 'wait' });
  assert(!run.log.some((l) => l.startsWith('竜の雷撃！')), 'escaped the bolt');
  const b2 = placeNear(S, 1, 0); b2.cds = { bolt: 9 }; b2.cycle = 1; b2.rest = 0; b2.charge = null;
  G.act(S, { type: 'wait' });
  assert(b2.charge && b2.charge.tiles.length >= 1, 'sword telegraph');
  G.act(S, { type: 'move', dir: stepOk(run, 'up') ? 'up' : 'down' });
  eq(b2.rest, 2, 'gap after sword');
});
test('ミストバーン：霧で見える範囲が2マスに（予告は残る）。闇の糸で2ターン移動不可→そのあとしばらく拘束されない。香で解除', () => {
  const S = chapterRun(5, 260, 30), run = S.run;
  const b = placeNear(S, 0, 3);
  G.act(S, { type: 'wait' });
  assert(run.fog > 0, 'fog');
  assert(!G.isVisible(run, run.player.x + 3, run.player.y) || run.fog === 0, 'limited vision');
  // 拘束
  b.cds = { fog: 20, clone: 20, bind: 0 }; b.charge = null; b.rest = 0;
  for (let i = 0; i < 4 && !(b.charge && b.charge.kind === 'bind'); i++) G.act(S, { type: 'wait' });
  assert(b.charge && b.charge.kind === 'bind', 'bind telegraph');
  G.act(S, { type: 'wait' });   // その場にいて当たる
  assert(run.player.bound > 0, 'bound');
  const turn = run.turn, r = G.act(S, { type: 'move', dir: 'up' });
  assert(!r.consumed && run.turn === turn, 'cannot move, no turn used');
  const herb = G.makeItem(S, 'herb'); run.bag.push(herb);
  assert(G.act(S, { type: 'use', uid: herb.uid }).consumed, 'can use items while bound');
  while (run.player.bound > 0) G.act(S, { type: 'wait' });
  assert(run.player.bindGuard > 0, 'guard after release');
  // 香で霧と拘束を解除
  run.fog = 5; run.player.bound = 2;
  const inc = G.makeItem(S, 'clear_incense'); run.bag.push(inc);
  G.act(S, { type: 'use', uid: inc.uid });
  eq(run.fog, 0); eq(run.player.bound, 0); assert(run.player.bindGuard >= 10);
});
test('最終決戦：バーンを倒すと準備（回復は1回だけ・時間は止まる）→「最終決戦へ」で真大魔王バーン→勝利で帰還口→帰るとエンディング', () => {
  const S = chapterRun(6, 270, 35), run = S.run;
  run.player.hp = 10; run.player.maxhp = 300;
  defeatBoss(S); run.player.maxhp = 300;
  eq(run.final.stage, 'prep'); eq(S.village.story.finalStage, 'prep'); assert(run.final.healed);
  // 準備中は時間が止まる
  const turn = run.turn, hpPrep = run.player.hp;
  assert(!G.act(S, { type: 'wait' }).consumed && run.turn === turn, 'no turn in prep');
  // 再読み込みしても回復や演出は繰り返さない
  run.player.hp = 123;
  const L = SV.deserialize(SV.serialize(S));
  eq(L.run.final.stage, 'prep'); eq(L.run.player.hp, 123, 'no second heal after reload'); assert(L.run.final.healed);
  assert(G.startFinalBattle(L)); eq(L.run.final.stage, 'battle2');
  assert(!G.startFinalBattle(L), 'cannot start twice');
  eq(L.run.enemies.filter((e) => e.type === 'truevearn').length, 1);
  const L2 = SV.deserialize(SV.serialize(L)); eq(L2.run.final.stage, 'battle2'); eq(L2.run.enemies.find((e) => e.boss).type, 'truevearn');
  defeatBoss(L2);
  eq(L2.run.final.stage, 'won'); assert(L2.run.portal); assert(L2.village.story.defeated.truevearn);
  L2.run.player.x = L2.run.portal.x; L2.run.player.y = L2.run.portal.y; G.act(L2, { type: 'returnHome' });
  const res = G.finishRun(L2);
  assert(res.finalClear && res.firstEnding); assert(L2.village.story.endingDone && L2.village.cleared); eq(L2.village.story.pending.type, 'ending');
  eq(L2.village.story.records, D.STORY.records.length);
  // クリア後も探索・村の発展を続けられる
  assert(G.depart(L2, 271).ok); eq(L2.run.chapter, 6);
});
test('最終決戦で敗北：通常の敗北ルールで村へ。最終章は未クリアのまま、次は第1戦から', () => {
  const S = chapterRun(6, 280, 35), run = S.run;
  defeatBoss(S); G.startFinalBattle(S);
  run.player.hp = 1; const b = run.enemies.find((e) => e.boss); b.cds = {}; b.rest = 0; b.hold = 0;
  run.player.x = b.x + 1; run.player.y = b.y; G.updateVision(run);
  for (let i = 0; i < 20 && !run.over; i++) G.act(S, { type: 'wait' });
  assert(run.over && run.result.type === 'dead', 'died');
  const res = G.finishRun(S);
  eq(res.type, 'dead'); assert(!S.village.story.endingDone && !S.village.cleared); eq(S.village.story.chapter, 6);
  eq(S.village.story.finalStage, 'none'); eq(S.village.story.defeated.vearn, false, 'retry from battle 1');
  G.depart(S, 281); goToFloor(S, 35); eq(S.run.final.stage, 'battle1'); eq(S.run.enemies.find((e) => e.boss).type, 'vearn');
});
test('章のボスを倒したあとに倒れても、その章はクリア扱い（やり直させない）。倒す前の敗北・途中帰還では章はそのまま', () => {
  const S = chapterRun(2, 290, 20);
  G.useReturnScroll(S); G.finishRun(S); eq(S.village.story.chapter, 2, 'mid return keeps chapter');
  G.depart(S, 291); goToFloor(S, 20); S.run.player.hp = 0;
  const r0 = G.act(S, { type: 'wait' });
  S.run.over = true; S.run.result = { type: 'dead', cause: 'test', floor: 20, lostGold: 0, lostItems: 0 };
  G.finishRun(S); eq(S.village.story.chapter, 2, 'death before boss keeps chapter');
  G.depart(S, 292); goToFloor(S, 20); defeatBoss(S);
  S.run.over = true; S.run.result = { type: 'dead', cause: 'test', floor: 20, lostGold: 0, lostItems: 0 };
  const res = G.finishRun(S);
  eq(res.chapterClear, 2); eq(S.village.story.chapter, 3);
});
test('全章を順に進める：第1章→第5章→最終章→エンディング。各章の報酬は1回だけ', () => {
  const S = newRun(300);
  let funds0 = S.village.funds;
  for (let ch = 1; ch <= 5; ch++) {
    if (ch > 1) G.depart(S, 300 + ch);
    eq(S.run.chapter, ch);
    goToFloor(S, D.CHAPTERS[ch].goal); eq(S.run.enemies.filter((e) => e.boss).length, 1); defeatBoss(S);
    assert(!S.run.stairs, 'cannot go deeper after the chapter boss');
    S.run.player.x = S.run.portal.x; S.run.player.y = S.run.portal.y; G.act(S, { type: 'returnHome' });
    const res = G.finishRun(S);
    eq(res.chapterClear, ch); eq(res.rewardFunds, D.CHAPTERS[ch].reward.funds);
  }
  eq(S.village.story.chapter, 6);
  G.depart(S, 310); goToFloor(S, 35); defeatBoss(S); G.startFinalBattle(S); defeatBoss(S);
  S.run.player.x = S.run.portal.x; S.run.player.y = S.run.portal.y; G.act(S, { type: 'returnHome' });
  const res = G.finishRun(S);
  assert(res.finalClear && S.village.story.endingDone);
  for (const b of ['croc', 'flame', 'kill', 'baran', 'mist']) assert(S.village.story.rewardClaimed[b] && S.village.story.returnDone[b], b);
});
test('章の進み：お店に章の道具が並ぶ。深い階ほど章で敵が強くなる（浅い階はほぼ同じ）。敵の構成が章で変わる', () => {
  const V = G.newVillage(); V.stage = 3;
  assert(G.shopStock(V).includes('slow_powder') && !G.shopStock(V).includes('water_charm'));
  V.story.chapter = 3; assert(G.shopStock(V).includes('water_charm') && G.shopStock(V).includes('truth_mirror'));
  assert(D.chapterMul(5, 1) < 1.02, 'shallow almost same'); assert(D.chapterMul(5, 25) > 1.2, 'deep stronger');
  const w = (ch, id, f) => (D.floorFor(ch, f).enemies.find((x) => x[0] === id) || [0, 0])[1];
  assert(w(3, 'thief', 20) > w(1, 'thief', 20), 'chapter bias');
  eq(w(5, 'golem', 3), 0, 'no deep enemies on shallow floors');
});
test('旧セーブ（v2・30階クリア済み）：「旧版のクリア記録」として残し、新章は第1章から。所持金・道具・施設・倉庫はそのまま', () => {
  const S = newRun(320); G.useReturnScroll(S); G.finishRun(S);
  const v2 = JSON.parse(SV.serialize(S));
  v2.version = 2; delete v2.village.story; v2.village.cleared = true; v2.village.clears = 2; v2.village.funds = 9999;
  v2.village.storage = [{ uid: 900, id: 'golden_sword', plus: 3 }]; v2.village.bag = [{ uid: 901, id: 'herb', plus: 0 }];
  const L = SV.deserialize(JSON.stringify(v2));
  eq(L.version, D.SAVE_VERSION); eq(L.village.legacyClear30, true); eq(L.village.legacyClears30, 2);
  eq(L.village.cleared, false); eq(L.village.story.chapter, 1); eq(L.village.story.endingDone, false);
  eq(L.village.funds, 9999); eq(L.village.storage[0].plus, 3); eq(L.village.bag[0].id, 'herb');
});
test('旧セーブ（v2・探索途中）：今の冒険と地形はそのまま、以前のルールで進み、帰還後に第1章が始まる', () => {
  const S = newRun(321); goToFloor(S, 8);
  const v2 = JSON.parse(SV.serialize(S));
  v2.version = 2; delete v2.village.story; delete v2.run.chapter; delete v2.run.final;
  v2.run.bag.push({ uid: 950, id: 'wish_orb', plus: 0 });
  const tiles = v2.run.map.tiles.join('');
  const L = SV.deserialize(JSON.stringify(v2));
  eq(L.run.map.tiles.join(''), tiles, 'terrain kept'); eq(G.chapterOf(L.run), 'legacy');
  assert(L.run.bag.some((i) => i.uid === 950 && i.id === 'dream_crown'), 'orb converted');
  goToFloor(L, 10); eq(L.run.enemies.find((e) => e.boss).type, 'lion', 'old rules for this run');
  G.useReturnScroll(L); const res = G.finishRun(L);
  assert(!res.chapterClear && !L.village.cleared); eq(L.village.story.chapter, 1);
  G.depart(L, 322); eq(L.run.chapter, 1);
});

test('ボス階の変更前に始めた探索（layout なし）：その探索は以前の配置（第1章のボスは30階）のまま終え、次の探索から新しい配置', () => {
  // 第1章で地下22階まで進んでいた探索（新しいボス階15階より深い）
  const S = newRun(330); delete S.run.layout;
  eq(G.maxFloor(S.run), 30, 'old layout: 30F');
  goToFloor(S, 22);
  const L = SV.deserialize(SV.serialize(S));
  eq(L.run.layout, undefined); eq(L.run.floor, 22);
  for (let f = 23; f < 30; f++) assert(!G.F(L.run, f).boss, 'no boss at ' + f + ' in the old run');
  goToFloor(L, 30); eq(L.run.enemies.find((e) => e.boss).type, 'croc', 'croc at 30F for the old run');
  defeatBoss(L); L.run.player.x = L.run.portal.x; L.run.player.y = L.run.portal.y; G.act(L, { type: 'returnHome' });
  const res = G.finishRun(L); eq(res.chapterClear, 1); eq(L.village.story.chapter, 2);
  // 次の探索は新しい配置：第2章は20階でフレイザード
  G.depart(L, 331); eq(L.run.layout, D.LAYOUT); eq(G.maxFloor(L.run), 20);
  goToFloor(L, 20); eq(L.run.enemies.find((e) => e.boss).type, 'flame');
  // 第1章の報酬は二重に出ない
  defeatBoss(L); assert(!L.run.floorItems.some((f) => f.item && f.item.id === 'dragon_shield'), 'no duplicate chapter-1 reward');
});
test('ボス階の変更前に始めた探索（layout なし）で、新しいボス階より浅い所にいる場合も、以前の配置のまま進む（15階は通常の階）', () => {
  const S = newRun(332); delete S.run.layout; goToFloor(S, 12);
  const L = SV.deserialize(SV.serialize(S));
  goToFloor(L, 16); assert(!L.run.enemies.some((e) => e.boss) && L.run.stairs, '15-16F are normal floors in the old run');
  G.useReturnScroll(L); G.finishRun(L); eq(L.village.story.chapter, 1, 'chapter unchanged without the boss');
  G.depart(L, 333); eq(L.run.layout, D.LAYOUT); goToFloor(L, 15); eq(L.run.enemies.find((e) => e.boss).type, 'croc');
});

console.log('（参考）自動プレイによるバランス確認');
test('簡易AIで初回装備のまま遊んだ結果（参考値）', () => {
  const N = 40; let best = [], clears = 0, turns = [];
  for (let s = 0; s < N; s++) {
    const S = G.newState();
    G.takeLoan(S, 'food');
    G.depart(S, 1000 + s);
    const out = bot(S, 4000);
    best.push(S.run.floor); turns.push(S.run.turn);
    if (out === 'clear') clears++;
  }
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log(`      到達階 平均${avg(best)} 最高${Math.max(...best)} / クリア ${clears}/${N} / 平均ターン ${avg(turns)}`);
});

// 簡易AI：見えている敵を攻撃、回復・食事、階段へ向かう
function bot(S, maxTurns) {
  const run = S.run;
  while (!run.over && run.turn < maxTurns) {
    const p = run.player;
    const adj = run.enemies.find((e) => G.adjacent(run, p, e));
    const heal = run.bag.find((i) => G.def(i).type === 'heal');
    const food = run.bag.find((i) => G.def(i).type === 'food');
    const wpn = run.bag.filter((i) => G.def(i).type === 'weapon').sort((a, b) => G.def(b).atk - G.def(a).atk)[0];
    const shd = run.bag.filter((i) => G.def(i).type === 'shield').sort((a, b) => G.def(b).def - G.def(a).def)[0];
    if (wpn && !wpn.eq) { G.act(S, { type: 'equip', uid: wpn.uid }); continue; }
    if (shd && !shd.eq) { G.act(S, { type: 'equip', uid: shd.uid }); continue; }
    if (p.hp < p.maxhp * 0.35 && heal) { G.act(S, { type: 'use', uid: heal.uid }); continue; }
    if (p.hunger < 15 && food) { G.act(S, { type: 'use', uid: food.uid }); continue; }
    if (adj) {
      const st = run.bag.find((i) => i.id === 'thunder_staff' && i.charges > 0);
      const dir = G.dirOf(adj.x - p.x, adj.y - p.y);
      if (st && adj.boss) { G.act(S, { type: 'use', uid: st.uid, dir }); continue; }
      G.act(S, { type: 'move', dir }); continue;
    }
    if (G.F(run).boss) {
      const orb = run.floorItems.find((f) => f.item && f.item.id === 'wish_orb');
      if (run.portal && !orb) { if (G.onPortal(run)) { G.act(S, { type: 'returnHome' }); return 'clear'; } if (!walk(S, run.portal)) G.act(S, { type: 'wait' }); continue; }
      const boss = run.enemies.find((e) => e.boss);
      const tgt = orb || boss;
      if (tgt && !walk(S, tgt)) G.act(S, { type: 'wait' });
      continue;
    }
    // 道具を拾いに行く（見えているもの）
    const vis = run.floorItems.filter((f) => G.isVisible(run, f.x, f.y) && (f.gold || run.bag.length < D.BAG_SIZE));
    if (vis.length && walk(S, vis[0])) continue;
    if (G.onStairs(run)) { G.act(S, { type: 'descend' }); continue; }
    if (!walk(S, run.stairs)) G.act(S, { type: 'wait' });
  }
  return run.over ? 'dead' : 'timeout';
}
function walk(S, t) {
  const run = S.run, m = run.map, p = run.player;
  const dist = DG.distances(m, t.x, t.y);
  let best = null, bd = dist[p.y * m.w + p.x];
  if (bd <= 0) return false;
  for (const [dir, [dx, dy]] of Object.entries(G.DIRS)) {
    const nx = p.x + dx, ny = p.y + dy;
    const d = G.canStep(m, p.x, p.y, dx, dy) ? dist[ny * m.w + nx] : -1;
    if (d >= 0 && d < bd) { bd = d; best = dir; }
  }
  if (!best) return false;
  G.act(S, { type: 'move', dir: best });
  return true;
}


// ================= 投げる =================
function giveItem(S, id, extra) { const it = G.makeItem(S, id, extra); S.run.bag.push(it); return it; }
test('投げる：ねむり草は当たった敵だけを眠らせ、道具1個と1ターンを使う（ボスは短い）', () => {
  const S = newRun(301); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 9, 5), other = addEnemy(S, 'frog', 7, 9);
  const it = giveItem(S, 'sleep_incense'); const n = S.run.bag.length, t = S.run.turn;
  const r = G.act(S, { type: 'throw', uid: it.uid, dir: 'right' });
  assert(r.consumed); eq(S.run.turn, t + 1); eq(S.run.bag.length, n - 1);
  assert(e.sleep >= D.ITEMS.sleep_incense.turns - 1, 'slept ' + e.sleep); eq(other.sleep, 0, 'other not slept');
  assert(r.events.some((x) => x.t === 'throw' && x.hit));
  const b = addEnemy(S, 'frog', 5, 9); b.boss = true;
  const it2 = giveItem(S, 'sleep_incense'); G.act(S, { type: 'throw', uid: it2.uid, dir: 'down' });
  assert(b.sleep <= D.THROW.sleepBoss && b.sleep >= D.THROW.sleepBoss - 1, 'boss sleep ' + b.sleep);
  const it3 = giveItem(S, 'slow_powder'); b.sleep = 0; G.act(S, { type: 'throw', uid: it3.uid, dir: 'down' });
  assert(b.slow <= D.THROW.slowBoss && b.slow >= D.THROW.slowBoss - 1, 'boss slow ' + b.slow);
  const it4 = giveItem(S, 'slow_powder'); G.act(S, { type: 'throw', uid: it4.uid, dir: 'down', fromFloor: false });
  const e2 = addEnemy(S, 'frog', 5, 2); const it5 = giveItem(S, 'slow_powder'); G.act(S, { type: 'throw', uid: it5.uid, dir: 'up' });
  assert(e2.slow >= D.ITEMS.slow_powder.turns - 1, 'slow ' + e2.slow);
});
test('投げる：回復の道具は敵を回復し、たけには効かない', () => {
  const S = newRun(302); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 8, 5); e.hp = 100; e.sleep = 50;
  const p = S.run.player; p.hp = 5;
  for (const [id, n] of [['herb', 35], ['big_herb', 90], ['antidote', D.THROW.cureHeal]]) {
    const before = e.hp; const it = giveItem(S, id);
    G.act(S, { type: 'throw', uid: it.uid, dir: 'right' });
    eq(e.hp, Math.min(e.maxhp, before + n), id);
  }
  e.hp = 10; const el = giveItem(S, 'elixir'); G.act(S, { type: 'throw', uid: el.uid, dir: 'right' }); eq(e.hp, e.maxhp, 'elixir');
  assert(p.hp <= 6, 'player not healed ' + p.hp);
});
test('投げる：武器は強さと強化値でダメージ、ほかは小さな物理ダメージ（杖・巻物の効果は出ない）', () => {
  const S = newRun(303); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 7, 5); e.sleep = 999;
  const dmgOf = (it) => { const h = e.hp; G.act(S, { type: 'throw', uid: it.uid, dir: 'right' }); return h - e.hp; };
  const w0 = [], w5 = [];
  for (let i = 0; i < 20; i++) { w0.push(dmgOf(giveItem(S, 'bronze_sword'))); w5.push(dmgOf(giveItem(S, 'bronze_sword', { plus: 5 }))); }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const base0 = D.THROW.weapon.base + 3 * D.THROW.weapon.mul, base5 = D.THROW.weapon.base + 8 * D.THROW.weapon.mul;
  assert(Math.min(...w0) >= Math.floor(base0 * 0.85) && Math.max(...w0) <= Math.ceil(base0 * 1.15), 'w0 ' + w0);
  assert(avg(w5) > avg(w0) + 5, 'plus counts');
  const small = G.throwSmallDamage(S.run);
  eq(small, Math.round(D.THROW.small.base + D.THROW.small.perFloor * S.run.floor));
  for (const id of ['bamboo_shield', 'old_coin', 'amber_shard', 'banana', 'water_charm', 'poison_ring']) eq(dmgOf(giveItem(S, id)), small, id);
  const st = giveItem(S, 'thunder_staff', { charges: 3 });
  eq(dmgOf(st), small, 'staff physical');
  const sc = giveItem(S, 'sight_scroll'); eq(dmgOf(sc), small, 'scroll physical'); assert(!S.run.revealed, 'scroll not read');
  const fc = giveItem(S, 'fire_charm'); const other = addEnemy(S, 'frog', 5, 9); eq(dmgOf(fc), small, 'thunder scroll physical'); eq(other.hp, 999, 'no area effect');
});
test('投げる：けむり玉は当たった敵を離れた部屋へ（ボスには効かない）', () => {
  const S = newRun(304);
  const run = S.run; run.enemies = [];
  const room = run.map.rooms.find((r) => r.w >= 5) ; run.player.x = room.x + 1; run.player.y = room.y + 1;
  const e = addEnemy(S, 'frog', room.x + 3, room.y + 1); G.updateVision(run);
  G.act(S, { type: 'throw', uid: giveItem(S, 'smoke_ball').uid, dir: 'right' });
  assert(!(e.x === room.x + 3 && e.y === room.y + 1), 'warped'); eq(run.player.x, room.x + 1, 'player stays');
  const b = addEnemy(S, 'frog', room.x + 2, room.y + 1); b.boss = true;
  G.act(S, { type: 'throw', uid: giveItem(S, 'smoke_ball').uid, dir: 'right' });
  eq(b.x, room.x + 2, 'boss not warped'); assert(b.hp < 999, 'boss small damage');
});
test('投げる：外れたら射程の終わり・壁の手前に落ち、ふさがっていれば近くへ、無ければ消える', () => {
  const S = newRun(305); bigRoomFloor(S);
  const it = giveItem(S, 'banana');
  G.act(S, { type: 'throw', uid: it.uid, dir: 'right' });   // 5→15（10マス）
  assert(S.run.floorItems.some((f) => f.item === it && f.x === 15 && f.y === 5), 'range end');
  const it2 = giveItem(S, 'banana');
  G.act(S, { type: 'throw', uid: it2.uid, dir: 'up' });       // 壁の手前 y=2
  assert(S.run.floorItems.some((f) => f.item === it2 && f.x === 5 && f.y === 2), 'before wall');
  const it3 = giveItem(S, 'herb');
  G.act(S, { type: 'throw', uid: it3.uid, dir: 'right' });    // 15,5 はふさがっている → 近くへ
  const f3 = S.run.floorItems.find((f) => f.item === it3);
  assert(f3 && Math.max(Math.abs(f3.x - 15), Math.abs(f3.y - 5)) <= 2 && !(f3.x === 15 && f3.y === 5), 'nearby ' + JSON.stringify(f3 && [f3.x, f3.y]));
  // 2マス以内に空きが無い → 消える（1マスの小部屋）
  const m = S.run.map; m.tiles.fill(DG.WALL); for (let x = 5; x <= 6; x++) m.tiles[5 * m.w + x] = DG.FLOOR;
  S.run.floorItems = [{ x: 6, y: 5, item: G.makeItem(S, 'herb') }, { x: 5, y: 5, item: G.makeItem(S, 'herb') }];
  const it4 = giveItem(S, 'banana'); const n = S.run.floorItems.length;
  const r = G.act(S, { type: 'throw', uid: it4.uid, dir: 'right' });
  assert(r.consumed); eq(S.run.floorItems.length, n, 'vanished'); assert(!S.run.bag.includes(it4));
  assert(S.run.log.some((l) => /消えてしまった/.test(l)));
});
test('投げる：斜めでも壁の角を抜けず、壁で止まる', () => {
  const S = newRun(306); cornerMap(S);
  const e = addEnemy(S, 'frog', 7, 7); e.sleep = 999;
  const it = giveItem(S, 'herb');
  const r = G.act(S, { type: 'throw', uid: it.uid, dir: 'downright' });
  assert(r.consumed); eq(e.hp, 999, 'not hit through corner');
  assert(S.run.floorItems.some((f) => f.item === it && f.x === 5 && f.y === 5), 'fell at feet');
  const m = S.run.map; m.tiles[5 * m.w + 6] = DG.FLOOR; e.hp = 100;
  const it2 = giveItem(S, 'herb'); G.act(S, { type: 'throw', uid: it2.uid, dir: 'downright' });
  eq(e.hp, 135, 'diagonal hit');
});
test('投げる：装備中・大切な物は投げられず、同じ品を二重に投げられない', () => {
  const S = newRun(307); bigRoomFloor(S);
  const w = giveItem(S, 'bronze_sword'); w.eq = true;
  const t = S.run.turn, n = S.run.bag.length;
  let r = G.act(S, { type: 'throw', uid: w.uid, dir: 'right' });
  assert(!r.consumed); eq(S.run.turn, t); eq(S.run.bag.length, n);
  const orb = giveItem(S, 'wish_orb');
  r = G.act(S, { type: 'throw', uid: orb.uid, dir: 'right' }); assert(!r.consumed && S.run.bag.includes(orb), 'orb');
  r = G.act(S, { type: 'throw', uid: 0, dir: 'nowhere' }); assert(!r.consumed, 'bad dir');
  const e = addEnemy(S, 'frog', 7, 5); e.sleep = 999;
  const it = giveItem(S, 'old_coin');
  r = G.act(S, { type: 'throw', uid: it.uid, dir: 'right' }); assert(r.consumed);
  const hp = e.hp, turn = S.run.turn;
  r = G.act(S, { type: 'throw', uid: it.uid, dir: 'right' }); assert(!r.consumed, 'second throw rejected'); eq(e.hp, hp); eq(S.run.turn, turn);
});
test('投げる：バッグがいっぱいでも足元の道具を投げられる（拾わない）', () => {
  const S = newRun(308); bigRoomFloor(S);
  while (S.run.bag.length < D.BAG_SIZE) giveItem(S, 'banana');
  const e = addEnemy(S, 'frog', 8, 5); e.hp = 50;
  const fi = G.makeItem(S, 'herb'); S.run.floorItems.push({ x: 5, y: 5, item: fi });
  const r = G.act(S, { type: 'throw', uid: fi.uid, dir: 'right', fromFloor: true });
  assert(r.consumed); eq(e.hp, 85); eq(S.run.bag.length, D.BAG_SIZE); assert(!G.itemAt(S.run, 5, 5), 'floor item used');
  // 敵を倒したときの報酬は1回だけ
  const k = addEnemy(S, 'frog', 5, 8); k.hp = 1; k.exp = 7; const exp = S.run.player.exp;
  const w = G.makeItem(S, 'bronze_sword'); S.run.floorItems.push({ x: 5, y: 5, item: w });
  const r2 = G.act(S, { type: 'throw', uid: w.uid, dir: 'down', fromFloor: true });
  eq(r2.events.filter((x) => x.t === 'kill').length, 1); assert(!S.run.enemies.includes(k)); assert(S.run.player.exp >= exp + 7);
});

// ================= アクセサリー =================
test('アクセサリー：装備は1つだけ、1ターン、バッグの1枠。持っているだけでは効かない', () => {
  const S = newRun(311); bigRoomFloor(S);
  const a = giveItem(S, 'full_bangle'), b = giveItem(S, 'poison_ring');
  assert(!G.hasAcc(S.run, 'hunger'), 'not equipped yet');
  const t = S.run.turn;
  let r = G.act(S, { type: 'equip', uid: a.uid }); assert(r.consumed); eq(S.run.turn, t + 1); assert(G.hasAcc(S.run, 'hunger'));
  r = G.act(S, { type: 'equip', uid: b.uid }); assert(a.eq === false && b.eq === true, 'only one');
  assert(G.hasAcc(S.run, 'poison') && !G.hasAcc(S.run, 'hunger'));
  r = G.act(S, { type: 'equip', uid: b.uid }); assert(!b.eq && !G.hasAcc(S.run, 'poison'), 'unequip');
  // 武器・盾の装備はそのまま
  const w = giveItem(S, 'bronze_sword'); G.act(S, { type: 'equip', uid: w.uid }); G.act(S, { type: 'equip', uid: a.uid });
  assert(w.eq && a.eq, 'weapon and accessory together');
  // 置くと装備が外れる
  G.act(S, { type: 'drop', uid: a.uid }); assert(!a.eq && !G.hasAcc(S.run, 'hunger'), 'drop clears');
});
test('毒よけの指輪：新しい毒を防ぐ（今の毒は治らない）', () => {
  const S = newRun(312); bigRoomFloor(S);
  const p = S.run.player; p.hp = p.maxhp = 99999;
  const ring = giveItem(S, 'poison_ring'); G.act(S, { type: 'equip', uid: ring.uid });
  const e = addEnemy(S, 'lizard', 6, 5); e.atk = 2;
  for (let i = 0; i < 60; i++) { G.act(S, { type: 'wait' }); assert(!p.poison, 'no poison at ' + i); }
  assert(S.run.log.some((l) => /毒よけの指輪が毒を防いだ/.test(l)), 'blocked log');
  p.poison = 5; G.act(S, { type: 'equip', uid: ring.uid }); G.act(S, { type: 'equip', uid: ring.uid });
  assert(p.poison > 0, 'existing poison stays');
  G.act(S, { type: 'equip', uid: ring.uid });   // 外す
  p.poison = 0; p.poisonGuard = 0; let got = false;
  for (let i = 0; i < 60 && !got; i++) { G.act(S, { type: 'wait' }); got = p.poison > 0; if (!got) p.poisonGuard = 0; }
  assert(got, 'poison without ring');
});
test('がまぐちの守り：お金を盗まれない（外すと盗まれる）', () => {
  const S = newRun(313); bigRoomFloor(S);
  const p = S.run.player; p.hp = p.maxhp = 99999; S.run.runGold = 500;
  const pc = giveItem(S, 'purse_charm'); G.act(S, { type: 'equip', uid: pc.uid });
  const e = addEnemy(S, 'thief', 6, 5); e.atk = 1;
  for (let i = 0; i < 20; i++) G.act(S, { type: 'wait' });
  eq(S.run.runGold, 500, 'not stolen'); assert(!e.stolen);
  G.act(S, { type: 'equip', uid: pc.uid });
  for (let i = 0; i < 5 && S.run.runGold === 500; i++) G.act(S, { type: 'wait' });
  assert(S.run.runGold < 500, 'stolen without charm');
});
test('満腹の腕輪：歩き・足踏み・ダッシュで満腹度が減らない（回復もしない）', () => {
  const S = newRun(314); bigRoomFloor(S);
  const p = S.run.player; p.hunger = 40;
  const bg = giveItem(S, 'full_bangle'); G.act(S, { type: 'equip', uid: bg.uid });
  for (let i = 0; i < 200; i++) G.act(S, { type: i % 2 ? 'wait' : 'move', dir: i % 4 === 0 ? 'right' : 'left' });
  const ctx = G.dashContext(S); for (let i = 0; i < 5; i++) G.dashStep(S, 'right', ctx);
  eq(p.hunger, 40, 'hunger kept');
  G.act(S, { type: 'equip', uid: bg.uid });
  for (let i = 0; i < 200; i++) G.act(S, { type: 'wait' });
  assert(p.hunger < 40, 'decreases without');
});
function reviveSetup(seed) {
  const S = newRun(seed); bigRoomFloor(S);
  const nk = giveItem(S, 'life_necklace'); G.act(S, { type: 'equip', uid: nk.uid });
  return { S, nk, p: S.run.player };
}
test('命つなぎの首飾り：敵の攻撃で倒れると一度だけ立ち上がり、首飾りはなくなる', () => {
  const { S, nk, p } = reviveSetup(315);
  p.hp = 1; p.hunger = 10; p.poison = 5; p.bound = 2;
  const e = addEnemy(S, 'frog', 6, 5); e.atk = 9999;
  const e2 = addEnemy(S, 'frog', 4, 5); e2.atk = 9999;
  let r; for (let i = 0; i < 30 && !r?.events.some((x) => x.t === 'revive'); i++) { p.hp = Math.min(p.hp, 1); r = G.act(S, { type: 'wait' }); }
  assert(r.events.some((x) => x.t === 'revive'), 'revive event');
  assert(!S.run.over, 'not dead'); assert(p.hp >= 1, 'alive hp ' + p.hp);
  assert(!S.run.bag.includes(nk), 'necklace consumed'); assert(!G.equipped(S.run.bag, 'accessory'), 'slot empty');
  assert(p.hunger >= 30, 'hunger 30+'); eq(p.poison, 0); eq(p.bound, 0);
  // 次のターンからは普通に倒れる（無敵は残らない）
  for (let i = 0; i < 20 && !S.run.over; i++) G.act(S, { type: 'wait' });
  assert(S.run.over && S.run.result.type === 'dead', 'dies next time');
});
test('命つなぎの首飾り：毒・空腹で倒れるときも立ち上がる（全回復）', () => {
  let { S, p } = reviveSetup(316);
  p.hp = 1; p.poison = 5; p.poisonGuard = 0;
  let r = G.act(S, { type: 'wait' });
  assert(r.events.some((x) => x.t === 'revive') && !S.run.over, 'poison revive'); eq(p.hp, p.maxhp, 'full hp'); eq(p.poison, 0);
  ({ S, p } = reviveSetup(317));
  p.hp = 1; p.hunger = 0; p.starveAcc = D.PLAYER.starveTurns - 1;
  r = G.act(S, { type: 'wait' });
  assert(r.events.some((x) => x.t === 'revive') && !S.run.over, 'starve revive');
  assert(p.hunger >= 30 && p.hp === p.maxhp, 'restored ' + p.hp + '/' + p.hunger);
});
test('命つなぎの首飾り：装備していない・持っているだけでは発動しない', () => {
  const S = newRun(318); bigRoomFloor(S);
  giveItem(S, 'life_necklace');
  const p = S.run.player; p.hp = 1; p.poison = 5; p.poisonGuard = 0;
  G.act(S, { type: 'wait' });
  assert(S.run.over, 'dead');
});
test('アクセサリー：保存・読み込み後も装備と効果が残る。預ける・売ると装備が外れる', () => {
  const S = newRun(319); bigRoomFloor(S);
  const bg = giveItem(S, 'full_bangle'); G.act(S, { type: 'equip', uid: bg.uid });
  const S2 = SV.deserialize(SV.serialize(S));
  assert(G.hasAcc(S2.run, 'hunger'), 'kept after load');
  const h = S2.run.player.hunger; for (let i = 0; i < 50; i++) G.act(S2, { type: 'wait' }); eq(S2.run.player.hunger, h);
  // 村：預けると外れる・取り出しても装備していない
  const V = S2.village; S2.run = null;
  const a = G.makeItem(S2, 'poison_ring'); a.eq = true; V.bag.push(a);
  V.storageLv = 2; const r = G.deposit(S2, a.uid); assert(r.ok && !a.eq, 'deposit clears');
  G.withdraw(S2, a.uid); assert(!a.eq);
  G.toggleEquipInBag(V.bag, a.uid); assert(a.eq);
  const funds = V.funds; const sr = G.sell(S2, a.uid); assert(sr.ok && V.funds === funds + 250 && !V.bag.includes(a), 'sold');
});
test('アクセサリーの入手：中盤以降の道具の表にまれに入り、お店・商人・初期配布には無い', () => {
  const has = (ch, f, id) => D.floorFor(ch, f).items.some(([x]) => x === id);
  for (const ch of [1, 3, 6]) {
    assert(!has(ch, 10, 'poison_ring') && has(ch, 11, 'poison_ring') && has(ch, 11, 'purse_charm'), 'mid ' + ch);
    assert(!has(ch, 20, 'life_necklace') && has(ch, 21, 'life_necklace') && has(ch, 21, 'full_bangle'), 'deep ' + ch);
    assert(!has(ch, D.bossFloorOf(ch), 'life_necklace'), 'not on boss floor');
  }
  assert(has(6, 33, 'life_necklace'), 'demon floors');
  const acc = Object.keys(D.ITEMS).filter((id) => D.ITEMS[id].type === 'accessory');
  eq(acc.length, 4);
  for (const st of Object.values(D.SHOP_STOCK)) assert(!st.some((id) => acc.includes(id)), 'shop');
  for (const c of Object.values(D.CHAPTERS)) assert(!(c.shop || []).some((id) => acc.includes(id)), 'chapter shop');
  assert(!D.MERCHANT.goods.some((g) => acc.includes(g.id)), 'merchant');
  const S = newRun(320); assert(!S.run.bag.some((i) => acc.includes(i.id)), 'no start item');
});

console.log(`\n結果: ${passed} 成功 / ${failed} 失敗`);
process.exit(failed ? 1 : 0);
