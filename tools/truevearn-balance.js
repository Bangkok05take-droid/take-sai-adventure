// 真大魔王バーン（33階）の手ごたえの目安：node tools/truevearn-balance.js [回数]
// 実際のゲームの処理（G.act）で戦わせる。たけ：Lv40・最大HP264・覇者の剣+8（攻78）・覇者の盾+3（防22）・いのちの霊薬3個（全回復）。祈りで全回復した状態から
// たけの動き（簡易AI）：HPが減ったら霊薬（1ターン）。予告の範囲にいれば、範囲の外の隣のマスへ（無ければ攻撃）。それ以外は隣なら攻撃、離れていれば近づく
//   天地魔闘の構えのあいだは殴らずにその場で待つ（よけるAI。STANCE=leave なら離れる）
//   「よけない」：予告も構えも無視して殴り続ける（上限の目安）
const TS = require('../tests/load'); const { Data: D, Game: G, Dungeon: DG } = TS;
const N = +(process.argv[2] || 200);
// 調整の試し：TV='{"hp":1500,"atk":55,"wallCd":[3,2],"endCd":[3,2],"phMult":2.4,"phCd":[3,2],"stCd":[8,6],"stActs":4}' のように上書き
if (process.env.TV) { const o = JSON.parse(process.env.TV), E = D.ENEMIES.truevearn, T = D.TRUEVEARN;
  if (o.hp) E.hp = o.hp; if (o.atk) E.atk = o.atk; if (o.wallCd) T.wall.cd = o.wallCd; if (o.endCd) T.end.cd = o.endCd; if (o.phMult) T.phoenix.mult = o.phMult; if (o.phCd) T.phoenix.cd = o.phCd; if (o.stCd) T.stance.cd = o.stCd; if (o.stActs) T.stance.maxActs = o.stActs; }
const ONLY = process.env.ONLY_DODGE;
function setup(seed) {
  const S = G.newState(), st = S.village.story; st.introDone = true; S.village.seenIntro = true; st.chapter = 6;
  for (const k of ['croc', 'flame', 'kill', 'baran', 'mist', 'vearn']) st.defeated[k] = true;
  st.introSeen = { truevearn: true, truevearnAwaken: true };
  G.depart(S, seed); const r = S.run; r.final.skip.vearn = true;
  while (r.floor < 33) { const t = r.stairs || r.crack; r.enemies = r.enemies.filter((e) => e.boss); r.player.x = t.x; r.player.y = t.y; G.act(S, { type: 'descend' }); }
  if (r.bossFight.intro === 'pending') G.finishBossIntro(S);
  r.bossFight.engaged = true; r.enemies = r.enemies.filter((e) => e.boss);
  const p = r.player; p.lvl = 40; p.maxhp = G.maxHpFor(40); p.hp = p.maxhp; p.hunger = 100;
  r.bag = [];
  const eq = (id, plus) => { const it = G.makeItem(S, id); it.plus = plus; r.bag.push(it); G.act(S, { type: 'equip', uid: it.uid }); };
  eq('hero_sword', 8); eq('hero_shield', 3);
  for (let i = 0; i < 3; i++) r.bag.push(G.makeItem(S, 'elixir'));
  p.hp = p.maxhp; r.turn = 0;
  return S;
}
const DIRS = Object.entries(G.DIRS);
function fight(seed, dodge, healAt) {
  const S = setup(seed), r = S.run, p = r.player;
  let turns = 0, used = 0, taken = 0;
  while (!r.over && r.enemies.some((e) => e.boss) && turns < 400) {
    const b = r.enemies.find((e) => e.boss), danger = new Set();
    for (const e of r.enemies) if (e.charge) for (const t of e.charge.tiles) danger.add(t.x + ',' + t.y);
    const hp0 = p.hp;
    const el = r.bag.find((i) => i.id === 'elixir');
    let act = null;
    if (p.hp <= healAt && el) { act = { type: 'use', uid: el.uid }; used++; }
    else if (dodge && danger.has(p.x + ',' + p.y)) {
      // 範囲の外の隣のマス（ボスに近い方を優先）
      let best = null, bd = 99;
      for (const [d, [dx, dy]] of DIRS) { const x = p.x + dx, y = p.y + dy;
        if (!G.canStep(r.map, p.x, p.y, dx, dy) || G.enemyAt(r, x, y) || danger.has(x + ',' + y)) continue;
        const dd = Math.max(Math.abs(x - b.x), Math.abs(y - b.y)); if (dd < bd) { bd = dd; best = d; } }
      if (best) act = { type: 'move', dir: best };
    }
    // 天地魔闘の構え：殴らずに離れる（よけるAIだけ。予告の範囲には入らない）
    if (!act && dodge && b.stance > 0 && process.env.STANCE !== 'leave') act = { type: 'wait' };   // 既定：構えのあいだは殴らずに待つ（STANCE=leave：離れる）
    if (!act && dodge && b.stance > 0) {
      let best = null, bd = -1;
      for (const [d, [dx, dy]] of DIRS) { const x = p.x + dx, y = p.y + dy;
        if (!G.canStep(r.map, p.x, p.y, dx, dy) || G.enemyAt(r, x, y) || danger.has(x + ',' + y)) continue;
        const dd = Math.max(Math.abs(x - b.x), Math.abs(y - b.y)); if (dd > bd) { bd = dd; best = d; } }
      act = best ? { type: 'move', dir: best } : { type: 'wait' };
    }
    if (!act) {
      const dx = Math.sign(b.x - p.x), dy = Math.sign(b.y - p.y);
      const d = Object.keys(G.DIRS).find((k) => G.DIRS[k][0] === dx && G.DIRS[k][1] === dy);
      const adj = Math.max(Math.abs(b.x - p.x), Math.abs(b.y - p.y)) <= 1;
      act = dodge && !adj && danger.has((p.x + dx) + ',' + (p.y + dy)) ? { type: 'wait' } : { type: 'move', dir: d };   // 隣なら攻撃（移動の向きに敵）。よけるAIは予告のマスへは近づかない
    }
    G.act(S, act); turns++;
    if (p.hp < hp0) taken += hp0 - p.hp;
  }
  const b = r.enemies.find((e) => e.boss);
  return { win: !r.over && !b, turns, used, hpLeft: r.over ? 0 : p.hp, bossLeft: b ? b.hp : 0, taken };
}
for (const [dodge, healAt, name] of [[true, 120, 'よける・HP120以下で霊薬'], [true, 160, 'よける・HP160以下で霊薬'], [false, 120, 'よけない・HP120以下で霊薬']].slice(0, ONLY ? 2 : 3)) {
  let win = 0, turns = 0, used = 0, hpLeft = 0, bossLeft = 0;
  for (let i = 0; i < N; i++) { const o = fight(9000 + i, dodge, healAt); win += o.win; turns += o.turns; used += o.used; hpLeft += o.hpLeft; bossLeft += o.bossLeft; }
  console.log(`${name}：勝ち ${(win / N * 100).toFixed(0)}%・平均 ${(turns / N).toFixed(1)}ターン・霊薬 ${(used / N).toFixed(2)}個・残りHP ${(hpLeft / N).toFixed(0)}・負けたときのボスの残りHP平均 ${(bossLeft / Math.max(1, N - win)).toFixed(0)}`);
}
console.log('真大魔王バーン', JSON.stringify({ hp: D.ENEMIES.truevearn.hp, atk: D.ENEMIES.truevearn.atk, def: D.ENEMIES.truevearn.def }), JSON.stringify(D.TRUEVEARN));
