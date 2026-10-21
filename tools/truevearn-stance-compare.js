// 天地魔闘の構え（正面 v2）：同じ場所・同じ画面の倍率で「通常 → 構え → 通常」を比べる（PCのブラウザ、幅360・390・430。390は動画も）
//   node tools/truevearn-stance-compare.js [出力フォルダ]（既定 docs/truevearn-stance-v2/）
//   実際のゲームの処理で構えさせる（たけが2マス以内で足踏み → 構え。そのまま待つと4行動で解ける）。
//   確かめること：構えのポーズの絵を、通常の絵と同じ大きさ・同じ足元で描く（体を縮めない・足が浮かない・手や角が切れない）、
//   「構」の文字なし・表示は技名だけ、構えが解けると通常の絵に戻る。エフェクトなし（構えの光を止めた）の比較も撮る
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'truevearn-stance-v2');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8841;
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
const closeAll = (p) => p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
// 1回だけ描かせて、バーンの絵（通常・構え）をどこに、どの大きさで描いたかと、「構」の文字の有無を調べる
const probe = (p) => p.evaluate(() => { const SP = TS.Sprites, pose = SP.bossPose('truevearn', 'stance'), idle = SP.art.bosses.truevearn, out = { kan: false };
  const o = CanvasRenderingContext2D.prototype.drawImage, ot = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.drawImage = function (im, ...a) { if ((im === pose || im === idle) && a.length >= 4) { const r = a.slice(-4).map(Math.round); (out.all = out.all || []).push(r); if (!out.rect || r[2] > out.rect[2]) { out.img = im === pose ? 'stance' : 'idle'; out.smooth = this.imageSmoothingEnabled; out.rect = r; } } return o.call(this, im, ...a); };
  CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { if (String(t) === '構') out.kan = true; return ot.call(this, t, ...a); };
  const bo0 = TS.UI.S.run.enemies.find((e) => e.boss), tFix = 520 * (2 * 99999 - bo0.id) + 10;   // 待機の上下動（1ドット）が無い時刻で比べる
  try { TS.Render.drawDungeon(document.getElementById('dungeon-canvas'), TS.UI.S, tFix); } finally { CanvasRenderingContext2D.prototype.drawImage = o; CanvasRenderingContext2D.prototype.fillText = ot; }
  const bo = TS.UI.S.run.enemies.find((e) => e.boss); out.stance = bo.stance || 0;
  const cv = document.getElementById('dungeon-canvas'), cr = cv.getBoundingClientRect(); out.canvas = { x: cr.left, y: cr.top, s: cr.width / cv.width }; out.pos = [bo.x, bo.y]; return out; });

