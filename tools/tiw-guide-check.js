// ティウの冒険案内と相棒のオオカミの確認：node tools/tiw-guide-check.js [リポジトリ] [出力フォルダ]（幅360・390・430）
// 村：オオカミがティウの右どなりに立ち、港・桟橋・橋への道をふさがない。ティウ本人をタップ → となりへ歩いて案内を開く。オオカミをタップ → ひとこと。
// 案内：一覧 → 質問 → 答え、「戻る」で一つ前、「閉じる」。開いている間は村の移動・タップを受けない。出発画面の「ティウと話す」も同じ案内（閉じると出発画面へ）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'tiw-guide'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8807);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8807/'); await p.waitForTimeout(400);
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = 2; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); const W = TS.UI.walker; W.x = 9; W.y = 20; W.path = []; W.moving = false; });
    await p.waitForTimeout(500);
    // 配置：道をふさがない
    const lay = await p.evaluate(() => { const v = TS.UI.vview, VL = TS.Village, M = VL.MW, s = v.solid;
      const reach = (x, y) => !!VL.path(s, VL.START.x, VL.START.y, x, y);
      return { wolf: [VL.WOLF.x, VL.WOLF.y], solidWolf: !!s[VL.WOLF.y * M + VL.WOLF.x], dock: reach(10, 23), road: [reach(18, 20), reach(0, 20), reach(11, 21), reach(12, 20), reach(14, 21)], art: !!(TS.Sprites.art.village.wolf) }; });
    chk(lay.art && lay.solidWolf && lay.dock && lay.road.every(Boolean), `${w} オオカミ (13,21)：絵あり・道（港の道・桟橋・ティウの左と上）をふさがない ${JSON.stringify(lay)}`);
    await p.screenshot({ path: path.join(OUT, `village_tiw_wolf_${w}.png`) });
    // ティウ本人をタップ → 案内
    const hit = await p.evaluate(() => { const hh = TS.UI.vview.hits.find((x) => x.kind === 'npc' && x.id === 'depart'); return hh && { x: hh.x + hh.w / 2, y: hh.y + hh.h / 2 }; });
    const box = await p.$eval('#village-canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top }; });
    await p.mouse.click(box.x + hit.x, box.y + hit.y); await p.waitForTimeout(1500);
    let st = await p.evaluate(() => ({ title: (document.querySelector('.modal h2') || {}).textContent, txt: (document.querySelector('.modal-body') || {}).textContent || '', n: document.querySelectorAll('.tg-choice').length,
      walker: [TS.UI.walker.x, TS.UI.walker.y], run: !!TS.UI.S.run }));
    chk(st.title === 'ティウの冒険案内' && st.txt.includes('奥のお宝が気になるだろ？') && st.n === 6 && !st.run, `${w} ティウ本人をタップ → 案内（最初の台詞・6項目） ${JSON.stringify(st)}`);
    await p.screenshot({ path: path.join(OUT, `guide_top_${w}.png`) });
    // 案内中は村が動かない（後ろの地面をタップしても歩かない）
    const wk0 = st.walker; await p.mouse.click(box.x + 20, box.y + 40); await p.waitForTimeout(500);
    chk(JSON.stringify(await p.evaluate(() => [TS.UI.walker.x, TS.UI.walker.y])) === JSON.stringify(wk0), `${w} 案内中は後ろの村が動かない`);
    const tapChoice = async (t) => { await p.tap(`.tg-choice:has-text("${t}")`); await p.waitForTimeout(200); };
    const body = () => p.evaluate(() => document.querySelector('.modal-body').textContent);
    // 素材 → 琥珀のかけら
    await tapChoice('素材を探す'); await tapChoice('琥珀のかけら');
    let t = await body(); chk(t.includes('地下11〜15階') && t.includes('必ず拾えるわけじゃない') && t.includes('+4') && t.includes('12%'), `${w} 素材：琥珀のかけら（地下11〜15階・可能性・用途）`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `guide_material_${w}.png`) });
    await p.tap('.modal-buttons button:has-text("戻る")'); await p.waitForTimeout(150);
    chk((await p.$$('.tg-choice')).length === 4, `${w} 戻る → 素材の一覧`);
    await p.tap('.modal-buttons button:has-text("戻る")'); await p.waitForTimeout(150);
    // お宝：ボスの報酬は未撃破なら出ない
    await tapChoice('お宝を探す');
    t = await body(); chk(!t.includes('クロコダインの涙') && !t.includes('竜の紋章') && t.includes('黄金の象'), `${w} お宝：未撃破のボスの報酬は出さない`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `guide_treasure_list_${w}.png`) });
    await p.tap('.modal-buttons button:has-text("戻る")'); await p.waitForTimeout(150);
    // 装備の組み合わせ
    await tapChoice('装備の組み合わせ'); t = await body();
    chk(t.includes('単品の強さだけじゃ') && t.includes('装備して') && (await p.$$('.tg-choice')).length === 5, `${w} 装備の組み合わせ（導入・5つ）`);
    await tapChoice('漆黒の盾＋大魔王のローブ'); t = await body(); chk(t.includes('2割') && t.includes('真魔剛竜剣を装備'), `${w} 漆黒の盾＋ローブの説明`);
    await p.tap('.modal-buttons button:has-text("戻る")'); await p.tap('.modal-buttons button:has-text("戻る")'); await p.waitForTimeout(150);
    // 冒険のコツ：長い答えは回答欄だけスクロール
    await tapChoice('冒険のコツ'); await tapChoice('どんそくの粉はどう使う？');
    const sc = await p.evaluate(() => { const b = document.querySelector('.modal-body'), m = document.querySelector('.modal').getBoundingClientRect(), btn = [...document.querySelectorAll('.modal-buttons button')].filter((x) => !x.hidden).map((x) => { const r = x.getBoundingClientRect(); return r.bottom <= innerHeight + 0.5 && r.width > 80; });
      return { scroll: b.scrollHeight > b.clientHeight, fit: m.bottom <= innerHeight + 0.5 && m.right <= innerWidth + 0.5, btn, sw: document.documentElement.scrollWidth, txt: b.textContent }; });
    chk(sc.fit && sc.btn.length === 2 && sc.btn.every(Boolean) && sc.sw <= w && sc.txt.includes('15ターン') && sc.txt.includes('一歩下がる'), `${w} どんそくの粉：画面内・戻る／閉じるが見える（回答欄スクロール：${sc.scroll}）`);
    await p.screenshot({ path: path.join(OUT, `guide_tip_slow_${w}.png`) });
    await p.tap('.modal-buttons button:has-text("戻る")'); await tapChoice('その場で早く回復したい'); t = await body();
    chk(t.includes('長押し') && t.includes('回復する量は変わらない') && t.includes('満腹の腕輪'), `${w} 回復のコツ`);
    await p.tap('.modal-buttons button:has-text("戻る")'); await tapChoice('奥まで手早く進みたい'); t = await body();
    chk(t.includes('みとおしの巻物') && t.includes('敵の居場所までは出ない'), `${w} みとおしの巻物`);
    await p.tap('.modal-buttons button:has-text("戻る")'); await p.tap('.modal-buttons button:has-text("戻る")'); await p.waitForTimeout(150);
    // 町のうわさ（拾う前／拾った後）
    await tapChoice('町のうわさ'); await tapChoice('川の向こう岸のこと'); t = await body();
    chk(t.includes('マスターヤナイが川の向こうで'), `${w} うわさ（拾う前）`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `guide_rumor_${w}.png`) });
    await p.tap('.modal-buttons button:has-text("閉じる")'); await p.waitForTimeout(200);
    chk(await p.evaluate(() => !TS.UI.modals.length), `${w} 閉じる`);
    await p.evaluate(() => { TS.UI.S.village.story.found = Object.assign({}, TS.UI.S.village.story.found, { dragon_crest: true }); TS.UI.openTiwGuide(); });
    await tapChoice('町のうわさ'); await tapChoice('川の向こう岸のこと'); t = await body();
    chk(t.includes('見つかったんだってな') && !t.includes('なくしたらしい'), `${w} うわさ（拾った後は繰り返さない）`);
    await p.tap('.modal-buttons button:has-text("閉じる")'); await p.waitForTimeout(150);
    // オオカミ
    await p.evaluate(() => TS.UI.approachCreature('wolf', 'wolf')); await p.waitForTimeout(1500);
    chk(await p.evaluate(() => (document.querySelector('.talk') || {}).textContent || '').then((x) => x.includes('相棒のオオカミ')), `${w} オオカミに話しかける`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `wolf_talk_${w}.png`) });
    for (let i = 0; i < 5 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(80); }
    // 出発画面の「ティウと話す」→ 同じ案内 → 閉じると出発画面へ
    await p.tap('.fac[data-fac="depart"]'); await p.waitForTimeout(300);
    await p.tap('.depart-modal .modal-buttons button:has-text("ティウと話す")'); await p.waitForTimeout(300);
    chk(await p.isVisible('.modal h2:has-text("ティウの冒険案内")'), `${w} 出発画面の「ティウと話す」→ 案内`);
    await p.tap('.modal-buttons button:has-text("閉じる")'); await p.waitForTimeout(300);
    chk(await p.isVisible('.modal h2:has-text("遺跡へ出発")'), `${w} 閉じると出発画面へ戻る`);
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  // 冒険のコツ「ダッシュをオンにして足踏みボタンを長押し」：連続で休み、ダッシュで早送り（1ターンの回復量は同じ）
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8807/'); await p.waitForTimeout(400);
    const rest = async (dash) => {
      await p.evaluate((dash) => { localStorage.clear(); const G = TS.Game, S = G.newState(); S.village.story.introDone = true; S.village.seenIntro = true; S.settings.dash = dash; G.depart(S, 99);
        S.run.enemies = []; S.run.player.maxhp = 400; S.run.player.hp = 160; S.run.player.lowWarned = true; TS.Save.save(S); }, dash);
      await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(700);
      for (let i = 0; i < 10 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(60); }
      const t0 = await p.evaluate(() => TS.UI.S.run.turn);
      const bb = await p.$eval('#b-wait', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await p.mouse.move(bb.x, bb.y); await p.mouse.down(); await p.waitForTimeout(2400); await p.mouse.up(); await p.waitForTimeout(100);
      return p.evaluate((t0) => ({ turns: TS.UI.S.run.turn - t0, hp: TS.UI.S.run.player.hp, stop: TS.UI.lastStop, log: TS.UI.S.run.log.slice(-3) }), t0);
    };
    const slow = await rest(false), fast = await rest(true);
    chk(slow.turns >= 5 && fast.turns > slow.turns * 2, `足踏みの長押しで連続して休む。ダッシュオンは早送り（ダッシュなし ${slow.turns}ターン／オン ${fast.turns}ターン、約2秒） ${JSON.stringify([slow, fast])}`);
    await ctx.close(); }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
