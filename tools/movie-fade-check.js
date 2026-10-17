// ムービーの前後の暗転の確認と画面録画：node tools/movie-fade-check.js [リポジトリ] [出力フォルダ] [VP9のwebmのフォルダ]
// webm のフォルダ：vearn.webm（大魔王バーンの登場）・vearn-taken.webm（撃破後）。このPCの Chromium は H.264 を流せないので、同じ動画の VP9 版に差し替える。
// 場面：A 登場ムービーを最後まで（30階の玉座の間に入る）／B 撃破後ムービーを最後まで → 亀裂 → 救援／C スキップ（連打）／D 読み込み失敗。幅360・390・430
// 確かめること（ページの中で毎コマ記録した「黒い幕の濃さ・動画の濃さ・動画の再生位置」から）：
//  入り：幕が黒くなりきるまで動画は見えない・その間は再生しない／動画が見え始めるときの再生位置はほぼ0秒／入力とターンは止まる
//  終わり：最後のコマのまま動画が先に暗くなり、そのあと幕が薄くなる（ゲーム画面が先に見えてから暗転、にならない）
//  白い画面・元の画面が途中で見えない（幕が黒のまま動画が消える）／戦闘開始・報酬・亀裂は1回だけ／連打で動かない・二重に流れない
//  曲：暗転に合わせて止まり、終わったら場面の曲へ。動画の音と重ならない
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'movie-fade'), WEBM = process.argv[4]; fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.mp4':'video/mp4'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8809);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  async function setup(w, h, opts = {}) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: opts.rec ? { dir: opts.rec, size: { width: w, height: h } } : undefined });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    await p.route('**/*.mp4', (route) => {
      const n = route.request().url().split('/').pop();
      if (opts.fail) return route.fulfill({ status: 404, body: '' });
      const file = n.startsWith('vearn-taken') ? 'vearn-taken.webm' : n.startsWith('vearn-intro') ? 'vearn.webm' : null;
      if (!file) return route.fulfill({ status: 404, body: '' });
      route.fulfill({ status: 200, contentType: 'video/webm', body: fs.readFileSync(path.join(WEBM, file)) });
    });
    await p.goto('http://localhost:8809/'); await p.waitForTimeout(400);
    await p.evaluate((seen) => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = 6;
      for (const k of ['croc', 'flame', 'kill', 'baran', 'mist']) V.story.defeated[k] = true;
      V.story.introSeen = seen ? { vearn: true } : {};
      G.depart(S, 4242); while (S.run.floor < 30) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run; r.player.hp = r.player.maxhp = 900; r.player.lvl = 30; r.floorItems = [];
      const A = r.bossFight; r.player.x = TS.Data.THRONE_ROOM.corridor.x; r.player.y = A.y + A.h; G.updateVision(r); TS.Save.save(S); }, !!opts.introSeen);
    await p.reload(); await p.waitForTimeout(600); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    for (let i = 0; i < 40 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(50); }
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    await p.waitForTimeout(400);
    // 毎コマの記録：幕（.movie）の濃さ・動画の濃さ・再生位置・止まっているか・ターン・曲を止めているか
    await p.evaluate(() => {
      window.__tl = []; const t0 = performance.now();
      const tick = () => { const root = document.querySelector('.movie'), v = root && root.querySelector('video'), r = TS.UI.S.run;
        window.__tl.push({ t: Math.round(performance.now() - t0), root: root ? +getComputedStyle(root).opacity : 0, vid: v ? +getComputedStyle(v).opacity : 0, ct: v ? v.currentTime : null,
          paused: v ? v.paused : null, ended: v ? v.ended : null, turn: r ? r.turn : null, hold: TS.Audio.bgmHold, closing: !!(root && root.classList.contains('movie-closing')) });
        requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    return { ctx, p };
  }
  const tl = (p) => p.evaluate(() => window.__tl);
  const waitGone = async (p, ms) => { for (let i = 0; i < ms / 100 && await p.$('.movie'); i++) await p.waitForTimeout(100); };
  const waitMovie = async (p, ms) => { for (let i = 0; i < ms / 100 && !(await p.$('.movie')); i++) await p.waitForTimeout(100); };
  // 入りの記録を調べる
  function checkIn(T, label) {
    const m = T.filter((x) => x.root > 0 || x.vid > 0);
    const firstVid = m.find((x) => x.vid > 0.02), firstRoot = m.find((x) => x.root > 0.02);
    const blackAt = m.find((x) => x.root > 0.98);
    chk(firstRoot && firstVid && blackAt && blackAt.t <= firstVid.t, `${label}：幕が黒くなりきってから動画が見え始める（黒 ${blackAt && blackAt.t - firstRoot.t}ms 後に動画）`);
    chk(blackAt && blackAt.t - firstRoot.t >= 330 && blackAt.t - firstRoot.t <= 700, `${label}：暗転は約0.5秒（${blackAt && blackAt.t - firstRoot.t}ms）`);
    const playBefore = m.filter((x) => x.t < firstVid.t && x.paused === false && x.ct > 0.05);
    chk(!playBefore.length, `${label}：黒い間は再生を進めない（冒頭を見逃さない）`);
    chk(firstVid.ct !== null && firstVid.ct <= 0.15, `${label}：見え始めたときの再生位置 ${firstVid.ct && firstVid.ct.toFixed(3)}秒`);
    const full = m.find((x) => x.vid > 0.98 && x.t > firstVid.t);
    chk(full && full.t - firstVid.t >= 280 && full.t - firstVid.t <= 600, `${label}：動画のフェードインは約0.4秒（${full && full.t - firstVid.t}ms）`);
    chk(m.filter((x) => x.t < firstVid.t).every((x) => x.vid <= 0.02), `${label}：用意の間に動画（白い画面・ポスター）が見えない`);
  }
  // 終わりの記録を調べる
  function checkOut(T, label, reason) {
    const c = T.filter((x) => x.closing);
    const start = c[0], vidZero = c.find((x) => x.vid <= 0.02), rootDown = c.find((x) => x.root < 0.97);
    chk(start && vidZero && rootDown && vidZero.t <= rootDown.t, `${label}：動画が先に暗くなり、そのあとゲーム画面が明るくなる（動画0まで ${vidZero && vidZero.t - start.t}ms・幕が薄くなり始め ${rootDown && rootDown.t - start.t}ms）`);
    chk(c.filter((x) => x.t < (rootDown ? rootDown.t : 1e9)).every((x) => x.root > 0.97), `${label}：動画が消えるまで幕は黒のまま（ゲーム画面は見えない）`);
    const last = T[T.length - 1];
    chk(last.root === 0, `${label}：最後は幕が消える`);
    const dur = rootDown && T.find((x) => x.t > rootDown.t && x.root === 0);
    chk(dur && dur.t - rootDown.t <= 700, `${label}：ゲーム画面へのフェードインは約0.5秒（${dur && dur.t - rootDown.t}ms）`);
    if (reason === 'ended') chk(start.ended || (start.ct > 9), `${label}：最後まで流してから暗転（${start.ct && start.ct.toFixed(2)}秒）`);
  }

  // A＋B：幅3つ。登場ムービーを最後まで → 戦い → 撃破 → 撃破後ムービーを最後まで → 亀裂・救援（390 は録画）
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]].filter(([w]) => !process.env.ONLY || +process.env.ONLY === w)) {
    const rec = w === 390 ? path.join(OUT, 'rec-full') : null;
    const { ctx, p } = await setup(w, h, { rec });
    const t0 = (await p.evaluate(() => TS.UI.S.run.turn));
    // 方向ボタンの位置（幕の上から、同じ所を指でたたく。幕が受け止めるので、後ろのボタンには届かない）
    const up = await p.evaluate(() => { const r = document.querySelector('#dpad [data-dir="up"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await p.tap('#dpad [data-dir="up"]');   // 広間へ入る → 登場ムービー
    // 暗転中の連打：方向ボタン・キー
    for (let i = 0; i < 4; i++) { await p.touchscreen.tap(up[0], up[1]); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(60); }
    await waitMovie(p, 3000);
    await p.waitForTimeout(1600);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `intro_playing_${w}.png`) });
    for (let i = 0; i < 4; i++) { await p.keyboard.press('ArrowUp'); await p.keyboard.press('Space'); await p.touchscreen.tap(up[0], up[1]); }
    const mid = await p.evaluate(() => ({ turn: TS.UI.S.run.turn, intro: TS.UI.S.run.bossFight.intro, movies: document.querySelectorAll('.movie').length, videos: document.querySelectorAll('video').length }));
    chk(mid.turn === t0 + 1 && mid.intro === 'pending' && mid.movies === 1 && mid.videos === 1, `${w} 登場ムービー中：連打でもターンは入室の1回だけ・動画は1つ ${JSON.stringify(mid)}`);
    await waitGone(p, 16000); await p.waitForTimeout(200);
    let T = await tl(p);
    checkIn(T, `${w} 登場（入り）`); checkOut(T, `${w} 登場（終わり）`, 'ended');
    const s1 = await p.evaluate(() => { const r = TS.UI.S.run; return { turn: r.turn, engaged: r.bossFight.engaged, starts: r.log.filter((l) => l.includes('との戦いが始まった')).length, hold: TS.Audio.bgmHold, bgm: TS.Audio.bgmName }; });
    chk(s1.engaged && s1.starts === 1 && !s1.hold && s1.bgm === 'boss', `${w} 登場のあと：戦いは1回だけ始まり、ボス戦の曲へ ${JSON.stringify(s1)}`);
    for (let i = 0; i < 40 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(50); }
    await p.waitForTimeout(300);
    // 撃破 → 撃破後ムービー
    await p.evaluate(() => { window.__tl.length = 0; const r = TS.UI.S.run, G = TS.Game, b = r.enemies.find((e) => e.boss); b.hp = 1; b.sleep = 99; b.charge = null; b.cds = { circle: 9, bird: 9, summon: 9 }; r.hazards = []; r.enemies = r.enemies.filter((e) => e === b);
      r.player.x = b.x; r.player.y = b.y + 1; G.updateVision(r); TS.UI.lockUntil = 0; });
    await p.waitForTimeout(300);
    await p.tap('#dpad [data-dir="up"]');
    for (let i = 0; i < 6; i++) { await p.touchscreen.tap(up[0], up[1] + 80); await p.waitForTimeout(80); }   // 撃破の演出・暗転の間の連打
    await waitMovie(p, 4000); await p.waitForTimeout(1500);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `taken_playing_${w}.png`) });
    await waitGone(p, 16000); await p.waitForTimeout(300);
    for (let i = 0; i < 40 && !(await p.$('.modal h2:has-text("ティウの救援")')); i++) { for (let j = 0; j < 20 && await p.$('.talk'); j++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(50); } await p.waitForTimeout(100); }
    T = await tl(p);
    checkIn(T, `${w} 撃破後（入り）`); checkOut(T, `${w} 撃破後（終わり）`, 'ended');
    const s2 = await p.evaluate(() => { const r = TS.UI.S.run; return { crack: !!r.crack, pm: r.postMovie || null, robes: r.floorItems.filter((f) => f.item && f.item.id === 'demon_robe').length, rescue: r.final.rescue,
      rescueOpen: !!document.querySelector('.modal h2') && document.querySelector('.modal h2').textContent.includes('ティウの救援'), pos: [r.player.x, r.player.y] }; });
    chk(s2.crack && !s2.pm && s2.robes === 1 && s2.rescue === 'pending' && s2.rescueOpen, `${w} 撃破後のあと：同じ部屋に亀裂・ローブ1つ・救援の画面 ${JSON.stringify(s2)}`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `after_taken_${w}.png`) });
    chk(!p.errs.length, `${w} エラーなし ${p.errs.join(' / ')}`);
    await ctx.close();
    if (rec) { const f = fs.readdirSync(rec).find((n) => n.endsWith('.webm')); if (f) fs.renameSync(path.join(rec, f), path.join(OUT, 'recording-full-390.webm')); }
  }
  // C：スキップ（連打）。録画する
  if (!process.env.ONLY) { const rec = path.join(OUT, 'rec-skip'); const { ctx, p } = await setup(390, 844, { rec });
    const t0 = await p.evaluate(() => TS.UI.S.run.turn);
    await p.tap('#dpad [data-dir="up"]'); await waitMovie(p, 3000); await p.waitForTimeout(2200);
    await p.evaluate(() => { const s = document.querySelector('.movie-skip'); s.click(); s.click(); s.click(); });
    for (let i = 0; i < 5; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(40); }
    await waitGone(p, 4000); await p.waitForTimeout(300);
    const T = await tl(p); checkOut(T, '390 スキップ', 'skip');
    const c = T.filter((x) => x.closing), start = c[0], vz = c.find((x) => x.vid <= 0.02);
    chk(vz && vz.t - start.t <= 400, `390 スキップ：短い暗転（${vz && vz.t - start.t}ms）`);
    const s = await p.evaluate(() => { const r = TS.UI.S.run; return { turn: r.turn, starts: r.log.filter((l) => l.includes('との戦いが始まった')).length, engaged: r.bossFight.engaged }; });
    chk(s.turn === t0 + 1 && s.starts === 1 && s.engaged, `390 スキップ連打：戦いは1回だけ・暗転中の連打でターンが進まない ${JSON.stringify(s)}`);
    await ctx.close(); const f = fs.readdirSync(rec).find((n) => n.endsWith('.webm')); if (f) fs.renameSync(path.join(rec, f), path.join(OUT, 'recording-skip-390.webm')); }
  // D：読み込み失敗（黒い画面で止まらない）
  if (!process.env.ONLY) { const { ctx, p } = await setup(390, 844, { fail: true });
    await p.tap('#dpad [data-dir="up"]'); await waitMovie(p, 3000);
    await waitGone(p, 6000); await p.waitForTimeout(300);
    const T = await tl(p), s = await p.evaluate(() => ({ engaged: TS.UI.S.run.bossFight.engaged, movie: !!document.querySelector('.movie'), starts: TS.UI.S.run.log.filter((l) => l.includes('との戦いが始まった')).length }));
    chk(!s.movie && s.engaged && s.starts === 1, `390 読み込み失敗：黒いまま止まらず、戦いが1回だけ始まる ${JSON.stringify(s)}`);
    chk(T.filter((x) => x.vid > 0.02).length === 0, '390 読み込み失敗：壊れた動画は映らない');
    await ctx.close(); }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
