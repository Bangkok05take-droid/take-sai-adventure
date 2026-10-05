// ゲーム内のドット絵（たけ）から favicon.png を作る：node tests/make-favicon.js
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const fs = require('fs'), path = require('path');
const { start, BASE } = require('./serve');
(async () => {
  const srv = await start(8766);
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:8766' + BASE);
  await p.waitForFunction(() => window.TS && TS.Sprites && TS.Sprites.s);
  const url = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#ffb347'; g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
    g.drawImage(TS.Sprites.s.portrait.take, 4, 0, 56, 56, 2, 4, 60, 60);
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(__dirname, '..', 'favicon.png'), Buffer.from(url.split(',')[1], 'base64'));
  await b.close(); srv.close();
  console.log('favicon.png written');
})();
