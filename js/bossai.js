/* ボスの行動（このゲーム独自の戦闘設計）。
 * どのボスも通常のターン制を守る：1ターンに1回だけ行動し、大技は必ず「予告（赤いマス／床の数字）」してから次の行動で発動する。
 * 大技のあとには隙（rest）ができ、反撃のチャンスになる。眠り・鈍足も効く（ボスは短め）。
 * 各関数は「行動したら true」。false なら通常どおり（隣なら攻撃、離れていれば近づく）。
 * H はゲーム処理の道具箱（js/game.js の G._H）。 */
(function (TS) {
  'use strict';
  const D = TS.Data, G = TS.Game, DG = TS.Dungeon, R = TS.RNG;
  const AI = {}, RES = {};
  G.BOSS_AI = AI; G.BOSS_RESOLVE = RES;

  const sgn = Math.sign;
  // 8方向の直線上にいれば、その向き
  function aligned(e, p) {
    const dx = p.x - e.x, dy = p.y - e.y;
    if (!(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) return null;
    return [sgn(dx), sgn(dy)];
  }
  // ボス部屋（ボスのいる部屋）
  // ボス部屋（階を作ったときに決めた部屋。ボスがどこにいても同じ部屋。以前はボスのいる部屋で、通路に出ると別の部屋になっていた）
  const arena = (run, e) => run.bossFight || DG.roomAt(run.map, e.x, e.y) || run.map.rooms[run.map.rooms.length - 1];
  // たけに気づいているか（霧などで見えなくても、同じ部屋にいれば戦い続ける）
  function aware(run, e, sees) {
    if (sees) e.awake = true;
    const r = arena(run, e), p = run.player;
    if (r && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) e.awake = true;
    return !!e.awake;
  }
  // 行動ごとに減る待ち時間
  function tick(e) { e.cds = e.cds || {}; for (const k of Object.keys(e.cds)) if (e.cds[k] > 0) e.cds[k]--; e.cycle = (e.cycle || 0) + 1; return e.cds; }
  const say = (run, msg) => G.log(run, msg);
  const freeTiles = (run, room, ok) => {
    const out = [];
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (DG.passable(run.map, x, y) && ok(x, y)) out.push({ x, y });
    return out;
  };

  /* ---------------- クロコダイン：力強い近接攻撃と、直線への突進 ----------------
   * 突進：一直線に並ぶと、壁までの列を予告して突っこむ。横へずれればかわせ、そのあと2ターン動けない。
   * 大斧：隣にいると、たけの列（クロコダインから見て奥へ3マス）を予告して振り下ろす。横へずれればかわせる。 */
  AI.croc = function (S, e, ev, sees, H) {
    const run = S.run, p = run.player;
    if (!aware(run, e, sees)) return false;
    const cd = tick(e), d = H.cheb(e, p), a = aligned(e, p);
    if (!cd.rush && a && d >= 2 && d <= 7) {
      const tiles = H.lineTiles(run, e, a[0], a[1], 12);
      if (tiles.some((t) => t.x === p.x && t.y === p.y)) {
        H.startCharge(S, e, ev, tiles, 1.7, 2, 'が身を低くかまえた！一直線に突進してくる！'); e.charge.fx = 'rush'; // 演出の種類（見た目だけ）
        e.charge.kind = 'rush'; cd.rush = 5;
        return true;
      }
    }
    if (H.adjacent(run, e, p) && !cd.axe && e.cycle % 3 === 0) {
      const dx = sgn(p.x - e.x), dy = sgn(p.y - e.y);
      const tiles = [{ x: p.x, y: p.y }].concat(H.lineTiles(run, { x: p.x, y: p.y }, dx, dy, 2));
      H.startCharge(S, e, ev, tiles, 2.0, 2, 'が大斧を振りかぶった！縦一列に振り下ろす！'); e.charge.fx = 'axe'; // 演出の種類（見た目だけ）
      cd.axe = 4;
      return true;
    }
    return false;
  };
  // 突進の発動：列にそって進み、たけがいれば当たって止まる。いなければ壁の手前まで進む
  RES.rush = function (S, e, ev, c, H) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type];
    let hit = false;
    for (const t of c.tiles) {
      if (t.x === p.x && t.y === p.y) { hit = true; break; }
      if (G.enemyAt(run, t.x, t.y)) break;
      e.x = t.x; e.y = t.y;
    }
    ev.push({ t: 'blast', id: e.id, tiles: c.tiles, fx: c.fx });
    if (hit) H.damagePlayer(S, e, H.calcDamage(run.rng, e.atk * c.mult, G.playerDef(run)), ev, E.name + 'の突進', { big: true });
    else { G.log(run, E.name + 'の突進をかわした！ 今がチャンスだ。'); ev.push({ t: 'miss', x: p.x, y: p.y }); }
  };

  /* ---------------- フレイザード：炎と氷の床が交互に切り替わる ----------------
   * 部屋の半分（2マス幅のしま）に炎、または氷の印。数字が0になる前に印のない床へ移れば当たらない（安全な床は必ず残る）。
   * 印が出ている間は、直線上から火の玉を撃つ。 */
  AI.flame = function (S, e, ev, sees, H) {
    const run = S.run, p = run.player;
    if (!aware(run, e, sees)) return false;
    const cd = tick(e);
    if (cd.floor == null) cd.floor = 2;
    if (!cd.floor && !run.hazards.length) {
      const room = arena(run, e), phase = (e.phase = ((e.phase || 0) + 1) % 4);
      const fire = phase % 2 === 0, shift = phase >= 2 ? 1 : 0;
      const tiles = freeTiles(run, room, (x, y) => !(x === e.x && y === e.y) &&
        (fire ? (((x - room.x) >> 1) + shift) % 2 === 0 : (((y - room.y) >> 1) + shift) % 2 === 0));
      for (const t of tiles) H.addHazard(run, t.x, t.y, fire ? 'fire' : 'ice', 2, e.atk * (fire ? 1.25 : 1.0), fire ? '炎の床' : '氷の床', 0.45);
      say(run, '！ ' + D.ENEMIES[e.type].name + 'が床に' + (fire ? '炎' : '氷') + 'の印を描いた！（数字が0になる前に、印のない床へ）');
      ev.push({ t: 'telegraph', id: e.id, tiles: [], msg: (fire ? '炎' : '氷') + 'の床が来る！' });
      cd.floor = 5;
      return true;
    }
    const a = aligned(e, p), d = H.cheb(e, p);
    if (!cd.ball && a && d >= 2 && d <= 5 && G.clearLine(run, e, p, 5)) {
      cd.ball = 2;
      H.enemyAttack(S, e, Math.round(e.atk * 0.8), ev, true);
      return true;
    }
    return false;
  };

  /* ---------------- キルバーン：分身と罠 ----------------
   * 3人に分かれて立ち位置を入れかえる。分身には影がなく（みやぶりの鏡があれば「幻」の印）、1回当てると消える。
   * 罠：たけのまわりに数字つきの印。0で破裂する（一撃で倒れないよう上限あり）。 */
  AI.kill = function (S, e, ev, sees, H) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type];
    if (!aware(run, e, sees)) return false;
    const cd = tick(e);
    const clones = run.enemies.filter((o) => o.type === 'kill_clone');
    if (!cd.clone && clones.length < 2) {
      const room = arena(run, e);
      const spots = R.shuffle(run.rng, freeTiles(run, room, (x, y) => !G.enemyAt(run, x, y) && Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) >= 2 &&
        Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) <= 4));
      const need = 2 - clones.length;
      if (spots.length > need) {
        const places = [{ x: e.x, y: e.y }].concat(spots.slice(0, need));
        R.shuffle(run.rng, places);
        e.x = places[0].x; e.y = places[0].y;
        for (let i = 1; i < places.length; i++) {
          const c = H.makeEnemy(run, 'kill_clone', places[i].x, places[i].y);
          c.summoned = true; c.hold = 1;
          run.enemies.push(c);
        }
        say(run, E.name + 'が3人に分かれた！' + (G.hasCharm(run, 'truesight') ? 'みやぶりの鏡が本物を映している。' : '（よく見ると、影のない姿がある…）'));
        ev.push({ t: 'summon', x: e.x, y: e.y });
        cd.clone = 8;
        return true;
      }
    }
    if (!cd.trap) {
      const room = arena(run, e);
      const near = R.shuffle(run.rng, freeTiles(run, room, (x, y) => Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) <= 2 && !G.enemyAt(run, x, y)));
      const set = near.slice(0, 4);
      for (const t of set) H.addHazard(run, t.x, t.y, 'trap', 2, e.atk * 1.2, '死神の罠', 0.35);
      say(run, '！ ' + E.name + 'が足元に罠をばらまいた！（数字が0で破裂する。印のない床へ）');
      ev.push({ t: 'telegraph', id: e.id, tiles: [], msg: '罠がしかけられた！' });
      cd.trap = 4;
      return true;
    }
    return false;
  };

  /* ---------------- バラン：剣技と雷 ----------------
   * 剣技：隣で構え、向きの直線4マスを予告。横へずれればかわせ、そのあと2ターンの隙。
   * 雷撃：たけのまわり3×3に雷の印（2回動けば外へ出られる）。HPが半分を切ると間隔が短くなる。 */
  AI.baran = function (S, e, ev, sees, H) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type];
    if (!aware(run, e, sees)) return false;
    const cd = tick(e);
    const enraged = e.hp < e.maxhp * 0.5;
    if (enraged && !e.enraged) { e.enraged = true; say(run, E.name + 'の額の紋章が輝いた！ 雷の間隔が短くなる！'); }
    if (cd.bolt == null) cd.bolt = 2;
    if (!cd.bolt && !run.hazards.length) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) H.addHazard(run, p.x + dx, p.y + dy, 'bolt', 2, e.atk * 1.2, '竜の雷撃', 0.5);
      say(run, '！ ' + E.name + 'が剣を天にかかげた！ 雷が落ちてくる！（3×3の印から出よう）');
      ev.push({ t: 'telegraph', id: e.id, tiles: [], msg: '雷が落ちてくる！' });
      cd.bolt = enraged ? 4 : 5;
      return true;
    }
    if (H.adjacent(run, e, p) && !cd.sword && e.cycle % 2 === 0) {
      const tiles = H.lineTiles(run, e, sgn(p.x - e.x), sgn(p.y - e.y), 4);
      H.startCharge(S, e, ev, tiles, 2.0, 2, 'が剣を低く構えた！ 一直線の剣技が来る！'); e.charge.fx = 'sword'; // 演出の種類（見た目だけ）
      cd.sword = 3;
      return true;
    }
    return false;
  };

  /* ---------------- ミストバーン：霧・分身・拘束 ----------------
   * 霧：まわり2マスしか見えなくなる（ボスの予告と床の印は霧の中でも表示）。きりばらいの香で晴れる。
   * 闇の糸：一直線を予告し、当たると2ターン移動できない（攻撃・道具・足踏みはできる）。解けたあとしばらくは拘束されない。 */
  AI.mist = function (S, e, ev, sees, H) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type];
    if (!aware(run, e, sees)) return false;
    const cd = tick(e);
    if (!cd.fog && !run.fog) {
      run.fog = 10; G.updateVision(run);
      say(run, E.name + 'のまわりから濃い霧が立ちこめた！（赤い印は霧の中でも見える。きりばらいの香で晴れる）');
      ev.push({ t: 'warn', msg: '霧で見えにくい！' });
      cd.fog = 14;
      return true;
    }
    const shadows = run.enemies.filter((o) => o.type === 'mist_clone');
    if (!cd.clone && shadows.length < 2) {
      const room = arena(run, e);
      const spots = R.shuffle(run.rng, freeTiles(run, room, (x, y) => !G.enemyAt(run, x, y) && Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) >= 2 &&
        Math.max(Math.abs(x - e.x), Math.abs(y - e.y)) <= 3));
      for (const t of spots.slice(0, 2 - shadows.length)) { const c = H.makeEnemy(run, 'mist_clone', t.x, t.y); c.summoned = true; c.hold = 1; run.enemies.push(c); }
      say(run, E.name + 'の影が分かれた！');
      ev.push({ t: 'summon', x: e.x, y: e.y });
      cd.clone = 9;
      return true;
    }
    const a = aligned(e, p), d = H.cheb(e, p);
    if (!cd.bind && a && d >= 1 && d <= 4 && !p.bound && !p.bindGuard) {
      const tiles = H.lineTiles(run, e, a[0], a[1], 5);
      if (tiles.some((t) => t.x === p.x && t.y === p.y)) {
        H.startCharge(S, e, ev, tiles, 0.6, 1, 'が闇の糸をのばしてきた！ 一直線にからめとる！'); e.charge.fx = 'bind'; // 演出の種類（見た目だけ）
        e.charge.kind = 'bind'; cd.bind = 6;
        return true;
      }
    }
    return false;
  };
  RES.bind = function (S, e, ev, c, H) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type];
    ev.push({ t: 'blast', id: e.id, tiles: c.tiles, fx: c.fx });
    if (c.tiles.some((t) => t.x === p.x && t.y === p.y) && !p.bindGuard) {
      const robe = G.robeGuard(run);
      if (!G.sets(run).all3 && !robe) p.bound = 2;   // 3点セット・大魔王のローブ：拘束（状態異常）を受けない
      H.damagePlayer(S, e, H.calcDamage(run.rng, e.atk * c.mult, G.playerDef(run)), ev, E.name + 'の闇の糸', {});
      if (!run.over && p.bound) { G.log(run, 'たけは闇の糸にからめとられた！（2ターン移動できない。攻撃・道具・足踏みはできる）'); ev.push({ t: 'warn', msg: '拘束された！' }); }
      else if (!run.over) G.log(run, robe && !G.sets(run).all3 ? '大魔王のローブが闇の糸をはねのけた！' : '竜の気が闇の糸をはねのけた！');
    } else { G.log(run, E.name + 'の闇の糸をかわした！'); ev.push({ t: 'miss', x: p.x, y: p.y }); }
  };

  /* ---------------- 大魔王バーン（35階・1戦目） ----------------
   * 炎の鳥：直線上を壁まで予告。魔法陣：たけのいる縦と横の列に炎の印（斜めへ動けばかわせる）。手下を呼ぶ。 */
  AI.vearn = function (S, e, ev, sees, H) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type];
    if (!aware(run, e, sees)) return false;
    const cd = tick(e);
    if (cd.circle == null) cd.circle = 3;
    if (!cd.circle && !run.hazards.length) {
      const room = arena(run, e);
      for (const t of freeTiles(run, room, (x, y) => (x === p.x || y === p.y) && !(x === e.x && y === e.y))) H.addHazard(run, t.x, t.y, 'fire', 2, e.atk * 1.1, '魔法陣の炎', 0.45);
      say(run, '！ ' + E.name + 'が魔法陣を描いた！ たけのいる縦と横の列が燃え上がる！（斜めへよけよう）');
      ev.push({ t: 'telegraph', id: e.id, tiles: [], msg: '魔法陣の炎が来る！' });
      cd.circle = 6;
      return true;
    }
    const a = aligned(e, p), d = H.cheb(e, p);
    if (!cd.bird && a && d >= 2) {
      const tiles = H.lineTiles(run, e, a[0], a[1], 12);
      if (tiles.some((t) => t.x === p.x && t.y === p.y)) {
        H.startCharge(S, e, ev, tiles, 1.9, 1, 'の手に巨大な炎の鳥が生まれた！ 一直線に飛んでくる！'); e.charge.fx = 'firebird'; // 演出の種類（見た目だけ）
        cd.bird = 4;
        return true;
      }
    }
    if (!cd.summon && run.enemies.filter((o) => o.summoned).length < 2) {
      const room = arena(run, e);
      const t = R.shuffle(run.rng, freeTiles(run, room, (x, y) => !G.enemyAt(run, x, y) && Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) >= 3))[0];
      cd.summon = 10;
      if (t) { const m = H.makeEnemy(run, 'imp', t.x, t.y); m.summoned = true; m.exp = 20; m.hold = 1; run.enemies.push(m); say(run, E.name + 'が' + D.ENEMIES.imp.name + 'を呼んだ！'); ev.push({ t: 'summon', x: t.x, y: t.y }); return true; }
    }
    return false;
  };

  /* ---------------- 真大魔王バーン（最終決戦。版4は33階・版3は35階） ----------------
   * 2026年10月21日：技を入れ替えた（数値は D.TRUEVEARN。**どれも仮の調整案**）。どの技も「予告（範囲が光る）→ 次の行動で発動」。発動のあとの隙は無い。
   *  カラミティエンド：隣にいると、まわり1マス（8マス）。防御を無視して D.TRUEVEARN.end.dmg（120〜150）
   *  カラミティウォール：3マス以内にいると、まわり3マス（7×7）。防御を無視して 80〜100。1回の移動では外へ出られない
   *  カイザーフェニックス：8方向の直線上にいれば、隣からでも撃つ。たけへの直線と、その両どなりの3列（以前の滅びの炎の範囲）。攻撃力×mult
   *  画面には技名だけを出す（技の説明文は出さない。範囲の予告はそのまま。startCharge の name）
 *  天地魔闘の構え：2マス以内で構える（攻撃しない・最大4行動）。構えている間にたけの攻撃が当たると3倍にしてはね返す。3マス以上離れると構えを解いてカイザーフェニックス
 *  以前の「天地の掌」「魔界の炎の輪」「滅びの炎」は無し。HPが enrageAt 以下で待ち時間が短くなる */
  AI.truevearn = function (S, e, ev, sees, H) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type], TV = D.TRUEVEARN;
    if (!aware(run, e, sees)) return false;
    const cd = tick(e);
    const enraged = e.hp < e.maxhp * TV.enrageAt, ph = enraged ? 1 : 0;
    if (enraged && !e.enraged) { e.enraged = true; say(run, E.name + 'の力がさらに高まった！'); }
    const d = H.cheb(e, p), a = aligned(e, p);
    const fixed = (tiles, key, fx) => {   // 防御を無視する技（ダメージは発動のときに決める）
      H.startCharge(S, e, ev, tiles, 0, 0, '', TV[key].name); e.charge.kind = 'fixedDmg'; e.charge.fx = fx; e.charge.dmg = TV[key].dmg; e.charge.label = TV[key].name;
      cd[key] = TV[key].cd[ph];
      return true;
    };
    // カイザーフェニックス：向き a の直線（12マス）と、その両どなりの列（3列）
    const phoenix = (a) => {
      const center = H.lineTiles(run, e, a[0], a[1], 12), px = -a[1], py = a[0], tiles = center.slice();
      for (const s of [1, -1]) for (const t of center) { const x = t.x + px * s, y = t.y + py * s; if (DG.passable(run.map, x, y) && !tiles.some((o) => o.x === x && o.y === y)) tiles.push({ x, y }); }
      H.startCharge(S, e, ev, tiles, TV.phoenix.mult, 0, '', 'カイザーフェニックス'); e.charge.fx = 'firebird';
      cd.phoenix = TV.phoenix.cd[ph];
      return true;
    };
    // 天地魔闘の構え（e.stance＝構えていられる残りの行動）。構えている間は攻撃しない。反撃は js/game.js の damageEnemy
    const ST = TV.stance;
    if (e.stance > 0) {
      if (d >= ST.breakAt) {   // 離れた：構えを解いて、たけの方へ（いちばん近い8方向）カイザーフェニックス
        e.stance = 0;
        const ang = Math.round(Math.atan2(p.y - e.y, p.x - e.x) / (Math.PI / 4)) * Math.PI / 4;
        say(run, E.name + 'は構えを解いた。');
        return phoenix([Math.round(Math.cos(ang)), Math.round(Math.sin(ang))]);
      }
      if (--e.stance > 0) return true;   // 構えたまま（説明の文は出さない）
      say(run, E.name + 'は構えを解いた。');
    } else if (!cd.stance && d <= ST.range) {
      e.stance = ST.maxActs; cd.stance = ST.cd[ph] + ST.maxActs;
      say(run, E.name + '：' + ST.name);
      ev.push({ t: 'stance', id: e.id, name: ST.name });
      return true;
    }
    if (H.adjacent(run, e, p) && !cd.end) return fixed(H.areaTiles(run, e, 1), 'end', 'calamityEnd');
    if (a && !cd.phoenix && H.lineTiles(run, e, a[0], a[1], 12).some((t) => t.x === p.x && t.y === p.y)) return phoenix(a);
    if (d <= TV.wall.radius && !cd.wall) return fixed(H.areaTiles(run, e, TV.wall.radius), 'wall', 'calamityWall');
    return false;   // 通常攻撃（隣）か、近づく
  };
  // 防御を無視する技の発動（カラミティエンド・カラミティウォール）：範囲にいれば c.dmg の幅でダメージ
  RES.fixedDmg = function (S, e, ev, c, H) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type];
    ev.push({ t: 'blast', id: e.id, tiles: c.tiles, fx: c.fx });
    if (c.tiles.some((t) => t.x === p.x && t.y === p.y)) H.damagePlayer(S, e, R.int(run.rng, c.dmg[0], c.dmg[1]), ev, E.name + 'の' + c.label, { big: true });
    else { G.log(run, E.name + 'の' + c.label + 'をかわした！'); ev.push({ t: 'miss', x: p.x, y: p.y }); }
  };
  /* ---------------- 竜魔神バラン（隠しダンジョン35階の裏ボス） ----------------
   * 数値は D.DRAGON_KING。技の順：竜闘気（条件を満たしたとき）→ ギガブレイクのなぎ払い（隣）→ ギガブレイクの突進（一直線 minDist〜range マス）→ ドルオーラ（一直線 minDist〜range マス）→ 通常攻撃・移動。
   * ドルオーラ・ギガブレイクは予告1ターン（向きと範囲は予告のときに決まり、発動まで変えない）→ 次の行動で発動。
   * 竜闘気の間（e.dora＝残りのターン）は1ターンに2回、通常攻撃か移動だけ。防御は上がる（e.def）。終わると1ターン動けない（e.rest） */
  AI.dragonbaran = function (S, e, ev, sees, H) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type], K = D.DRAGON_KING;
    if (!aware(run, e, sees)) return false;
    const cd = tick(e);
    if (!e.enraged && e.hp <= e.maxhp * K.enrageAt) {
      e.enraged = true; e.atk = Math.round(e.atk * K.aura);
      say(run, E.name + 'のドラゴニックオーラが強まった！ 攻撃が重くなった！');
      ev.push({ t: 'warn', msg: 'ドラゴニックオーラが強まった！' });
    }
    // 竜闘気の間：通常攻撃か移動を2回（隣なら攻撃、離れていれば近づく。1回目で隣になれば2回目は攻撃）
    if (e.dora > 0) {
      for (let k = 0; k < K.dora.acts && run.enemies.includes(e) && !run.over; k++) {
        if (H.adjacent(run, e, p)) H.enemyAttack(S, e, e.atk, ev, false);
        else { e.tx = p.x; e.ty = p.y; H.moveEnemy(run, e); }
      }
      if (--e.dora <= 0) {   // 終わり：オーラがはじけて消える → 1ターン動けない（ポーズはふだんのまま）
        e.dora = 0; e.def = e.doraDef != null ? e.doraDef : E.def; e.doraDef = null;
        e.rest = K.dora.rest; cd.dora = K.dora.cd;
        say(run, E.name + 'の竜闘気がはじけて消えた。');
        ev.push({ t: 'doraEnd', id: e.id });
      }
      return true;
    }
    if (!cd.dora && e.hp <= e.maxhp * K.dora.at) {
      e.dora = K.dora.turns; e.doraDef = e.def; e.def = Math.round(e.def * K.dora.def); cd.dora = 999;   // 次に使えるのは終わってから cd 行動のあと
      say(run, '！ ' + E.name + '：' + K.dora.name + '（ドウラ）');
      ev.push({ t: 'dora', id: e.id, name: K.dora.name });
      return true;
    }
    const d = H.cheb(e, p), a = aligned(e, p);
    // ギガブレイク（なぎ払い）：隣にいるとき、まわり1マスを予告
    if (d === 1 && H.adjacent(run, e, p) && !cd.sweep) {
      H.startCharge(S, e, ev, H.areaTiles(run, e, 1), K.sweep.mult, 0, '', K.sweep.name);
      Object.assign(e.charge, { kind: 'gigasweep', fx: 'giga' });
      cd.sweep = K.sweep.cd;
      return true;
    }
    if (!a || d < 2) return false;   // 通常攻撃（隣）か、近づく
    const onLine = (tiles) => tiles.some((t) => t.x === p.x && t.y === p.y);
    if (!cd.giga && d >= K.giga.minDist && d <= K.giga.range) {
      const tiles = H.lineTiles(run, e, a[0], a[1], K.giga.range);
      if (onLine(tiles)) {
        H.startCharge(S, e, ev, tiles, K.giga.mult, 0, '', K.giga.name);
        Object.assign(e.charge, { kind: 'gigabreak', fx: 'giga', dir: a });
        cd.giga = K.giga.cd;
        return true;
      }
    }
    if (!cd.doruora && d >= K.doruora.minDist && d <= K.doruora.range) {
      const tiles = H.lineTiles(run, e, a[0], a[1], K.doruora.range);
      if (onLine(tiles)) {
        H.startCharge(S, e, ev, tiles, K.doruora.mult, K.doruora.rest, '', K.doruora.name);
        Object.assign(e.charge, { fx: 'doruora', dir: a });
        cd.doruora = K.doruora.cd;
        return true;
      }
    }
    return false;
  };
  /* ギガブレイク（なぎ払い）の発動：予告したまわりのマス（c.tiles）にたけがいれば当たり、たけを1マス後ろ（バランから離れる向き）へ押す。
   * 押す先が壁・通れない所・ほかの敵なら、その場のまま。隙は無い */
  RES.gigasweep = function (S, e, ev, c, H) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type], K = D.DRAGON_KING.sweep;
    const hit = c.tiles.some((t) => t.x === p.x && t.y === p.y), dx = sgn(p.x - e.x), dy = sgn(p.y - e.y);
    let pushed = null;
    if (hit && (dx || dy)) {
      const nx = p.x + dx, ny = p.y + dy;
      if (G.canStep(run.map, p.x, p.y, dx, dy) && DG.passable(run.map, nx, ny) && !G.enemyAt(run, nx, ny)) pushed = { x: nx, y: ny };
    }
    const at = { x: p.x, y: p.y };
    if (pushed) { p.x = pushed.x; p.y = pushed.y; if (G.updateVision) G.updateVision(run); }
    e.dir = G.dirOf(dx, dy) || e.dir;
    ev.push({ t: 'gigaSweep', id: e.id, tiles: c.tiles, hit: hit ? at : null, pushed, dir: [dx, dy] });
    if (hit) H.damagePlayer(S, e, H.calcDamage(run.rng, e.atk * K.mult, G.playerDef(run)), ev, E.name + 'の' + K.name, { big: true });
    else { G.log(run, E.name + 'の' + K.name + 'をかわした！'); ev.push({ t: 'miss', x: p.x, y: p.y }); }
  };
  /* ギガブレイクの発動：予告した直線（c.tiles。向き c.dir）を一気に突進する。途中のマスを飛ばさずに1マスずつ調べ、たけがいれば1回だけ当たる（通り抜ける）。
   * 壁・通れない所・ほかの敵の手前で止まる。止まるマスにたけがいれば、たけを1マス先へ押してそのマスで止まる（押せなければ手前で止まる）。隙は無い */
  RES.gigabreak = function (S, e, ev, c, H) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type], K = D.DRAGON_KING.giga, [dx, dy] = c.dir;
    const from = { x: e.x, y: e.y }, path = [];
    let hit = null, pushed = null, x = e.x, y = e.y;
    for (const t of c.tiles) {
      if (!G.canStep(run.map, x, y, dx, dy) || !DG.passable(run.map, t.x, t.y)) break;
      const o = G.enemyAt(run, t.x, t.y); if (o && o !== e) break;
      x = t.x; y = t.y; path.push(t);
      if (t.x === p.x && t.y === p.y && !hit) hit = { x: t.x, y: t.y };
    }
    let stop = path.length ? path[path.length - 1] : from;
    if (stop.x === p.x && stop.y === p.y) {   // 止まるマスにたけ：1マス押す。押せなければ手前で止まる
      const nx = p.x + dx, ny = p.y + dy;
      if (G.canStep(run.map, p.x, p.y, dx, dy) && DG.passable(run.map, nx, ny) && !G.enemyAt(run, nx, ny)) pushed = { x: nx, y: ny };
      else { path.pop(); stop = path.length ? path[path.length - 1] : from; }
    }
    e.x = stop.x; e.y = stop.y; e.dir = G.dirOf(dx, dy) || e.dir;
    if (pushed) { p.x = pushed.x; p.y = pushed.y; if (G.updateVision) G.updateVision(run); }
    ev.push({ t: 'gigaBreak', id: e.id, from, to: { x: stop.x, y: stop.y }, dir: [dx, dy], path: path.slice(), hit, pushed });
    if (hit) H.damagePlayer(S, e, H.calcDamage(run.rng, e.atk * K.mult, G.playerDef(run)), ev, E.name + 'の' + K.name, { big: true });
    else { G.log(run, E.name + 'の' + K.name + 'をかわした！'); ev.push({ t: 'miss', x: p.x, y: p.y }); }
  };
})(globalThis.TS = globalThis.TS || {});
