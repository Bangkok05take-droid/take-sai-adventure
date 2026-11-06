// ヤナイの記録（全8話の日記＋手紙、2026年11月6日）の確認：node tools/yanai-records-check.js [出力フォルダ]（既定 docs/yanai-records/）
// 解放（最初は一だけ・章ごと）、「新」の印と読んだ印、第4章の出発画面の案内、ティウから手紙、村の発展の一文、文字の大きさ（16px以上）。幅390
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'yanai-records');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8855);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8855/'); await p.waitForTimeout(300);
  const setup = (ch, extra) => p.evaluate(([ch, extra]) => { localStorage.clear(); const S = TS.Game.newState(), st = S.village.story; st.introDone = true; S.village.seenIntro = true; st.chapter = ch;
    if (extra === 'end') { st.endingDone = true; S.village.cleared = true; st.oriTiw = 'given'; }
    TS.Save.save(S); }, [ch, extra]);
  const enter = async () => { await p.reload(); await p.waitForTimeout(600); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); }); };
  const shot = (n) => p.screenshot({ path: path.join(OUT, n + '.jpg'), quality: 85 });
  const closeAll = () => p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
  // 第1章：一だけ
  await setup(1); await enter();
  await p.evaluate(() => TS.UI.debug.showRecords()); await p.waitForTimeout(300);
  let r = await p.evaluate(() => ({ open: document.querySelectorAll('.records details.rec').length, lock: document.querySelectorAll('.records .rec-lock').length, right: document.querySelector('.modal h2 .right').textContent }));
  chk(r.open === 1 && r.lock === 7 && r.right === '1/8', '第1章：記録一だけ ' + JSON.stringify(r)); await shot('01_ch1_list');
  await p.evaluate(() => { document.querySelector('.records details.rec').open = true; }); await p.waitForTimeout(200);
  const fs16 = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.rec-body p')).fontSize));
  chk(fs16 >= 16, '本文の文字 ' + fs16 + 'px'); await shot('02_record1');
  chk(await p.evaluate(() => TS.Game.recordRead(TS.UI.S.village, 'r1') && !document.querySelector('.records .rec-new')), '開くと読んだ印・「新」が消える');
  await closeAll();
  // 第4章：一〜四。出発画面に「遠い街から」の案内。読むと消える
  await setup(4); await enter();
  await p.evaluate(() => TS.UI.debug.openDepart()); await p.waitForTimeout(300);
  let t = await p.evaluate(() => document.querySelector('.depart-modal').innerText);
  chk(t.includes('ヤナイの記録「遠い街から」が読めます'), '第4章の出発画面に案内'); await shot('03_ch4_depart');
  await closeAll(); await p.evaluate(() => TS.UI.debug.showRecords()); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ open: document.querySelectorAll('.records details.rec').length, nw: document.querySelectorAll('.records .rec-new').length }));
  chk(r.open === 4 && r.nw === 4, '第4章：一〜四・すべて「新」 ' + JSON.stringify(r));
  await p.evaluate(() => { document.querySelector('.records details.rec[data-id="r4"]').open = true; document.querySelector('.records details.rec[data-id="r4"]').scrollIntoView(); }); await p.waitForTimeout(200); await shot('04_record4');
  await closeAll(); await p.evaluate(() => TS.UI.debug.openDepart()); await p.waitForTimeout(300);
  t = await p.evaluate(() => document.querySelector('.depart-modal').innerText); chk(!t.includes('遠い街から'), '読んだあとは案内なし'); await closeAll();
  // 第6章（ミストバーンのあと）：八まで。手紙はまだ
  await setup(6); await enter(); await p.evaluate(() => TS.UI.debug.showRecords()); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ open: document.querySelectorAll('.records details.rec').length, letter: !!document.querySelector('.rec-letter') }));
  chk(r.open === 8 && !r.letter, '最終章：八まで・手紙はまだ ' + JSON.stringify(r)); await closeAll();
  // 全章クリア：ティウから手紙 → 記録の最後に
  await setup(6, 'end'); await enter();
  const talked = await p.evaluate(() => { if (!TS.Game.canTakeLetter(TS.UI.S.village)) return 'no'; return 'yes'; });
  chk(talked === 'yes', '全章クリア後：手紙を受け取れる');
  await p.evaluate(() => TS.UI.debug.tiwTalk && TS.UI.debug.tiwTalk()); await p.waitForTimeout(300);
  const tl = []; for (let i = 0; i < 6 && await p.$('.talk'); i++) { tl.push(await p.evaluate(() => document.querySelector('.modal').innerText)); if (i === 1) await shot('05_letter_tiw'); await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(150); }
  console.log('ティウ:', JSON.stringify(tl)); chk(tl.length === 3 && await p.evaluate(() => TS.UI.S.village.story.letter), 'ティウが手紙を渡す（3行）');
  await p.evaluate(() => TS.UI.debug.showRecords()); await p.waitForTimeout(300);
  await p.evaluate(() => { const d = document.querySelector('.rec-letter'); d.open = true; d.scrollIntoView(); }); await p.waitForTimeout(200); await shot('06_letter');
  chk(await p.evaluate(() => !!document.querySelector('.rec-letter') && TS.Game.recordRead(TS.UI.S.village, 'letter')), '手紙が記録の最後に・読んだ印');
  await closeAll();
  chk(!errs.length, 'エラーなし ' + errs.join(' / '));
  await b.close(); srv.close(); console.log(`\n${ok} OK / ${ng} NG`);
})();
