// はじめの1タップ（2026年11月10日）の確認：node tools/title-gate-check.js [出力フォルダ]（既定 docs/title-gate/）
// 自動再生を止めるブラウザ（スマホと同じ）で：音オン→「画面をタップしてはじめる」が全面 → タップでタイトルの曲 → 消える。
// 自動再生できるブラウザ・音オフでは出さない。最初のタップでボタンは押されない。幅360・390・430
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'title-gate');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8858);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const strict = await chromium.launch({ args: ['--autoplay-policy=document-user-activation-required'] });
  const st = (q) => q.evaluate(() => ({ ctx: TS.Audio.ctx && TS.Audio.ctx.state, cur: TS.Music.current && TS.Music.current.id, screen: TS.UI.screen, gate: !document.getElementById('title-gate').hidden, hint: !document.getElementById('title-sound-hint').hidden }));
  for (const w of [360, 390, 430]) {
    const c = await strict.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }), q = await c.newPage();
    await q.addInitScript(() => { window.__titleGate = true; });
    const errs = []; q.on('pageerror', (e) => errs.push(e.message));
    await q.goto('http://localhost:8858/'); await q.waitForTimeout(800);
    let s = await st(q);
    chk(s.gate && !s.hint && s.ctx !== 'running', `${w} 鳴らせないときは全面に案内 ${JSON.stringify(s)}`);
    if (w === 390) await q.screenshot({ path: path.join(OUT, 'gate_390.jpg'), quality: 85 });
    const bb = await q.evaluate(() => { const r = document.getElementById('btn-newgame').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await q.touchscreen.tap(bb.x, bb.y); await q.waitForTimeout(600); s = await st(q);   // 「はじめから」の位置を押す（全面の案内が受ける）
    chk(s.screen === 'title' && s.cur === 'overture' && !s.gate && !(await q.$('.name-modal')), `${w} タップで曲が始まり、ボタンは押されない ${JSON.stringify(s)}`);
    await q.tap('#btn-newgame'); await q.waitForTimeout(400);
    chk(!!(await q.$('.name-modal')), `${w} 2回目のタップでボタンが押せる`);
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await c.close();
  }
  // 音オフ：出さない
  { const c = await strict.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), q = await c.newPage(); await q.addInitScript(() => { window.__titleGate = true; });
    await q.goto('http://localhost:8858/'); await q.evaluate(() => { const S = TS.Game.newState(); S.settings.sound = false; TS.Save.save(S); }); await q.reload(); await q.waitForTimeout(700);
    chk(!(await st(q)).gate, '音オフでは出さない'); await c.close(); }
  await strict.close();
  // 自動再生できるブラウザ：出さずに最初から流れる
  { const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const q = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); await q.addInitScript(() => { window.__titleGate = true; });
    await q.goto('http://localhost:8858/'); await q.waitForTimeout(900); const s = await st(q);
    chk(!s.gate && s.cur === 'overture', '自動再生できるなら出さずに最初から流れる ' + JSON.stringify(s)); await b.close(); }
  srv.close(); console.log(`\n${ok} OK / ${ng} NG`);
})();
