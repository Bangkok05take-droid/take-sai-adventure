// ブラウザでの画面操作テスト（Playwright）：node tests/e2e.test.js [スクリーンショット保存先]
// GitHub Pages 相当のサブパス /take-sai-adventure/ で配信し、スマホ縦画面で操作する。
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const path = require('path'), fs = require('fs');
const { start, BASE } = require('./serve');
const OUT = process.argv[2] || path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

let passed = 0, failed = 0, CUR = null;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; try { await CUR.screenshot({ path: path.join(OUT, 'FAIL_' + failed + '.png') }); } catch (_) {} console.log('  NG  ' + name + '\n      ' + String(e.stack || e).split('\n').slice(0, 3).join('\n      ')); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

(async () => {
  const PORT = 8765;
  const srv = await start(PORT);
  const URL = `http://localhost:${PORT}${BASE}`;
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (opts) => {
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    p.setDefaultTimeout(5000);
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('requestfailed', (r) => errors.push('request failed ' + r.url()));
    p.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
    return { ctx, p };
  };
  const phone = { viewport: { width: 412, height: 860 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true };
  const { ctx, p } = await mk(phone);
  CUR = p;
  const shot = (n) => p.screenshot({ path: path.join(OUT, n + '.png') });
  const closeTalk = async () => { for (let i = 0; i < 12 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(40); } };
  const run = () => p.evaluate(() => TS.UI.S.run && { turn: TS.UI.S.run.turn, floor: TS.UI.S.run.floor, x: TS.UI.S.run.player.x, y: TS.UI.S.run.player.y, hp: TS.UI.S.run.player.hp });

  await test('サブパスで読み込め、素材がすべて相対パスで取得できる', async () => {
    await p.goto(URL);
    await p.waitForTimeout(400);
    assert(await p.isVisible('#btn-newgame'));
    assert(!(await p.isVisible('#btn-continue')), 'no continue without save');
    const fav = await p.evaluate(() => document.querySelector('link[rel=icon]').href);
    assert(fav.includes(BASE_PLACEHOLDER()), fav);
    await shot('01_title');
  });

  await test('はじめから → 会話・説明 → 村', async () => {
    await p.tap('#btn-newgame');
    await p.waitForTimeout(200);
    await closeTalk();
    assert(await p.isVisible('.modal h2:has-text("遊び方")'), 'help shown');
    await shot('02_help');
    await p.tap('.modal-buttons button'); await p.waitForTimeout(100);
    await p.tap('.modal-buttons button'); await p.waitForTimeout(100);
    assert(await p.isVisible('#screen-village'));
    await shot('03_village');
  });

  await test('サイの店で貸出品を受け取り、買い物ができる', async () => {
    await p.tap('.fac[data-fac="shop"]'); await p.waitForTimeout(150);
    await p.tap('.tabs button[data-t="loan"]'); await p.waitForTimeout(100);
    await p.tap('.row[data-id="wood_sword"]'); await p.waitForTimeout(100);
    await p.tap('.row[data-id="loan_rice"]'); await p.waitForTimeout(100);
    assert(await p.$eval('.row[data-id="wood_sword"]', (e) => e.classList.contains('disabled')), 'loan once');
    await p.tap('.tabs button[data-t="buy"]'); await p.waitForTimeout(100);
    await p.tap('.row[data-id="herb"]'); await p.waitForTimeout(100);
    await shot('04_shop_confirm');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    const v = await p.evaluate(() => ({ funds: TS.UI.S.village.funds, bag: TS.UI.S.village.bag.map((i) => i.id) }));
    assert(v.funds === 20 && v.bag.includes('herb') && v.bag.includes('wood_sword') && v.bag.includes('loan_rice'), JSON.stringify(v));
    await p.tap('.modal-buttons button'); await p.waitForTimeout(100);
  });

  await test('出発画面でリスクを表示し、出発できる', async () => {
    await p.tap('.fac.depart'); await p.waitForTimeout(150);
    assert(await p.isVisible('text=倒れると'), 'risk text');
    await shot('05_depart');
    await p.click('text=出発する'); await p.waitForTimeout(150);
    await closeTalk();
    assert(await p.isVisible('#screen-dungeon'));
    const r = await run();
    assert(r && r.floor === 1 && r.turn === 0);
    await shot('06_dungeon');
  });

  await test('ページがスクロール・拡大されず、画面からはみ出さない', async () => {
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight,
      ctrl: document.getElementById('controls').getBoundingClientRect().bottom, vp: document.querySelector('meta[name=viewport]').content }));
    assert(m.sw <= m.iw && m.sh <= m.ih, JSON.stringify(m));
    assert(m.ctrl <= m.ih + 1, 'controls visible');
    assert(/user-scalable=no/.test(m.vp));
    await p.touchscreen.tap(200, 400);
    await p.evaluate(() => window.scrollTo(0, 500));
    assert(await p.evaluate(() => window.scrollY) === 0, 'no scroll');
  });

  await test('連打しても1タップ1行動（行動が大量に予約されない）', async () => {
    // 敵を消し、広い場所で検証
    await p.evaluate(() => { TS.UI.S.run.enemies = []; });
    const before = await run();
    await p.evaluate(() => {
      const b = document.querySelector('#b-wait');
      for (let i = 0; i < 10; i++) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(400);
    const after = await run();
    assert(after.turn === before.turn + 1, `turn ${before.turn} -> ${after.turn}`);
    // 間隔をあけたタップはそれぞれ1行動
    for (let i = 0; i < 3; i++) { await p.tap('#b-wait'); await p.waitForTimeout(160); }
    assert((await run()).turn === after.turn + 3);
  });

  await test('十字ボタンで移動、壁への移動はターンを消費しない', async () => {
    let moved = 0, bumped = 0;
    for (const d of ['up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up']) {
      const b = await run();
      await p.tap('#dpad .' + d); await p.waitForTimeout(160);
      if (await p.$('.modal')) { await p.tap('.modal-buttons button'); await p.waitForTimeout(80); }
      const a = await run();
      if (a.y !== b.y) { moved++; assert(a.turn === b.turn + 1); } else { bumped++; assert(a.turn === b.turn, 'bump no turn'); }
    }
    assert(bumped > 0, 'hit a wall');
  });

  await test('道具メニューを開いている間は時間が進まない／道具を使うと1ターン', async () => {
    const b = await run();
    await p.tap('#b-items'); await p.waitForTimeout(150);
    await shot('07_items');
    await p.tap('.row >> nth=0'); await p.waitForTimeout(150);
    await shot('08_item_detail');
    await p.tap('.modal-buttons button >> text=戻る'); await p.waitForTimeout(100);
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(100);
    assert((await run()).turn === b.turn, 'no time passes in menu');
    await p.evaluate(() => { TS.UI.S.run.player.hp = 5; });
    await p.tap('#b-items'); await p.waitForTimeout(150);
    await p.tap('.row:has-text("薬草")'); await p.waitForTimeout(100);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(200);
    const a = await run();
    assert(a.turn === b.turn + 1 && a.hp >= 30, JSON.stringify(a));
  });

  await test('メニューの開閉はターンを消費しない', async () => {
    const b = await run();
    await p.tap('#b-menu'); await p.waitForTimeout(150);
    await shot('09_menu');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    assert((await run()).turn === b.turn);
  });

  await test('再読み込みで探索途中から再開でき、状態が一致する', async () => {
    for (let i = 0; i < 4; i++) { await p.tap('#b-wait'); await p.waitForTimeout(140); }
    const snap = await p.evaluate(() => JSON.stringify(TS.UI.S));
    await p.reload(); await p.waitForTimeout(400);
    assert(await p.isVisible('#btn-continue'), 'continue button');
    await p.tap('#btn-continue'); await p.waitForTimeout(300);
    assert(await p.isVisible('#screen-dungeon'));
    const now = await p.evaluate(() => JSON.stringify(TS.UI.S));
    assert(now === snap, 'state restored exactly');
    await shot('10_resumed');
  });

  await test('PCの矢印キーで操作できる', async () => {
    const b = await run();
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp']) { await p.keyboard.press(k); await p.waitForTimeout(140); }
    const a = await run();
    assert(a.turn > b.turn, 'keys move');
  });

  await test('階段に乗ると確認が出て、降りると地下2階', async () => {
    await p.evaluate(() => { const r = TS.UI.S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y - 0; TS.Game.updateVision(r); });
    await p.tap('#b-foot'); await p.waitForTimeout(150);
    assert(await p.isVisible('text=降りますか'));
    await shot('11_stairs');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(250);
    assert((await run()).floor === 2);
  });

  await test('帰還の巻物：確認後に村へ戻り、お金と持ち物を持ち帰る', async () => {
    await p.evaluate(() => { TS.UI.S.run.runGold = 77; TS.UI.S.run.bag.push(TS.Game.makeItem(TS.UI.S, 'jade_elephant')); });
    const funds = await p.evaluate(() => TS.UI.S.village.funds);
    await p.tap('#b-items'); await p.waitForTimeout(150);
    await p.tap('.row:has-text("帰還の巻物")'); await p.waitForTimeout(100);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(150);
    assert(await p.isVisible('text=帰還の巻物を使って村へ帰りますか'));
    await shot('12_return_confirm');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(700);
    assert(await p.isVisible('text=帰還！'));
    await shot('13_return_result');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    await closeTalk();
    const v = await p.evaluate(() => ({ funds: TS.UI.S.village.funds, run: TS.UI.S.run, bag: TS.UI.S.village.bag.map((i) => i.id) }));
    assert(v.run === null && v.funds === funds + 77 && v.bag.includes('jade_elephant') && !v.bag.includes('return_scroll'), JSON.stringify(v));
  });

  await test('お宝を確認して売却 → 村の発展を購入し、村の絵が変わる', async () => {
    await p.tap('.fac[data-fac="shop"]'); await p.waitForTimeout(150);
    await p.tap('.tabs button[data-t="sell"]'); await p.waitForTimeout(100);
    await p.tap('.row:has-text("翡翠の象")'); await p.waitForTimeout(100);
    assert(await p.isVisible('text=売りますか'));
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    await p.tap('.modal-buttons button'); await p.waitForTimeout(100);
    await p.evaluate(() => { TS.UI.S.village.funds += 1000; });
    await p.tap('.fac[data-fac="develop"]'); await p.waitForTimeout(150);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    await closeTalk();
    await p.tap('.fac[data-fac="develop"]'); await p.waitForTimeout(150);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    await closeTalk();
    assert(await p.evaluate(() => TS.UI.S.village.stage) === 3);
    await p.waitForTimeout(200);
    await shot('14_village_stage3');
    await p.tap('.fac[data-fac="smith"]'); await p.waitForTimeout(150);
    await shot('15_smith');
    await p.tap('.modal-buttons button'); await p.waitForTimeout(100);
  });

  await test('倒れると原因と到達階を表示し、すぐ再挑戦できる', async () => {
    await p.tap('.fac.depart'); await p.waitForTimeout(150);
    await p.click('text=出発する'); await p.waitForTimeout(150);
    await closeTalk();
    await p.evaluate(() => {
      const r = TS.UI.S.run, pl = r.player;
      r.enemies = [];
      r.runGold = 50;
      // 隣のマスにガマ蛙を置く
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (TS.Dungeon.passable(r.map, pl.x + dx, pl.y + dy)) {
          r.enemies.push({ id: 999, type: 'frog', x: pl.x + dx, y: pl.y + dy, hp: 99, maxhp: 99, atk: 99, def: 0, exp: 1, sleep: 0, tx: null, ty: null, acts: 0, dir: 'down' });
          break;
        }
      }
      pl.hp = 1;
      TS.Game.updateVision(r);
    });
    const funds = await p.evaluate(() => TS.UI.S.village.funds);
    for (let i = 0; i < 20 && !(await p.$('text=探索失敗')); i++) { await p.tap('#b-wait'); await p.waitForTimeout(150); }
    await p.waitForTimeout(400);
    assert(await p.isVisible('text=探索失敗'));
    assert(await p.isVisible('text=ガマ蛙にやられた'));
    await shot('16_defeat');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(150);
    await closeTalk();
    assert(await p.isVisible('text=遺跡へ出発'), 'depart screen for retry');
    const v = await p.evaluate(() => ({ funds: TS.UI.S.village.funds, bag: TS.UI.S.village.bag.length, run: TS.UI.S.run }));
    assert(v.funds === funds && v.bag === 0 && v.run === null, JSON.stringify(v));
    await p.tap('.modal-buttons button >> text=無料で借りる'); await p.waitForTimeout(150);
    await p.click('text=出発する'); await p.waitForTimeout(150);
    await closeTalk();
    assert(await p.isVisible('#screen-dungeon'), 'retried');
  });

  await test('10階で守護者を倒して宝珠を拾い、帰還口から帰るとエンディング', async () => {
    await p.evaluate(() => {
      const S = TS.UI.S;
      for (let f = S.run.floor; f < 10; f++) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; TS.Game.act(S, { type: 'descend' }); }
      const r = S.run, b = r.enemies.find((e) => e.boss);
      b.hp = 5;
      r.player.x = b.x - 1; r.player.y = b.y; r.player.hp = r.player.maxhp = 500;
      TS.Game.updateVision(r);
    });
    await p.waitForTimeout(200);
    await shot('17_boss');
    for (let i = 0; i < 20 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.tap('#dpad .right'); await p.waitForTimeout(160); }
    assert(await p.evaluate(() => !!TS.UI.S.run.portal), 'portal opened');
    await p.tap('#dpad .right'); await p.waitForTimeout(200); // 宝珠のマスへ
    if (await p.$('.modal')) { await p.tap('.modal-buttons button'); await p.waitForTimeout(100); }
    assert(await p.evaluate(() => TS.UI.S.run.bag.some((i) => i.id === 'wish_orb')), 'orb picked');
    await shot('18_orb');
    await p.evaluate(() => { const r = TS.UI.S.run; r.player.x = r.portal.x - 1; r.player.y = r.portal.y; TS.Game.updateVision(r); });
    await p.tap('#dpad .right'); await p.waitForTimeout(200);
    assert(await p.isVisible('text=帰還口'));
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(700);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(150);
    await closeTalk();
    assert(await p.isVisible('text=THANK YOU FOR PLAYING'));
    await shot('19_ending');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(300);
    assert(await p.evaluate(() => TS.UI.S.village.cleared && !TS.UI.S.run));
    await shot('20_village_cleared');
  });

  await test('はじめから（データ削除）は2回確認が出る', async () => {
    await p.reload(); await p.waitForTimeout(300);
    await p.tap('#btn-newgame'); await p.waitForTimeout(150);
    assert(await p.isVisible('text=すべて消えます'));
    await p.tap('.modal-buttons button >> text=やめる'); await p.waitForTimeout(100);
    assert(await p.evaluate(() => !!localStorage.getItem('takeSaiAdventure.save')), 'save kept');
  });

  await test('横向きスマホとPC画面でも崩れない', async () => {
    for (const [name, opt] of [['landscape', { viewport: { width: 860, height: 400 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true }],
      ['pc', { viewport: { width: 1280, height: 800 } }]]) {
      const { ctx: c2, p: p2 } = await mk(opt);
      await p2.goto(URL); await p2.waitForTimeout(300);
      await p2.screenshot({ path: path.join(OUT, `21_${name}_title.png`) });
      await p2.click('#btn-newgame'); await p2.waitForTimeout(150);
      for (let i = 0; i < 8 && await p2.$('.modal'); i++) { await p2.click('.modal-buttons button >> nth=-1'); await p2.waitForTimeout(60); }
      await p2.screenshot({ path: path.join(OUT, `22_${name}_village.png`) });
      await p2.click('.fac.depart'); await p2.waitForTimeout(100);
      await p2.click('text=無料で借りる'); await p2.waitForTimeout(100);
      await p2.click('text=出発する'); await p2.waitForTimeout(100);
      for (let i = 0; i < 4 && await p2.$('.modal'); i++) { await p2.click('.modal-buttons button.primary'); await p2.waitForTimeout(60); }
      await p2.keyboard.press('ArrowRight'); await p2.waitForTimeout(150);
      await p2.screenshot({ path: path.join(OUT, `23_${name}_dungeon.png`) });
      const m = await p2.evaluate(() => {
        const ids = ['dpad', 'actions', 'view', 'hud'];
        const out = { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight };
        for (const id of ids) { const r = document.getElementById(id).getBoundingClientRect(); out[id] = [r.left, r.top, r.right, r.bottom].map(Math.round); }
        return out;
      });
      assert(m.sw <= m.iw && m.sh <= m.ih, name + ' overflow ' + JSON.stringify(m));
      for (const id of ['dpad', 'actions', 'view']) assert(m[id][2] <= m.iw + 1 && m[id][3] <= m.ih + 1 && m[id][2] - m[id][0] > 50 && m[id][3] - m[id][1] > 50, name + ' ' + id + JSON.stringify(m));
      await c2.close();
    }
  });

  await test('ブラウザのエラー・読み込み失敗がない', async () => {
    assert(errors.length === 0, errors.join('\n'));
  });

  await browser.close();
  srv.close();
  console.log(`\n結果: ${passed} 成功 / ${failed} 失敗　（スクリーンショット: ${OUT}）`);
  process.exit(failed ? 1 : 0);
})();

function BASE_PLACEHOLDER() { return '/take-sai-adventure/favicon.png'; }
