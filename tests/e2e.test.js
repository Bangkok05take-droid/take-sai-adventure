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
    // 登場ムービー（mp4）は、このテストの Chromium が H.264 を再生できないので読み込みが止められる（実際のスマホは再生できる）。場所が正しいことは別に確かめる
    p.on('requestfailed', (r) => { if (!/assets\/movies\/.*\.mp4$/.test(r.url())) errors.push('request failed ' + r.url()); });
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

  await test('追加の道具の絵31種（assets/items-v2・assets/accessories・assets/items-boss。ボスの報酬の装備・お宝9種は128／床64）が読み込まれ、一覧・床の表示で使われる', async () => {
    await p.waitForFunction(() => TS.Sprites.art.ready, null, { timeout: 5000 });
    const r = await p.evaluate(() => {
      const SP = TS.Sprites, D = TS.Data, ids = Object.keys(TS.ASSETS.items.byId);
      return { n: ids.length, bad: ids.filter((id) => { const e = SP.art.itemsById[id] || {};
        const boss = /^assets\/items-boss\//.test(TS.ASSETS.items.byId[id]), lw = boss ? 128 : 48, fw = boss ? 64 : 32;
        return !D.ITEMS[id] || !e.list || e.list.width !== lw || !e.floor || e.floor.width !== fw || SP.iconFor(D.ITEMS[id]) !== e.floor || !/^data:image\/png/.test(SP.iconURL(D.ITEMS[id])); }) };
    });
    eq2(r.n, 31, 'count'); eq2(r.bad.join(), '', 'not loaded or not used');
    // 床のお金（G）：32px用・48px用の金貨の絵（お宝の古金貨とは別）。描く大きさに合うほうを使う
    const gold = await p.evaluate(() => { const SP = TS.Sprites; return { w32: SP.art.gold[32] && SP.art.gold[32].width, w48: SP.art.gold[48] && SP.art.gold[48].width,
      small: SP.goldIcon(22) === SP.art.gold[32], big: SP.goldIcon(44) === SP.art.gold[48], notCoin: SP.goldIcon(44) !== SP.iconFor(TS.Data.ITEMS.old_coin) }; });
    assert(gold.w32 === 32 && gold.w48 === 48 && gold.small && gold.big && gold.notCoin, 'gold pickup art ' + JSON.stringify(gold));
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
    // タップする範囲のうち画面に見えている部分の中（端の人物は半分画面の外のことがある）
    const hitPt = (id, kind) => `(() => { const h = TS.UI.vview.hits.find((h) => h.id === '${id}' && h.kind === '${kind}'); const r = document.getElementById('village-canvas').getBoundingClientRect();
      const x0 = Math.max(0, h.x), x1 = Math.min(r.width, h.x + h.w); return { x: r.left + (x0 + x1) / 2, y: r.top + h.y + h.h - 6 }; })()`;
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
    // サイ（新しい店の入口の前）が画面の外なら、店の建物をタップする（同じく店の前まで歩いて開く）
    const saiVisible = await p.evaluate(() => { const h = TS.UI.vview.hits.find((h) => h.id === 'shop' && h.kind === 'npc'); return h.x + h.w > 8; });
    await tapAt(saiVisible ? hitPt('shop', 'npc') : hitPt('shop', 'fac'));
    for (let i = 0; i < 60 && !(await p.$('.modal')); i++) await p.waitForTimeout(80);
    assert(await p.isVisible('.modal h2:has-text("サイの店")'), 'shop by walking ' + await p.evaluate(() => JSON.stringify([TS.UI.walker.x, TS.UI.walker.y, document.querySelector('#modal-root') && document.querySelector('#modal-root').textContent.slice(0, 80)])));
    // 店の入口（2026年10月の店の絵：左の入口の前）に立って上を向く
    assert(await p.evaluate(() => { const f = TS.UI.vview.fac.find((f) => f.id === 'shop'); return TS.UI.walker.x === f.at[0] && TS.UI.walker.y === f.at[1] && TS.UI.walker.dir === 'up'; }), 'stands at shop');
    await shot('03b_village_walk_shop');
    await p.tap('.modal-buttons button:last-child'); await p.waitForTimeout(150);
    // マスターヤナイの像：建てる前は広場に無い（話しかけられない・当たりも無い）。村の発展で建てると現れて話しかけられる
    assert(await p.evaluate(() => !TS.UI.vview.hits.some((h) => h.kind === 'statue') && !TS.UI.vview.solid[11 * TS.Village.MW + 9]), 'no statue before building');
    await p.evaluate(() => { const V = TS.UI.S.village; V.built.yanai_statue = true; TS.Game.applyFacilities(V); });
    for (let i = 0; i < 20 && !(await p.evaluate(() => TS.UI.vview.hits.some((h) => h.kind === 'statue'))); i++) await p.waitForTimeout(80);
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

  await test('村の子供3人・猫3匹（サイの店〜ヤナイ像の広場）：素材の絵・大きさ・話す／調べる・通り道と施設をふさがない・出入りで増えない', async () => {
    // 素材の絵が読み込まれ、大きさは「大人 > 子供 > 猫」
    const art = await p.evaluate(() => {
      const VA = TS.ASSETS.village, A = TS.Sprites.art.village, h = (cv) => { if (!cv) return 0; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let t = -1, b = -1; for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3]) { if (t < 0) t = y; b = y; } return b - t + 1; };
      const missing = []; for (const n of Object.keys(VA.props)) if (!A[n]) missing.push(n);
      for (const v of Object.values(VA.kids)) for (const f of ['front', 'right', 'left', 'back']) if (!A[v + '_' + f]) missing.push(v + '_' + f);
      for (const v of Object.values(VA.cats)) for (const f of ['sit', 'right', 'left', 'sleep']) if (!A[v + '_' + f]) missing.push(v + '_' + f);
      return { missing, adult: h(TS.Sprites.art.chars.sai.front), kid: Math.max(...Object.values(VA.kids).map((v) => h(A[v + '_front']))), cat: Math.max(...Object.values(VA.cats).map((v) => h(A[v + '_sit']))) };
    });
    eq2(art.missing.join(), '', 'village art loaded');
    assert(art.kid >= art.adult * 0.65 && art.kid <= art.adult * 0.8 && art.cat < art.kid * 0.75, 'sizes ' + JSON.stringify(art));
    // 決まった3人・3匹が1回ずつ。村を出入り・作り直しても増えない
    const count = () => p.evaluate(() => { const v = TS.UI.vview.hits; return { kid: v.filter((h) => h.kind === 'kid').length, cat: v.filter((h) => h.kind === 'cat').length, ids: v.filter((h) => h.kind === 'kid' || h.kind === 'cat').map((h) => h.id).sort().join() }; });
    const c0 = await count();
    eq2(c0.kid, 3, 'kids'); eq2(c0.cat, 3, 'cats'); eq2(c0.ids, 'black,book,calico,cat,ginger,play', 'ids');
    // すべての施設の入口・像の前へ、スタート地点から歩いて行ける。通り道（店の前・広場の横の道）は2マス以上
    const reach = await p.evaluate(() => {
      const VL = TS.Village, v = TS.UI.vview, bad = [];
      for (const f of v.fac) if (!VL.path(v.solid, VL.START.x, VL.START.y, f.at[0], f.at[1]) && !(f.at[0] === VL.START.x && f.at[1] === VL.START.y)) bad.push(f.id);
      for (const [x, y] of [[9, 13], [10, 13]]) if (!VL.path(v.solid, VL.START.x, VL.START.y, x, y)) bad.push('statue ' + x);
      const narrow = [];
      for (let x = 1; x <= 18; x++) { let n = 0; for (let y = 14; y <= 16; y++) if (!v.solid[y * VL.MW + x]) n++; if (n < 2) narrow.push(x); }
      // 子供・猫は施設の入口・人の立つマスにいない
      const on = []; for (const c of VL.KIDS.concat(VL.CATS)) for (const f of v.fac) if (f.at[0] === c.x && f.at[1] === c.y) on.push(c.id + '@' + f.id);
      return { bad, narrow, on };
    });
    eq2(reach.bad.join(), '', 'unreachable'); eq2(reach.narrow.join(), '', 'path narrower than 2 tiles at x'); eq2(reach.on.join(), '', 'creature on an entrance');
    // 村のいろいろな状態（はじめ・発展後・旧版の記念碑・庭）でも、すべての施設の入口と像の前へ行け、広場の上下をつなぐ通路（x13〜14）は2マス
    const states = await p.evaluate(() => {
      const VL = TS.Village, RD = TS.Render, out = [];
      const fns = { early: () => {}, dev: (V) => { V.story.chapter = 4; V.stage = 3; for (const f of TS.Data.FACILITIES) V.built[f.id] = true; TS.Game.applyFacilities(V); },
        legacy: (V) => { V.legacyClear10 = true; V.legacyClear30 = true; V.built.garden = true; TS.Game.applyFacilities(V); } };
      for (const [name, fn] of Object.entries(fns)) {
        const S = TS.Game.newState(); fn(S.village);
        const v = VL.build(RD.villageLevels(S.village));
        for (const f of v.fac) if (!(f.at[0] === VL.START.x && f.at[1] === VL.START.y) && !VL.path(v.solid, VL.START.x, VL.START.y, f.at[0], f.at[1])) out.push(name + ':' + f.id);
        for (const y of [11, 12, 13]) if ([13, 14].some((x) => v.solid[y * VL.MW + x])) out.push(name + ':passage' + y);
      }
      return out;
    });
    eq2(states.join(), '', 'reachable in all village states');
    // 港（2026年10月）：桟橋の板 (10,22)・(10,23) だけ歩ける。欄干・水・桟橋の先は入れない。岸の道（20行）はどこも通れる。出発は桟橋の先で舟を向いて
    const harbor = await p.evaluate(() => { const v = TS.UI.vview, VL = TS.Village, s = (x, y) => !v.solid[y * VL.MW + x], f = v.fac.find((f) => f.id === 'depart');
      return { ok: s(10, 22) && s(10, 23) && s(10, 21) && ![[9, 22], [11, 22], [9, 23], [11, 23], [10, 24], [12, 23]].some(([x, y]) => s(x, y)) && [...Array(20).keys()].every((x) => s(x, 20)),
        at: f.at.join(), face: f.face, art: !!(TS.Sprites.art.village.pier && TS.Sprites.art.village.boat && TS.Sprites.art.village.quay) }; });
    assert(harbor.ok && harbor.at === '10,23' && harbor.face === 'right' && harbor.art, 'harbor ' + JSON.stringify(harbor));
    // 街の床（2026年10月）：4種類の模様が読み込まれている（128×128＝4×4マス分）
    eq2(await p.evaluate(() => ['sandstone', 'brick', 'grass', 'earth'].map((n) => (TS.Sprites.art.ground[n] || {}).width).join()), '128,128,128,128', 'ground textures');
    const tapAt = async (pt) => { await p.touchscreen.tap(pt.x, pt.y); };
    const hitPt = (id, kind) => p.evaluate(([id, kind]) => { const h = TS.UI.vview.hits.find((h) => h.id === id && h.kind === kind); const r = document.getElementById('village-canvas').getBoundingClientRect();
      const x0 = Math.max(0, h.x), x1 = Math.min(r.width, h.x + h.w), y0 = Math.max(0, h.y), y1 = Math.min(r.height, h.y + h.h); return { x: r.left + (x0 + x1) / 2, y: r.top + (y0 + y1) / 2, h: [h.x, h.y, h.w, h.h] }; }, [id, kind]);
    const talkText = async (label) => { for (let i = 0; i < 80 && !(await p.$('.talk')); i++) await p.waitForTimeout(80);
      const t = await p.evaluate(() => { const e = document.querySelector('.talk .txt'); return e ? e.textContent : null; });
      assert(t !== null, label + ' did not talk: ' + await p.evaluate(() => JSON.stringify({ w: [TS.UI.walker.x, TS.UI.walker.y], modal: document.querySelector('#modal-root').textContent.slice(0, 60) })));
      return t; };
    const before = await p.evaluate(() => ({ funds: TS.UI.S.village.funds, run: !!TS.UI.S.run }));
    // 子供に話しかける（となりまで歩いて、短い会話）
    const lines = { play: 'きょうも冒険', book: '遺跡の本', cat: 'サイちゃんが大好き' };
    for (const id of ['cat', 'book', 'play']) {
      // 子供はこもれびの家（村の発展）のまわり（2026年10月）。家の前の道（21行）まで来てから話しかける（カメラはたけを追う）
      await p.evaluate((id) => { const c = TS.Village.KIDS.find((c) => c.id === id), w = TS.UI.walker; w.x = c.x; w.y = 21; w.path = []; w.moving = false; }, id);
      await p.waitForTimeout(200);
      const pt = await hitPt(id, 'kid'); await tapAt(pt);
      const t = await talkText('kid ' + id + ' ' + JSON.stringify(pt));
      assert(t.includes(lines[id]), id + ': ' + t);
      if (id === 'book') await shot('04b_village_kid_talk');
      await closeTalk();
    }
    // 猫を調べる（短い反応）
    const meow = { ginger: 'すりすり', calico: 'すうすう', black: 'しっぽ' };
    for (const id of ['ginger', 'calico', 'black']) {
      // 猫の近く（2マス下の道）まで来てから調べる（カメラはたけを追うので、遠い猫は画面の外）
      await p.evaluate((id) => { const c = TS.Village.CATS.find((c) => c.id === id), w = TS.UI.walker; w.x = c.x; w.y = 16; w.path = []; w.moving = false; }, id);
      await p.waitForTimeout(200);
      const pt = await hitPt(id, 'cat'); await tapAt(pt);
      const t = await talkText('cat ' + id + ' ' + JSON.stringify(pt));
      assert(t.includes(meow[id]), id + ': ' + t);
      await closeTalk();
    }
    // 会話・調べるでお金・探索は変わらない
    const after = await p.evaluate(() => ({ funds: TS.UI.S.village.funds, run: !!TS.UI.S.run }));
    eq2(JSON.stringify(after), JSON.stringify(before), 'no side effects');
    // サイ（店）は子供・猫がいても今までどおり開ける
    await tapAt(await hitPt('shop', 'npc'));
    for (let i = 0; i < 60 && !(await p.isVisible('.modal h2:has-text("サイの店")')); i++) await p.waitForTimeout(80);
    assert(await p.isVisible('.modal h2:has-text("サイの店")'), 'shop opens');
    await p.tap('.modal-buttons button:last-child'); await p.waitForTimeout(150);
    // 村の作り直し（施設の変化）・画面の出入りでも増えない
    await p.evaluate(() => { TS.UI.S.village.decor.stalls = true; });
    await p.waitForTimeout(200);
    await p.evaluate(() => { TS.UI.S.village.decor.stalls = false; });
    await p.waitForTimeout(200);
    const c1 = await count();
    eq2(JSON.stringify(c1), JSON.stringify(c0), 'no duplicates after rebuild');
  });

  await test('タイトルのファンファーレ（自動再生できないスマホ）：案内を表示→背景のタップで1回だけ再生。はじめから・つづきからは1タップで進み、曲が重ならない。音オフは勝手にオンにしない', async () => {
    const strict = await chromium.launch({ args: ['--autoplay-policy=document-user-activation-required'] });
    try {
      const open = async (save) => {
        const c = await strict.newContext(phone), q = await c.newPage();
        q.on('pageerror', (e) => errors.push(e.message));
        await q.addInitScript(() => { window.__plays = []; const iv = setInterval(() => { if (window.TS && TS.Music && !TS.Music.__w) { const o = TS.Music.play; TS.Music.play = function (id) { window.__plays.push(id); return o.apply(this, arguments); }; TS.Music.__w = 1; clearInterval(iv); } }, 2); });
        await q.goto(URL);
        if (save) { await q.evaluate((sv) => { const S = TS.Game.newState(); S.village.story.introDone = true; S.village.seenIntro = true; Object.assign(S.settings, sv); TS.Save.save(S); }, save); await q.reload(); }
        await q.waitForTimeout(700);
        return { c, q };
      };
      const st = (q) => q.evaluate(() => ({ ctx: TS.Audio.ctx && TS.Audio.ctx.state, cur: TS.Music.current && TS.Music.current.id, screen: TS.UI.screen, hint: !document.getElementById('title-sound-hint').hidden, plays: window.__plays.slice(), sound: TS.UI.S.settings.sound }));
      const tapBg = async (q) => { const r = await q.evaluate(() => { const b = document.getElementById('title-scene').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height * 0.3 }; }); await q.touchscreen.tap(r.x, r.y); await q.waitForTimeout(600); };
      // 初回表示：自動再生は止められる → 案内 → 背景（ロゴの下）をタップで1回だけ
      let { c, q } = await open();
      let s = await st(q);
      assert(s.ctx === 'suspended' && s.hint && !s.plays.length, 'blocked + hint ' + JSON.stringify(s));
      await tapBg(q); s = await st(q);
      assert(s.cur === 'fanfare' && !s.hint && s.plays.filter((x) => x === 'fanfare').length === 1, 'fanfare after tap ' + JSON.stringify(s));
      await tapBg(q); s = await st(q); eq2(s.plays.filter((x) => x === 'fanfare').length, 1, 'only once');
      await q.tap('#btn-newgame'); await q.waitForTimeout(500); s = await st(q);
      assert(s.screen === 'village' && s.cur === 'yanai', 'newgame goes on, one song ' + JSON.stringify(s));
      await c.close();
      // 最初のタップが「つづきから」：待たせずに村へ、ファンファーレは始めない。保存したBGM音量
      ({ c, q } = await open({ sound: true, bgmVol: 0.4 }));
      await q.tap('#btn-continue'); await q.waitForTimeout(700); s = await st(q);
      assert(s.screen === 'village' && !s.plays.includes('fanfare') && s.cur === 'village' && s.plays.length === 1, 'continue first ' + JSON.stringify(s));
      assert(await q.evaluate(() => Math.abs(TS.Audio.musicBus.gain.value - 0.4) < 0.02), 'saved bgm volume');
      await c.close();
      // 音オフで保存：案内なし・鳴らない・オンにならない。オンに切り替えるとファンファーレ1回
      ({ c, q } = await open({ sound: false }));
      s = await st(q); assert(!s.hint && !s.sound, 'sound off: no hint');
      await tapBg(q); s = await st(q); assert(!s.sound && !s.plays.length, 'sound stays off ' + JSON.stringify(s));
      await q.tap('#btn-sound-title'); await q.waitForTimeout(600); s = await st(q);
      assert(s.sound && s.cur === 'fanfare' && !s.hint, 'sound on plays fanfare ' + JSON.stringify(s));
      await c.close();
    } finally { await strict.close(); }
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
    // 帰還の巻物は自動では配らない。借りると「受取済み」（押せない）
    const sc0 = await p.evaluate(() => TS.UI.S.village.bag.filter((i) => i.id === 'return_scroll').length);
    await p.tap('.depart-modal .modal-buttons button:has-text("帰還の巻物")'); await p.waitForTimeout(250);
    const sc1 = await p.evaluate(() => ({ n: TS.UI.S.village.bag.filter((i) => i.id === 'return_scroll').length, dis: [...document.querySelectorAll('.depart-modal .modal-buttons button')].find((b) => b.textContent.includes('受取済み')).disabled }));
    assert(sc0 === 0 && sc1.n === 1 && sc1.dis, 'scroll borrowed once ' + JSON.stringify(sc1));
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
      for (let i = 0; i < 10; i++) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true })); }
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
      // 真上の壁に出入口がない列を選ぶ（ダンジョンの形は毎回ちがうので、通路へ抜けて壁に届かないことがないように）
      let x = room.x + 1; for (let c = room.x; c < room.x + room.w; c++) if (!TS.Dungeon.passable(r.map, c, room.y - 1)) { x = c; break; }
      r.player.x = x; r.player.y = room.y + 2; TS.Game.updateVision(r); });
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
    const missing = await p.evaluate(() => Object.entries(TS.Data.ITEMS).filter(([id, d]) => !['weapon', 'shield', 'accessory', 'staff', 'return', 'treasure', 'material', 'orb', 'charm'].includes(d.type) && !TS.UI.USE_LABEL[d.type]).map(([id]) => id));
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
    await p.evaluate(() => { TS.UI.S.village.funds += 5000; TS.UI.S.village.bestFloor = 12; });
    await p.tap('.fac[data-fac="develop"]'); await p.waitForTimeout(150);
    assert(await p.isVisible('.stage[data-id="storage2"]:has-text("200G")'), 'price shown');
    assert(await p.isVisible('.stage[data-id="museum"]:has-text("🔒")'), 'condition shown');
    assert(!(await p.$('.stage[data-id="smith2"]')) && !(await p.$('.stage[data-id="storage3"]')), 'only the next stage of an upgrade chain');
    await shot('14a_develop');
    const build = async (id) => {
      await p.waitForTimeout(400);
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
    // 完成した施設は一覧から消え、次の段階が出る（効果は残る）
    await p.tap('.fac[data-fac="develop"]'); await p.waitForTimeout(150);
    assert(!(await p.$('.stage[data-id="storage2"]')) && !(await p.$('.stage[data-id="smith1"]')) && await p.$('.stage[data-id="storage3"]') && await p.$('.stage[data-id="smith2"]'), 'built hidden, next stage shown');
    await shot('14b_develop_after');
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(150);
    assert(await p.evaluate(() => TS.UI.S.village.smithLv === 1 && TS.Game.hasFacility(TS.UI.S.village, 'storage2')), 'effects kept');
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
    await p.tap('.depart-modal .modal-buttons button:has-text("帰還の巻物")'); await p.waitForTimeout(200); await p.click('text=出発する'); await p.waitForTimeout(150);
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
    assert(!(await p.$('.depart-modal .modal-buttons button:has-text("おにぎり")')), 'no rice loan button on the depart screen');
    await p.tap('.depart-modal .modal-buttons button:has-text("帰還の巻物")'); await p.waitForTimeout(200); await p.click('text=出発する'); await p.waitForTimeout(150);
    await closeTalk();
    assert(await p.isVisible('#screen-dungeon'), 'retried');
    assert(await p.evaluate(() => !TS.UI.S.run.bag.some((i) => i.id === 'wood_sword') && !TS.UI.S.run.bag.some((i) => i.eq && TS.Game.def(i).type === 'weapon')), 'retry without sword');
  });

  await test('第1章：15階のクロコダインに登場の表示と会話。倒すと報酬と帰還口。帰ると章クリアの会話と第2章の表示', async () => {
    await p.evaluate(() => {
      const S = TS.UI.S, G = TS.Game;
      S.run.player.hp = S.run.player.maxhp = 9999;
      if (G.maxFloor(S.run) !== 15) throw new Error('chapter 1 boss floor ' + G.maxFloor(S.run));
      while (S.run.floor < G.maxFloor(S.run) - 1) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; r.enemies = [];
    });
    await p.tap('#b-foot'); await p.waitForTimeout(200);       // 階段の確認
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(900);
    // 着いただけでは戦いは始まらない（会話なし・HPバーなし・探索の曲・ボスは部屋の中央で待つ）
    const arrive = await p.evaluate(() => { const r = TS.UI.S.run, b = r.enemies.find((e) => e.boss), A = r.bossFight;
      return { talk: !!document.querySelector('.talk'), engaged: A.engaged, center: Math.max(Math.abs(b.x - (A.x + (A.w >> 1))), Math.abs(b.y - (A.y + (A.h >> 1)))), song: TS.Music.current && TS.Music.current.id, bgm: TS.Audio.bgmName }; });
    assert(!arrive.talk && !arrive.engaged && arrive.center <= 1 && arrive.bgm === 'dungeon', 'waiting on arrival ' + JSON.stringify(arrive));
    // 入口の手前（通路）からダッシュで入る：部屋に入った所でダッシュが止まり、戦闘開始の表示・会話・ボス戦の曲・HPバー
    await p.evaluate(() => { const r = TS.UI.S.run, A = r.bossFight; let y = A.y; while (!TS.Dungeon.passable(r.map, A.x - 1, y)) y++; r.player.x = A.x - 3; r.player.y = y; TS.Game.updateVision(r); });
    await shot('17a_boss_waiting');
    const before = await p.evaluate(() => TS.UI.S.run.player.x);
    await p.tap('#b-dash'); await p.waitForTimeout(100);
    // ボスが見えた所でダッシュは一度止まる（以前からの決まり）。押し直して進む
    // 部屋に入ると、まずクロコダインの登場ムービー（2026年10月）。ムービー中は戦いが始まらず、スキップすると一度だけ戦闘開始
    for (let k = 0; k < 6 && !(await p.$('.movie')) && !(await p.$('.talk')); k++) { await p.tap('#dpad [data-dir="right"]'); for (let i = 0; i < 12 && !(await p.$('.movie')); i++) await p.waitForTimeout(80); }
    const mv = await p.evaluate(() => { const r = TS.UI.S.run; return { movie: !!document.querySelector('.movie'), intro: r.bossFight.intro, engaged: r.bossFight.engaged, inRoom: TS.Game.inArena(r, r.player.x, r.player.y), hold: TS.Audio.bgmHold }; });
    assert(mv.movie && mv.intro === 'pending' && !mv.engaged && mv.inRoom && mv.hold, 'crocodine intro movie on entering the room ' + JSON.stringify(mv));
    await shot('17m_boss_movie');
    // このテストの Chromium は H.264 を再生できないので、ムービーは約1.2秒で「読み込めませんでした」から自動で戦いへ進む。まだ出ていればスキップ
    await p.tap('.movie-skip', { timeout: 1000 }).catch(() => {}); await p.waitForTimeout(100);
    assert(await p.evaluate(() => !document.querySelector('.movie')), 'movie closed');
    for (let i = 0; i < 30 && !(await p.$('.talk')); i++) await p.waitForTimeout(80);
    assert(await p.isVisible('.talk'), 'boss intro talk on entering the room ' + await p.evaluate(() => { const r = TS.UI.S.run; return JSON.stringify({ p: [r.player.x, r.player.y], A: r.bossFight, dash: document.getElementById('b-dash').getAttribute('aria-pressed'), modal: document.querySelector('#modal-root').textContent.slice(0, 80), log: r.log ? r.log.slice(-3) : null }); }));
    assert(await p.isVisible('.who:has-text("クロコダイン")'), 'boss speaks');
    const ent = await p.evaluate(() => { const r = TS.UI.S.run; return { x: r.player.x, inRoom: TS.Game.inArena(r, r.player.x, r.player.y), engaged: r.bossFight.engaged, bgm: TS.Audio.bgmName, song: TS.Music.current && TS.Music.current.id }; });
    assert(ent.inRoom && ent.engaged && ent.x === (await p.evaluate(() => TS.UI.S.run.bossFight.x)) && ent.bgm === 'boss', 'dash stopped at the first room tile, boss music ' + JSON.stringify(ent) + ' from ' + before);
    await closeTalk();
    await p.evaluate(() => { const b = document.getElementById('b-dash'); if (TS.UI.S.settings.dash || (b && /オン/.test(b.textContent))) b.click(); });
    await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game, b = r.enemies.find((e) => e.boss); b.hp = 5; b.cds = { rush: 9, axe: 9 }; r.player.x = b.x - 1; r.player.y = b.y; r.player.hp = r.player.maxhp = 900; G.updateVision(r); });
    await p.waitForTimeout(200);
    await shot('17_boss');
    assert(await p.evaluate(() => TS.Sprites.s.enemy.croc[0].art === true && TS.Sprites.s.enemy.croc[0].width === 96), 'boss drawn from the reference art');
    for (let i = 0; i < 20 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.tap('#dpad [data-dir="right"]'); await p.waitForTimeout(160); }
    assert(await p.evaluate(() => TS.Render.fx.some((f) => f.t === 'bossdie' && f.sprite === 'croc')), 'boss defeat effect');
    await p.waitForTimeout(300); await shot('17b_boss_defeat');
    await p.waitForTimeout(400); await closeTalk();
    assert(await p.evaluate(() => !!TS.UI.S.run.portal && TS.UI.S.village.story.defeated.croc), 'portal opened');
    assert(await p.evaluate(() => TS.UI.S.run.floorItems.some((f) => f.item && f.item.id === 'croc_tear')), 'reward on floor');
    assert(await p.evaluate(() => !!TS.Sprites.chestIcon(32) && !!TS.Sprites.chestIcon(48)), 'treasure chest art loaded');
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
    // 拾わずに帰ったボスの報酬（涙と斧）は倉庫へ届き、章クリアのあとに一度だけ知らせる（絵つき）
    for (let i = 0; i < 20 && !(await p.$('.reward')); i++) await p.waitForTimeout(80);
    const nt = await p.evaluate(() => ({ txt: document.querySelector('#modal-root').textContent, ids: [...document.querySelectorAll('.reward')].map((r) => r.dataset.id).sort(),
      st: TS.UI.S.village.storage.map((i) => i.id), notice: TS.UI.S.village.rewardNotice }));
    assert(nt.txt.includes('倉庫に届けました') && nt.ids.join() === 'croc_axe,croc_tear' && nt.st.includes('croc_axe') && nt.st.includes('croc_tear') && !nt.notice, 'rewards to storage ' + JSON.stringify(nt));
    await shot('18b_rewards_to_storage');
    await p.tap('.modal-buttons button'); await p.waitForTimeout(200);
    assert(await p.evaluate(() => !TS.UI.modals.length), 'notice closed');
  });

  await test('最終章（版3）：30階で大魔王バーン→会話→連れ去る場面（動画が無いので仮の会話）→ティウの救援（荷物の交換・再読み込み）→31〜34階→35階で体が戻る場面→祈りで全回復→真大魔王バーン→帰還口→エンディング', async () => {
    await p.evaluate(() => {
      const S = TS.UI.S, G = TS.Game;
      S.village.story.chapter = 6; S.village.bag = [];
      S.village.storage = [G.makeItem(S, 'herb'), G.makeItem(S, 'banana')];
      G.takeReturnScroll(S); G.depart(S, 777);
      S.run.player.hp = S.run.player.maxhp = 9999;
      while (S.run.floor < 30) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run, b = r.enemies.find((e) => e.boss);
      b.hp = 5; b.cds = { circle: 9, bird: 9, summon: 9 };
      r.player.x = b.x - 1; r.player.y = b.y; r.player.hp = 600; r.player.maxhp = 900; r.player.hunger = 20;
      G.updateVision(r);
      G.checkBossRoom(S, []); b.hold = 0;
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-dungeon')); TS.UI.screen = 'dungeon';
    });
    eq2(await p.evaluate(() => TS.UI.S.run.enemies.find((e) => e.boss).type), 'vearn', '30F boss');
    for (let i = 0; i < 20 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.tap('#dpad [data-dir="right"]'); await p.waitForTimeout(160); }
    await p.waitForTimeout(700);
    // 撃破の会話 → 連れ去る場面（仮の会話） → ティウの会話 → 救援の画面
    for (let i = 0; i < 6 && !(await p.$('.modal h2:has-text("ティウの救援")')); i++) { await closeTalk(); await p.waitForTimeout(400); }
    assert(await p.isVisible('.modal h2:has-text("ティウの救援")'), 'rescue screen');
    const a0 = await p.evaluate(() => { const S = TS.UI.S, r = S.run; return { robe: r.bag.concat(r.floorItems.map((f) => f.item).filter(Boolean)).some((i) => i.id === 'demon_robe'),
      portal: !!r.portal, stairs: !!r.stairs, rescue: r.final.rescue, seen: !!S.village.story.moviesSeen.vearnTaken, bag: r.bag.length, st: S.village.storage.length }; });
    assert(a0.robe && !a0.portal && a0.stairs && a0.rescue === 'pending' && a0.seen, 'after vearn ' + JSON.stringify(a0));
    await shot('19_rescue');
    // 救援の回復：HPと満腹度が今の最大まで（1回だけ）
    const hv = await p.evaluate(() => { const r = TS.UI.S.run; return { hp: r.player.hp, max: r.player.maxhp, hunger: r.player.hunger, maxHunger: TS.Data.PLAYER.maxHunger, healed: r.final.rescueHealed }; });
    assert(hv.hp === hv.max && hv.hunger === hv.maxHunger && hv.healed, 'rescue heal ' + JSON.stringify(hv));
    // 倉庫のやくそうを取り出し、持ち物の1個を預ける（まだ動かない：仮の交換予定）
    const pick = await p.evaluate(() => { const S = TS.UI.S; const h = S.village.storage.find((i) => i.id === 'herb'); const o = S.run.bag.find((i) => !i.eq && TS.Game.canStore(i) && TS.Game.def(i).type !== 'material');
      return { inn: h.uid, out: o ? o.uid : null }; });
    await p.check(`label.row[data-side="in"][data-uid="${pick.inn}"] input`); await p.waitForTimeout(100);
    if (pick.out) { await p.check(`label.row[data-side="out"][data-uid="${pick.out}"] input`); await p.waitForTimeout(100); }
    assert(await p.evaluate((pk) => TS.UI.S.village.storage.some((i) => i.uid === pk.inn), pick), 'not moved before confirm');
    // 選んだ途中で読み込み直す：予定は残り、品は動いていない・回復は重ならない
    await p.evaluate(() => { TS.UI.S.run.player.hp = 123; TS.UI.debug.save(); });
    await p.reload(); await p.waitForTimeout(400);
    await p.tap('#btn-continue'); await p.waitForTimeout(500);
    for (let i = 0; i < 6 && !(await p.$('.modal h2:has-text("ティウの救援")')); i++) { await closeTalk(); await p.waitForTimeout(300); }
    assert(await p.isVisible('.modal h2:has-text("ティウの救援")'), 'rescue resumed');
    const rs = await p.evaluate((pk) => ({ hp: TS.UI.S.run.player.hp, checked: !!document.querySelector(`label.row[data-side="in"][data-uid="${pk.inn}"] input:checked`), total: TS.UI.S.run.bag.length + TS.UI.S.village.storage.length }), pick);
    assert(rs.hp === 123 && rs.checked && rs.total === a0.bag + a0.st, 'plan kept, no second heal ' + JSON.stringify(rs));
    // 交換を終える → 確認 → キャンセルで編集へ戻る
    await p.tap('.modal-buttons button >> text=交換を終える'); await p.waitForTimeout(250);
    assert(await p.isVisible('.modal:has-text("倉庫との交換を終えてよろしいですか？ この先へ進むと、今回の救援での交換はできなくなります。")'), 'confirm text');
    await shot('19b_rescue_confirm');
    await p.tap('.modal-buttons button >> text=キャンセル'); await p.waitForTimeout(200);
    assert(await p.evaluate(() => TS.Game.canRescue(TS.UI.S.run)) && await p.isVisible('.modal h2:has-text("ティウの救援")'), 'back to edit');
    // OK → 一括で交換 → オオカミ
    await p.tap('.modal-buttons button >> text=交換を終える'); await p.waitForTimeout(250);
    await p.tap('.modal-buttons button.primary >> text=OK'); await p.waitForTimeout(300);
    assert(await p.isVisible('.modal h2:has-text("オオカミが来た")'), 'wolf');
    const a1 = await p.evaluate((pk) => { const S = TS.UI.S; return { inBag: S.run.bag.some((i) => i.uid === pk.inn), outSt: pk.out == null || S.village.storage.some((i) => i.uid === pk.out),
      total: S.run.bag.length + S.village.storage.length, rescue: S.run.final.rescue }; }, pick);
    assert(a1.inBag && a1.outSt && a1.total === a0.bag + a0.st && a1.rescue === 'done', 'moved once without loss ' + JSON.stringify(a1));
    // 演出の途中で読み込み直す：オオカミだけ出し直し、交換は二重にならない
    await p.reload(); await p.waitForTimeout(400);
    await p.tap('#btn-continue'); await p.waitForTimeout(600);
    assert(await p.isVisible('.modal h2:has-text("オオカミが来た")'), 'wolf again after reload');
    eq2(await p.evaluate(() => TS.UI.S.run.bag.length + TS.UI.S.village.storage.length), a0.bag + a0.st, 'no dup after reload');
    await p.tap('.modal-buttons button >> text=進む'); await p.waitForTimeout(200);
    eq2(await p.evaluate(() => TS.UI.S.run.final.rescue + '/' + TS.UI.S.run.final.wolf), 'done/null', 'rescue done');
    // 31〜34階（自動では飛ばさない）→ 35階
    const floors = await p.evaluate(() => { const S = TS.UI.S, G = TS.Game, seen = [];
      while (S.run.floor < 35) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); seen.push(S.run.floor); }
      const r = S.run, b = r.enemies.find((e) => e.boss);
      b.hp = 5; b.hold = 3; b.cds = { ring: 9, palm: 9, flame: 9 };
      r.player.x = b.x - 1; r.player.y = b.y; r.player.hp = 100; r.player.poison = 5; G.updateVision(r);
      const ev = []; G.checkBossRoom(S, ev);
      return { seen, boss: b.type, intro: ev.some((e) => e.t === 'bossIntro') }; });
    assert(floors.seen.join() === '31,32,33,34,35' && floors.boss === 'truevearn' && floors.intro, 'to 35F ' + JSON.stringify(floors));
    await p.evaluate(() => TS.UI.playBossIntro('truevearn'));
    await p.waitForTimeout(200);
    assert(await p.isVisible('.talk'), 'body return (placeholder talk)');
    await closeTalk(); await p.waitForTimeout(500); await closeTalk();
    const pr = await p.evaluate(() => { const r = TS.UI.S.run; return { hp: r.player.hp, max: r.player.maxhp, poison: r.player.poison, stage: r.final.stage }; });
    assert(pr.hp === pr.max && pr.poison === 0 && pr.stage === 'battle2', 'prayer ' + JSON.stringify(pr));
    await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game, b = r.enemies.find((e) => e.boss); b.hp = 5; b.hold = 3; r.player.x = b.x - 1; r.player.y = b.y; G.updateVision(r); });
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
        const T = G.newState(); T.village.story.chapter = 3; G.takeReturnScroll(T); G.depart(T, s);
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
    const st = await p.evaluate(() => ({ screen: TS.UI.screen, floor: TS.UI.S.run && TS.UI.S.run.floor, ver: TS.UI.S.version, sv: TS.Data.SAVE_VERSION, funds: TS.UI.S.village.funds, storage: TS.UI.S.village.storage.length }));
    const raw = JSON.parse(v1);
    assert(st.screen === 'dungeon' && st.floor === 4 && st.ver === st.sv && st.funds === raw.village.funds && st.storage === raw.village.storage.length, JSON.stringify(st));
    await p.tap('#b-wait'); await p.waitForTimeout(200);
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('takeSaiAdventure.save')).version === TS.Data.SAVE_VERSION);
    assert(saved, 'saved as the current version');
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
      await p2.click('.depart-modal .modal-buttons button:has-text("帰還の巻物")'); await p2.waitForTimeout(200); await p2.click('text=出発する'); await p2.waitForTimeout(100);
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
      G.takeReturnScroll(S); G.depart(S, 5150); const r = S.run;
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

  await test('歩行アニメとダッシュの速さ：移動中は左足・右足のコマが交互に出て、止まると待機。ダッシュは1マス約60ms、指を離すと止まる', async () => {
    await p.evaluate(() => {
      const UI = TS.UI, G = TS.Game, S = G.newState(); UI.S = S; S.settings.dash = true;
      while (UI.modals.length) UI.modals[UI.modals.length - 1].close();
      for (let seed = 1; seed < 2000; seed++) {
        G.takeReturnScroll(S); G.depart(S, seed); const r = S.run, room = r.map.rooms.find((q) => q.w >= 8);
        if (!room) continue;
        r.enemies = []; r.floorItems = []; r.stairs = { x: -5, y: -5 }; r.returnPoint = null;
        r.player.x = room.x; r.player.y = room.y + (room.h >> 1); G.updateVision(r); break;
      }
      document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'screen-dungeon')); UI.screen = 'dungeon';
      window.__st = []; window.__fr = new Set();
      const orig = TS.Render.walkFrame; TS.Render.walkFrame = function (set, mv, pr, st) { const f = orig.apply(this, arguments); window.__fr.add(f === set.w1 ? 'w1' : f === set.w2 ? 'w2' : 'idle'); return f; };
      const oa = G.__oa || G.act; G.__oa = oa; G.act = function (S2, a) { const out = oa.apply(this, arguments); if (a.type === 'move') window.__st.push(performance.now()); return out; };
    });
    const x0 = await p.evaluate(() => TS.UI.S.run.player.x);
    await p.dispatchEvent('#dpad [data-dir="right"]', 'pointerdown', { pointerId: 9 });
    await p.waitForTimeout(170);
    await p.dispatchEvent('#dpad [data-dir="right"]', 'pointerup', { pointerId: 9 });
    const mid = await p.evaluate(() => TS.UI.S.run.player.x);
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => { const s = window.__st, d = []; for (let i = 1; i < s.length; i++) d.push(s[i] - s[i - 1]); TS.Game.act = TS.Game.__oa; return { x: TS.UI.S.run.player.x, avg: d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0, fr: [...window.__fr] }; });
    assert(r.x === mid, 'stopped on release ' + JSON.stringify([mid, r.x]));
    assert(mid - x0 >= 2 && r.avg > 45 && r.avg < 75, 'dash speed ' + JSON.stringify(r));
    assert(r.fr.includes('w1') && r.fr.includes('w2') && r.fr.includes('idle'), 'walk frames ' + JSON.stringify(r.fr));
    await p.evaluate(() => { TS.UI.S.settings.dash = false; });
  });

  await test('高速足踏み・気配察知・足元の道具・倉庫の素材', async () => {
    const setup = (o) => p.evaluate((o) => {
      const UI = TS.UI, G = TS.Game, S = G.newState(); UI.S = S; S.settings.dash = !!o.dash;
      while (UI.modals.length) UI.modals[UI.modals.length - 1].close();
      G.takeReturnScroll(S); G.depart(S, 6161); const r = S.run;
      while (r.floor < 4) { r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const room = r.map.rooms.find((q) => q.w >= 5 && q.h >= 4);
      r.enemies = r.enemies.filter((e) => !TS.Dungeon.roomAt(r.map, e.x, e.y) || TS.Dungeon.roomAt(r.map, e.x, e.y).id !== room.id);
      r.floorItems = []; r.player.x = room.x + 1; r.player.y = room.y + 1; r.player.hp = 20; r.player.maxhp = 60; r.player.lowWarned = true;
      G.updateVision(r); r.enemies = r.enemies.filter((e) => !G.isVisible(r, e.x, e.y));
      document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'screen-dungeon')); UI.screen = 'dungeon'; UI.lockUntil = 0;
      return { far: r.enemies.length };
    }, o);
    // ---- 高速足踏み（ダッシュON）：長押しで1ターン約60ms。HP全回復で止まり、満腹度は毎ターン通常どおり減る ----
    const info = await setup({ dash: true });
    await p.evaluate(() => { const r = TS.UI.S.run; r.sense = r.floor; window.__t0 = r.turn; window.__h0 = r.player.hunger; window.__ts = performance.now(); });
    await p.dispatchEvent('#b-wait', 'pointerdown', { pointerId: 21 });
    await p.waitForTimeout(1500);
    // 状態の読み取りと指を離す操作を同じ瞬間に行う（間に足踏みが1回入る競合を避ける）
    const mid = await p.evaluate(() => { const m = { stop: TS.UI.lastStop, note: document.getElementById('stopnote').textContent, turn: TS.UI.S.run.turn - window.__t0, hp: TS.UI.S.run.player.hp, max: TS.UI.S.run.player.maxhp, rest: !!TS.UI.rest, hunger: window.__h0 - TS.UI.S.run.player.hunger, ms: performance.now() - window.__ts };
      document.getElementById('b-wait').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 21 })); return m; });
    await p.waitForTimeout(250);
    const after = await p.evaluate(() => TS.UI.S.run.turn - window.__t0);
    assert(info.far >= 0 && mid.turn >= 12, 'fast rest ran even with sensed far enemies ' + JSON.stringify(mid));
    assert(after === mid.turn || !mid.rest, 'no extra turn on release ' + JSON.stringify([mid, after]));
    // ダッシュOFFは通常の速さ（約180ms）
    await setup({ dash: false });
    await p.evaluate(() => { window.__t0 = TS.UI.S.run.turn; });
    await p.dispatchEvent('#b-wait', 'pointerdown', { pointerId: 22 }); await p.waitForTimeout(1500); await p.dispatchEvent('#b-wait', 'pointerup', { pointerId: 22 });
    const slow = await p.evaluate(() => TS.UI.S.run.turn - window.__t0);
    assert(slow >= 4 && slow < mid.turn, 'normal speed ' + slow + ' vs ' + mid.turn);
    // 短く押すと1ターンだけ
    await p.waitForTimeout(200);
    const t1 = await p.evaluate(() => TS.UI.S.run.turn);
    await p.tap('#b-wait'); await p.waitForTimeout(250);
    eq2(await p.evaluate(() => TS.UI.S.run.turn), t1 + 1, 'tap = one turn');
    // ---- 気配察知：地図に印（地形は明かさない） ----
    await setup({});
    await p.evaluate(() => { const S = TS.UI.S; S.run.bag.push(TS.Game.makeItem(S, 'sense_scroll')); });
    const ex0 = await p.evaluate(() => TS.UI.S.run.explored.filter(Boolean).length);
    await p.evaluate(() => { const S = TS.UI.S, it = S.run.bag.find((i) => i.id === 'sense_scroll'); TS.UI.lockUntil = 0; TS.UI.doAct({ type: 'use', uid: it.uid }); });
    await p.waitForTimeout(300);
    assert(await p.evaluate((ex0) => TS.UI.S.run.sense === TS.UI.S.run.floor && TS.UI.S.run.explored.filter(Boolean).length === ex0, ex0), 'sense on, no reveal');
    await shot('34_sense_minimap');
    // ---- 足元：バッグ満杯でも回復を使える。杖の向き選びをやめると何も減らない ----
    await setup({});
    await p.evaluate(() => { const S = TS.UI.S, r = S.run, p = r.player; while (r.bag.length < 15) r.bag.push(TS.Game.makeItem(S, 'banana')); r.floorItems.push({ x: p.x, y: p.y, item: TS.Game.makeItem(S, 'herb') }); });
    const b0 = await p.evaluate(() => ({ bag: TS.UI.S.run.bag.map((i) => i.uid).join(), turn: TS.UI.S.run.turn, hp: TS.UI.S.run.player.hp }));
    await p.tap('#b-foot'); await p.waitForTimeout(200);
    assert(await p.isVisible('.modal h2:has-text("足元")') && await p.isVisible('text=やくそう'), 'foot menu');
    assert(!(await p.$('.modal-buttons button >> text=拾う')), 'no pickup when full');
    await shot('35_foot_use');
    await p.tap('.modal-buttons button >> text=その場で'); await p.waitForTimeout(250);
    const b1 = await p.evaluate(() => ({ bag: TS.UI.S.run.bag.map((i) => i.uid).join(), turn: TS.UI.S.run.turn, hp: TS.UI.S.run.player.hp, floor: TS.UI.S.run.floorItems.length }));
    assert(b1.bag === b0.bag && b1.turn === b0.turn + 1 && b1.hp > b0.hp && b1.floor === 0, JSON.stringify([b0, b1]));
    await p.evaluate(() => { const S = TS.UI.S, r = S.run, p = r.player; r.floorItems.push({ x: p.x, y: p.y, item: TS.Game.makeItem(S, 'thunder_staff', { charges: 3 }) }); });
    const c0 = await p.evaluate(() => TS.UI.S.run.turn);
    await p.tap('#b-foot'); await p.waitForTimeout(200);
    await p.tap('.modal-buttons button >> text=その場でふる'); await p.waitForTimeout(200);
    await p.tap('.modal-buttons button >> text=やめる'); await p.waitForTimeout(200);
    assert(await p.evaluate((c0) => TS.UI.S.run.turn === c0 && TS.UI.S.run.floorItems[0].item.charges === 3, c0), 'cancel consumes nothing');
    // ---- 倉庫の素材：素材箱の数と一致 ----
    await p.evaluate(() => { const S = TS.UI.S; S.run = null; S.village.materials = { amber_shard: 3, gold_leaf: 1 }; document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'screen-village')); TS.UI.screen = 'village'; });
    await p.tap('.fac[data-fac="storage"]'); await p.waitForTimeout(150);
    await p.tap('.tabs button[data-t="mat"]'); await p.waitForTimeout(150);
    const rows = await p.$$eval('.row.mat', (rs) => rs.map((r) => r.textContent));
    assert(rows.length === 2 && rows[0].includes('琥珀のかけら') && rows[0].includes('3個') && rows[1].includes('神殿の金ぱく') && rows[1].includes('1個'), JSON.stringify(rows));
    await shot('36_storage_materials');
    await p.evaluate(() => { TS.UI.S.village.materials = {}; });
    await p.tap('.tabs button[data-t="in"]'); await p.waitForTimeout(100); await p.tap('.tabs button[data-t="mat"]'); await p.waitForTimeout(100);
    assert(await p.isVisible('text=素材はまだありません'), 'empty message');
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(100);
  });

  await test('音楽試聴：2曲の再生・停止・連打・切り替え・ループ・最後まで再生・音量の保存・ミュート・閉じると元のBGM・裏に回すと停止（ターンは進まない）', async () => {
    try {
      await p.evaluate(() => { const UI = TS.UI, G = TS.Game, S = G.newState(); UI.S = S; while (UI.modals.length) UI.modals[UI.modals.length - 1].close(); G.takeReturnScroll(S); G.depart(S, 5151); S.run.enemies = [];
        document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'screen-dungeon')); UI.screen = 'dungeon'; UI.lockUntil = 0; UI.started = true; UI.debug.save();
        TS.Audio.unlock(); TS.Audio.playBgm('dungeon', true);
        const M = TS.Music, orig = M.play; window.__plays = 0; M.play = function () { window.__plays++; return orig.apply(M, arguments); }; });
      const turn0 = (await run()).turn;
      await p.tap('#b-menu'); await p.waitForTimeout(150);
      await p.tap('.modal-buttons button >> text=音楽試聴・音量'); await p.waitForTimeout(200);
      const listed = await p.evaluate(() => [...document.querySelectorAll('[data-play]')].map((b) => b.dataset.play).join());
      eq2(listed, 'fanfare,yanai,village,dungeon,boss,fanfare_v1,yanai_v1', 'songs listed');
      assert(await p.isVisible('text=第1版（比較用）'), 'old versions labelled');
      assert(await p.evaluate(() => TS.Audio.bgmHold && !TS.Audio.bgmTimer), 'scene bgm paused');
      await shot('48_music_room');
      // 連打：1回だけ再生
      await p.evaluate(() => { const b = document.querySelector('[data-play="fanfare"]'); b.click(); b.click(); b.click(); });
      await p.waitForTimeout(400);
      let st = await p.evaluate(() => ({ plays: window.__plays, cur: TS.Music.current && TS.Music.current.id, ctx: TS.Audio.ctx.state, s: TS.Music.status() }));
      eq2(st.plays, 1, 'debounced'); eq2(st.cur, 'fanfare'); assert(st.ctx === 'running' && st.s.sec > 0.1, 'playing ' + JSON.stringify(st));
      await shot('49_music_playing');
      // 切り替え：前の曲は止まり、鳴っているのは1曲だけ
      await p.waitForTimeout(300);
      await p.tap('[data-play="yanai"]'); await p.waitForTimeout(400);
      st = await p.evaluate(() => ({ plays: window.__plays, cur: TS.Music.current.id, s: TS.Music.status() }));
      eq2(st.cur, 'yanai'); eq2(st.plays, 2);
      // 停止
      await p.tap('#m-stop'); await p.waitForTimeout(200);
      assert(await p.evaluate(() => !TS.Music.current && document.getElementById('m-now').textContent === '停止中'), 'stopped');
      // ループのつなぎ目：ループする3曲それぞれ、1周目の終わりの8拍前から → つなぎ目を越えて2周目（ループの頭）へ戻る
      for (const id of ['yanai', 'village', 'dungeon']) {
        await p.waitForTimeout(300);
        const inf = await p.evaluate((id) => TS.Music.info(id), id);
        const wait = (8 * 60 / inf.bpm + 1.2) * 1000;
        await p.tap(`[data-seam="${id}"]`); await p.waitForTimeout(wait);
        st = await p.evaluate(() => TS.Music.status());
        assert(st && st.id === id && st.loops === 1 && st.sec > inf.loopStartSec && st.sec < inf.loopStartSec + 2.5, id + ' looped back ' + JSON.stringify(st));
      }
      // ファンファーレは最後まで鳴って自然に止まる
      await p.waitForTimeout(300);
      const fan = await p.evaluate(() => TS.Music.info('fanfare'));
      await p.tap('[data-play="fanfare"]'); await p.waitForTimeout((fan.seconds + fan.tail) * 1000 + 800);
      assert(await p.evaluate(() => !TS.Music.current && TS.Audio.bgmHold), 'fanfare finished, scene bgm still held while room open');
      // 音量：保存される
      await p.evaluate(() => { const i = document.getElementById('m-bgm'); i.value = 40; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change'));
        const j = document.getElementById('m-sfx'); j.value = 70; j.dispatchEvent(new Event('input')); j.dispatchEvent(new Event('change')); });
      // 音量の値は保存される。実際の音の大きさ（出口の音量）は、音が流れている間に確かめる（何も流れていない出口は、ブラウザが計算を止めて古い値のまま見えるため）
      await p.tap('[data-play="yanai"]'); await p.waitForTimeout(600);
      await p.waitForFunction(() => Math.abs(TS.Audio.musicBus.gain.value - 0.4) < 0.05, null, { timeout: 3000 }).catch(() => {});
      const vol = await p.evaluate(() => ({ bgm: TS.UI.S.settings.bgmVol, sfx: TS.UI.S.settings.sfxVol, saved: JSON.parse(localStorage.getItem('takeSaiAdventure.save')).settings, g: TS.Audio.musicBus.gain.value, gs: TS.Audio.sfxBus.gain.value, bv: TS.Audio.bgmVol, sv: TS.Audio.sfxVol }));
      assert(vol.bgm === 0.4 && vol.sfx === 0.7 && vol.saved.bgmVol === 0.4 && vol.saved.sfxVol === 0.7 && vol.bv === 0.4 && vol.sv === 0.7, 'volumes saved ' + JSON.stringify(vol));
      assert(Math.abs(vol.g - 0.4) < 0.05, 'music bus gain while playing ' + JSON.stringify(vol));
      await p.tap('#m-stop'); await p.waitForTimeout(200);
      // ミュート：オフの間は鳴らない
      await p.tap('.modal-buttons button >> text=音：オン'); await p.waitForTimeout(150);
      await p.tap('[data-play="yanai"]'); await p.waitForTimeout(300);
      assert(await p.evaluate(() => !TS.Music.current && TS.UI.S.settings.sound === false), 'muted: no play');
      await p.tap('.modal-buttons button >> text=音：オフ'); await p.waitForTimeout(300);
      // 裏に回すと止まり、戻っても重ならない
      await p.tap('[data-play="yanai"]'); await p.waitForTimeout(400);
      await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await p.waitForTimeout(300);
      assert(await p.evaluate(() => !TS.Music.current && TS.Audio.ctx.state === 'suspended'), 'stopped in background');
      await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await p.waitForTimeout(300);
      assert(await p.evaluate(() => !TS.Music.current && TS.Audio.ctx.state === 'running'), 'resumed without replay');
      // 閉じる：試聴は止まり、元のBGMに戻る。ターンは進んでいない
      await p.tap('[data-play="fanfare"]'); await p.waitForTimeout(300);
      await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(300);
      await p.waitForTimeout(400);
      const fin = await p.evaluate(() => ({ cur: TS.Music.current && TS.Music.current.id, isBgm: !!(TS.Music.current && TS.Music.current.bgm), hold: TS.Audio.bgmHold, bgm: TS.Audio.bgmName }));
      assert(fin.cur === 'dungeon' && fin.isBgm && !fin.hold && fin.bgm === 'dungeon', 'restored scene music ' + JSON.stringify(fin));
      eq2((await run()).turn, turn0, 'no turn');
      await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); const s = TS.UI.S.settings; s.bgmVol = 1; s.sfxVol = 1; TS.Audio.setVolumes(1, 1); });
    
    } finally {
      // 途中で失敗しても試聴画面を閉じ、音量を戻す（次のテストへ影響させない）
      await p.evaluate(() => { TS.UI.onMusicHidden = null; TS.Music.stop(0); TS.Audio.holdBgm(false); while (TS.UI.modals.length) { const m = TS.UI.modals[TS.UI.modals.length - 1]; m.opts.onClose = null; m.close(); } const st = TS.UI.S.settings; st.sound = true; TS.Audio.setEnabled(true); st.bgmVol = 1; st.sfxVol = 1; TS.Audio.setVolumes(1, 1); });
    }
  });

  await test('履歴は右の「履歴」ボタンだけで開く（本文・余白・操作キーからのはみ出しでは開かない。ターンは進まない）', async () => {
    await p.evaluate(() => { const UI = TS.UI, G = TS.Game, S = G.newState(); UI.S = S; while (UI.modals.length) UI.modals[UI.modals.length - 1].close(); G.takeReturnScroll(S); G.depart(S, 4242);
      const r = S.run; r.enemies = []; for (let i = 0; i < 4; i++) G.log(r, 'テストのメッセージ' + i + '：とても長い文章で欄の幅いっぱいまで表示される');
      document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'screen-dungeon')); UI.screen = 'dungeon'; UI.lockUntil = 0; UI.started = true; UI.debug.save(); });
    await p.waitForTimeout(200);
    const box = (sel) => p.evaluate((sel) => { const q = document.querySelector(sel).getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height }; }, sel);
    const turn0 = (await run()).turn;
    const L = await box('#log'), B = await box('#b-log'), lines = await box('#log-lines');
    const modalOpen = () => p.evaluate(() => TS.UI.modals.length > 0);
    await p.touchscreen.tap(lines.x + 30, lines.y + 8); await p.waitForTimeout(120);
    assert(!(await modalOpen()), 'text tap opens nothing');
    await p.touchscreen.tap(L.x + L.w - B.w - 14, L.y + L.h - 3); await p.waitForTimeout(120);
    assert(!(await modalOpen()), 'padding tap opens nothing');
    eq2((await run()).turn, turn0, 'no turn by bar tap');
    // 操作キーを押したまま指を「履歴」ボタンの上まで動かして離す（タッチ）
    const cdp = await ctx.newCDPSession(p);
    const up = await box('#dpad [data-dir="up"]');
    const tp = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(up.x + up.w / 2, up.y + up.h / 2) });
    await p.waitForTimeout(450);
    for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(up.x + up.w / 2 + (B.x + B.w / 2 - up.x - up.w / 2) * i / 6, up.y + up.h / 2 + (B.y + B.h / 2 - up.y - up.h / 2) * i / 6) }); await p.waitForTimeout(30); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(300);
    assert(!(await modalOpen()), 'drag release on button does not open');
    // マウスでも同じ（押した所と離した所が違う）
    await p.mouse.move(up.x + up.w / 2, up.y + up.h / 2); await p.mouse.down(); await p.mouse.move(B.x + B.w / 2, B.y + B.h / 2, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(300);
    assert(!(await modalOpen()), 'mouse drag release does not open');
    await p.evaluate(() => { const r = TS.UI.S.run; r.player.hp = r.player.maxhp; });
    const t1 = (await run()).turn;
    await p.touchscreen.tap(B.x + B.w / 2, B.y + B.h / 2); await p.waitForTimeout(150);
    assert(await p.isVisible('text=メッセージ履歴'), 'button opens history');
    eq2((await run()).turn, t1, 'no turn by history');
    await shot('41_history_button');
    await p.tap('.modal-buttons button >> text=閉じる'); await p.waitForTimeout(100);
    eq2((await run()).turn, t1, 'no turn by closing');
    // 最新メッセージは欄の中に見えている
    const last = await p.evaluate(() => document.querySelector('#log-lines div.new').textContent);
    assert(/テストのメッセージ3|たけ/.test(last) || last.length > 0, 'latest shown ' + last);
  });

  await test('投げる：道具欄から向きを選んで投げる（やめると減らない・連打しても1回）、足元の道具はバッグがいっぱいでも投げられる', async () => {
    const setupRoom = () => p.evaluate(() => {
      const S = TS.UI.S, r = S.run, G = TS.Game; while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close();
      const m = r.map; const x0 = 8, y0 = 6, w = 17, h = 13;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) m.tiles[y * m.w + x] = 1;
      m.rooms = [{ id: 99, x: x0, y: y0, w, h }]; r.enemies = []; r.floorItems = []; r.returnPoint = null; r.stairs = { x: 1, y: 1 }; r.merchant = null;
      r.player.x = 12; r.player.y = 12; r.player.hp = r.player.maxhp = 999;
      const e = G.makeEnemy(r, 'frog', 15, 12); e.hp = e.maxhp = 200; e.sleep = 999; r.enemies.push(e);
      r.bag = r.bag.filter((i) => i.id === 'return_scroll'); r.bag.push(G.makeItem(S, 'herb'), G.makeItem(S, 'sleep_incense'));
      G.updateVision(r); TS.UI.lockUntil = 0; TS.UI.debug.save();
    });
    await setupRoom(); await p.waitForTimeout(150);
    const st = () => p.evaluate(() => { const r = TS.UI.S.run; return { turn: r.turn, bag: r.bag.map((i) => i.id).join(), ehp: r.enemies[0] && r.enemies[0].hp, floor: r.floorItems.length }; });
    const s0 = await st();
    await p.tap('#b-items'); await p.waitForTimeout(150);
    await p.tap('.row >> text=やくそう'); await p.waitForTimeout(120);
    await p.tap('.modal-buttons button >> text=/^投げる$/'); await p.waitForTimeout(150);
    assert(await p.isVisible('text=投げる向き'), 'dir picker'); await shot('42_throw_pick');
    await p.tap('.modal-buttons button >> text=やめる'); await p.waitForTimeout(120);
    let s1 = await st(); eq2(s1.turn, s0.turn, 'cancel no turn'); eq2(s1.bag, s0.bag, 'cancel keeps item');
    while (await p.evaluate(() => TS.UI.modals.length)) { await p.evaluate(() => TS.UI.modals[TS.UI.modals.length - 1].close()); }
    await p.tap('#b-items'); await p.waitForTimeout(150);
    await p.tap('.row >> text=やくそう'); await p.waitForTimeout(120);
    await p.tap('.modal-buttons button >> text=/^投げる$/'); await p.waitForTimeout(150);
    // 「右」を素早く2回押す（1回だけ投げる）
    await p.evaluate(() => { const b = document.querySelector('.dir-pick button[data-d="right"]'); b.click(); b.click(); });
    await p.waitForTimeout(500); await shot('43_throw_hit');
    s1 = await st();
    eq2(s1.turn, s0.turn + 1, 'one turn'); eq2(s1.bag.split(',').filter((x) => x === 'herb').length, 0, 'herb used');
    eq2(s1.ehp, 200, 'enemy healed to max (was full)');
    const logTxt = await p.evaluate(() => TS.UI.S.run.log.slice(-4).join('/'));
    assert(/やくそうを投げた/.test(logTxt) && /当たった/.test(logTxt), logTxt);
    // 足元：バッグがいっぱいでも投げられる
    await p.evaluate(() => { const S = TS.UI.S, r = S.run, G = TS.Game; while (r.bag.length < TS.Data.BAG_SIZE) r.bag.push(G.makeItem(S, 'banana'));
      r.enemies[0].hp = 100; r.floorItems.push({ x: r.player.x, y: r.player.y, item: G.makeItem(S, 'sleep_incense') }); r.enemies[0].sleep = 0; r.enemies[0].x = 14; G.updateVision(r); TS.UI.lockUntil = 0; });
    await p.tap('#b-foot'); await p.waitForTimeout(150);
    assert(await p.isVisible('text=投げることはできます'), 'full bag note'); await shot('44_throw_foot_full');
    await p.tap('.modal-buttons button >> text=/^投げる$/'); await p.waitForTimeout(150);
    await p.tap('.dir-pick button[data-d="right"]'); await p.waitForTimeout(500);
    const s2 = await p.evaluate(() => { const r = TS.UI.S.run; return { n: r.bag.length, sleep: r.enemies[0].sleep, under: !!TS.Game.itemAt(r, r.player.x, r.player.y) }; });
    eq2(s2.n, 15, 'bag unchanged'); assert(s2.sleep > 0, 'enemy slept'); assert(!s2.under, 'floor item thrown');
  });

  await test('アクセサリー：道具欄で装備・外す（1ターン）。装備中は投げられず、保存して読み込んでも装備のまま', async () => {
    await p.evaluate(() => { const S = TS.UI.S, r = S.run, G = TS.Game; while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close();
      r.bag = r.bag.filter((i) => i.id === 'return_scroll'); r.bag.push(G.makeItem(S, 'poison_ring'), G.makeItem(S, 'purse_charm'), G.makeItem(S, 'full_bangle'), G.makeItem(S, 'life_necklace'));
      TS.UI.lockUntil = 0; TS.UI.debug.save(); });
    const t0 = (await run()).turn;
    await p.tap('#b-items'); await p.waitForTimeout(150);
    await shot('45_accessories_bag');
    await p.tap('.row >> text=命つなぎの首飾り'); await p.waitForTimeout(120);
    await shot('46_accessory_detail');
    await p.tap('.modal-buttons button >> text=装備する（1ターン）'); await p.waitForTimeout(250);
    eq2((await run()).turn, t0 + 1, 'equip 1 turn');
    assert(await p.evaluate(() => TS.Game.hasAcc(TS.UI.S.run, 'revive')), 'equipped');
    await p.tap('#b-items'); await p.waitForTimeout(150);
    assert(await p.isVisible('.row .eq'), 'eq tag'); await shot('47_accessory_equipped');
    await p.tap('.row >> text=命つなぎの首飾り'); await p.waitForTimeout(120);
    await p.tap('.modal-buttons button >> text=投げる（装備中）'); await p.waitForTimeout(150);
    assert(await p.isVisible('text=外してから投げてください'), 'cannot throw equipped');
    while (await p.evaluate(() => TS.UI.modals.length)) { await p.evaluate(() => TS.UI.modals[TS.UI.modals.length - 1].close()); }
    const saved = await p.evaluate(() => { const d = TS.Save.load(); return TS.Game.hasAcc(d.run, 'revive'); });
    assert(saved, 'kept in save');
  });

  await test('操作画面の寸法（幅360〜430）：方向キー・向き・右のコマンドは44px以上、メッセージは16px以上で操作キーの上、村の章の欄は1行', async () => {
    for (const w of [360, 390, 430]) {
      await p.setViewportSize({ width: w, height: w === 360 ? 740 : 860 });
      await p.evaluate(() => { const UI = TS.UI, G = TS.Game, S = G.newState(); UI.S = S; while (UI.modals.length) UI.modals[UI.modals.length - 1].close(); G.takeReturnScroll(S); G.depart(S, 77); document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'screen-dungeon')); UI.screen = 'dungeon'; TS.UI.debug.save(); });
      await p.waitForTimeout(200);
      const m = await p.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        const sizes = [...document.querySelectorAll('#dpad button, #actions button')].map((b) => { const q = b.getBoundingClientRect(); return [q.width, q.height]; });
        return { min: Math.min(...sizes.flat()), log: r('#log'), view: r('#view'), ctrl: r('#controls'), dpad: r('#dpad'), acts: r('#actions'), font: parseFloat(getComputedStyle(document.getElementById('log')).fontSize), H: innerHeight };
      });
      assert(m.min >= 44, w + ': touch ' + m.min);
      assert(m.font >= 16, 'log font ' + m.font);
      assert(m.log.top >= m.view.bottom - 1 && m.log.bottom <= m.ctrl.top + 1, 'log between view and controls');
      assert(Math.abs(m.acts.top - m.dpad.top) <= 2 && Math.abs(m.acts.bottom - m.dpad.bottom) <= 2, w + ': actions aligned ' + JSON.stringify([m.acts, m.dpad]));
      assert(m.ctrl.bottom <= m.H + 1, 'controls on screen');
      if (w === 360 || w === 430) await shot('37_dungeon_ui_' + w);
      await p.evaluate(() => { const S = TS.UI.S; S.run = null; S.village.story.chapter = 3; document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'screen-village')); TS.UI.screen = 'village'; });
      await p.evaluate(() => TS.UI.debug.updateVillageHud()); await p.waitForTimeout(150);
      const v = await p.evaluate(() => { const e = document.getElementById('v-chapter'); return { text: e.textContent, h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) || 20 }; });
      assert(v.text === '第3章｜次のボス：キルバーン', v.text);
      assert(v.h < 40, 'one line ' + v.h);
      if (w === 390) await shot('38_village_header');
    }
    await p.setViewportSize({ width: 390, height: 844 });
  });

  await test('すべての地域の地形と部屋の見せ場（レンガの遺跡・水晶の地下神殿・封印の最深部ほか）がエラーなく描ける', async () => {
    const bad = await p.evaluate(() => {
      const out = [], G = TS.Game, RD = TS.Render, UI = TS.UI, keep = UI.S, keepScreen = UI.screen;
      const themes = ['brick', 'roots', 'water', 'orb', 'garden', 'sunken', 'crystal', 'gold', 'shrine', 'demon', 'throne', 'arena_croc', 'arena_flame', 'arena_kill', 'arena_baran', 'arena_mist'];
      const feats = ['plain', 'pillars', 'mural', 'statue', 'mosaic', 'overgrown', 'crystals', 'goldtrim', 'inlay', 'braziers', 'seal'];
      const S = G.newState(); G.takeReturnScroll(S); G.depart(S, 4242);
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

  await test('場面の音楽：タイトル（操作後にファンファーレ1回）→村→施設の開閉→ヤナイの記録・像→ダンジョン→階の移動・道具・メニュー→ミュート→裏に回す→ボス→帰還→読み込み直し', async () => {
    const { ctx: c2, p: q } = await mk(phone);
    try {
      const FIXT = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-cleared.json'), 'utf8');
      await q.goto(URL); await q.waitForTimeout(300);
      await q.evaluate((t) => localStorage.setItem('takeSaiAdventure.save', t), FIXT); await q.reload(); await q.waitForTimeout(800);
      const cur = () => q.evaluate(() => { const c = TS.Music.current; return { id: c && c.id, bgm: !!(c && c.bgm), timer: !!TS.Audio.bgmTimer, old: TS.Audio.oldBgm, scene: TS.Audio.bgmName, ctx: TS.Audio.ctx && TS.Audio.ctx.state }; });
      const same = (tag) => q.evaluate((tag) => window[tag] === TS.Music.current, tag);
      const keep = (tag) => q.evaluate((tag) => { window[tag] = TS.Music.current; }, tag);
      const talkThrough = async () => { for (let i = 0; i < 40 && await q.$('.talk'); i++) { await q.tap('.modal-buttons button.primary'); await q.waitForTimeout(60); } };
      // タイトル：操作の前は鳴らない。最初の操作のあとファンファーレ（1回だけ）
      // （読み込み時に自動再生を試すので、音の処理は作られるが止まったまま。曲は始めない）
      let c = await cur(); assert(!c.id && c.ctx !== 'running', 'silent before gesture ' + JSON.stringify(c));
      await q.touchscreen.tap(20, 20); await q.waitForTimeout(400);
      c = await cur(); assert(c.id === 'fanfare' && c.bgm, 'fanfare after gesture ' + JSON.stringify(c));
      await keep('__f'); await q.touchscreen.tap(30, 30); await q.waitForTimeout(200);
      assert(await same('__f'), 'fanfare not restarted by another tap');
      // つづきから → 村の曲（ファンファーレはフェードして切り替わる）
      await q.tap('#btn-continue'); await q.waitForTimeout(300); await talkThrough();
      while (await q.evaluate(() => TS.UI.modals.length)) await q.evaluate(() => TS.UI.modals[TS.UI.modals.length - 1].close());
      await q.waitForTimeout(700);
      c = await cur(); assert(c.id === 'village' && c.bgm && !c.timer, 'village music ' + JSON.stringify(c));
      await keep('__v');
      for (const fac of ['shop', 'storage', 'develop']) { await q.tap(`.fac[data-fac="${fac}"]`); await q.waitForTimeout(200); await q.evaluate(() => TS.UI.modals[TS.UI.modals.length - 1].close()); await q.waitForTimeout(100); }
      assert(await same('__v'), 'village music continues across facilities');
      // ヤナイの記録・記念像：ヤナイのテーマ → 閉じると村の曲
      await q.evaluate(() => TS.UI.debug.showRecords()); await q.waitForTimeout(800);
      c = await cur(); assert(c.id === 'yanai' && c.bgm, 'yanai theme for records ' + JSON.stringify(c));
      await q.evaluate(() => TS.UI.modals[TS.UI.modals.length - 1].close()); await q.waitForTimeout(800);
      c = await cur(); assert(c.id === 'village', 'back to village after records ' + JSON.stringify(c));
      await q.evaluate(() => TS.UI.debug.statueTalk()); await q.waitForTimeout(800);
      c = await cur(); assert(c.id === 'yanai', 'yanai theme at statue ' + JSON.stringify(c));
      await talkThrough(); await q.waitForTimeout(800);
      c = await cur(); assert(c.id === 'village', 'back to village after statue ' + JSON.stringify(c));
      // 出発 → ダンジョンの曲
      await q.tap('.fac.depart'); await q.waitForTimeout(200); await q.tap('.depart-modal .modal-buttons button:has-text("帰還の巻物")'); await q.waitForTimeout(200); await q.click('text=出発する'); await q.waitForTimeout(300); await talkThrough();
      while (await q.evaluate(() => TS.UI.modals.length)) await q.evaluate(() => TS.UI.modals[TS.UI.modals.length - 1].close());
      await q.waitForTimeout(800);
      c = await cur(); assert(c.id === 'dungeon' && c.bgm && !c.timer, 'dungeon music ' + JSON.stringify(c));
      await keep('__d');
      // 通常の階を降りても、道具・メニュー・履歴を開いても最初に戻らない
      for (let i = 0; i < 2; i++) { await q.evaluate(() => { const r = TS.UI.S.run; r.enemies = []; r.player.x = r.stairs.x; r.player.y = r.stairs.y; TS.UI.lockUntil = 0; TS.UI.doAct({ type: 'descend' }); }); await q.waitForTimeout(300); }
      for (const b of ['#b-items', '#b-menu', '#b-log']) { await q.tap(b); await q.waitForTimeout(200); await q.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); }); await q.waitForTimeout(100); }
      assert(await same('__d'), 'dungeon music continues across floors and menus');
      // ダッシュ・高速足踏みで曲のテンポは変わらない（曲の拍の長さは BPM だけで決まる）
      eq2(await q.evaluate(() => TS.Music.current.song.spb), 60 / 72, 'dungeon tempo');
      // ミュート → 解除で今の場面の曲
      await q.tap('#b-menu'); await q.waitForTimeout(150); await q.tap('.modal-buttons button >> text=音：オン'); await q.waitForTimeout(500);
      c = await cur(); assert(!c.id && !c.timer, 'muted: nothing scheduled ' + JSON.stringify(c));
      await q.tap('.modal-buttons button >> text=音：オフ'); await q.waitForTimeout(500);
      c = await cur(); assert(c.id === 'dungeon', 'unmute plays current scene ' + JSON.stringify(c));
      await q.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
      await keep('__d2');
      // 裏に回す → 一時停止、戻ると同じ曲の続き（重ならない）
      await q.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await q.waitForTimeout(300);
      c = await cur(); assert(c.ctx === 'suspended' && c.id === 'dungeon', 'paused in background ' + JSON.stringify(c));
      await q.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await q.waitForTimeout(400);
      c = await cur(); assert(c.ctx === 'running' && await same('__d2'), 'resumed same playback ' + JSON.stringify(c));
      // ボスの階：以前のボス曲（新しい曲は止まる）
      await q.evaluate(() => { const S = TS.UI.S, r = S.run, G = TS.Game; r.player.hp = r.player.maxhp = 99999;
        while (r.floor < G.maxFloor(r) - 1) { r.enemies = []; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
        r.enemies = []; r.player.x = r.stairs.x; r.player.y = r.stairs.y; TS.UI.lockUntil = 0; TS.UI.doAct({ type: 'descend' }); });
      await q.waitForTimeout(1200); await talkThrough();
      while (await q.evaluate(() => TS.UI.modals.length)) await q.evaluate(() => TS.UI.modals[TS.UI.modals.length - 1].close());
      // ボスの階に着いただけ：探索の曲のまま（同じ再生が続く）。ボス部屋に入るとボス戦の新しい曲（以前の合成ループは使わない）
      c = await cur(); assert(c.id === 'dungeon' && c.bgm && !c.timer && c.scene === 'dungeon', 'dungeon music on the boss floor before the fight ' + JSON.stringify(c));
      await q.evaluate(() => { const r = TS.UI.S.run, A = r.bossFight; let y = A.y; while (!TS.Dungeon.passable(r.map, A.x - 1, y)) y++; r.player.x = A.x - 1; r.player.y = y; TS.Game.updateVision(r); TS.UI.lockUntil = 0; TS.UI.doAct({ type: 'move', dir: 'right' }); });
      await q.waitForTimeout(800); await talkThrough();
      while (await q.evaluate(() => TS.UI.modals.length)) await q.evaluate(() => TS.UI.modals[TS.UI.modals.length - 1].close());
      // クロコダインの登場ムービー（いま閉じた＝スキップ）のあとに、戦いの前の会話が開くので、それも進める
      await q.waitForTimeout(600); await talkThrough();
      while (await q.evaluate(() => TS.UI.modals.length)) await q.evaluate(() => TS.UI.modals[TS.UI.modals.length - 1].close());
      c = await cur(); assert(c.id === 'boss' && c.bgm && !c.timer && c.scene === 'boss', 'boss music after entering ' + JSON.stringify(c));
      // メニューの開閉・部屋から出ても、ボス戦の曲は最初から流し直さない
      await keep('__b');
      await q.tap('#b-menu'); await q.waitForTimeout(200); await q.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); }); await q.waitForTimeout(200);
      await q.evaluate(() => { TS.UI.lockUntil = 0; TS.UI.doAct({ type: 'move', dir: 'left' }); }); await q.waitForTimeout(300);
      assert(await same('__b'), 'boss music continues across the menu and leaving the room');
      // 帰還の巻物で村へ → 村の曲（ボス曲は止まる）
      await q.evaluate(() => { const r = TS.UI.S.run, it = r.bag.find((i) => i.id === 'return_scroll'); TS.UI.lockUntil = 0; TS.UI.doAct({ type: 'use', uid: it.uid }); });
      await q.waitForTimeout(1800); await talkThrough();
      while (await q.evaluate(() => TS.UI.modals.length)) await q.evaluate(() => TS.UI.modals[TS.UI.modals.length - 1].close());
      await q.waitForTimeout(800);
      c = await cur(); assert(c.id === 'village' && !c.timer, 'village after return ' + JSON.stringify(c));
      // 読み込み直して「つづきから」：ファンファーレ → 村の曲。ボスの進行・所持品はそのまま
      const before = await q.evaluate(() => JSON.stringify({ v: TS.UI.S.village.bag.map((i) => i.id), st: TS.UI.S.village.story.chapter, f: TS.UI.S.village.funds }));
      await q.reload(); await q.waitForTimeout(800);
      await q.touchscreen.tap(20, 20); await q.waitForTimeout(300);
      await q.tap('#btn-continue'); await q.waitForTimeout(300); await talkThrough();
      while (await q.evaluate(() => TS.UI.modals.length)) await q.evaluate(() => TS.UI.modals[TS.UI.modals.length - 1].close());
      await q.waitForTimeout(800);
      c = await cur(); assert(c.id === 'village', 'village after reload ' + JSON.stringify(c));
      eq2(await q.evaluate(() => JSON.stringify({ v: TS.UI.S.village.bag.map((i) => i.id), st: TS.UI.S.village.story.chapter, f: TS.UI.S.village.funds })), before, 'save intact');
    } finally { await c2.close(); }
  });

  await test('ブラウザのエラー・読み込み失敗がない', async () => {
    assert(errors.length === 0, errors.join('\n'));
  });
  await test('登場ムービーの動画と最初の1コマは、公開先のサブパスでも取得できる（Git LFS のポインタではない）', async () => {
    const r = await p.evaluate(async () => { const M = TS.ASSETS.movies.crocodine, out = {};
      for (const [k, u] of Object.entries(M)) { const res = await fetch(u); const b = await res.arrayBuffer(); out[k] = { url: res.url, status: res.status, size: b.byteLength, head: Array.from(new Uint8Array(b.slice(0, 12))).map((x) => String.fromCharCode(x)).join('') }; }
      return out; });
    assert(r.video.status === 200 && r.video.size > 1e6 && r.video.head.slice(4, 8) === 'ftyp' && /\/take-sai-adventure\/assets\/movies\//.test(r.video.url), 'video ' + JSON.stringify(r.video));
    assert(r.poster.status === 200 && r.poster.size > 1e4, 'poster ' + JSON.stringify(r.poster));
  });

  await browser.close();
  srv.close();
  console.log(`\n結果: ${passed} 成功 / ${failed} 失敗　（スクリーンショット: ${OUT}）`);
  process.exit(failed ? 1 : 0);
})();

function BASE_PLACEHOLDER() { return '/take-sai-adventure/favicon.png'; }
