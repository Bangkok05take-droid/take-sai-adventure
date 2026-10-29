// オリハルコンと勇者の剣・盾のイベント（2026年10月21日）の確認：node tools/orichalcum-events-check.js [出力フォルダ]（既定 docs/orichalcum-events/）
// PCのブラウザ、幅360・390・430。実際の画面の操作で：
//  ① 30階の救援：オオカミの配送を見終えると、ティウが「オリハルコンを町まで持って帰る」と話す（その場では渡さない）
//  ② 村でティウに話しかける → オリハルコンを1個受け取る（2回目は冒険案内）
//  ③ 鍛冶屋（コイ）→ 上限なく鍛えられるという会話（1回だけ。勇者の剣は打たない。2026年10月29日）→ 鍛冶屋の画面（上限なし）。2回目は鍛冶屋だけ
//  ⑤ お宝を全部飾り、村の飾りを全部作ったあと、こもれびの家（モッチャン）→ 勇者の剣の会話 → 剣がバッグに → 村の発展の画面。2回目は村の発展だけ
//  ④ マスターヤナイの像のあと、食堂（ワーン）→ 勇者の盾の会話 → 盾がバッグに → 食堂の画面。2回目は食堂だけ
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'orichalcum-events');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8843;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
// 会話を最後まで読む（読んだ文を返す）
async function readTalk(p) {
  const lines = [];
  for (let i = 0; i < 20 && await p.$('.talk'); i++) {
    lines.push(await p.evaluate(() => { const t = document.querySelector('.talk'); return t.querySelector('.who').textContent + '：' + t.querySelector('.txt').textContent; }));
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(160);
  }
  return lines;
}
const modalTitle = (p) => p.evaluate(() => { const h = document.querySelector('.modal h2'); return h ? h.textContent : ''; });
const closeModals = (p) => p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });

