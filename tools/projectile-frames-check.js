// 飛び道具の二重表示の修正（ZIP projectile_frames_fix_v1）の確認：node tools/projectile-frames-check.js [出力フォルダ]（既定 docs/monster-sprites-v1/projectile/）
// 確かめること（PCのブラウザ、幅360・390・430。画像は390）：
//  リリパット・ベビーサタンの発動のコマに矢・火の玉が描かれていない。飛び道具は発動のコマに切り替わると同時に1回だけ、弓・伸ばした手の先から出る
//  左右反転したときは、出る位置も反転。準備 → 発動で足元・倍率は同じ（体の位置や大きさが急に変わらない）
//  画面の時間を止めて、準備（70ms）・発動の始まり（141ms）・矢が飛んでいる途中（190ms・240ms）を描いて切り出す
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'monster-sprites-v1', 'projectile');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8829;
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
const NAME = { monkey: 'リリパット', imp: 'ベビーサタン' };

async function boot(p) {
  await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
  await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 6;
    for (const k of ['croc', 'flame', 'kill', 'baran', 'mist']) st.defeated[k] = true;
    G.depart(S, 7171); while (S.run.floor < 20) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
    const r = S.run; r.player.hp = r.player.maxhp = 3000; r.player.lvl = 30; TS.Save.save(S); });
  await p.reload(); await p.waitForTimeout(700); await p.tap('#btn-continue'); await p.waitForTimeout(900);
  await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0;
    // 描画ループを止められるようにする（止めている間は、指定した時刻で1回だけ描く）
    const raf = window.requestAnimationFrame.bind(window); window.__raf = raf;
    window.requestAnimationFrame = (f) => (window.__pause ? (window.__pending = f, 0) : raf(f));
    // 描いた敵のコマを記録
    const o = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) { if (window.__rec && img && img.sheet) window.__rec.push(img); return o.call(this, img, ...a); }; });
}
const setup = (p, type, dx) => p.evaluate(([type, dx]) => { const S = TS.UI.S, r = S.run, G = TS.Game;
  const room = r.map.rooms.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
  r.enemies = []; r.floorItems = []; r.hazards = [];
  r.player.x = room.x + (dx > 0 ? 1 : room.w - 2); r.player.y = room.y + 2; r.player.hp = r.player.maxhp;
  const e = G.makeEnemy(r, type, r.player.x + dx, r.player.y); e.awake = true; e.cds = {}; r.enemies.push(e);
  G.updateVision(r); r.explored.fill(1); TS.UI.lockUntil = 0; TS.Render.clearFx(); }, [type, dx]);