(async () => {
  const b = await chromium.launch();
  const crops = [];
  for (const [W, H] of [[360, 780], [390, 844], [430, 932]]) {
    const rec = W === 390, rdir = path.join(OUT, '_rec');
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: rec ? { dir: rdir, size: { width: W, height: H } } : undefined });
    const tStart = Date.now();
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/*.mp4', (route) => route.fulfill({ status: 404, body: '' }));
    // STANCE_IMG=候補のPNG：ゲームの構えの絵をこの確認の間だけ差し替える（ゲームのファイルは変えない。候補の見え方の確認用）
    if (process.env.STANCE_IMG) await p.route('**/assets/bosses/truevearn-stance.png', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(process.env.STANCE_IMG) }));
    await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 6;
      for (const k of ['croc', 'flame', 'kill', 'baran', 'mist', 'vearn']) st.defeated[k] = true;
      st.introSeen = { truevearn: true, truevearnAwaken: true };
      G.depart(S, 6161); const r = S.run; r.final.skip.vearn = true;
      while (r.floor < 33) { const t = r.stairs || r.crack; r.enemies = r.enemies.filter((e) => e.boss); r.player.x = t.x; r.player.y = t.y; G.act(S, { type: 'descend' }); }
      r.player.hp = r.player.maxhp = 9999; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(700);
    await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeAll(p);
    // バーンは広間の中央、たけは2マス下（構えの届く距離。隣ではないので体が重ならない）
    await p.evaluate(() => { const r = TS.UI.S.run, A = r.bossFight, bo = r.enemies.find((e) => e.boss); A.engaged = true; A.intro = 'done';
      bo.charge = null; bo.stance = 0; bo.hold = 0; bo.rest = 0; bo.cds = { end: 99, wall: 99, phoenix: 99, stance: 1 }; bo.aware = true;
      r.player.x = bo.x; r.player.y = bo.y + 2; r.player.dir = 'up'; TS.Game.updateVision(r); });
    await p.waitForTimeout(500);
    const t0 = Date.now();
    const shot = async (name) => { const f = path.join(OUT, `${name}_${W}.png`); await p.screenshot({ path: f }); return f; };
    const noFx = (on) => p.evaluate((on) => { if (on) { TS.FX._glow = TS.FX._glow || TS.FX.stanceGlow; TS.FX.stanceGlow = () => {}; } else if (TS.FX._glow) TS.FX.stanceGlow = TS.FX._glow; }, on);
    // ① 通常
    const a = await probe(p); const fA = await shot('1-idle'); await noFx(true); const fA2 = await shot('1-idle-nofx'); await noFx(false);
    // ② 構え（実際のゲームの処理：足踏み1回で構える）
    await p.waitForTimeout(400);
    await p.evaluate(() => TS.UI.doAct({ type: 'wait' })); await p.waitForTimeout(160);
    const toast = await p.evaluate(() => document.getElementById('toast').textContent);
    await p.waitForTimeout(1500); await closeAll(p);   // 技名の表示が消えてから撮る（絵が隠れないように）
    const s = await probe(p); const fB = await shot('2-stance'); await noFx(true); const fB2 = await shot('2-stance-nofx'); await noFx(false);
    // ③ 通常に戻る（攻撃せずに待つと4行動で解ける）
    for (let i = 0; i < 6 && (await p.evaluate(() => TS.UI.S.run.enemies.find((e) => e.boss).stance)) > 0; i++) { await p.evaluate(() => TS.UI.doAct({ type: 'wait' })); await p.waitForTimeout(450); await closeAll(p); }
    // 構えが解けた行動で、バーンはたけへ1歩近づく（通常の動き）。比べるために元のマスへ戻し、次の技は出させない（比べる絵だけ）
    await p.evaluate((pos) => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss); bo.charge = null; bo.hold = 99; bo.x = pos[0]; bo.y = pos[1]; TS.Game.updateVision(r); }, a.pos);
    await p.waitForTimeout(500);
    const c = await probe(p); const fC = await shot('3-idle-again'); await noFx(true); const fC2 = await shot('3-idle-again-nofx'); await noFx(false);
    await p.waitForTimeout(600);
    chk(a.img === 'idle' && s.img === 'stance' && c.img === 'idle', `${W} 通常 → 構え → 通常 の絵 (${a.img} → ${s.img} → ${c.img})`);
    chk(a.pos.join() === s.pos.join() && s.pos.join() === c.pos.join(), `${W} 同じマス ${JSON.stringify([a.pos, s.pos, c.pos])}`);
    // 描く枠が同じ＝同じ倍率・同じ足元（絵の中で足の裏・顔・胴の大きさをそろえてある：tools/make-truevearn-fx.py）
    chk(a.rect && s.rect && a.rect.join() === s.rect.join() && s.rect.join() === c.rect.join(), `${W} 同じ大きさ・同じ位置に描く（縮めない・足が浮かない） ${JSON.stringify({ idle: a.rect, stance: s.rect })}`);
    chk(s.smooth === false, `${W} 構えの絵はなめらかにしない（最近傍）`);
    chk(!a.kan && !s.kan && !c.kan && toast === '天地魔闘の構え', `${W} 「構」の文字なし・表示は技名だけ「${toast}」`);
    chk(!errs.length, `${W} エラーなし ${errs.join(' / ')}`);
    crops.push({ W, rect: a.rect, canvas: a.canvas, files: [fA2, fB2, fC2, fA, fB, fC] });
    await ctx.close();
    if (rec) {
      const f = fs.readdirSync(rdir).find((n) => n.endsWith('.webm')), ss = Math.max(0, (t0 - tStart) / 1000);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-i', path.join(rdir, f), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', path.join(OUT, 'stance-compare_390.mp4')]);
      fs.rmSync(rdir, { recursive: true, force: true });
    }
  }
  fs.writeFileSync(path.join(OUT, 'crops.json'), JSON.stringify(crops));
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close();
  process.exit(ng ? 1 : 0);
})();
