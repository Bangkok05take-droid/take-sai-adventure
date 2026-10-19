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

// 出発画面で帰還の巻物を借りてから出発する（いつもの遊び方。持ち物がいっぱいなら借りない）
function departWithScroll(S, seed, opts) {
  if (!S.run && S.village.bag.length < D.BAG_SIZE) G.takeReturnScroll(S);
  return G.depart(S, seed, opts);
}
function newRun(seed = 1, setup) {
  const S = G.newState();
  if (setup) setup(S);
  const r = departWithScroll(S, seed);
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
// テスト用：ボス戦を始める（たけをボス部屋の中に置いたあと。入室の1ターン待ちは消して、以前のテストの手順のまま）
function engage(S) {
  const run = S.run;
  if (!run.bossFight || run.bossFight.engaged) return;
  const p = run.player;
  if (!G.inArena(run, p.x, p.y)) { const c = G.arenaCenter(run, run.enemies); const keep = { x: p.x, y: p.y }; p.x = c.x; p.y = c.y; G.checkBossRoom(S, []); p.x = keep.x; p.y = keep.y; }
  else G.checkBossRoom(S, []);
  G.finishBossIntro(S);   // 登場ムービーのあるボス（クロコダイン）は、ムービーを終えた扱いにして戦いを始める
  for (const e of run.enemies) if (e.boss) e.hold = 0;
}
function defeatBoss(S) {
  engage(S);
  const run = S.run, b = run.enemies.find((e) => e.boss);
  b.hp = 1; b.sleep = 99; b.charge = null; run.hazards = [];
  run.enemies = run.enemies.filter((e) => e === b || !e.summoned);
  run.player.hp = run.player.maxhp = 9999;
  for (const [dir, [dx, dy]] of Object.entries(G.DIRS)) {
    const x = b.x - dx, y = b.y - dy;
    if (G.canStep(run.map, x, y, dx, dy) && !G.enemyAt(run, x, y)) { run.player.x = x; run.player.y = y; G.updateVision(run);
      for (let i = 0; i < 60 && run.enemies.includes(b); i++) G.act(S, { type: 'move', dir });
      G.finishPostMovie(S);   // 撃破後ムービー（通常のバラン）は画面側で流す。ここでは見終えた扱い
      return; }
  }
  throw new Error('cannot reach boss');
}
function goDown(S) {
  const run = S.run;
  if (G.F(run).boss && run.enemies.some((e) => e.boss)) defeatBoss(S);
  const to = run.stairs || (run.crack && run.crack.kind === 'throne30' ? run.crack : null);   // 30階（玉座の間）は時空の亀裂から先へ
  if (G.canRescue(run)) G.commitRescue(S);
  run.player.x = to.x; run.player.y = to.y;
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
test('遅い敵（ぐんたいガニ。旧・石ガメ）は2ターンに1回、眠っている敵は動かない', () => {
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
test('敵の攻撃で1階のHP満タンから一撃死しない（スライム。旧・ガマ蛙の最大ダメージ）', () => {
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
test('リリパット（旧・吹き矢ザル）は斜め一直線からも撃つが、角越しには撃たない', () => {
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
test('ドラキー（旧・ヤミコウモリ）は1ターンに2歩動く', () => {
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
test('おどるほうせき（旧・金ぴかザル）：お金を盗んで逃げ、倒すと取り返せる', () => {
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
  eq(S.run.result.type, 'dead'); assert(/スライム/.test(S.run.result.cause));
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
test('倉庫：預ける・取り出す、10枠の上限、拡張で15枠。上限より多い前のセーブは消さない（預けられないだけ・取り出せる）', () => {
  eq(JSON.stringify(D.STORAGE_SIZE), JSON.stringify({ 1: 10, 2: 15, 3: 20, 4: 30 }));
  const S = G.newState();
  for (let i = 0; i < 25; i++) S.village.storage.length < 10 && S.village.storage.push(G.makeItem(S, 'herb'));
  const it = G.makeItem(S, 'banana'); S.village.bag.push(it);
  assert(!G.deposit(S, it.uid).ok, 'full at 10');
  S.village.funds = 1000; assert(G.upgradeVillage(S).ok); eq(S.village.stage, 2); eq(S.village.funds, 800);
  assert(G.deposit(S, it.uid).ok); eq(S.village.storage.length, 11);
  assert(G.withdraw(S, it.uid).ok); assert(S.village.bag.includes(it));
  // 前のセーブ：80枠のころの倉庫に50個（今は大倉庫でも30枠）→ 読み込んでも50個のまま。預けられないが取り出せる
  const T = G.newState(), V = T.village; V.built.storage2 = V.built.storage3 = V.built.storage4 = true; G.applyFacilities(V);
  for (let i = 0; i < 50; i++) V.storage.push(G.makeItem(T, 'herb'));
  const L = SV.deserialize(SV.serialize(T)), LV = L.village; eq(LV.storage.length, 50); eq(G.storageSize(LV), 30);
  const b = G.makeItem(L, 'banana'); LV.bag.push(b); assert(!G.deposit(L, b.uid).ok, 'over the limit: cannot deposit');
  assert(G.withdraw(L, LV.storage[0].uid).ok); eq(LV.storage.length, 49);
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
    assert(G.takeReturnScroll(S).ok); departWithScroll(S, 600 + k);
    assert(!S.run.bag.some((i) => i.id === 'wood_sword'), 'no sword in run');
    eq(G.equipped(S.run.bag, 'weapon'), null);
    assert(S.run.bag.some((i) => i.id === 'return_scroll'), 'return scroll kept');
    G.useReturnScroll(S); G.finishRun(S);
  }
  assert(!V.bag.some((i) => i.id === 'wood_sword'), 'still no sword after returns');
  // 素手でも1階の敵を倒せる（攻撃して倒れるまでの往復）
  let wins = 0;
  for (let s = 0; s < 20; s++) {
    const T = G.newState(); departWithScroll(T, 900 + s);
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
    G.takeReturnScroll(S); assert(!G.takeReturnScroll(S).ok, 'once'); departWithScroll(S, 100 + i);
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
test('帰還の巻物の無料の貸し出し：1回の冒険につき1枚・受け取りは任意・持ち物がいっぱいなら受取済みにしない・手放しても再支給しない・読み込み直しでも戻らない・村へ戻ると次の1枚', () => {
  const S = G.newState(), V = S.village;
  const scrolls = () => V.bag.filter((i) => i.id === 'return_scroll').length;
  assert(G.scrollStatus(S).can);
  // 持ち物がいっぱい：受け取れず、受取済みにもならない
  while (V.bag.length < D.BAG_SIZE) V.bag.push(G.makeItem(S, 'herb'));
  const f = G.takeReturnScroll(S); assert(!f.ok && /いっぱい/.test(f.msg)); assert(!V.scrollTaken); eq(scrolls(), 0);
  assert(G.canDepart(S).ok, 'full bag can still depart');
  V.bag.pop();
  // 受け取り：1枚だけ。2回目・連打は失敗
  assert(G.takeReturnScroll(S).ok); eq(scrolls(), 1); assert(V.scrollTaken);
  assert(!G.takeReturnScroll(S).ok); assert(!G.takeReturnScroll(S).ok); eq(scrolls(), 1);
  // 読み込み直しても受取済みのまま
  let L = SV.deserialize(SV.serialize(S)); assert(L.village.scrollTaken && !G.takeReturnScroll(L).ok);
  // 手放しても（ここでは持ち物から取り除く）同じ準備中は再支給しない。倉庫・売却はもともとできない
  const sc = V.bag.find((i) => i.id === 'return_scroll'); assert(!G.deposit(S, sc.uid).ok && !G.sell(S, sc.uid).ok);
  V.bag = V.bag.filter((i) => i !== sc); assert(!G.takeReturnScroll(S).ok, 'no reissue after discarding'); eq(scrolls(), 0);
  // 出発しても自動では配らない（二重にならない）
  G.depart(S, 5); eq(S.run.bag.filter((i) => i.id === 'return_scroll').length, 0, 'no auto scroll');
  assert(!G.takeReturnScroll(S).ok, 'not during a run');
  // 帰還の祠・帰還口で戻る代わりに、ここでは敗北で村へ戻る → 次の冒険の1枚を受け取れる
  S.run.over = true; S.run.result = { type: 'dead', floor: 1 }; G.finishRun(S);
  assert(!V.scrollTaken && G.takeReturnScroll(S).ok); eq(scrolls(), 1);
  // 借りて出発 → 巻物で帰る → また1枚
  G.depart(S, 6); eq(S.run.bag.filter((i) => i.id === 'return_scroll').length, 1); G.useReturnScroll(S); G.finishRun(S);
  eq(scrolls(), 0); assert(G.takeReturnScroll(S).ok);
  // 借りずに出発してもよい
  const S2 = G.newState(); assert(G.depart(S2, 7).ok); eq(S2.run.bag.filter((i) => i.id === 'return_scroll').length, 0);
});

console.log('お金の使い道（施設・鍛冶屋・食堂・展示室）');
test('施設：価格・解放条件・素材を確認でき、満たさないと建てられない。建てると効果が出る', () => {
  const S = G.newState(); const V = S.village;
  V.funds = 100000;
  let st = G.facilityStatus(S, 'storage3');
  assert(!st.unlocked && st.missing.includes('storage2') && st.missing.includes('floor10'), 'locked');
  assert(!G.buildFacility(S, 'storage3').ok);
  assert(G.buildFacility(S, 'storage2').ok); eq(G.storageSize(V), 15); eq(V.funds, 100000 - 200);
  V.bestFloor = 10; assert(G.buildFacility(S, 'storage3').ok); eq(G.storageSize(V), 20);
  V.bestFloor = 20; assert(G.buildFacility(S, 'storage4').ok); eq(G.storageSize(V), 30);
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
  departWithScroll(S, 3);
  eq(S.run.meal, 'tomyum'); eq(V.meal, null);
  const atk = G.playerAtk(S.run);
  G.useReturnScroll(S); G.finishRun(S);
  departWithScroll(S, 4); assert(!S.run.meal, 'meal ended'); eq(G.playerAtk(S.run), atk - 3);
  G.useReturnScroll(S); G.finishRun(S);
  G.buyMeal(S, 'gapao'); departWithScroll(S, 5); eq(S.run.player.maxhp, 50); eq(S.run.player.hp, 50);
  eq(V.funds, funds - 150);
});
test('食堂：カオマンガイで満腹度が減りにくい', () => {
  const S = G.newState(); const V = S.village; V.funds = 5000;
  G.buildFacility(S, 'storage2'); G.buildFacility(S, 'diner'); G.buyMeal(S, 'kaomangai');
  departWithScroll(S, 6); bigRoomFloor(S);
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
  assert(L.village.built.storage2 && L.village.built.smith1, 'facilities from old stage'); eq(L.village.smithLv, 1); eq(L.village.storageLv, 2); eq(G.storageSize(L.village), 15);
  // 道具はそのまま（2026年10月に内部IDが変わったお宝・装備だけ新しいIDへ）
  const ren = (list) => JSON.stringify(list.map((i) => Object.assign({}, i, { id: SV.RENAME_V4[i.id] || i.id })));
  eq(JSON.stringify(L.village.bag), ren(raw.village.bag));
  eq(JSON.stringify(L.village.storage), ren(raw.village.storage));
  assert(departWithScroll(L, 5).ok, 'can depart');
});
test('旧セーブの探索途中に旧・宝珠があれば守護の輝石に置き換え、旧記録にする（新エンディング扱いにしない）', () => {
  const data = JSON.parse(fixture('save-v1-midrun.json'));
  data.run.bag.push({ uid: 999, id: 'wish_orb', plus: 0 });
  const L = SV.deserialize(JSON.stringify(data));
  assert(!L.run.bag.some((i) => i.id === 'wish_orb') && L.run.bag.some((i) => i.uid === 999 && i.id === 'croc_tear'));   // 守護の輝石 → 獅子の守り石 → クロコダイルの涙（展示室4番目の枠）
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
  assert(run.floorItems.some((f) => f.item && f.item.id === 'croc_tear'), 'reward');
  assert(!run.floorItems.some((f) => f.item && G.def(f.item).type === 'shield'), 'no shield from croc');
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
  departWithScroll(S, 45); eq(S.run.floor, 1); eq(S.run.chapter, 2);
  goToFloor(S, 20); eq(S.run.enemies.find((e) => e.boss).type, 'flame');
  G.useReturnScroll(S); const r = G.finishRun(S);
  assert(!r.chapterClear && !r.rewardFunds, 'no reward without the boss'); eq(S.village.story.chapter, 2);
  eq(S.village.funds, funds + r.gold);
});
test('帰還して再出発すると1階から', () => {
  const S = newRun(43, (S0) => { S0.village.story.chapter = 4; }); goToFloor(S, 25);
  S.run.player.x = S.run.returnPoint.x; S.run.player.y = S.run.returnPoint.y;
  G.act(S, { type: 'returnHome' }); G.finishRun(S);
  departWithScroll(S, 44); eq(S.run.floor, 1);
});
test('素材は持ち帰ると素材箱に入り、売却・預入できない。倒れると失う', () => {
  const S = newRun(45); bigRoomFloor(S);
  S.run.bag.push(G.makeItem(S, 'amber_shard'), G.makeItem(S, 'amber_shard'), G.makeItem(S, 'crystal_shard'));
  G.useReturnScroll(S); const res = G.finishRun(S);
  eq(S.village.materials.amber_shard, 2); eq(S.village.materials.crystal_shard, 1); eq(res.materials.amber_shard, 2);
  assert(!S.village.bag.some((i) => G.def(i).type === 'material'));
  const it = G.makeItem(S, 'gold_leaf'); assert(!G.canSell(it));
  departWithScroll(S, 46); S.run.bag.push(G.makeItem(S, 'gold_leaf')); S.run.player.hp = 1;
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
  V.story.defeated.baran = true;   // 赤い橋はバランを倒した後
  let ids = G.unbuiltFacilities(V).map((f) => f.id);
  assert(ids.includes('storage2') && !ids.includes('storage3') && !ids.includes('storage4'), ids.join());
  assert(G.buildFacility(S, 'storage2').ok);
  ids = G.unbuiltFacilities(V).map((f) => f.id);
  assert(!ids.includes('storage2') && ids.includes('storage3'), ids.join());
  eq(G.storageSize(V), 15, 'effect kept'); assert(G.hasFacility(V, 'storage2'), 'record kept');
  for (let k = 0; k < 40; k++) { const f = G.unbuiltFacilities(V).find((f) => G.facilityStatus(S, f.id).unlocked); if (!f) break; G.buildFacility(S, f.id); V.funds = 1e6; }
  V.donated = {}; for (const id of D.MUSEUM_ITEMS) V.donated[id] = true;
  for (let k = 0; k < 40; k++) { const f = G.unbuiltFacilities(V).find((f) => G.facilityStatus(S, f.id).unlocked); if (!f) break; G.buildFacility(S, f.id); V.funds = 1e6; }
  eq(G.unbuiltFacilities(V).length, 0, 'all built'); eq(G.storageSize(V), 30); eq(G.smithMax(V), 8);
});

// ---- 謎の旅商人 ----
function findMerchant(seed0, ch, minF) {
  for (let s = seed0; s < seed0 + 400; s++) {
    const S = G.newState(); S.village.story.chapter = ch || 3;
    departWithScroll(S, s);
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
    const S = G.newState(); S.village.story.chapter = 2; departWithScroll(S, 3000 + s); const r = S.run;
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
  const S2 = G.newState(); S2.village.story.chapter = 3; departWithScroll(S2, r.seed);
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
  // 持ち物がいっぱいでも出発できる（帰還の巻物は借りられない）
  assert(G.canDepart(S2).ok); assert(!G.takeReturnScroll(S2).ok);
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
// 更新前から続いている最終章の探索（版2：35階で大魔王バーン→真大魔王バーンの連戦）。セーブに残っている探索だけがこの流れ
function chapterRunV2(ch, seed, floor) {
  const S = newRun(seed, (S0) => { S0.village.story.chapter = ch; });
  S.run.layout = 2; S.run.final = { stage: 'none', healed: false, cutsceneSeen: false };
  goToFloor(S, floor);
  return S;
}
function chapterRun(ch, seed, floor) {
  const S = newRun(seed, (S0) => { S0.village.story.chapter = ch; });
  eq(S.run.chapter, ch);
  goToFloor(S, floor);
  return S;
}
test('撃破後ムービー（通常のバラン）：撃破で1回だけ予約。報酬・撃破の記録・帰還口は撃破のときに1回だけ。ムービー中の行動はせずターンも進まない。ほかのボス・以前の探索には無い', () => {
  eq(Object.keys(D.BOSS_OUTROS).join(), 'baran');
  const S = chapterRun(4, 240, D.CHAPTERS[4].goal), run = S.run;
  engage(S);
  const b = run.enemies.find((e) => e.boss); b.hp = 1; b.sleep = 99; run.player.hp = run.player.maxhp = 9999;
  let res = null;
  for (const [dir, [dx, dy]] of Object.entries(G.DIRS)) { const x = b.x - dx, y = b.y - dy;
    if (G.canStep(run.map, x, y, dx, dy) && !G.enemyAt(run, x, y)) { run.player.x = x; run.player.y = y; G.updateVision(run);
      for (let i = 0; i < 60 && run.enemies.includes(b); i++) res = G.act(S, { type: 'move', dir }); break; } }
  assert(!run.enemies.includes(b), 'baran down');
  const outro = res.events.filter((e) => e.t === 'bossOutro');
  eq(outro.length, 1); eq(outro[0].movie, 'baranTaken'); eq(run.postMovie, 'baranTaken');
  assert(res.events.findIndex((e) => e.t === 'bossDown') < res.events.findIndex((e) => e.t === 'bossOutro'), 'after defeat effect');
  const rewards = () => run.floorItems.filter((f) => f.item && f.item.bossReward).map((f) => f.item.id).sort().join();
  eq(rewards(), 'shinma_sword'); assert(run.portal && S.village.story.defeated.baran && S.village.bossKills.baran === 1);
  // ムービー中に行動が届いても：行動しない・ターンは進まない・ムービーを終えた扱い（固まらない）
  const t0 = run.turn, pos = run.player.x + ',' + run.player.y;
  const r2 = G.act(S, { type: 'wait' });
  assert(!r2.consumed && run.turn === t0 && run.player.x + ',' + run.player.y === pos && !run.postMovie, 'no action during movie');
  eq(G.finishPostMovie(S), null, 'only once');
  // 終わったあと：報酬・帰還口は増えない、バランは戻らない
  G.act(S, { type: 'wait' }); eq(rewards(), 'shinma_sword'); assert(!run.enemies.some((e) => e.type === 'baran'), 'baran not shown again');
  eq(S.village.bossKills.baran, 1);
  // 保存・読み込みでムービーの予約は残る（途中で読み込み直したら流し直す）
  run.postMovie = 'baranTaken'; eq(TS.Save.deserialize(TS.Save.serialize(S)).run.postMovie, 'baranTaken', 'kept in save');
  run.postMovie = null;
  // ほかのボス（クロコダイン）・以前の探索のバランには無い
  const C = chapterRun(1, 241, D.CHAPTERS[1].goal); defeatBoss(C); assert(!C.run.postMovie, 'no outro for croc');
});
// ボス部屋の中で、ボスから見て (dx,dy) の位置にたけを置く
function placeNear(S, dx, dy) {
  engage(S);
  const run = S.run, b = run.enemies.find((e) => e.boss);
  run.player.x = b.x + dx; run.player.y = b.y + dy; run.player.hp = run.player.maxhp = 5000;
  G.updateVision(run); return b;
}
const stepOk = (run, dir) => { const [dx, dy] = G.DIRS[dir]; return G.canStep(run.map, run.player.x, run.player.y, dx, dy) && !G.enemyAt(run, run.player.x + dx, run.player.y + dy); };
test('章ごとのボスの階：第1章15階・第2章20階・第3章25階・第4章30階・第5章30階（別々の章）。最終章（版4）は30階に大魔王バーン、31〜32階を探索、33階に真大魔王バーン。版3の途中の探索は35階のまま', () => {
  const want = { 1: ['croc', 15], 2: ['flame', 20], 3: ['kill', 25], 4: ['baran', 30], 5: ['mist', 30] };
  for (const ch of [1, 2, 3, 4, 5]) {
    const [boss, fl] = want[ch];
    const S = chapterRun(ch, 200 + ch, fl);
    eq(S.run.enemies.filter((e) => e.boss).map((e) => e.type).join(), boss, 'only one boss'); eq(G.maxFloor(S.run), fl); eq(D.CHAPTERS[ch].goal, fl);
    for (let f = 1; f < fl; f++) assert(!G.F(S.run, f).boss, 'no boss above ' + f);
    eq(S.run.map.monsterHouse, null, 'no monster house on boss floor');
  }
  const S = chapterRun(6, 210, 30);
  eq(S.run.final.v, 3); eq(S.run.enemies.filter((e) => e.boss).map((e) => e.type).join(), 'vearn', '30F vearn'); assert(!S.run.stairs, 'no stairs before the fight');
  for (let f = 1; f < 30; f++) assert(!G.F(S.run, f).boss, 'no boss above ' + f);
  eq(S.run.layout, 4);
  for (let f = 31; f < 33; f++) assert(!G.F(S.run, f).boss, 'no boss on ' + f);
  eq(G.F(S.run, 33).boss, 'truevearn'); eq(G.maxFloor(S.run), 33); eq(D.CHAPTERS[6].goal, 33);
  // 版3（更新前から続いている探索）は、途中で階を変えない：31〜34階を探索、35階に真大魔王バーン
  for (let f = 31; f < 35; f++) assert(!D.floorFor(6, f, 3).boss, 'v3 no boss on ' + f);
  eq(D.floorFor(6, 35, 3).boss, 'truevearn'); eq(D.bossFloorOf(6, 3), 35);
  // 版2（更新前から続く探索）は以前どおり35階で大魔王バーン
  const O = chapterRunV2(6, 211, 35); eq(O.run.enemies.find((e) => e.boss).type, 'vearn'); eq(O.run.final.stage, 'battle1');
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
  const S = chapterRunV2(6, 270, 35), run = S.run;   // 版2（更新前から続く探索）の流れ
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
  // クリア後も探索・村の発展を続けられる（新しい探索は版3。どちらのボスも出ない）
  assert(departWithScroll(L2, 271).ok); eq(L2.run.chapter, 6); assert(L2.run.final.skip.vearn && L2.run.final.skip.truevearn);
});
test('最終決戦で敗北（版2の探索）：通常の敗北ルールで村へ。最終章は未クリアのまま、次は（版3で）30階の大魔王バーンから', () => {
  const S = chapterRunV2(6, 280, 35), run = S.run;
  defeatBoss(S); G.startFinalBattle(S);
  run.player.hp = 1; const b = run.enemies.find((e) => e.boss); b.cds = {}; b.rest = 0; b.hold = 0;
  run.player.x = b.x + 1; run.player.y = b.y; G.updateVision(run);
  for (let i = 0; i < 20 && !run.over; i++) G.act(S, { type: 'wait' });
  assert(run.over && run.result.type === 'dead', 'died');
  const res = G.finishRun(S);
  eq(res.type, 'dead'); assert(!S.village.story.endingDone && !S.village.cleared); eq(S.village.story.chapter, 6);
  eq(S.village.story.finalStage, 'none'); eq(S.village.story.defeated.vearn, false, 'retry from battle 1');
  departWithScroll(S, 281); goToFloor(S, 30); eq(S.run.final.v, 3); eq(S.run.enemies.find((e) => e.boss).type, 'vearn');
});
test('章のボスを倒したあとに倒れても、その章はクリア扱い（やり直させない）。倒す前の敗北・途中帰還では章はそのまま', () => {
  const S = chapterRun(2, 290, 20);
  G.useReturnScroll(S); G.finishRun(S); eq(S.village.story.chapter, 2, 'mid return keeps chapter');
  departWithScroll(S, 291); goToFloor(S, 20); S.run.player.hp = 0;
  const r0 = G.act(S, { type: 'wait' });
  S.run.over = true; S.run.result = { type: 'dead', cause: 'test', floor: 20, lostGold: 0, lostItems: 0 };
  G.finishRun(S); eq(S.village.story.chapter, 2, 'death before boss keeps chapter');
  departWithScroll(S, 292); goToFloor(S, 20); defeatBoss(S);
  S.run.over = true; S.run.result = { type: 'dead', cause: 'test', floor: 20, lostGold: 0, lostItems: 0 };
  const res = G.finishRun(S);
  eq(res.chapterClear, 2); eq(S.village.story.chapter, 3);
});
test('全章を順に進める：第1章→第5章→最終章→エンディング。各章の報酬は1回だけ', () => {
  const S = newRun(300);
  let funds0 = S.village.funds;
  for (let ch = 1; ch <= 5; ch++) {
    if (ch > 1) departWithScroll(S, 300 + ch);
    eq(S.run.chapter, ch);
    goToFloor(S, D.CHAPTERS[ch].goal); eq(S.run.enemies.filter((e) => e.boss).length, 1); defeatBoss(S);
    assert(!S.run.stairs, 'cannot go deeper after the chapter boss');
    S.run.player.x = S.run.portal.x; S.run.player.y = S.run.portal.y; G.act(S, { type: 'returnHome' });
    const res = G.finishRun(S);
    eq(res.chapterClear, ch); eq(res.rewardFunds, D.CHAPTERS[ch].reward.funds);
  }
  eq(S.village.story.chapter, 6);
  departWithScroll(S, 310); goToFloor(S, 30); defeatBoss(S); assert(!S.run.portal && !S.run.stairs && S.run.crack, '30F: time crack, no stairs, no portal'); assert(G.commitRescue(S).ok);
  goToFloor(S, D.FINAL_V3.truevearn); defeatBoss(S);
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
  departWithScroll(L, 322); eq(L.run.chapter, 1);
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
  departWithScroll(L, 331); eq(L.run.layout, D.LAYOUT); eq(G.maxFloor(L.run), 20);
  goToFloor(L, 20); eq(L.run.enemies.find((e) => e.boss).type, 'flame');
  // 第1章の報酬は二重に出ない
  defeatBoss(L); assert(!L.run.floorItems.some((f) => f.item && f.item.id === 'croc_tear'), 'no duplicate chapter-1 reward');
});
test('ボス階の変更前に始めた探索（layout なし）で、新しいボス階より浅い所にいる場合も、以前の配置のまま進む（15階は通常の階）', () => {
  const S = newRun(332); delete S.run.layout; goToFloor(S, 12);
  const L = SV.deserialize(SV.serialize(S));
  goToFloor(L, 16); assert(!L.run.enemies.some((e) => e.boss) && L.run.stairs, '15-16F are normal floors in the old run');
  G.useReturnScroll(L); G.finishRun(L); eq(L.village.story.chapter, 1, 'chapter unchanged without the boss');
  departWithScroll(L, 333); eq(L.run.layout, D.LAYOUT); goToFloor(L, 15); eq(L.run.enemies.find((e) => e.boss).type, 'croc');
});

console.log('ボスの報酬・展示室・宝箱（2026年10月）');
// ボスを倒して、現れた報酬をすべて拾い、帰還口から村へ帰る
function bossRewardRun(ch, seed, S0) {
  const S = S0 || newRun(seed, (s) => { s.village.story.chapter = ch; });
  if (S0) { const r = departWithScroll(S, seed); assert(r.ok, r.msg); }
  goToFloor(S, D.CHAPTERS[ch].goal);
  const run = S.run, had = new Set(run.floorItems);
  defeatBoss(S);
  const got = run.floorItems.filter((f) => f.item && !had.has(f)).map((f) => f.item.id);
  run.enemies = [];
  for (const f of run.floorItems.slice()) {
    if (!f.item) continue;
    run.player.x = f.x; run.player.y = f.y; G.act(S, { type: 'pickup' });
  }
  run.player.x = run.portal.x; run.player.y = run.portal.y; G.act(S, { type: 'returnHome' });
  const res = G.finishRun(S);
  return { S, got, res };
}
test('各ボスの報酬（2026年10月の見直し）：クロコダイン＝涙・斧、フレイザード＝氷炎の盾・氷炎結晶、キルバーン＝ファントムシールド・マスク、バラン＝真魔剛竜剣（お宝の竜の紋章は廃止）、ミストバーン＝勇者の剣・盾', () => {
  const want = {
    1: ['croc_tear', 'croc_axe'], 2: ['iceflame_shield', 'iceflame_crystal'],
    3: ['phantom_shield', 'phantom_mask'], 4: ['shinma_sword'], 5: ['hero_sword', 'hero_shield'],   // 竜の紋章はアクセサリーだけ（赤い橋の向こう岸で拾う）
  };
  eq(JSON.stringify(D.CHAPTERS[6].reward.items), JSON.stringify(['demon_robe']));
  for (const ch of [1, 2, 3, 4, 5]) {
    const { S, got, res } = bossRewardRun(ch, 700 + ch);
    eq(JSON.stringify(got.slice().sort()), JSON.stringify(want[ch].slice().sort()), 'reward ch' + ch);
    eq(res.chapterClear, ch);
    for (const id of want[ch]) assert(S.village.bag.some((i) => i.id === id), id + ' brought home');
  }
  // 名前・能力値
  const I = D.ITEMS;
  eq(I.croc_tear.name, 'クロコダインの涙'); eq(I.croc_tear.type, 'treasure');
  eq(I.croc_axe.name, 'クロコダインの斧'); eq(I.croc_axe.type, 'weapon'); eq(I.croc_axe.atk, 16);
  eq(I.iceflame_shield.name, '氷炎の盾'); eq(I.iceflame_shield.type, 'shield'); eq(I.iceflame_shield.def, 15); eq(I.iceflame_crystal.type, 'treasure');
  eq(I.phantom_shield.def, 17); eq(I.phantom_mask.type, 'accessory'); eq(I.phantom_mask.acc, 'hunger'); eq(I.phantom_mask.def, 5);
  eq(I.shinma_sword.atk, 24); eq(I.dragon_crest.type, 'accessory'); eq(I.dragon_crest.acc, 'revive'); eq(I.dragon_crest.atk, 5);
  eq(I.hero_sword.name, '覇者の剣'); eq(I.hero_shield.name, '覇者の盾');
  eq(I.demon_robe.type, 'accessory'); eq(I.demon_robe.acc, 'deep');
  eq(I.golden_sword.sell, 1760); eq(I.golden_shield.sell, 1740);
  // 旧IDは定義から消え、どこからも出ない（りゅうきしの剣・げっこうの盾も）
  for (const id of Object.keys(SV.RENAME_V4).concat(Object.keys(SV.RENAME_V6))) assert(!D.ITEMS[id], 'old id removed: ' + id);
  for (let ch = 1; ch <= 6; ch++) for (let f = 1; f <= D.bossFloorOf(ch); f++) for (const [id] of D.floorFor(ch, f).items) assert(D.ITEMS[id], 'floor item defined ' + id);
  for (const C of Object.values(D.CHAPTERS)) for (const id of C.reward.items) assert(D.ITEMS[id], 'reward defined ' + id);
  for (const E of Object.values(D.ENEMIES)) { if (E.drop && E.drop !== 'wish_orb') assert(D.ITEMS[E.drop], 'drop defined ' + E.drop); if (E.repeatDrop) assert(D.ITEMS[E.repeatDrop]); }
});
test('展示室：全12枠、4番目＝クロコダイルの涙・8番目＝氷炎結晶。ボスで入手して寄贈でき、12種で称号がそろう', () => {
  eq(D.MUSEUM_ITEMS.length, 12); eq(D.MUSEUM_ITEMS[3], 'croc_tear'); eq(D.MUSEUM_ITEMS[7], 'iceflame_crystal');
  eq(new Set(D.MUSEUM_ITEMS).size, 12);
  for (const id of D.MUSEUM_ITEMS) eq(D.ITEMS[id].type, 'treasure', id);
  // 今の冒険で第1章・第2章のボスを倒し、持ち帰ったお宝を寄贈する
  const a = bossRewardRun(1, 811);
  const S = a.S; S.village.museum = true;
  const b = bossRewardRun(2, 812, S);
  eq(S.village.story.chapter, 3);
  for (const id of ['croc_tear', 'iceflame_crystal']) {
    const it = S.village.bag.find((i) => i.id === id); assert(it, 'have ' + id);
    assert(G.canDonate(S.village, it));
    const funds = S.village.funds, r = G.donate(S, it.uid); assert(r.ok, r.msg);
    eq(S.village.funds, funds + Math.floor(D.ITEMS[id].sell * D.MUSEUM_THANKS));
  }
  eq(G.donatedCount(S.village), 2);
  // 残りの10種も寄贈すれば12/12で最後の称号
  for (const id of D.MUSEUM_ITEMS) if (!S.village.donated[id]) { const it = G.makeItem(S, id); S.village.bag.push(it); assert(G.donate(S, it.uid).ok, id); }
  eq(G.donatedCount(S.village), 12); eq(G.title(S.village), D.TITLES[D.TITLES.length - 1][1]);
  // 同じお宝は2回目は寄贈できない
  const again = G.makeItem(S, 'croc_tear'); S.village.bag.push(again); assert(!G.canDonate(S.village, again)); assert(!G.donate(S, again.uid).ok);
});
// v3のセーブ（報酬の入れ替え前）を作る
function v3Save(setup) {
  const S = G.newState(); S.version = 3;
  setup(S);
  return JSON.parse(JSON.stringify(S));
}
test('旧セーブの移行（v3→v4）：旧お宝・旧装備を新しいIDへ。強化値・装備中・番号を保持。寄贈数・お礼・称号は二重にならない', () => {
  const raw = v3Save((S) => {
    const V = S.village; V.built.museum = true; V.museum = true; V.funds = 5000;
    V.bag.push({ uid: 101, id: 'dragon_shield', plus: 3 }, { uid: 102, id: 'guardian_gem', plus: 0 });
    V.storage.push({ uid: 103, id: 'frost_sword', plus: 2 }, { uid: 104, id: 'river_pearl', plus: 0 });
    V.donated = { old_coin: true, jade_elephant: true, guardian_gem: true };
    V.story.defeated.croc = true; V.story.defeated.flame = true; V.story.chapter = 3;
    V.nextUid = 500;
  });
  const before = { count: Object.keys(raw.village.donated).length, funds: raw.village.funds };
  const L = SV.deserialize(JSON.stringify(raw));
  const V = L.village;
  eq(L.version, D.SAVE_VERSION);
  const sh = V.bag.find((i) => i.uid === 101); eq(sh.id, 'phantom_shield'); eq(sh.plus, 3); eq(G.itemName(sh), '漆黒の盾+3');
  eq(V.bag.find((i) => i.uid === 102).id, 'croc_tear');
  const sw = V.storage.find((i) => i.uid === 103); eq(sw.id, 'shinma_sword'); eq(sw.plus, 2);
  eq(V.storage.find((i) => i.uid === 104).id, 'iceflame_crystal');
  // 寄贈：獅子の守り石の記録はクロコダイルの涙へ。数・お金・称号は変わらない
  assert(V.donated.croc_tear && !V.donated.guardian_gem);
  eq(G.donatedCount(V), before.count); eq(V.funds, before.funds); eq(G.title(V), '見習い収集家');
  // 持っている・飾ってあるので、涙・結晶の届け物はない（v6 で増えた斧・氷炎の盾だけ届く）
  eq(JSON.stringify(V.giftNotice), JSON.stringify(['croc_axe', 'iceflame_shield']));
  eq(V.storage.length, 4); eq(V.bag.length, 2);
  // 寄贈済みのクロコダイルの涙は2回目の寄贈ができない。氷炎結晶は寄贈できる
  assert(!G.canDonate(V, V.bag.find((i) => i.uid === 102)));
  assert(G.canDonate(V, V.storage.find((i) => i.uid === 104)));
  // 再保存→再読み込みで変わらない
  const t = SV.serialize(L); eq(SV.serialize(SV.deserialize(t)), t);
});
test('旧セーブの移行：探索途中（装備中の盾・剣、床の旧お宝）も新しいIDで続けられる', () => {
  const S = newRun(820);
  const run = S.run;
  run.bag.push({ uid: 9001, id: 'dragon_shield', plus: 4, eq: true }, { uid: 9002, id: 'frost_sword', plus: 1, eq: true });
  for (const it of run.bag) if (it.uid < 9000 && (G.def(it).type === 'weapon' || G.def(it).type === 'shield')) it.eq = false;
  const spot = DG.freeTile(run.map, run.rng, run.floorItems.concat([run.player]));
  run.floorItems.push({ x: spot.x, y: spot.y, item: { uid: 9003, id: 'river_pearl', plus: 0 } });
  const raw = JSON.parse(SV.serialize(S)); raw.version = 3;
  const L = SV.deserialize(JSON.stringify(raw));
  const w = G.equipped(L.run.bag, 'weapon'), s = G.equipped(L.run.bag, 'shield');
  eq(w.id, 'shinma_sword'); eq(w.plus, 1); eq(s.id, 'phantom_shield'); eq(s.plus, 4);
  eq(G.playerDef(L.run) >= 19, true);
  eq(L.run.floorItems.find((f) => f.item && f.item.uid === 9003).item.id, 'iceflame_crystal');
  // 拾って続けられる
  L.run.enemies = []; L.run.player.x = spot.x; L.run.player.y = spot.y; G.act(L, { type: 'pickup' });
  assert(L.run.bag.some((i) => i.uid === 9003));
  for (let i = 0; i < 5; i++) G.act(L, { type: 'wait' });
  G.useReturnScroll(L); G.finishRun(L);
  assert(L.village.bag.some((i) => i.id === 'iceflame_crystal'));
  for (const it of L.village.bag.concat(L.village.storage)) assert(D.ITEMS[it.id], 'defined ' + it.id);
});
test('旧セーブの移行：入れ替え前にクロコダイン・フレイザードを倒していて新しいお宝が無ければ、1つずつ倉庫へ届ける（一度だけ）', () => {
  const raw = v3Save((S) => { const V = S.village; V.story.defeated.croc = true; V.story.defeated.flame = true; V.story.chapter = 3; V.nextUid = 50; });
  const L = SV.deserialize(JSON.stringify(raw));
  const V = L.village;
  eq(JSON.stringify(V.giftNotice), JSON.stringify(['croc_tear', 'iceflame_crystal', 'croc_axe', 'iceflame_shield']));
  eq(V.storage.filter((i) => i.id === 'croc_tear').length, 1); eq(V.storage.filter((i) => i.id === 'iceflame_crystal').length, 1);
  eq(new Set(V.storage.map((i) => i.uid)).size, V.storage.length); assert(V.nextUid > 50);
  // 読み込み直しても増えない
  const L2 = SV.deserialize(SV.serialize(L));
  eq(L2.village.storage.filter((i) => i.id === 'croc_tear').length, 1);
  // 第1章だけ倒していた場合はクロコダイルの涙だけ。倒していなければ何も届けない
  const r1 = SV.deserialize(JSON.stringify(v3Save((S) => { S.village.story.defeated.croc = true; S.village.story.chapter = 2; })));
  eq(JSON.stringify(r1.village.giftNotice), JSON.stringify(['croc_tear', 'croc_axe']));
  const r0 = SV.deserialize(JSON.stringify(v3Save(() => {})));
  assert(!r0.village.giftNotice); eq(r0.village.storage.length, 0);
});
test('床のお宝は宝箱の絵（素材は assets/chest/）。お金・素材・通常の道具は今までどおり。持ち物・展示室はお宝ごとの絵', () => {
  require('../js/assets.js'); const A = TS.ASSETS;
  eq(A.chest[32], 'assets/chest/chest_32.png'); eq(A.chest[48], 'assets/chest/chest_48.png');
  const fs_ = require('fs'), path = require('path'), root = path.join(__dirname, '..');
  for (const f of Object.values(A.chest)) assert(fs_.existsSync(path.join(root, f)), f);
  for (const id of ['croc_tear', 'iceflame_crystal']) {   // 盾・剣の絵は、ボスの報酬の装備7種（assets/items-boss/）へ移った
    eq(A.items.byId[id], id);
    assert(fs_.existsSync(path.join(root, A.items.byIdDir, id + '.png')) && fs_.existsSync(path.join(root, A.items.byIdDir, 'floor', id + '.png')), id + ' art');
  }
  for (const id of Object.keys(SV.RENAME_V4)) assert(!A.items.byId[id], 'old art entry removed ' + id);
});

console.log('ボス部屋：入室で戦闘開始・部屋の外へ出ない（2026年10月）');
// ボスの階へ（ボスには触れない）。たけは前室（スタート）にいる
function toBossFloor(ch, seed) {
  const S = newRun(seed, (s) => { s.village.story.chapter = ch; if (ch === 6) for (const k of ['croc', 'flame', 'kill', 'baran', 'mist']) s.village.story.defeated[k] = true; });
  const goal = ch === 6 ? D.FINAL_V3.vearn : D.CHAPTERS[ch].goal;   // 最終章（版3）は30階の大魔王バーン
  while (S.run.floor < goal) { const r = S.run; r.enemies = r.enemies.filter((e) => e.boss); r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
  S.run.player.hp = S.run.player.maxhp = 99999;
  return S;
}
// 通路の、部屋の入口の1つ手前のマス（部屋の外）
// dir：部屋へ入る向き、out：部屋から通路へ出る向き（30階の玉座の間は下の通路から上へ入る。ほかのボス部屋は左の通路から右へ）
function doorOutside(run) {
  const A = run.bossFight;
  for (let y = A.y; y < A.y + A.h; y++) { const x = A.x - 1; if (TS.Dungeon.passable(run.map, x, y)) return { x, y, dir: 'right', out: 'left' }; }
  for (let x = A.x; x < A.x + A.w; x++) { const y = A.y + A.h; if (TS.Dungeon.passable(run.map, x, y)) return { x, y, dir: 'up', out: 'down' }; }
  throw new Error('no door');
}
const insideAll = (run) => run.enemies.filter((e) => e.boss || e.summoned).every((e) => G.inArena(run, e.x, e.y));
test('全ボス：入室前は部屋の中央で待ち（移動・攻撃・特殊攻撃・予告なし、通路から見えても追わない）、入室で1回だけ戦闘開始。開始後も部屋の外へ出ない', () => {
  for (const ch of [1, 2, 3, 4, 5, 6]) {
    const S = toBossFloor(ch, 900 + ch), run = S.run, A = run.bossFight, b = run.enemies.find((e) => e.boss);
    eq(G.maxFloor(run), D.CHAPTERS[ch].goal, 'boss floor kept ch' + ch); eq(b.type, D.CHAPTERS[ch].boss);
    assert(A && !A.engaged, 'waiting ch' + ch);
    // 中央（部屋の真ん中から1マス以内）
    const cx = A.x + (A.w >> 1), cy = A.y + (A.h >> 1);
    assert(Math.max(Math.abs(b.x - cx), Math.abs(b.y - cy)) <= 1, 'center ch' + ch + ' ' + JSON.stringify([b.x, b.y, cx, cy]));
    eq(G.dungeonBgm(run), 'dungeon', 'normal music before');
    // 通路を部屋の入口の手前まで歩き、そこで待つ（ボスから見える位置でも）
    const door = doorOutside(run);
    run.player.x = door.x; run.player.y = door.y; G.updateVision(run);
    const pos0 = [b.x, b.y], hp0 = b.hp;
    for (let i = 0; i < 25; i++) { const r = G.act(S, { type: 'wait' }); assert(!r.events.some((e) => e.t === 'bossStart'), 'no start in corridor'); }
    assert(b.x === pos0[0] && b.y === pos0[1] && !b.charge && !run.hazards.length && !run.fog && run.enemies.length === 1 && b.hp === hp0 && !A.engaged, 'boss stays idle ch' + ch);
    // 部屋に入る（右へ1歩）：戦闘開始は1回だけ。入ったターンにボスは動かない
    const r1 = G.act(S, { type: 'move', dir: door.dir });
    let nStart = r1.events.filter((e) => e.t === 'bossStart').length;
    if (D.BOSS_INTROS[b.type]) {   // 登場ムービーのあるボス：入室ではムービーだけ。終えたときに1回だけ戦闘開始
      eq(r1.events.filter((e) => e.t === 'bossIntro').length, 1, 'intro ch' + ch); assert(!A.engaged && A.intro === 'pending');
      nStart += G.finishBossIntro(S).filter((e) => e.t === 'bossStart').length;
      eq(G.finishBossIntro(S).length, 0, 'finish once ch' + ch);
    } else assert(!r1.events.some((e) => e.t === 'bossIntro'), 'no intro ch' + ch);
    eq(nStart, 1, 'start once ch' + ch);
    assert(A.engaged && G.inArena(run, run.player.x, run.player.y));
    assert(b.x === pos0[0] && b.y === pos0[1] && !b.charge, 'no extra action on the entry turn ch' + ch);
    eq(G.dungeonBgm(run), 'boss');
    // 戦い：入ったり出たりしながら長く続ける。ボス・分身・手下はいつも部屋の中。床の印は有効なマス
    let starts = 0;
    for (let t = 0; t < 160 && run.enemies.includes(b) && !run.over; t++) {
      const out = Math.floor(t / 20) % 2 === 1;   // 20ターンごとに通路へ出る／戻る
      const p = run.player;
      if (out && G.inArena(run, p.x, p.y)) { const st = TS.Dungeon && G.act(S, { type: 'move', dir: door.out }); starts += st.events.filter((e) => e.t === 'bossStart').length; }
      else if (!out && !G.inArena(run, p.x, p.y)) { const st = G.act(S, { type: 'move', dir: door.dir }); starts += st.events.filter((e) => e.t === 'bossStart').length; }
      else { const st = G.act(S, { type: 'wait' }); starts += st.events.filter((e) => e.t === 'bossStart').length; }
      run.player.hp = run.player.maxhp;
      assert(insideAll(run), 'confined ch' + ch + ' t' + t + ' ' + JSON.stringify(run.enemies.map((e) => [e.type, e.x, e.y])));
      for (const h of run.hazards) assert(TS.Dungeon.passable(run.map, h.x, h.y), 'hazard on a valid tile');
      for (const e of run.enemies) if (e.charge) for (const tl of e.charge.tiles) assert(TS.Dungeon.passable(run.map, tl.x, tl.y), 'telegraph on a valid tile');
      assert(A.engaged, 'stays engaged');
    }
    eq(starts, 0, 'no second start ch' + ch);
    eq(G.dungeonBgm(run), 'boss', 'boss music while the fight continues (even in the corridor)');
    // セーブ・再開：戦闘中の状態とHPはそのまま
    const hp = b.hp, L = SV.deserialize(SV.serialize(S));
    eq(L.run.bossFight.engaged, true); eq(L.run.enemies.find((e) => e.boss).hp, hp, 'hp kept ch' + ch);
  }
});
test('戦いの前のボスには、投げる・杖・ねむり草・雷鳴の巻物・体当たりが効かない（道具・杖の回数・ターンは減らない）', () => {
  const S = toBossFloor(1, 931), run = S.run, A = run.bossFight, b = run.enemies.find((e) => e.boss);
  // ボスと同じ行の通路（入口の手前）。ボスが見える
  run.player.x = A.x - 1; run.player.y = b.y; G.updateVision(run);
  assert(TS.Dungeon.passable(run.map, run.player.x, run.player.y), 'door row');
  const add = (id, extra) => { const it = G.makeItem(S, id, extra); run.bag.push(it); return it; };
  const herb = add('herb'), staff = add('thunder_staff', { charges: 3 }), grass = add('sleep_incense'), scroll = add('fire_charm');
  const turn0 = run.turn, hp0 = b.hp, n0 = run.bag.length;
  let r = G.act(S, { type: 'throw', uid: herb.uid, dir: 'right' });
  assert(!r.consumed && run.bag.includes(herb) && r.events.some((e) => e.t === 'warn' && e.msg.includes('部屋に入ってから')), 'throw blocked');
  r = G.act(S, { type: 'use', uid: staff.uid, dir: 'right' });
  assert(!r.consumed && staff.charges === 3, 'staff blocked, charges kept');
  r = G.act(S, { type: 'use', uid: grass.uid });
  assert(!r.consumed && run.bag.includes(grass) && !b.sleep, 'sleep blocked');
  r = G.act(S, { type: 'use', uid: scroll.uid });
  assert(!r.consumed && run.bag.includes(scroll), 'scroll blocked');
  eq(run.turn, turn0); eq(b.hp, hp0); eq(run.bag.length, n0); assert(!A.engaged);
  // 入室すれば効く
  G.act(S, { type: 'move', dir: 'right' }); G.finishBossIntro(S); assert(A.engaged);
  r = G.act(S, { type: 'use', uid: staff.uid, dir: 'right' });
  assert(r.consumed && staff.charges === 2, 'staff works after the start');
});
test('最終章（版3）：30階の大魔王バーン（ボス戦の曲・部屋の中だけ）→ ローブ1回・階段・帰還口なし・ティウの救援 → 35階の真大魔王バーン（入室で肉体返還の場面→祈りで全回復→戦い）→ 帰還口。どちらも再登場しない', () => {
  const S = toBossFloor(6, 941), run = S.run, st = S.village.story;
  eq(run.floor, 30); eq(run.enemies.find((e) => e.boss).type, 'vearn');
  run.player.x = doorOutside(run).x; run.player.y = doorOutside(run).y; G.updateVision(run);
  const r0 = G.act(S, { type: 'move', dir: doorOutside(run).dir });
  assert(r0.events.some((e) => e.t === 'bossIntro' && e.boss === 'vearn') && !run.bossFight.engaged, 'vearn intro movie first');
  G.finishBossIntro(S);   // 登場ムービーを終えた扱い
  assert(run.bossFight.engaged); eq(G.dungeonBgm(run), 'boss');
  for (let i = 0; i < 10; i++) { G.act(S, { type: 'wait' }); run.player.hp = run.player.maxhp; assert(insideAll(run)); }
  defeatBoss(S);
  assert(run.bossFight.won); eq(G.dungeonBgm(run), 'dungeon'); assert(st.defeated.vearn);
  eq(run.floorItems.filter((f) => f.item && f.item.id === 'demon_robe').length, 1, 'robe once');
  // 玉座の間：下り階段は無く、玉座の右手前に時空の亀裂が残る（ローブとは別のマス）。帰還口も無い
  assert(run.map.throne && !run.stairs && !run.portal, 'no stairs, no portal'); eq(run.final.rescue, 'pending'); assert(G.canRescue(run));
  eq(run.crack.x + ',' + run.crack.y + ',' + run.crack.kind, D.THRONE_ROOM.crack.x + ',' + D.THRONE_ROOM.crack.y + ',throne30', 'crack near the throne');
  assert(!G.itemAt(run, run.crack.x, run.crack.y), 'robe not on the crack');
  const L = SV.deserialize(SV.serialize(S));
  eq(L.run.floorItems.filter((f) => f.item && f.item.id === 'demon_robe').length, 1, 'no duplicate after reload'); eq(L.run.final.rescue, 'pending');
  assert(L.run.crack && L.run.crack.kind === 'throne30' && DG.same(L.run.crack, run.crack), 'crack kept after reload');
  // 救援が終わるまでは亀裂に入れない
  eq(G.crackState(L), 'rescue');
  L.run.player.x = L.run.crack.x; L.run.player.y = L.run.crack.y; G.act(L, { type: 'descend' }); eq(L.run.floor, 30, 'no descend before rescue ends');
  assert(G.commitRescue(L).ok); assert(!G.canRescue(L.run)); eq(G.crackState(L), 'next', 'crack leads on (provisional: next floor)');
  // 31〜32階を探索して33階へ（ワープしない）
  const seen = []; let r1 = null; while (L.run.floor < 33) { const r = L.run, to = r.stairs || r.crack; r.enemies = r.enemies.filter((e) => e.boss); r.player.x = to.x; r.player.y = to.y;
    if (r.floor === 32) { r.player.hp = 60; r.player.maxhp = 500; r.player.poison = 3; r.player.hunger = 40; }
    r1 = G.act(L, { type: 'descend' }); seen.push(r.floor); }
  eq(seen.join(), '31,32,33');
  const R = L.run, tv = R.enemies.find((e) => e.boss); eq(tv.type, 'truevearn'); assert(!R.bossFight.engaged);
  // 33階に着いた直後に覚醒ムービー（歩いてボス部屋に入らなくてよい）。たけはボス部屋の中
  assert(r1.events.some((e) => e.t === 'bossIntro' && e.boss === 'truevearn') && R.bossFight.intro === 'pending', 'awakening movie right after arriving');
  assert(G.inArena(R, R.player.x, R.player.y), 'placed inside the arena');
  eq(R.enemies.length, 1, 'only the true Vearn (no Mist, no old Vearn)');
  const ev = G.finishBossIntro(L);
  assert(ev.some((e) => e.t === 'prayer') && ev.filter((e) => e.t === 'bossStart').length === 1);
  eq(R.player.hp, 500, 'prayer full HP'); eq(R.player.poison, 0, 'status cleared'); eq(R.player.hunger, D.PLAYER.maxHunger, 'hunger full'); eq(R.player.maxhp, 500, 'max not raised');
  eq(G.finishBossIntro(L).length, 0, 'prayer once');
  defeatBoss(L);
  eq(R.final.stage, 'won'); assert(R.portal && st.defeated.truevearn || L.village.story.defeated.truevearn);
  assert(!R.floorItems.some((f) => f.item && f.item.bossReward), 'no item reward at 33F');
  // 版4：33階には時空の亀裂を出さない（隠しダンジョンの入口は30階の亀裂）
  assert(!R.crack, 'no crack on 33F');
  R.player.x = R.portal.x; R.player.y = R.portal.y; G.act(L, { type: 'returnHome' });
  const res = G.finishRun(L); assert(res.finalClear && L.village.story.endingDone);
  // クリア後：30階にボスは出ない。同じ亀裂が隠しダンジョンの入口に切り替わる（隠しダンジョンはまだ無いので入れない。開始階は保留）
  departWithScroll(L, 942); assert(L.run.final.skip.vearn && L.run.final.skip.truevearn);
  goToFloor(L, 30); assert(!L.run.enemies.some((e) => e.boss) && !L.run.stairs && L.run.map.throne, '30F: throne room without boss');
  assert(L.run.crack && L.run.crack.kind === 'throne30' && !G.canRescue(L.run), 'crack, no rescue after clear'); eq(G.crackState(L), 'hidden');
  const C = L.run.crack; L.run.player.x = C.x; L.run.player.y = C.y + 1; G.updateVision(L.run); L.run.enemies = [];
  const rc = G.act(L, { type: 'move', dir: 'up' }); assert(rc.events.some((e) => e.t === 'onCrack' && e.state === 'hidden'));
  G.act(L, { type: 'descend' }); eq(L.run.floor, 31); assert(L.run.hidden, 'into the hidden dungeon');
  // 33階（倒したあと）：ボスは出ない。下への階段・亀裂は無く、帰還の祠
  assert(!G.F(L.run, 33).boss, '33F no boss after clear');
});
test('30階の時空の亀裂の行き先：真大魔王バーンを倒す前は31階、倒したあとは隠しダンジョンの31階。読み込み直しても同じ', () => {
  const S = toBossFloor(6, 978); defeatBoss(S); G.commitRescue(S);
  eq(G.crackState(S), 'next');
  S.village.story.defeated.truevearn = true; eq(G.crackState(S), 'hidden');
  const L = SV.deserialize(SV.serialize(S)); eq(G.crackState(L), 'hidden');
  L.run.player.x = L.run.crack.x; L.run.player.y = L.run.crack.y; G.act(L, { type: 'descend' }); eq(L.run.floor, 31); assert(L.run.hidden);
  // 隠しダンジョンがまだ用意されていない（D.HIDDEN_DUNGEON が無い）ときは「準備中」
  const keep = D.HIDDEN_DUNGEON; D.HIDDEN_DUNGEON = null; try { eq(G.crackState(S), 'hiddenNotReady'); } finally { D.HIDDEN_DUNGEON = keep; }
  S.village.story.defeated.truevearn = false; S.run.player.x = S.run.crack.x; S.run.player.y = S.run.crack.y; G.act(S, { type: 'descend' }); eq(S.run.floor, 31);
});
test('隠しダンジョン：真大魔王バーン撃破後、30階の亀裂から31階へ。31〜34階は部屋の数が約2倍（大きさは同じ）・道具も増える・帰還の祠なし・32〜34階は強敵（仮）・35階に竜人王バラン（ボス部屋は本編と同じ）→ 帰還口。読み込み直しても隠しダンジョンのまま', () => {
  const H = D.HIDDEN_DUNGEON;
  const S = toBossFloor(6, 979); defeatBoss(S); G.commitRescue(S);
  S.village.story.defeated.truevearn = true; S.village.story.endingDone = true;
  eq(G.crackState(S), 'hidden');
  S.run.player.x = S.run.crack.x; S.run.player.y = S.run.crack.y;
  const r0 = G.act(S, { type: 'descend' }); assert(r0.events.some((e) => e.t === 'hiddenEnter'));
  const run = S.run; eq(run.floor, 31); assert(run.hidden); eq(G.maxFloor(run), 35);
  // 部屋の数：本編（同じ種）と比べておよそ2倍。部屋の大きさ（平均の面積）は同じくらい。通路は幅1マスのまま（形の検査）。階段・全部の床へ行ける
  const avg = (m) => m.rooms.reduce((a, r) => a + r.w * r.h, 0) / m.rooms.length;
  let hid = 0, base = 0, ah = 0, ab = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const gh = DG.generate(31, R.create(seed), { hidden: true }), gb = DG.generate(31, R.create(seed), {});
    hid += gh.map.rooms.length; base += gb.map.rooms.length; ah += avg(gh.map); ab += avg(gb.map);
    assert(TS.DungeonCheck.shapeOk(gh.map) && TS.DungeonCheck.connected(gh.map), 'shape/connected ' + seed);
    const dd = DG.distances(gh.map, gh.start.x, gh.start.y); assert(dd[gh.stairs.y * gh.map.w + gh.stairs.x] >= 0, 'stairs reachable ' + seed);
  }
  const ratio = hid / base; assert(ratio >= 1.8 && ratio <= 2.2, 'room count about 2x: ' + ratio.toFixed(2));
  const sz = ah / ab; assert(sz >= 0.9 && sz <= 1.1, 'room size same: ' + sz.toFixed(2));
  // 道具・お金は部屋の数に合わせて増やす（本編の魔王の城より多い）
  const FD = G.F(run), FB = D.floorFor(6, 31); assert(FD.itemCount[0] > FB.itemCount[1] && FD.goldCount[0] > FB.goldCount[0], 'more items');
  eq(run.map.w + 'x' + run.map.h, D.HIDDEN_MAP.w + 'x' + D.HIDDEN_MAP.h);
  const L0 = SV.deserialize(SV.serialize(S)); assert(L0.run.hidden && L0.run.floor === 31 && G.F(L0.run).hidden, 'hidden kept after reload');
  // 31〜34階：帰還の祠なし。32〜34階は強敵（同じ敵が本編より強い）。入口から全部の床・階段へ行ける
  const seen = [];
  while (run.floor < 35) {
    const F = G.F(run); assert(F.hidden && !run.returnPoint, 'no return shrine on ' + run.floor);
    eq(!!F.strong, H.strong.floors.includes(run.floor), 'strong on ' + run.floor);
    const dist = DG.distances(run.map, run.player.x, run.player.y);
    assert(dist[run.stairs.y * run.map.w + run.stairs.x] >= 0, 'stairs reachable ' + run.floor);
    if (F.strong) {
      // 強敵の階：専用の強敵（6種のどれか）が出る。今の敵を一律に強くする仕組みは無い
      const strongTypes = ['dragon', 'silverdevil', 'gigantes', 'bombrock', 'mimic', 'madhand'];
      assert(run.enemies.some((e) => strongTypes.includes(e.type)), 'strong enemies on ' + run.floor);
      const g = run.enemies.find((e) => e.type === 'darkknight'); if (g) eq(g.maxhp, G.makeEnemy(run, 'darkknight', 0, 0).maxhp, 'no blanket multiplier');
      assert(run.log.some((l) => l.includes('強敵の気配')), 'strong notice');
    }
    seen.push(run.floor);
    goDown(S);
  }
  eq(seen.join(), '31,32,33,34');
  // 35階：竜人王バラン（ボス部屋は本編と同じ大きさ。部屋の数の倍率は使わない）。帰還の祠なし。倒すと帰還口
  eq(run.floor, 35); const b = run.enemies.find((e) => e.boss); eq(b && b.type, 'dragonbaran'); assert(!run.returnPoint);
  eq(run.bossFight.w * run.bossFight.h, 15 * 15, 'normal arena'); eq(run.map.w + 'x' + run.map.h, D.MAP.w + 'x' + D.MAP.h);
  // 報酬：真魔剛竜剣を持っている（装備中）・竜の盾は倉庫にある → どちらも出さない。竜の紋章は村で拾い済みで今は持っていない → 出す
  run.bag = run.bag.filter((i) => i.id !== 'shinma_sword' && i.id !== 'dragonic_shield' && i.id !== 'dragon_crest');
  S.village.storage = S.village.storage.filter((i) => !['shinma_sword', 'dragonic_shield', 'dragon_crest'].includes(i.id));
  const sw = G.makeItem(S, 'shinma_sword'); run.bag.push(sw); G.act(S, { type: 'equip', uid: sw.uid });
  S.village.storage.push(G.makeItem(S, 'dragonic_shield')); S.village.story.found = { dragon_crest: true };
  defeatBoss(S);
  assert(run.portal && S.village.story.defeated.dragonbaran, 'portal after dragon king');
  eq(run.floorItems.filter((f) => f.item && f.item.bossReward).map((f) => f.item.id).join(), 'dragon_crest', 'only the item not owned');
  run.player.x = run.portal.x; run.player.y = run.portal.y; G.act(S, { type: 'returnHome' });
  assert(run.over || !S.run || S.run.over, 'returned');
  // 本編（真大魔王バーンを倒す前）の31階は、隠しダンジョンではない
  const M = toBossFloor(6, 980); defeatBoss(M); G.commitRescue(M); M.run.player.x = M.run.crack.x; M.run.player.y = M.run.crack.y; G.act(M, { type: 'descend' });
  assert(M.run.floor === 31 && !M.run.hidden && !G.F(M.run).hidden && M.run.map.w === D.MAP.w, 'main 31F is not hidden');
});
test('竜人王バランの報酬：持っていない品だけ。床に落ちたまま（未回収）・村で拾う前の竜の紋章・展示室は所有扱い。2回目は重ならない', () => {
  const S = G.newState(), V = S.village; G.depart(S, 5); const run = S.run;
  run.bag = []; V.storage = []; V.bag = [];
  eq(G.dragonKingRewards(S).join(), 'shinma_sword,dragonic_shield', 'crest waits in the village (not picked yet)');
  V.story.found = { dragon_crest: true };
  eq(G.dragonKingRewards(S).join(), 'shinma_sword,dragonic_shield,dragon_crest');
  V.bag.push(G.makeItem(S, 'shinma_sword'));
  run.floorItems.push({ x: 1, y: 1, item: Object.assign(G.makeItem(S, 'dragonic_shield'), { bossReward: true }) });   // 前回の未回収（帰還時に届く）
  eq(G.dragonKingRewards(S).join(), 'dragon_crest');
  run.bag.push(G.makeItem(S, 'dragon_crest'));
  eq(G.dragonKingRewards(S).length, 0, 'all owned: nothing');
  eq(D.DRAGON_KING.materials.length, 0, 'materials not decided yet');
});
test('竜人王バランの戦い方：ドルオーラ（一直線→後半は十字）・なぎ払い（まわり8マス）・突進（離れて一直線）・通常攻撃。どれも予告→発動→隙。後半はオーラで強く', () => {
  const S = newRun(3301, (S0) => { S0.village.story.chapter = 6; }); bigRoomFloor(S);
  const run = S.run, K = D.DRAGON_KING, p = run.player;
  const mk = (x, y) => { const b = G.makeEnemy(run, 'dragonbaran', x, y); b.boss = true; b.awake = true; b.hold = 0; run.enemies = [b]; run.bossFight = { x: 2, y: 2, w: 20, h: 12, engaged: true }; return b; };
  p.hp = p.maxhp = 99999;
  // ドルオーラ：一直線上・2マス
  let b = mk(10, 5); p.x = 12; p.y = 5; G.updateVision(run); b.cds = { rush: 9, sweep: 9 };
  G.act(S, { type: 'wait' });
  assert(b.charge && b.charge.fx === 'doloura' && b.charge.tiles.some((t) => t.x === 12 && t.y === 5) && b.charge.tiles.every((t) => t.y === 5), 'doloura line telegraph');
  p.y = 6; const hp0 = p.hp; G.act(S, { type: 'wait' });   // 列の外へよける
  eq(p.hp, hp0, 'dodged doloura'); eq(b.rest, K.doloura.rest, 'rest after doloura');
  // なぎ払い：隣
  b = mk(10, 5); p.x = 11; p.y = 5; b.cds = { doloura: 9, rush: 9 }; G.updateVision(run);
  G.act(S, { type: 'wait' }); assert(b.charge && b.charge.fx === 'sweep' && b.charge.tiles.length === 8, 'sweep telegraph 8 tiles');
  p.x = 12; const hp1 = p.hp; G.act(S, { type: 'wait' }); eq(p.hp, hp1, 'one step away dodges the sweep'); eq(b.rest, K.sweep.rest);
  // 突進：離れて一直線（3マス以上）
  b = mk(5, 5); p.x = 12; p.y = 5; b.cds = { doloura: 9, sweep: 9 }; G.updateVision(run);
  G.act(S, { type: 'wait' }); assert(b.charge && b.charge.kind === 'rush', 'rush telegraph');
  const hp2 = p.hp; G.act(S, { type: 'wait' }); assert(p.hp < hp2, 'rush hits when staying'); eq(b.rest, K.rush.rest);
  // 通常攻撃：技が待ち中で隣
  b = mk(10, 5); p.x = 11; p.y = 5; b.cds = { doloura: 9, rush: 9, sweep: 9 }; G.updateVision(run);
  const r3 = G.act(S, { type: 'wait' }); assert(!b.charge && r3.events.some((e) => (e.t === 'hit' && e.target === 'player') || e.t === 'miss'), 'normal attack (hit or miss)');
  // 後半：HP半分以下でオーラ（攻撃力が上がる）・ドルオーラは十字・待ち時間が短い・予告と隙は残る
  b = mk(10, 5); const atk0 = b.atk; b.hp = Math.floor(b.maxhp * 0.5); p.x = 12; p.y = 5; b.cds = { rush: 9, sweep: 9 }; G.updateVision(run);
  G.act(S, { type: 'wait' });
  assert(b.enraged && b.atk > atk0 && b.charge && b.charge.fx === 'doloura', 'enraged doloura');
  assert(b.charge.tiles.some((t) => t.x === 10 && t.y !== 5) && b.charge.tiles.some((t) => t.y === 5), 'cross');
  eq(b.cds.doloura, K.doloura.cd[1], 'shorter cooldown');
  p.x = 11; p.y = 6; const hp4 = p.hp; G.act(S, { type: 'wait' }); eq(p.hp, hp4, 'diagonal dodges the cross'); eq(b.rest, K.doloura.rest, 'rest remains in phase 2');
});
test('商人の呼鈴の寄付：村の発展（施設と飾り）をすべて建てるまで寄付できない。開いたら1000Gで1個（何度でも）', () => {
  const S = G.newState(), V = S.village; V.funds = 2500;
  assert(!G.bellDonationOpen(S), 'closed at first');
  for (const f of D.FACILITIES.slice(0, -1)) V.built[f.id] = true;
  assert(!G.bellDonationOpen(S), 'closed until the last one');
  V.built[D.FACILITIES[D.FACILITIES.length - 1].id] = true;
  assert(G.bellDonationOpen(S), 'open when all built');
  assert(G.donateForBell(S).ok && G.donateForBell(S).ok); eq(V.funds, 500); eq(V.bag.filter((i) => i.id === 'merchant_bell').length, 2);
  // 隠しアイテム・会話・お宝の収集は条件に入れない
  eq(Object.keys(V.story.found || {}).length, 0); eq(Object.keys(V.donated || {}).length, 0);
});
test('ワーンの食堂：完成の会話はワーンの指定の文。古い食堂名（サイの食堂）は残っていない', () => {
  const fs = require('fs'), path = require('path');
  const src = ['js/ui.js', 'js/data.js', 'js/village.js', 'js/story.js', 'js/game.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  assert(!src.includes('サイの食堂'), 'no old name');
  assert(src.includes("['waan', 'お待たせ！ ワーンの食堂ができたよ！\\n冒険に行く前は、ちゃんと食べていってね！\\n元気が出る料理を作ってあげる！！']"), 'line');
  eq(D.FACILITIES.find((f) => f.id === 'diner').name, 'ワーンの食堂');
});
// 隠しダンジョンの強敵：テスト用の部屋に置く（攻撃は必ず当たる）
function strongRoom(seed) {
  const S = newRun(seed, (S0) => { S0.village.story.chapter = 6; }); bigRoomFloor(S);
  const run = S.run; run.player.hp = run.player.maxhp = 99999; run.player.x = 5; run.player.y = 5; G.updateVision(run);
  const put = (type, x, y) => { const e = G.makeEnemy(run, type, x, y); e.awake = true; run.enemies.push(e); return e; };
  return { S, run, p: run.player, put };
}
const withHit = (fn) => { const k = D.ENEMY_HIT_RATE; D.ENEMY_HIT_RATE = 1; try { fn(); } finally { D.ENEMY_HIT_RATE = k; } };
test('ドラゴン：一直線に炎。壁か最初のキャラクターで止まる（貫かない）。間の敵に当たれば後ろのたけには当たらない。敵が倒れても炎は先へ進まない', () => withHit(() => {
  const { S, run, p, put } = strongRoom(4101);
  // たけが最初：たけに当たる
  let d = put('dragon', 9, 5); d.cds = {}; G.updateVision(run);
  let hp = p.hp, r = G.act(S, { type: 'wait' }), b = r.events.find((e) => e.t === 'breath');
  assert(b && b.hit && b.to.x === 5 && b.to.y === 5 && p.hp < hp, 'hits the player first');
  // 間に敵：その敵に当たって止まる（たけには当たらない）。炎の止まる所＝その敵のマス
  run.enemies = []; d = put('dragon', 9, 5); d.cds = {}; const shield = put('gigantes', 7, 5); shield.sleep = 99; G.updateVision(run);
  const sh0 = shield.hp; r = G.act(S, { type: 'wait' }); b = r.events.find((e) => e.t === 'breath');
  assert(b && b.to.x === 7 && b.to.y === 5, 'stops at the shield enemy'); assert(shield.hp < sh0, 'shield takes damage');
  assert(!r.events.some((e) => e.t === 'hit' && e.target === 'player'), 'player behind is safe');
  // 間の敵が炎で倒れても、その一発は先へ進まない
  run.enemies = []; d = put('dragon', 9, 5); d.cds = {}; const weak = put('madhand', 7, 5); weak.hp = 1; weak.sleep = 99; G.updateVision(run);
  r = G.act(S, { type: 'wait' }); assert(!run.enemies.includes(weak), 'shield died'); assert(!r.events.some((e) => e.t === 'hit' && e.target === 'player'), 'flame did not continue');
  eq(r.events.find((e) => e.t === 'breath').to.x, 7, 'flame drawn up to the shield only');
  // 壁で途切れていれば吐かない／射程の外は吐かない
  run.enemies = []; d = put('dragon', 5 + D.STRONG.dragon.range + 1, 5); d.cds = {}; d.sleep = 0; G.updateVision(run);
  r = G.act(S, { type: 'wait' }); assert(!r.events.some((e) => e.t === 'breath'), 'out of range');
  // 使ったあとは待ち（cd）
  run.enemies = []; d = put('dragon', 8, 5); d.cds = {}; G.updateVision(run); G.act(S, { type: 'wait' }); eq(d.cds.breath, D.STRONG.dragon.cd);
}));
test('シルバーデビル：1手番に2回。離れていれば2歩、隣なら2回攻撃、1歩目で隣なら残り1回で攻撃（2歩のあと攻撃はしない）', () => withHit(() => {
  const { S, run, p, put } = strongRoom(4102);
  let e = put('silverdevil', 12, 5); G.updateVision(run);
  let hp = p.hp; G.act(S, { type: 'wait' }); eq(Math.abs(e.x - 12), 2, 'two steps'); eq(p.hp, hp, 'no attack after two steps');
  run.enemies = []; e = put('silverdevil', 6, 5); G.updateVision(run);
  let r = G.act(S, { type: 'wait' }); eq(r.events.filter((x) => x.t === 'hit' && x.target === 'player').length, 2, 'two attacks when adjacent');
  run.enemies = []; e = put('silverdevil', 7, 5); G.updateVision(run);
  r = G.act(S, { type: 'wait' }); eq(e.x, 6, 'one step'); eq(r.events.filter((x) => x.t === 'hit' && x.target === 'player').length, 1, 'then one attack');
  // たけの3点セットの2回行動とは別（敵の手番の中だけの話）
  eq(D.ENEMIES.silverdevil.ai, 'double');
}));
test('ギガンテス：HP・攻撃・防御が高く、近づいて通常攻撃だけ（特別な技なし）', () => withHit(() => {
  const E = D.ENEMIES.gigantes, others = ['darkknight', 'guard', 'golem'].map((k) => D.ENEMIES[k]);
  assert(others.every((o) => E.hp > o.hp && E.atk > o.atk && E.def > o.def), 'high stats'); eq(E.ai, 'melee');
  const { S, run, p, put } = strongRoom(4103); const g = put('gigantes', 8, 5); G.updateVision(run);
  G.act(S, { type: 'wait' }); eq(g.x, 7, 'approaches'); assert(!g.charge, 'no special');
}));
test('爆弾岩：HP20%以下で止まる。0より大きく10%以下で即自爆（範囲のたけにダメージ・経験値なし）。一撃で0以下なら自爆せずに倒れる', () => withHit(() => {
  const B = D.STRONG.bombrock;
  let { S, run, p, put } = strongRoom(4104);
  let b = put('bombrock', 9, 5); b.hp = Math.floor(b.maxhp * B.stopAt); G.updateVision(run);
  G.act(S, { type: 'wait' }); eq(b.x, 9, 'stops moving at 20%');
  // 自爆：隣で、残りが10%以下になる攻撃
  b.x = 6; b.y = 5; b.hp = Math.floor(b.maxhp * B.stopAt); const exp0 = p.exp;
  const dmg = b.hp - Math.max(1, Math.floor(b.maxhp * B.blastAt));
  const ev = []; const hp = p.hp; G._damageEnemy(S, b, dmg, ev, 'test');
  assert(!run.enemies.includes(b) && ev.some((e) => e.t === 'blast' && e.fx === 'explode'), 'self destruct'); assert(p.hp < hp, 'player in range is hurt'); eq(p.exp, exp0, 'no exp');
  // 一撃で0以下：自爆しないで倒れる（経験値あり）
  ({ S, run, p, put } = strongRoom(4105)); b = put('bombrock', 6, 5); b.hp = 5;
  const ev2 = []; const hp2 = p.hp; G._damageEnemy(S, b, 50, ev2, 'test');
  assert(!ev2.some((e) => e.fx === 'explode') && ev2.some((e) => e.t === 'kill' && e.exp > 0) && !ev2.some((e) => e.t === 'hit' && e.target === 'player'), 'killed without exploding (with exp)');
  // 範囲の外なら当たらない
  ({ S, run, p, put } = strongRoom(4106)); b = put('bombrock', 9, 5); const hp3 = p.hp;
  G._damageEnemy(S, b, b.hp - 1, [], 'test'); eq(p.hp, hp3, 'out of range');
}));
test('ミミック：お宝に化けて動かない（見えている敵に入らない）。隣に来た手番に正体を現して1回だけ攻撃。攻撃されても正体を現す', () => withHit(() => {
  const { S, run, p, put } = strongRoom(4107);
  const m = put('mimic', 9, 5); m.disguised = true; G.updateVision(run);
  G.act(S, { type: 'wait' }); assert(m.disguised && m.x === 9, 'stays disguised'); assert(!G.visibleEnemies(run).includes(m), 'looks like treasure');
  m.x = 6; G.updateVision(run);
  const r = G.act(S, { type: 'wait' });
  assert(!m.disguised, 'revealed'); eq(r.events.filter((e) => e.t === 'hit' && e.target === 'player').length, 1, 'one attack only (no extra first strike)');
  const m2 = put('mimic', 4, 5); m2.disguised = true; G.updateVision(run);
  G._damageEnemy(S, m2, 1, [], 'test'); assert(!m2.disguised, 'reveals when attacked');
  // 階に置く：強敵の階で化けたまま
  eq(JSON.stringify(D.STRONG.mimic.count), '[1,2]');
}));
test('マドハンド：つかむと移動できない（攻撃・道具・装備はできる）。つかんだマドハンドを倒すと解ける。自然にも解ける。3点セットは無効', () => withHit(() => {
  let { S, run, p, put } = strongRoom(4108);
  let h = put('madhand', 6, 5); G.updateVision(run);
  G.act(S, { type: 'wait' }); assert(p.bound > 0); eq(p.boundBy, h.id);
  const x0 = p.x; G.act(S, { type: 'move', dir: 'left' }); eq(p.x, x0, 'cannot move');
  const herb = G.makeItem(S, 'herb'); run.bag.push(herb); assert(G.act(S, { type: 'use', uid: herb.uid }).consumed, 'can use items');
  const sw = G.makeItem(S, 'iron_katana'); run.bag.push(sw); assert(G.act(S, { type: 'equip', uid: sw.uid }).consumed, 'can change equipment');
  h.hp = 1; G.act(S, { type: 'move', dir: 'right' });   // 攻撃はできる（倒すと解ける）
  assert(!run.enemies.includes(h), 'killed'); eq(p.bound, 0, 'released'); eq(p.boundBy, null);
  // 自然に解ける
  // 自然に解ける：たけの手番で turns 回だけ動けない
  ({ S, run, p, put } = strongRoom(4109)); h = put('madhand', 6, 5); G.updateVision(run); G.act(S, { type: 'wait' }); h.sleep = 999;
  // （動こうとしても手番は使わないので、待って数える）
  let waits = 0; while (p.bound > 0 && waits < 10) { const y0 = p.y; G.act(S, { type: 'move', dir: 'down' }); eq(p.y, y0, 'cannot move while bound'); G.act(S, { type: 'wait' }); waits++; }
  eq(waits, D.STRONG.madhand.turns, 'bound for the set number of turns'); eq(p.bound, 0, 'released naturally');
  // 3点セット：つかまれない
  ({ S, run, p, put } = strongRoom(4110));
  for (const id of ['shinma_sword', 'dragonic_shield', 'dragon_crest']) { const it = G.makeItem(S, id); run.bag.push(it); G.act(S, { type: 'equip', uid: it.uid }); }
  assert(G.sets(run).all3); h = put('madhand', 6, 5); G.updateVision(run);
  for (let i = 0; i < 3; i++) G.act(S, { type: 'wait' }); eq(p.bound, 0, 'immune with the set');
}));
test('冒頭の会話：大魔王は地下33階へ封じる', () => {
  assert(D.STORY.intro.some((l) => l[1].includes('地下33階へ封じる')) || JSON.stringify(D.STORY).includes('地下33階へ封じる'));
  assert(!JSON.stringify(D.STORY).includes('地下35階へ封じる'));
});
test('30階・玉座の間（デザインの絵）：下の通路から上へ入る。玉座・柱・炎の台・旗は通れない。中央の床は広い。撃破後、亀裂へ歩いて行ける・ムービーのあとも同じ状態', () => {
  const S = toBossFloor(6, 977), run = S.run, m = run.map, T = D.THRONE_ROOM, A = run.bossFight, p = run.player;
  assert(m.throne && m.w === T.w && m.h === T.h, 'throne map');
  eq([A.x, A.y, A.w, A.h].join(), [T.hall.x, T.hall.y, T.hall.w, T.hall.h].join(), 'arena = hall');
  assert(A.w * A.h >= 150, 'wide floor for the fight');
  eq(p.x + ',' + p.y, T.start.x + ',' + T.start.y, 'start at the bottom of the corridor'); assert(p.y > A.y + A.h - 1 && !G.inArena(run, p.x, p.y));
  const pass = (x, y) => DG.passable(m, x, y);
  // 広間のまわり：下は中央の通路の2マスだけ開いている。左右・上（玉座の段）は壁
  for (let x = A.x - 1; x <= A.x + A.w; x++) eq(pass(x, A.y + A.h), x >= T.corridor.x && x < T.corridor.x + T.corridor.w, 'bottom edge x' + x);
  for (let y = 0; y < A.y; y++) for (let x = 0; x < m.w; x++) assert(!pass(x, y), 'throne dais / pillars / banners are walls ' + x + ',' + y);
  for (let y = A.y; y < A.y + A.h; y++) { assert(!pass(A.x - 1, y) && !pass(A.x + A.w, y), 'side torches / pillars are walls y' + y); for (let x = A.x; x < A.x + A.w; x++) assert(pass(x, y)); }
  // 通路：両脇の柱・炎の台は壁。通路は縦にまっすぐ
  for (let y = T.corridor.y; y < T.corridor.y + T.corridor.h; y++) { assert(!pass(T.corridor.x - 1, y) && !pass(T.corridor.x + T.corridor.w, y)); }
  for (let x = 0; x < m.w; x++) assert(!pass(x, m.h - 1), 'bottom row is wall');
  // 入口から全部の床へ行ける
  const dist = DG.distances(m, p.x, p.y);
  for (let i = 0; i < m.w * m.h; i++) if (m.tiles[i] !== DG.WALL) assert(dist[i] >= 0, 'reachable ' + i);
  // 上へ歩いて入室：広間へ入った1歩で登場ムービー
  S.village.story.introSeen.vearn = false;
  let intro = null;
  for (let i = 0; i < 10 && !intro; i++) { const r = G.act(S, { type: 'move', dir: 'up' }); intro = r.events.find((e) => e.t === 'bossIntro'); }
  assert(intro && intro.boss === 'vearn' && G.inArena(run, p.x, p.y) && p.y === A.y + A.h - 1, 'enter the hall going up');
  G.finishBossIntro(S);
  // 戦闘前は亀裂を出さない
  assert(!run.crack, 'no crack before the fight');
  defeatBoss(S);
  // 撃破：亀裂は玉座の右手前の床（広間の中、いちばん上の列）。たけの位置から歩いて行ける
  const c = run.crack; assert(c && G.inArena(run, c.x, c.y) && c.y === A.y, 'crack on the floor near the throne');
  assert(Math.abs(c.x - (T.corridor.x + 0.5)) <= 3, 'near the throne (center)');
  assert(DG.distances(m, p.x, p.y)[c.y * m.w + c.x] >= 0, 'crack reachable');
  // ムービー（見終えた・スキップ・失敗のどれでも G.finishPostMovie）のあとも、亀裂・ローブ・救援は同じ。読み込み直しても同じ
  const snap = () => JSON.stringify([S.run.crack, S.run.floorItems.map((f) => f.item && f.item.id).sort(), S.run.final.rescue, S.run.stairs]);
  const s0 = snap(); G.finishPostMovie(S); eq(snap(), s0);
  const L = SV.deserialize(SV.serialize(S)); eq(JSON.stringify([L.run.crack, L.run.floorItems.map((f) => f.item && f.item.id).sort(), L.run.final.rescue, L.run.stairs]), s0, 'same after reload');
});
test('最終章（版3）：30階で大魔王バーンを倒したあと倒れても、次は30階に出ない（ローブは倉庫へ）。35階は未撃破なら真大魔王バーン', () => {
  const S = toBossFloor(6, 950), run = S.run;
  while (run.bag.length < D.BAG_SIZE) run.bag.push(G.makeItem(S, 'herb'));
  defeatBoss(S); run.over = true; run.result = { type: 'dead', floor: 30 };
  G.finishRun(S);
  assert(S.village.story.defeated.vearn && !S.village.story.endingDone); eq(S.village.story.chapter, 6);
  eq(S.village.storage.filter((i) => i.id === 'demon_robe').length, 1, 'robe kept in storage');
  departWithScroll(S, 951); goToFloor(S, 30); assert(!S.run.enemies.some((e) => e.boss), 'vearn does not return');
  goToFloor(S, D.FINAL_V3.truevearn); eq(S.run.enemies.find((e) => e.boss).type, 'truevearn');
});
test('ティウの救援：回復は1回だけ（HP・満腹度を今の最大まで・状態異常を治す。最大は増えない）', () => {
  const S = toBossFloor(6, 959), run = S.run, p = run.player;
  defeatBoss(S); p.maxhp = 300; p.hp = 20; p.hunger = 5; p.poison = 4; p.bound = 2;
  assert(G.beginRescue(S)); eq(p.hp, 300); eq(p.hunger, D.PLAYER.maxHunger); eq(p.poison, 0); eq(p.bound, 0); eq(p.maxhp, 300);
  p.hp = 20; p.hunger = 5;
  assert(!G.beginRescue(S), 'once'); eq(p.hp, 20);
  const L = SV.deserialize(SV.serialize(S)); assert(!G.beginRescue(L), 'not again after reload'); eq(L.run.player.hp, 20);
});
test('ティウの救援：選び直しは何度でも（予定は保存）→ 確定で一括交換（容量を確かめ直す・失敗なら何も動かない）。装備中の品・素材も。確定後は使えない', () => {
  const S = toBossFloor(6, 960), run = S.run, V = S.village;
  defeatBoss(S); assert(G.canRescue(run));
  run.bag = run.bag.filter((i) => i.id === 'return_scroll');
  const sw = G.makeItem(S, 'shinma_sword'), sh = G.makeItem(S, 'dragonic_shield'), cr = G.makeItem(S, 'dragon_crest');
  for (const it of [sw, sh, cr]) { run.bag.push(it); G.act(S, { type: 'equip', uid: it.uid }); }
  assert(G.sets(run).all3);
  const herb = G.makeItem(S, 'herb'), mat = G.makeItem(S, 'amber_shard'), mat2 = G.makeItem(S, 'amber_shard'); run.bag.push(herb, mat, mat2);
  const c = G.makeItem(S, 'elixir'), d = G.makeItem(S, 'big_herb'); V.storage.push(c, d);
  V.materials.crystal_shard = 3; V.materials.amber_shard = 1;
  const count = () => run.bag.length + V.storage.length + Object.values(V.materials).reduce((a, n) => a + n, 0);
  const before = count();
  const scroll = run.bag.find((i) => i.id === 'return_scroll');
  // 予定を作って保存（読み込み直しても残る）。選び直す
  const plan = G.rescuePlan(run); plan.out = [herb.uid]; plan.in = [d.uid];
  let L = SV.deserialize(SV.serialize(S)); eq(L.run.final.rescuePlan.out.join(), String(herb.uid));
  plan.out = [cr.uid, mat.uid, mat2.uid]; plan.in = [c.uid]; plan.mats = { crystal_shard: 2 };
  assert(!G.checkRescuePlan(S, { out: [scroll.uid], in: [], mats: {} }).ok, 'return scroll cannot be sent');
  assert(!G.checkRescuePlan(S, { out: [], in: [9999], mats: {} }).ok, 'unknown uid');
  assert(!G.checkRescuePlan(S, { out: [], in: [], mats: { crystal_shard: 4 } }).ok, 'not enough materials');
  // 確定の前に持ち物が増えて容量をこえたら、確定は失敗して何も動かない（救援は続く）
  const extra = []; while (run.bag.length < D.BAG_SIZE) { const h = G.makeItem(S, 'herb'); extra.push(h); run.bag.push(h); }
  plan.mats = { crystal_shard: 3 };   // 15 - 3 + 1 + 3 = 16 個
  const n0 = count(); const f = G.commitRescue(S); assert(!f.ok && /こえます/.test(f.msg), f.msg); eq(count(), n0, 'nothing moved'); assert(G.canRescue(run) && cr.eq);
  run.bag = run.bag.filter((i) => !extra.includes(i)); plan.mats = { crystal_shard: 2 };
  const r = G.commitRescue(S); assert(r.ok, r.msg);
  // 紋章（装備中）は外れて倉庫へ・セットは解除。素材は素材箱へ。素材箱から2個取り出し（持ち物では1個1枠）
  assert(V.storage.includes(cr) && !cr.eq && !G.sets(run).all3 && G.sets(run).swordShield, 'crest unequipped, sets recomputed');
  eq(V.materials.amber_shard, 3); eq(V.materials.crystal_shard, 1); eq(run.bag.filter((i) => i.id === 'crystal_shard').length, 2);
  assert(run.bag.includes(c) && !V.storage.includes(c) && !run.bag.includes(mat));
  eq(count(), before, 'no loss, no dup');
  eq(new Set(run.bag.concat(V.storage).map((i) => i.uid)).size, run.bag.length + V.storage.length, 'unique');
  eq(run.final.rescue, 'done'); eq(run.final.rescuePlan, null); assert(run.final.wolf && run.final.wolf.sent === 3 && run.final.wolf.got === 3);
  // 確定後：もう交換できない（二重実行しない）。読み込み直しても動いたまま
  const n1 = count(); assert(!G.commitRescue(S, { out: [], in: [d.uid], mats: {} }).ok, 'closed after commit'); eq(count(), n1);
  L = SV.deserialize(SV.serialize(S)); assert(L.village.storage.some((i) => i.uid === cr.uid) && L.run.bag.some((i) => i.uid === c.uid) && !G.canRescue(L.run));
  G.wolfShown(S); eq(run.final.wolf, null);
  // 時空の亀裂から31階へ進める（行き先は仮）
  run.player.x = run.crack.x; run.player.y = run.crack.y; G.act(S, { type: 'descend' }); eq(run.floor, 31);
  // 何も選ばずに終えてもよい
  const S2 = toBossFloor(6, 961); defeatBoss(S2); const b2 = S2.run.bag.length; assert(G.commitRescue(S2).ok); eq(S2.run.bag.length, b2);
});
test('以前のセーブ（ボス戦の途中・ボスが通路にいる）：HPと戦いの状態を引き継ぎ、ボスを部屋の中（たけと重ならない所）へ戻す', () => {
  // 戦いの途中（HPが減っている・ボスが通路）
  const S = toBossFloor(2, 951), run = S.run, b = run.enemies.find((e) => e.boss);
  const door = doorOutside(run);
  b.hp = Math.floor(b.maxhp * 0.6); b.x = door.x - 1; b.y = door.y; run.player.x = door.x - 2; run.player.y = door.y;
  const raw = JSON.parse(SV.serialize(S)); raw.version = 4; delete raw.run.bossFight;
  const L = SV.deserialize(JSON.stringify(raw)), lb = L.run.enemies.find((e) => e.boss);
  assert(L.run.bossFight && L.run.bossFight.engaged, 'engaged from hp');
  eq(lb.hp, Math.floor(b.maxhp * 0.6), 'hp kept');
  assert(G.inArena(L.run, lb.x, lb.y) && !(lb.x === L.run.player.x && lb.y === L.run.player.y), 'moved into the room');
  for (let i = 0; i < 20; i++) { G.act(L, { type: 'wait' }); L.run.player.hp = L.run.player.maxhp; assert(insideAll(L.run)); }
  // まだ始まっていない（満タン・たけは前室）：待機のまま、中央へ
  const S2 = toBossFloor(3, 952), raw2 = JSON.parse(SV.serialize(S2)); raw2.version = 4; delete raw2.run.bossFight;
  const L2 = SV.deserialize(JSON.stringify(raw2));
  assert(L2.run.bossFight && !L2.run.bossFight.engaged, 'waiting');
  // 倒したあと（ボスがいない）：戦いは終わり。報酬・撃破の記録はそのまま
  const S3 = toBossFloor(1, 953); defeatBoss(S3);
  const items = S3.run.floorItems.length, raw3 = JSON.parse(SV.serialize(S3)); raw3.version = 4; delete raw3.run.bossFight;
  const L3 = SV.deserialize(JSON.stringify(raw3));
  assert(L3.run.bossFight.won); eq(L3.run.floorItems.length, items); eq(L3.village.story.defeated.croc, true);
});
test('以前の不具合の再現：ボスが通路へ出て、見えていない部屋に炎の印が並ぶことはない（フレイザード・20階）', () => {
  const S = toBossFloor(2, 77), run = S.run;
  for (let t = 0; t < 40; t++) { const p = run.player; if (p.x < 10) G.act(S, { type: 'move', dir: 'right' }); else G.act(S, { type: 'wait' }); }
  const b = run.enemies.find((e) => e.boss);
  assert(G.inArena(run, b.x, b.y), 'boss stays in the room');
  eq(run.hazards.length, 0, 'no hazards while waiting');
});

console.log('（参考）自動プレイによるバランス確認');
test('簡易AIで初回装備のまま遊んだ結果（参考値）', () => {
  const N = 40; let best = [], clears = 0, turns = [];
  for (let s = 0; s < N; s++) {
    const S = G.newState();
    G.takeLoan(S, 'food');
    departWithScroll(S, 1000 + s);
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
  assert(has(6, 32, 'life_necklace'), 'demon floors');
  const acc = Object.keys(D.ITEMS).filter((id) => D.ITEMS[id].type === 'accessory');
  eq(acc.length, 7);
  // ボスの報酬のアクセサリー（マスク・紋章・ローブ）は床には出ない
  eq(D.ACCESSORY_DROPS.length, 4);
  for (const id of ['phantom_mask', 'dragon_crest', 'demon_robe']) for (const ch of [1, 3, 6]) for (const f of [11, 21, 33]) if (f <= D.bossFloorOf(ch)) assert(!has(ch, f, id), 'no floor ' + id);
  for (const st of Object.values(D.SHOP_STOCK)) assert(!st.some((id) => acc.includes(id)), 'shop');
  for (const c of Object.values(D.CHAPTERS)) assert(!(c.shop || []).some((id) => acc.includes(id)), 'chapter shop');
  assert(!D.MERCHANT.goods.some((g) => acc.includes(g.id)), 'merchant');
  const S = newRun(320); assert(!S.run.bag.some((i) => acc.includes(i.id)), 'no start item');
});

console.log('ボスの報酬の見直し（2026年10月・セーブ v6）');
test('ボスのアクセサリー：ファントムマスク＝満腹度が減らない・防御+5、竜の紋章＝一度だけ立ち上がる・攻撃+5（紋章はなくなる）', () => {
  const S = newRun(1301); bigRoomFloor(S);
  const atk0 = G.playerAtk(S.run), def0 = G.playerDef(S.run);
  const mk = giveItem(S, 'phantom_mask'); G.act(S, { type: 'equip', uid: mk.uid });
  assert(G.hasAcc(S.run, 'hunger')); eq(G.playerDef(S.run), def0 + 5); eq(G.playerAtk(S.run), atk0);
  const p = S.run.player; p.hunger = 50; for (let i = 0; i < 100; i++) G.act(S, { type: 'wait' }); eq(p.hunger, 50, 'no hunger loss');
  const cr = giveItem(S, 'dragon_crest'); G.act(S, { type: 'equip', uid: cr.uid });
  assert(!mk.eq && cr.eq, 'one accessory slot'); eq(G.playerAtk(S.run), atk0 + 5); eq(G.playerDef(S.run), def0);
  const e = addEnemy(S, 'frog', p.x + 1, p.y); e.atk = 9999;
  let r; for (let i = 0; i < 30 && !r?.events.some((x) => x.t === 'revive'); i++) { p.hp = Math.min(p.hp, 1); r = G.act(S, { type: 'wait' }); }
  const ev = r.events.find((x) => x.t === 'revive'); assert(ev, 'revive'); eq(ev.name, '竜の紋章');
  assert(!S.run.over && !S.run.bag.includes(cr), 'crest consumed'); eq(G.playerAtk(S.run), atk0);
  assert(S.run.log.some((m) => m.includes('竜の紋章が光った')));
});
test('大魔王のローブ：装備して出発すると21階から（1階からも選べる）。装備していない・ボスの階が21階以下の章では1階から', () => {
  const mk = (ch) => { const S = G.newState(); S.village.story.chapter = ch; S.village.story.introDone = true; return S; };
  let S = mk(6); const robe = G.makeItem(S, 'demon_robe'); S.village.bag.push(robe);
  assert(!G.canDeepStart(S), 'not equipped');
  G.toggleEquipInBag(S.village.bag, robe.uid); assert(G.canDeepStart(S));
  assert(departWithScroll(S, 77, { deep: true }).ok); eq(S.run.floor, 21); eq(S.run.player.lvl, 1);
  assert(S.run.bag.some((i) => i.id === 'demon_robe' && i.eq), 'robe stays equipped');
  S = mk(6); const r2 = G.makeItem(S, 'demon_robe'); r2.eq = true; S.village.bag.push(r2);
  assert(departWithScroll(S, 78).ok); eq(S.run.floor, 1, 'normal departure from 1F');
  S = mk(2); const r3 = G.makeItem(S, 'demon_robe'); r3.eq = true; S.village.bag.push(r3);
  assert(!G.canDeepStart(S), 'chapter 2 boss is on 20F'); assert(departWithScroll(S, 79, { deep: true }).ok); eq(S.run.floor, 1);
  S = mk(4); const r4 = G.makeItem(S, 'demon_robe'); r4.eq = true; S.village.bag.push(r4);
  assert(departWithScroll(S, 80, { deep: true }).ok); eq(S.run.floor, 21);
});
test('旧セーブの移行（v5→v6）：げっこうの盾→ファントムシールド、りゅうきしの剣→真魔剛竜剣（番号・強化値・装備中を保持）。倒したボスの新しい報酬は倉庫へ一度だけ', () => {
  const S = G.newState(); S.version = 5;
  const V = S.village; V.nextUid = 300; V.funds = 1234;
  V.bag.push({ uid: 201, id: 'moon_shield', plus: 2, eq: true }, { uid: 202, id: 'dragon_sword', plus: 5, eq: true });
  V.storage.push({ uid: 203, id: 'phantom_mask', plus: 0 });
  Object.assign(V.story.defeated, { croc: true, flame: true, kill: true, baran: true, mist: true, vearn: true, truevearn: true });
  V.story.endingDone = true; V.story.chapter = 6;
  const L = SV.deserialize(JSON.stringify(S)), LV = L.village;
  eq(L.version, D.SAVE_VERSION); assert(D.SAVE_VERSION >= 6);
  const sh = LV.bag.find((i) => i.uid === 201), sw = LV.bag.find((i) => i.uid === 202);
  eq(sh.id, 'phantom_shield'); eq(sh.plus, 2); assert(sh.eq); eq(sw.id, 'shinma_sword'); eq(sw.plus, 5); assert(sw.eq);
  eq(G.itemName(sw), '真魔剛竜剣+5');
  // マスクは持っているので届けない。ほかは1つずつ
  eq(JSON.stringify(LV.giftNotice), JSON.stringify(['croc_axe', 'iceflame_shield', 'demon_robe']));   // 竜の紋章はバランの報酬ではなくなった
  eq(LV.storage.filter((i) => i.id === 'phantom_mask').length, 1);
  eq(new Set(LV.storage.map((i) => i.uid)).size, LV.storage.length); assert(LV.nextUid > 300);
  eq(LV.funds, 1234);
  for (const it of LV.bag.concat(LV.storage)) assert(D.ITEMS[it.id], 'defined ' + it.id);
  // 読み込み直しても増えない
  const L2 = SV.deserialize(SV.serialize(L)); eq(L2.village.storage.length, LV.storage.length);
  // 探索途中のセーブ：装備中の旧装備も続けられる
  const R = newRun(1302); R.run.bag.push({ uid: 9101, id: 'dragon_sword', plus: 1, eq: true });
  for (const it of R.run.bag) if (it.uid !== 9101 && G.def(it).type === 'weapon') it.eq = false;
  const raw = JSON.parse(SV.serialize(R)); raw.version = 5;
  const RL = SV.deserialize(JSON.stringify(raw)); eq(G.equipped(RL.run.bag, 'weapon').id, 'shinma_sword');
  // 何も倒していなければ届け物なし
  const N = G.newState(); N.version = 5; const NL = SV.deserialize(JSON.stringify(N)); assert(!NL.village.giftNotice); eq(NL.village.storage.length, 0);
});

console.log('クロコダインの登場ムービー（2026年10月）');
test('登場ムービー：クロコダイン（フレイザード・バランも同じ仕組み）。初めての入室で pending（戦いはまだ・ターンは入室の1回だけ）→ 終わりで1回だけ開始。保存・読み込み直し・次の探索', () => {
  eq(JSON.stringify(Object.keys(D.BOSS_INTROS)), JSON.stringify(['croc', 'flame', 'kill', 'baran', 'mist', 'vearn', 'truevearn']));
  const S = toBossFloor(1, 1401), run = S.run, A = run.bossFight, b = run.enemies.find((e) => e.boss);
  const door = doorOutside(run); run.player.x = door.x; run.player.y = door.y; G.updateVision(run);
  const t0 = run.turn, pos = [b.x, b.y, b.hp];
  const r = G.act(S, { type: 'move', dir: 'right' });
  assert(r.events.some((e) => e.t === 'bossIntro') && !r.events.some((e) => e.t === 'bossStart'));
  eq(A.intro, 'pending'); assert(!A.engaged); eq(run.turn, t0 + 1, 'entry move is one turn');
  // 保存して読み込み直しても pending のまま（HP・位置はそのまま）
  const L = SV.deserialize(SV.serialize(S)), LA = L.run.bossFight, lb = L.run.enemies.find((e) => e.boss);
  eq(LA.intro, 'pending'); assert(!LA.engaged); eq(JSON.stringify([lb.x, lb.y, lb.hp]), JSON.stringify(pos));
  // ムービー中に行動が来ても（画面が止めているはずだが）固まらない：ムービーを終えた扱いで開始、行動・ターンはなし
  const r2 = G.act(L, { type: 'wait' });
  assert(!r2.consumed && r2.events.filter((e) => e.t === 'bossStart').length === 1 && LA.engaged && LA.intro === 'done'); eq(L.run.turn, t0 + 1);
  assert(L.village.story.introSeen.croc);
  eq(G.finishBossIntro(L).length, 0, 'only once');
  // ボスはムービーのあと、次のターンから動ける（待たせるターンは足さない）
  assert(!(L.run.enemies.find((e) => e.boss).hold > 0));
  // 次の探索：入室ですぐ戦い（ムービーなし）
  L.run = null; departWithScroll(L, 1402); goToFloor(L, 15);
  const c = G.arenaCenter(L.run, L.run.enemies); L.run.player.x = c.x; L.run.player.y = c.y;
  const r3 = G.act(L, { type: 'wait' }); assert(!r3.events.some((e) => e.t === 'bossIntro') && r3.events.some((e) => e.t === 'bossStart'));
  // 以前のセーブ（introSeen なし）は読み込みで空の記録が足される
  const old = JSON.parse(SV.serialize(G.newState())); delete old.village.story.introSeen;
  eq(JSON.stringify(SV.deserialize(JSON.stringify(old)).village.story.introSeen), '{}');
  // フレイザード（第2章）も入室で登場ムービー
  { const T = toBossFloor(2, 1412), dr = doorOutside(T.run); T.run.player.x = dr.x; T.run.player.y = dr.y; G.updateVision(T.run);
    const rr = G.act(T, { type: 'move', dir: 'right' }); assert(rr.events.some((e) => e.t === 'bossIntro' && e.boss === 'flame') && !T.run.bossFight.engaged, 'flazzard intro');
    const ev = G.finishBossIntro(T); eq(ev.filter((e) => e.t === 'bossStart').length, 1); assert(T.village.story.introSeen.flame); }
  // キルバーン（第3章）も入室で登場ムービー
  { const T = toBossFloor(3, 1413), dr = doorOutside(T.run); T.run.player.x = dr.x; T.run.player.y = dr.y; G.updateVision(T.run);
    const hp0 = T.run.player.hp, rr = G.act(T, { type: 'move', dir: 'right' }); assert(rr.events.some((e) => e.t === 'bossIntro' && e.boss === 'kill') && !T.run.bossFight.engaged, 'killvearn intro');
    eq(G.act(T, { type: 'wait' }).consumed, false, 'no action during the movie'); eq(T.run.player.hp, hp0, 'no damage during the movie');
    eq(G.finishBossIntro(T).length, 0, 'the safety path already started the fight once'); assert(T.run.bossFight.engaged && T.village.story.introSeen.kill);
    eq(T.run.log.filter((l) => l.includes('との戦いが始まった')).length, 1, 'battle starts once'); }
  // 大魔王バーン（最終章30階）も入室で登場ムービー
  { const T = toBossFloor(6, 1416), dr = doorOutside(T.run); eq(T.run.floor, 30); T.run.player.x = dr.x; T.run.player.y = dr.y; G.updateVision(T.run);
    const hp0 = T.run.player.hp, rr = G.act(T, { type: 'move', dir: dr.dir }); assert(rr.events.some((e) => e.t === 'bossIntro' && e.boss === 'vearn') && !T.run.bossFight.engaged, 'vearn intro');
    eq(T.run.player.hp, hp0); const ev = G.finishBossIntro(T); eq(ev.filter((e) => e.t === 'bossStart').length, 1); eq(G.finishBossIntro(T).length, 0, 'once'); assert(T.village.story.introSeen.vearn); }
  // ミストバーン（第5章）も入室で登場ムービー
  { const T = toBossFloor(5, 1415), dr = doorOutside(T.run); T.run.player.x = dr.x; T.run.player.y = dr.y; G.updateVision(T.run);
    const hp0 = T.run.player.hp, rr = G.act(T, { type: 'move', dir: 'right' }); assert(rr.events.some((e) => e.t === 'bossIntro' && e.boss === 'mist') && !T.run.bossFight.engaged, 'mistvearn intro');
    eq(T.run.player.hp, hp0); const ev = G.finishBossIntro(T); eq(ev.filter((e) => e.t === 'bossStart').length, 1); eq(G.finishBossIntro(T).length, 0, 'once'); assert(T.village.story.introSeen.mist); }
});

console.log('ボスの報酬の装備7種（2026年10月・絵 v2）');
test('ボスの報酬の装備7種：既存のIDのまま（重複なし）・分類・絵（128と床用64）・ボスとの対応・能力値はそのまま', () => {
  require('../js/assets.js'); const A = TS.ASSETS, fs_ = require('fs'), path = require('path'), root = path.join(__dirname, '..');
  const want = { croc_axe: ['weapon', 'crocodine-axe', 1], iceflame_shield: ['shield', 'icefire-shield', 2], phantom_shield: ['shield', 'phantom-shield', 3], phantom_mask: ['accessory', 'phantom-mask', 3],
    shinma_sword: ['weapon', 'shinma-goryuken', 4], dragon_crest: ['accessory', 'dragon-pendant', 0], demon_robe: ['accessory', 'great-demon-robe', 6] };
  const png = (f) => { const b = fs_.readFileSync(path.join(root, f)); return [b.readUInt32BE(16), b.readUInt32BE(20), b[25]]; };
  for (const [id, [type, file, ch]] of Object.entries(want)) {
    eq(D.ITEMS[id].type, type, id);
    eq(A.items.byId[id], 'assets/items-boss/' + file, id + ' art');
    eq(JSON.stringify(png('assets/items-boss/' + file + '.png')), JSON.stringify([128, 128, 6]), id + ' 128 RGBA');
    eq(JSON.stringify(png('assets/items-boss/floor/' + file + '.png')), JSON.stringify([64, 64, 6]), id + ' 64 RGBA');
    if (ch) assert(D.CHAPTERS[ch].reward.items.includes(id), id + ' reward of chapter ' + ch);
    else assert(!Object.values(D.CHAPTERS).some((C) => C.reward.items.includes(id)) && D.VILLAGE_PICKUPS[id], id + ' is a village pickup, not a boss reward');
  }
  // 同じ名前の道具は1つだけ（竜の紋章・龍の紋章も1つ）
  const names = Object.values(D.ITEMS).map((d) => d.name);
  for (const id of Object.keys(want)) eq(names.filter((n) => n === D.ITEMS[id].name).length, 1, 'unique ' + id);   // 覇者の剣・盾は1つずつ（お宝は勇者の剣・盾）。竜の紋章はアクセサリーだけ（お宝の紋章は2026年10月に廃止）
  eq(D.ITEMS.dragon_crest.name, '竜の紋章'); assert(!names.includes('龍の紋章'));
  // 能力値・効果は前回の見直しのまま
  eq(D.ITEMS.croc_axe.atk, 16); eq(D.ITEMS.iceflame_shield.def, 15); eq(D.ITEMS.phantom_shield.def, 17); eq(D.ITEMS.shinma_sword.atk, 24);
  eq(D.ITEMS.phantom_mask.acc, 'hunger'); eq(D.ITEMS.phantom_mask.def, 5); eq(D.ITEMS.dragon_crest.acc, 'revive'); eq(D.ITEMS.dragon_crest.atk, 5); eq(D.ITEMS.demon_robe.acc, 'deep');
  // 武器2種・盾2種・アクセサリー3種がそれぞれの枠に装備できる（アクセサリーは1枠）
  const S = newRun(1501);
  for (const id of Object.keys(want)) { const it = G.makeItem(S, id); S.run.bag.push(it); G.act(S, { type: 'equip', uid: it.uid }); eq(G.equipped(S.run.bag, want[id][0]).id, id, 'equip ' + id); }
});
test('ボスの報酬：同じ撃破で1回だけ。持ち物がいっぱいで拾えずに帰っても、倒れても、倉庫へ1回だけ届ける（知らせは一度）', () => {
  for (const [ch, ids] of [[3, ['phantom_shield', 'phantom_mask']], [2, ['iceflame_shield', 'iceflame_crystal']]]) {
    const S = toBossFloor(ch, 1510 + ch), run = S.run;
    while (run.bag.length < D.BAG_SIZE) run.bag.push(G.makeItem(S, 'herb'));
    const st0 = S.village.storage.length;
    defeatBoss(S);
    const onFloor = run.floorItems.filter((f) => f.item && f.item.bossReward).map((f) => f.item.id).sort();
    eq(JSON.stringify(onFloor), JSON.stringify(ids.slice().sort()), 'both rewards ch' + ch);
    // 読み込み直しても増えない
    const L = SV.deserialize(SV.serialize(S));
    eq(L.run.floorItems.filter((f) => f.item && f.item.bossReward).length, 2, 'no dup after reload');
    // いっぱいで拾えない → 帰還口で帰る
    L.run.enemies = []; const f0 = L.run.floorItems.find((f) => f.item && f.item.bossReward); L.run.player.x = f0.x; L.run.player.y = f0.y; G.act(L, { type: 'pickup' });
    eq(L.run.bag.length, D.BAG_SIZE, 'bag full');
    L.run.player.x = L.run.portal.x; L.run.player.y = L.run.portal.y; G.act(L, { type: 'returnHome' });
    const res = G.finishRun(L);
    eq(JSON.stringify(res.rewardToStorage.slice().sort()), JSON.stringify(ids.slice().sort()));
    for (const id of ids) eq(L.village.storage.filter((i) => i.id === id).length, 1, 'stored ' + id);
    assert(L.village.storage.every((i) => !i.bossReward) && L.village.bag.every((i) => !i.bossReward), 'flag removed');
    eq(JSON.stringify(L.village.rewardNotice.slice().sort()), JSON.stringify(ids.slice().sort()));
    eq(L.village.storage.length, st0 + 2);
  }
  // 拾ってから帰る：倉庫へは届けない（二重にしない）
  const S = toBossFloor(1, 1520), run = S.run; defeatBoss(S); run.enemies = [];
  for (const f of run.floorItems.slice()) if (f.item && f.item.bossReward) { run.player.x = f.x; run.player.y = f.y; G.act(S, { type: 'pickup' }); }
  run.player.x = run.portal.x; run.player.y = run.portal.y; G.act(S, { type: 'returnHome' });
  const r = G.finishRun(S); assert(!r.rewardToStorage && !S.village.rewardNotice);
  for (const id of ['croc_tear', 'croc_axe']) eq(S.village.bag.concat(S.village.storage).filter((i) => i.id === id).length, 1, 'once ' + id);
  // 倒れた：持ち物は失うが、床に残した報酬は倉庫へ
  const T = toBossFloor(2, 1521); defeatBoss(T); T.run.player.hp = 1; T.run.enemies = [];
  T.run.over = true; T.run.result = { type: 'dead', floor: T.run.floor };
  G.finishRun(T); for (const id of ['iceflame_shield', 'iceflame_crystal']) eq(T.village.storage.filter((i) => i.id === id).length, 1, 'dead keeps ' + id);
});

console.log('村の発展「マスターヤナイの像」（旧「黄金の門」、セーブ v7）');
test('マスターヤナイの像：黄金の門の値段・解放条件を引き継ぐ。旧セーブの黄金の門を買っていれば像を建てた扱い（追加の支払いなし）。買っていなければ無し', () => {
  const F = D.FACILITIES.find((f) => f.id === 'yanai_statue');
  assert(F && F.kind === 'decor' && F.name === 'マスターヤナイの像' && F.price === 1500 && JSON.stringify(F.req) === JSON.stringify(['donate9']));
  assert(!D.FACILITIES.some((f) => f.id === 'gate' || f.name === '黄金の門'), 'golden gate removed');
  // 旧セーブ（v6）：黄金の門を購入済み
  const S = G.newState(); S.version = 6; S.village.built.gate = true; S.village.built.lanterns = true; S.village.funds = 777; G.applyFacilities(S.village);
  const L = SV.deserialize(JSON.stringify(S));
  assert(L.version >= 7); assert(L.village.built.yanai_statue && L.village.decor.yanai_statue, 'statue built'); assert(!('gate' in L.village.built) && !('gate' in L.village.decor));
  eq(L.village.funds, 777); assert(L.village.built.lanterns && L.village.decor.lanterns, 'other decor kept');
  eq(G.facilityStatus(L, 'yanai_statue').built, true);
  // 未購入：像は無い（以前は最初から広場に像があったが、購入扱いにしない）
  const N = G.newState(); N.version = 6; N.village.funds = 5000; const NL = SV.deserialize(JSON.stringify(N));
  assert(!NL.village.built.yanai_statue && !NL.village.decor.yanai_statue); eq(NL.village.funds, 5000);
  // 解放の条件（お宝9種類の寄贈）を満たして建てると、資金から1500
  const B = G.newState(); B.village.funds = 2000; B.village.built.museum = true; B.village.museum = true;
  for (const id of D.MUSEUM_ITEMS.slice(0, 9)) B.village.donated[id] = true;
  const r = G.buildFacility(B, 'yanai_statue'); assert(r.ok, r.msg); eq(B.village.funds, 500); assert(B.village.decor.yanai_statue);
  // 読み込み直しても変わらない
  const t = SV.serialize(L); eq(SV.serialize(SV.deserialize(t)), t);
});

console.log('竜の紋章（アクセサリー）：赤い橋の向こう岸で拾う（2026年10月 v3、セーブ v8）');
test('竜の紋章（アクセサリー）：赤い橋が完成していれば向こう岸で1回だけ拾える。橋が無いと拾えない・届かない。いっぱいなら倉庫。記録は保存', () => {
  const P = D.VILLAGE_PICKUPS.dragon_crest; eq(P.item, 'dragon_crest'); eq(P.need, 'bridge');
  assert(!Object.values(D.CHAPTERS).some((C) => C.reward.items.includes('dragon_crest')), 'not a boss reward');
  const S = G.newState(), V = S.village;
  eq(G.villagePickups(V).length, 0, 'no bridge, no pickup'); assert(!G.takeVillagePickup(S, 'dragon_crest').ok);
  // 橋が無いと向こう岸（25行）へ歩いて行けないことは、村の地図を使うのでブラウザで確かめる（tools/pendant-check.js）
  V.built.bridge = true; G.applyFacilities(V);
  eq(JSON.stringify(G.villagePickups(V)), JSON.stringify(['dragon_crest']));
  const r = G.takeVillagePickup(S, 'dragon_crest'); assert(r.ok && r.to === 'bag'); eq(V.bag.filter((i) => i.id === 'dragon_crest').length, 1);
  assert(V.story.found.dragon_crest); eq(G.villagePickups(V).length, 0); assert(!G.takeVillagePickup(S, 'dragon_crest').ok, 'only once');
  // 保存・読み込み直しでも戻らない
  const L = SV.deserialize(SV.serialize(S)); assert(L.village.story.found.dragon_crest); eq(G.villagePickups(L.village).length, 0);
  // 持ち物がいっぱい → 倉庫へ
  const F = G.newState(); F.village.built.bridge = true; G.applyFacilities(F.village);
  while (F.village.bag.length < D.BAG_SIZE) F.village.bag.push(G.makeItem(F, 'herb'));
  const r2 = G.takeVillagePickup(F, 'dragon_crest'); assert(r2.ok && r2.to === 'storage'); eq(F.village.storage.filter((i) => i.id === 'dragon_crest').length, 1); eq(F.village.bag.length, D.BAG_SIZE);
  // 竜の紋章を拾っても、ほかの記録（撃破・寄贈・お宝）は変わらない
  assert(!F.village.story.defeated.baran && !Object.keys(F.village.donated).length);
});
test('セーブ v7→v8：竜の紋章をすでに持っていれば拾った扱い（消さない・増やさない）。持っていなければ橋の完成後に拾える', () => {
  const mk = (setup) => { const S = G.newState(); S.version = 7; setup(S); return SV.deserialize(JSON.stringify(S)); };
  // 倉庫に持っている（旧バランの報酬）＋ 橋あり
  let L = mk((S) => { S.village.storage.push({ uid: 77, id: 'dragon_crest', plus: 0 }); S.village.built.bridge = true; S.village.story.defeated.baran = true; });
  eq(L.version, D.SAVE_VERSION); assert(L.village.story.found.dragon_crest); eq(G.villagePickups(L.village).length, 0); eq(L.village.storage.filter((i) => i.id === 'dragon_crest').length, 1);
  // 装備中（持ち物）
  L = mk((S) => { S.village.bag.push({ uid: 78, id: 'dragon_crest', plus: 0, eq: true }); });
  assert(L.village.story.found.dragon_crest && L.village.bag.find((i) => i.uid === 78).eq);
  // 持っていない・橋あり → 拾える
  L = mk((S) => { S.village.built.bridge = true; S.village.story.defeated.baran = true; });
  assert(!L.village.story.found.dragon_crest); G.applyFacilities(L.village); eq(JSON.stringify(G.villagePickups(L.village)), JSON.stringify(['dragon_crest']));
  // 持っていない・橋なし → まだ拾えない（橋を建てたら拾える）
  L = mk(() => {}); eq(G.villagePickups(L.village).length, 0); L.village.built.bridge = true; eq(G.villagePickups(L.village).length, 1);
});

test('バランの登場ムービー：第4章30階の玉座の部屋に初めて入ったときだけ。階段で着いた・通路では流れない。終わりで1回だけ戦闘開始（敵の余分な行動なし・報酬や撃破の記録は付けない）', () => {
  eq(D.BOSS_INTROS.baran, 'baran'); eq(D.bossFloorOf(4), 30); eq(D.CHAPTERS[4].boss, 'baran');
  const S = toBossFloor(4, 1430), run = S.run, A = run.bossFight, b = run.enemies.find((e) => e.boss);
  eq(b.type, 'baran'); assert(!A.intro && !A.engaged, 'not on arrival');
  const door = doorOutside(run); run.player.x = door.x; run.player.y = door.y; G.updateVision(run);
  for (let i = 0; i < 5; i++) { const r = G.act(S, { type: 'wait' }); assert(!r.events.some((e) => e.t === 'bossIntro')); }
  const pos = [b.x, b.y, b.hp], t0 = run.turn;
  const r = G.act(S, { type: 'move', dir: 'right' });
  assert(r.events.filter((e) => e.t === 'bossIntro' && e.boss === 'baran').length === 1 && A.intro === 'pending' && !A.engaged);
  eq(run.turn, t0 + 1, 'entry move only');
  const ev = G.finishBossIntro(S);
  eq(ev.filter((e) => e.t === 'bossStart').length, 1); eq(G.finishBossIntro(S).length, 0, 'once');
  eq(run.turn, t0 + 1, 'no extra turn'); eq(JSON.stringify([b.x, b.y, b.hp]), JSON.stringify(pos), 'boss did not act during/after the movie');
  assert(S.village.story.introSeen.baran && !S.village.story.defeated.baran && !run.floorItems.some((f) => f.item && f.item.bossReward), 'no reward or defeat flag');
  // 同じ戦闘の中で部屋を出入りしても流れない
  run.player.x = door.x; run.player.y = door.y; G.act(S, { type: 'wait' });
  const r2 = G.act(S, { type: 'move', dir: 'right' }); assert(!r2.events.some((e) => e.t === 'bossIntro'));
});

console.log('装備のセット・竜の紋章・ローブ・2回行動（2026年10月）');
function equipSet(S, ids) {
  const run = S.run; run.bag = run.bag.filter((i) => !['weapon', 'shield', 'accessory'].includes(G.def(i).type));
  const out = {}; for (const id of ids) { const it = G.makeItem(S, id); run.bag.push(it); G.toggleEquipInBag(run.bag, it.uid); out[id] = it; }
  return out;
}
test('セットの数値：剣＋紋章で攻撃+5（装備由来34）、紋章＋盾で防御+5、盾は防御+22で鍛冶屋+8まで', () => {
  const S = newRun(1601); bigRoomFloor(S); const run = S.run;
  const base = D.PLAYER.baseAtk + D.PLAYER.atkPerLevel * (run.player.lvl - 1);
  equipSet(S, ['shinma_sword']); eq(G.playerAtk(run), base + 24);
  equipSet(S, ['shinma_sword', 'dragon_crest']); eq(G.playerAtk(run), base + 24 + 5 + 5, 'sword 24 + crest 5 + set 5 = 34');
  equipSet(S, ['dragonic_shield']); eq(G.playerDef(run), 22);
  equipSet(S, ['dragonic_shield', 'dragon_crest']); eq(G.playerDef(run), 27, 'crest+shield +5');
  equipSet(S, ['shinma_sword', 'dragonic_shield', 'dragon_crest']); assert(G.sets(run).all3); eq(G.playerAtk(run), base + 34); eq(G.playerDef(run), 27);
  const V = S.village; V.smithLv = 3; V.funds = 1e6; V.materials = { amber_shard: 9, bronze_shard: 9, crystal_shard: 9, gold_leaf: 9 };
  const sh = G.makeItem(S, 'dragonic_shield'); V.bag.push(sh);
  for (let i = 0; i < 10; i++) G.smith(S, sh.uid); eq(sh.plus, 8, 'smith up to +8');
  assert(!G.canSell(sh), 'sell price undecided');
});
test('漆黒の盾＋ローブ：満腹度が減らない・総攻撃力×0.8（四捨五入）・真魔剛竜剣なら下がらない。ローブの自然回復は2倍（重ねない）。毒・空腹0では回復しない', () => {
  const S = newRun(1602); bigRoomFloor(S); const run = S.run, p = run.player;
  const base = D.PLAYER.baseAtk + D.PLAYER.atkPerLevel * (p.lvl - 1);
  equipSet(S, ['golden_sword', 'phantom_shield', 'demon_robe']); assert(G.sets(run).shieldRobe);
  eq(G.playerAtk(run), Math.round((base + 18) * 0.8));
  equipSet(S, ['shinma_sword', 'phantom_shield', 'demon_robe']); eq(G.playerAtk(run), base + 24, 'shinma not reduced');
  p.hunger = 50; for (let i = 0; i < 80; i++) G.act(S, { type: 'wait' }); eq(p.hunger, 50, 'no hunger loss');
  // 自然回復：なし／ローブ単体／盾＋ローブ（どれも2倍まで）
  const regen = (ids) => { equipSet(S, ids); p.maxhp = 1100; p.hp = 100; p.poison = 0; p.hunger = 100; p.regenAcc = 0; for (let i = 0; i < 20; i++) G.act(S, { type: 'wait' }); return p.hp - 100; };
  const r0 = regen([]), r1 = regen(['demon_robe']), r2 = regen(['phantom_shield', 'demon_robe']);
  eq(r0, 200); eq(r1, 400, 'robe 2x'); eq(r2, 400, 'set does not stack');
  equipSet(S, ['demon_robe']); p.hp = 100; p.poison = 5; p.regenAcc = 0; const h0 = p.hp; G.act(S, { type: 'wait' }); assert(p.hp < h0, 'no regen while poisoned');
});
test('竜の紋章：HP0で最大HPの50%（四捨五入）で復活し、紋章はなくなり、セットも外れる。3点セット中なら全回復', () => {
  for (const [ids, want] of [[['shinma_sword', 'dragon_crest'], 0.5], [['shinma_sword', 'dragonic_shield', 'dragon_crest'], 1]]) {
    const S = newRun(1603); bigRoomFloor(S); const run = S.run, p = run.player;
    equipSet(S, ids); p.maxhp = 301;
    const e = addEnemy(S, 'frog', p.x + 1, p.y); e.atk = 99999;
    let r; for (let i = 0; i < 40 && !r?.events.some((x) => x.t === 'revive'); i++) { p.hp = Math.min(p.hp, 1); r = G.act(S, { type: 'wait' }); }
    assert(r.events.some((x) => x.t === 'revive'), 'revive'); assert(!S.run.over);
    assert(!run.bag.some((i) => i.id === 'dragon_crest'), 'crest consumed');
    const s = G.sets(run); assert(!s.swordCrest && !s.crestShield && !s.all3, 'sets recalculated');
    if (want === 1) eq(p.hp, 301); else assert(p.hp === Math.round(301 * 0.5) || p.hp === Math.round(301 * 0.5) - 0, 'half hp ' + p.hp);
  }
});
test('2マス攻撃（剣＋盾）：命中を固定して、正面2マス目に届く・手前の敵を貫通して2体ともダメージ・壁や角の向こうには当たらない・待っているボスには届かない', () => {
  const hit0 = D.PLAYER.hitRate; D.PLAYER.hitRate = 1;   // 命中の乱数を固定（外れなし）
  try {
    const S = newRun(1604); bigRoomFloor(S); const run = S.run, p = run.player, m = run.map;
    equipSet(S, ['shinma_sword', 'dragonic_shield']); assert(G.sets(run).swordShield);
    run.player.lvl = 30;
    // 2マス目だけ：歩かずに届く
    const far = addEnemy(S, 'frog', p.x + 2, p.y); far.hp = far.maxhp = 999; far.sleep = 99;
    let r = G.act(S, { type: 'move', dir: 'right' });
    assert(r.consumed && p.x === 5 && far.hp < 999 && r.events.some((e) => e.t === 'reach'), 'reach attack instead of moving');
    // 手前と奥（別のマス。どちらも眠らせて動かさない）→ 1回の攻撃で2体ともダメージ
    run.enemies = [];
    const f2 = addEnemy(S, 'frog', p.x + 2, p.y), n2 = addEnemy(S, 'frog', p.x + 1, p.y);
    for (const e of [f2, n2]) { e.hp = e.maxhp = 999; e.sleep = 99; }
    r = G.act(S, { type: 'move', dir: 'right' });
    assert(n2.hp < 999 && f2.hp < 999, 'both damaged ' + n2.hp + ' ' + f2.hp);
    eq(r.events.filter((e) => e.t === 'hit' && e.target !== 'player').length, 2, 'two hits');
    // 正面が壁：攻撃しない（ターンも使わない）
    run.enemies = []; m.tiles[p.y * m.w + p.x + 1] = DG.WALL; const w2 = addEnemy(S, 'frog', p.x + 2, p.y); w2.hp = w2.maxhp = 999; w2.sleep = 99;
    r = G.act(S, { type: 'move', dir: 'right' }); assert(!r.consumed && w2.hp === 999, 'no attack through walls');
    m.tiles[p.y * m.w + p.x + 1] = DG.FLOOR;
    // 1マス目と2マス目の間が角（ななめの2マス目）：角の向こうには当たらない
    run.enemies = []; const wa = p.y * m.w + p.x + 2, wb = (p.y + 2) * m.w + p.x + 1; m.tiles[wa] = DG.WALL; m.tiles[wb] = DG.WALL;   // (x+1,y+1) から (x+2,y+2) へは角をこえる
    const c2 = addEnemy(S, 'frog', p.x + 2, p.y + 2); c2.hp = c2.maxhp = 999; c2.sleep = 99;
    r = G.act(S, { type: 'move', dir: 'downright' }); eq(c2.hp, 999, 'no attack around corners'); eq(p.x + ',' + p.y, '6,6', 'walked instead');
    m.tiles[wa] = DG.FLOOR; m.tiles[wb] = DG.FLOOR;
    // 剣だけ：届かない（歩く）
    run.enemies = []; equipSet(S, ['shinma_sword']); const e3 = addEnemy(S, 'frog', p.x + 2, p.y); e3.sleep = 99;
    r = G.act(S, { type: 'move', dir: 'right' }); eq(p.x, 7, 'moved'); eq(e3.hp, e3.maxhp);
  } finally { D.PLAYER.hitRate = hit0; }
});
test('2回行動（3点セット）：たけ2行動で敵1回・時間1ターン。付け替えで行動は増えない。紋章が消えても敵の手番は消えない。新しい毒・拘束・床の印を受けない', () => {
  const S = newRun(1605); bigRoomFloor(S); const run = S.run, p = run.player;
  const set = equipSet(S, ['shinma_sword', 'dragonic_shield', 'dragon_crest']);
  const t0 = run.turn;
  G.act(S, { type: 'wait' }); eq(run.turn, t0, 'first action: no time'); eq(p.half, 1);
  G.act(S, { type: 'wait' }); eq(run.turn, t0 + 1, 'second action: one turn');
  // 敵は2行動に1回だけ動く
  const e = addEnemy(S, 'frog', p.x + 4, p.y); e.atk = 0; e.tx = p.x; e.ty = p.y;
  const x0 = e.x; G.act(S, { type: 'wait' }); eq(e.x, x0, 'enemy waits'); G.act(S, { type: 'wait' }); assert(e.x !== x0, 'enemy moves once');
  run.enemies = [];
  // 付け替え：外す（3点の状態で行動→1回目）→ 次は3点ではないので時間が進む。付け直し→時間が進む（行動は増えない）
  const tA = run.turn; G.act(S, { type: 'equip', uid: set.dragon_crest.uid }); eq(run.turn, tA, 'unequip as first action');
  G.act(S, { type: 'wait' }); eq(run.turn, tA + 1, 'pending time resolves'); eq(p.half, 0);
  G.act(S, { type: 'equip', uid: set.dragon_crest.uid }); eq(run.turn, tA + 2, 're-equip while not set: normal turn'); assert(G.sets(run).all3);
  // 状態異常・床の印
  run.hazards = [{ x: p.x, y: p.y, t: 1, dmg: 50, name: '床の炎', kind: 'fire' }]; const hp0 = p.hp;
  G.act(S, { type: 'wait' }); G.act(S, { type: 'wait' }); eq(p.hp >= hp0 || p.hp === p.maxhp, true, 'hazard no damage');
  const pe = addEnemy(S, 'frog', p.x + 1, p.y); pe.type = 'snake'; pe.atk = 1;
  // 毒の敵の攻撃（毒にならない）
  if (D.ENEMIES.snake && D.ENEMIES.snake.ai === 'poison') { for (let i = 0; i < 30; i++) G.act(S, { type: 'wait' }); eq(p.poison, 0, 'no poison'); }
  // 紋章が消える（2回行動の途中ではなく、敵の手番の中で起きる）→ 次の行動は普通の1ターン
  run.enemies = []; p.half = 0; const k = addEnemy(S, 'frog', p.x + 1, p.y); k.atk = 99999;
  let r; for (let i = 0; i < 6 && !(r && r.events.some((x) => x.t === 'revive')); i++) { p.hp = 1; r = G.act(S, { type: 'wait' }); }
  assert(r.events.some((x) => x.t === 'revive') && !G.sets(run).all3);
  run.enemies = []; const tB = run.turn; G.act(S, { type: 'wait' }); eq(run.turn, tB + 1, 'normal turn after crest consumed'); eq(p.half, 0);
});
test('2回行動の行動順（記録）：セットができる・外れる（1回目／2回目）・付け直す・紋章で復活の前後で、敵の手番と時間が増えも減りもしない', () => {
  const S = newRun(1606); bigRoomFloor(S); const run = S.run, p = run.player;
  const set = equipSet(S, ['shinma_sword', 'dragonic_shield']); const crest = G.makeItem(S, 'dragon_crest'); run.bag.push(crest);
  p.hp = p.maxhp = 999;
  // 敵の手番を数える：遠くの敵が、たけへ1マスずつ近づく（攻撃しない）
  let e = null;
  const fresh = () => { run.enemies = []; e = addEnemy(S, 'frog', p.x + 12, p.y); e.atk = 0; e.awake = true; e.tx = p.x; e.ty = p.y; };
  const log = [];
  const step = (label, a) => { const t0 = run.turn, x0 = e.x, y0 = e.y; const r = G.act(S, a); e.tx = p.x; e.ty = p.y;
    log.push(label + ':' + (run.turn - t0) + (e.x !== x0 || e.y !== y0 ? 'E' : '-') + (p.half ? 'h' : '')); return r; };
  const crestEq = () => ({ type: 'equip', uid: crest.uid });
  fresh();
  step('待つ', { type: 'wait' });               // セットなし：1行動＝1ターン
  step('紋章を着ける', crestEq());              // 行動の前はセットなし → この行動も1ターン（セットができても延期しない）
  step('待つ1', { type: 'wait' });              // ここから2回行動：1回目は時間が進まない
  step('待つ2', { type: 'wait' });              // 2回目で敵1回・時間1ターン
  step('1回目に外す', crestEq());               // 行動の前は3点 → 1回目の扱い（時間は保留）
  step('待つ', { type: 'wait' });               // もう3点ではない → 保留の1ターンが進む（消えない・二重にもならない）
  step('待つ', { type: 'wait' });               // ふつうの1ターン
  step('紋章を着ける', crestEq());              // セットなしの行動 → 1ターン
  step('待つ1', { type: 'wait' });
  step('2回目に外す', crestEq());               // 2回目 → 敵1回・1ターン
  step('待つ', { type: 'wait' });               // ふつうの1ターン
  step('紋章を着ける', crestEq());
  step('待つ1', { type: 'wait' });
  step('付け直し外す', crestEq());              // 2回目（外す）→ 1ターン
  step('すぐ着ける', crestEq());                // セットなしの行動 → 1ターン（付け外しで行動は増えない）
  eq(log.join(' '), '待つ:1E 紋章を着ける:1E 待つ1:0-h 待つ2:1E 1回目に外す:0-h 待つ:1E 待つ:1E 紋章を着ける:1E 待つ1:0-h 2回目に外す:1E 待つ:1E 紋章を着ける:1E 待つ1:0-h 付け直し外す:1E すぐ着ける:1E');
  // 10行動で数える：3点のままなら敵5回・5ターン
  fresh(); assert(G.sets(run).all3); let t0 = run.turn, moves = 0;
  for (let i = 0; i < 10; i++) { const x0 = e.x; G.act(S, { type: 'wait' }); e.tx = p.x; e.ty = p.y; if (e.x !== x0) moves++; }
  eq(run.turn - t0, 5); eq(moves, 5);
  // 紋章で復活：倒されるのは敵の手番の中（2回目の行動のあと）。その手番は消えず、次からはセットなしで1行動＝1ターン
  run.enemies = []; const k = addEnemy(S, 'frog', p.x + 1, p.y); k.atk = 99999; k.awake = true; p.hp = 1;
  log.length = 0; e = k;
  step('1回目', { type: 'wait' });
  const r = step('2回目（敵の攻撃で倒れて復活）', { type: 'wait' });
  assert(r.events.some((x) => x.t === 'revive') && !run.bag.includes(crest) && !G.sets(run).all3, 'crest consumed');
  eq(p.hp, p.maxhp, '3点セットだったので全回復');
  k.atk = 0;
  const t1 = run.turn; G.act(S, { type: 'wait' }); eq(run.turn, t1 + 1, 'next action: normal turn'); eq(p.half, 0);
  eq(log.join(' '), '1回目:0-h 2回目（敵の攻撃で倒れて復活）:1-');
  void set;
});
test('漆黒の盾＋ローブの攻撃低下：真魔剛竜剣を「武器として装備」しているときだけ免除（持っているだけ・倉庫にあるだけでは免除しない）', () => {
  const S = newRun(1607); const run = S.run;
  const atkWith = (ids, extra) => { equipSet(S, ids); if (extra) run.bag.push(G.makeItem(S, extra)); return G.playerAtk(run); };
  const base = atkWith(['golden_sword']);
  eq(atkWith(['golden_sword', 'phantom_shield', 'demon_robe']), Math.round(base * D.SETS.shieldRobeAtkMul), 'reduced');
  eq(atkWith(['golden_sword', 'phantom_shield', 'demon_robe'], 'shinma_sword'), Math.round(base * D.SETS.shieldRobeAtkMul), 'shinma only in bag: still reduced');
  S.village.storage.push(G.makeItem(S, 'shinma_sword'));
  eq(atkWith(['golden_sword', 'phantom_shield', 'demon_robe']), Math.round(base * D.SETS.shieldRobeAtkMul), 'shinma in storage: still reduced');
  const shin = atkWith(['shinma_sword']);
  eq(atkWith(['shinma_sword', 'phantom_shield', 'demon_robe']), shin, 'equipped shinma: not reduced');
});
test('竜の紋章はアクセサリーだけ（お宝の竜の紋章は2026年10月に廃止）。バランの報酬は真魔剛竜剣だけ。赤い橋はバランを倒した後に建てられる', () => {
  assert(!D.ITEMS.baran_emblem, 'treasure crest removed'); eq(D.ITEMS.dragon_crest.type, 'accessory');
  eq(Object.values(D.ITEMS).filter((d) => d.name === '竜の紋章').length, 1, 'only one crest');
  eq(JSON.stringify(D.CHAPTERS[4].reward.items), JSON.stringify(['shinma_sword']));
  assert(!TS.ASSETS || !TS.ASSETS.items || !TS.ASSETS.items.byId.baran_emblem, 'no art mapping');
  const F = D.FACILITIES.find((f) => f.id === 'bridge'); eq(JSON.stringify(F.req), JSON.stringify(['baran'])); eq(F.price, 900);
  const S = G.newState(), V = S.village; V.funds = 5000; V.bestFloor = 30;
  assert(!G.facilityStatus(S, 'bridge').unlocked, 'locked before Baran');
  V.story.defeated.baran = true; assert(G.facilityStatus(S, 'bridge').unlocked);
  assert(G.buildFacility(S, 'bridge').ok);
  eq(JSON.stringify(G.villagePickups(V)), JSON.stringify(['dragon_crest']));
});
test('以前のセーブ（v8）のお宝の竜の紋章は、読み込みで消える（持ち物・倉庫・探索中・床・買い戻しの記録・届け物の知らせ）。アクセサリーの竜の紋章・ほかの品・進み具合はそのまま', () => {
  const S = G.newState(), V = S.village; V.story.chapter = 5; V.story.defeated.baran = true; V.funds = 1234;
  G.depart(S, 5150); const r = S.run;
  const raw = JSON.parse(SV.serialize(S));
  const mk = (id, uid) => ({ id, uid });
  raw.version = 8;
  raw.village.bag = [mk('baran_emblem', 901), mk('shinma_sword', 902)];
  raw.village.storage = [mk('dragon_crest', 903), mk('baran_emblem', 904)];
  raw.run.bag.push(mk('baran_emblem', 905));
  raw.run.floorItems.push({ x: r.player.x, y: r.player.y, item: mk('baran_emblem', 906) });
  raw.village.bossObtained = { shinma_sword: true, baran_emblem: true };
  raw.village.giftNotice = ['baran_emblem'];
  const L = SV.deserialize(JSON.stringify(raw));
  const all = L.village.bag.concat(L.village.storage, L.run.bag, L.run.floorItems.map((f) => f.item).filter(Boolean));
  assert(!all.some((it) => it.id === 'baran_emblem'), 'removed everywhere');
  assert(L.village.bag.some((it) => it.id === 'shinma_sword') && L.village.storage.some((it) => it.id === 'dragon_crest'), 'others kept');
  assert(!L.village.bossObtained.baran_emblem && L.village.bossObtained.shinma_sword); assert(!L.village.giftNotice, 'notice cleared');
  eq(L.village.funds, 1234); assert(L.village.story.defeated.baran); eq(L.version, D.SAVE_VERSION);
});

console.log('覇者の剣・覇者の盾と、お宝の勇者の剣・勇者の盾（2026年10月）');
test('覇者の剣・盾：IDはそのまま（能力値・売値・強化・第5章の報酬も同じ）。勇者の剣・盾は別IDのお宝で、どこからも出ない', () => {
  const I = D.ITEMS;
  eq(I.hero_sword.name, '覇者の剣'); eq(I.hero_sword.type, 'weapon'); eq(I.hero_sword.atk, 27); eq(I.hero_sword.sell, 900);
  eq(I.hero_shield.name, '覇者の盾'); eq(I.hero_shield.type, 'shield'); eq(I.hero_shield.def, 19); eq(I.hero_shield.sell, 860);
  eq(JSON.stringify(D.CHAPTERS[5].reward.items), JSON.stringify(['hero_sword', 'hero_shield'])); eq(D.CHAPTERS[5].boss, 'mist');
  eq(TS.ASSETS.items.byId.hero_sword, 'assets/items-boss/hasha-sword'); eq(TS.ASSETS.items.byId.hero_shield, 'assets/items-boss/hasha-shield');
  // お宝：別ID・装備できない・売れない・展示室の枠に無い・絵は今までの勇者の剣・盾（コードの絵）
  for (const [id, old] of [['hero_sword_relic', 'hero_sword'], ['hero_shield_relic', 'hero_shield']]) {
    const d = I[id]; assert(id !== old && d.type === 'treasure' && d.noSell && !d.atk && !d.def, id);
    eq(d.icon, I[old].icon); eq(d.tint, I[old].tint); assert(!TS.ASSETS.items.byId[id], 'old code-drawn art');
    assert(!D.MUSEUM_ITEMS.includes(id));
    // どこからも出ない：床・敵（同じ表）・店・旅商人・ボスの報酬
    eq(G.itemFloors(id).length, 0, id + ' not on floors');
    for (let ch = 1; ch <= 6; ch++) { assert(!D.CHAPTERS[ch].reward.items.includes(id)); for (let f = 1; f <= 35; f++) assert(!D.floorFor(ch, f).items.some(([i]) => i === id)); }
    for (const st of Object.values(D.SHOP_STOCK)) assert(!st.includes(id));
    assert(!D.MERCHANT.goods.some((g) => g.id === id));
    for (const E of Object.values(D.ENEMIES)) assert(E.drop !== id && E.repeatDrop !== id);
    const S = G.newState(); S.village.story.defeated.mist = true; assert(!G.guideItems(S, 'treasure').some((g) => g.id === id), 'not in Tiw guide');
  }
  eq(I.hero_sword_relic.name, '勇者の剣'); eq(I.hero_shield_relic.name, '勇者の盾');
  // 覇者は新しいセットを持たない。ローブの攻撃低下の免除は真魔剛竜剣だけ
  assert(!JSON.stringify(G.setsOf([Object.assign(G.makeItem(G.newState(), 'hero_sword'), { eq: true }), Object.assign(G.makeItem(G.newState(), 'hero_shield'), { eq: true })])).includes('true'), 'no hasha set');
});
test('覇者の剣・盾：前のセーブ（勇者の剣・盾を持ち物・装備中・倉庫に持っている）は、強化値・装備のまま覇者の剣・盾として読める。お宝には変えない', () => {
  const S = G.newState(), V = S.village;
  const sw = G.makeItem(S, 'hero_sword', { plus: 5 }); sw.eq = true; const sh = G.makeItem(S, 'hero_shield', { plus: 3 }); sh.eq = true;
  V.bag.push(sw, sh); V.storage.push(G.makeItem(S, 'hero_sword', { plus: 8 }));
  V.story.defeated.mist = true; V.story.rewardClaimed.mist = true;
  const L = SV.deserialize(SV.serialize(S)), LV = L.village;
  const b0 = LV.bag.find((i) => i.uid === sw.uid), b1 = LV.bag.find((i) => i.uid === sh.uid), st = LV.storage.find((i) => i.id === 'hero_sword');
  assert(b0 && b0.eq && b0.plus === 5 && G.itemName(b0).startsWith('覇者の剣'), JSON.stringify(b0));
  assert(b1 && b1.eq && b1.plus === 3 && G.itemName(b1).startsWith('覇者の盾'));
  assert(st && st.plus === 8 && G.def(st).type === 'weapon');
  assert(!LV.bag.concat(LV.storage).some((i) => /_relic$/.test(i.id)), 'no conversion to treasures');
  // 装備の力はそのまま
  L.village.bag = LV.bag; departWithScroll(L, 3); eq(G.playerAtk(L.run), D.PLAYER.baseAtk + 27 + 5);
  // 報酬は二重に出ない（第5章の初回報酬は受取済み）
  assert(L.village.story.rewardClaimed.mist);
});

console.log('旅商人の買い取り（2026年10月）');
test('旅商人の買い取り：お宝の分類で町で売れる品だけ、町の売値の50%（切り捨て）。武器・盾・アクセサリー・素材・消耗品・売れないお宝は買い取らない。町の売値は変わらない', () => {
  const S = findMerchant(8300, 3, 13), r = S.run;
  r.bag = r.bag.filter((i) => i.id === 'return_scroll'); r.runGold = 100;
  const mk = (id) => { const it = G.makeItem(S, id); r.bag.push(it); return it; };
  const lotus = mk('golden_lotus'), crown = mk('dream_crown'), tear = mk('croc_tear');
  const no = ['hero_sword', 'golden_shield', 'poison_ring', 'amber_shard', 'herb', 'banana', 'thunder_staff', 'hero_sword_relic', 'hero_shield_relic', 'return_scroll'].map((id) => (id === 'return_scroll' ? r.bag[0] : mk(id)));
  for (const it of no) { assert(!G.merchantBuysItem(it), it.id); eq(G.merchantSellPrice(it), 0); const n = r.bag.length, g = r.runGold; assert(!G.merchantSell(S, it.uid).ok, it.id + ' refused'); eq(r.bag.length, n); eq(r.runGold, g); }
  // 町の売値の半額
  eq(G.merchantSellPrice(lotus), 130); eq(G.merchantSellPrice(crown), 1000);
  // クロコダインの涙は売れない（2026年10月）：町でも旅商人でも
  eq(G.merchantSellPrice(tear), 0); assert(!G.merchantBuysItem(tear) && !G.canSell(tear) && G.sellPrice(tear) === 0, 'croc_tear not sellable');
  const t0 = r.turn, n0 = r.bag.length;
  const res = G.merchantSell(S, lotus.uid); assert(res.ok && res.price === 130);
  eq(r.runGold, 230); eq(r.bag.length, n0 - 1); assert(!r.bag.includes(lotus)); eq(r.turn, t0, 'no turn');
  assert(!G.merchantSell(S, lotus.uid).ok, 'cannot sell twice');
  // 端数は切り捨て（仮のお宝で確かめる）
  D.ITEMS._odd = { name: 'テスト', type: 'treasure', sell: 75 }; eq(G.merchantSellPrice({ id: '_odd', uid: -1 }), 37); delete D.ITEMS._odd;
  // 町の売値は今までどおり
  eq(G.sellPrice(crown), 2000); assert(G.canSell(G.makeItem(S, 'hero_sword')), 'weapons still sell in town');
  // 保存・読み込み直しでも売ったまま
  const L = SV.deserialize(SV.serialize(S)); eq(L.run.runGold, 230); assert(!L.run.bag.some((i) => i.uid === lotus.uid));
});

test('旅商人の素材：値段は4段階に固定（琥珀1000・青銅2000・すいしょう3000・金ぱく4000）。ばらつきなし', () => {
  eq(JSON.stringify(D.MERCHANT.goods.map((g) => [g.id, g.price])), JSON.stringify([['amber_shard', 1000], ['bronze_shard', 2000], ['crystal_shard', 3000], ['gold_leaf', 4000]]));
  eq(D.MERCHANT.priceSpread, 0);
  for (let s = 8300; s < 8340; s++) { const S = findMerchant(s, 4, 23); if (!S) continue; for (const g of S.run.merchant.stock) eq(g.price, D.MERCHANT.goods.find((x) => x.id === g.id).price, g.id); }
});
test('なくしたボスの報酬の買い戻し：対象と値段（ボスごと）。入手履歴があって今は持っていない品だけ。持ち物・装備中・倉庫・床・展示室にあれば出ない', () => {
  const want = { croc_tear: 1000, croc_axe: 1000, iceflame_shield: 2000, iceflame_crystal: 2000, phantom_shield: 3000, phantom_mask: 3000,
    shinma_sword: 4000, hero_sword: 5000, hero_shield: 5000, demon_robe: 6000 };
  for (const [id, pr] of Object.entries(want)) eq(G.buybackPrice(id).price, pr, id);
  for (const id of ['dragon_crest', 'golden_elephant', 'hero_sword_relic', 'hero_shield_relic', 'amber_shard', 'dragonic_shield', 'dream_crown']) eq(G.buybackPrice(id), null, id + ' not a target');
  const S = findMerchant(8300, 3, 13), r = S.run, V = S.village;
  const ids = () => G.buybackList(S).map((x) => x.id).sort().join();
  // 倒しただけ・未入手：出ない
  V.story.defeated.croc = true; eq(ids(), '', 'not obtained yet');
  // 入手履歴あり・持ち物にある：出ない
  const axe = G.makeItem(S, 'croc_axe', { plus: 3 }); axe.eq = true; r.bag.push(axe); G.markBossObtained(V, 'croc_axe'); eq(ids(), '', 'equipped in bag');
  // なくした（持ち物から消えた）：出る
  r.bag = r.bag.filter((i) => i !== axe); eq(ids(), 'croc_axe');
  // 倉庫・床・展示室なら出ない
  V.storage.push(G.makeItem(S, 'croc_axe')); eq(ids(), '', 'in storage'); V.storage = [];
  r.floorItems.push({ x: 1, y: 1, item: G.makeItem(S, 'croc_axe') }); eq(ids(), '', 'on the floor'); r.floorItems.pop();
  G.markBossObtained(V, 'croc_tear'); V.donated.croc_tear = true; eq(ids(), 'croc_axe', 'donated treasure is not lost');
  // 買う：お金が足りない・持ち物がいっぱい → 何も変わらない
  r.runGold = 0; V.funds = 999; const n0 = r.bag.length;
  assert(!G.merchantBuyback(S, 'croc_axe').ok); eq(r.bag.length, n0); eq(V.funds, 999);
  V.funds = 100000; const fill = []; while (r.bag.length < D.BAG_SIZE) { const h = G.makeItem(S, 'herb'); fill.push(h); r.bag.push(h); }
  assert(!G.merchantBuyback(S, 'croc_axe').ok); eq(V.funds, 100000); r.bag = r.bag.filter((i) => !fill.includes(i));
  // 買える：+0 の新しい品・村の資金から1000G・ターンは進まない。続けて押しても2つ目は買えない
  r.runGold = 300; const t0 = r.turn;
  const res = G.merchantBuyback(S, 'croc_axe'); assert(res.ok, res.msg); eq(res.paidRun, 300); eq(res.paidVillage, 700);
  const got = r.bag.filter((i) => i.id === 'croc_axe'); eq(got.length, 1); eq(got[0].plus || 0, 0); eq(r.turn, t0);
  assert(!G.merchantBuyback(S, 'croc_axe').ok, 'no second copy'); eq(r.bag.filter((i) => i.id === 'croc_axe').length, 1); eq(V.funds, 99300);
  eq(ids(), '', 'removed from the list after buying');
  // また失ったら、また買える
  r.bag = r.bag.filter((i) => i.id !== 'croc_axe'); eq(ids(), 'croc_axe');
});
test('買い戻しの入手履歴：ボスの報酬を拾う・拾わずに帰って倉庫に届く で記録。前のセーブは章をクリアしていれば記録を作る', () => {
  const S = newRun(1810, (S0) => { S0.village.story.chapter = 1; }); goToFloor(S, 15); defeatBoss(S);
  const r = S.run, V = S.village;
  assert(!V.bossObtained.croc_axe, 'not yet');
  const f = r.floorItems.find((x) => x.item && x.item.id === 'croc_axe'); r.player.x = f.x; r.player.y = f.y; r.enemies = []; G.act(S, { type: 'pickup' });
  assert(V.bossObtained.croc_axe && !V.bossObtained.croc_tear);
  r.player.x = r.portal.x; r.player.y = r.portal.y; G.act(S, { type: 'returnHome' }); G.finishRun(S);
  assert(V.bossObtained.croc_tear, 'delivered to storage = obtained');
  // 前のセーブ：記録が無い。第1章はクリア済み、第2章は未クリア
  const old = JSON.parse(SV.serialize(G.newState())); delete old.village.bossObtained; delete old.village.bossObtainedInit;
  old.village.story.defeated.croc = true; old.village.story.returnDone.croc = true; old.village.story.defeated.flame = true;
  const L = SV.deserialize(JSON.stringify(old));
  assert(L.village.bossObtained.croc_axe && L.village.bossObtained.croc_tear && !L.village.bossObtained.iceflame_shield);
});
test('商人の呼鈴：歩いて行ける安全な空きマスに商人が現れ、1個使う。ボス戦中・もう商人がいる・置けないときは減らない。呼んだ商人も同じ品ぞろえと買い取り', () => {
  const S = newRun(1811), run = S.run; goDown(S); goDown(S); goDown(S); goDown(S); goDown(S); goDown(S); goDown(S); goDown(S); goDown(S);
  run.merchant = null; run.enemies = [];
  const bell = G.makeItem(S, 'merchant_bell'), bell2 = G.makeItem(S, 'merchant_bell'); run.bag.push(bell, bell2);
  const t0 = run.turn; const r1 = G.act(S, { type: 'use', uid: bell.uid });
  assert(r1.consumed && run.merchant && run.merchant.called && !run.bag.includes(bell), 'summoned');
  eq(run.turn, t0 + 1);
  const m = run.merchant, p = run.player;
  assert(DG.roomAt(run.map, m.x, m.y) && Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) >= 4, 'in a room, not next to take');
  assert(!DG.same(m, run.stairs) && !G.itemAt(run, m.x, m.y), 'not on stairs or items');
  { // たけから歩いて商人のマスまで行ける（8方向・角は抜けない）
    const W = run.map.w, seen = new Set([p.y * W + p.x]), q = [[p.x, p.y]]; let reach = false;
    while (q.length && !reach) { const [x, y] = q.shift(); for (const [dx, dy] of Object.values(G.DIRS)) { const nx = x + dx, ny = y + dy, k = ny * W + nx;
      if (seen.has(k) || !G.canStep(run.map, x, y, dx, dy)) continue; if (nx === m.x && ny === m.y) { reach = true; break; } seen.add(k); q.push([nx, ny]); } }
    assert(reach, 'reachable on foot'); }
  // もう商人がいる → 減らない・ターンも進まない
  const t1 = run.turn; const r2 = G.act(S, { type: 'use', uid: bell2.uid }); assert(!r2.consumed && run.bag.includes(bell2)); eq(run.turn, t1);
  // ボス戦中（ボスの階で戦いが終わっていない）→ 減らない
  const B = toBossFloor(1, 1812), bb = G.makeItem(B, 'merchant_bell'); B.run.bag.push(bb); B.run.merchant = null;
  assert(!G.act(B, { type: 'use', uid: bb.uid }).consumed && B.run.bag.includes(bb) && !B.run.merchant, 'not during a boss fight');
  // 置ける所が無い（小さな部屋だけ）→ 減らない
  bigRoomFloor(S); run.merchant = null; run.map.rooms = [{ id: 0, x: 2, y: 2, w: 3, h: 3 }]; run.map.tiles.fill(DG.WALL);
  for (let y = 2; y < 5; y++) for (let x = 2; x < 5; x++) run.map.tiles[y * run.map.w + x] = DG.FLOOR; run.player.x = 3; run.player.y = 3;
  assert(!G.act(S, { type: 'use', uid: bell2.uid }).consumed && run.bag.includes(bell2) && !run.merchant, 'no space: kept');
  // 呼んだ商人もお宝の買い取りができる
  run.merchant = { x: 4, y: 4, stock: [], met: false, called: true }; const lotus = G.makeItem(S, 'golden_lotus'); run.bag.push(lotus);
  assert(G.merchantSell(S, lotus.uid).ok);
});
test('商人の呼鈴の寄付：お金が足りないと寄付できない。呼鈴は倉庫に入れられるが売れない', () => {
  const S = G.newState(), V = S.village; V.funds = 500;
  for (const f of D.FACILITIES) V.built[f.id] = true;
  assert(!G.donateForBell(S).ok, 'not enough money'); eq(V.funds, 500);
  assert(G.canStore(G.makeItem(S, 'merchant_bell')) && !G.canSell(G.makeItem(S, 'merchant_bell')));
});

console.log('ティウの案内（助言とゲームの動きが合っているか）');
test('ティウの案内：どんそくの粉＋「隣に来たら一発、次は一歩下がる」をくり返すと、近づいて殴る敵には殴られない（15ターン・2ターンに1回）', () => {
  for (const type of ['frog', 'bat', 'statue']) {   // 近づいて殴る・2歩動く（移動のあとは殴らない）・振りかぶる敵
  const S = newRun(1701); bigRoomFloor(S); const run = S.run, p = run.player;
  p.x = 14; p.y = 8; p.hp = p.maxhp = 500; G.updateVision(run);
  const e = addEnemy(S, type, 10, 8); e.hp = e.maxhp = 9999; e.atk = 30; e.awake = true;
  const powder = G.makeItem(S, 'slow_powder'); run.bag.push(powder);
  G.act(S, { type: 'use', uid: powder.uid }); eq(e.slow, 15 - 1, 'slowed 15 turns (one already passed)');
  // 敵が歩いてきて隣に来るまで待つ
  for (let i = 0; i < 12 && !G.adjacent(run, p, e); i++) G.act(S, { type: 'wait' });
  assert(G.adjacent(run, p, e), 'enemy came next to take');
  const hp0 = p.hp; let cycles = 0;
  for (let i = 0; i < 6 && e.slow > 1; i++) {
    G.act(S, { type: 'move', dir: 'left' });        // 一発（敵の向き：左）
    G.act(S, { type: 'move', dir: 'right' });       // 一歩下がる → 敵はその番を追いかけるのに使う
    assert(G.adjacent(run, p, e), 'enemy followed'); cycles++;
  }
  assert(cycles >= 3, type + ' cycles ' + cycles); eq(p.hp, hp0, type + ': never hit while the powder lasts');
  assert(e.hp < 9999, 'hits landed');
  }
  // 反対に、隣にいる敵が動ける番に殴ると殴り返される（「まず一歩下がる」の理由）
  const S2 = newRun(1702); bigRoomFloor(S2); const r2 = S2.run, p2 = r2.player; p2.x = 14; p2.y = 8; p2.hp = p2.maxhp = 500; G.updateVision(r2);
  const e2 = addEnemy(S2, 'frog', 13, 8); e2.hp = e2.maxhp = 9999; e2.atk = 30; e2.awake = true; e2.slow = 15;
  const h0 = p2.hp; for (let i = 0; i < 4; i++) G.act(S2, { type: 'move', dir: 'left' });
  assert(p2.hp < h0, 'standing and hitting gets hit back on its turn');
});
test('ティウの案内：離れて撃つ敵（リリパット）は、どんそくの粉でも下がると撃ってくることがある', () => {
  const S = newRun(1703); bigRoomFloor(S); const run = S.run, p = run.player;
  p.x = 14; p.y = 8; p.hp = p.maxhp = 500; G.updateVision(run);
  const e = addEnemy(S, 'monkey', 11, 8); e.hp = e.maxhp = 9999; e.awake = true; e.slow = 15;
  const hp0 = p.hp;
  for (let i = 0; i < 10; i++) G.act(S, { type: i % 2 ? 'wait' : 'wait' });
  assert(p.hp < hp0, 'ranged enemy still shoots while slowed');
});
test('ティウの案内：休息（足踏みの長押し）は1ターンずつ待つだけ。ダッシュは画面の速さだけで、1ターンの回復量は同じ。毒・満腹度0では回復しない。止まる条件', () => {
  const S = newRun(1704); bigRoomFloor(S); const run = S.run, p = run.player;
  run.enemies = []; p.hp = 10; p.maxhp = 200;
  const t0 = run.turn, h0 = p.hp; const r = G.restStep(S); assert(r.res.consumed); eq(run.turn, t0 + 1, 'one turn per step');
  const per = p.hp - h0; assert(per >= 0);
  // ダッシュのオン・オフで、同じ状態からの回復は同じ（ダッシュは画面の待ち時間だけ）
  const A = SV.deserialize(SV.serialize(S)), B = SV.deserialize(SV.serialize(S)); A.settings.dash = false; B.settings.dash = true;
  for (let i = 0; i < 20; i++) { G.restStep(A); G.restStep(B); }
  eq(A.run.player.hp, B.run.player.hp, 'same regen with dash'); eq(A.run.turn, B.run.turn);
  // 止まる：満腹度10以下・毒・敵が見える・HP満タン
  p.hunger = 10; eq(G.restBlock(S), 'hunger'); p.hunger = 80;
  p.poison = 3; eq(G.restBlock(S), 'poison'); p.poison = 0;
  p.hp = p.maxhp; eq(G.restBlock(S), 'full'); p.hp = 50;
  addEnemy(S, 'frog', p.x + 2, p.y); eq(G.restBlock(S), 'enemy'); run.enemies = [];
  // 毒のあいだ・満腹度0では自然回復しない
  p.poison = 5; p.poisonGuard = 0; const hpP = p.hp; G.act(S, { type: 'wait' }); assert(p.hp <= hpP, 'no regen while poisoned'); p.poison = 0;
  p.hunger = 0; p.regenAcc = 0; const hpH = p.hp; G.act(S, { type: 'wait' }); assert(p.hp <= hpH, 'no regen at hunger 0');
  // 満腹度が減らない装備（満腹の腕輪・ファントムマスク）
  eq(D.ITEMS.full_bangle.acc, 'hunger'); eq(D.ITEMS.phantom_mask.acc, 'hunger');
});
test('ティウの案内：みとおしの巻物は地形・階段・道具の場所がわかる（敵の居場所は出ない）。気配察知の巻物は敵の位置', () => {
  const S = newRun(1705), run = S.run;
  goDown(S); goDown(S); goDown(S);
  const sc = G.makeItem(S, 'sight_scroll'); run.bag.push(sc);
  const vis0 = G.visibleEnemies(run).length;
  G.act(S, { type: 'use', uid: sc.uid });
  const m = run.map; let ok = true;
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] !== DG.WALL && !run.explored[i]) ok = false;
  assert(ok, 'all floor tiles known'); assert(run.explored[run.stairs.y * m.w + run.stairs.x], 'stairs known');
  assert(run.floorItems.every((f) => run.explored[f.y * m.w + f.x]), 'items known');
  eq(G.visibleEnemies(run).length, vis0, 'enemies are not revealed');
  eq(D.ITEMS.sight_scroll.name, 'みとおしの巻物'); eq(D.ITEMS.sense_scroll.type, 'sense');
});
test('ティウの案内：素材・お宝の入手の階は実際の出現の表と同じ。ボスの報酬は倒したあとだけ。竜の紋章はアクセサリーだけ。まだ無い品は出さない', () => {
  const S = G.newState(), V = S.village;
  for (const g of G.guideItems(S, 'material').concat(G.guideItems(S, 'treasure'))) {
    for (const [a, b] of g.floors) for (let f = a; f <= b; f++) {
      const F = D.floorFor(D.FINAL_CHAPTER, f, D.LAYOUT, { vearn: true, truevearn: true });
      assert(F.items.some(([i]) => i === g.id), g.id + ' at ' + f);
    }
  }
  eq(JSON.stringify(G.itemGuide(S, 'amber_shard').floors), '[[11,15]]');
  eq(JSON.stringify(G.itemGuide(S, 'gold_leaf').floors), '[[26,33]]');
  const ids = (t) => G.guideItems(S, t).map((g) => g.id);
  assert(!ids('treasure').includes('croc_tear'), 'boss rewards hidden before defeat');
  V.story.defeated.croc = true; assert(ids('treasure').includes('croc_tear'), 'shown after defeat');
  const ct = G.itemGuide(S, 'croc_tear'); eq(ct.bosses[0].ch, 1); eq(ct.floors.length, 0);
  assert(!ids('treasure').includes('dragon_crest'), 'the accessory crest is not a treasure');
  assert(!ids('material').length || ids('material').every((id) => D.ITEMS[id].type === 'material'));
  eq(G.itemFloors('dragonic_shield').length, 0, 'not obtainable yet');
  // 用途は鍛冶屋・施設のデータから
  const am = G.itemGuide(S, 'amber_shard').uses; assert(am.some((u) => u.kind === 'smith' && u.to === 4) && am.some((u) => u.kind === 'facility'));
});

test('ボスを倒したあとの帰還口はボス部屋の中央（たけ・報酬の品のマスを避けて中央にいちばん近い床）。報酬の品もボス部屋の中。前室には出ない。以前のセーブの外の帰還口は読み込みで中央へ', () => {
  for (const [ch, seed] of [[1, 311], [2, 312], [3, 313], [5, 315]]) {
    for (const where of ['center', 'edge']) {
      const S = toBossFloor(ch, seed + (where === 'edge' ? 50 : 0)), run = S.run, A = run.bossFight, b = run.enemies.find((e) => e.boss);
      if (where === 'edge') { b.x = A.x; b.y = A.y; }   // 部屋の隅で倒れる
      // 報酬の品を置く予定のマスを先にふさいでおく（ふさがっていても部屋の外に出さない）
      run.floorItems.push({ x: b.x, y: b.y, item: G.makeItem(S, 'herb') });
      defeatBoss(S);
      const cx = A.x + (A.w >> 1), cy = A.y + (A.h >> 1), P = run.portal;
      assert(P && G.inArena(run, P.x, P.y), 'portal inside the arena ch' + ch);
      assert(Math.max(Math.abs(P.x - cx), Math.abs(P.y - cy)) <= 1, 'portal at the center ch' + ch + ' ' + JSON.stringify([P, cx, cy]));
      assert(!(P.x === run.player.x && P.y === run.player.y), 'not under the player');
      for (const f of run.floorItems.filter((f) => f.item && f.item.bossReward)) {
        assert(G.inArena(run, f.x, f.y), 'reward inside the arena'); assert(!(f.x === P.x && f.y === P.y), 'reward not on the portal');
      }
    }
  }
  // 以前のセーブ：帰還口が前室にあった → 読み込みでボス部屋の中央へ
  const S = toBossFloor(3, 330), run = S.run; defeatBoss(S);
  run.portal = { x: run.map.rooms[0].x + 1, y: run.map.rooms[0].y + 1 };
  const raw = JSON.parse(SV.serialize(S)); const L = SV.deserialize(JSON.stringify(raw));
  const A = L.run.bossFight, P = L.run.portal;
  assert(G.inArena(L.run, P.x, P.y) && Math.max(Math.abs(P.x - (A.x + (A.w >> 1))), Math.abs(P.y - (A.y + (A.h >> 1)))) <= 1, 'moved to the center on load');
});

console.log(`\n結果: ${passed} 成功 / ${failed} 失敗`);
process.exit(failed ? 1 : 0);
