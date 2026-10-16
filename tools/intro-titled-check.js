// 名前テロップ入りの登場ムービー4本（クロコダイン・フレイザード・キルバーン・バラン）の確認：
// node tools/intro-titled-check.js [リポジトリ] [出力フォルダ] [webmのフォルダ]（webm：crocodine.webm・flazzard.webm・killvearn.webm・baran.webm）
// このPCの Chromium（Playwright）は H.264 を再生できないので、同じ動画を VP9 にした webm を差し替えて流す（実際のスマホは mp4 をそのまま再生する）。
// 確かめること：ボスごとに正しい動画・縦横比を保って画面に収まる（テロップの左右が切れない）・動画の上に名前を重ねない・ゲームの曲は止まる・
// 最後まで／スキップ／読み込み失敗のどれでも戦いが1回だけ始まり、ボス戦の曲になり、操作が戻る
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'intro-titled'), WEBM = process.argv[4]; fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8808);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
const BOSSES = [{ id: 'croc', ch: 1, floor: 15, movie: 'crocodine', name: 'クロコダイン' }, { id: 'flame', ch: 2, floor: 20, movie: 'flazzard', name: 'フレイザード' }, { id: 'kill', ch: 3, floor: 25, movie: 'killvearn', name: 'キルバーン' }, { id: 'baran', ch: 4, floor: 30, movie: 'baran', name: 'バラン' }];
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  async function setup(B, w, h, mode) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    p.reqs = []; p.on('request', (r) => { if (/\.(mp4|webm)$/.test(r.url())) p.reqs.push(r.url().split('/').pop()); });
    await p.route('**/assets/movies/*-intro*.mp4', async (route) => {
      if (mode === '404') return route.fulfill({ status: 404, body: '' });
      const n = route.request().url().split('/').pop().replace(/-intro.*$/, '');
      route.fulfill({ status: 200, contentType: 'video/webm', body: fs.readFileSync(path.join(WEBM, n + '.webm')) });
    });
    await p.goto('http://localhost:8808/'); await p.waitForTimeout(400);
    await p.evaluate(([ch, floor]) => { localStorage.clear(); const G = TS.Game, S = G.newState(); S.village.story.introDone = true; S.village.seenIntro = true; S.village.story.chapter = ch;
      G.depart(S, 4242); while (S.run.floor < floor) { const r = S.run; r.enemies = r.enemies.filter((e) => e.boss); r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      S.run.player.hp = S.run.player.maxhp = 999; S.run.enemies = S.run.enemies.filter((e) => e.boss); TS.Save.save(S); }, [B.ch, B.floor]);
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await p.evaluate(() => { for (const x of document.querySelectorAll('#modal-root .back')) x.remove(); TS.UI.modals.length = 0; });
    // 入口の外の通路から部屋へ入る
    const d = await p.evaluate(() => { const run = TS.UI.S.run, A = run.bossFight, DG = TS.Dungeon, ds = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      for (let y = A.y - 1; y <= A.y + A.h; y++) for (let x = A.x - 1; x <= A.x + A.w; x++) { if (TS.Game.inArena(run, x, y) || !DG.passable(run.map, x, y)) continue;
        for (const [k, [dx, dy]] of Object.entries(ds)) if (TS.Game.inArena(run, x + dx, y + dy) && DG.passable(run.map, x + dx, y + dy) && !TS.Game.enemyAt(run, x + dx, y + dy)) { run.player.x = x; run.player.y = y; TS.Game.updateVision(run); return k; } } });
    await p.waitForTimeout(200);
    await p.keyboard.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[d]); await p.waitForTimeout(500);
    return { ctx, p };
  }
  const state = (p) => p.evaluate(() => { const run = TS.UI.S.run, A = run.bossFight, v = document.querySelector('.movie video');
    return { movie: !!document.querySelector('.movie'), src: v ? v.src.split('/').pop() : null, t: v ? v.currentTime : null, muted: v ? v.muted : null, intro: A.intro || null, engaged: A.engaged,
      hold: TS.Audio.bgmHold, bgm: TS.Audio.bgmName, turn: run.turn, starts: run.log.filter((l) => l.includes('との戦いが始まった')).length,
      msg: (() => { const e = document.querySelector('.movie-msg'); return e && !e.hidden ? e.textContent : null; })() }; });
  const waitGone = async (p, ms) => { for (let i = 0; i < ms / 100 && await p.$('.movie'); i++) await p.waitForTimeout(100); };
  const after = async (p, label) => {
    await p.waitForTimeout(400);
    const s = await state(p);
    chk(!s.movie && s.intro === 'done' && s.engaged && s.starts === 1 && !s.hold && s.bgm === 'boss', `${label}：戦いが1回だけ始まり、ボス戦の曲 ${JSON.stringify(s)}`);
    await p.evaluate(() => { for (const x of document.querySelectorAll('#modal-root .back')) x.remove(); TS.UI.modals.length = 0; });
    const t0 = s.turn; await p.keyboard.press('Space'); await p.waitForTimeout(300);
    chk((await state(p)).turn === t0 + 1, `${label}：操作が戻る`);
    chk(!p.errs.length, `${label}：エラーなし ${p.errs.join('|')}`);
  };
  for (const B of BOSSES) {
    // 最後まで（3つの幅）
    for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
      const { ctx, p } = await setup(B, w, h, 'real');
      await p.waitForTimeout(6800);   // 後半のテロップが出ている所
      const s = await state(p);
      const geo = await p.evaluate(() => { const v = document.querySelector('.movie video'), r = v.getBoundingClientRect(), vw = v.videoWidth, vh = v.videoHeight;
        const sc = Math.min(r.width / vw, r.height / vh); const shown = [vw * sc, vh * sc];
        const over = [...document.querySelectorAll('body *')].filter((e) => { if (e.closest('.movie')) return false; const cs = getComputedStyle(e); const z = +cs.zIndex || 0; const rr = e.getBoundingClientRect();
          return rr.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0 && z > 50 && e.textContent.trim(); }).map((e) => e.id || e.className);
        return { fit: getComputedStyle(v).objectFit, box: [r.width, r.height], vid: [vw, vh], shown: shown.map(Math.round), inside: shown[0] <= innerWidth + 0.5 && shown[1] <= innerHeight + 0.5, over,
          text: [...document.querySelectorAll('.movie *')].map((e) => e.hidden ? '' : (e.children.length ? '' : e.textContent.trim())).filter(Boolean) }; });
      chk(s.movie && s.src === B.movie + '-intro-titled.mp4' && s.t > 5 && s.hold && !s.muted, `${B.name} ${w}：正しい動画（${s.src}）・テロップの場面まで再生・ゲームの曲は止めて動画の音 ${JSON.stringify(s)}`);
      chk(geo.fit === 'contain' && geo.inside && geo.vid.join() === '720,1280' && geo.over.length === 0 && geo.text.join() === 'スキップ ▶▶', `${B.name} ${w}：縦横比を保って全体が画面内（テロップの左右が切れない）・動画の上に名前を重ねない ${JSON.stringify(geo)}`);
      if (w === 390) await p.screenshot({ path: path.join(OUT, `${B.movie}_${w}.png`) });
      await waitGone(p, 8000);
      await after(p, `${B.name} ${w} 最後まで`);
      await ctx.close();
    }
    // スキップ
    { const { ctx, p } = await setup(B, 390, 844, 'real'); await p.waitForTimeout(1200); await p.tap('.movie-skip'); await after(p, `${B.name} スキップ`); await ctx.close(); }
    // 読み込み失敗
    { const { ctx, p } = await setup(B, 390, 844, '404'); await p.waitForTimeout(400); const s = await state(p);
      chk(s.msg && s.msg.includes('読み込めませんでした'), `${B.name} 読み込み失敗：案内 ${s.msg}`); await waitGone(p, 3000); await after(p, `${B.name} 読み込み失敗`); await ctx.close(); }
  }
  // 古い動画を参照しない
  const refs = fs.readFileSync(path.join(ROOT, 'js', 'assets.js'), 'utf8');
  chk(!/crocodine-intro\.mp4|baran-intro\.mp4|crocodine-poster|baran-poster\.jpg/.test(refs) && !fs.existsSync(path.join(ROOT, 'assets/movies/crocodine-intro.mp4')) && !fs.existsSync(path.join(ROOT, 'assets/movies/baran-intro.mp4')), '古い動画のファイル・参照が残っていない');
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
