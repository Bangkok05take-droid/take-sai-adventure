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
  b.hp = 1; b.sleep = 99;
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
  if (D.FLOORS[run.floor].boss && run.enemies.some((e) => e.boss)) defeatBoss(S);
  run.player.x = run.stairs.x; run.player.y = run.stairs.y;
  G.act(S, { type: 'descend' });
}
function goToFloor(S, f) { while (S.run.floor < f) goDown(S); }

console.log('ダンジョン生成');
test('多数のシードで30階すべて：入口から階段・帰還の碑・全道具・全敵に到達でき、不正配置がない', () => {
  let checked = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const S = newRun(seed);
    for (let f = 1; f <= D.MAX_FLOOR; f++) {
      if (f > 1) goDown(S);
      const run = S.run, m = run.map, p = run.player;
      eq(run.floor, f);
      eq(run.map.w, D.MAP.w);
      const dist = DG.distances(m, p.x, p.y);
      const reach = (o) => dist[o.y * m.w + o.x] >= 0;
      assert(DG.passable(m, p.x, p.y), 'player on wall');
      const boss = D.FLOORS[f].boss;
      if (!boss) { assert(run.stairs && reach(run.stairs), `stairs unreachable seed${seed} f${f}`); assert(!DG.same(run.stairs, p), 'stairs on start'); }
      else { assert(!run.stairs, 'no stairs before boss'); assert(run.enemies.some((e) => e.boss && e.type === boss), 'boss exists'); }
      if (D.RETURN_POINT_FLOORS.includes(f)) { assert(run.returnPoint && reach(run.returnPoint), 'return point'); assert(!DG.same(run.returnPoint, run.stairs)); }
      eq(D.RETURN_POINT_FLOORS.includes(f), f % 3 === 0 && f < 30, 'return every 3 floors');
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
        if (f < D.MAX_FLOOR) { assert(run.stairs && reach(run.stairs), 'stairs after midboss'); assert(!DG.same(run.stairs, run.portal)); }
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
test('ダッシュ：敵が見えたら止まる／押した先の敵には自動攻撃しない', () => {
  const S = newRun(61); bigRoomFloor(S);
  const e = addEnemy(S, 'frog', 15, 12);
  let out = G.dashStep(S, 'right');
  eq(out.stop, 'enemy'); eq(S.run.player.x, 6);
  e.x = 7; e.y = 5; G.updateVision(S.run);
  const t = S.run.turn;
  out = G.dashStep(S, 'right');
  eq(out.stop, 'attackBlocked'); eq(e.hp, 999); eq(S.run.turn, t, 'no turn');
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
test('ダッシュ：被ダメージ・HP危険域・満腹度危険域で止まる', () => {
  const S = newRun(64); bigRoomFloor(S);
  const p = S.run.player;
  p.hunger = 0; p.starveAcc = 1; p.hp = 25;
  let out = G.dashStep(S, 'right'); eq(out.stop, 'damage');
  p.hunger = 50; p.hp = 5;
  out = G.dashStep(S, 'right'); eq(out.stop, 'danger');
  p.hp = p.maxhp; p.hunger = 8;
  out = G.dashStep(S, 'right'); eq(out.stop, 'danger');
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
test('ボス：一定間隔で予告つきの大技、その後2ターンの隙。大ナマズ王は仲間を呼ぶ（上限あり）', () => {
  const S = newRun(79); goToFloor(S, 20);
  const run = S.run, b = run.enemies.find((e) => e.boss);
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
test('帰還の碑（3階）から帰れる', () => {
  const S = newRun(22);
  for (let f = 1; f < 3; f++) { const p = S.run.player; p.x = S.run.stairs.x; p.y = S.run.stairs.y; G.act(S, { type: 'descend' }); }
  eq(S.run.floor, 3);
  S.run.player.x = S.run.returnPoint.x; S.run.player.y = S.run.returnPoint.y;
  G.act(S, { type: 'returnHome' });
  assert(S.run.over); eq(S.run.result.type, 'return');
  G.finishRun(S); eq(S.village.returns, 1); eq(S.village.bestFloor, 3);
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
test('無料の貸出品・帰還の巻物では資金を増やせない', () => {
  const S = G.newState();
  assert(G.takeLoan(S, 'weapon').ok); assert(G.takeLoan(S, 'food').ok);
  assert(!G.takeLoan(S, 'weapon').ok, 'no double weapon'); assert(!G.takeLoan(S, 'food').ok, 'no double food');
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
  eq(S.village.bag.filter((x) => x.id === 'wood_sword').length, 1);
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
  G.takeLoan(S, 'weapon'); G.depart(S, 3);
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
test('10階・20階の中ボスを倒すとお宝・下への階段・帰還口が出る', () => {
  const S = newRun(40);
  goToFloor(S, 10);
  eq(S.run.floor, 10); eq(D.THEMES[D.FLOORS[10].theme].name, '守護獅子の間');
  defeatBoss(S);
  assert(S.run.floorItems.some((f) => f.item && f.item.id === 'guardian_gem'), 'gem');
  assert(S.run.stairs && S.run.portal);
  eq(S.village.bossKills[10], 1);
  goToFloor(S, 20);
  eq(S.run.enemies.find((e) => e.boss).type, 'catfish');
  defeatBoss(S);
  assert(S.run.floorItems.some((f) => f.item && f.item.id === 'river_pearl'), 'pearl');
  // 帰還口から帰る
  S.run.player.x = S.run.portal.x; S.run.player.y = S.run.portal.y;
  G.act(S, { type: 'returnHome' });
  const res = G.finishRun(S);
  eq(res.type, 'return'); assert(!res.orb); eq(S.village.cleared, false);
});
test('30階で最終ボスを倒し、宝珠を拾って帰還口から帰ると初回クリア。2回目以降は宝冠', () => {
  const S = newRun(41);
  goToFloor(S, 30);
  const run = S.run;
  eq(run.enemies.find((e) => e.boss).type, 'elephant');
  defeatBoss(S);
  assert(!run.stairs, 'no stairs at 30');
  const orb = run.floorItems.find((f) => f.item && f.item.id === 'wish_orb'); assert(orb, 'orb dropped');
  run.player.x = orb.x; run.player.y = orb.y; G.act(S, { type: 'pickup' });
  run.player.x = run.portal.x; run.player.y = run.portal.y;
  G.act(S, { type: 'returnHome' });
  const res = G.finishRun(S);
  assert(res.orb && res.firstClear, 'first clear'); assert(S.village.cleared); eq(S.village.clears, 1); eq(S.village.bestFloor, 30);
  assert(!S.village.bag.some((i) => i.id === 'wish_orb'), 'orb placed in village');
  G.depart(S, 42); goToFloor(S, 30); defeatBoss(S);
  assert(S.run.floorItems.some((f) => f.item && f.item.id === 'dream_crown'), 'crown on repeat');
  assert(!S.run.floorItems.some((f) => f.item && f.item.id === 'wish_orb'), 'no second orb');
});
test('帰還して再出発すると1階から', () => {
  const S = newRun(43); goToFloor(S, 12);
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

console.log('（参考）自動プレイによるバランス確認');
test('簡易AIで初回装備のまま遊んだ結果（参考値）', () => {
  const N = 40; let best = [], clears = 0, turns = [];
  for (let s = 0; s < N; s++) {
    const S = G.newState();
    G.takeLoan(S, 'weapon'); G.takeLoan(S, 'food');
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
    if (run.floor === 10) {
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

console.log(`\n結果: ${passed} 成功 / ${failed} 失敗`);
process.exit(failed ? 1 : 0);
