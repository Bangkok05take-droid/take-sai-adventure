// タイトル画面「タイの大冒険」（ZIP thai_title_parts_v1）の確認：node tools/title-thai-check.js [出力フォルダ]（既定 docs/title-thai-v1/）
// 幅360・390・430（と低い画面・横画面）で、ロゴ全体・扉の紋章・ボタンが見えるか、ボタンが重ならないか、タップの高さ44px以上か、ページの題名
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'title-thai-v1');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8854);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932], [375, 667], [844, 390]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8854/'); await p.waitForTimeout(300);
    await p.evaluate(() => { const S = TS.Game.newState(); S.village.story.introDone = true; S.village.seenIntro = true; TS.Save.save(S); }); await p.reload(); await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const R = (id) => { const r = document.querySelector(id).getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, h: r.height, shown: r.height > 0 }; };
      const img = document.getElementById('title-logo'), art = R('#title-scene');
      return { title: document.title, logo: R('#title-logo'), loaded: img.complete && img.naturalWidth > 0, art, door: { x: art.x + (art.r - art.x) * 0.5, y: art.y + (art.b - art.y) * 0.37 },
        btn: ['#btn-continue', '#btn-newgame', '#btn-help-title', '#btn-sound-title'].map(R).filter((x) => x.shown), vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth };
    });
    const tag = `${w}x${h}`;
    chk(m.title === 'タイの大冒険', `${tag} ページの題名`);
    chk(m.loaded && m.logo.x >= 0 && m.logo.r <= m.vw, `${tag} ロゴ全体が画面内 ${Math.round(m.logo.x)}〜${Math.round(m.logo.r)}`);
    const bt = m.btn; let over = false;
    for (let i = 0; i < bt.length; i++) for (let j = i + 1; j < bt.length; j++) { const a = bt[i], c = bt[j]; if (a.x < c.r && c.x < a.r && a.y < c.b && c.y < a.b) over = true; }
    chk(!over && bt.every((x) => x.h >= 44 && x.x >= 0 && x.r <= m.vw), `${tag} ボタンが重ならない・44px以上・はみ出さない`);
    if (w < h) chk(bt.length === 4 && bt[0].y > m.door.y + 20 && m.logo.b < m.door.y - 20, `${tag} 扉の紋章をロゴ・ボタンで隠さない`);
    chk(m.sw <= m.vw, `${tag} 横にはみ出さない`);
    chk(!errs.length, `${tag} エラーなし ${errs.join(' / ')}`);
    await p.screenshot({ path: path.join(OUT, `title_${tag}.jpg`), quality: 85 });
    await p.context().close();
  }
  await b.close(); srv.close(); console.log(`\n${ok} OK / ${ng} NG`);
})();
