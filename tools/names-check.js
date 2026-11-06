// 主人公と恋人の名前（2026年11月）の確認：node tools/names-check.js [出力フォルダ]（既定 docs/names/）
// はじめから→名前入力（やめるとセーブは残る）→冒頭・村・戦闘のメッセージに反映→保存・読み込み直し→つづきから。古いセーブは「たけ」「サイ」→名前の変更（進み具合はそのまま）。
// キーボードが開いた想定（高さ420）でも入力欄と決定ボタンが見える・8文字でもはみ出さない。画面に {take}・{sai} の印が残らない
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'names');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8856);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
const A = 'ソムチャイ', B = 'マリー<b>&';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => p.screenshot({ path: path.join(OUT, n + '.jpg'), quality: 85 });
  const noMarks = () => p.evaluate(() => !/\{(take|sai)\}/.test(document.body.innerText));
  await p.goto('http://localhost:8856/'); await p.waitForTimeout(300);
  // 既存のセーブを作っておく（村の資金を目印に）
  await p.evaluate(() => { localStorage.clear(); const S = TS.Game.newState(); S.village.funds = 4321; S.village.story.introDone = true; S.village.seenIntro = true; TS.Save.save(S); });
  await p.reload(); await p.waitForTimeout(700);
  // はじめから → 確認2回 → 名前入力 → やめる：セーブは残る
  await p.tap('#btn-newgame'); await p.waitForTimeout(200); await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(200); await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(300);
  chk(await p.isVisible('.name-modal'), '確認のあと名前入力');
  const v0 = await p.evaluate(() => [...document.querySelectorAll('.name-modal input')].map((i) => i.value));
  chk(v0.join() === 'たけ,サイ', '初期値 ' + v0);
  await p.tap('.name-modal .modal-buttons button:not(.primary)'); await p.waitForTimeout(200);
  chk(await p.evaluate(() => TS.Save.load() && TS.Save.load().village.funds === 4321), 'やめるとセーブは消えない');
  // もう一度：空欄はだめ
  await p.tap('#btn-newgame'); await p.waitForTimeout(200); await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(200); await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(300);
  await p.fill('.name-modal input[data-k="take"]', '   '); await p.tap('.name-modal .modal-buttons button.primary'); await p.waitForTimeout(200);
  chk(await p.isVisible('.name-modal') && (await p.textContent('.name-modal')).includes('名前を入力してください'), '空欄は入力を促す');
  chk(await p.evaluate(() => TS.Save.load().village.funds === 4321), 'まだセーブは消えない');
  // 変換中の Enter では決定しない
  await p.focus('.name-modal input[data-k="take"]');
  await p.evaluate(() => { const el = document.querySelector('.name-modal input[data-k="take"]'); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); });
  await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  chk(await p.isVisible('.name-modal'), 'Enter では決定しない');
  await p.fill('.name-modal input[data-k="take"]', '  ' + A + ' '); await p.fill('.name-modal input[data-k="sai"]', B);
  await p.waitForTimeout(100); await shot('01_name_entry');
  // キーボードが開いた想定（高さ420）：入力欄と決定ボタンが画面内
  await p.setViewportSize({ width: 390, height: 420 }); await p.waitForTimeout(200);
  const vis = await p.evaluate(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(); const a = r('.name-modal input[data-k="sai"]'), bt = r('.name-modal .modal-buttons button.primary');
    return { inp: a.bottom <= innerHeight && a.top >= 0, btn: bt.bottom <= innerHeight + 1 }; });
  if (!vis.btn) await p.evaluate(() => document.querySelector('.name-modal .modal-buttons button.primary').scrollIntoView({ block: 'nearest' }));
  const vis2 = await p.evaluate(() => { const bt = document.querySelector('.name-modal .modal-buttons button.primary').getBoundingClientRect(); return bt.bottom <= innerHeight + 1 && bt.top >= 0; });
  chk(vis.inp && (vis.btn || vis2), 'キーボードが開いても入力欄・決定ボタンを操作できる ' + JSON.stringify(vis));
  await shot('02_name_entry_keyboard');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200);
  await p.tap('.name-modal .modal-buttons button.primary'); await p.waitForTimeout(500);
  const t1 = await p.evaluate(() => document.querySelector('.talk').innerText);
  chk(t1.length > 0 && (await p.evaluate(() => TS.UI.S.names.take)) === A, '名前で始まる（前後の空白なし）');
  const lines = []; for (let i = 0; i < 5 && await p.$('.talk'); i++) { lines.push(await p.evaluate(() => document.querySelector('.talk').innerText)); await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(120); }
  chk(lines.some((l) => l.includes(A + 'の冒険が始まる')), '冒頭に主人公の名前 ' + JSON.stringify(lines[2]));
  await p.tap('.modal-buttons button'); await p.waitForTimeout(300);
  chk(await p.evaluate(() => TS.Save.load().village.funds !== 4321), '決定したら新しいセーブ');
  // 村：店の名札・ボタン
  chk((await p.textContent('[data-fac="shop"]')).includes(B + 'の店'), '村のボタンに恋人の名前（HTMLとして解釈しない） ' + await p.textContent('[data-fac="shop"]'));
  chk(await p.evaluate(() => !document.querySelector('[data-fac="shop"] b')), '名前の < > はタグにならない');
  await shot('03_village');
  // 出発 → 戦闘のメッセージ
  await p.evaluate(() => { const S = TS.UI.S; TS.Game.takeReturnScroll(S); TS.UI.debug.depart(); }); await p.waitForTimeout(500);
  for (let i = 0; i < 5 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(120); }
  await p.evaluate(() => { const run = TS.UI.S.run; TS.Game.log(run, '{take}は5のダメージ。'); TS.UI.debug.save(); });
  await p.evaluate(() => { const run = TS.UI.S.run; const e = run.enemies[0]; if (e) { e.x = run.player.x + 1; e.y = run.player.y; } });
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400);
  const log = await p.evaluate(() => document.getElementById('log-lines').innerText);
  chk(log.includes(A), '戦闘のメッセージに主人公の名前 ' + JSON.stringify(log));
  chk(await noMarks(), '画面に印が残らない');
  await shot('04_dungeon');
  // 保存 → 読み込み直し → つづきから
  await p.evaluate(() => TS.UI.debug.save()); await p.reload(); await p.waitForTimeout(700);
  await p.tap('#btn-continue'); await p.waitForTimeout(1000);
  await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
  chk(await p.evaluate(() => TS.UI.S.names.take) === A && (await p.evaluate(() => document.getElementById('log-lines').innerText)).includes(A), '読み込み直し・つづきからでも名前が残る');
  // 古いセーブ（名前なし）→「たけ」「サイ」→ 名前の変更（資金・章はそのまま）
  await p.evaluate(() => { const S = TS.Game.newState(); delete S.names; S.village.funds = 777; S.village.story.chapter = 3; S.village.story.introDone = true; S.village.seenIntro = true; localStorage.clear(); localStorage.setItem(TS.Data.SAVE_KEY, JSON.stringify(S)); });
  await p.reload(); await p.waitForTimeout(700); await p.tap('#btn-continue'); await p.waitForTimeout(1000);
  await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
  chk((await p.textContent('[data-fac="shop"]')).includes('サイの店') && await p.evaluate(() => TS.UI.S.names.take === 'たけ'), '古いセーブは「たけ」「サイ」');
  await p.tap('#v-menu'); await p.waitForTimeout(300);
  await p.evaluate(() => [...document.querySelectorAll('.modal-buttons button')].find((x) => x.textContent === '名前の変更').click()); await p.waitForTimeout(300);
  await p.fill('.name-modal input[data-k="take"]', 'あいうえおかきく'); await p.fill('.name-modal input[data-k="sai"]', 'さしすせそたちつ');
  await p.tap('.name-modal .modal-buttons button.primary'); await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ n: TS.UI.S.names, funds: TS.UI.S.village.funds, ch: TS.UI.S.village.story.chapter, saved: TS.Save.load().names }));
  chk(after.n.take === 'あいうえおかきく' && after.funds === 777 && after.ch === 3 && after.saved.sai === 'さしすせそたちつ', '名前の変更：進み具合はそのまま・保存 ' + JSON.stringify(after));
  await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
  await p.waitForTimeout(300);
  chk((await p.textContent('[data-fac="shop"]')).includes('さしすせそたちつの店'), '画面に出ている名前も変わる');
  const wide = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth); chk(wide, '8文字でも横にはみ出さない');
  await p.evaluate(() => TS.UI.debug.showRecords()); await p.waitForTimeout(200); await p.evaluate(() => { document.querySelectorAll('.records details.rec').forEach((d) => { d.open = true; }); });
  chk(await noMarks() && (await p.evaluate(() => document.body.innerText)).includes('あいうえおかきく'), '記録の画面も名前・印なし');
  await shot('05_village_8chars');
  chk(!errs.length, 'エラーなし ' + errs.join(' / '));
  await b.close(); srv.close(); console.log(`\n${ok} OK / ${ng} NG`);
})();
