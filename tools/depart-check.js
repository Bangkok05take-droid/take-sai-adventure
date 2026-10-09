// 出発画面と帰還の巻物の貸し出しの確認：node tools/depart-check.js [リポジトリ] [出力フォルダ]（幅360・390・430）
// ボタンの並び（左上 ティウと話す／右上 帰還の巻物／左下 やめる／右下 出発する）・受け取り → 受取済み（閉じる・開き直す・読み込み直しで戻らない）・
// 持ち物がいっぱいなら受取済みにしない・出発時に二重に配らない・村へ戻ると次の1枚・借りずに出発できる・はみ出さない
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'depart'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8806);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8806/'); await p.waitForTimeout(400);
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = 2; V.bag.push(G.makeItem(S, 'herb')); TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    const open = async () => { await p.tap('.fac[data-fac="depart"]'); await p.waitForTimeout(300); };
    const st = () => p.evaluate(() => { const btn = [...document.querySelectorAll('.depart-modal .modal-buttons button')].map((x) => { const r = x.getBoundingClientRect(); return { t: x.textContent.replace(/\s+/g, ''), dis: x.disabled, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), in: r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && r.left >= 0 }; });
      const m = document.querySelector('.depart-modal').getBoundingClientRect(), body = document.querySelector('.depart-modal .modal-body');
      return { btn, sw: document.documentElement.scrollWidth, modal: [Math.round(m.left), Math.round(m.right)], scroll: body.scrollHeight > body.clientHeight + 1,
        n: TS.UI.S.village.bag.filter((i) => i.id === 'return_scroll').length, taken: !!TS.UI.S.village.scrollTaken, txt: document.querySelector('.dp-scroll').textContent }; });
    await open();
    let s = await st();
    const q = (t) => s.btn.find((x) => x.t.includes(t));
    const [tiw, scr, cancel, go] = [q('ティウと話す'), q('帰還の巻物'), q('やめる'), q('出発する')];
    chk(tiw && scr && cancel && go && tiw.x < scr.x && tiw.y === scr.y && cancel.x < go.x && cancel.y === go.y && tiw.y < cancel.y && Math.abs(tiw.x - cancel.x) < 2 && Math.abs(scr.x - go.x) < 2,
      `${w} 並び：左上 ティウ／右上 巻物／左下 やめる／右下 出発 ${JSON.stringify(s.btn)}`);
    chk(s.sw <= w && s.btn.every((x) => x.in) && s.btn.every((x) => x.w >= 120), `${w} はみ出さない・ボタンは画面内で大きい（本文スクロール：${s.scroll}）`);
    chk(!scr.dis && s.n === 0 && !s.taken, `${w} はじめ：借りられる（まだ持っていない）`);
    await p.screenshot({ path: path.join(OUT, `depart_${w}.png`) });
    // 借りる（連打しても1枚）
    await p.evaluate(() => { const b = [...document.querySelectorAll('.depart-modal .modal-buttons button')].find((x) => x.textContent.includes('帰還の巻物')); b.click(); b.click(); b.click(); });
    await p.waitForTimeout(400);
    s = await st();
    chk(s.n === 1 && s.taken && s.btn.find((x) => x.t.includes('受取済み')).dis && s.txt.includes('受取済み'), `${w} 受け取ると受取済み（押せない）・1枚だけ ${JSON.stringify({ n: s.n, t: s.txt })}`);
    await p.screenshot({ path: path.join(OUT, `depart_taken_${w}.png`) });
    // 閉じて開き直す・読み込み直す → 受取済みのまま
    await p.tap('.depart-modal .modal-buttons button >> text=やめる'); await p.waitForTimeout(200); await open();
    s = await st(); chk(s.taken && s.btn.find((x) => x.t.includes('受取済み')).dis && s.n === 1, `${w} 閉じて開き直しても受取済み`);
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(800);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); }); await open();
    s = await st(); chk(s.taken && s.btn.find((x) => x.t.includes('受取済み')).dis && s.n === 1, `${w} 読み込み直しても受取済み`);
    // 手放しても再支給しない（持ち物から取り除く）
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); const V = TS.UI.S.village; V.bag = V.bag.filter((i) => i.id !== 'return_scroll'); }); await open();
    s = await st(); chk(s.n === 0 && s.btn.find((x) => x.t.includes('受取済み')).dis, `${w} 手放しても同じ準備中は再支給しない`);
    // 出発 → 自動では配らない（二重にならない）→ 村へ戻る → 次の1枚
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); const V = TS.UI.S.village; V.bag.push(TS.Game.makeItem(TS.UI.S, 'return_scroll')); }); await open();
    await p.tap('.depart-modal .modal-buttons button >> text=出発する'); await p.waitForTimeout(500);
    for (let i = 0; i < 20 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(50); }
    const rs = await p.evaluate(() => TS.UI.S.run.bag.filter((i) => i.id === 'return_scroll').length);
    chk(rs === 1, `${w} 出発：巻物は借りた1枚だけ（自動の支給で二重にならない） ${rs}`);
    await p.evaluate(() => { TS.Game.useReturnScroll(TS.UI.S); TS.Game.finishRun(TS.UI.S); TS.UI.debug.save(); });
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(800);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); }); await open();
    s = await st(); chk(!s.taken && !s.btn.find((x) => x.t.includes('帰還の巻物')).dis && s.n === 0, `${w} 村へ戻ると、次の冒険の1枚を借りられる`);
    // 持ち物がいっぱい：押すと案内・受取済みにしない → 空きを作ると受け取れる
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); const S = TS.UI.S; while (S.village.bag.length < TS.Data.BAG_SIZE) S.village.bag.push(TS.Game.makeItem(S, 'herb')); }); await open();
    await p.tap('.depart-modal .modal-buttons button:has-text("帰還の巻物")'); await p.waitForTimeout(300);
    const full = await p.evaluate(() => ({ msg: [...document.querySelectorAll('.modal h2')].some((h) => h.textContent === '帰還の巻物') && document.querySelector('#modal-root').textContent.includes('1枠空けると受け取れます'), taken: !!TS.UI.S.village.scrollTaken }));
    chk(full.msg && !full.taken, `${w} 持ち物がいっぱい：受け取れず、受取済みにしない ${JSON.stringify(full)}`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `depart_full_${w}.png`) });
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.S.village.bag.pop(); }); await p.waitForTimeout(150);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); }); await open();   // 案内を閉じると出発画面に戻るので、閉じ直して開く
    await p.tap('.depart-modal .modal-buttons button:has-text("帰還の巻物")'); await p.waitForTimeout(300);
    s = await st(); chk(s.n === 1 && s.taken, `${w} 空きを作ると受け取れる ${JSON.stringify({ n: s.n, taken: s.taken, m: await p.evaluate(() => TS.UI.modals.length) })}`);
    // 借りずに出発できる
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); const S = TS.UI.S; TS.Game.useReturnScroll; S.village.bag = S.village.bag.filter((i) => i.id !== 'return_scroll'); S.village.scrollTaken = false; }); await open();
    await p.tap('.depart-modal .modal-buttons button >> text=出発する'); await p.waitForTimeout(500);
    chk(await p.evaluate(() => !!TS.UI.S.run && !TS.UI.S.run.bag.some((i) => i.id === 'return_scroll')), `${w} 借りずに出発できる`);
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
