// メタルスライムの逃げ方（2026年10月：逃げの地図。隅に追いつめられても、壁ぞい・たけの横をすり抜けて逃げる）の録画と確認
//   node tools/metal-flee-check.js [出力フォルダ]（既定 docs/monster-sprites-v1/）。幅390。たけが隅へ追いつめるように歩く
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'monster-sprites-v1');
const PORT = 8833;
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch(), W = 390, H = 844, dir = path.join(OUT, '_rec_flee');
  const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: { dir, size: { width: W, height: H } } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const t0 = Date.now();
  await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
  await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = 6;
    for (const k of ['croc', 'flame', 'kill', 'baran', 'mist']) V.story.defeated[k] = true;
    G.depart(S, 7171); while (S.run.floor < 24) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
    S.run.player.hp = S.run.player.maxhp = 3000; TS.Save.save(S); });
  await p.reload(); await p.waitForTimeout(700); await p.tap('#btn-continue'); await p.waitForTimeout(900);
  // いちばん大きい部屋の左上の隅にメタルスライム、斜めにたけ
  const room = await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); const S = TS.UI.S, r = S.run, G = TS.Game;
    const room = r.map.rooms.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
    r.enemies = []; r.floorItems = []; r.player.x = room.x + 1; r.player.y = room.y + 1;
    const e = G.makeEnemy(r, 'wisp', room.x, room.y); e.awake = true; e.hp = 99; r.enemies.push(e);
    G.updateVision(r); r.explored.fill(1); TS.UI.lockUntil = 0; TS.Render.clearFx(); return room; });
  const mark = Date.now();
  let adj = 0, moves = 0;
  for (let i = 0; i < 14; i++) {
    // たけはメタルスライムの方へ1歩（8方向）
    const d = await p.evaluate(() => { const r = TS.UI.S.run, e = r.enemies[0], P = r.player; if (!e) return null;
      const dx = Math.sign(e.x - P.x), dy = Math.sign(e.y - P.y); return { dx, dy }; });
    if (!d) break;
    const name = { '-1,-1': 'upleft', '0,-1': 'up', '1,-1': 'upright', '-1,0': 'left', '1,0': 'right', '-1,1': 'downleft', '0,1': 'down', '1,1': 'downright' }[d.dx + ',' + d.dy];
    const before = await p.evaluate(() => { const e = TS.UI.S.run.enemies[0]; return e.x + ',' + e.y; });
    await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.tap(`#dpad [data-dir="${name}"]`); await p.waitForTimeout(520);
    const st = await p.evaluate(() => { const r = TS.UI.S.run, e = r.enemies[0]; return e ? { pos: e.x + ',' + e.y, d: Math.max(Math.abs(e.x - r.player.x), Math.abs(e.y - r.player.y)) } : null; });
    if (!st) break;
    if (st.pos !== before) moves++;
    if (st.d <= 1) adj++;
  }
  const fin = await p.evaluate(() => { const r = TS.UI.S.run, e = r.enemies[0]; return { hp: r.player.hp, d: e ? Math.max(Math.abs(e.x - r.player.x), Math.abs(e.y - r.player.y)) : -1 }; });
  // たけが隣のメタルスライムへ歩くと攻撃になる（ミス・1・2）。追いつめても、すぐ隅から抜けて離れる
  chk(adj <= 2 && fin.hp === 3000 && fin.d >= 3, `隅から抜けて逃げる（14手で隣にいたのは ${adj} 回・最後の距離 ${fin.d}・たけは攻撃されない）`);
  chk(!errs.length, 'エラーなし ' + errs.join(' / '));
  await ctx.close();
  const f = fs.readdirSync(dir).find((n) => n.endsWith('.webm')), src = path.join(dir, f), ss = Math.max(0, (mark - t0) / 1000 - 0.3);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-i', src, '-vf', 'crop=390:440:0:110,scale=780:880:flags=neighbor', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', path.join(OUT, 'motion', 'metal_flee.mp4')]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close(); process.exit(ng ? 1 : 0);
})();
