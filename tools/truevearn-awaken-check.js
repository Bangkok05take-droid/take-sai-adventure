// 33階・真大魔王バーンの覚醒ムービー（9667.mp4）の確認と画面録画：node tools/truevearn-awaken-check.js [VP9のwebm] [出力フォルダ]
// このPCの Chromium は H.264 を流せないので、同じ動画の VP9 版（ffmpeg -i assets/movies/truevearn-awaken.mp4 -c:v libvpx-vp9 -b:v 1M -deadline realtime -cpu-used 8 -c:a libopus x.webm）に差し替える。
// 場面（幅360・390・430。390は録画）：
//  A 32階の階段を降りる → 暗転 → ムービーを最後まで → 33階の白い異空間で戦い開始
//  B スキップ（連打）／C 読み込み失敗／D ムービーの途中で読み込み直し／E 見たことがある（ムービーなしで、着いたらすぐ戦い）
// 確かめること：33階の画面が動画の前に一瞬も見えない（毎コマ記録した黒い幕の濃さ）・動画の全体が見える（切らない・引き伸ばさない）・
//  再生中は入力・ターン・敵が止まる・曲は止まり動画の音だけ・終わったらボス戦の曲・戦闘開始は1回だけ・亀裂・ミスト・老バーンが出ない
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), WEBM = process.argv[2], OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'truevearn-awaken');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8823;
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  async function setup(w, h, opts = {}) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: opts.rec ? { dir: opts.rec, size: { width: w, height: h } } : undefined });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    await p.route('**/*.mp4', (route) => {
      if (opts.fail || !route.request().url().includes('truevearn-awaken')) return route.fulfill({ status: 404, body: '' });
      route.fulfill({ status: 200, contentType: 'video/webm', body: fs.readFileSync(WEBM) });
    });
    await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
    // 最終章：30階の大魔王バーンは倒した（亀裂から31階へ）。32階の下り階段のとなりに立つ
    await p.evaluate((seen) => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 6;
      for (const k of ['croc', 'flame', 'kill', 'baran', 'mist', 'vearn']) st.defeated[k] = true;
      st.introSeen = seen ? { truevearn: true, truevearnAwaken: true } : { truevearn: true };   // truevearn：以前の仮の会話を見た記録（正式の動画は別に1回流す）
      G.depart(S, 6161); const r = S.run; r.final.skip.vearn = true;
      while (r.floor < 32) { const t = r.stairs || r.crack; r.player.x = t.x; r.player.y = t.y; G.act(S, { type: 'descend' }); }
      r.player.hp = r.player.maxhp = 900; r.player.lvl = 30; r.player.hp = 700;
      r.enemies = []; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.updateVision(r); TS.Save.save(S); }, !!opts.seen);
    await p.reload(); await p.waitForTimeout(600); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    await p.waitForTimeout(300);
    // 毎コマ：幕の濃さ（場面転換の黒・ムービーの黒の濃いほう）・動画の濃さ・階・戦いの状態・曲
    await p.evaluate(() => {
      window.__tl = []; const t0 = performance.now();
      const tick = () => { const c = document.querySelector('.scene-cover'), root = document.querySelector('.movie'), v = root && root.querySelector('video'), r = TS.UI.S.run;
        const cov = Math.max(c ? +getComputedStyle(c).opacity : 0, root ? +getComputedStyle(root).opacity : 0);
        window.__tl.push({ t: Math.round(performance.now() - t0), cov, vid: v ? +getComputedStyle(v).opacity : 0, ct: v ? v.currentTime : null, floor: r ? r.floor : 0,
          engaged: !!(r && r.bossFight && r.bossFight.engaged), turn: r ? r.turn : null, hold: TS.Audio.bgmHold, closing: !!(root && root.classList.contains('movie-closing')) });
        requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    return { ctx, p };
  }
  const descend = async (p) => { await p.tap('#b-foot'); await p.waitForTimeout(200); await p.tap('.modal-buttons button.primary'); };
  const waitMovie = async (p, ms) => { for (let i = 0; i < ms / 100 && !(await p.$('.movie')); i++) await p.waitForTimeout(100); };
  const waitGone = async (p, ms) => { for (let i = 0; i < ms / 100 && await p.$('.movie'); i++) await p.waitForTimeout(100); };
  const state = (p) => p.evaluate(() => { const r = TS.UI.S.run, A = r.bossFight, F = TS.Game.F(r), b = r.enemies.find((e) => e.boss);
    return { floor: r.floor, turn: r.turn, theme: F.theme, engaged: !!(A && A.engaged), intro: A && A.intro, inArena: TS.Game.inArena(r, r.player.x, r.player.y),
      enemies: r.enemies.map((e) => e.type), crack: !!r.crack, boss: b && { x: b.x, y: b.y, hp: b.hp, max: b.maxhp }, defeated: !!TS.UI.S.village.story.defeated.truevearn,
      starts: r.log.filter((l) => l.includes('との戦いが始まった')).length, seen: !!TS.UI.S.village.story.introSeen.truevearnAwaken, hold: TS.Audio.bgmHold, bgm: TS.Audio.bgmName, p: [r.player.x, r.player.y] }; });
  // 33階（戦いの前）の画面が、幕なしで見えたコマがないか
  const leak = (T) => T.filter((x) => x.floor === 33 && !x.engaged && x.cov < 0.98);
  const after = (T) => T.filter((x) => x.floor === 33 && x.engaged);

  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const rec = w === 390 ? path.join(OUT, 'rec') : null;
    // ---------- A 最後まで ----------
    {
      const { ctx, p } = await setup(w, h, { rec });
      const s0 = await state(p);
      await p.screenshot({ path: path.join(OUT, `A0_floor32_${w}.jpg`), quality: 80 });
      await descend(p);
      await p.waitForTimeout(250); await p.screenshot({ path: path.join(OUT, `A1_fade_${w}.jpg`), quality: 80 });
      await waitMovie(p, 3000); await p.waitForTimeout(2500);
      const mid = await p.evaluate(() => { const v = document.querySelector('.movie video'), cs = v && getComputedStyle(v), r = v && v.getBoundingClientRect();
        return v && { vw: v.videoWidth, vh: v.videoHeight, fit: cs.objectFit, box: [Math.round(r.width), Math.round(r.height)], vp: [innerWidth, innerHeight], muted: v.muted, paused: v.paused, ct: v.currentTime }; });
      await p.screenshot({ path: path.join(OUT, `A2_movie_${w}.jpg`), quality: 80 });
      // 再生中の入力：動かない・ターンも敵も進まない
      const s1 = await state(p);
      for (let i = 0; i < 4; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(60); }
      await p.mouse.click(w / 2, h * 0.75); await p.waitForTimeout(100);
      const s2 = await state(p);
      chk(mid && mid.vw === 720 && mid.vh === 1280 && mid.fit === 'contain' && mid.box[0] === mid.vp[0] && mid.box[1] === mid.vp[1], `${w} 動画の全体を表示（720×1280、縦横比そのまま・切らない） ${JSON.stringify(mid)}`);
      chk(mid && !mid.paused && mid.ct > 0.5 && !mid.muted, `${w} 動画は音つきで再生中 ${JSON.stringify(mid)}`);
      chk(s1.floor === 33 && s1.intro === 'pending' && !s1.engaged && s1.inArena && s2.turn === s1.turn && JSON.stringify(s2.boss) === JSON.stringify(s1.boss) && JSON.stringify(s2.p) === JSON.stringify(s1.p), `${w} 再生中は移動・ターン・敵が止まる ${JSON.stringify({ s1, s2 })}`);
      chk(s1.hold === true, `${w} 再生中はダンジョンの曲を止める（bgmHold）`);
      await waitGone(p, 16000); await p.waitForTimeout(700);
      const s3 = await state(p);
      await p.screenshot({ path: path.join(OUT, `A3_battle_${w}.jpg`), quality: 85 });
      const T = await p.evaluate(() => window.__tl);
      const L = leak(T), first33 = T.find((x) => x.floor === 33);
      chk(!L.length, `${w} 動画の前・途中に、操作できる33階の画面やボス戦が見えたコマがない（${L.length}コマ）`);
      chk(first33 && first33.cov >= 0.98, `${w} 33階を作った時点ですでに黒（32階から暗転） cov=${first33 && first33.cov}`);
      const fadeStart = T.find((x) => x.cov > 0.02), black = T.find((x) => x.cov > 0.98);
      chk(fadeStart && black && black.t - fadeStart.t >= 300 && black.t - fadeStart.t <= 750, `${w} 32階から黒への暗転 約0.5秒（${black && fadeStart && black.t - fadeStart.t}ms）`);
      const firstVid = T.find((x) => x.vid > 0.02);
      chk(firstVid && firstVid.ct !== null && firstVid.ct < 0.4, `${w} 動画は冒頭から見える（見え始めの再生位置 ${firstVid && firstVid.ct}秒）`);
      const A1 = after(T), revealT = A1.find((x) => x.cov < 0.02);
      chk(A1.length && A1[0].cov >= 0.98 && revealT && revealT.t - A1[0].t <= 1200, `${w} 動画の終わりから戦いへ短い暗転でつなぐ（${revealT && revealT.t - A1[0].t}ms）`);
      chk(s3.engaged && s3.starts === 1 && s3.seen && !s3.defeated && s3.boss && s3.boss.hp === s3.boss.max, `${w} 終わったら真大魔王バーン戦が1回だけ始まる（倒した扱いにはならない） ${JSON.stringify(s3)}`);
      chk(s3.theme === 'void' && s3.inArena, `${w} 33階は白い異空間（地域 void）、たけはボス部屋の中 ${s3.theme}`);
      chk(JSON.stringify(s3.enemies) === '["truevearn"]' && !s3.crack, `${w} 33階に亀裂・ミストバーン・老バーンは出ない ${JSON.stringify(s3.enemies)} crack=${s3.crack}`);
      chk(!s3.hold && s3.bgm === 'boss', `${w} 終わったらボス戦の曲 ${s3.bgm} hold=${s3.hold}`);
      // 戦いが動く：1手でボスが動く／予告が出る
      for (let i = 0; i < 3; i++) { await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press('Space'); await p.waitForTimeout(500); }
      const s4 = await state(p);
      chk(s4.turn > s3.turn, `${w} 戦いの手番が進む（${s3.turn}→${s4.turn}）`);
      await p.screenshot({ path: path.join(OUT, `A4_battle_turns_${w}.jpg`), quality: 85 });
      chk(!p.errs.length, `${w} A エラーなし ${p.errs.join(' / ')}`);
      await ctx.close();
      if (rec) { const f = fs.readdirSync(rec).find((n) => n.endsWith('.webm')); if (f) fs.renameSync(path.join(rec, f), path.join(OUT, `truevearn-awaken-${w}.webm`)); fs.rmSync(rec, { recursive: true, force: true }); }
    }
    // ---------- B スキップ（連打） ----------
    {
      const { ctx, p } = await setup(w, h);
      await descend(p); await waitMovie(p, 3000); await p.waitForTimeout(1500);
      for (let i = 0; i < 4; i++) { const s = await p.$('.movie-skip'); if (s) await s.click({ force: true }).catch(() => {}); await p.waitForTimeout(40); }
      await waitGone(p, 4000); await p.waitForTimeout(600);
      const s = await state(p), T = await p.evaluate(() => window.__tl);
      chk(s.engaged && s.starts === 1 && s.seen && !s.defeated && s.boss.hp === s.boss.max && !leak(T).length, `${w} B スキップ：戦いが1回だけ始まる・倒した扱いにならない・33階が先に見えない ${JSON.stringify({ starts: s.starts, hp: s.boss.hp, leak: leak(T).length })}`);
      chk(!p.errs.length, `${w} B エラーなし ${p.errs.join(' / ')}`);
      await ctx.close();
    }
    // ---------- C 読み込み失敗 ----------
    {
      const { ctx, p } = await setup(w, h, { fail: true });
      await descend(p); await waitMovie(p, 3000); await waitGone(p, 6000); await p.waitForTimeout(600);
      const s = await state(p), T = await p.evaluate(() => window.__tl);
      chk(s.engaged && s.starts === 1 && !s.defeated && !leak(T).length, `${w} C 読み込み失敗：戦いが1回だけ始まる・33階が先に見えない ${JSON.stringify({ starts: s.starts, leak: leak(T).length })}`);
      chk(!p.errs.length, `${w} C エラーなし ${p.errs.join(' / ')}`);
      await ctx.close();
    }
    // ---------- D 途中で読み込み直す ----------
    {
      const { ctx, p } = await setup(w, h);
      await descend(p); await waitMovie(p, 3000); await p.waitForTimeout(1500);
      const s0 = await state(p);
      await p.reload(); await p.waitForTimeout(600);
      await p.evaluate(() => { window.__tl2 = []; const t0 = performance.now(); const tick = () => { const c = document.querySelector('.scene-cover'), root = document.querySelector('.movie'), r = TS.UI.S && TS.UI.S.run;
        window.__tl2.push({ t: Math.round(performance.now() - t0), cov: Math.max(c ? +getComputedStyle(c).opacity : 0, root ? +getComputedStyle(root).opacity : 0), floor: r ? r.floor : 0, engaged: !!(r && r.bossFight && r.bossFight.engaged), dungeon: !!document.querySelector('#screen-dungeon.active') }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      await p.tap('#btn-continue'); await waitMovie(p, 3000);
      const again = !!(await p.$('.movie'));
      for (let i = 0; i < 3; i++) { const s = await p.$('.movie-skip'); if (s) await s.click({ force: true }).catch(() => {}); await p.waitForTimeout(40); }
      await waitGone(p, 4000); await p.waitForTimeout(600);
      const s = await state(p), T2 = await p.evaluate(() => window.__tl2);
      const leak2 = T2.filter((x) => x.dungeon && x.floor === 33 && !x.engaged && x.cov < 0.98);   // ダンジョンの画面に切り替わってから
      chk(s0.intro === 'pending' && again && s.engaged && s.starts === 1 && s.boss.hp === s.boss.max, `${w} D 途中で読み込み直す：ムービーを最初から流し直し、戦いは1回だけ ${JSON.stringify({ again, starts: s.starts })}`);
      chk(!leak2.length, `${w} D 読み込み直しても、戦いの前の33階の画面は見えない（${leak2.length}コマ）`);
      chk(!p.errs.length, `${w} D エラーなし ${p.errs.join(' / ')}`);
      await ctx.close();
    }
    // ---------- E 見たことがある：ムービーなしで、着いたらすぐ戦い ----------
    {
      const { ctx, p } = await setup(w, h, { seen: true });
      await descend(p); await p.waitForTimeout(1200);
      const s = await state(p), mv = !!(await p.$('.movie'));
      chk(!mv && s.floor === 33 && s.engaged && s.starts === 1 && s.inArena && s.bgm === 'boss', `${w} E 見たことがある：ムービーなしで着いたらすぐ戦い（歩かなくてよい） ${JSON.stringify({ mv, engaged: s.engaged, inArena: s.inArena, bgm: s.bgm })}`);
      if (w === 390) await p.screenshot({ path: path.join(OUT, `E_seen_battle_${w}.jpg`), quality: 85 });
      chk(!p.errs.length, `${w} E エラーなし ${p.errs.join(' / ')}`);
      await ctx.close();
    }
  }
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close();
  process.exit(ng ? 1 : 0);
})();
