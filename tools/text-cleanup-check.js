// 説明と冒頭の会話の整理（2026年11月6日）の確認：node tools/text-cleanup-check.js [出力フォルダ]（既定 docs/text-cleanup/）
// はじめから → 冒頭（語り3行）→ 冒険のヒント → 村 → 遊び方（詳しい操作は閉じている）→ 出発の画面（巻物を借りる）→ 出発の会話。幅390
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'text-cleanup');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8853);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8853/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(600);
  const shot = (n) => p.screenshot({ path: path.join(OUT, n + '.jpg'), quality: 85 });
  const txt = () => p.evaluate(() => { const m = document.querySelector('.modal:last-of-type') || document.querySelector('.modal'); return m ? m.innerText : ''; });
  await p.tap('#btn-newgame'); await p.waitForTimeout(400);
  await p.tap('.name-modal .modal-buttons button.primary'); await p.waitForTimeout(400);   // 名前は初期値のまま
  const lines = [];
  for (let i = 0; i < 10 && await p.$('.talk'); i++) { lines.push(await txt()); if (i === 0) await shot('01_intro'); await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(150); }
  console.log('冒頭:', JSON.stringify(lines));
  chk(lines.length === 3, '冒頭は3行');
  const hint = await txt(); console.log('ヒント:', JSON.stringify(hint)); await shot('02_hint');
  chk(hint.includes('冒険のヒント') && hint.includes('冒険をはじめる'), 'ヒントの画面');
  await p.tap('.modal-buttons button'); await p.waitForTimeout(300);
  chk(await p.isVisible('#screen-village') && !(await p.$('.modal')), '村へ（重なりなし）'); await shot('03_village');
  await p.evaluate(() => TS.UI.debug && document.getElementById('btn-help-title').click()); await p.waitForTimeout(300);
  const help = await txt(); console.log('遊び方:', JSON.stringify(help)); await shot('04_help');
  chk(await p.evaluate(() => [...document.querySelectorAll('details.help-more')].every((d) => !d.open)), '詳しい操作は閉じている');
  chk(!/真大魔王|3[0-9]階|2[05]階|15階/.test(help), '先の階・真大魔王の話なし');
  await p.evaluate(() => { document.querySelector('details.help-more').open = true; }); await shot('05_help_more');
  await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.debug.openDepart(); }); await p.waitForTimeout(300);
  console.log('出発:', JSON.stringify(await txt())); await shot('06_depart');
  await p.evaluate(() => [...document.querySelectorAll('.depart-modal .modal-buttons button')].find((x) => x.textContent.includes('借りる')).click()); await p.waitForTimeout(400);
  const d2 = await txt(); console.log('出発（借りた後）:', JSON.stringify(d2)); await shot('07_depart_taken');
  chk(d2.includes('受け取り済み'), '受け取り済み');
  await p.evaluate(() => [...document.querySelectorAll('.depart-modal .modal-buttons button')].find((x) => x.textContent.includes('出発する')).click()); await p.waitForTimeout(500);
  const tl = []; for (let i = 0; i < 6 && await p.$('.talk'); i++) { tl.push(await txt()); if (i === 0) await shot('08_depart_talk'); await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(150); }
  console.log('出発の会話:', JSON.stringify(tl)); chk(tl.length === 2, '出発の会話は2行');
  chk(!errs.length, 'エラーなし ' + errs.join(' / '));
  await b.close(); srv.close(); console.log(`\n${ok} OK / ${ng} NG`);
})();
