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
function eq2(a, b, m) { if (a !== b) throw new Error((m || 'eq') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }

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
  const closeTalk = async () => { for (let i = 0; i < 40 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(40); } };
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

  await test('村を歩く：地面をタップすると1マスずつ歩き、人物をタップするとその前まで歩いて施設が開く。像に話しかけるとヤナイの言葉', async () => {
    const tapAt = async (sel) => { const pt = await p.evaluate(sel); await p.touchscreen.tap(pt.x, pt.y); };
    const hitPt = (id, kind) => `(() => { const h = TS.UI.vview.hits.find((h) => h.id === '${id}' && h.kind === '${kind}'); const r = document.getElementById('village-canvas').getBoundingClientRect(); return { x: r.left + h.x + h.w / 2, y: r.top + h.y + h.h - 6 }; })()`;
    const w0 = await p.evaluate(() => ({ x: TS.UI.walker.x, y: TS.UI.walker.y }));
    // 2マス左の地面をタップ
    await tapAt(`(() => { const v = TS.UI.vview, r = document.getElementById('village-canvas').getBoundingClientRect(), w = TS.UI.walker;
      // 画面を4pxごとに調べて、たけの2マス左のマスの位置をさがす
      let best = null; for (let y = 0; y < r.height; y += 4) for (let x = 0; x < r.width; x += 4) { const t = v.tile(x, y); if (t.x === w.x - 2 && t.y === w.y) { best = { x: r.left + x + 2, y: r.top + y + 2 }; break; } if (best) break; }
      return best; })()`);
    for (let i = 0; i < 20 && await p.evaluate(() => TS.UI.walker.moving || TS.UI.walker.path.length); i++) await p.waitForTimeout(80);
    const w1 = await p.evaluate(() => ({ x: TS.UI.walker.x, y: TS.UI.walker.y }));
    assert(w1.x === w0.x - 2 && w1.y === w0.y, 'walked ' + JSON.stringify([w0, w1]));
    // サイをタップ → 店の前まで歩いて店が開く
    await tapAt(hitPt('shop', 'npc'));
    for (let i = 0; i < 60 && !(await p.$('.modal')); i++) await p.waitForTimeout(80);
    assert(await p.isVisible('.modal h2:has-text("サイの店")'), 'shop by walking');
    assert(await p.evaluate(() => TS.UI.walker.x === 3 && TS.UI.walker.y === 15 && TS.UI.walker.dir === 'up'), 'stands at shop');
    await shot('03b_village_walk_shop');
    await p.tap('.modal-buttons button:last-child'); await p.waitForTimeout(150);
    // 記念像
    await tapAt(hitPt('statue', 'statue'));
    for (let i = 0; i < 80 && !(await p.$('.talk')); i++) await p.waitForTimeout(80);
    assert(await p.isVisible('.talk'), 'statue talk');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(80);
    assert(await p.evaluate(() => document.querySelector('.talk .who').textContent.includes('ヤナイ')), 'yanai speaks');
    await closeTalk();
    // キー操作：下へ1マス
    const k0 = await p.evaluate(() => ({ x: TS.UI.walker.x, y: TS.UI.walker.y }));
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(300);
    const k1 = await p.evaluate(() => ({ x: TS.UI.walker.x, y: TS.UI.walker.y }));
    assert(k1.y === k0.y + 1, 'key step');
    // 鍛冶屋（まだ空き地）：コイをタップすると、鍛冶屋の案内（解放条件のまま）
    await tapAt(hitPt('smith', 'npc'));
    for (let i = 0; i < 80 && !(await p.$('.modal')); i++) await p.waitForTimeout(80);
    assert(await p.isVisible('.modal'), 'smith modal');
    assert(await p.evaluate(() => TS.UI.S.village.smithLv === 0), 'smith still locked');
    await p.tap('.modal-buttons button:last-child'); await p.waitForTimeout(150);
  });

  await test('サイの店でおにぎりを借りて買い物ができる。木刀の貸し出しは無く、はじめは武器なし', async () => {
    assert(await p.evaluate(() => !TS.UI.S.village.bag.some((i) => i.id === 'wood_sword')), 'no sword at start');
    await p.tap('.fac[data-fac="shop"]'); await p.waitForTimeout(150);
    await p.tap('.tabs button[data-t="loan"]'); await p.waitForTimeout(100);
    assert(!(await p.$('.row[data-id="wood_sword"]')), 'no sword loan row');
    assert(!(await p.evaluate(() => document.querySelector('.modal').textContent.includes('木刀'))), 'no sword text');
    await p.tap('.row[data-id="loan_rice"]'); await p.waitForTimeout(100);
    assert(await p.$eval('.row[data-id="loan_rice"]', (e) => e.classList.contains('disabled')), 'loan once');
    await p.tap('.tabs button[data-t="buy"]'); await p.waitForTimeout(100);
    await p.tap('.row[data-id="herb"]'); await p.waitForTimeout(100);
    await shot('04_shop_confirm');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    const v = await p.evaluate(() => ({ funds: TS.UI.S.village.funds, bag: TS.UI.S.village.bag.map((i) => i.id) }));
    assert(v.funds === 20 && v.bag.includes('herb') && !v.bag.includes('wood_sword') && v.bag.includes('loan_rice'), JSON.stringify(v));
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
    await p.evaluate(() => { const r = TS.UI.S.run; r.enemies = []; r.floorItems = []; r.stairs = { x: 0, y: 0 }; r.returnPoint = null;
      const room = TS.Dungeon.roomAt(r.map, r.player.x, r.player.y) || r.map.rooms[0];
      r.player.x = room.x + 1; r.player.y = room.y + 2; TS.Game.updateVision(r); });
    let moved = 0, bumped = 0;
    for (const d of ['up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up']) {
      const b = await run();
      await p.tap(`#dpad [data-dir="${d}"]`); await p.waitForTimeout(160);
      if (await p.$('.modal')) { await p.tap('.modal-buttons button'); await p.waitForTimeout(80); }
      const a = await run();
      if (a.y !== b.y) { moved++; assert(a.turn === b.turn + 1); } else { bumped++; assert(a.turn === b.turn, 'bump no turn'); }
    }
    assert(bumped > 0, 'hit a wall');
  });

  await test('3×3の方向ボタンで斜めに移動（1ターン）、中央は待つ', async () => {
    await p.evaluate(() => { const r = TS.UI.S.run; r.enemies = []; const room = r.map.rooms[0]; r.player.x = room.x + 1; r.player.y = room.y + 1;
      // 斜め移動を確実に試せるよう、周囲を床にしておく
      for (let y = r.player.y - 1; y <= r.player.y + 1; y++) for (let x = r.player.x - 1; x <= r.player.x + 1; x++) r.map.tiles[y * r.map.w + x] = 1;
      TS.Game.updateVision(r); });
    for (const [d, dx, dy] of [['downright', 1, 1], ['upleft', -1, -1], ['upright', 1, -1], ['downleft', -1, 1]]) {
      const b = await run();
      await p.tap(`#dpad [data-dir="${d}"]`); await p.waitForTimeout(160);
      const a = await run();
      assert(a.x === b.x + dx && a.y === b.y + dy && a.turn === b.turn + 1, d + JSON.stringify([b, a]));
    }
    const b = await run();
    await p.tap('#b-wait'); await p.waitForTimeout(160);
    const a = await run();
    assert(a.turn === b.turn + 1 && a.x === b.x, 'center wait');
  });

  await test('ダッシュ：オンで押し続けると連続移動（1マス1ターン）、離すと即停止、壁で止まり押し直すまで再開しない', async () => {
    await p.evaluate(() => { const r = TS.UI.S.run; r.enemies = []; r.floorItems = [];
      const room = r.map.rooms.slice().sort((a, b) => b.w - a.w)[0]; r._room = room;
      // 右端の外が壁になっている行を選ぶ（出入口のない行）
      let yy = room.y; for (let y = room.y; y < room.y + room.h; y++) { const ok = [-1, 0, 1].every((d) => !TS.Dungeon.passable(r.map, room.x + room.w, y + d) || (y + d < room.y || y + d >= room.y + room.h)); if (ok && !TS.Dungeon.passable(r.map, room.x + room.w, y)) { yy = y; break; } }
      r.player.x = room.x; r.player.y = yy;
      // 階段・帰還の碑をこの部屋の外へ
      const other = r.map.rooms.find((o) => o !== room); r.stairs = { x: other.x, y: other.y }; r.returnPoint = null;
      TS.Game.updateVision(r); });
    await p.tap('#b-dash'); await p.waitForTimeout(100);
    assert(await p.$eval('#b-dash', (b) => b.classList.contains('on') && b.textContent.includes('オン')), 'dash on shown');
    const press = (d) => p.evaluate((d) => document.querySelector(`#dpad [data-dir="${d}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7 })), d);
    const release = (d) => p.evaluate((d) => document.querySelector(`#dpad [data-dir="${d}"]`).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 7 })), d);
    const b0 = await run();
    await press('right'); await p.waitForTimeout(170); await release('right');
    const b1 = await run();
    assert(b1.x - b0.x >= 2 && b1.turn - b0.turn === b1.x - b0.x, 'moved while held ' + JSON.stringify([b0, b1]));
    await p.waitForTimeout(400);
    const b2 = await run();
    assert(b2.turn === b1.turn && b2.x === b1.x, 'stops on release');
    // 壁まで押し続ける → 止まって、押したままでも再開しない
    await press('right'); await p.waitForTimeout(2500);
    const b3 = await run();
    const wall = await p.evaluate(() => { const r = TS.UI.S.run; return r._room.x + r._room.w - 1; });
    assert(b3.x === wall, 'stopped at wall ' + b3.x + ' vs ' + wall);
    await p.waitForTimeout(400);
    const b4 = await run();
    assert(b4.turn === b3.turn, 'no restart while held');
    await release('right');
    // メニューを開くと止まる
    await p.evaluate(() => { const r = TS.UI.S.run; r.player.x = r._room.x; TS.Game.updateVision(r); });
    await press('right'); await p.waitForTimeout(80);
    await p.evaluate(() => document.querySelector('#b-menu').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
    const c1 = await run(); await p.waitForTimeout(400); const c2 = await run();
    assert(c1.turn === c2.turn, 'menu stops dash');
    await release('right');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    await p.tap('#b-dash'); await p.waitForTimeout(100);
    assert(await p.$eval('#b-dash', (b) => !b.classList.contains('on')), 'dash off');
  });

  // ---- 操作（短押し・長押し・向き・足踏み・解除） ----
  const openRoom = () => p.evaluate(() => {
    const r = TS.UI.S.run; r.enemies = []; r.floorItems = []; r.returnPoint = null;
    // 中央に広い空き部屋を作る（テスト用）
    const m = r.map; const x0 = 8, y0 = 6, w = 17, h = 13;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) m.tiles[y * m.w + x] = 1;
    m.rooms = [{ id: 99, x: x0, y: y0, w, h }]; // ほかの部屋とは重ねない
    r.stairs = { x: 1, y: 1 }; r.player.x = 16; r.player.y = 12; r.player.hp = r.player.maxhp = 999;
    TS.Game.updateVision(r); TS.Render.resetLayer && TS.Render.resetLayer();
  });
  const pdown = (d, id = 11) => p.evaluate(([d, id]) => document.querySelector(`#dpad [data-dir="${d}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id })), [d, id]);
  const pup = (d, id = 11, type = 'pointerup') => p.evaluate(([d, id, type]) => document.querySelector(`#dpad [data-dir="${d}"]`).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id })), [d, id, type]);
  const center = () => p.evaluate(() => { const r = TS.UI.S.run; r.enemies = r.enemies.filter((e) => e._keep); r.player.x = 16; r.player.y = 12; r.player.hp = r.player.maxhp; TS.Game.updateVision(r); });
  const DIRS8 = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0], ['upleft', -1, -1], ['upright', 1, -1], ['downleft', -1, 1], ['downright', 1, 1]];

  await test('8方向すべて：短く押すと1歩だけ（1ターン）', async () => {
    await openRoom();
    for (const [d, dx, dy] of DIRS8) {
      await center(); await p.waitForTimeout(120);
      const b = await run();
      await pdown(d); await p.waitForTimeout(80); await pup(d); await p.waitForTimeout(400);
      const a = await run();
      assert(a.x === b.x + dx && a.y === b.y + dy && a.turn === b.turn + 1, d + JSON.stringify([b, a]));
    }
  });
  await test('8方向すべて：長押しで300ms後から連続移動、離すと即停止（1マス1ターン）', async () => {
    await openRoom();
    for (const [d, dx, dy] of DIRS8) {
      await center(); await p.waitForTimeout(150);
      const b = await run();
      await pdown(d); await p.waitForTimeout(820); await pup(d);
      const a = await run();
      const steps = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      assert(steps >= 3 && steps <= 5, d + ' steps ' + steps + ' stop=' + await p.evaluate(() => TS.UI.lastStop) + JSON.stringify([b, a]));
      assert(a.x - b.x === dx * steps && a.y - b.y === dy * steps && a.turn - b.turn === steps, d + JSON.stringify([b, a]));
      await p.waitForTimeout(400);
      const c = await run();
      assert(c.turn === a.turn, d + ' stops on release');
    }
  });
  await test('長押しの解除：キャンセル・画面外で離す・ウィンドウのフォーカス喪失・メニュー表示で止まる', async () => {
    await openRoom();
    const holdThen = async (fn) => {
      await center(); await p.waitForTimeout(150);
      await pdown('right'); await p.waitForTimeout(450);
      await fn();
      const a = await run(); await p.waitForTimeout(500); const b = await run();
      await pup('right');
      return a.turn === b.turn;
    };
    assert(await holdThen(() => pup('right', 11, 'pointercancel')), 'pointercancel');
    assert(await holdThen(() => p.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11 })))), 'pointerup outside');
    assert(await holdThen(() => p.evaluate(() => window.dispatchEvent(new Event('blur')))), 'blur (app background)');
    assert(await holdThen(() => p.evaluate(() => document.querySelector('#b-menu').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))), 'menu');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
  });
  await test('長押し中に敵が隣に来たら止まり、押しっぱなしで攻撃を繰り返さない', async () => {
    await openRoom();
    await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game; const e = G.makeEnemy(r, 'frog', 21, 12); e.sleep = 999; e.hp = e.maxhp = 999; e._keep = true; r.enemies.push(e); G.updateVision(r); });
    await center(); await p.waitForTimeout(150);
    const b = await run();
    await pdown('right'); await p.waitForTimeout(1600);
    const a = await run();
    const ehp = await p.evaluate(() => TS.UI.S.run.enemies[0].hp);
    await pup('right');
    assert(a.x === 20 && ehp === 999, 'stopped next to enemy without attacking ' + JSON.stringify([a, ehp]));
    // 押し直すと1回だけ攻撃
    await pdown('right'); await p.waitForTimeout(900); await pup('right');
    const t = await run();
    assert(t.turn === a.turn + 1 && t.x === 20, 'one attack per press');
    await p.evaluate(() => { TS.UI.S.run.enemies = []; });
  });
  await test('「向き」オン：方向ボタンで向きだけ変わり、ターン・敵・満腹度が進まない。「足踏み」は1ターン', async () => {
    await openRoom(); await center();
    await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game; const e = G.makeEnemy(r, 'frog', 9, 7); e.hp = e.maxhp = 999; e._keep = true; r.enemies.push(e); G.updateVision(r); });
    await p.tap('#b-face'); await p.waitForTimeout(150);
    assert(await p.$eval('#b-face', (b) => b.classList.contains('on') && b.textContent.includes('変更中')), 'face mode shown');
    assert(await p.isVisible('#facenote'), 'facenote');
    const s0 = await p.evaluate(() => ({ turn: TS.UI.S.run.turn, hunger: TS.UI.S.run.player.hunger, acc: TS.UI.S.run.player.hungerAcc, acts: TS.UI.S.run.enemies[0].acts, x: TS.UI.S.run.player.x, y: TS.UI.S.run.player.y }));
    for (const [d] of DIRS8) {
      await pdown(d); await p.waitForTimeout(500); await pup(d); await p.waitForTimeout(40);
      assert(await p.evaluate(() => TS.UI.S.run.player.dir) === d, 'faces ' + d);
    }
    await shot('25_face_mode');
    const s1 = await p.evaluate(() => ({ turn: TS.UI.S.run.turn, hunger: TS.UI.S.run.player.hunger, acc: TS.UI.S.run.player.hungerAcc, acts: TS.UI.S.run.enemies[0].acts, x: TS.UI.S.run.player.x, y: TS.UI.S.run.player.y }));
    assert(JSON.stringify(s0) === JSON.stringify(s1), 'nothing advanced ' + JSON.stringify([s0, s1]));
    // 向きは杖に反映される
    await pdown('upleft'); await pup('upleft');
    const hit = await p.evaluate(() => { const S = TS.UI.S, r = S.run, G = TS.Game; const e = r.enemies[0]; e.x = r.player.x - 3; e.y = r.player.y - 3; G.updateVision(r);
      const st = G.makeItem(S, 'thunder_staff', { charges: 2 }); r.bag.push(st); G.act(S, { type: 'use', uid: st.uid }); r.bag.splice(r.bag.indexOf(st), 1); return e.hp; });
    assert(hit === 969, 'staff used facing direction ' + hit);
    await p.tap('#b-face'); await p.waitForTimeout(150);
    assert(await p.$eval('#b-face', (b) => !b.classList.contains('on')), 'face off');
    const b = await run();
    await p.tap('#b-wait'); await p.waitForTimeout(200);
    const a = await run();
    assert(a.turn === b.turn + 1 && a.x === b.x && a.y === b.y, 'step in place = 1 turn');
    await p.evaluate(() => { TS.UI.S.run.enemies = []; });
  });
  const faceDown = () => p.evaluate(() => document.querySelector('#b-face').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 21 })));
  const faceUp = (type = 'pointerup') => p.evaluate((type) => document.querySelector('#b-face').dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 21 })), type);
  const faceOn = () => p.$eval('#b-face', (b) => b.classList.contains('on'));
  await test('「向き」短押し：離したときに向き変更モードを切り替え、ターンは進まない', async () => {
    await openRoom(); await center();
    const b0 = await run(); const on0 = await faceOn();
    await faceDown(); await p.waitForTimeout(80);
    assert((await faceOn()) === on0, 'not toggled on press');
    await faceUp(); await p.waitForTimeout(60);
    assert((await faceOn()) === !on0, 'toggled on release');
    await faceDown(); await p.waitForTimeout(80); await faceUp(); await p.waitForTimeout(60);
    assert((await faceOn()) === on0, 'toggled back');
    assert((await run()).turn === b0.turn, 'no turn');
  });
  await test('「向き」長押し：400ms後から休息（1回1ターン・自然回復）。離すと即停止し短押しは発動しない。モードは維持', async () => {
    await openRoom(); await center();
    await p.evaluate(() => { const pl = TS.UI.S.run.player; pl.maxhp = 999; pl.hp = 500; pl.hunger = 90; });
    const b0 = await p.evaluate(() => ({ turn: TS.UI.S.run.turn, hp: TS.UI.S.run.player.hp, x: TS.UI.S.run.player.x, hunger: TS.UI.S.run.player.hunger, acc: TS.UI.S.run.player.hungerAcc }));
    const on0 = await faceOn();
    const tHold = Date.now();
    await faceDown(); await p.waitForTimeout(300);
    assert((await run()).turn === b0.turn, 'no rest before 400ms');
    await p.waitForTimeout(700);
    assert(await p.isVisible('#restnote'), '休息中 shown');
    await shot('28_resting');
    // 休息中の方向入力で動かない
    await pdown('right'); await p.waitForTimeout(100); await pup('right');
    await faceUp();
    const held = Date.now() - tHold;
    const a = await p.evaluate(() => ({ turn: TS.UI.S.run.turn, hp: TS.UI.S.run.player.hp, x: TS.UI.S.run.player.x }));
    // 400ms後から約180msに1ターン（押していた時間から上限を出す。スクリーンショットの時間も含む）
    const maxTurns = Math.floor((held - 400) / 170) + 1;
    assert(a.turn - b0.turn >= 2 && a.turn - b0.turn <= maxTurns, 'rest turns ' + (a.turn - b0.turn) + ' held ' + held + 'ms');
    assert(a.hp > b0.hp && a.x === b0.x, 'regen, no move ' + JSON.stringify([b0, a]));
    await p.waitForTimeout(500);
    assert((await run()).turn === a.turn, 'stops on release, no extra turn');
    assert((await faceOn()) === on0, 'mode kept after long press');
    assert(!(await p.isVisible('#restnote')), 'note hidden');
  });
  await test('休息：HP全回復で自動停止、敵が見えていると開始しない（理由を表示）、キャンセル・メニューで停止', async () => {
    await openRoom(); await center();
    await p.evaluate(() => { const pl = TS.UI.S.run.player; pl.maxhp = 999; pl.hp = 997; pl.regenAcc = 0; });
    await faceDown(); await p.waitForTimeout(2200);
    const full = await p.evaluate(() => ({ hp: TS.UI.S.run.player.hp, max: TS.UI.S.run.player.maxhp, stop: TS.UI.lastStop }));
    const t1 = (await run()).turn; await p.waitForTimeout(400);
    assert(full.hp === full.max && full.stop === 'full' && (await run()).turn === t1, 'stopped at full ' + JSON.stringify(full));
    assert(/休息終了：HPが満タン/.test(await p.textContent('#stopnote')), 'reason shown');
    await faceUp();
    // 敵が見えている → 開始しない
    await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game; r.player.hp = 300; const e = G.makeEnemy(r, 'frog', 12, 9); e.sleep = 99; e._keep = true; r.enemies.push(e); G.updateVision(r); });
    const t2 = (await run()).turn;
    await faceDown(); await p.waitForTimeout(800);
    assert((await run()).turn === t2 && /休めない：敵が見えている/.test(await p.textContent('#stopnote')), 'blocked by enemy');
    await faceUp();
    await p.evaluate(() => { TS.UI.S.run.enemies = []; });
    // キャンセルで停止
    await faceDown(); await p.waitForTimeout(700);
    await faceUp('pointercancel');
    const t3 = (await run()).turn; await p.waitForTimeout(500);
    assert((await run()).turn === t3, 'cancel stops');
    // メニューで停止
    await faceDown(); await p.waitForTimeout(700);
    await p.evaluate(() => document.querySelector('#b-menu').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    const t4 = (await run()).turn; await p.waitForTimeout(500);
    assert((await run()).turn === t4, 'menu stops');
    await faceUp();
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    // 押し直すと再開できる
    const t5 = (await run()).turn;
    await faceDown(); await p.waitForTimeout(800); await faceUp();
    assert((await run()).turn > t5, 'resumes after re-press');
  });

  await test('ダッシュ：安全停止の理由を表示、押し直すと再開。通常⇔ダッシュの切替で速度が正しく、古い長押しが残らない', async () => {
    await openRoom(); await center();
    // 通常の長押しの速さ（約170ms/歩）
    const speed = async (ms) => { await center(); await p.waitForTimeout(150); const b = await run(); await pdown('left'); await p.waitForTimeout(ms); await pup('left'); const a = await run(); return b.x - a.x; };
    const walk = await speed(700);
    await p.tap('#b-dash'); await p.waitForTimeout(100);
    const dash = await speed(500);
    assert(walk >= 2 && walk <= 4 && dash >= 5 && dash > walk, `walk ${walk} dash ${dash}`);
    // 古い長押しが残らない：押したまま切替→何も動かない
    await center(); await p.waitForTimeout(150);
    await pdown('left'); await p.waitForTimeout(150);
    await p.tap('#b-dash'); await p.waitForTimeout(50);
    const a1 = await run(); await p.waitForTimeout(500); const a2 = await run();
    await pup('left');
    assert(a1.turn === a2.turn, 'old hold cleared on mode switch');
    await p.tap('#b-dash'); await p.waitForTimeout(100);
    // 安全停止（足元の道具）→ 理由表示 → 押し直すと再開
    await center();
    await p.evaluate(() => { const S = TS.UI.S, r = S.run; r.floorItems.push({ x: 13, y: 12, item: TS.Game.makeItem(S, 'herb') }); });
    await pdown('left'); await p.waitForTimeout(700);
    const st = await run();
    const note = await p.textContent('#stopnote');
    assert(st.x === 13 && /ダッシュ停止：足元に道具/.test(note), 'safe stop ' + JSON.stringify(st) + note);
    await shot('26_dash_stop');
    await p.waitForTimeout(300);
    assert((await run()).x === 13, 'no auto restart');
    await pup('left');
    await pdown('left'); await p.waitForTimeout(250); await pup('left');
    assert((await run()).x < 13, 'resumes after re-press');
    await p.tap('#b-dash'); await p.waitForTimeout(100);
  });
  await test('整理：バッグと倉庫を種類順に並べ、数・強化値・装備は変わらず、ターンも進まない', async () => {
    const before = await p.evaluate(() => {
      const S = TS.UI.S, r = S.run, G = TS.Game;
      r.bag.push(G.makeItem(S, 'golden_lotus'), G.makeItem(S, 'herb'), G.makeItem(S, 'bronze_sword', { plus: 2 }), G.makeItem(S, 'banana'));
      return { turn: r.turn, ids: r.bag.map((i) => i.uid + ':' + i.id + ':' + i.plus + ':' + !!i.eq).sort().join(), eq: r.bag.filter((i) => i.eq).map((i) => i.uid).join() };
    });
    await p.tap('#b-items'); await p.waitForTimeout(150);
    await p.tap('.modal-buttons button >> text=整理'); await p.waitForTimeout(120);
    await shot('27_sorted_bag');
    const after = await p.evaluate(() => { const r = TS.UI.S.run; return { turn: r.turn, ids: r.bag.map((i) => i.uid + ':' + i.id + ':' + i.plus + ':' + !!i.eq).sort().join(), eq: r.bag.filter((i) => i.eq).map((i) => i.uid).join(), types: r.bag.map((i) => TS.Game.def(i).type) }; });
    assert(after.turn === before.turn && after.ids === before.ids && after.eq === before.eq, 'unchanged attrs');
    assert(after.types[0] === 'weapon' && after.types[after.types.length - 1] === 'treasure', after.types.join());
    // 整理後に選んだ品の説明が正しい
    const firstName = await p.evaluate(() => TS.Game.itemName(TS.UI.S.run.bag[0]));
    await p.tap('.row >> nth=0'); await p.waitForTimeout(120);
    const title = await p.textContent('#modal-root .back:last-child h2');
    assert(title.includes(firstName.replace(/\[.*\]/, '').replace(/\+\d+$/, '')), 'detail matches ' + title + ' / ' + firstName);
    await p.tap('.modal-buttons button >> text=戻る'); await p.waitForTimeout(80);
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(80);
    await p.evaluate(() => { const r = TS.UI.S.run; r.bag = r.bag.filter((i) => !['golden_lotus', 'banana'].includes(i.id) || i.uid < 50); });
  });

  await test('消耗品はすべて使う操作がある。どんそくの粉：「戻る」では減らず、「まく」で1個減って1ターン・見えている敵が鈍足', async () => {
    const missing = await p.evaluate(() => Object.entries(TS.Data.ITEMS).filter(([id, d]) => !['weapon', 'shield', 'staff', 'return', 'treasure', 'material', 'orb', 'charm'].includes(d.type) && !TS.UI.USE_LABEL[d.type]).map(([id]) => id));
    assert(!missing.length, 'no use action: ' + missing.join());
    await openRoom();
    const b = await p.evaluate(() => { const S = TS.UI.S, r = S.run, G = TS.Game;
      r.bag = r.bag.filter((i) => i.id !== 'slow_powder');
      r.bag.push(G.makeItem(S, 'slow_powder'));
      const e = G.makeEnemy(r, 'frog', r.player.x + 4, r.player.y); e.atk = 0; e.hp = e.maxhp = 999; r.enemies.push(e); G.updateVision(r);
      return { turn: r.turn, n: r.bag.length }; });
    await p.tap('#b-items'); await p.waitForTimeout(150);
    await p.tap('.row:has-text("どんそくの粉")'); await p.waitForTimeout(120);
    assert(await p.isVisible('.modal-buttons button.primary >> text=まく'), 'use button shown');
    await p.tap('.modal-buttons button >> text=戻る'); await p.waitForTimeout(80);
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(80);
    let a = await p.evaluate(() => ({ turn: TS.UI.S.run.turn, n: TS.UI.S.run.bag.length }));
    assert(a.turn === b.turn && a.n === b.n, 'cancel keeps item');
    await p.tap('#b-items'); await p.waitForTimeout(150);
    await p.tap('.row:has-text("どんそくの粉")'); await p.waitForTimeout(120);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(200);
    a = await p.evaluate(() => ({ turn: TS.UI.S.run.turn, n: TS.UI.S.run.bag.length, slow: TS.UI.S.run.enemies[0].slow }));
    assert(a.turn === b.turn + 1 && a.n === b.n - 1 && a.slow > 0, JSON.stringify(a));
    await p.evaluate(() => { TS.UI.S.run.enemies = []; });
  });
  await test('雷帝の杖：向きを選ぶ画面で「やめる」なら回数が減らず、方向を選ぶと最初の敵に54ダメージ', async () => {
    await openRoom();
    const b = await p.evaluate(() => { const S = TS.UI.S, r = S.run, G = TS.Game;
      const st = G.makeItem(S, 'thunder_king_staff', { charges: 3 }); r.bag.push(st);
      const e = G.makeEnemy(r, 'frog', r.player.x - 3, r.player.y - 3); e.atk = 0; e.def = 99; e.hp = e.maxhp = 999; r.enemies.push(e); G.updateVision(r);
      return { turn: r.turn, uid: st.uid }; });
    await p.tap('#b-items'); await p.waitForTimeout(150);
    await p.tap('.row:has-text("雷帝の杖")'); await p.waitForTimeout(120);
    await shot('29_king_staff');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(120);
    await p.tap('.modal-buttons button >> text=やめる'); await p.waitForTimeout(100);
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(100);  // 道具一覧に戻っている
    let a = await p.evaluate((uid) => ({ turn: TS.UI.S.run.turn, c: TS.UI.S.run.bag.find((i) => i.uid === uid).charges }), b.uid);
    assert(a.turn === b.turn && a.c === 3, 'cancel ' + JSON.stringify(a));
    await p.tap('#b-items'); await p.waitForTimeout(150);
    await p.tap('.row:has-text("雷帝の杖")'); await p.waitForTimeout(120);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(120);
    await p.tap('.dir-pick button[data-d="upleft"]'); await p.waitForTimeout(250);
    a = await p.evaluate((uid) => ({ turn: TS.UI.S.run.turn, c: TS.UI.S.run.bag.find((i) => i.uid === uid).charges, hp: TS.UI.S.run.enemies[0].hp }), b.uid);
    assert(a.turn === b.turn + 1 && a.c === 2 && a.hp === 999 - 54, JSON.stringify(a));
    await p.evaluate((uid) => { const r = TS.UI.S.run; r.enemies = []; r.bag = r.bag.filter((i) => i.uid !== uid); }, b.uid);
  });
  await test('モンスターハウス：入ると「モンスターハウスだ！」と表示し、ダッシュが止まる', async () => {
    await openRoom();
    const ok = await p.evaluate(() => { const S = TS.UI.S, r = S.run, G = TS.Game, m = r.map;
      // 部屋の左に通路と出入口だけを残し（ほかの地形は壁に）、部屋をモンスターハウスにする
      for (let i = 0; i < m.tiles.length; i++) { const x = i % m.w, y = (i / m.w) | 0; if (!(x >= 8 && x < 25 && y >= 6 && y < 19)) m.tiles[i] = 0; }
      for (let x = 2; x < 8; x++) m.tiles[12 * m.w + x] = 2;
      m.monsterHouse = 99; r.mhTriggered = false;
      r.player.x = 4; r.player.y = 12; r.player.dir = 'right';
      for (const [x, y] of [[14, 8], [18, 16], [22, 10]]) { const e = G.makeEnemy(r, 'frog', x, y); e.mh = true; e.sleep = 999; e.atk = 0; r.enemies.push(e); }
      G.updateVision(r); TS.Render.resetLayer(); return true; });
    assert(ok);
    await p.tap('#b-dash'); await p.waitForTimeout(80);
    await pdown('right'); await p.waitForTimeout(900); await pup('right');
    await p.waitForTimeout(150);
    // 入口で眠っている敵が見えて一度止まる → 押し直すと部屋に入り、そこで止まる
    const atDoor = await p.evaluate(() => TS.UI.S.run.player.x);
    assert(atDoor === 7, 'stopped at the door first ' + atDoor);
    await pdown('right'); await p.waitForTimeout(900); await pup('right');
    await p.waitForTimeout(150);
    await shot('30_monster_house');
    const st = await p.evaluate(() => ({ x: TS.UI.S.run.player.x, trig: TS.UI.S.run.mhTriggered, toast: document.getElementById('toast').textContent }));
    assert(st.trig && st.x === 8, 'stopped at room entrance ' + JSON.stringify(st));
    assert(st.toast.includes('モンスターハウス'), 'toast ' + st.toast);
    await p.tap('#b-dash'); await p.waitForTimeout(80);
    await p.evaluate(() => { TS.UI.S.run.enemies = []; TS.UI.S.run.map.monsterHouse = null; });
  });
  await test('持ち物は15枠：道具画面に「/15」、15個で拾えず品物は床に残る', async () => {
    await openRoom();
    await p.evaluate(() => { const S = TS.UI.S, r = S.run, G = TS.Game;
      r._keepBag = r.bag.length;
      while (r.bag.length < 15) r.bag.push(G.makeItem(S, 'herb'));
      r.floorItems.push({ x: r.player.x + 1, y: r.player.y, item: G.makeItem(S, 'banana') }); });
    await p.tap('#b-items'); await p.waitForTimeout(150);
    const right = await p.textContent('#modal-root .back:last-child h2 .right');
    assert(right.trim() === '15/15', right);
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(80);
    await p.tap('#dpad [data-dir="right"]'); await p.waitForTimeout(250);
    const a = await p.evaluate(() => ({ n: TS.UI.S.run.bag.length, onFloor: TS.UI.S.run.floorItems.length }));
    assert(a.n === 15 && a.onFloor === 1, JSON.stringify(a));
    await p.evaluate(() => { const r = TS.UI.S.run; r.bag = r.bag.slice(0, r._keepBag); delete r._keepBag; r.floorItems = []; });
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
    await p.tap('.row:has-text("やくそう")'); await p.waitForTimeout(100);
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
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(250);
    // 帰還が成立したときだけ、足元に魔法陣が出てから村へ切り替わる
    assert(await p.evaluate(() => TS.Render.fx.some((f) => f.t === 'circle')), 'return circle');
    await shot('12b_return_circle');
    for (let i = 0; i < 20 && !(await p.$('text=帰還！')); i++) await p.waitForTimeout(100);
    assert(await p.isVisible('text=帰還！'));
    await shot('13_return_result');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    await closeTalk();
    const v = await p.evaluate(() => ({ funds: TS.UI.S.village.funds, run: TS.UI.S.run, bag: TS.UI.S.village.bag.map((i) => i.id) }));
    assert(v.run === null && v.funds === funds + 77 && v.bag.includes('jade_elephant') && !v.bag.includes('return_scroll'), JSON.stringify(v));
  });

  await test('お宝を確認して売却 → 施設一覧で価格・効果・条件を見て購入し、村の絵と次の目標が変わる', async () => {
    await p.tap('.fac[data-fac="shop"]'); await p.waitForTimeout(150);
    await p.tap('.tabs button[data-t="sell"]'); await p.waitForTimeout(100);
    await p.tap('.row:has-text("ひすいの象")'); await p.waitForTimeout(100);
    assert(await p.isVisible('text=売りますか'));
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(100);
    await p.tap('.modal-buttons button'); await p.waitForTimeout(100);
    const goal0 = await p.textContent('#v-goal');
    await p.evaluate(() => { TS.UI.S.village.funds += 5000; TS.UI.S.village.bestFloor = 12; });
    await p.tap('.fac[data-fac="develop"]'); await p.waitForTimeout(150);
    assert(await p.isVisible('.stage[data-id="storage2"]:has-text("200G")'), 'price shown');
    assert(await p.isVisible('.stage[data-id="smith2"]:has-text("🔒")'), 'condition shown');
    await shot('14a_develop');
    const build = async (id) => {
      await p.tap(`.stage[data-id="${id}"]`); await p.waitForTimeout(120);
      await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(120);
      await closeTalk();
    };
    for (const id of ['storage2', 'smith1', 'diner', 'museum']) await build(id);
    await p.tap('.tabs button[data-t="decor"]'); await p.waitForTimeout(100);
    await build('lanterns');
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(150);
    const v = await p.evaluate(() => ({ stage: TS.UI.S.village.stage, smith: TS.UI.S.village.smithLv, diner: TS.UI.S.village.diner, museum: TS.UI.S.village.museum, lan: TS.UI.S.village.decor.lanterns, funds: TS.UI.S.village.funds }));
    assert(v.stage === 3 && v.smith === 1 && v.diner && v.museum && v.lan, JSON.stringify(v));
    assert((await p.textContent('#v-goal')) !== goal0, 'goal panel updates');
    await p.waitForTimeout(200);
    await shot('14_village_built');
    // 鍛冶屋
    await p.tap('.fac[data-fac="smith"]'); await p.waitForTimeout(150);
    assert(await p.isVisible('text=強化の上限'), 'smith level shown');
    await shot('15_smith');
    await p.tap('.modal-buttons button'); await p.waitForTimeout(100);
    // 食堂
    const f1 = await p.evaluate(() => TS.UI.S.village.funds);
    await p.tap('.fac[data-fac="diner"]'); await p.waitForTimeout(150);
    await p.tap('.row[data-id="gapao"]'); await p.waitForTimeout(100);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(120);
    await closeTalk();
    await shot('15b_diner');
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(100);
    assert(await p.evaluate((f) => TS.UI.S.village.meal === 'gapao' && TS.UI.S.village.funds === f - 150, f1), 'meal bought');
    // 展示室
    await p.evaluate(() => { const S = TS.UI.S; S.village.bag.push(TS.Game.makeItem(S, 'golden_lotus')); });
    await p.tap('.fac[data-fac="museum"]'); await p.waitForTimeout(150);
    await p.tap('.row:has-text("黄金の蓮")'); await p.waitForTimeout(100);
    assert(await p.isVisible('text=寄贈すると'), 'sell vs donate shown');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(120);
    await closeTalk();
    await shot('15c_museum');
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(100);
    assert(await p.evaluate(() => TS.UI.S.village.donated.golden_lotus === true), 'donated');
    // 倉庫の整理
    const sb = await p.evaluate(() => { const S = TS.UI.S, V = S.village, G = TS.Game;
      V.storage.push(G.makeItem(S, 'jade_elephant'), G.makeItem(S, 'herb'), G.makeItem(S, 'iron_katana', { plus: 2 }));
      return V.storage.map((i) => i.uid + ':' + i.plus).sort().join(); });
    await p.tap('.fac[data-fac="storage"]'); await p.waitForTimeout(150);
    await p.tap('.tabs button[data-t="out"]'); await p.waitForTimeout(80);
    await p.tap('.modal-buttons button >> text=整理'); await p.waitForTimeout(100);
    await shot('15d_storage_sorted');
    const sa = await p.evaluate(() => ({ ids: TS.UI.S.village.storage.map((i) => i.uid + ':' + i.plus).sort().join(), first: TS.Game.def(TS.UI.S.village.storage[0]).type }));
    assert(sa.ids === sb && sa.first === 'weapon', 'storage sorted ' + JSON.stringify(sa));
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(100);
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
    assert(await p.evaluate(() => TS.UI.S.run.meal === 'gapao' && TS.UI.S.village.meal === null), 'meal applied on depart');
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
    assert(!(await p.evaluate(() => document.querySelector('.modal').textContent.includes('木刀'))), 'no sword hint on retry');
    await p.tap('.modal-buttons button >> text=おにぎりを借りる'); await p.waitForTimeout(150);
    await p.click('text=出発する'); await p.waitForTimeout(150);
    await closeTalk();
    assert(await p.isVisible('#screen-dungeon'), 'retried');
    assert(await p.evaluate(() => !TS.UI.S.run.bag.some((i) => i.id === 'wood_sword') && !TS.UI.S.run.bag.some((i) => i.eq && TS.Game.def(i).type === 'weapon')), 'retry without sword');
  });

  await test('第1章：30階のクロコダインに登場の表示と会話。倒すと報酬と帰還口。帰ると章クリアの会話と第2章の表示', async () => {
    await p.evaluate(() => {
      const S = TS.UI.S, G = TS.Game;
      S.run.player.hp = S.run.player.maxhp = 9999;
      while (S.run.floor < 29) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; r.enemies = [];
    });
    await p.tap('#b-foot'); await p.waitForTimeout(200);       // 階段の確認
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(900);
    assert(await p.isVisible('.talk'), 'boss intro talk');
    assert(await p.isVisible('.who:has-text("クロコダイン")'), 'boss speaks');
    await closeTalk();
    await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game, b = r.enemies.find((e) => e.boss); b.hp = 5; b.cds = { rush: 9, axe: 9 }; r.player.x = b.x - 1; r.player.y = b.y; r.player.hp = r.player.maxhp = 900; G.updateVision(r); });
    await p.waitForTimeout(200);
    await shot('17_boss');
    assert(await p.evaluate(() => TS.Sprites.s.enemy.croc[0].art === true && TS.Sprites.s.enemy.croc[0].width === 96), 'boss drawn from the reference art');
    for (let i = 0; i < 20 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.tap('#dpad [data-dir="right"]'); await p.waitForTimeout(160); }
    assert(await p.evaluate(() => TS.Render.fx.some((f) => f.t === 'bossdie' && f.sprite === 'croc')), 'boss defeat effect');
    await p.waitForTimeout(300); await shot('17b_boss_defeat');
    await p.waitForTimeout(400); await closeTalk();
    assert(await p.evaluate(() => !!TS.UI.S.run.portal && TS.UI.S.village.story.defeated.croc), 'portal opened');
    assert(await p.evaluate(() => TS.UI.S.run.floorItems.some((f) => f.item && f.item.id === 'dragon_shield')), 'reward on floor');
    const dir = await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game;
      for (const [d, [dx, dy]] of Object.entries(G.DIRS)) { const x = r.portal.x - dx, y = r.portal.y - dy;
        if (G.canStep(r.map, x, y, dx, dy) && !G.enemyAt(r, x, y)) { r.player.x = x; r.player.y = y; G.updateVision(r); return d; } } });
    await p.tap(`#dpad [data-dir="${dir}"]`); await p.waitForTimeout(250);
    assert(await p.isVisible('.modal h2:has-text("帰還口")'), 'portal prompt');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(700);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(300);   // 帰還の結果
    assert(await p.isVisible('.talk'), 'chapter clear talk');
    await closeTalk();
    assert(await p.isVisible('.modal h2:has-text("第1章 クリア")'), 'chapter clear summary');
    await shot('18_chapter_clear');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(200);
    const ch = await p.evaluate(() => ({ ch: TS.UI.S.village.story.chapter, txt: document.getElementById('v-chapter').textContent, pend: TS.UI.S.village.story.pending }));
    assert(ch.ch === 2 && ch.txt.includes('第2章') && ch.txt.includes('フレイザード') && !ch.pend, JSON.stringify(ch));
  });

  await test('最終章：35階で大魔王バーン→静寂と変身の演出→準備画面（時間停止）→「最終決戦へ」→真大魔王バーン→帰還口→エンディング', async () => {
    await p.evaluate(() => {
      const S = TS.UI.S, G = TS.Game;
      S.village.story.chapter = 6; S.village.bag = [];
      G.depart(S, 777);
      S.run.player.hp = S.run.player.maxhp = 9999;
      while (S.run.floor < 35) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run, b = r.enemies.find((e) => e.boss);
      b.hp = 5; b.cds = { circle: 9, bird: 9, summon: 9 };
      r.player.x = b.x - 1; r.player.y = b.y; r.player.hp = 100; r.player.maxhp = 900;
      G.updateVision(r);
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-dungeon')); TS.UI.screen = 'dungeon';
    });
    await p.waitForTimeout(200);
    for (let i = 0; i < 20 && await p.evaluate(() => TS.UI.S.run.final.stage === 'battle1'); i++) { await p.tap('#dpad [data-dir="right"]'); await p.waitForTimeout(160); }
    await p.waitForTimeout(700);
    assert(await p.isVisible('.talk'), 'silence / transform talk');
    await closeTalk(); await p.waitForTimeout(150); await closeTalk();
    assert(await p.isVisible('.modal h2:has-text("最終決戦の準備")'), 'prep screen');
    await shot('19_final_prep');
    const prep = await p.evaluate(() => ({ hp: TS.UI.S.run.player.hp, max: TS.UI.S.run.player.maxhp, turn: TS.UI.S.run.turn, seen: TS.UI.S.run.final.cutsceneSeen }));
    assert(prep.hp === prep.max && prep.seen, 'healed once ' + JSON.stringify(prep));
    // 準備中に再読み込みしても、回復や演出は繰り返さず、準備画面に戻る
    await p.evaluate(() => { TS.UI.S.run.player.hp = 321; TS.UI.debug.save(); });
    await p.reload(); await p.waitForTimeout(400);
    await p.tap('#btn-continue'); await p.waitForTimeout(400);
    for (let i = 0; i < 10 && !(await p.$('.modal h2:has-text("最終決戦の準備")')); i++) await p.waitForTimeout(100);
    assert(await p.isVisible('.modal h2:has-text("最終決戦の準備")'), 'prep restored');
    assert(await p.evaluate(() => TS.UI.S.run.player.hp === 321 && TS.UI.S.run.final.stage === 'prep'), 'no second heal');
    // 「道具を確認」→ 閉じると準備画面に戻る（ターンは進まない）
    const t0 = await p.evaluate(() => TS.UI.S.run.turn);
    await p.tap('.modal-buttons button >> text=道具を確認'); await p.waitForTimeout(250);
    assert(await p.isVisible('.modal h2:has-text("道具")'), 'items from prep');
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(300);
    assert(await p.isVisible('.modal h2:has-text("最終決戦の準備")'), 'prep back after items');
    assert(await p.evaluate((t0) => TS.UI.S.run.turn === t0 && TS.UI.S.run.final.stage === 'prep', t0), 'no turn in prep');
    await p.tap('.modal-buttons button >> text=最終決戦へ'); await p.waitForTimeout(250);
    assert(await p.evaluate(() => TS.UI.S.run.final.stage === 'battle2' && TS.UI.S.run.enemies.some((e) => e.type === 'truevearn')), 'final battle');
    await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game, b = r.enemies.find((e) => e.boss); b.hp = 5; b.hold = 3; b.cds = { ring: 9, palm: 9, flame: 9 }; r.player.x = b.x - 1; r.player.y = b.y; r.player.hp = 900; G.updateVision(r); });
    await p.waitForTimeout(200);
    await shot('20_truevearn');
    for (let i = 0; i < 20 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.tap('#dpad [data-dir="right"]'); await p.waitForTimeout(160); }
    await p.waitForTimeout(700); await closeTalk();
    assert(await p.evaluate(() => TS.UI.S.run.final.stage === 'won' && !!TS.UI.S.run.portal), 'won, portal');
    const dir = await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game;
      for (const [d, [dx, dy]] of Object.entries(G.DIRS)) { const x = r.portal.x - dx, y = r.portal.y - dy;
        if (G.canStep(r.map, x, y, dx, dy) && !G.enemyAt(r, x, y) && !G.itemAt(r, x, y)) { r.player.x = x; r.player.y = y; G.updateVision(r); return d; } } });
    await p.tap(`#dpad [data-dir="${dir}"]`); await p.waitForTimeout(250);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(700);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(300);
    await closeTalk();
    assert(await p.isVisible('.modal h2:has-text("エンディング")'), 'ending');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(200);
    assert(await p.evaluate(() => TS.UI.S.village.story.endingDone && TS.UI.S.village.cleared && !TS.UI.S.run));
    await shot('20_village_cleared');
  });

  await test('謎の旅商人：長押しはとなりで止まり、押し直すと話しかける。見る・説明・やめるではターンが進まない。所持金不足・持ち物満杯・連打・売り切れ・再読み込み', async () => {
    const setup = await p.evaluate(() => {
      const UI = TS.UI, G = TS.Game;
      while (UI.modals.length) UI.modals[UI.modals.length - 1].close();
      let S = null;
      for (let s = 7700; s < 8200 && !S; s++) {
        const T = G.newState(); T.village.story.chapter = 3; G.depart(T, s);
        while (T.run.floor < 29 && !(T.run.merchant && T.run.floor >= 13)) { T.run.player.x = T.run.stairs.x; T.run.player.y = T.run.stairs.y; G.act(T, { type: 'descend' }); }
        if (T.run.merchant && T.run.floor >= 13) S = T;
      }
      UI.S = S; const r = S.run, m = r.merchant;
      r.enemies = []; r.player.hp = r.player.maxhp = 200;
      const room = TS.Dungeon.roomAt(r.map, m.x, m.y), sy = m.y === room.y ? 1 : -1;
      r.player.x = m.x; r.player.y = m.y + sy * 3; G.updateVision(r);
      r.runGold = 0; S.village.funds = 10;   // まずはお金が足りない
      TS.UI.debug.save();
      document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'screen-dungeon')); UI.screen = 'dungeon';
      return { dir: sy > 0 ? 'up' : 'down', m: { x: m.x, y: m.y }, sy, stock: m.stock.map((g) => ({ ...g })) };
    });
    const st = () => p.evaluate(() => { const r = TS.UI.S.run; return { turn: r.turn, x: r.player.x, y: r.player.y, gold: r.runGold, funds: TS.UI.S.village.funds, bag: r.bag.length, left: r.merchant.stock.map((g) => g.left), modal: !!document.querySelector('.modal') }; });
    // 長押し：商人のとなりで止まる（話しかけない）
    await p.dispatchEvent(`#dpad [data-dir="${setup.dir}"]`, 'pointerdown', { pointerId: 7 });
    await p.waitForTimeout(1200);
    await p.dispatchEvent(`#dpad [data-dir="${setup.dir}"]`, 'pointerup', { pointerId: 7 });
    let s0 = await st();
    assert(s0.y === setup.m.y + setup.sy && !s0.modal, 'stopped next to merchant ' + JSON.stringify(s0));
    // 押し直すと話しかける（ターンは進まない）
    await p.tap(`#dpad [data-dir="${setup.dir}"]`); await p.waitForTimeout(250);
    assert(await p.isVisible('.modal h2:has-text("謎の旅商人")'), 'merchant modal');
    await shot('31_merchant');
    const s1 = await st(); eq2(s1.turn, s0.turn, 'talk no turn');
    // お金が足りない：説明は読めるが「買う」は押せない
    await p.tap('.modal .row >> nth=0'); await p.waitForTimeout(200);
    assert(await p.isVisible('.warnbox:has-text("お金が足りません")'), 'no money msg');
    assert(await p.$eval('.modal-buttons button.primary', (b) => b.disabled), 'buy disabled');
    await p.tap('.modal-buttons button >> text=やめる'); await p.waitForTimeout(150);
    // お金を用意して、確定ボタンを連打 → 1個だけ買える
    await p.evaluate(() => { TS.UI.S.village.funds = 100000; });
    await p.tap('.modal .row >> nth=0'); await p.waitForTimeout(200);
    await shot('32_merchant_detail');
    await p.evaluate(() => { const b = [...document.querySelectorAll('.modal-buttons button.primary')].pop(); b.click(); b.click(); b.click(); });
    await p.waitForTimeout(250);
    const s2 = await st();
    eq2(s2.left[0], setup.stock[0].left - 1, 'bought exactly one'); eq2(s2.bag, s0.bag + 1, 'one item'); eq2(s2.turn, s0.turn, 'buy no turn');
    eq2(s2.funds, 100000 - setup.stock[0].price, 'paid once');
    // 再読み込みしても在庫・お金は買ったあとのまま
    await p.reload(); await p.waitForTimeout(500);
    await p.tap('#btn-continue'); await p.waitForTimeout(400); await closeTalk();
    const s3 = await st();
    eq2(JSON.stringify(s3.left), JSON.stringify(s2.left), 'stock after reload'); eq2(s3.funds, s2.funds); eq2(s3.bag, s2.bag);
    // 残りを買い切る → 売り切れ（話しかけ直しても復活しない）
    await p.tap(`#dpad [data-dir="${setup.dir}"]`); await p.waitForTimeout(250);
    for (let k = 0; k < 4 && await p.evaluate(() => TS.UI.S.run.merchant.stock[0].left > 0); k++) {
      await p.tap('.modal .row >> nth=0'); await p.waitForTimeout(150);
      await p.tap('.modal-buttons button.primary >> nth=-1'); await p.waitForTimeout(200);
    }
    assert(await p.$eval('.modal .row', (r) => r.classList.contains('disabled') && r.textContent.includes('売り切れ')), 'sold out row');
    await p.tap('.modal-buttons button >> text=立ち去る'); await p.waitForTimeout(150);
    await p.reload(); await p.waitForTimeout(500);
    await p.tap('#btn-continue'); await p.waitForTimeout(400); await closeTalk();
    eq2(await p.evaluate(() => TS.UI.S.run.merchant.stock[0].left), 0, 'not restocked by reload');
    // 持ち物がいっぱいなら買えない
    await p.evaluate(() => { const S = TS.UI.S; while (S.run.bag.length < 15) S.run.bag.push(TS.Game.makeItem(S, 'herb')); });
    await p.tap(`#dpad [data-dir="${setup.dir}"]`); await p.waitForTimeout(250);
    await p.tap('.modal .row >> nth=1'); await p.waitForTimeout(200);
    assert(await p.isVisible('.warnbox:has-text("持ち物がいっぱい")'), 'bag full msg');
    assert(await p.$eval('.modal-buttons button.primary', (b) => b.disabled), 'buy disabled when full');
    await p.tap('.modal-buttons button >> text=やめる'); await p.waitForTimeout(100);
    await p.tap('.modal-buttons button >> text=立ち去る'); await p.waitForTimeout(100);
    const s4 = await st(); eq2(s4.turn, s0.turn, 'whole visit took no turns');
  });

  await test('旧バージョン（v1）のセーブで「つづきから」：村・装備・探索途中を引き継いで再開', async () => {
    const v1 = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-midrun.json'), 'utf8');
    await p.evaluate((t) => localStorage.setItem('takeSaiAdventure.save', t), v1);
    await p.reload(); await p.waitForTimeout(400);
    await p.tap('#btn-continue'); await p.waitForTimeout(400);
    const st = await p.evaluate(() => ({ screen: TS.UI.screen, floor: TS.UI.S.run && TS.UI.S.run.floor, ver: TS.UI.S.version, funds: TS.UI.S.village.funds, storage: TS.UI.S.village.storage.length }));
    const raw = JSON.parse(v1);
    assert(st.screen === 'dungeon' && st.floor === 4 && st.ver === 3 && st.funds === raw.village.funds && st.storage === raw.village.storage.length, JSON.stringify(st));
    await p.tap('#b-wait'); await p.waitForTimeout(200);
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('takeSaiAdventure.save')).version);
    assert(saved === 3, 'saved as v3');
    await shot('24_migrated');
  });

  await test('はじめから（データ削除）は2回確認が出る', async () => {
    await p.reload(); await p.waitForTimeout(300);
    await p.tap('#btn-newgame'); await p.waitForTimeout(150);
    assert(await p.isVisible('text=すべて消えます'));
    await p.tap('.modal-buttons button >> text=やめる'); await p.waitForTimeout(100);
    assert(await p.evaluate(() => !!localStorage.getItem('takeSaiAdventure.save')), 'save kept');
  });

  await test('小さいスマホ（360×640）・横向きスマホ・PC画面でも崩れず、ボタンが画面内に収まる', async () => {
    for (const [name, opt] of [['small', { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
      ['landscape', { viewport: { width: 860, height: 400 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true }],
      ['pc', { viewport: { width: 1280, height: 800 } }]]) {
      const { ctx: c2, p: p2 } = await mk(opt);
      await p2.goto(URL); await p2.waitForTimeout(300);
      await p2.screenshot({ path: path.join(OUT, `21_${name}_title.png`) });
      await p2.click('#btn-newgame'); await p2.waitForTimeout(150);
      for (let i = 0; i < 24 && await p2.$('.modal'); i++) { await p2.click('.modal-buttons button >> nth=-1'); await p2.waitForTimeout(60); }
      await p2.screenshot({ path: path.join(OUT, `22_${name}_village.png`) });
      await p2.click('.fac.depart'); await p2.waitForTimeout(100);
      await p2.click('text=おにぎりを借りる'); await p2.waitForTimeout(100);
      await p2.click('text=出発する'); await p2.waitForTimeout(100);
      for (let i = 0; i < 4 && await p2.$('.modal'); i++) { await p2.click('.modal-buttons button.primary'); await p2.waitForTimeout(60); }
      await p2.keyboard.press('ArrowRight'); await p2.waitForTimeout(150);
      await p2.screenshot({ path: path.join(OUT, `23_${name}_dungeon.png`) });
      const m = await p2.evaluate(() => {
        const ids = ['dpad', 'actions', 'view', 'hud', 'b-wait', 'b-dash', 'b-items', 'b-menu', 'b-foot'];
        const out = { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight };
        for (const id of ids) { const r = document.getElementById(id).getBoundingClientRect(); out[id] = [r.left, r.top, r.right, r.bottom].map(Math.round); }
        return out;
      });
      assert(m.sw <= m.iw && m.sh <= m.ih, name + ' overflow ' + JSON.stringify(m));
      for (const id of ['b-wait', 'b-dash', 'b-items', 'b-menu', 'b-foot']) assert(m[id][3] <= m.ih + 1 && m[id][2] <= m.iw + 1 && m[id][3] - m[id][1] >= 36, name + ' button ' + id + JSON.stringify(m[id]));
      for (const id of ['dpad', 'actions', 'view']) assert(m[id][2] <= m.iw + 1 && m[id][3] <= m.ih + 1 && m[id][2] - m[id][0] > 50 && m[id][3] - m[id][1] > 50, name + ' ' + id + JSON.stringify(m));
      await c2.close();
    }
  });

  await test('戦闘の演出：1回の攻撃で戦闘処理は1回だけ・連打をため込まない・「演出：控えめ」・階の移動や裏に回したときに古い演出が残らない', async () => {
    await p.evaluate(() => {
      const UI = TS.UI, G = TS.Game, S = G.newState(); UI.S = S;
      while (UI.modals.length) UI.modals[UI.modals.length - 1].close();
      G.depart(S, 5150); const r = S.run;
      while (r.floor < 3) { r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const room = r.map.rooms.find((q) => q.w >= 4 && q.h >= 3);
      r.enemies = []; r.floorItems = []; r.player.x = room.x + 1; r.player.y = room.y + 1; r.player.hp = r.player.maxhp = 500;
      r.enemies.push({ id: 801, type: 'turtle', x: r.player.x + 1, y: r.player.y, hp: 9999, maxhp: 9999, atk: 1, def: 0, exp: 1, dir: 'left', sleep: 99 });
      G.updateVision(r); TS.Render.clearFx();
      document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'screen-dungeon')); UI.screen = 'dungeon'; UI.lockUntil = 0;
    });
    const st = () => p.evaluate(() => ({ turn: TS.UI.S.run.turn, hp: TS.UI.S.run.enemies[0].hp, patk: TS.Render.fx.filter((f) => f.t === 'patk').length, slash: TS.Render.fx.filter((f) => f.t === 'slash' || f.t === 'punch').length }));
    const a = await st();
    await p.tap('#dpad [data-dir="right"]'); await p.waitForTimeout(60);
    const b = await st();
    eq2(b.turn, a.turn + 1, 'one turn'); eq2(b.patk, 1, 'one attack motion'); assert(b.hp <= a.hp, 'hit or miss once');
    await shot('33_attack');
    // 演出中に5回連打しても、受け付けた分だけその場で処理され、あとからまとめて実行されない
    for (let i = 0; i < 5; i++) await p.tap('#dpad [data-dir="right"]');
    const c = await st(); await p.waitForTimeout(700); const d = await st();
    eq2(d.turn, c.turn, 'no queued actions after the animation'); assert(c.turn - b.turn <= 5, 'no extra actions');
    // 「演出：控えめ」：メニューから切り替え、画面の揺れを出さない
    await p.tap('#b-menu'); await p.waitForTimeout(150);
    await p.tap('.modal-buttons button >> text=演出：通常'); await p.waitForTimeout(150);
    assert(await p.evaluate(() => TS.UI.S.settings.fx === 'calm' && document.body.classList.contains('calm')), 'calm on');
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    eq2(await p.evaluate(() => { TS.FX.shake(TS.Render, 4, 300); return TS.Render.fx.filter((f) => f.t === 'shake').length; }), 0, 'no shake when calm');
    await p.tap('#b-menu'); await p.waitForTimeout(150);
    await p.tap('.modal-buttons button >> text=演出：控えめ'); await p.waitForTimeout(150);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    assert(await p.evaluate(() => TS.UI.S.settings.fx === 'normal' && !document.body.classList.contains('calm')), 'back to normal');
    // 階を移動すると古い演出は消える
    await p.evaluate(() => { TS.Render.addFx({ t: 'num', x: 1, y: 1, text: '9', dur: 5000 }); const r = TS.UI.S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; TS.UI.lockUntil = 0; TS.UI.doAct({ type: 'descend' }); });
    eq2(await p.evaluate(() => TS.Render.fx.filter((f) => f.t === 'num' && f.text === '9').length), 0, 'cleared on floor change');
    // 裏に回したら、入力を止めて演出を消す（戻ったときに古い演出がまとめて流れない）
    const hid = await p.evaluate(() => { TS.Render.addFx({ t: 'healrise', x: 1, y: 1, dur: 5000 }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); const n = TS.Render.fx.length; delete document.hidden; return n; });
    eq2(hid, 0, 'cleared when hidden');
  });

  await test('通常の敵の画像の差し替え：TS.ASSETS.enemies に書いた敵だけ画像に替わる（2コマを分ける）。書かない敵は今の絵のまま', async () => {
    const r = await p.evaluate(() => new Promise((done) => {
      const SP = TS.Sprites, keep = SP.s.enemy.frog, keepT = SP.s.enemy.turtle;
      const c = document.createElement('canvas'); c.width = 128; c.height = 64;
      const g = c.getContext('2d'); g.fillStyle = '#3a8a3a'; g.fillRect(20, 30, 24, 30); g.fillStyle = '#8ad04a'; g.fillRect(84, 28, 24, 32);
      TS.ASSETS.enemies = { frog: c.toDataURL() };
      SP.loadArt(() => {
        const f = SP.s.enemy.frog, out = { art: !!f[0].art, w: f[0].width, two: f[0] !== f[1], turtleSame: SP.s.enemy.turtle === keepT };
        TS.ASSETS.enemies = {}; SP.art.enemies = {}; SP.s.enemy.frog = keep;
        done(out);
      });
    }));
    assert(r.art && r.w === 64 && r.two && r.turtleSame, JSON.stringify(r));
  });

  await test('すべての地域の地形と部屋の見せ場（レンガの遺跡・水晶の地下神殿・封印の最深部ほか）がエラーなく描ける', async () => {
    const bad = await p.evaluate(() => {
      const out = [], G = TS.Game, RD = TS.Render, UI = TS.UI, keep = UI.S, keepScreen = UI.screen;
      const themes = ['brick', 'roots', 'water', 'orb', 'garden', 'sunken', 'crystal', 'gold', 'shrine', 'demon', 'throne', 'arena_croc', 'arena_flame', 'arena_kill', 'arena_baran', 'arena_mist'];
      const feats = ['plain', 'pillars', 'mural', 'statue', 'mosaic', 'overgrown', 'crystals', 'goldtrim', 'inlay', 'braziers', 'seal'];
      const S = G.newState(); G.depart(S, 4242);
      const run = S.run, c = document.createElement('canvas'); c.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:200px;opacity:0';
      document.body.appendChild(c); UI.screen = 'none';
      for (let i = 0; i < run.explored.length; i++) run.explored[i] = 1;
      const F = G.F;
      for (const th of themes) for (const f of feats) {
        for (const rm of run.map.rooms) Object.defineProperty(rm, 'feat', { value: f, configurable: true, writable: true });
        run.seed = (run.seed + 1) >>> 0;
        G.F = () => ({ theme: th });
        try { for (let k = 0; k < 20; k++) RD.drawDungeon(c, S, performance.now() + k); } catch (e) { out.push(th + '/' + f + ': ' + e.message); }
      }
      G.F = F; c.remove(); UI.S = keep; UI.screen = keepScreen;
      return out;
    });
    assert(!bad.length, bad.slice(0, 5).join(' / '));
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
