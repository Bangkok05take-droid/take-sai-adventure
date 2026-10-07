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
      p.bound = 2;
      H.damagePlayer(S, e, H.calcDamage(run.rng, e.atk * c.mult, G.playerDef(run)), ev, E.name + 'の闇の糸', {});
      if (!run.over) { G.log(run, 'たけは闇の糸にからめとられた！（2ターン移動できない。攻撃・道具・足踏みはできる）'); ev.push({ t: 'warn', msg: '拘束された！' }); }
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
      if (t) { const m = H.makeEnemy(run, 'imp', t.x, t.y); m.summoned = true; m.exp = 20; m.hold = 1; run.enemies.push(m); say(run, E.name + 'が魔界の小鬼を呼んだ！'); ev.push({ t: 'summon', x: t.x, y: t.y }); return true; }
    }
    return false;
  };

  /* ---------------- 真大魔王バーン（35階・最終決戦） ----------------
   * 天地の掌：隣で周囲8マスを予告（2マス離れればかわせる）、そのあと2ターンの隙。
   * 滅びの炎：直線とその両どなりの3列を予告。魔界の炎：たけを中心に2マス先の輪に印（その場か外へ）。HP4割で加速。 */
  AI.truevearn = function (S, e, ev, sees, H) {
    const run = S.run, p = run.player, E = D.ENEMIES[e.type];
    if (!aware(run, e, sees)) return false;
    const cd = tick(e);
    const enraged = e.hp < e.maxhp * 0.4;
    if (enraged && !e.enraged) { e.enraged = true; say(run, E.name + 'の力がさらに高まった！ 攻撃の間隔が短くなる！'); }
    if (cd.ring == null) cd.ring = 3;
    if (!cd.ring && !run.hazards.length) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === 2 && !(p.x + dx === e.x && p.y + dy === e.y)) H.addHazard(run, p.x + dx, p.y + dy, 'fire', 2, e.atk * 1.0, '魔界の炎', 0.4);
      say(run, '！ ' + E.name + 'が魔界の炎で輪を描いた！（輪の内側か外側へ）');
      ev.push({ t: 'telegraph', id: e.id, tiles: [], msg: '魔界の炎の輪！' });
      cd.ring = enraged ? 4 : 5;
      return true;
    }
    if (H.adjacent(run, e, p) && !cd.palm) {
      H.startCharge(S, e, ev, H.areaTiles(run, e, 1), 2.0, 2, 'が両手に力をためた！ 周りすべてを打つ！（2マス離れよう）'); e.charge.fx = 'palm'; // 演出の種類（見た目だけ）
      cd.palm = enraged ? 3 : 4;
      return true;
    }
    const a = aligned(e, p), d = H.cheb(e, p);
    if (!cd.flame && a && d >= 2) {
      const center = H.lineTiles(run, e, a[0], a[1], 12);
      if (center.some((t) => t.x === p.x && t.y === p.y)) {
        // 進む向きに対して両どなりの列も
        const px = -a[1], py = a[0], tiles = center.slice();
        for (const s of [1, -1]) for (const t of center) { const x = t.x + px * s, y = t.y + py * s; if (DG.passable(run.map, x, y) && !tiles.some((o) => o.x === x && o.y === y)) tiles.push({ x, y }); }
        H.startCharge(S, e, ev, tiles, 1.8, 1, 'が滅びの炎を放とうとしている！ 3列まとめて焼きはらう！'); e.charge.fx = 'doomflame'; // 演出の種類（見た目だけ）
        cd.flame = enraged ? 3 : 4;
        return true;
      }
    }
    return false;
  };
})(globalThis.TS = globalThis.TS || {});
