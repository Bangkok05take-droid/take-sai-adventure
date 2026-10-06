// ボス戦の見た目の確認：node tests/capture-bosses.js <保存先>
// 各章の30階（最終章は35階）で、ボスの近くに立って数ターン進め、予告・床の印・分身・霧などが出た状態を撮る。
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const path = require('path'), fs = require('fs');
const { start, BASE } = require('./serve');
const OUT = process.argv[2] || path.join(__dirname, 'screenshots', 'bosses');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const srv = await start(8782);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`http://localhost:8782${BASE}`); await p.waitForTimeout(600);
  const closeTalk = async () => { for (let i = 0; i < 20 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(50); } };
  const setup = (ch, floor, waits, extra) => p.evaluate(([ch, floor, waits, extra]) => {
    const UI = TS.UI, G = TS.Game;
    UI.S = G.newState(); UI.S.village.story.chapter = ch;
    G.depart(UI.S, 4000 + ch);
    const S = UI.S;
    while (S.run.floor < floor) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
    const r = S.run, b = r.enemies.find((e) => e.boss);
    r.player.hp = r.player.maxhp = 900; r.player.lvl = 25;
    r.player.x = b.x; r.player.y = b.y + 3; G.updateVision(r);
    if (extra === 'mirror') r.bag.push(G.makeItem(S, 'truth_mirror'));
    for (let i = 0; i < waits; i++) G.act(S, { type: 'wait' });
    if (extra === 'prep') { b.hp = 1; b.charge = null; r.hazards = []; r.player.x = b.x; r.player.y = b.y + 1; G.updateVision(r); G.act(S, { type: 'move', dir: 'up' }); }
    if (extra === 'final') { b.hp = 1; b.charge = null; r.hazards = []; r.player.x = b.x; r.player.y = b.y + 1; G.updateVision(r); G.act(S, { type: 'move', dir: 'up' }); G.markFinalCutscene(S); G.startFinalBattle(S);
      const t = r.enemies.find((e) => e.boss); r.player.x = t.x; r.player.y = t.y + 3; G.updateVision(r); for (let i = 0; i < 3; i++) G.act(S, { type: 'wait' }); }
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-dungeon'));
    UI.screen = 'dungeon';
  }, [ch, floor, waits, extra]);
  const shots = [
    [1, 30, 1, null, 'boss1_croc'], [2, 30, 2, null, 'boss2_flame'], [3, 30, 2, 'mirror', 'boss3_kill'],
    [4, 30, 2, null, 'boss4_baran'], [5, 30, 1, null, 'boss5_mist'], [6, 35, 2, null, 'boss6_vearn'], [6, 35, 1, 'final', 'boss7_truevearn'],
  ];
  for (const [ch, f, w, extra, name] of shots) {
    await setup(ch, f, w, extra);
    await p.waitForTimeout(450);
    await p.screenshot({ path: path.join(OUT, name + '.png') });
  }
  // 被弾（白く光って揺れる）と撃破（白く光りながら沈んで消える）：ふつうの操作（UI.doAct）で攻撃して撮る
  for (const [kind, hp] of [['hit', 900], ['die', 1]]) {
    await setup(1, 30, 0, null);
    const dir = await p.evaluate((hp) => { const r = TS.UI.S.run, G = TS.Game, b = r.enemies.find((e) => e.boss); b.hp = hp; b.charge = null; b.cds = { rush: 9, axe: 9 };
      r.player.x = b.x - 1; r.player.y = b.y; G.updateVision(r); TS.UI.lockUntil = 0; TS.UI.doAct({ type: 'move', dir: 'right' }); return 'right'; }, hp);
    await p.waitForTimeout(kind === 'hit' ? 60 : 450);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    await p.screenshot({ path: path.join(OUT, 'boss_' + kind + '.png') });
  }
  // 最終決戦の準備画面
  await setup(6, 35, 0, 'prep');
  await p.evaluate(() => TS.UI.debug.finalCutscene && TS.UI.debug.finalCutscene());
  await p.waitForTimeout(300); await closeTalk(); await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(OUT, 'final_prep.png') });
  await browser.close(); srv.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors', '->', OUT);
})();
