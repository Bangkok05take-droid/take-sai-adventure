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

  // ---------- 物語の進行（保存する状態を分けて持つ） ----------
  const BOSS_IDS = ['croc', 'flame', 'kill', 'baran', 'mist', 'vearn', 'truevearn'];
  G.newStory = function () {
    const flags = () => Object.fromEntries(BOSS_IDS.map((b) => [b, false]));
    return {
      chapter: 1,                 // 現在の章（1〜5、6＝最終章）
      defeated: flags(),          // 各ボスの撃破状態
      rewardClaimed: flags(),     // 章の報酬（復興支援金）を受け取ったか
      returnDone: flags(),        // 撃破後の帰還イベントが済んだか
      finalStage: 'none',         // 最終決戦の段階：none / battle1 / prep / battle2 / won
      endingDone: false,          // エンディングを見たか
      records: 1,                 // 読めるマスターヤナイの記録の数
      seen: {},                   // 一度見た会話（2回目からスキップできる）
      pending: null,              // 村で見せる章のできごと（帰還イベント・エンディング）
      introDone: false,
    };
  };
  // 探索のルール（章）。更新前から続いている探索は 'legacy'（以前の版のルールのまま村へ帰る）
  G.chapterOf = (run) => (run && run.chapter != null ? run.chapter : 'legacy');
  G.F = (run, f) => D.floorFor(G.chapterOf(run), f == null ? run.floor : f);
  G.maxFloor = (run) => (G.chapterOf(run) === D.FINAL_CHAPTER ? D.LAST_FLOOR : D.MAX_FLOOR);
  // 村に表示する「現在の章・次のボス・目標階」
  G.storyStatus = function (V) {
    const st = V.story || G.newStory(), C = D.CHAPTERS[st.chapter];
    const after = st.endingDone;
    return { chapter: st.chapter, name: C.name, title: C.title, boss: C.boss, bossName: D.ENEMIES[C.boss].name + (C.final ? '（そして……）' : ''),
      goal: C.goal, final: !!C.final, cleared: after, tip: C.tip };
  };

  // ---------- 生成 ----------
  G.newVillage = function () {
    const V = {
      funds: D.START_FUNDS, stage: 1, bag: [], storage: [], nextUid: 1,
      cleared: false, clears: 0, runs: 0, returns: 0, defeats: 0, bestFloor: 0,
      legacyClear10: false, bossKills: {}, materials: {},
      storageLv: 1, smithLv: 0, built: {}, decor: {}, diner: false, museum: false, meal: null, donated: {},
      lastResult: null, seenIntro: false, seenEnding: false,
      story: G.newStory(),
    };
    G.applyFacilities(V);
    return V;
  };
  G.newState = function () {
    return { version: D.SAVE_VERSION, village: G.newVillage(), run: null, settings: { sound: true, minimap: 1, bgmVol: 1, sfxVol: 1 } };
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
  G.maxHpFor = (lvl, run) => D.PLAYER.baseHp + D.PLAYER.hpPerLevel * (lvl - 1) + (run && run.meal && D.MEALS[run.meal] ? (D.MEALS[run.meal].maxhp || 0) : 0);
  G.hungerTurns = (run) => Math.round(D.PLAYER.hungerTurns * (run.meal && D.MEALS[run.meal] ? (D.MEALS[run.meal].hungerMul || 1) : 1));
  G.equipped = function (bag, type) {
    return bag.find((it) => it.eq && G.def(it).type === type) || null;
  };
  G.playerAtk = function (run) {
    const w = G.equipped(run.bag, 'weapon');
    const meal = run.meal && D.MEALS[run.meal];
    return D.PLAYER.baseAtk + D.PLAYER.atkPerLevel * (run.player.lvl - 1) + (w ? G.def(w).atk + (w.plus || 0) : 0) + (meal && meal.atk || 0);
  };
  G.playerDef = function (run) {
    const s = G.equipped(run.bag, 'shield');
    const meal = run.meal && D.MEALS[run.meal];
    return (s ? G.def(s).def + (s.plus || 0) : 0) + (meal && meal.def || 0);
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
        hungerAcc: 0, regenAcc: 0, starveAcc: 0, dir: 'down', lowWarned: false, poison: 0, poisonGuard: 0, bound: 0, bindGuard: 0 },
      enemies: [], floorItems: [], map: null, explored: null, stairs: null, returnPoint: null, portal: null,
      log: [], over: false, result: null, nextEnemyId: 1, killedBy: null, revealed: false,
      chapter: V.story.chapter, hazards: [], fog: 0,
      final: V.story.chapter === D.FINAL_CHAPTER ? { stage: 'none', healed: false, cutsceneSeen: false } : null,
    };
    // 食堂の料理（この探索だけ）
    if (V.meal && D.MEALS[V.meal]) {
      S.run.meal = V.meal;
      V.meal = null;
      const p = S.run.player;
      p.maxhp = p.hp = G.maxHpFor(1, S.run);
    }
    G.log(S.run, 'たけは遺跡へ出発した！' + (S.run.meal ? '（' + D.MEALS[S.run.meal].name + 'で元気いっぱい）' : ''));
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
    const Fdef = G.F(run), ch = G.chapterOf(run);
    const rpFloors = ch === 'legacy' ? D.RETURN_POINT_FLOORS : D.returnFloors(ch);
    const gen = DG.generate(floor, rng, { boss: !!Fdef.boss, returnPoint: rpFloors.includes(floor) });
    run.hazards = []; run.fog = 0; run.sense = 0;   // 気配察知は階を移ると切れる
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
    const F = Fdef;
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
      run.floorItems.push({ x: pos.x, y: pos.y, item: G.makeItem(S, id, D.ITEMS[id].type === 'staff' ? { charges: R.int(rng, 3, 5) } : null) });
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
    placeMonsterHouse(S, gen, occupied);
    placeMerchant(S, gen);
    if (F.boss) {
      const b = makeEnemy(run, F.boss, gen.bossPos.x, gen.bossPos.y);
      b.boss = true;
      run.enemies.push(b);
      if (run.final && F.boss === 'vearn') { run.final.stage = 'battle1'; run.final.healed = false; run.final.cutsceneSeen = false; S.village.story.finalStage = 'battle1'; }
    }
    G.log(run, '地下' + floor + '階　' + D.THEMES[F.theme].name);
    if (run.returnPoint) G.log(run, 'この階には村へ帰れる「帰還の祠」がある。');
    if (F.boss) G.log(run, '奥から大きな気配がする…。' + D.ENEMIES[F.boss].name + 'が待ち構えている！');
    G.updateVision(run);
  }

  /* モンスターハウス：敵とお宝の多い部屋。階を作るときに一度だけ置く（出入りや再読み込みで作り直さない）。
   * 開始部屋・帰還の祠のある部屋・ボス階は対象外。敵は深さに合った通常の出現表から選び、重ならないように置く。
   * 部屋の敵は眠っていて、たけが初めて部屋に入ると目を覚ます（その直後のターンは動かない＝入室直後の追加攻撃なし）。 */
  function placeMonsterHouse(S, gen, occupied) {
    const run = S.run, rng = run.rng, f = run.floor, F = G.F(run), MH = D.MONSTER_HOUSE;
    run.map.monsterHouse = null;
    if (F.boss || f < MH.minFloor || !R.chance(rng, MH.chance)) return;
    const rp = run.returnPoint;
    const cand = run.map.rooms.filter((r) => r.id !== gen.startRoom && r.w * r.h >= MH.minArea &&
      !(rp && rp.x >= r.x && rp.x < r.x + r.w && rp.y >= r.y && rp.y < r.y + r.h));
    if (!cand.length) return;
    const room = R.pick(rng, cand);
    run.map.monsterHouse = room.id;
    const free = [];
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
      if (occupied.some((o) => o.x === x && o.y === y) || G.enemyAt(run, x, y)) continue;
      free.push({ x, y });
    }
    R.shuffle(rng, free);
    const nE = Math.min(MH.enemiesMax, 4 + Math.floor(room.w * room.h / 6), Math.floor(free.length * 0.6));
    for (let i = 0; i < nE; i++) {
      const pos = free.pop();
      occupied.push(pos);
      const e = makeEnemy(run, R.weighted(rng, F.enemies), pos.x, pos.y);
      e.mh = true; e.sleep = 999;
      run.enemies.push(e);
    }
    const nI = MH.extraItems + Math.floor(f / 10);
    for (let i = 0; i < nI && free.length; i++) {
      const pos = free.pop();
      occupied.push(pos);
      if (i % 3 === 2) { run.floorItems.push({ x: pos.x, y: pos.y, gold: D.goldAmount(f, R.next(rng)) * 2 }); continue; }
      const id = R.weighted(rng, F.items);
      run.floorItems.push({ x: pos.x, y: pos.y, item: G.makeItem(S, id, D.ITEMS[id].type === 'staff' ? { charges: R.int(rng, 3, 5) } : null) });
    }
  }
  /* 謎の旅商人：階を作るときに一度だけ決める（出現・場所・品ぞろえ・価格・在庫は run.merchant に保存。
   * 再読み込みや話しかけ直しで作り直さない）。この階の乱数とは別の乱数を使い、ほかの出現を変えない。
   * 場所：ふつうの部屋（3×3以上。モンスターハウス・開始部屋以外）の角のマス。入口（通路）のとなり・階段・帰還の祠・道具・敵の上には置かない。 */
  function placeMerchant(S, gen) {
    const run = S.run, f = run.floor, M = D.MERCHANT, F = G.F(run);
    run.merchant = null;
    if (F.boss || f < M.minFloor || f >= G.maxFloor(run)) return;
    const mr = R.create(((run.seed ^ Math.imul(f + 1, 0x9E3779B1)) >>> 0) ^ 0x5bd1e995);
    if (!R.chance(mr, M.chance)) return;
    const m = run.map, W = m.w;
    const roomTile = (x, y) => { const r = DG.roomAt(m, x, y); return !!r; };
    const blocked = (x, y) => (run.stairs && DG.same(run.stairs, { x, y })) || (run.returnPoint && DG.same(run.returnPoint, { x, y })) ||
      DG.same(gen.start, { x, y }) || G.itemAt(run, x, y) || G.enemyAt(run, x, y);
    const rooms = R.shuffle(mr, m.rooms.filter((r) => r.id !== gen.startRoom && r.id !== m.monsterHouse && r.w >= 3 && r.h >= 3));
    for (const r of rooms) {
      const corners = R.shuffle(mr, [[r.x, r.y], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]]);
      for (const [x, y] of corners) {
        if (blocked(x, y)) continue;
        let nearDoor = false;   // 8方向のとなりに、部屋の外の歩ける所（通路）があれば入口のそば
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && DG.passable(m, x + dx, y + dy) && !roomTile(x + dx, y + dy)) nearDoor = true;
        if (nearDoor) continue;
        // 品ぞろえ：この階で並べられる素材のうち、貴重なものから最大3種類
        const kinds = M.goods.filter((gd) => f >= gd.from).sort((a, b) => b.price - a.price).slice(0, M.maxKinds);
        const stock = kinds.map((gd) => ({ id: gd.id, price: Math.round(gd.price * (1 + (R.next(mr) * 2 - 1) * M.priceSpread) / 10) * 10, left: R.int(mr, M.stock[0], M.stock[1]) }));
        run.merchant = { x, y, stock, met: false };
        return;
      }
    }
  }
  G.merchantAt = (run, x, y) => !!(run.merchant && run.merchant.x === x && run.merchant.y === y);
  // 敵が入れないマス（ほかの敵・商人）
  const blockedForEnemy = (run, x, y) => !!G.enemyAt(run, x, y) || G.merchantAt(run, x, y);
  // 払えるお金：探索中のお金＋村の資金
  G.merchantWallet = (S) => ({ run: S.run ? S.run.runGold : 0, village: S.village.funds, total: (S.run ? S.run.runGold : 0) + S.village.funds });
  /* 商人から1つ買う。ターンは進まない。お金・持ち物の空き・在庫を確かめてから、まとめて差し引く。
   * 戻り値 { ok, msg, paidRun, paidVillage } */
  G.merchantBuy = function (S, idx) {
    const run = S.run, V = S.village;
    if (!run || run.over || !run.merchant) return { ok: false, msg: '商人がいない。' };
    const g = run.merchant.stock[idx];
    if (!g) return { ok: false, msg: 'その品はない。' };
    if (g.left <= 0) return { ok: false, msg: '売り切れです。' };
    if (run.bag.length >= D.BAG_SIZE) return { ok: false, msg: '持ち物がいっぱいです（' + D.BAG_SIZE + '個まで）。' };
    const w = G.merchantWallet(S);
    if (w.total < g.price) return { ok: false, msg: 'お金が足りません（あと' + (g.price - w.total) + 'G）。' };
    const paidRun = Math.min(run.runGold, g.price), paidVillage = g.price - paidRun;
    run.runGold -= paidRun; V.funds -= paidVillage;
    g.left--;
    run.bag.push(G.makeItem(S, g.id));
    G.log(run, D.MERCHANT.name + 'から' + D.ITEMS[g.id].name + 'を' + g.price + 'Gで買った。');
    return { ok: true, msg: D.ITEMS[g.id].name + 'を買った。', paidRun, paidVillage };
  };

  // たけがモンスターハウスに初めて入ったか（入ったら敵が目を覚ます）
  function checkMonsterHouse(run, ev) {
    const m = run.map;
    if (m.monsterHouse == null || run.mhTriggered) return;
    const r = DG.roomAt(m, run.player.x, run.player.y);
    if (!r || r.id !== m.monsterHouse) return;
    run.mhTriggered = true;
    for (const e of run.enemies) if (e.mh && e.sleep > 0) { e.sleep = 0; e.hold = 1; }
    G.log(run, 'モンスターハウスだ！');
    ev.push({ t: 'monsterHouse' });
  }
  G.checkMonsterHouse = checkMonsterHouse;

  function makeEnemy(run, type, x, y) {
    const E = D.ENEMIES[type], f = run.floor;
    const k = E.noScale ? 0 : Math.max(0, f - (E.base || 1));
    const cm = E.noScale ? 1 : D.chapterMul(run.chapter, f);   // 章が進むと少しずつ強く（浅い階はほぼ同じ）
    const hp = Math.round(E.hp * (1 + D.ENEMY_SCALE.hp * k) * cm);
    return {
      id: run.nextEnemyId++, type, x, y, hp, maxhp: hp,
      atk: Math.round(E.atk * (1 + D.ENEMY_SCALE.atk * k) * cm),
      def: E.def,
      exp: Math.round(E.exp * (1 + D.ENEMY_SCALE.exp * k)),
      sleep: E.ai === 'dormant' ? 9999 : 0,
      tx: null, ty: null, acts: 0, dir: 'down', cycle: 0, rest: 0, charge: null, stolen: 0,
    };
  }
  G.makeEnemy = makeEnemy;

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
    if (run.fog > 0) { // 霧：まわり2マスしか見えない（ボスの予告・床の印は表示される）
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(p.x + dx, p.y + dy);
    } else {
      if (r) for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) mark(x, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(p.x + dx, p.y + dy);
    }
    Object.defineProperty(run, '_vis', { value: vis, enumerable: false, configurable: true, writable: true });
    return vis;
  };
  G.isVisible = function (run, x, y) {
    if (!run._vis) G.updateVision(run);
    return x >= 0 && y >= 0 && x < run.map.w && y < run.map.h && run._vis[y * run.map.w + x] === 1;
  };
  G.visibleEnemies = (run) => run.enemies.filter((e) => G.isVisible(run, e.x, e.y));

  // ---------- 行動 ----------
  // 足元の道具をその場で使えるか（使う種類だけ。装備・お宝・素材などは拾うだけ）
  const FLOOR_USE = ['heal', 'food', 'cure', 'sleep', 'staff', 'map', 'sense', 'warp', 'slow', 'fire', 'clear', 'return'];
  G.canUseFromFloor = function (run) {
    const f = G.itemAt(run, run.player.x, run.player.y);
    return !!(f && f.item && FLOOR_USE.includes(G.def(f.item).type));
  };
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
    // 最終決戦の準備中は時間が止まっている（道具・装備の確認だけ。ターンは進まない）
    if (run.final && run.final.stage === 'prep') {
      if (a.type === 'equip') toggleEquip(S, a.uid, ev);
      else if (a.type === 'use') { const it = G.findBag(run, a.uid); if (it && ['heal', 'food', 'cure', 'clear'].includes(G.def(it).type)) useItem(S, a.uid, a.dir, ev); }
      return { consumed: false, events: ev };
    }
    switch (a.type) {
      case 'move': consumed = doMove(S, a.dir, ev); break;
      case 'wait': consumed = true; ev.push({ t: 'wait' }); break;
      case 'pickup': consumed = pickup(S, ev, true); break;
      case 'use': consumed = useItem(S, a.uid, a.dir, ev); break;
      case 'useFloor': consumed = G.canUseFromFloor(run) ? useItem(S, a.uid, a.dir, ev, true) : false; break;
      case 'equip': consumed = toggleEquip(S, a.uid, ev); break;
      case 'drop': consumed = dropItem(S, a.uid, ev); break;
      case 'throw': consumed = throwItem(S, a.uid, a.dir, ev, !!a.fromFloor); break;
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
          endRun(S, 'return', G.onPortal(run) ? '帰還口から村へ戻った。' : '帰還の祠から村へ戻った。');
          ev.push({ t: 'return' });
        }
        return { consumed: false, events: ev };
      default: break;
    }
    if (consumed && !run.over) endTurn(S, ev);
    if (run.revived) { run.revived = false; ev.push({ t: 'revive', x: run.player.x, y: run.player.y }); }
    return { consumed, events: ev };
  };

  function doMove(S, dir, ev) {
    const run = S.run, p = run.player;
    const d = DIRS[dir];
    if (!d) return false;
    p.dir = dir;
    const nx = p.x + d[0], ny = p.y + d[1];
    if (!G.canStep(run.map, p.x, p.y, d[0], d[1])) return false; // 壁・角：ターン消費なし
    // 商人には攻撃しない。ぶつかると話しかける（ターンは進まない）
    if (G.merchantAt(run, nx, ny)) { ev.push({ t: 'merchant' }); return false; }
    const e = G.enemyAt(run, nx, ny);
    if (e) { playerAttack(S, e, ev); return true; }
    if (p.bound > 0) { // 拘束中は移動できない（攻撃・道具・足踏みはできる）。ターンは消費しない
      G.log(run, '体が動かない！（攻撃・道具・足踏みはできる。あと' + p.bound + 'ターン）');
      ev.push({ t: 'warn', msg: '拘束されている！' });
      return false;
    }
    p.x = nx; p.y = ny;
    ev.push({ t: 'move' });
    G.updateVision(run);
    pickup(S, ev, false);
    checkMonsterHouse(run, ev);
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
    ev.push({ t: 'kill', x: e.x, y: e.y, boss: !!e.boss, sprite: E.sprite, exp: e.exp });
    gainExp(S, e.exp, ev);
    if (e.stolen) {
      run.runGold += e.stolen;
      G.log(run, '盗まれた' + e.stolen + 'Gを取り返した！');
      ev.push({ t: 'gold', x: e.x, y: e.y, n: e.stolen });
    }
    if (E.clone) {
      G.log(run, 'それは幻だった！');
    } else if (e.boss) {
      bossDefeated(S, e, ev);
    } else if (!e.summoned && R.chance(run.rng, D.ENEMY_DROP_RATE) && !G.itemAt(run, e.x, e.y) && !DG.same(run.stairs, e) && !DG.same(run.returnPoint, e)) {
      const F = G.F(run);
      const id = R.weighted(run.rng, F.items);
      run.floorItems.push({ x: e.x, y: e.y, item: G.makeItem(S, id, D.ITEMS[id].type === 'staff' ? { charges: R.int(run.rng, 3, 5) } : null) });
      G.log(run, E.name + 'は何かを落とした。');
      ev.push({ t: 'loot', x: e.x, y: e.y });
    }
  }

  /* ボスを倒したとき。
   * 章のボス：撃破を記録し、報酬の品と帰還口が現れる（31階へは進めない）。章は村へ帰ったときに進む。
   * 大魔王バーン（35階・1戦目）：静寂のあと変身の場面へ（回復はここで1回だけ）。準備画面で「最終決戦へ」を押すと2戦目。
   * 真大魔王バーン：最終決戦の勝利。帰還口から帰るとエンディング。
   * 以前の版のボス（更新前から続く探索）：お宝と帰還口・階段（以前と同じ。宝珠は出ない）。 */
  function bossDefeated(S, e, ev) {
    const run = S.run, V = S.village, E = D.ENEMIES[e.type], st = V.story;
    V.bossKills[e.type] = (V.bossKills[e.type] || 0) + 1;
    // 分身・呼ばれた手下・床の危険は消える
    run.enemies = run.enemies.filter((o) => !o.clone && !o.summoned);
    run.hazards = []; run.fog = 0; run.player.bound = 0;
    const room = DG.roomAt(run.map, e.x, e.y);
    const drop = (id) => {
      const taken = run.floorItems.concat([run.player]);
      const pos = !taken.some((t) => t.x === e.x && t.y === e.y) ? { x: e.x, y: e.y } : DG.freeTile(run.map, run.rng, taken, room);
      if (pos) run.floorItems.push({ x: pos.x, y: pos.y, item: G.makeItem(S, id) });
    };
    const openPortal = () => {
      run.portal = DG.freeTile(run.map, run.rng, run.floorItems.concat([run.player]), room);
      G.updateVision(run);
      ev.push({ t: 'portal' });
    };
    if (G.chapterOf(run) === 'legacy') {
      const id = E.drop === 'wish_orb' ? 'dream_crown' : E.drop;
      drop(id); openPortal();
      if (run.floor < D.MAX_FLOOR) run.stairs = DG.freeTile(run.map, run.rng, run.floorItems.concat([run.player, run.portal]), room);
      G.log(run, E.name + 'を倒した！' + D.ITEMS[id].name + 'が残された。');
      ev.push({ t: 'bossDown', boss: e.type });
      return;
    }
    if (e.type === 'vearn' && run.final) {
      // 1戦目の勝利 → 静寂 → ミストバーンの再出現と変身 → 準備（この時点の状態を保存する）
      st.defeated.vearn = true;
      run.final.stage = 'prep';
      st.finalStage = 'prep';
      if (!run.final.healed) {
        const p = run.player;
        run.final.healed = true;
        p.hp = p.maxhp; p.poison = 0; p.bound = 0; p.hunger = Math.max(p.hunger, 50);
      }
      run.enemies = [];
      G.log(run, '大魔王バーンを倒した……！');
      G.log(run, 'しかし、影が集まり、真大魔王バーンがよみがえった！ サイたちの祈りでHPが全回復した。');
      ev.push({ t: 'finalTransform' });
      return;
    }
    if (e.type === 'truevearn') {
      st.defeated.truevearn = true;
      if (run.final) run.final.stage = 'won';
      st.finalStage = 'won';
      for (const id of D.CHAPTERS[D.FINAL_CHAPTER].reward.items) drop(id);
      openPortal();
      G.log(run, '真大魔王バーンを倒した！ 光る帰還口が開いた。');
      ev.push({ t: 'finalWin' });
      return;
    }
    // 章のボス
    const firstTime = !st.defeated[e.type];
    st.defeated[e.type] = true;
    const C = D.CHAPTERS[run.chapter];
    const items = C && C.boss === e.type && firstTime ? C.reward.items : ['golden_elephant'];
    for (const id of items) drop(id);
    openPortal();
    G.log(run, E.name + 'を倒した！ ' + items.map((id) => D.ITEMS[id].name).join('と') + 'が現れた。');
    G.log(run, '光る帰還口が開いた。村へ帰ろう。');
    ev.push({ t: 'bossDown', boss: e.type });
  }

  // 準備画面で「最終決戦へ」：真大魔王バーンが現れる（ターンは進めない）
  G.startFinalBattle = function (S) {
    const run = S.run;
    if (!run || !run.final || run.final.stage !== 'prep') return false;
    const room = run.map.rooms[1] || run.map.rooms[0];
    let pos = { x: room.x + (room.w >> 1), y: room.y + 2 };
    if (DG.same(pos, run.player) || G.itemAt(run, pos.x, pos.y)) pos = DG.freeTile(run.map, run.rng, run.floorItems.concat([run.player]), room);
    const b = makeEnemy(run, 'truevearn', pos.x, pos.y);
    b.boss = true; b.hold = 1;   // 現れたターンは動かない
    run.enemies.push(b);
    run.final.stage = 'battle2';
    S.village.story.finalStage = 'battle2';
    G.updateVision(run);
    G.log(run, '最終決戦！ 真大魔王バーンが立ちはだかる！');
    return true;
  };
  G.markFinalCutscene = function (S) { if (S.run && S.run.final) S.run.final.cutsceneSeen = true; };

  function gainExp(S, n, ev) {
    const run = S.run, p = run.player;
    p.exp += n;
    while (p.lvl < D.EXP_TABLE.length - 1 && p.exp >= D.EXP_TABLE[p.lvl + 1]) {
      p.lvl++;
      const old = p.maxhp;
      p.maxhp = G.maxHpFor(p.lvl, run);
      p.hp += p.maxhp - old;
      G.log(run, 'たけのレベルが' + p.lvl + 'に上がった！');
      ev.push({ t: 'levelup', x: p.x, y: p.y });
    }
  }

  // ---------- ダッシュ（安全な連続移動） ----------
  /* 1マスだけ通常の移動をし（1ターン）、続けてよいかを判定する。
   * 戻り値 { res, stop }。stop が null 以外ならダッシュを止める（理由の文字列）。
   * 敵への自動攻撃はしない。 */
  G.DASH_STOP = { enemy: '敵を発見', near: '敵が近い', attackBlocked: '前に敵がいる', damage: 'ダメージを受けた', wall: '壁の前', branch: '分かれ道',
    item: '足元に道具', stairs: '階段', returnPoint: '帰還地点', merchant: '商人がいる', danger: 'HP・満腹度が危険', room: '部屋の出入り', over: '探索終了', event: 'できごと', monsterHouse: 'モンスターハウス' };
  /* ダッシュ開始時の状況を記録する。すでに見えている敵や、すでに危険域であることでは
   * 毎回止まらない（押し直せば必ず進める）。新しく起きたことだけで止まる。 */
  G.dashContext = function (S) {
    const run = S.run, p = run.player;
    return { seen: G.visibleEnemies(run).map((e) => e.id), danger: p.hp <= p.maxhp * 0.3 || p.hunger <= 10, hunger: p.hunger };
  };
  G.dashStep = function (S, dir, ctx) {
    const run = S.run;
    const none = { res: { consumed: false, events: [] }, stop: 'over' };
    if (!run || run.over || !DIRS[dir]) return none;
    ctx = ctx || G.dashContext(S);
    const p = run.player, [dx, dy] = DIRS[dir];
    if (!G.canStep(run.map, p.x, p.y, dx, dy)) { p.dir = dir; return { res: { consumed: false, events: [] }, stop: 'wall' }; }
    if (G.enemyAt(run, p.x + dx, p.y + dy)) return { res: { consumed: false, events: [] }, stop: 'attackBlocked' };
    if (G.merchantAt(run, p.x + dx, p.y + dy)) return { res: { consumed: false, events: [] }, stop: 'merchant' };
    const hp = p.hp;
    const roomBefore = G.roomForView(run, p.x, p.y);
    const from = { x: p.x, y: p.y };
    const res = G.act(S, { type: 'move', dir });
    if (!res.consumed) return { res, stop: 'wall' };
    const stop = G.dashCheck(S, dir, hp, roomBefore, from, res, ctx);
    for (const e of G.visibleEnemies(run)) if (!ctx.seen.includes(e.id)) ctx.seen.push(e.id);
    return { res, stop };
  };
  G.dashCheck = function (S, dir, hpBefore, roomBefore, from, res, ctx) {
    const run = S.run, p = run.player;
    ctx = ctx || { seen: [], danger: false };
    if (run.over) return 'over';
    const ev = res.events;
    if (ev.some((e) => e.t === 'monsterHouse')) return 'monsterHouse';
    if (p.hp < hpBefore || ev.some((e) => e.t === 'hit' && e.target === 'player')) return 'damage';
    if (G.visibleEnemies(run).some((e) => !ctx.seen.includes(e.id))) return 'enemy';
    if (run.enemies.some((e) => G.adjacent(run, p, e))) return 'near';
    if (run.merchant && G.adjacent(run, p, run.merchant)) return 'merchant';
    if (G.onStairs(run)) return 'stairs';
    if (G.onReturnPoint(run) || G.onPortal(run)) return 'returnPoint';
    if (G.itemAt(run, p.x, p.y) || ev.some((e) => e.t === 'pickup' || e.t === 'gold' || e.t === 'bagFull')) return 'item';
    const danger = p.hp <= p.maxhp * 0.3 || p.hunger <= 10;
    if ((danger && !ctx.danger) || ev.some((e) => e.t === 'warn')) return 'danger';
    if (ev.some((e) => e.t === 'telegraph' || e.t === 'steal' || e.t === 'levelup')) return 'event';
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

  /* 通常移動の長押し：1歩ごとに続けてよいかを判定する。
   * 敵が隣に来た・攻撃になる・ダメージ・道具・階段などで止める（押しっぱなしで攻撃を繰り返さない）。 */
  G.walkCheck = function (S, dir, res) {
    const run = S.run, p = run.player;
    if (!run || run.over) return 'over';
    if (!res.consumed) return 'wall';
    const ev = res.events;
    if (!ev.some((e) => e.t === 'move')) return 'attackBlocked'; // 攻撃や行動になった
    if (ev.some((e) => e.t === 'monsterHouse')) return 'monsterHouse';
    if (ev.some((e) => e.t === 'hit' && e.target === 'player')) return 'damage';
    if (run.enemies.some((e) => G.adjacent(run, p, e))) return 'near';
    if (run.merchant && G.adjacent(run, p, run.merchant)) return 'merchant';
    if (G.onStairs(run)) return 'stairs';
    if (G.onReturnPoint(run) || G.onPortal(run)) return 'returnPoint';
    if (G.itemAt(run, p.x, p.y) || ev.some((e) => e.t === 'pickup' || e.t === 'gold' || e.t === 'bagFull')) return 'item';
    if (ev.some((e) => e.t === 'warn' || e.t === 'telegraph' || e.t === 'steal' || e.t === 'levelup')) return 'event';
    const [dx, dy] = DIRS[dir];
    if (!G.canStep(run.map, p.x, p.y, dx, dy)) return 'wall';
    if (G.enemyAt(run, p.x + dx, p.y + dy)) return 'attackBlocked';
    return null;
  };

  // ---------- 休息（「向き」ボタンの長押しで連続足踏み） ----------
  /* 通常の「待つ」を1ターンずつ繰り返すだけ。回復は既存の自然回復ルールのみ（即時・無料回復なし）。
   * 敵の行動・満腹度・状態異常も通常どおり進む。 */
  G.REST_STOP = { full: 'HPが満タン', enemy: '敵が見えている', newEnemy: '敵が現れた', damage: 'ダメージを受けた', hunger: '満腹度が少ない',
    poison: '毒で回復できない', over: '探索終了', event: 'できごと' };
  // 休息を始められるか（だめなら理由）
  G.restBlock = function (S) {
    const run = S.run;
    if (!run || run.over) return 'over';
    const p = run.player;
    if (G.visibleEnemies(run).length) return 'enemy';
    if (p.poison > 0) return 'poison';
    if (p.hunger <= 10) return 'hunger';
    if (p.hp >= p.maxhp) return 'full';
    return null;
  };
  /* 1ターン待って、続けてよいかを返す { res, stop } */
  G.restStep = function (S) {
    const block = G.restBlock(S);
    if (block) return { res: { consumed: false, events: [] }, stop: block };
    const run = S.run, p = run.player, hp = p.hp;
    const res = G.act(S, { type: 'wait' });
    let stop = null;
    if (run.over) stop = 'over';
    else if (p.hp < hp || res.events.some((e) => e.t === 'hit' && e.target === 'player')) stop = 'damage';
    else if (G.visibleEnemies(run).length) stop = 'newEnemy';
    else if (p.poison > 0) stop = 'poison';
    else if (p.hunger <= 10) stop = 'hunger';
    else if (res.events.some((e) => e.t === 'warn' || e.t === 'telegraph' || e.t === 'steal')) stop = 'event';
    else if (p.hp >= p.maxhp) stop = 'full';
    return { res, stop };
  };

  // ---------- 持ち物の整理 ----------
  // 種類の順：武器→盾→食料→回復→状態異常回復→攻撃・補助→帰還→素材→お宝
  const SORT_GROUP = { weapon: 0, shield: 1, accessory: 1.5, food: 2, heal: 3, cure: 4, sleep: 5, staff: 5, fire: 5, slow: 5, warp: 5, map: 5, sense: 5, clear: 5, charm: 5, return: 6, material: 7, treasure: 8, orb: 9 };
  const ITEM_ORDER = Object.keys(D.ITEMS);
  G.itemSortKey = (it) => [SORT_GROUP[G.def(it).type] ?? 9, ITEM_ORDER.indexOf(it.id), -(it.plus || 0), -(it.charges || 0), it.uid];
  /* 安定した並び替え（同じ並びに対して何度押しても順序が変わらない）。
   * 配列の中身（品物そのもの）は入れ替えるだけで、数・強化値・装備・貸出などは変えない。ターンも消費しない。 */
  G.sortItems = function (list) {
    const keyed = list.map((it) => ({ it, k: G.itemSortKey(it) }));
    keyed.sort((a, b) => { for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]; return 0; });
    for (let i = 0; i < keyed.length; i++) list[i] = keyed[i].it;
    return list;
  };

  // ---------- 道具 ----------
  G.findBag = (run, uid) => run.bag.find((it) => it.uid === uid) || null;
  // 持っているだけで効く護符
  G.hasCharm = (run, effect) => !!effect && run.bag.some((it) => G.def(it).type === 'charm' && G.def(it).effect === effect);
  // 装備しているアクセサリーの効果（持っているだけでは効かない。装備枠は1つ）
  G.hasAcc = (run, key) => { const a = G.equipped(run.bag, 'accessory'); return !!(a && G.def(a).acc === key); };

  /* 道具を使う。fromFloor が true なら、バッグではなく足元に落ちている道具を使う（バッグの中身は変わらない。
   * 消費する道具は床から1個なくなる。効果・ターン・対象の選び方はバッグから使うときと同じ処理） */
  function useItem(S, uid, dir, ev, fromFloor) {
    const run = S.run, p = run.player;
    const fl = fromFloor ? G.itemAt(run, p.x, p.y) : null;
    const it = fromFloor ? (fl && fl.item && fl.item.uid === uid ? fl.item : null) : G.findBag(run, uid);
    if (!it) return false;
    const d = G.def(it);
    const remove = () => { if (fromFloor) run.floorItems.splice(run.floorItems.indexOf(fl), 1); else run.bag.splice(run.bag.indexOf(it), 1); };
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
        ev.push({ t: 'eat', x: p.x, y: p.y, n: p.hunger - before });
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
        ev.push({ t: 'bolt', path, dir: p.dir, kind: d.tint === 'king' ? 'king' : 'staff', hit: !!hitE });
        if (hitE) damageEnemy(S, hitE, d.dmg, ev, '雷が' + D.ENEMIES[hitE.type].name + 'に命中！ ' + d.dmg + 'のダメージ。');
        else G.log(run, '雷は壁に当たって消えた。');
        return true;
      }
      case 'sense': { // 気配察知：この階の敵の位置を地図に出す（視界・敵の索敵は変えない。地形や道具は明かさない）
        remove();
        run.sense = run.floor;
        G.log(run, d.name + 'を読んだ。この階にいる敵の気配が地図に浮かんだ！');
        ev.push({ t: 'sense' });
        return true;
      }
      case 'map': {
        remove();
        run.explored.fill(0);
        for (let i = 0; i < run.explored.length; i++) if (run.map.tiles[i] !== DG.WALL) run.explored[i] = 1;
        run.revealed = true;
        G.log(run, 'みとおしの巻物を読んだ。この階の様子がわかった！');
        ev.push({ t: 'reveal' });
        return true;
      }
      case 'warp': {
        remove();
        const from = { x: p.x, y: p.y };   // 演出用（煙を出す場所）
        // 今いる部屋以外で、できるだけ遠い部屋へ
        const here = G.roomForView(run, p.x, p.y);
        let best = null, bd = -1;
        for (let i = 0; i < 12; i++) {
          const room = R.pick(run.rng, run.map.rooms.filter((r) => r !== here).concat(run.map.rooms.length === 1 ? run.map.rooms : []));
          const t = DG.randomRoomTile(run.rng, room);
          if (G.enemyAt(run, t.x, t.y) || G.merchantAt(run, t.x, t.y)) continue;
          const d = Math.abs(t.x - p.x) + Math.abs(t.y - p.y);
          if (d > bd) { bd = d; best = t; }
        }
        if (best) { p.x = best.x; p.y = best.y; G.updateVision(run); }
        G.log(run, 'けむり玉を投げた！たけは煙にまぎれて逃げ出した。');
        ev.push({ t: 'warp', from, to: { x: p.x, y: p.y } });
        checkMonsterHouse(run, ev);
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
        G.log(run, d.name + 'を読んだ！雷鳴がとどろく！');
        ev.push({ t: 'fire', targets: vis.map((e) => ({ x: e.x, y: e.y })) });
        for (const e of vis) if (run.enemies.includes(e)) damageEnemy(S, e, d.dmg, ev, D.ENEMIES[e.type].name + 'に' + d.dmg + 'のダメージ。');
        return true;
      }
      case 'clear': {
        remove();
        run.fog = 0; p.bound = 0; p.bindGuard = 12;
        G.log(run, d.name + 'をたいた。霧が晴れ、体が軽くなった！');
        ev.push({ t: 'heal', x: p.x, y: p.y, n: 0, kind: 'clear' });
        G.updateVision(run);
        return true;
      }
      case 'cure': {
        remove();
        p.poison = 0; p.poisonGuard = 30;
        const before = p.hp; p.hp = Math.min(p.maxhp, p.hp + 20);
        G.log(run, d.name + 'を使った。毒が消え、体が軽くなった。');
        ev.push({ t: 'heal', x: p.x, y: p.y, n: p.hp - before, kind: 'cure' });
        return true;
      }
      case 'return': {
        endRun(S, 'return', '帰還の巻物で村へ戻った。');
        ev.push({ t: 'return', scroll: true, x: p.x, y: p.y });
        return false; // 探索終了（敵の行動なし）
      }
      case 'weapon': case 'shield': case 'accessory':
        return fromFloor ? false : toggleEquip(S, uid, ev);
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
    if (type !== 'weapon' && type !== 'shield' && type !== 'accessory') return null;
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

  /* ---------- 投げる ----------
   * 8方向のどれかへ1個投げる。直線上の最初の敵に当たる（壁は通らず、斜めでも壁の角は抜けない）。射程は D.THROW.range。
   * 当たった道具はなくなり、種類ごとの効果（G.throwEffect）が敵だけにかかる。外れたら、止まった所かその近くの床に落ちる。
   * fromFloor：足元の道具を直接投げる（バッグがいっぱいでも投げられる）。装備中の品・大切な物は投げられない（ターンも消費しない）。 */
  G.canThrow = function (it) {
    const d = G.def(it);
    if (!d || d.type === 'orb') return { ok: false, msg: d ? d.name + 'は大切な物なので投げられない。' : '' };
    if (it.eq) return { ok: false, msg: G.itemName(it) + 'は装備中。外してから投げよう。' };
    return { ok: true };
  };
  // 投げた道具が敵に当たったときの効果の種類（一覧表示・テスト用）
  G.throwKind = function (d) {
    if (d.type === 'sleep') return 'sleep';
    if (d.type === 'slow') return 'slow';
    if (d.type === 'heal' || d.type === 'cure') return 'heal';
    if (d.type === 'warp') return 'warp';
    if (d.type === 'weapon') return 'weapon';
    return 'small';
  };
  G.throwSmallDamage = (run) => Math.max(1, Math.round(D.THROW.small.base + D.THROW.small.perFloor * run.floor));
  function throwItem(S, uid, dir, ev, fromFloor) {
    const run = S.run, p = run.player, T = D.THROW;
    if (!DIRS[dir]) return false;
    const fl = fromFloor ? G.itemAt(run, p.x, p.y) : null;
    const it = fromFloor ? (fl && fl.item && fl.item.uid === uid ? fl.item : null) : G.findBag(run, uid);
    if (!it) return false;
    const chk = G.canThrow(it);
    if (!chk.ok) { G.log(run, chk.msg); return false; }
    const d = G.def(it);
    // 手から離す（ここで1個だけ。二重に投げられない）
    if (fromFloor) run.floorItems.splice(run.floorItems.indexOf(fl), 1); else run.bag.splice(run.bag.indexOf(it), 1);
    p.dir = dir;
    const [dx, dy] = DIRS[dir];
    let x = p.x, y = p.y, hitE = null;
    const path = [];
    for (let i = 0; i < T.range; i++) {
      if (!G.canStep(run.map, x, y, dx, dy)) break;
      if (G.merchantAt(run, x + dx, y + dy)) break;   // 商人の手前で落ちる（商人には当てない）
      x += dx; y += dy;
      path.push({ x, y });
      hitE = G.enemyAt(run, x, y);
      if (hitE) break;
    }
    const to = path.length ? path[path.length - 1] : { x: p.x, y: p.y };
    ev.push({ t: 'throw', from: { x: p.x, y: p.y }, to, id: it.id, hit: !!hitE });
    G.log(run, G.itemName(it) + 'を投げた。');
    if (hitE) { throwHit(S, hitE, it, d, ev); return true; }
    // 外れた：止まった所に落ちる。ふさがっていれば近くの空いた床へ（なければ消える）
    const spot = G.landingSpot(run, to.x, to.y);
    if (spot) {
      run.floorItems.push({ x: spot.x, y: spot.y, item: it });
      G.log(run, G.itemName(it) + 'は床に落ちた。');
      ev.push({ t: 'land', x: spot.x, y: spot.y });
    } else G.log(run, G.itemName(it) + 'は落ちる場所がなく、どこかへ消えてしまった。');
    return true;
  }
  /* 落ちる場所：そのマスが空いていればそこ。だめなら、壁を通らずに歩いて行ける近くの空いた床（2マス以内）から一番近い所。
   * 空いた床＝通れる床で、道具・階段・帰還の祠・帰還口・商人がないマス（敵やたけの足元は可。既存の「置く」と同じく1マスに道具1つ）。 */
  G.landingSpot = function (run, x0, y0) {
    const free = (x, y) => DG.passable(run.map, x, y) && !G.itemAt(run, x, y) && !DG.same(run.stairs, { x, y }) && !DG.same(run.returnPoint, { x, y }) &&
      !DG.same(run.portal, { x, y }) && !G.merchantAt(run, x, y);
    if (free(x0, y0)) return { x: x0, y: y0 };
    const seen = new Set([x0 + ',' + y0]), q = [{ x: x0, y: y0, d: 0 }];
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      if (c.d >= 2) continue;
      for (const [dx, dy] of STEP8) {
        const nx = c.x + dx, ny = c.y + dy, k = nx + ',' + ny;
        if (seen.has(k) || !G.canStep(run.map, c.x, c.y, dx, dy)) continue;
        seen.add(k);
        if (free(nx, ny)) return { x: nx, y: ny };
        q.push({ x: nx, y: ny, d: c.d + 1 });
      }
    }
    return null;
  };
  // 当たった敵にだけ効果をかける（たけ・階全体にはかけない）。当たった道具はなくなる
  function throwHit(S, e, it, d, ev) {
    const run = S.run, T = D.THROW, name = D.ENEMIES[e.type].name, kind = G.throwKind(d);
    const at = { x: e.x, y: e.y };
    G.log(run, G.itemName(it) + 'は' + name + 'に当たった！');
    switch (kind) {
      case 'sleep': {
        const n = e.boss ? T.sleepBoss : d.turns;
        e.sleep = Math.max(e.sleep, n);
        if (e.charge) { e.charge = null; G.log(run, name + 'の構えがとけた。'); }
        G.log(run, name + 'は眠ってしまった！（' + n + 'ターン）');
        ev.push({ t: 'sleep', targets: [at], thrown: true });
        return;
      }
      case 'slow': {
        const n = e.boss ? T.slowBoss : d.turns;
        e.slow = Math.max(e.slow || 0, n);
        G.log(run, name + 'の動きが鈍くなった！（' + n + 'ターン）');
        ev.push({ t: 'slow', targets: [at], thrown: true });
        return;
      }
      case 'heal': {
        const amt = d.type === 'cure' ? T.cureHeal : d.heal;
        const before = e.hp;
        e.hp = Math.min(e.maxhp, e.hp + amt);
        G.log(run, name + 'のHPが' + (e.hp - before) + '回復してしまった。');
        ev.push({ t: 'enemyHeal', x: e.x, y: e.y, n: e.hp - before });
        return;
      }
      case 'warp': {
        if (!e.boss && !D.ENEMIES[e.type].clone) {
          for (let i = 0; i < 30; i++) {
            const t = DG.randomRoomTile(run.rng, R.pick(run.rng, run.map.rooms));
            if (G.isVisible(run, t.x, t.y) || G.enemyAt(run, t.x, t.y) || G.merchantAt(run, t.x, t.y) || DG.same(t, run.player)) continue;
            e.x = t.x; e.y = t.y; e.tx = e.ty = null; e.charge = null;
            G.log(run, name + 'は煙に包まれて、どこかへ消えた！');
            ev.push({ t: 'warp', from: at, to: null });
            return;
          }
        }
        const n = G.throwSmallDamage(run);
        damageEnemy(S, e, n, ev, '煙は効かなかった。' + name + 'に' + n + 'のダメージ。');
        return;
      }
      case 'weapon': {
        const atk = T.weapon.base + (d.atk + (it.plus || 0)) * T.weapon.mul;
        const n = calcDamage(run.rng, atk, e.def);
        damageEnemy(S, e, n, ev, name + 'に' + n + 'のダメージ。');
        return;
      }
      default: {
        const n = G.throwSmallDamage(run);
        damageEnemy(S, e, n, ev, name + 'に' + n + 'のダメージ。');
      }
    }
  }

  // ---------- ターン終了処理 ----------
  function endTurn(S, ev) {
    const run = S.run, p = run.player;
    run.turn++;
    // 満腹度（満腹の腕輪を装備している間は減らない。今の満腹度はそのまま）
    if (!G.hasAcc(run, 'hunger')) p.hungerAcc++;
    if (p.hungerAcc >= G.hungerTurns(run)) {
      p.hungerAcc = 0;
      if (p.hunger > 0) {
        p.hunger--;
        if (p.hunger === 30) { G.log(run, 'おなかが減ってきた…。'); ev.push({ t: 'warn', msg: 'おなかが減ってきた' }); }
        if (p.hunger === 10) { G.log(run, 'おなかがペコペコだ！何か食べよう。'); ev.push({ t: 'warn', msg: 'おなかがペコペコ！' }); }
        if (p.hunger === 0) { G.log(run, '空腹で力が出ない…。HPが減っていく！'); ev.push({ t: 'warn', msg: '満腹度0！HPが減っていく' }); }
      }
    }
    if (p.poisonGuard > 0) p.poisonGuard--;
    if (p.poison > 0) {
      p.poison--;
      const n = Math.max(1, Math.round(p.maxhp * D.POISON.dmgRate));
      p.hp -= n;
      ev.push({ t: 'hit', x: p.x, y: p.y, n, target: 'player', poison: true });
      if (p.hp <= 0 && die(S, '毒で倒れた')) return;
      if (p.poison === 0) { p.poisonGuard = D.POISON.guard; G.log(run, '毒が抜けた。'); }
    }
    if (p.hunger > 0 && !p.poison) {
      p.starveAcc = 0;
      p.regenAcc += p.maxhp / D.PLAYER.regenTurns;
      if (p.regenAcc >= 1) {
        const n = Math.floor(p.regenAcc);
        p.regenAcc -= n;
        p.hp = Math.min(p.maxhp, p.hp + n);
      }
    } else if (p.hunger <= 0) {
      p.regenAcc = 0;
      p.starveAcc++;
      if (p.starveAcc >= D.PLAYER.starveTurns) {
        p.starveAcc = 0;
        p.hp -= 1;
        ev.push({ t: 'hit', x: p.x, y: p.y, n: 1, target: 'player' });
        if (p.hp <= 0 && die(S, '空腹で倒れた')) return;
      }
    }
    // 敵の行動（1ターンに各敵1回まで）
    for (const e of run.enemies.slice()) {
      if (run.over) break;
      if (!run.enemies.includes(e)) continue;
      enemyAct(S, e, ev);
    }
    if (run.over) return;
    // 床の危険（予告の数字が0になると発動。印の上にいるとダメージ）
    if (run.hazards && run.hazards.length) {
      for (const h of run.hazards) h.t--;
      const fire = run.hazards.filter((h) => h.t <= 0);
      run.hazards = run.hazards.filter((h) => h.t > 0);
      if (fire.length) {
        ev.push({ t: 'blast', tiles: fire.map((h) => ({ x: h.x, y: h.y, kind: h.kind, circle: h.name === '魔法陣の炎' })), kind: fire[0].kind });
        const h = fire.find((o) => o.x === p.x && o.y === p.y);
        if (h) {
          let dmg = calcDamage(run.rng, h.dmg, G.playerDef(run));
          if (G.hasCharm(run, h.kind === 'bolt' ? 'bolt' : (h.kind === 'fire' || h.kind === 'ice') ? 'fireice' : '')) dmg = Math.ceil(dmg / 2);
          dmg = Math.min(dmg, Math.max(1, Math.round(p.maxhp * (h.cap || 0.6))));   // 罠などで一撃で倒れない上限
          p.hp -= dmg;
          G.log(run, h.name + '！ たけは' + dmg + 'のダメージ。');
          ev.push({ t: 'hit', x: p.x, y: p.y, n: dmg, target: 'player', big: true });
          if (p.hp <= 0 && die(S, h.name + 'にやられた')) return;
        } else if (fire.some((o) => Math.max(Math.abs(o.x - p.x), Math.abs(o.y - p.y)) <= 1)) G.log(run, '床の印をかわした！');
      }
    }
    if (run.fog > 0) { run.fog--; if (!run.fog) G.log(run, '霧が晴れた。'); }
    if (p.bound > 0) { p.bound--; if (!p.bound) { p.bindGuard = 4; G.log(run, '体が動くようになった！'); } }
    else if (p.bindGuard > 0) p.bindGuard--;
    // 時間経過で敵が湧く（見えない場所）
    if (run.turn % D.SPAWN_INTERVAL === 0 && run.enemies.length < D.maxEnemies(run.floor) && !G.F(run).boss) spawnEnemy(S);
    G.updateVision(run);
    if (p.hp <= p.maxhp * 0.3 && !p.lowWarned) {
      p.lowWarned = true;
      G.log(run, 'HPが残りわずか！回復するか逃げよう。');
      ev.push({ t: 'warn', msg: 'HPが少ない！' });
    } else if (p.hp > p.maxhp * 0.5) p.lowWarned = false;
  }

  function spawnEnemy(S) {
    const run = S.run, F = G.F(run);
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

  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  function enemyAct(S, e, ev) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type];
    // モンスターハウスで目を覚ました直後のターンは動かない
    if (e.hold > 0) { e.hold--; return; }
    // 眠り（眠ると予告中の攻撃も中断される）
    if (e.sleep > 0) {
      if (e.charge) { e.charge = null; G.log(run, E.name + 'の構えがとけた。'); }
      if (e.sleep > 1000) { // 休眠中の根っこオバケ：近づくと起きる
        if (cheb(e, p) <= 2) { e.sleep = 0; G.log(run, E.name + 'が目を覚ました！'); }
        return;
      }
      e.sleep--;
      if (e.sleep === 0) G.log(run, E.name + 'が目を覚ました。');
      return;
    }
    // 遅い敵・鈍足の敵は2ターンに1回
    if (e.slow > 0) { e.slow--; if (run.turn % 2 === 1) return; }
    else if ((E.ai === 'slow' || E.slowMove) && run.turn % 2 === 1 && !e.charge) return;
    // 大技のあとの隙
    if (e.rest > 0) { e.rest--; e.acts++; return; }
    e.acts++;
    const sees = G.isVisible(run, e.x, e.y); // 互いに見えている
    if (sees) { e.tx = p.x; e.ty = p.y; }
    if (e.charge) { resolveCharge(S, e, ev); return; }
    switch (E.ai) {
      case 'boss':
        if (G.BOSS_AI && G.BOSS_AI[e.type]) { if (G.BOSS_AI[e.type](S, e, ev, sees, H)) return; break; }
        if (bossAct(S, e, ev, sees)) return; break;
      case 'clone': // 分身：本物と同じ姿で近づき、弱い攻撃をする
        if (!sees && !e.tx) { e.tx = p.x; e.ty = p.y; }
        break;
      case 'telegraph':
        if (sees && adjacent(run, e, p)) { startCharge(S, e, ev, [{ x: p.x, y: p.y }], E.heavy, 1, 'が武器を大きく振りかぶった！'); return; }
        break;
      case 'area':
        if (sees && cheb(e, p) <= 1) { startCharge(S, e, ev, areaTiles(run, e, 1), E.heavy, 1, 'が地面を踏みならそうとしている！'); return; }
        break;
      case 'support':
        if (supportHeal(S, e, ev)) return;
        if (sees && !adjacent(run, e, p) && cheb(e, p) <= 2 && stepAway(run, e)) return;
        break;
      case 'thief':
        if (e.flee) { if (!stepAway(run, e)) randomStep(run, e); return; }
        if (adjacent(run, e, p) && run.runGold > 0) {
          if (!G.hasAcc(run, 'theft')) { steal(S, e, ev); return; }
          if (!e.theftBlocked) { e.theftBlocked = true; G.log(run, E.name + 'がお金をねらったが、がまぐちの守りが口を閉じた！'); }
        }
        break;
      case 'magic':
        if (sees && adjacent(run, e, p) && stepAway(run, e)) return;
        break;
      default: break;
    }
    if (adjacent(run, e, p)) { enemyAttack(S, e, e.atk, ev, false); return; }
    if ((E.ai === 'ranged' || E.ai === 'magic') && sees && canShoot(run, e)) {
      const k = Math.max(0, run.floor - (E.base || 1));
      enemyAttack(S, e, Math.round(E.shoot * (1 + D.ENEMY_SCALE.atk * k)), ev, true);
      return;
    }
    if (E.ai === 'erratic' && R.chance(run.rng, 0.35)) { randomStep(run, e); return; }
    moveEnemy(run, e);
    // 速い敵はもう1歩（攻撃はしない）
    if (E.ai === 'fast' && run.enemies.includes(e) && !adjacent(run, e, p)) {
      if (G.isVisible(run, e.x, e.y)) { e.tx = p.x; e.ty = p.y; }
      moveEnemy(run, e);
    }
  }

  function moveEnemy(run, e) {
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

  // プレイヤーから離れる方向へ1歩
  function stepAway(run, e) {
    const p = run.player;
    let best = null, bd = cheb(e, p);
    for (const [dx, dy] of STEP8) {
      const nx = e.x + dx, ny = e.y + dy;
      if (!G.canStep(run.map, e.x, e.y, dx, dy) || blockedForEnemy(run, nx, ny) || (nx === p.x && ny === p.y)) continue;
      const d = Math.max(Math.abs(nx - p.x), Math.abs(ny - p.y));
      if (d > bd) { bd = d; best = [nx, ny]; }
    }
    if (!best) return false;
    return stepTo(run, e, best[0], best[1]);
  }

  // ---- 予告攻撃（見えているときだけ始める。次の行動で発動し、その後に隙ができる） ----
  function areaTiles(run, c, r) {
    const out = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!dx && !dy) continue;
      const x = c.x + dx, y = c.y + dy;
      if (DG.passable(run.map, x, y)) out.push({ x, y });
    }
    return out;
  }
  function lineTiles(run, e, dx, dy, len) {
    const out = [];
    let x = e.x, y = e.y;
    for (let i = 0; i < len; i++) {
      if (!G.canStep(run.map, x, y, dx, dy)) break;
      x += dx; y += dy;
      out.push({ x, y });
    }
    return out;
  }
  function startCharge(S, e, ev, tiles, mult, rest, msg) {
    const run = S.run, E = D.ENEMIES[e.type];
    e.charge = { tiles, mult, rest };
    e.dir = G.dirOf(run.player.x - e.x, run.player.y - e.y) || e.dir;
    G.log(run, '！ ' + E.name + msg + '（赤いマスから離れよう）');
    ev.push({ t: 'telegraph', id: e.id, tiles, msg: E.name + msg });
  }
  function resolveCharge(S, e, ev) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type], c = e.charge;
    e.charge = null;
    e.rest = c.rest || 0;
    if (c.kind && G.BOSS_RESOLVE && G.BOSS_RESOLVE[c.kind]) { G.BOSS_RESOLVE[c.kind](S, e, ev, c, H); return; }
    ev.push({ t: 'blast', id: e.id, tiles: c.tiles, fx: c.fx });
    if (c.tiles.some((t) => t.x === p.x && t.y === p.y)) {
      const dmg = calcDamage(run.rng, e.atk * c.mult, G.playerDef(run));
      p.hp -= dmg;
      G.log(run, E.name + 'の大技！たけは' + dmg + 'のダメージ。');
      ev.push({ t: 'hit', x: p.x, y: p.y, n: dmg, target: 'player', big: true });
      if (p.hp <= 0) die(S, E.name + 'の大技にやられた');
    } else {
      G.log(run, E.name + 'の大技をかわした！' + (e.rest ? '今がチャンスだ。' : ''));
      ev.push({ t: 'miss', x: p.x, y: p.y });
    }
  }

  function bossAct(S, e, ev, sees) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type], P = E.pattern;
    if (!sees) return false;
    e.cycle = (e.cycle || 0) + 1;
    const enraged = P.enrage && e.hp < e.maxhp * P.enrage;
    const every = enraged ? P.every - 1 : P.every;
    // 仲間を呼ぶ
    if (P.summon && e.cycle % P.summonEvery === 0) {
      const minions = run.enemies.filter((m) => m.summoned).length;
      if (minions < P.summonMax) {
        const spot = areaTiles(run, e, 2).find((t) => !G.enemyAt(run, t.x, t.y) && !(t.x === p.x && t.y === p.y) && cheb(t, p) >= 2);
        if (spot) {
          const m = makeEnemy(run, P.summon, spot.x, spot.y);
          m.summoned = true; m.exp = Math.round(m.exp / 3);
          run.enemies.push(m);
          G.log(run, E.name + 'が' + D.ENEMIES[P.summon].name + 'を呼んだ！');
          ev.push({ t: 'summon', x: spot.x, y: spot.y });
          return true;
        }
      }
    }
    if (e.cycle % every === 0) {
      if (cheb(e, p) <= P.stomp) { startCharge(S, e, ev, areaTiles(run, e, P.stomp), P.stompMult, enraged ? 1 : 2, 'が大きく身構えた！周りを攻撃してくる！'); return true; }
      const ddx = p.x - e.x, ddy = p.y - e.y;
      if ((ddx === 0 || ddy === 0 || Math.abs(ddx) === Math.abs(ddy)) && cheb(e, p) <= P.line) {
        const tiles = lineTiles(run, e, Math.sign(ddx), Math.sign(ddy), P.line);
        if (tiles.some((t) => t.x === p.x && t.y === p.y)) { startCharge(S, e, ev, tiles, P.lineMult, enraged ? 1 : 2, 'がこちらをにらみ、力をためている！一直線に来る！'); return true; }
      }
    }
    return false;
  }

  function supportHeal(S, e, ev) {
    const run = S.run, E = D.ENEMIES[e.type];
    if ((e.cd || 0) > 0) { e.cd--; return false; }
    const hurt = run.enemies.filter((o) => o !== e && o.hp < o.maxhp * 0.7 && cheb(o, e) <= 5 && !o.boss)
      .sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
    if (!hurt) return false;
    const n = Math.round(hurt.maxhp * E.heal);
    hurt.hp = Math.min(hurt.maxhp, hurt.hp + n);
    e.cd = 3;
    if (G.isVisible(run, e.x, e.y) || G.isVisible(run, hurt.x, hurt.y)) {
      G.log(run, E.name + 'が' + D.ENEMIES[hurt.type].name + 'を回復した！');
      ev.push({ t: 'enemyHeal', x: hurt.x, y: hurt.y, n });
    }
    return true;
  }

  function steal(S, e, ev) {
    const run = S.run, E = D.ENEMIES[e.type];
    const n = Math.min(run.runGold, Math.max(10, Math.round(run.runGold * 0.15)));
    run.runGold -= n; e.stolen = (e.stolen || 0) + n;
    e.flee = true;
    G.log(run, E.name + 'に' + n + 'G盗まれた！倒せば取り返せる。');
    ev.push({ t: 'steal', x: run.player.x, y: run.player.y, n });
    // 見えない場所へ逃げる
    for (let i = 0; i < 20; i++) {
      const t = DG.randomRoomTile(run.rng, R.pick(run.rng, run.map.rooms));
      if (G.isVisible(run, t.x, t.y) || G.enemyAt(run, t.x, t.y) || G.itemAt(run, t.x, t.y)) continue;
      e.x = t.x; e.y = t.y; e.tx = e.ty = null;
      break;
    }
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
    G.log(run, E.name + (ranged ? (E.ai === 'magic' ? 'の光の矢！' : 'の吹き矢！') : 'の攻撃！') + 'たけは' + dmg + 'のダメージ。');
    ev.push({ t: 'hit', x: p.x, y: p.y, n: dmg, target: 'player' });
    if (p.hp <= 0) { die(S, E.name + 'にやられた'); return; }
    // 毒（治ったあとしばらくはかからない＝連続しない）
    if (E.ai === 'poison' && !p.poison && !p.poisonGuard && R.chance(run.rng, D.POISON.chance)) {
      if (G.hasAcc(run, 'poison')) { G.log(run, '毒よけの指輪が毒を防いだ！'); return; }
      p.poison = D.POISON.turns;
      G.log(run, 'たけは毒におかされた！（やくそう・どくけしそうで治る）');
      ev.push({ t: 'warn', msg: '毒になった！' });
    }
  }

  function stepTo(run, e, nx, ny) {
    if (!G.canStep(run.map, e.x, e.y, nx - e.x, ny - e.y) || blockedForEnemy(run, nx, ny) || (nx === run.player.x && ny === run.player.y)) return false;
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
        if (k !== goal && blockedForEnemy(run, nx, ny)) continue;
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

  // ボスの行動（js/bossai.js）が使う道具箱
  function damagePlayer(S, e, dmg, ev, label, opts) {
    const run = S.run, p = run.player;
    p.hp -= dmg;
    G.log(run, label + '！ たけは' + dmg + 'のダメージ。');
    ev.push({ t: 'hit', x: p.x, y: p.y, n: dmg, target: 'player', big: !!(opts && opts.big) });
    if (p.hp <= 0) die(S, label + 'にやられた');
  }
  // 床の危険を置く：moves＝発動までにたけが動ける回数
  function addHazard(run, x, y, kind, moves, dmg, name, cap) {
    if (!DG.passable(run.map, x, y)) return;
    if (run.hazards.some((h) => h.x === x && h.y === y)) return;
    run.hazards.push({ x, y, kind, t: moves + 1, dmg, name, cap });
  }
  const H = { startCharge, areaTiles, lineTiles, makeEnemy, stepToward, stepTo, stepAway, randomStep, moveEnemy, adjacent, cheb,
    enemyAttack, calcDamage, damagePlayer, addHazard, die, STEP8 };
  G._H = H;

  // ---------- 探索の終了 ----------
  /* HPが0になったとき。命つなぎの首飾りを装備していれば、倒れる処理（所持品を失う・村へ戻る）より先に一度だけ立ち上がる。
   * 戻り値：本当に倒れたら true。立ち上がったら false（呼び出し側はそのまま処理を続ける）。
   * 立ち上がった同じターンの残りの攻撃では倒れない（HPは1で止まる）。次のターンからは普通にダメージで倒れる（無敵は残らない）。 */
  function die(S, cause) {
    const run = S.run, p = run.player;
    if (p.reviveTurn === run.turn) { p.hp = Math.max(1, p.hp); return false; }
    const neck = G.equipped(run.bag, 'accessory');
    if (neck && G.def(neck).acc === 'revive') {
      run.bag.splice(run.bag.indexOf(neck), 1);
      p.hp = p.maxhp;
      p.hunger = Math.max(p.hunger, Math.ceil(D.PLAYER.maxHunger * 0.3));
      p.poison = 0; p.bound = 0; p.starveAcc = 0;
      p.reviveTurn = run.turn;
      p.lowWarned = false;
      run.revived = true;
      G.log(run, '命つなぎの首飾りが光った！ たけは立ち上がった！（首飾りはくだけた）');
      return false;
    }
    run.player.hp = 0;
    run.over = true;
    run.result = { type: 'dead', cause, floor: run.floor, lostGold: run.runGold, lostItems: run.bag.filter((i) => i.id !== 'return_scroll').length };
    G.log(run, 'たけは倒れてしまった…。');
    return true;
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
      // （以前の版の「願いの宝珠」によるクリアは廃止。エンディングは最終章で迎える）
    }
    applyStoryOnReturn(S, run, res);
    // 貸出品が重複しないよう念のため1つずつに
    dedupeLoans(V);
    V.lastResult = res;
    S.run = null;
    return res;
  };

  /* 村へ帰ったときの章の進行（帰還でも敗北でも、撃破済みなら章を進める。過去の章はやり直さない）。
   * 支援金は rewardClaimed で1回だけ。進んだあと村で見せる会話は story.pending に残す（読み込み直しても失われない）。 */
  function applyStoryOnReturn(S, run, res) {
    const V = S.village, st = V.story, ch = G.chapterOf(run);
    if (ch === 'legacy') return;
    if (run.final && run.final.stage !== 'won') { st.finalStage = 'none'; st.defeated.vearn = st.defeated.vearn && st.endingDone; }
    const C = D.CHAPTERS[st.chapter];
    if (!C.final && ch === st.chapter && st.defeated[C.boss] && !st.returnDone[C.boss]) {
      if (!st.rewardClaimed[C.boss]) { st.rewardClaimed[C.boss] = true; V.funds += C.reward.funds; res.rewardFunds = C.reward.funds; }
      st.returnDone[C.boss] = true;
      st.records = Math.max(st.records, st.chapter + 1);
      res.chapterClear = st.chapter;
      st.chapter++;
      st.pending = { type: 'chapterClear', chapter: res.chapterClear, funds: res.rewardFunds || 0 };
    } else if (C.final && ch === D.FINAL_CHAPTER && st.defeated.truevearn && run.final && run.final.stage === 'won') {
      if (!st.rewardClaimed.truevearn) { st.rewardClaimed.truevearn = true; V.funds += C.reward.funds; res.rewardFunds = C.reward.funds; }
      res.finalClear = true;
      res.firstEnding = !st.endingDone;
      st.returnDone.truevearn = true;
      st.records = D.STORY.records.length;
      st.finalStage = 'none';
      V.cleared = true; V.clears++;
      if (!st.endingDone) st.pending = { type: 'ending' };
      st.endingDone = true;
    }
  }

  function dedupeLoans(V) {
    for (const id of ['wood_sword', 'loan_rice']) {
      let seen = false;
      V.bag = V.bag.filter((i) => { if (i.id !== id) return true; if (seen) return false; seen = true; return true; });
    }
  }

  // ---------- 村 ----------
  G.storageSize = (V) => D.STORAGE_SIZE[V.storageLv || 1];
  // お店の品ぞろえ：村の段階＋これまでの章の「ボスに備える道具」
  G.shopStock = function (V) {
    const base = D.SHOP_STOCK[Math.min(3, V.stage)].slice();
    const ch = (V.story && V.story.chapter) || 1;
    for (let c = 1; c <= ch; c++) for (const id of (D.CHAPTERS[c].shop || [])) if (!base.includes(id)) base.push(id);
    return base;
  };

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

  // ---- 施設・飾り ----
  G.facility = (id) => D.FACILITIES.find((f) => f.id === id);
  G.hasFacility = (V, id) => !!(V.built && V.built[id]);
  G.donatedCount = (V) => Object.keys(V.donated || {}).length;
  G.reqMet = function (V, r) {
    if (r.startsWith('floor')) return V.bestFloor >= +r.slice(5);
    if (r.startsWith('donate')) return G.donatedCount(V) >= +r.slice(6);
    return G.hasFacility(V, r);
  };
  /* 購入前に確認できる状態：{ built, unlocked, missing:[未達の条件], affordable, lackMats } */
  G.facilityStatus = function (S, id) {
    const V = S.village, f = G.facility(id);
    const missing = f.req.filter((r) => !G.reqMet(V, r));
    const lackMats = Object.entries(f.mats || {}).filter(([m, n]) => (V.materials[m] || 0) < n).map(([m, n]) => [m, n - (V.materials[m] || 0)]);
    return { built: G.hasFacility(V, id), unlocked: !missing.length, missing, affordable: V.funds >= f.price, lackMats };
  };
  G.buildFacility = function (S, id) {
    const V = S.village, f = G.facility(id);
    if (!f) return { ok: false, msg: '見つかりません。' };
    const st = G.facilityStatus(S, id);
    if (st.built) return { ok: false, msg: 'もう完成しています。' };
    if (!st.unlocked) return { ok: false, msg: 'まだ建てられません：' + st.missing.map((r) => D.REQ_TEXT[r]).join('、') };
    if (!st.affordable) return { ok: false, msg: '資金が足りません。（' + f.price + 'G 必要）' };
    if (st.lackMats.length) return { ok: false, msg: '素材が足りません：' + st.lackMats.map(([m, n]) => D.ITEMS[m].name + '×' + n).join('、') };
    V.funds -= f.price;
    for (const [m, n] of Object.entries(f.mats || {})) V.materials[m] -= n;
    V.built[id] = true;
    G.applyFacilities(V);
    return { ok: true, msg: '「' + f.name + '」が完成した！' };
  };
  // 建てた施設から村の各段階を決める（旧セーブの stage とも整合させる）
  G.applyFacilities = function (V) {
    V.built = V.built || {}; V.decor = V.decor || {};
    if (V.stage >= 2) V.built.storage2 = true;
    if (V.stage >= 3) V.built.smith1 = true;
    if (V.storageLv >= 3) V.built.storage3 = true;
    if (V.storageLv >= 4) V.built.storage4 = true;
    if (V.smithLv >= 2) V.built.smith2 = true;
    if (V.smithLv >= 3) V.built.smith3 = true;
    const b = V.built;
    V.stage = Math.max(V.stage || 1, b.smith1 ? 3 : b.storage2 ? 2 : 1);
    V.storageLv = b.storage4 ? 4 : b.storage3 ? 3 : b.storage2 ? 2 : 1;
    V.smithLv = b.smith3 ? 3 : b.smith2 ? 2 : b.smith1 ? 1 : 0;
    V.diner = !!b.diner; V.museum = !!b.museum;
    for (const f of D.FACILITIES) if (f.kind === 'decor') V.decor[f.id] = !!b[f.id];
  };
  // 旧API（村の発展を1段階進める）
  G.upgradeVillage = function (S) {
    const V = S.village;
    const id = !G.hasFacility(V, 'storage2') ? 'storage2' : !G.hasFacility(V, 'smith1') ? 'smith1' : null;
    if (!id) return { ok: false, msg: '村はこれ以上発展できません。' };
    return G.buildFacility(S, id);
  };
  // 次に目指せる買い物（村の画面に表示）
  /* 村の発展の一覧に出す項目：まだ完成していないものだけ。倉庫・鍛冶屋の段階式の拡張は、いちばん手前の未完成の段階だけ */
  G.unbuiltFacilities = function (V) {
    const seen = {};
    return D.FACILITIES.filter((f) => {
      if (G.hasFacility(V, f.id)) return false;
      const m = /^(storage|smith)\d$/.exec(f.id);
      if (!m) return true;
      if (seen[m[1]]) return false;
      seen[m[1]] = true; return true;
    });
  };
  G.nextGoals = function (S) {
    const V = S.village;
    const list = D.FACILITIES.filter((f) => !G.hasFacility(V, f.id)).map((f) => ({ f, st: G.facilityStatus(S, f.id) }));
    const ready = list.filter((x) => x.st.unlocked && !x.st.lackMats.length).sort((a, b) => a.f.price - b.f.price);
    const can = ready.filter((x) => x.st.affordable);
    const next = ready.find((x) => !x.st.affordable);
    return { can: can.map((x) => x.f), next: next ? next.f : null, need: next ? next.f.price - V.funds : 0 };
  };

  // ---- 鍛冶屋 ----
  G.smithMax = (V) => D.SMITH.maxPlusByLv[V.smithLv || 0];
  G.smithCost = (it) => D.SMITH.cost(it.plus || 0);
  G.smithMats = (it) => D.SMITH.mats(it.plus || 0);
  G.canSmith = function (V, it) {
    const t = G.def(it).type;
    return (V.smithLv || 0) >= 1 && (t === 'weapon' || t === 'shield') && !G.def(it).loan && (it.plus || 0) < G.smithMax(V);
  };
  G.smith = function (S, uid) {
    const V = S.village;
    const it = V.bag.find((i) => i.uid === uid) || V.storage.find((i) => i.uid === uid);
    if (!it) return { ok: false, msg: '見つかりません。' };
    if (!V.smithLv) return { ok: false, msg: '鍛冶屋がまだありません。' };
    if (!G.canSmith(V, it)) return { ok: false, msg: (it.plus || 0) >= G.smithMax(V) && G.smithMax(V) < D.SMITH.maxPlus ? '今の設備ではここまで。鍛冶屋を拡張しよう。' : 'これ以上強化できません。' };
    const cost = G.smithCost(it), mats = G.smithMats(it);
    if (V.funds < cost) return { ok: false, msg: 'お金が足りません。（' + cost + 'G 必要）' };
    for (const [m, n] of Object.entries(mats)) if ((V.materials[m] || 0) < n) return { ok: false, msg: '素材が足りません：' + D.ITEMS[m].name + '×' + n };
    V.funds -= cost;
    for (const [m, n] of Object.entries(mats)) V.materials[m] -= n;
    it.plus = (it.plus || 0) + 1;
    return { ok: true, msg: G.itemName(it) + 'に強化した！' };
  };

  // ---- 食堂 ----
  G.buyMeal = function (S, id) {
    const V = S.village, m = D.MEALS[id];
    if (!V.diner) return { ok: false, msg: '食堂がまだありません。' };
    if (!m) return { ok: false, msg: '見つかりません。' };
    if (V.meal === id) return { ok: false, msg: 'もう注文しています。' };
    if (V.funds < m.price) return { ok: false, msg: 'お金が足りません。' };
    V.funds -= m.price;
    V.meal = id; // 前の料理は上書き（重ねがけしない・払い戻しなし）
    return { ok: true, msg: m.name + 'を注文した。次の探索だけ効果がある。' };
  };

  // ---- 展示室 ----
  G.canDonate = (V, it) => !!V.museum && D.MUSEUM_ITEMS.includes(it.id) && !(V.donated || {})[it.id];
  G.donate = function (S, uid) {
    const V = S.village;
    const it = V.bag.find((i) => i.uid === uid) || V.storage.find((i) => i.uid === uid);
    if (!it) return { ok: false, msg: '見つかりません。' };
    if (!V.museum) return { ok: false, msg: '展示室がまだありません。' };
    if (!D.MUSEUM_ITEMS.includes(it.id)) return { ok: false, msg: 'これは展示できません。' };
    if (V.donated[it.id]) return { ok: false, msg: '同じお宝はもう飾ってあります。' };
    const before = G.title(V);
    (V.bag.includes(it) ? V.bag : V.storage).splice((V.bag.includes(it) ? V.bag : V.storage).indexOf(it), 1);
    V.donated[it.id] = true;
    const thanks = Math.floor(G.def(it).sell * D.MUSEUM_THANKS);
    V.funds += thanks;
    const after = G.title(V);
    return { ok: true, msg: G.def(it).name + 'を寄贈した。お礼に' + thanks + 'G。', thanks, newTitle: after !== before ? after : null };
  };
  G.title = function (V) {
    let t = null;
    for (const [n, name] of D.TITLES) if (G.donatedCount(V) >= n) t = name;
    return t;
  };

  /* 貸出品：旅人のおにぎりだけ、持っていないときに1つ借りられる（売却・預入不可なので増やせない）。
   * かしだしの木刀の貸し出しは廃止（2026年10月）。木刀という道具は残すので、すでに持っている木刀はそのまま使える。 */
  G.loanStatus = function (S) {
    const V = S.village;
    return {
      weapon: false,
      food: !V.bag.some((i) => i.id === 'loan_rice'),
    };
  };
  G.takeLoan = function (S, kind) {
    const V = S.village;
    if (kind !== 'food') return { ok: false, msg: '木刀の貸し出しは終わりました。' };
    const id = 'loan_rice';
    if (!G.loanStatus(S)[kind]) return { ok: false, msg: 'もう借りています。' };
    if (V.bag.length >= D.BAG_SIZE) return { ok: false, msg: 'バッグがいっぱいです。' };
    const it = G.makeItem(S, id);
    V.bag.push(it);
    if (kind === 'weapon' && !G.equipped(V.bag, 'weapon')) it.eq = true;
    return { ok: true, msg: D.ITEMS[id].name + 'を借りた。' };
  };

  TS.Game = G;
})(globalThis.TS = globalThis.TS || {});
