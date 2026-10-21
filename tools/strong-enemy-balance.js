// 隠しダンジョンの強敵（ドラゴン・シルバーデビル・ギガンテス）の手ごたえの目安：node tools/strong-enemy-balance.js [回数]
// 実際のゲームの処理（G.act）で1対1で戦わせる。たけ：Lv（既定35）・覇者の剣+5・覇者の盾+3。HP満タンから、隣で殴り合う（ドラゴンは3マス離れた一直線から近づく）
// 結果：勝ち・勝ったときに減ったHPの割合（平均）・ターン。敵は32〜34階の強さ（深さで強くなる分を含む）
// 調整の試し：ST='{"dragon":{"hp":160,"atk":40},"silverdevil":{"atk":26}}' のように上書き。LV=40 でレベルを変える
const TS = require('../tests/load'); const { Data: D, Game: G, Dungeon: DG } = TS;
const N = +(process.argv[2] || 100), LV = +(process.env.LV || 35);
if (process.env.ST) for (const [k, o] of Object.entries(JSON.parse(process.env.ST))) Object.assign(D.ENEMIES[k], o);
function setup(seed, type, floor) {
  const S = G.newState(); S.village.story.chapter = 6;
  G.depart(S, seed); const r = S.run; r.floor = floor;
  const m = r.map; m.tiles.fill(DG.WALL); m.rooms = [{ id: 0, x: 2, y: 2, w: 20, h: 12 }];
  for (let y = 2; y < 14; y++) for (let x = 2; x < 22; x++) m.tiles[y * m.w + x] = DG.FLOOR;
  r.enemies = []; r.floorItems = []; r.stairs = { x: 20, y: 12 }; r.returnPoint = null; r.portal = null; r.hazards = [];
  const p = r.player; p.x = 5; p.y = 7; p.lvl = LV; p.maxhp = p.hp = G.maxHpFor(LV); p.hunger = 100;
  r.bag = [];
  const eq = (id, plus) => { const it = G.makeItem(S, id); it.plus = plus; r.bag.push(it); G.act(S, { type: 'equip', uid: it.uid }); };
  eq('hero_sword', 5); eq('hero_shield', 3);
  p.hp = p.maxhp;
  const e = G.makeEnemy(r, type, type === 'dragon' ? 9 : 6, 7); e.awake = true; r.enemies.push(e); G.updateVision(r);
  return S;
}
function fight(seed, type, floor) {
  const S = setup(seed, type, floor), r = S.run, p = r.player, hp0 = p.hp;
  let t = 0;
  while (!r.over && r.enemies.length && t < 200) {
    const e = r.enemies[0], dx = Math.sign(e.x - p.x), dy = Math.sign(e.y - p.y);
    const d = Object.keys(G.DIRS).find((k) => G.DIRS[k][0] === dx && G.DIRS[k][1] === dy);
    G.act(S, { type: 'move', dir: d }); t++;
  }
  return { win: !r.over && !r.enemies.length, lost: (hp0 - Math.max(0, p.hp)) / hp0, t };
}
const p0 = setup(1, 'gigantes', 33).run.player;
console.log(`たけ Lv${LV}：HP${p0.maxhp}・攻撃${G.playerAtk(setup(1, 'gigantes', 33).run)}・防御${G.playerDef(setup(1, 'gigantes', 33).run)}`);
for (const type of ['dragon', 'silverdevil', 'gigantes']) for (const floor of [32, 34]) {
  let win = 0, lost = 0, t = 0;
  for (let i = 0; i < N; i++) { const o = fight(7000 + i, type, floor); win += o.win; lost += o.lost; t += o.t; }
  const e = G.makeEnemy(setup(1, type, floor).run, type, 0, 0);
  console.log(`${D.ENEMIES[type].name} ${floor}階（HP${e.hp}・攻撃${e.atk}・防御${e.def}）：勝ち ${(win / N * 100).toFixed(0)}%・減ったHP ${(lost / N * 100).toFixed(0)}%・${(t / N).toFixed(1)}ターン`);
}
