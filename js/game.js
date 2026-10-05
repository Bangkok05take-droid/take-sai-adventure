/* ゲームの処理（表示とは独立。Node.js のテストからも読み込める）
 * 状態 S = { version, village, run, settings } を受け取り、変更する。 */
(function (TS) {
  'use strict';
  const D = TS.Data, R = TS.RNG, DG = TS.Dungeon;
  const G = {};
  // 8方向（斜めは「左上」などと表記）
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    upleft: [-1, -1], upright: [1, -1], downleft: [-1, 1], downright: [1, 1] };
  const DIRS4 = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  G.DIRS = DIRS;
  G.DIR_NAMES = { up: '上', down: '下', left: '左', right: '右', upleft: '左上', upright: '右上', downleft: '左下', downright: '右下' };
  // 絵の向き（斜めは左右の絵を使う）
  G.faceOf = (dir) => (dir.includes('left') ? 'left' : dir.includes('right') ? 'right' : dir);
  G.dirOf = function (dx, dy) {
    dx = Math.sign(dx); dy = Math.sign(dy);
    for (const [k, v] of Object.entries(DIRS)) if (v[0] === dx && v[1] === dy) return k;
    return null;
  };
  /* 地形として (x,y) から (dx,dy) へ1歩進めるか。
   * 斜めは、隣接する縦・横の両方のマスが通行可能なときだけ（壁の角をすり抜けない）。 */
  G.canStep = function (map, x, y, dx, dy) {
    if (!DG.passable(map, x + dx, y + dy)) return false;
    if (dx !== 0 && dy !== 0) return DG.passable(map, x + dx, y) && DG.passable(map, x, y + dy);
    return true;
  };

  // ---------- 生成 ----------
  G.newVillage = function () {
    return {
      funds: D.START_FUNDS, stage: 1, bag: [], storage: [], nextUid: 1,
      cleared: false, clears: 0, runs: 0, returns: 0, defeats: 0, bestFloor: 0,
      legacyClear10: false, bossKills: {}, materials: {},
      lastResult: null, seenIntro: false, seenEnding: false,
    };
  };
  G.newState = function () {
    return { version: D.SAVE_VERSION, village: G.newVillage(), run: null, settings: { sound: true, minimap: 1 } };
  };

  G.makeItem = function (S, id, extra) {
    const def = D.ITEMS[id];
    if (!def) throw new Error('unknown item ' + id);
    const it = { uid: S.village.nextUid++, id, plus: 0 };
    if (def.type === 'staff') it.charges = 4;
    return Object.assign(it, extra || {});
  };
  G.def = (it) => D.ITEMS[it.id];
  G.itemName = function (it) {
    const d = G.def(it);
    let n = d.name;
    if (it.plus) n += '+' + it.plus;
    if (d.type === 'staff') n += '[' + (it.charges || 0) + ']';
    return n;
  };
  G.sellPrice = function (it) {
    const d = G.def(it);
    if (d.noSell || d.loan) return 0;
    if (d.type === 'staff' && !it.charges) return Math.floor(d.sell / 3);
    return d.sell + (it.plus || 0) * D.SMITH.sellPerPlus;
  };
  G.canSell = (it) => !G.def(it).noSell && !G.def(it).loan && G.sellPrice(it) > 0;
  G.canStore = (it) => !G.def(it).noStore && !G.def(it).loan;

  // ---------- プレイヤー能力 ----------
  G.maxHpFor = (lvl) => D.PLAYER.baseHp + D.PLAYER.hpPerLevel * (lvl - 1);
  G.equipped = function (bag, type) {
    return bag.find((it) => it.eq && G.def(it).type === type) || null;
  };
  G.playerAtk = function (run) {
    const w = G.equipped(run.bag, 'weapon');
    return D.PLAYER.baseAtk + D.PLAYER.atkPerLevel * (run.player.lvl - 1) + (w ? G.def(w).atk + (w.plus || 0) : 0);
  };
  G.playerDef = function (run) {
    const s = G.equipped(run.bag, 'shield');
    return s ? G.def(s).def + (s.plus || 0) : 0;
  };

  // ---------- 探索の開始 ----------
  G.canDepart = function (S) {
    if (S.run) return { ok: false, msg: '探索中です。' };
    if (S.village.bag.length >= D.BAG_SIZE) return { ok: false, msg: '帰還の巻物を入れるため、バッグに1枠空けてください。' };
    return { ok: true };
  };

  G.depart = function (S, seed) {
    const chk = G.canDepart(S);
    if (!chk.ok) return chk;
    const V = S.village;
    V.runs++;
    if (seed === undefined) seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
    const bag = V.bag;
    V.bag = [];
    // 帰還の巻物は出発ごとに1枚だけ（古いものは持ち込めない仕組み：帰還・敗北で必ず消える）
    bag.push(G.makeItem(S, 'return_scroll'));
    S.run = {
      seed, rng: R.create(seed), floor: 0, turn: 0, runGold: 0, bag,
      player: { x: 0, y: 0, lvl: 1, exp: 0, hp: G.maxHpFor(1), maxhp: G.maxHpFor(1), hunger: D.PLAYER.maxHunger,
        hungerAcc: 0, regenAcc: 0, starveAcc: 0, dir: 'down', lowWarned: false, poison: 0, poisonGuard: 0 },
      enemies: [], floorItems: [], map: null, explored: null, stairs: null, returnPoint: null, portal: null,
      log: [], over: false, result: null, nextEnemyId: 1, killedBy: null, revealed: false,
    };
    G.log(S.run, 'たけは遺跡へ出発した！');
    enterFloor(S, 1);
    return { ok: true };
  };

  G.log = function (run, msg) {
    run.log.push(msg);
    if (run.log.length > 40) run.log.splice(0, run.log.length - 40);
  };

  function enterFloor(S, floor) {
    const run = S.run, rng = run.rng;
    run.floor = floor;
    S.village.bestFloor = Math.max(S.village.bestFloor, floor);
    const gen = DG.generate(floor, rng);
    run.map = gen.map;
    run.stairs = gen.stairs;
    run.returnPoint = gen.returnPoint;
    run.portal = null;
    run.revealed = false;
    run.enemies = [];
    run.floorItems = [];
    run.explored = new Array(run.map.w * run.map.h).fill(0);
    const p = run.player;
    p.x = gen.start.x; p.y = gen.start.y;
    const F = D.FLOORS[floor];
    const occupied = [gen.start];
    if (gen.stairs) occupied.push(gen.stairs);
    if (gen.returnPoint) occupied.push(gen.returnPoint);

    // 道具
    const nItems = R.int(rng, F.itemCount[0], F.itemCount[1]);
    for (let i = 0; i < nItems; i++) {
      const room = F.boss ? run.map.rooms[0] : null;
      const pos = DG.freeTile(run.map, rng, occupied, room);
      if (!pos) break;
      occupied.push(pos);
      const id = R.weighted(rng, F.items);
      run.floorItems.push({ x: pos.x, y: pos.y, item: G.makeItem(S, id, id === 'thunder_staff' ? { charges: R.int(rng, 3, 5) } : null) });
    }
    const nGold = R.int(rng, F.goldCount[0], F.goldCount[1]);
    for (let i = 0; i < nGold; i++) {
      const pos = DG.freeTile(run.map, rng, occupied);
      if (!pos) break;
      occupied.push(pos);
      run.floorItems.push({ x: pos.x, y: pos.y, gold: D.goldAmount(floor, R.next(rng)) });
    }
    // 敵（最初はプレイヤーと同じ部屋には置かない）
    const nEnemies = R.int(rng, F.enemyCount[0], F.enemyCount[1]);
    const otherRooms = run.map.rooms.filter((r) => r.id !== gen.startRoom);
    for (let i = 0; i < nEnemies; i++) {
      const pos = DG.freeTile(run.map, rng, occupied, R.pick(rng, otherRooms));
      if (!pos || DG.roomAt(run.map, pos.x, pos.y).id === gen.startRoom) continue;
      occupied.push(pos);
      run.enemies.push(makeEnemy(run, R.weighted(rng, F.enemies), pos.x, pos.y));
    }
    if (F.boss) {
      const b = makeEnemy(run, F.boss, gen.bossPos.x, gen.bossPos.y);
      b.boss = true;
      run.enemies.push(b);
    }
    G.log(run, '地下' + floor + '階　' + D.THEMES[F.theme].name);
    if (run.returnPoint) G.log(run, 'この階には村へ帰れる「帰還の碑」がある。');
    if (F.boss) G.log(run, '奥から大きな気配がする…。' + D.ENEMIES[F.boss].name + 'が待ち構えている！');
    G.updateVision(run);
  }

  function makeEnemy(run, type, x, y) {
    const E = D.ENEMIES[type], f = run.floor;
    const k = E.noScale ? 0 : Math.max(0, f - 1);
    const hp = Math.round(E.hp * (1 + D.ENEMY_SCALE.hp * k));
    return {
      id: run.nextEnemyId++, type, x, y, hp, maxhp: hp,
      atk: Math.round(E.atk * (1 + D.ENEMY_SCALE.atk * k)),
      def: E.def,
      exp: Math.round(E.exp * (1 + D.ENEMY_SCALE.exp * k)),
      sleep: E.ai === 'dormant' ? 9999 : 0,
      tx: null, ty: null, acts: 0, dir: 'down',
    };
  }

  // ---------- 視界 ----------
  // 部屋の中（入口のマスを含む）なら部屋全体と周囲の壁、通路では周囲1マスが見える。
  G.roomForView = function (run, x, y) {
    const m = run.map;
    let r = DG.roomAt(m, x, y);
    if (r) return r;
    for (const [dx, dy] of Object.values(DIRS4)) {
      r = DG.roomAt(m, x + dx, y + dy);
      if (r) return r;
    }
    return null;
  };
  G.updateVision = function (run) {
    const m = run.map, p = run.player;
    const vis = new Uint8Array(m.w * m.h);
    const mark = (x, y) => { if (x >= 0 && y >= 0 && x < m.w && y < m.h) { vis[y * m.w + x] = 1; run.explored[y * m.w + x] = 1; } };
    const r = G.roomForView(run, p.x, p.y);
    if (r) for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) mark(x, y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(p.x + dx, p.y + dy);
    Object.defineProperty(run, '_vis', { value: vis, enumerable: false, configurable: true, writable: true });
    return vis;
  };
  G.isVisible = function (run, x, y) {
    if (!run._vis) G.updateVision(run);
    return x >= 0 && y >= 0 && x < run.map.w && y < run.map.h && run._vis[y * run.map.w + x] === 1;
  };
  G.visibleEnemies = (run) => run.enemies.filter((e) => G.isVisible(run, e.x, e.y));

  // ---------- 行動 ----------
  G.enemyAt = (run, x, y) => run.enemies.find((e) => e.x === x && e.y === y) || null;
  G.itemAt = (run, x, y) => run.floorItems.find((f) => f.x === x && f.y === y) || null;
  G.onStairs = (run) => !!run.stairs && DG.same(run.stairs, run.player);
  G.onReturnPoint = (run) => !!run.returnPoint && DG.same(run.returnPoint, run.player);
  G.onPortal = (run) => !!run.portal && DG.same(run.portal, run.player);

  /* 1回の入力を処理する。ターンを消費したら敵が1回ずつ行動する。
   * 戻り値 { consumed, events } */
  G.act = function (S, a) {
    const run = S.run;
    const ev = [];
    if (!run || run.over) return { consumed: false, events: ev };
    let consumed = false;
    switch (a.type) {
      case 'move': consumed = doMove(S, a.dir, ev); break;
      case 'wait': consumed = true; ev.push({ t: 'wait' }); break;
      case 'pickup': consumed = pickup(S, ev, true); break;
      case 'use': consumed = useItem(S, a.uid, a.dir, ev); break;
      case 'equip': consumed = toggleEquip(S, a.uid, ev); break;
      case 'drop': consumed = dropItem(S, a.uid, ev); break;
      case 'face': if (DIRS[a.dir]) run.player.dir = a.dir; break;
      case 'descend':
        if (G.onStairs(run)) {
          G.log(run, 'たけは階段を降りた。');
          enterFloor(S, run.floor + 1);
          ev.push({ t: 'stairs' });
        }
        return { consumed: false, events: ev, floorChanged: true };
      case 'returnHome':
        if (G.onReturnPoint(run) || G.onPortal(run)) {
          endRun(S, 'return', G.onPortal(run) ? '帰還口から村へ戻った。' : '帰還の碑から村へ戻った。');
          ev.push({ t: 'return' });
        }
        return { consumed: false, events: ev };
      default: break;
    }
    if (consumed && !run.over) endTurn(S, ev);
    return { consumed, events: ev };
  };

  function doMove(S, dir, ev) {
    const run = S.run, p = run.player;
    const d = DIRS[dir];
    if (!d) return false;
    p.dir = dir;
    const nx = p.x + d[0], ny = p.y + d[1];
    if (!G.canStep(run.map, p.x, p.y, d[0], d[1])) return false; // 壁・角：ターン消費なし
    const e = G.enemyAt(run, nx, ny);
    if (e) { playerAttack(S, e, ev); return true; }
    p.x = nx; p.y = ny;
    ev.push({ t: 'move' });
    G.updateVision(run);
    pickup(S, ev, false);
    if (G.onStairs(run)) ev.push({ t: 'onStairs' });
    if (G.onReturnPoint(run)) ev.push({ t: 'onReturnPoint' });
    if (G.onPortal(run)) ev.push({ t: 'onPortal' });
    return true;
  }

  function pickup(S, ev, explicit) {
    const run = S.run, p = run.player;
    const f = G.itemAt(run, p.x, p.y);
    if (!f) { if (explicit) G.log(run, '足元には何もない。'); return false; }
    if (f.gold) {
      run.runGold += f.gold;
      run.floorItems.splice(run.floorItems.indexOf(f), 1);
      G.log(run, f.gold + 'G 拾った。');
      ev.push({ t: 'gold', x: p.x, y: p.y, n: f.gold });
      return explicit;
    }
    if (run.bag.length >= D.BAG_SIZE) {
      G.log(run, G.itemName(f.item) + 'がある。バッグがいっぱいで拾えない。');
      ev.push({ t: 'bagFull' });
      return false; // 拾えないときはターン消費なし
    }
    run.bag.push(f.item);
    run.floorItems.splice(run.floorItems.indexOf(f), 1);
    G.log(run, G.itemName(f.item) + 'を拾った。');
    ev.push({ t: 'pickup', x: p.x, y: p.y, id: f.item.id });
    if (f.item.id === 'wish_orb') G.log(run, 'ついに願いの宝珠を手に入れた！帰還口から村へ帰ろう。');
    if (G.def(f.item).type === 'material') G.log(run, '（素材は村に持ち帰ると素材箱に入る）');
    return explicit;
  }

  function calcDamage(rng, atk, def) {
    const v = atk * (0.85 + R.next(rng) * 0.3) - def * 0.7;
    return Math.max(1, Math.round(v));
  }

  function playerAttack(S, e, ev) {
    const run = S.run;
    const name = D.ENEMIES[e.type].name;
    if (!R.chance(run.rng, D.PLAYER.hitRate)) {
      G.log(run, 'たけの攻撃は外れた。');
      ev.push({ t: 'miss', x: e.x, y: e.y });
      return;
    }
    const dmg = calcDamage(run.rng, G.playerAtk(run), e.def);
    damageEnemy(S, e, dmg, ev, name + 'に' + dmg + 'のダメージ。');
  }

  function damageEnemy(S, e, dmg, ev, msg) {
    const run = S.run;
    e.hp -= dmg;
    if (e.sleep > 1000) e.sleep = 0; // 眠っていた根っこオバケは起きる
    G.log(run, msg);
    ev.push({ t: 'hit', x: e.x, y: e.y, n: dmg, target: 'enemy' });
    if (e.hp <= 0) killEnemy(S, e, ev);
  }

  function killEnemy(S, e, ev) {
    const run = S.run, E = D.ENEMIES[e.type];
    run.enemies.splice(run.enemies.indexOf(e), 1);
    G.log(run, E.name + 'をたおした！ 経験値' + e.exp);
    ev.push({ t: 'kill', x: e.x, y: e.y });
    gainExp(S, e.exp, ev);
    if (e.boss) {
      const V = S.village, f = run.floor;
      V.bossKills[f] = (V.bossKills[f] || 0) + 1;
      const room = DG.roomAt(run.map, e.x, e.y);
      // 最終ボスの宝珠は、まだ30階を踏破していないときだけ
      const id = E.repeatDrop && V.cleared ? E.repeatDrop : E.drop;
      const pos = G.itemAt(run, e.x, e.y) ? DG.freeTile(run.map, run.rng, run.floorItems.concat([run.player]), room) : { x: e.x, y: e.y };
      run.floorItems.push({ x: pos.x, y: pos.y, item: G.makeItem(S, id) });
      const taken = run.floorItems.concat([run.player, pos]);
      run.portal = DG.freeTile(run.map, run.rng, taken, room);
      if (f < D.MAX_FLOOR) {
        run.stairs = DG.freeTile(run.map, run.rng, taken.concat([run.portal]), room);
        G.log(run, E.name + 'は静かに眠りについた…。' + D.ITEMS[id].name + 'が残された！');
        G.log(run, '下への階段と、村への帰還口が現れた！');
      } else {
        G.log(run, E.name + 'は光になって消えた…。' + D.ITEMS[id].name + 'が残された！');
        G.log(run, '光る帰還口が現れた！');
      }
      // 見える範囲を更新して階段・帰還口を地図に記録
      G.updateVision(run);
      ev.push({ t: 'portal' });
    } else if (R.chance(run.rng, D.ENEMY_DROP_RATE) && !G.itemAt(run, e.x, e.y) && !DG.same(run.stairs, e) && !DG.same(run.returnPoint, e)) {
      const F = D.FLOORS[run.floor];
      const id = R.weighted(run.rng, F.items);
      run.floorItems.push({ x: e.x, y: e.y, item: G.makeItem(S, id, id === 'thunder_staff' ? { charges: R.int(run.rng, 3, 5) } : null) });
      G.log(run, E.name + 'は何かを落とした。');
    }
  }

  function gainExp(S, n, ev) {
    const run = S.run, p = run.player;
    p.exp += n;
    while (p.lvl < D.EXP_TABLE.length - 1 && p.exp >= D.EXP_TABLE[p.lvl + 1]) {
      p.lvl++;
      const old = p.maxhp;
      p.maxhp = G.maxHpFor(p.lvl);
      p.hp += p.maxhp - old;
      G.log(run, 'たけのレベルが' + p.lvl + 'に上がった！');
      ev.push({ t: 'levelup', x: p.x, y: p.y });
    }
  }

  // ---------- ダッシュ（安全な連続移動） ----------
  /* 1マスだけ通常の移動をし（1ターン）、続けてよいかを判定する。
   * 戻り値 { res, stop }。stop が null 以外ならダッシュを止める（理由の文字列）。
   * 敵への自動攻撃はしない。 */
  G.DASH_STOP = { enemy: '敵が見えた', attackBlocked: '前に敵がいる', damage: 'ダメージを受けた', wall: '壁の前', branch: '分かれ道',
    item: '足元に道具', stairs: '階段', returnPoint: '帰還地点', danger: 'HP・満腹度に注意', room: '部屋の出入り', over: '探索終了' };
  G.dashStep = function (S, dir) {
    const run = S.run;
    const none = { res: { consumed: false, events: [] }, stop: 'over' };
    if (!run || run.over || !DIRS[dir]) return none;
    const p = run.player, [dx, dy] = DIRS[dir];
    if (!G.canStep(run.map, p.x, p.y, dx, dy)) { p.dir = dir; return { res: { consumed: false, events: [] }, stop: 'wall' }; }
    if (G.enemyAt(run, p.x + dx, p.y + dy)) return { res: { consumed: false, events: [] }, stop: 'attackBlocked' };
    const hp = p.hp;
    const roomBefore = G.roomForView(run, p.x, p.y);
    const from = { x: p.x, y: p.y };
    const res = G.act(S, { type: 'move', dir });
    if (!res.consumed) return { res, stop: 'wall' };
    return { res, stop: G.dashCheck(S, dir, hp, roomBefore, from, res) };
  };
  G.dashCheck = function (S, dir, hpBefore, roomBefore, from, res) {
    const run = S.run, p = run.player;
    if (run.over) return 'over';
    const ev = res.events;
    if (p.hp < hpBefore || ev.some((e) => e.t === 'hit' && e.target === 'player')) return 'damage';
    if (G.visibleEnemies(run).length) return 'enemy';
    if (G.onStairs(run)) return 'stairs';
    if (G.onReturnPoint(run) || G.onPortal(run)) return 'returnPoint';
    if (G.itemAt(run, p.x, p.y) || ev.some((e) => e.t === 'pickup' || e.t === 'gold' || e.t === 'bagFull')) return 'item';
    if (p.hp <= p.maxhp * 0.3 || p.hunger <= 10 || ev.some((e) => e.t === 'warn')) return 'danger';
    if (G.roomForView(run, p.x, p.y) !== roomBefore) return 'room';
    const [dx, dy] = DIRS[dir];
    if (!G.canStep(run.map, p.x, p.y, dx, dy)) return 'wall';
    if (G.enemyAt(run, p.x + dx, p.y + dy)) return 'attackBlocked';
    // 通路の分かれ道：来た方向以外に2つ以上の道がある
    if (!DG.roomAt(run.map, p.x, p.y)) {
      let exits = 0;
      for (const [ox, oy] of Object.values(DIRS4)) {
        const nx = p.x + ox, ny = p.y + oy;
        if (nx === from.x && ny === from.y) continue;
        if (DG.passable(run.map, nx, ny)) exits++;
      }
      if (exits >= 2) return 'branch';
    }
    return null;
  };

  // ---------- 道具 ----------
  G.findBag = (run, uid) => run.bag.find((it) => it.uid === uid) || null;

  function useItem(S, uid, dir, ev) {
    const run = S.run, p = run.player;
    const it = G.findBag(run, uid);
    if (!it) return false;
    const d = G.def(it);
    const remove = () => run.bag.splice(run.bag.indexOf(it), 1);
    switch (d.type) {
      case 'heal': {
        const before = p.hp;
        p.hp = Math.min(p.maxhp, p.hp + d.heal);
        p.poison = 0; // 回復薬は毒も治す
        remove();
        G.log(run, d.name + 'を使った。HPが' + (p.hp - before) + '回復した。');
        ev.push({ t: 'heal', x: p.x, y: p.y, n: p.hp - before });
        if (p.hp > p.maxhp * 0.3) p.lowWarned = false;
        return true;
      }
      case 'food': {
        const before = p.hunger;
        p.hunger = Math.min(D.PLAYER.maxHunger, p.hunger + d.food);
        remove();
        G.log(run, d.name + 'を食べた。満腹度が' + (p.hunger - before) + '回復した。');
        ev.push({ t: 'eat', x: p.x, y: p.y });
        return true;
      }
      case 'sleep': {
        remove();
        const vis = G.visibleEnemies(run);
        for (const e of vis) e.sleep = Math.max(e.sleep, e.boss ? 3 : d.turns);
        G.log(run, d.name + 'をたいた。' + (vis.length ? '見えている敵が眠った！' : 'あたりにいい香りが広がった。'));
        ev.push({ t: 'sleep', targets: vis.map((e) => ({ x: e.x, y: e.y })) });
        return true;
      }
      case 'staff': {
        if (dir && DIRS[dir]) p.dir = dir;
        if (!it.charges) {
          G.log(run, d.name + 'をふったが、何も出なかった。');
          ev.push({ t: 'fizzle' });
          return true;
        }
        it.charges--;
        const [dx, dy] = DIRS[p.dir];
        let x = p.x, y = p.y, hitE = null;
        const path = [];
        for (let i = 0; i < 20; i++) {
          if (!G.canStep(run.map, x, y, dx, dy)) break;
          x += dx; y += dy;
          path.push({ x, y });
          hitE = G.enemyAt(run, x, y);
          if (hitE) break;
        }
        ev.push({ t: 'bolt', path, dir: p.dir });
        if (hitE) damageEnemy(S, hitE, d.dmg, ev, '稲妻が' + D.ENEMIES[hitE.type].name + 'に命中！ ' + d.dmg + 'のダメージ。');
        else G.log(run, '稲妻は壁に当たって消えた。');
        return true;
      }
      case 'map': {
        remove();
        run.explored.fill(0);
        for (let i = 0; i < run.explored.length; i++) if (run.map.tiles[i] !== DG.WALL) run.explored[i] = 1;
        run.revealed = true;
        G.log(run, '見通しの巻物を読んだ。この階の様子がわかった！');
        ev.push({ t: 'reveal' });
        return true;
      }
      case 'warp': {
        remove();
        // 今いる部屋以外で、できるだけ遠い部屋へ
        const here = G.roomForView(run, p.x, p.y);
        let best = null, bd = -1;
        for (let i = 0; i < 12; i++) {
          const room = R.pick(run.rng, run.map.rooms.filter((r) => r !== here).concat(run.map.rooms.length === 1 ? run.map.rooms : []));
          const t = DG.randomRoomTile(run.rng, room);
          if (G.enemyAt(run, t.x, t.y)) continue;
          const d = Math.abs(t.x - p.x) + Math.abs(t.y - p.y);
          if (d > bd) { bd = d; best = t; }
        }
        if (best) { p.x = best.x; p.y = best.y; G.updateVision(run); }
        G.log(run, '煙玉を投げた！たけは煙にまぎれて逃げ出した。');
        ev.push({ t: 'warp' });
        return true;
      }
      case 'slow': {
        remove();
        const vis = G.visibleEnemies(run);
        for (const e of vis) e.slow = Math.max(e.slow || 0, e.boss ? 6 : d.turns);
        G.log(run, d.name + 'をまいた。' + (vis.length ? '見えている敵の動きが鈍くなった！' : '粉は風に消えた。'));
        ev.push({ t: 'slow', targets: vis.map((e) => ({ x: e.x, y: e.y })) });
        return true;
      }
      case 'fire': {
        remove();
        const vis = G.visibleEnemies(run);
        G.log(run, d.name + 'を使った！炎が広がる！');
        ev.push({ t: 'fire', targets: vis.map((e) => ({ x: e.x, y: e.y })) });
        for (const e of vis) if (run.enemies.includes(e)) damageEnemy(S, e, d.dmg, ev, D.ENEMIES[e.type].name + 'に' + d.dmg + 'のダメージ。');
        return true;
      }
      case 'cure': {
        remove();
        p.poison = 0; p.poisonGuard = 30;
        const before = p.hp; p.hp = Math.min(p.maxhp, p.hp + 20);
        G.log(run, d.name + 'を使った。毒が消え、体が軽くなった。');
        ev.push({ t: 'heal', x: p.x, y: p.y, n: p.hp - before });
        return true;
      }
      case 'return': {
        endRun(S, 'return', '帰還の巻物で村へ戻った。');
        ev.push({ t: 'return' });
        return false; // 探索終了（敵の行動なし）
      }
      case 'weapon': case 'shield':
        return toggleEquip(S, uid, ev);
      default:
        G.log(run, d.name + 'は使う道具ではない。');
        return false;
    }
  }

  // 装備の付け替え（村ではターンの概念なし）
  G.toggleEquipInBag = function (bag, uid) {
    const it = bag.find((x) => x.uid === uid);
    if (!it) return null;
    const type = G.def(it).type;
    if (type !== 'weapon' && type !== 'shield') return null;
    if (it.eq) { it.eq = false; return 'off'; }
    for (const o of bag) if (o !== it && G.def(o).type === type) o.eq = false;
    it.eq = true;
    return 'on';
  };

  function toggleEquip(S, uid, ev) {
    const run = S.run;
    const it = G.findBag(run, uid);
    const r = G.toggleEquipInBag(run.bag, uid);
    if (!r) return false;
    G.log(run, G.itemName(it) + (r === 'on' ? 'を装備した。' : 'を外した。'));
    ev.push({ t: 'equip' });
    return true;
  }

  function dropItem(S, uid, ev) {
    const run = S.run, p = run.player;
    const it = G.findBag(run, uid);
    if (!it) return false;
    if (G.itemAt(run, p.x, p.y) || G.onStairs(run) || G.onReturnPoint(run) || G.onPortal(run)) {
      G.log(run, 'ここには置けない。');
      return false;
    }
    it.eq = false;
    run.bag.splice(run.bag.indexOf(it), 1);
    run.floorItems.push({ x: p.x, y: p.y, item: it });
    G.log(run, G.itemName(it) + 'を足元に置いた。');
    ev.push({ t: 'drop' });
    return true;
  }

  // ---------- ターン終了処理 ----------
  function endTurn(S, ev) {
    const run = S.run, p = run.player;
    run.turn++;
    // 満腹度
    p.hungerAcc++;
    if (p.hungerAcc >= D.PLAYER.hungerTurns) {
      p.hungerAcc = 0;
      if (p.hunger > 0) {
        p.hunger--;
        if (p.hunger === 30) { G.log(run, 'おなかが減ってきた…。'); ev.push({ t: 'warn', msg: 'おなかが減ってきた' }); }
        if (p.hunger === 10) { G.log(run, 'おなかがペコペコだ！何か食べよう。'); ev.push({ t: 'warn', msg: 'おなかがペコペコ！' }); }
        if (p.hunger === 0) { G.log(run, '空腹で力が出ない…。HPが減っていく！'); ev.push({ t: 'warn', msg: '満腹度0！HPが減っていく' }); }
      }
    }
    if (p.hunger > 0) {
      p.starveAcc = 0;
      p.regenAcc += p.maxhp / D.PLAYER.regenTurns;
      if (p.regenAcc >= 1) {
        const n = Math.floor(p.regenAcc);
        p.regenAcc -= n;
        p.hp = Math.min(p.maxhp, p.hp + n);
      }
    } else {
      p.regenAcc = 0;
      p.starveAcc++;
      if (p.starveAcc >= D.PLAYER.starveTurns) {
        p.starveAcc = 0;
        p.hp -= 1;
        ev.push({ t: 'hit', x: p.x, y: p.y, n: 1, target: 'player' });
        if (p.hp <= 0) { die(S, '空腹で倒れた'); return; }
      }
    }
    // 敵の行動（1ターンに各敵1回まで）
    for (const e of run.enemies.slice()) {
      if (run.over) break;
      if (!run.enemies.includes(e)) continue;
      enemyAct(S, e, ev);
    }
    if (run.over) return;
    // 時間経過で敵が湧く（見えない場所）
    if (run.turn % D.SPAWN_INTERVAL === 0 && run.enemies.length < D.maxEnemies(run.floor) && !D.FLOORS[run.floor].boss) spawnEnemy(S);
    G.updateVision(run);
    if (p.hp <= p.maxhp * 0.3 && !p.lowWarned) {
      p.lowWarned = true;
      G.log(run, 'HPが残りわずか！回復するか逃げよう。');
      ev.push({ t: 'warn', msg: 'HPが少ない！' });
    } else if (p.hp > p.maxhp * 0.5) p.lowWarned = false;
  }

  function spawnEnemy(S) {
    const run = S.run, F = D.FLOORS[run.floor];
    for (let tries = 0; tries < 30; tries++) {
      const room = R.pick(run.rng, run.map.rooms);
      const pos = DG.randomRoomTile(run.rng, room);
      if (G.isVisible(run, pos.x, pos.y) || G.enemyAt(run, pos.x, pos.y) || DG.same(pos, run.player)) continue;
      if (Math.abs(pos.x - run.player.x) + Math.abs(pos.y - run.player.y) < 6) continue;
      run.enemies.push(makeEnemy(run, R.weighted(run.rng, F.enemies), pos.x, pos.y));
      return;
    }
  }

  // 近接攻撃できる隣接（斜めも可。ただし壁の角越しは不可）
  function adjacent(run, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;
    return G.canStep(run.map, a.x, a.y, dx, dy);
  }
  G.adjacent = adjacent;

  function enemyAct(S, e, ev) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type];
    // 眠り
    if (e.sleep > 0) {
      if (e.sleep > 1000) { // 休眠中の根っこオバケ：近づくと起きる
        if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= 2) { e.sleep = 0; G.log(run, E.name + 'が目を覚ました！'); }
        return;
      }
      e.sleep--;
      if (e.sleep === 0) G.log(run, E.name + 'が目を覚ました。');
      return;
    }
    // 遅い敵・鈍足の敵は2ターンに1回
    if (e.slow > 0) { e.slow--; if (run.turn % 2 === 1) return; }
    else if (E.ai === 'slow' && run.turn % 2 === 1) return;
    e.acts++;
    const sees = G.isVisible(run, e.x, e.y); // 互いに見えている
    if (sees) { e.tx = p.x; e.ty = p.y; }
    if (adjacent(run, e, p)) { enemyAttack(S, e, e.atk, ev, false); return; }
    if (E.ai === 'ranged' && sees && canShoot(run, e)) { enemyAttack(S, e, Math.round(E.shoot * (1 + D.ENEMY_SCALE.atk * Math.max(0, run.floor - 1))), ev, true); return; }
    if (E.ai === 'erratic' && R.chance(run.rng, 0.35)) { randomStep(run, e); return; }
    if (e.tx !== null) {
      if (e.x === e.tx && e.y === e.ty) { e.tx = e.ty = null; randomStep(run, e); return; }
      if (!stepToward(run, e, e.tx, e.ty)) randomStep(run, e);
      return;
    }
    // うろうろ：ランダムな部屋を目指す
    const room = R.pick(run.rng, run.map.rooms);
    const t = DG.randomRoomTile(run.rng, room);
    e.tx = t.x; e.ty = t.y; e.wander = true;
    stepToward(run, e, t.x, t.y);
  }

  function canShoot(run, e) {
    return G.clearLine(run, e, run.player, D.ENEMIES[e.type].range);
  }

  /* a から b へ8方向の直線上にあり、range 以内で、途中に壁・角・敵がないか */
  G.clearLine = function (run, a, b, range) {
    const ddx = b.x - a.x, ddy = b.y - a.y;
    if (!(ddx === 0 || ddy === 0 || Math.abs(ddx) === Math.abs(ddy))) return false;
    const dist = Math.max(Math.abs(ddx), Math.abs(ddy));
    if (dist < 2 || dist > range) return false;
    const dx = Math.sign(ddx), dy = Math.sign(ddy);
    let x = a.x, y = a.y;
    for (let i = 0; i < dist; i++) {
      if (!G.canStep(run.map, x, y, dx, dy)) return false;
      x += dx; y += dy;
      if (i < dist - 1 && G.enemyAt(run, x, y)) return false;
    }
    return true;
  };

  function enemyAttack(S, e, atk, ev, ranged) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type];
    const dx = p.x - e.x, dy = p.y - e.y;
    e.dir = G.dirOf(dx, dy) || e.dir;
    if (ranged) ev.push({ t: 'dart', from: { x: e.x, y: e.y }, to: { x: p.x, y: p.y } });
    else ev.push({ t: 'lunge', id: e.id, x: e.x, y: e.y });
    if (!R.chance(run.rng, D.ENEMY_HIT_RATE)) {
      G.log(run, E.name + (ranged ? 'の吹き矢は外れた。' : 'の攻撃をかわした。'));
      ev.push({ t: 'miss', x: p.x, y: p.y });
      return;
    }
    const dmg = calcDamage(run.rng, atk, G.playerDef(run));
    p.hp -= dmg;
    G.log(run, E.name + (ranged ? 'の吹き矢！' : 'の攻撃！') + 'たけは' + dmg + 'のダメージ。');
    ev.push({ t: 'hit', x: p.x, y: p.y, n: dmg, target: 'player' });
    if (p.hp <= 0) die(S, E.name + 'にやられた');
  }

  function stepTo(run, e, nx, ny) {
    if (!G.canStep(run.map, e.x, e.y, nx - e.x, ny - e.y) || G.enemyAt(run, nx, ny) || (nx === run.player.x && ny === run.player.y)) return false;
    e.dir = G.dirOf(nx - e.x, ny - e.y) || e.dir;
    e.x = nx; e.y = ny;
    return true;
  }

  function randomStep(run, e) {
    const dirs = R.shuffle(run.rng, Object.values(DIRS).slice());
    for (const [dx, dy] of dirs) if (stepTo(run, e, e.x + dx, e.y + dy)) return true;
    return false;
  }

  const STEP8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  // BFSで目標までの最短経路の1歩目（8方向・角抜けなし。他の敵はふさがっているとみなす）
  function stepToward(run, e, tx, ty) {
    const m = run.map, W = m.w;
    const goal = ty * W + tx;
    const prev = new Int32Array(m.w * m.h).fill(-1);
    const start = e.y * W + e.x;
    prev[start] = start;
    const q = [start];
    let found = false;
    for (let i = 0; i < q.length && !found; i++) {
      const c = q[i], x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of STEP8) {
        const nx = x + dx, ny = y + dy, k = ny * W + nx;
        if (!G.canStep(m, x, y, dx, dy) || prev[k] !== -1) continue;
        if (k !== goal && G.enemyAt(run, nx, ny)) continue;
        prev[k] = c;
        if (k === goal) { found = true; break; }
        q.push(k);
      }
    }
    if (!found) { e.tx = e.ty = null; return false; }
    let c = goal;
    while (prev[c] !== start) c = prev[c];
    return stepTo(run, e, c % W, (c / W) | 0);
  }

  // ---------- 探索の終了 ----------
  function die(S, cause) {
    const run = S.run;
    run.player.hp = 0;
    run.over = true;
    run.result = { type: 'dead', cause, floor: run.floor, lostGold: run.runGold, lostItems: run.bag.filter((i) => i.id !== 'return_scroll').length };
    G.log(run, 'たけは倒れてしまった…。');
  }

  function endRun(S, type, msg) {
    const run = S.run;
    run.over = true;
    const orb = run.bag.some((i) => i.id === 'wish_orb');
    run.result = { type, floor: run.floor, gold: run.runGold, orb, msg };
    G.log(run, msg);
  }

  G.useReturnScroll = function (S) {
    const it = S.run && S.run.bag.find((i) => i.id === 'return_scroll');
    if (!it) return { consumed: false, events: [] };
    return G.act(S, { type: 'use', uid: it.uid });
  };

  /* 探索結果を村へ反映し、run を消す。戻り値は結果の概要 */
  G.finishRun = function (S) {
    const run = S.run, V = S.village;
    if (!run || !run.over) return null;
    const res = Object.assign({}, run.result);
    if (res.type === 'dead') {
      V.bag = [];
      V.defeats++;
    } else {
      // 素材は素材箱へ（倉庫・バッグの枠を使わない）
      res.materials = {};
      for (const it of run.bag) {
        if (G.def(it).type !== 'material') continue;
        V.materials[it.id] = (V.materials[it.id] || 0) + 1;
        res.materials[it.id] = (res.materials[it.id] || 0) + 1;
      }
      V.bag = run.bag.filter((i) => i.id !== 'return_scroll' && i.id !== 'wish_orb' && G.def(i).type !== 'material');
      V.funds += run.runGold;
      V.returns++;
      res.items = V.bag.length;
      if (res.orb) {
        res.firstClear = !V.cleared;
        V.cleared = true;
        V.clears++;
      }
    }
    // 貸出品が重複しないよう念のため1つずつに
    dedupeLoans(V);
    V.lastResult = res;
    S.run = null;
    return res;
  };

  function dedupeLoans(V) {
    for (const id of ['wood_sword', 'loan_rice']) {
      let seen = false;
      V.bag = V.bag.filter((i) => { if (i.id !== id) return true; if (seen) return false; seen = true; return true; });
    }
  }

  // ---------- 村 ----------
  G.storageSize = (V) => D.STORAGE_SIZE[V.stage];
  G.shopStock = (V) => D.SHOP_STOCK[V.stage];

  G.buy = function (S, id) {
    const V = S.village, d = D.ITEMS[id];
    if (!G.shopStock(V).includes(id)) return { ok: false, msg: 'その品物は売っていない。' };
    if (V.funds < d.price) return { ok: false, msg: 'お金が足りません。' };
    if (V.bag.length >= D.BAG_SIZE) return { ok: false, msg: 'バッグがいっぱいです。' };
    V.funds -= d.price;
    V.bag.push(G.makeItem(S, id));
    return { ok: true, msg: d.name + 'を買った。' };
  };

  G.sell = function (S, uid) {
    const V = S.village;
    const it = V.bag.find((i) => i.uid === uid);
    if (!it) return { ok: false, msg: '見つかりません。' };
    if (!G.canSell(it)) return { ok: false, msg: G.def(it).name + 'は売れません。' };
    const price = G.sellPrice(it);
    V.bag.splice(V.bag.indexOf(it), 1);
    V.funds += price;
    return { ok: true, msg: G.itemName(it) + 'を' + price + 'Gで売った。', price };
  };

  G.deposit = function (S, uid) {
    const V = S.village;
    const it = V.bag.find((i) => i.uid === uid);
    if (!it) return { ok: false, msg: '見つかりません。' };
    if (!G.canStore(it)) return { ok: false, msg: G.def(it).name + 'は預けられません。' };
    if (V.storage.length >= G.storageSize(V)) return { ok: false, msg: '倉庫がいっぱいです。' };
    it.eq = false;
    V.bag.splice(V.bag.indexOf(it), 1);
    V.storage.push(it);
    return { ok: true, msg: G.itemName(it) + 'を預けた。' };
  };

  G.withdraw = function (S, uid) {
    const V = S.village;
    const it = V.storage.find((i) => i.uid === uid);
    if (!it) return { ok: false, msg: '見つかりません。' };
    if (V.bag.length >= D.BAG_SIZE) return { ok: false, msg: 'バッグがいっぱいです。' };
    V.storage.splice(V.storage.indexOf(it), 1);
    V.bag.push(it);
    return { ok: true, msg: G.itemName(it) + 'を取り出した。' };
  };

  G.discard = function (S, uid) {
    const V = S.village;
    const it = V.bag.find((i) => i.uid === uid);
    if (!it) return { ok: false };
    V.bag.splice(V.bag.indexOf(it), 1);
    return { ok: true, msg: G.itemName(it) + 'を手放した。' };
  };

  G.upgradeVillage = function (S) {
    const V = S.village;
    const next = D.VILLAGE_STAGES[V.stage + 1];
    if (!next) return { ok: false, msg: '村はこれ以上発展できません。' };
    if (V.funds < next.cost) return { ok: false, msg: '資金が足りません。（' + next.cost + 'G 必要）' };
    V.funds -= next.cost;
    V.stage++;
    return { ok: true, msg: '「' + next.name + '」が完成した！' };
  };

  G.smithCost = (it) => D.SMITH.cost(it.plus || 0);
  G.canSmith = function (V, it) {
    const t = G.def(it).type;
    return V.stage >= 3 && (t === 'weapon' || t === 'shield') && !G.def(it).loan && (it.plus || 0) < D.SMITH.maxPlus;
  };
  G.smith = function (S, uid) {
    const V = S.village;
    const it = V.bag.find((i) => i.uid === uid) || V.storage.find((i) => i.uid === uid);
    if (!it) return { ok: false, msg: '見つかりません。' };
    if (V.stage < 3) return { ok: false, msg: '鍛冶屋がまだありません。' };
    if (!G.canSmith(V, it)) return { ok: false, msg: 'これ以上強化できません。' };
    const cost = G.smithCost(it);
    if (V.funds < cost) return { ok: false, msg: 'お金が足りません。（' + cost + 'G 必要）' };
    V.funds -= cost;
    it.plus = (it.plus || 0) + 1;
    return { ok: true, msg: G.itemName(it) + 'に強化した！' };
  };

  // 貸出品：持っていないときだけ1つ借りられる（売却・預入不可なので増やせない）
  G.loanStatus = function (S) {
    const V = S.village;
    return {
      weapon: !V.bag.some((i) => i.id === 'wood_sword'),
      food: !V.bag.some((i) => i.id === 'loan_rice'),
    };
  };
  G.takeLoan = function (S, kind) {
    const V = S.village;
    const id = kind === 'weapon' ? 'wood_sword' : 'loan_rice';
    if (!G.loanStatus(S)[kind]) return { ok: false, msg: 'もう借りています。' };
    if (V.bag.length >= D.BAG_SIZE) return { ok: false, msg: 'バッグがいっぱいです。' };
    const it = G.makeItem(S, id);
    V.bag.push(it);
    if (kind === 'weapon' && !G.equipped(V.bag, 'weapon')) it.eq = true;
    return { ok: true, msg: D.ITEMS[id].name + 'を借りた。' };
  };

  TS.Game = G;
})(globalThis.TS = globalThis.TS || {});
