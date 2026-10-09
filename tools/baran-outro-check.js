// 通常のバランの撃破後ムービー（ミストバーンが連れ去る）の確認：node tools/baran-outro-check.js [リポジトリ] [出力フォルダ] [VP9のwebm]
// このPCの Chromium（Playwright）は H.264 を再生できないので、同じ動画を VP9 にした webm を差し替えて流す（実際のスマホは mp4 をそのまま再生する）。
// webm の作り方：ffmpeg -i assets/movies/baran-taken.mp4 -c:v libvpx-vp9 -b:v 1M -deadline realtime -cpu-used 8 -c:a libopus /tmp/baran-taken.webm
// 確かめること：撃破 → 撃破の演出 → ムービー（操作・ターン・曲は止まる）→ 最後まで／スキップ／読み込み失敗のどれでも撃破後の会話へ → 曲と操作が戻る。
// 報酬・帰還口・撃破の記録は1回だけ。バランは戻らない。二重に流れない。途中で読み込み直すと流し直す。クロコダインには無い
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'baran-outro'), WEBM = process.argv[4]; fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8805);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  async function setup(w, h, opts = {}) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    await p.route('**/baran-taken.mp4', async (route) => {
      if (opts.route === '404') return route.fulfill({ status: 404, body: '' });
      route.fulfill({ status: 200, contentType: 'video/webm', body: fs.readFileSync(WEBM) });
    });
    await p.goto('http://localhost:8805/'); await p.waitForTimeout(400);
    await p.evaluate(([ch, goal]) => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = ch;
      V.story.introSeen = { croc: true, baran: true };   // 登場ムービーは見た扱い（ここでは撃破後だけを見る）
      G.depart(S, 5151);
      while (S.run.floor < goal) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run; r.enemies = r.enemies.filter((e) => e.boss); r.player.hp = r.player.maxhp = 9999;
      const bo = r.enemies[0]; bo.hp = 1; bo.sleep = 99;
      for (const [d, [dx, dy]] of Object.entries(G.DIRS)) { const x = bo.x - dx, y = bo.y - dy;
        if (['up', 'down', 'left', 'right'].includes(d) && G.canStep(r.map, x, y, dx, dy) && !G.enemyAt(r, x, y)) { r.player.x = x; r.player.y = y; r.dirToBoss = d; break; } }
      G.updateVision(r); G.checkBossRoom(S, []); bo.hold = 0; TS.Save.save(S); }, [opts.ch || 4, opts.ch === 1 ? 15 : 30]);
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    for (let i = 0; i < 40 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(50); }
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    await p.waitForTimeout(200);
    return { ctx, p };
  }
  const st = (p) => p.evaluate(() => { const S = TS.UI.S, r = S.run, v = document.querySelector('.movie video');
    return { movie: !!document.querySelector('.movie'), videoSrc: v ? v.src.split('/').pop() : null, pm: r.postMovie || null, turn: r.turn, pos: [r.player.x, r.player.y],
      baran: r.enemies.some((e) => e.type === 'baran'), hold: TS.Audio.bgmHold, bgm: TS.Audio.bgmName, talk: (() => { const t = document.querySelector('.talk'); return t ? t.textContent.slice(0, 30) : null; })(),
      rewards: r.floorItems.filter((f) => f.item && f.item.bossReward).map((f) => f.item.id).sort().join(), portal: !!r.portal, kills: S.village.bossKills.baran || 0,
      saved: (() => { const d = TS.Save.load(); return d && d.run ? d.run.postMovie || null : 'x'; })(), msg: (() => { const e = document.querySelector('.movie-msg'); return e && !e.hidden ? e.textContent : null; })(),
      t: v ? v.currentTime : null, muted: v ? v.muted : null }; });
  const kill = async (p) => { const d = await p.evaluate(() => TS.UI.S.run.dirToBoss); await p.tap(`#dpad [data-dir="${d}"]`); };
  const waitMovie = async (p, ms) => { for (let i = 0; i < ms / 100 && !(await p.$('.movie')); i++) await p.waitForTimeout(100); };
  const waitGone = async (p, ms) => { for (let i = 0; i < ms / 100 && await p.$('.movie'); i++) await p.waitForTimeout(100); };
  // 撃破後の会話を閉じて、操作が戻るか（1歩動いてターンが進む）
  const after = async (p, w, label) => {
    await p.waitForTimeout(400);
    const s = await st(p);
    chk(!s.movie && !s.pm && s.saved === null && s.talk && s.talk.includes('その剣に'), `${w} ${label}：撃破後の会話へ進む・保存も済み ${JSON.stringify(s)}`);
    for (let i = 0; i < 40 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(50); }
    await p.waitForTimeout(400);
    const t0 = (await st(p)).turn;
    const moved = await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game; for (const [d, [dx, dy]] of Object.entries(G.DIRS)) if (['up', 'down', 'left', 'right'].includes(d) && G.canStep(r.map, r.player.x, r.player.y, dx, dy) && !G.enemyAt(r, r.player.x + dx, r.player.y + dy) && !G.itemAt(r, r.player.x + dx, r.player.y + dy) && !(r.portal && r.portal.x === r.player.x + dx && r.portal.y === r.player.y + dy)) return d; });
    await p.tap(`#dpad [data-dir="${moved}"]`); await p.waitForTimeout(350);
    const s2 = await st(p);
    chk(s2.turn === t0 + 1 && !s2.hold && s2.bgm === 'dungeon' || (s2.turn === t0 + 1 && !s2.hold), `${w} ${label}：操作と曲が戻る（1歩でターンが進む・曲 ${s2.bgm}）`);
    chk(!s2.baran && s2.rewards === 'baran_emblem,shinma_sword' && s2.portal && s2.kills === 1, `${w} ${label}：バランは戻らない・報酬2つ・帰還口・撃破1回 ${JSON.stringify(s2)}`);
    chk(!p.errs.length, `${w} ${label}：エラーなし ${p.errs.join(' / ')}`);
  };

  // 1. 最後まで見る（3つの幅）
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const { ctx, p } = await setup(w, h);
    await kill(p); await p.waitForTimeout(250);
    const s0 = await st(p);
    chk(!s0.baran && s0.pm === 'baranTaken' && s0.saved === 'baranTaken' && !s0.movie && s0.hold && s0.rewards === 'baran_emblem,shinma_sword' && s0.portal, `${w} 撃破：報酬・帰還口は撃破のときに済み・ムービーの予約（保存済み）・曲は止める・まず撃破の演出 ${JSON.stringify(s0)}`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `defeat_effect_${w}.png`) });
    // 撃破の演出からムービーまでの間の入力は受けない
    await p.tap('#dpad [data-dir="up"]'); await p.keyboard.press('Space'); await p.waitForTimeout(200);
    chk((await st(p)).turn === s0.turn, `${w} 演出からムービーまでの間：操作できない`);
    await waitMovie(p, 4000); await p.waitForTimeout(1500);
    const s1 = await st(p);
    const box = await p.evaluate(() => { const v = document.querySelector('.movie video'), r = v.getBoundingClientRect(); return { r: [r.width, r.height], fit: getComputedStyle(v).objectFit, vw: innerWidth, vh: innerHeight, vid: [v.videoWidth, v.videoHeight] }; });
    chk(s1.movie && s1.videoSrc === 'baran-taken.mp4' && s1.t > 0.3 && !s1.muted && s1.hold, `${w} ムービーが流れる（動画の音あり・ゲームの曲は止める） ${JSON.stringify(s1)}`);
    chk(box.fit === 'contain' && box.r[0] === box.vw && box.r[1] === box.vh, `${w} 縦横比を保って全体を見せる（contain） ${JSON.stringify(box)}`);
    if (w !== 360) await p.screenshot({ path: path.join(OUT, `movie_${w}.png`) });
    for (const k of ['ArrowUp', 'ArrowLeft', 'Space', 'ArrowDown']) await p.keyboard.press(k);
    await p.dispatchEvent('#dpad [data-dir="up"]', 'pointerdown', { pointerId: 3 }); await p.waitForTimeout(500); await p.dispatchEvent('#dpad [data-dir="up"]', 'pointerup', { pointerId: 3 });
    const s2 = await st(p);
    chk(s2.turn === s0.turn && s2.pos.join() === s0.pos.join() && s2.movie, `${w} ムービー中：キー・方向ボタンでターンも位置も変わらない`);
    await waitGone(p, 14000);
    await after(p, w, '最後まで');
    if (w === 390) await p.screenshot({ path: path.join(OUT, `after_${w}.png`) });
    await ctx.close();
  }
  // 2. スキップ（連打しても1回）
  { const { ctx, p } = await setup(390, 844); await kill(p); await waitMovie(p, 4000); await p.waitForTimeout(800);
    await p.evaluate(() => { const s = document.querySelector('.movie-skip'); s.click(); s.click(); s.click(); });
    await p.waitForTimeout(200);
    chk(await p.evaluate(() => !document.querySelector('.movie') && !document.querySelector('video') && document.querySelectorAll('.talk').length === 1), '390 スキップ連打：1回だけ終わり、動画も残らない');
    await after(p, 390, 'スキップ'); await ctx.close(); }
  // 3. 読み込み失敗（404）
  { const { ctx, p } = await setup(390, 844, { route: '404' }); await kill(p); await waitMovie(p, 4000); await p.waitForTimeout(400);
    const s = await st(p); chk(s.msg && s.msg.includes('続きへ進みます'), `390 読み込み失敗：案内 ${s.msg}`);
    await waitGone(p, 3000); await after(p, 390, '読み込み失敗'); await ctx.close(); }
  // 4. ムービーの途中で読み込み直す → 「つづきから」で最初から流し直す → スキップ → 会話。報酬は増えない
  { const { ctx, p } = await setup(390, 844); await kill(p); await waitMovie(p, 4000); await p.waitForTimeout(1000);
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await waitMovie(p, 3000); await p.waitForTimeout(800);
    const s = await st(p); chk(s.movie && s.pm === 'baranTaken' && !s.baran, `390 読み込み直し：ムービーを流し直す ${JSON.stringify(s)}`);
    await p.tap('.movie-skip'); await after(p, 390, '読み込み直し'); await ctx.close(); }
  // 5. クロコダイン（ほかのボス）は撃破後ムービー無し
  { const { ctx, p } = await setup(390, 844, { ch: 1 }); await kill(p); await p.waitForTimeout(2500);
    const s = await p.evaluate(() => ({ movie: !!document.querySelector('.movie'), pm: TS.UI.S.run.postMovie || null }));
    chk(!s.movie && !s.pm, `390 クロコダイン：撃破後ムービーは流れない ${JSON.stringify(s)}`); await ctx.close(); }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