(async () => {
  const b = await chromium.launch();
  for (const [W, H] of [[390, 844], [360, 780], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/*.mp4', (route) => route.fulfill({ status: 404, body: '' }));
    await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
    // ① 30階：大魔王バーンを倒して救援を終えた所（オオカミの配送の演出が残っている）
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 6;
      for (const k of ['croc', 'flame', 'kill', 'baran', 'mist']) st.defeated[k] = true;
      for (const id of ['storage2', 'smith1', 'smith2', 'smith3', 'diner']) V.built[id] = true; G.applyFacilities(V); V.funds = 20000;
      G.depart(S, 5150); const r = S.run;
      while (r.floor < 30) { const t = r.stairs; r.enemies = r.enemies.filter((e) => e.boss); r.player.x = t.x; r.player.y = t.y; G.act(S, { type: 'descend' }); }
      const bo = r.enemies.find((e) => e.boss); r.bossFight.engaged = true; r.bossFight.intro = 'done'; bo.hp = 1; r.player.x = bo.x; r.player.y = bo.y + 1;
      for (let i = 0; i < 8 && r.enemies.some((e) => e.boss); i++) G.act(S, { type: 'move', dir: 'up' });
      if (r.final) { r.final.cutsceneSeen = true; }
      G.commitRescue(S);
      TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(800);
    await p.tap('#btn-continue'); await p.waitForTimeout(1000);
    for (let i = 0; i < 12 && !(await p.isVisible('.modal h2:has-text("オオカミが来た")')); i++) { if (await p.$('.talk')) await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(200); }
    const st0 = await p.evaluate(() => ({ ori: TS.UI.S.village.story.oriTiw, mats: TS.UI.S.village.materials.orichalcum || 0 }));
    chk(st0.ori === 'holding' && st0.mats === 0, `${W} ① 救援を終えると、ティウが預かる（まだ渡さない） ${JSON.stringify(st0)}`);
    chk(await p.isVisible('.modal h2:has-text("オオカミが来た")'), `${W} ① オオカミの配送の演出`);
    await p.tap('.modal-buttons button:has-text("進む")'); await p.waitForTimeout(300);
    if (W === 390) await p.screenshot({ path: path.join(OUT, `1-tiw-rescue-end_${W}.jpg`), quality: 85 });
    const l1 = await readTalk(p);
    chk(l1.length === 1 && /オリハルコンを拾った/.test(l1[0]) && /ティウ/.test(l1[0]), `${W} ① 帰り際のティウの台詞 ${l1.join(' / ')}`);
    // 途中で帰った（または倒れた）ことにして村へ
    await p.evaluate(() => { const S = TS.UI.S; S.run = null; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(800); await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeModals(p); await p.waitForTimeout(200);
    // ② 村のティウ（隣のマスから、ティウの方へ歩く）
    const tiwDir = await p.evaluate(() => { const f = TS.UI.vview.fac.find((f) => f.npc === 'tiw'); const [tx, ty] = f.npcAt, w = TS.UI.walker;
      for (const [d, dx, dy] of [['up', 0, -1], ['right', 1, 0], ['left', -1, 0], ['down', 0, 1]]) { const x = tx - dx, y = ty - dy; if (!TS.UI.vview.solid[y * TS.Village.MW + x]) { w.x = x; w.y = y; w.dir = d; w.path = []; w.moving = false; return d; } } });
    await p.waitForTimeout(300);
    const key = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[tiwDir];
    await p.keyboard.press(key); await p.waitForTimeout(300);
    if (W === 390) await p.screenshot({ path: path.join(OUT, `2-tiw-town_${W}.jpg`), quality: 85 });
    const l2 = await readTalk(p);
    const st2 = await p.evaluate(() => ({ ori: TS.UI.S.village.story.oriTiw, mats: TS.UI.S.village.materials.orichalcum || 0 }));
    chk(/約束のオリハルコン/.test(l2.join()) && st2.ori === 'given' && st2.mats === 1, `${W} ② 町のティウからオリハルコンを1個 ${JSON.stringify(st2)} ${l2.join(' / ')}`);
    await p.keyboard.press(key); await p.waitForTimeout(400);
    const again = await p.evaluate(() => ({ guide: !!TS.UI.tiwGuide && TS.UI.modals.length > 0, talk: !!document.querySelector('.talk'), mats: TS.UI.S.village.materials.orichalcum }));
    chk(again.guide && !again.talk && again.mats === 1, `${W} ② 2回目は冒険案内（二重に受け取らない） ${JSON.stringify(again)}`);
    await closeModals(p); await p.waitForTimeout(200);
    // ③ 鍛冶屋（コイ）
    const f0 = await p.evaluate(() => TS.UI.S.village.funds);
    await p.tap('.fac[data-fac="smith"]'); await p.waitForTimeout(300);
    if (W === 390) await p.screenshot({ path: path.join(OUT, `3-koi-see_${W}.jpg`), quality: 85 });
    const l3 = await readTalk(p);
    const st3 = await p.evaluate(() => { const V = TS.UI.S.village; return { koi: !!V.story.koiOri, mats: V.materials.orichalcum || 0, sword: V.bag.concat(V.storage).filter((i) => i.id === 'hero_sword_relic').length, funds: V.funds }; });
    chk(/オリハルコンじゃねえか/.test(l3.join()) && /上限なし/.test(l3.join()), `${W} ③ コイの会話（アタイ・上限なし） ${l3.join(' / ')}`);
    chk(st3.koi && st3.mats === 1 && st3.sword === 0 && st3.funds === f0, `${W} ③ 勇者の剣は打たない・オリハルコンは減らない ${JSON.stringify(st3)}`);
    const smithTitle = await modalTitle(p), smithText = await p.evaluate(() => (document.querySelector('.modal') || {}).textContent || '');
    chk(/鍛冶屋/.test(smithTitle) && /上限：なし/.test(smithText), `${W} ③ そのまま鍛冶屋の画面（上限なし）`);
    if (W === 390) await p.screenshot({ path: path.join(OUT, `3-smith_${W}.jpg`), quality: 85 });
    await closeModals(p); await p.waitForTimeout(200);
    await p.tap('.fac[data-fac="smith"]'); await p.waitForTimeout(300);
    chk(!(await p.$('.talk')) && /鍛冶屋/.test(await modalTitle(p)), `${W} ③ 2回目は鍛冶屋だけ（二重に起きない）`);
    await closeModals(p); await p.waitForTimeout(200);
    // ④ 食堂（ワーン）：像の前は何も起きない → 像を建てると勇者の盾
    await p.tap('.fac[data-fac="diner"]'); await p.waitForTimeout(300);
    chk(!(await p.$('.talk')) && /食堂/.test(await modalTitle(p)), `${W} ④ 像の前は食堂だけ`);
    await closeModals(p);
    await p.evaluate(() => { const V = TS.UI.S.village; V.built.yanai_statue = true; TS.Game.applyFacilities(V); TS.Save.save(TS.UI.S); });
    await p.reload(); await p.waitForTimeout(800); await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeModals(p); await p.waitForTimeout(200);
    await p.tap('.fac[data-fac="diner"]'); await p.waitForTimeout(300);
    if (W === 390) await p.screenshot({ path: path.join(OUT, `4-waan_${W}.jpg`), quality: 85 });
    const l4 = await readTalk(p);
    const st4 = await p.evaluate(() => { const V = TS.UI.S.village; return { got: !!V.story.heroShield, n: V.bag.concat(V.storage).filter((i) => i.id === 'hero_shield_relic').length }; });
    chk(/預かっていたもの/.test(l4.join()) && /恋人/.test(l4.join()) && st4.got && st4.n === 1, `${W} ④ ワーンから勇者の盾 ${JSON.stringify(st4)} ${l4.length}行`);
    chk(/食堂/.test(await modalTitle(p)), `${W} ④ そのまま食堂の画面`);
    await closeModals(p); await p.waitForTimeout(200);
    await p.tap('.fac[data-fac="diner"]'); await p.waitForTimeout(300);
    chk(!(await p.$('.talk')), `${W} ④ 2回目は食堂だけ（二重に起きない）`);
    await closeModals(p);
    // ⑤ こもれびの家（モッチャン）：そろう前は村の発展だけ → お宝と村の飾りを全部そろえると勇者の剣
    await p.tap('.fac[data-fac="develop"]'); await p.waitForTimeout(300);
    chk(!(await p.$('.talk')) && /村の発展/.test(await modalTitle(p)), `${W} ⑤ そろう前は村の発展だけ`);
    await closeModals(p);
    await p.evaluate(() => { const V = TS.UI.S.village, D = TS.Data; for (const id of D.MUSEUM_ITEMS) V.donated[id] = true; for (const f of D.FACILITIES) if (f.kind === 'decor') V.built[f.id] = true; TS.Game.applyFacilities(V); TS.Save.save(TS.UI.S); });
    await p.reload(); await p.waitForTimeout(800); await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeModals(p); await p.waitForTimeout(200);
    await p.tap('.fac[data-fac="develop"]'); await p.waitForTimeout(300);
    if (W === 390) await p.screenshot({ path: path.join(OUT, `5-mot-sword_${W}.jpg`), quality: 85 });
    const l5 = await readTalk(p);
    const st5 = await p.evaluate(() => { const V = TS.UI.S.village; return { got: !!V.story.heroSword, n: V.bag.concat(V.storage).filter((i) => i.id === 'hero_sword_relic').length }; });
    chk(/マスターヤナイがこの村に寄付/.test(l5.join()) && /^モッチャン：/.test(l5[0]) && st5.got && st5.n === 1, `${W} ⑤ モッチャンから勇者の剣 ${JSON.stringify(st5)} ${l5[0]}`);
    chk(/村の発展/.test(await modalTitle(p)), `${W} ⑤ そのまま村の発展の画面`);
    await closeModals(p); await p.waitForTimeout(200);
    await p.tap('.fac[data-fac="develop"]'); await p.waitForTimeout(300);
    chk(!(await p.$('.talk')), `${W} ⑤ 2回目は村の発展だけ（二重に起きない）`);
    await closeModals(p);
    chk(!errs.length, `${W} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close();
  process.exit(ng ? 1 : 0);
})();
