// 見た目の確認用スクリーンショット（変更前後の比較に使う）：node tests/capture.js <保存先>
// タイトル・村・メニュー・各地域のダンジョンを、スマホ縦画面で撮る。
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const path = require('path'), fs = require('fs');
const { start, BASE } = require('./serve');
const OUT = process.argv[2] || path.join(__dirname, 'screenshots', 'capture');
fs.mkdirSync(OUT, { recursive: true });
const FIX = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-cleared.json'), 'utf8');

(async () => {
  const PORT = 8781;
  const srv = await start(PORT);
  const URL = `http://localhost:${PORT}${BASE}`;
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
    return p;
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png') });
  const closeTalk = async (p) => { for (let i = 0; i < 40 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(60); } };

  for (const [w, h, tag] of [[390, 844, ''], [360, 640, '_small']]) {
    const p = await mk(w, h);
    await p.goto(URL); await p.waitForTimeout(900);
    await shot(p, 'title_new' + tag);
    await p.evaluate((t) => localStorage.setItem('takeSaiAdventure.save', t), FIX);
    await p.reload(); await p.waitForTimeout(900);
    await shot(p, 'title_save' + tag);
    // 村（発展済みのセーブ）
    await p.tap('#btn-continue'); await p.waitForTimeout(400); await closeTalk(p);
    await p.waitForTimeout(300);
    await shot(p, 'village_dev' + tag);
    if (!tag) {
      await p.tap('.fac[data-fac="shop"]'); await p.waitForTimeout(300);
      await shot(p, 'menu_shop');
      await p.tap('.modal-buttons button:last-child'); await p.waitForTimeout(150);
      await p.tap('.fac[data-fac="storage"]'); await p.waitForTimeout(300);
      await shot(p, 'menu_storage');
      await p.tap('.modal-buttons button:last-child'); await p.waitForTimeout(150);
    }
    // ダンジョン：地域ごとに1枚
    await p.evaluate(() => { const V = TS.UI.S.village; V.bag = V.bag.slice(0, 8); });
    await p.tap('.fac.depart'); await p.waitForTimeout(250);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(300); await closeTalk(p);
    const floors = tag ? [1, 22] : [1, 5, 8, 10, 13, 17, 22, 27, 30];
    for (const f of floors) {
      await p.evaluate((target) => {
        const S = TS.UI.S, G = TS.Game;
        S.run.player.hp = S.run.player.maxhp = 999;
        while (S.run.floor < target) {
          const r = S.run, b = r.enemies.find((e) => e.boss);
          if (b) { // ボスは隣から倒す（倒すと階段が出る）
            b.hp = 1;
            for (const [dir, [dx, dy]] of Object.entries(G.DIRS)) { const x = b.x - dx, y = b.y - dy;
              if (G.canStep(r.map, x, y, dx, dy) && !G.enemyAt(r, x, y)) { r.player.x = x; r.player.y = y; G.updateVision(r); for (let i = 0; i < 50 && r.enemies.includes(b); i++) G.act(S, { type: 'move', dir }); break; } }
          }
          r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' });
        }
        // 1部屋目の中央付近に立つ（敵は画面に1体だけ残す）
        const r = S.run, room = (r.map.rooms || []).find((q) => !q.hub && q.w >= 4) || null;
        if (room) { r.player.x = room.x + (room.w >> 1); r.player.y = room.y + (room.h >> 1); }
        r.enemies = r.enemies.filter((e) => e.boss || Math.abs(e.x - r.player.x) + Math.abs(e.y - r.player.y) < 6).slice(0, 2);
        G.updateVision(r);
      }, f);
      await p.tap('#b-wait'); await closeTalk(p);
      await p.waitForTimeout(500);
      await shot(p, `dungeon_${String(f).padStart(2, '0')}${tag}`);
    }
    if (!tag) {
      await p.tap('#b-items'); await p.waitForTimeout(300);
      await shot(p, 'menu_items');
      await p.tap('.modal-buttons button:last-child'); await p.waitForTimeout(150);
    }
    await p.context().close();
  }
  await browser.close(); srv.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors', '->', OUT);
})();