(async () => {
  const b = await chromium.launch();
  const shots = [];
  for (const [W, H] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await boot(p);
    // 絵：最初の3コマは前と同じ、発動のコマだけ。足元・倍率はほかのコマと同じ
    const art = await p.evaluate(() => { const out = {};
      for (const k of ['monkey', 'imp']) { const E = TS.Sprites.art.enemySheet[k], bb = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
        out[k] = { prep: bb(E.prep), act: bb(E.act), same: E.prep.logical === E.act.logical && E.prep.footY === E.act.footY, muzzle: E.muzzle }; }
      return out; });
    for (const [k, v] of Object.entries(art)) chk(v.same && v.prep[3] === 83 && v.act[3] === 83 && Math.abs(v.prep[1] - v.act[1]) <= 7 && v.muzzle, `${W} ${NAME[k]}：準備と発動の倍率・足元が同じ（足元の行 ${v.prep[3]}・${v.act[3]}、頭 ${v.prep[1]}→${v.act[1]}）・発射位置 ${v.muzzle} ${JSON.stringify(v)}`);
    for (const type of ['monkey', 'imp']) for (const dx of [3, -3]) {
      await setup(p, type, dx);
      await p.waitForTimeout(250);
      let got = null;
      for (let i = 0; i < 4 && !got; i++) {
        const t0 = await p.evaluate(() => TS.UI.S.run.turn);
        await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press('Space');
        got = await p.evaluate(() => { const F = TS.Render.fx, d = F.filter((f) => f.t === 'dart'), ea = F.find((f) => f.t === 'eact');
          if (!d.length) return null; window.__pause = true; const e = TS.UI.S.run.enemies[0];
          return { darts: d.map((f) => ({ from: f.from, to: f.to, delay: f.delay })), ea: ea && { t0: ea.t0, prep: ea.prep, dur: ea.dur, flip: ea.flip }, e: [e.x, e.y], turn: TS.UI.S.run.turn }; });
        if (got) chk(got.turn === t0 + 1, `${W} ${NAME[type]}：1回の足踏みでターンは1つ`);
        else await p.waitForTimeout(900);
      }
      const side = dx > 0 ? '右' : '左';
      if (!got) { chk(false, `${W} ${NAME[type]}（たけの${side}）：撃たなかった`); continue; }
      const want = await p.evaluate(([type, flip]) => TS.Sprites.enemyMuzzle(TS.Data.ENEMIES[type].sprite, flip), [type, got.ea && got.ea.flip]);
      const d = got.darts[0], off = { x: d.from.x - got.e[0], y: d.from.y - got.e[1] };
      chk(got.darts.length === 1 && got.ea && d.delay === got.ea.prep, `${W} ${NAME[type]}（たけの${side}）：飛び道具は1回だけ、発動のコマに切り替わる時（${d.delay}ms）に出る`);
      chk(got.ea.flip === (dx > 0) && want && Math.abs(off.x - want.x) < 1e-9 && Math.abs(off.y - want.y) < 1e-9 && Math.sign(off.x) === -Math.sign(dx),
        `${W} ${NAME[type]}（たけの${side}）：発射位置は${type === 'monkey' ? '弓' : '手の先'}（マスの中心から x${off.x.toFixed(2)}・y${off.y.toFixed(2)} マス、たけの方）・反転 ${got.ea.flip}`);
      // 時間を止めて描く：準備・発動の始まり・飛んでいる途中
      const frames = [];
      for (const ms of [70, 141, 190, 240]) {
        const r = await p.evaluate(([t, crop]) => { const S = TS.UI.S, c = document.getElementById('dungeon-canvas'); window.__rec = [];
          TS.Render.drawDungeon(c, S, t); const recs = window.__rec; window.__rec = null;
          const E = TS.Sprites.art.enemySheet[TS.Data.ENEMIES[S.run.enemies[0].type].sprite];
          const which = recs.map((x) => (x === E.prep || x === E.flip.prep ? 'prep' : x === E.act || x === E.flip.act ? 'act' : 'idle'));
          if (!crop) return { which };
          const Wc = c.width, Hc = c.height, ts = Math.max(32, Math.floor(Math.min(Wc / 9.5, Hc / 7.5) / 16) * 16), p = S.run.player, e = S.run.enemies[0];
          const cx = Wc / 2 + (e.x - p.x) * ts, cy = Hc / 2 + (e.y - p.y) * ts, x0 = Math.round(Math.min(cx, Wc / 2) - ts * 1.6), y0 = Math.round(cy - ts * 1.9);
          const o = document.createElement('canvas'); o.width = Math.round(Math.abs(cx - Wc / 2) + ts * 3.2); o.height = Math.round(ts * 2.6);
          o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
          return { which, png: o.toDataURL('image/png') }; }, [got.ea.t0 + ms, W === 390]);
        frames.push([ms, r]);
      }
      const [f70, f141, f190] = frames.map((x) => x[1].which);
      chk(f70.includes('prep') && f141.includes('act') && f190.includes('act'), `${W} ${NAME[type]}（たけの${side}）：70ms 準備・141ms 発動・190ms 発動 ${f70}/${f141}/${f190}`);
      if (W === 390) for (const [ms, r] of frames) { const f = path.join(OUT, `${type}_${dx > 0 ? 'right' : 'left'}_${ms}.png`); fs.writeFileSync(f, Buffer.from(r.png.split(',')[1], 'base64')); shots.push(f); }
      await p.evaluate(() => { window.__pause = false; if (window.__pending) window.__raf(window.__pending); });
      await p.waitForTimeout(900);
    }
    chk(!errs.length, `${W} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  // 390 の切り出しを1枚に（行：リリパット右・左、ベビーサタン右・左。列：70・141・190・240ms）
  try {
    const rows = [];
    for (const type of ['monkey', 'imp']) for (const s of ['right', 'left']) {
      const fs4 = [70, 141, 190, 240].map((ms) => path.join(OUT, `${type}_${s}_${ms}.png`));
      const row = path.join(OUT, `_row_${type}_${s}.png`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...fs4.flatMap((f) => ['-i', f]), '-filter_complex', '[0][1][2][3]hstack=4,pad=iw+0:ih+8:0:0:0x202020', row]);
      rows.push(row);
    }
    // 幅がちがう行（右と左で切り出しの幅が同じなので、そのまま縦に並べる）
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...rows.flatMap((f) => ['-i', f]), '-filter_complex', `vstack=${rows.length}`, path.join(OUT, 'compare_390.png')]);
    for (const r of rows) fs.rmSync(r);
  } catch (e) { chk(false, '比較画像：' + e.message); }
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close();
  process.exit(ng ? 1 : 0);
})();
