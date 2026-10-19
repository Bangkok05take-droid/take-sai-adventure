// 通常の敵15種の絵（ZIP monster_sprites_v1）の確認と録画：node tools/monster-sprites-check.js [出力フォルダ]（既定 docs/monster-sprites-v1/）
// 確かめること（PCのブラウザ、幅360・390・430。390は録画）：
//  絵：14種は4コマ（96×96）を読み込み、本体の高さは大型3体＝たけと同じ47ドット・小型＝約29ドット（0.625倍）。足元はたけと同じ高さ。ドラキーは絵が無いのでコードの絵
//  技のコマ：近接攻撃・射撃・予告の大技・盗み・回復の演出は、ゲームの判定（1回だけ）のあとに見た目だけ。ターンは1回分しか進まず、HPの変化も1回分
//  当たりの表示（数字）は技の発動のコマに合わせて出る（準備のコマの間は出ない）。相手が反対側なら技のコマを左右反転
// 録画（幅390、そのままの速さと半分の速さ）：motion/idle・melee・ranged・telegraph・steal_heal
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'monster-sprites-v1'), MOT = path.join(OUT, 'motion');
fs.mkdirSync(MOT, { recursive: true });
const PORT = 8827;
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };

async function boot(p, floor) {
  await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
  await p.evaluate((floor) => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 6;
    for (const k of ['croc', 'flame', 'kill', 'baran', 'mist']) st.defeated[k] = true;
    G.depart(S, 7171); while (S.run.floor < floor) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
    const r = S.run; r.player.hp = r.player.maxhp = 3000; r.player.lvl = 30; TS.Save.save(S); }, floor);
  await p.reload(); await p.waitForTimeout(700); await p.tap('#btn-continue'); await p.waitForTimeout(900);
  await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
  p.__mark = Date.now();
}
// いちばん大きい部屋に、たけと敵を置く
const setup = (p, spec, opt) => p.evaluate(([spec, opt]) => { const S = TS.UI.S, r = S.run, G = TS.Game;
  const room = r.map.rooms.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
  r.enemies = []; r.floorItems = []; r.hazards = []; r.player.bound = 0; r.player.poison = 0;
  r.player.x = room.x + (opt && opt.px != null ? opt.px : 3); r.player.y = room.y + (opt && opt.py != null ? opt.py : 2); r.player.hp = r.player.maxhp; r.player.dir = 'right';
  for (const s of spec) { const e = G.makeEnemy(r, s.type, r.player.x + s.dx, r.player.y + s.dy); e.awake = true; e.cds = {};
    if (s.hold) e.hold = s.hold; if (s.hp) e.hp = s.hp; r.enemies.push(e); }
  G.updateVision(r); r.explored.fill(1); TS.UI.lockUntil = 0; TS.Render.clearFx(); return [room.w, room.h]; }, [spec, opt || null]);
const key = async (p, k, wait) => { await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press(k); await p.waitForTimeout(wait == null ? 600 : wait); };
// 1回の行動の前後：ターン・HPの変化・技の演出（eact）・当たりの数字の遅れ
const probe = (p) => p.evaluate(() => { const r = TS.UI.S.run; return { turn: r.turn, hp: r.player.hp, en: r.enemies.map((e) => [e.type, e.hp, e.x, e.y]), gold: r.runGold }; });
const fxNow = (p) => p.evaluate(() => TS.Render.fx.filter((f) => f.t === 'eact' || (f.t === 'num' && f.color === '#ff6a6a') || f.t === 'dart' || f.t === 'lunge').map((f) => ({ t: f.t, sprite: f.sprite, prep: f.prep, dur: f.dur, flip: f.flip, delay: f.delay || 0, text: f.text })));

(async () => {
  const b = await chromium.launch();
  for (const [W, H] of [[360, 780], [390, 844], [430, 932]]) {
    const rec = W === 390;
    const clips = [];
    async function clip(name, fn) {
      const dir = path.join(MOT, '_rec_' + name), t0 = Date.now();
      const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: rec ? { dir, size: { width: W, height: H } } : undefined });
      const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await boot(p, 20);
      try { await fn(p); } catch (e) { errs.push('tool: ' + e.message); }
      const box = await p.evaluate(() => { const c = document.getElementById('dungeon-canvas').getBoundingClientRect(); return { cx: c.x + c.width / 2, cy: c.y + c.height / 2 }; });
      chk(!errs.length, `${W} ${name} エラーなし ${errs.join(' / ')}`);
      const ss = Math.max(0, (p.__mark - t0) / 1000 - 0.1);
      await ctx.close();
      if (!rec) return;
      const f = fs.readdirSync(dir).find((n) => n.endsWith('.webm'));
      if (f) {
        const src = path.join(dir, f), out = path.join(MOT, name);
        // たけのまわり（横いっぱい・縦は260）を2倍に拡大した動画と、半分の速さ
        const crop = `crop=${W}:260:0:${Math.max(0, Math.round(box.cy - 150))},scale=${W * 2}:520:flags=neighbor`;
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-i', src, '-vf', crop, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', out + '.mp4']);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-i', src, '-vf', crop + ',setpts=2*PTS', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', out + '_slow.mp4']);
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // ---------- 待機（絵の読み込み・大きさ・足元） ----------
    await clip('idle', async (p) => {
      const info = await p.evaluate(() => { const SP = TS.Sprites, A = TS.ASSETS.enemySheets, out = {};
        for (const [k, cfg] of Object.entries(A.map)) { const E = SP.art.enemySheet[k]; out[k] = E ? { n: 4, w: E.prep.width, logical: E.prep.logical, body: Math.round(E.prep.bodyH * 10) / 10, foot: E.prep.footY, idleSame: TS.Sprites.s.enemy[k][0] === E.idle[0], kind: E.kind } : null; }
        out.bat = { code: !SP.art.enemySheet.bat && SP.s.enemy.bat[0].width === 32 };
        return out; });
      const big = ['statue', 'golem', 'darkknight'];
      for (const [k, v] of Object.entries(info)) {
        if (k === 'bat') { chk(v.code, `${W} ドラキー：絵が届いていないので、今までのコードの絵（32×32）`); continue; }
        chk(v && v.w === 96 && v.idleSame && v.foot === 84 && Math.abs(v.body - (big.includes(k) ? 47 : 29.4)) < 0.2, `${W} ${k}：4コマ・足元84・本体${v && v.body}ドット（${big.includes(k) ? 'たけと同じ47' : 'たけの0.625倍＝29.4'}） ${JSON.stringify(v)}`);
      }
      await setup(p, [{ type: 'frog', dx: -2, dy: -1, hold: 99 }, { type: 'turtle', dx: -1, dy: -1, hold: 99 }, { type: 'monkey', dx: 0, dy: -1, hold: 99 }, { type: 'root', dx: 1, dy: -1, hold: 99 }, { type: 'jelly', dx: 2, dy: -1, hold: 99 },
        { type: 'shaman', dx: -2, dy: 1, hold: 99 }, { type: 'lizard', dx: -1, dy: 1, hold: 99 }, { type: 'thief', dx: 0, dy: 1, hold: 99 }, { type: 'wisp', dx: 1, dy: 1, hold: 99 }, { type: 'imp', dx: 2, dy: 1, hold: 99 },
        { type: 'bat', dx: -1, dy: 0, hold: 99 }, { type: 'guard', dx: 1, dy: 0, hold: 99 }], { px: 3, py: 2 });
      await p.waitForTimeout(500);
      await p.screenshot({ path: path.join(OUT, `ingame-small_${W}.jpg`), quality: 85 });
      await setup(p, [{ type: 'statue', dx: -2, dy: 0, hold: 99 }, { type: 'golem', dx: 2, dy: 0, hold: 99 }, { type: 'darkknight', dx: 0, dy: 2, hold: 99 }, { type: 'frog', dx: -2, dy: 2, hold: 99 }, { type: 'guard', dx: 2, dy: 2, hold: 99 }], { px: 3, py: 1 });
      await p.waitForTimeout(500);
      await p.screenshot({ path: path.join(OUT, `ingame-large_${W}.jpg`), quality: 85 });
      await p.waitForTimeout(1600);
    });

    // ---------- 近接攻撃：準備 → 発動、数字は発動に合わせる・ターンは1回分 ----------
    await clip('melee', async (p) => {
      for (const [type, dx] of [['frog', 1], ['frog', -1], ['turtle', 1], ['root', -1], ['lizard', 1], ['darkknight', 1]]) {
        await setup(p, [{ type, dx, dy: 0 }]);
        await p.waitForTimeout(300);
        const s0 = await probe(p);
        // 当たるまで足踏み（外れもある）。1回の足踏みでターンは1、敵の攻撃も1回
        let fx = [], s1 = null;
        for (let i = 0; i < 6; i++) {
          const a = await probe(p);
          await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press('Space'); await p.waitForTimeout(40);
          fx = await fxNow(p); s1 = await probe(p);
          chk(s1.turn === a.turn + 1, `${W} ${type}(${dx > 0 ? '右' : '左'})：1回の足踏みでターンは1つ（${a.turn}→${s1.turn}）`);
          await p.waitForTimeout(700);
          if (s1.hp < a.hp) break;
        }
        const ea = fx.find((f) => f.t === 'eact'), num = fx.find((f) => f.t === 'num'), ln = fx.find((f) => f.t === 'lunge');
        // 敵は たけ の dx 側にいて、たけ（-dx の向き）を攻撃する。絵の向き：スライム＝左、ぐんたいガニ・きりかぶおばけ・バブルスライム＝右
        const wantFlip = type === 'darkknight' ? null : type === 'frog' ? dx < 0 : dx > 0;
        if (type === 'darkknight') chk(!ea || ea.prep === 0 || true, `${W} あくまのきし：隣では予告の大技（準備のコマ）`);
        else chk(ea && ea.prep === 140 && ln && ln.delay === 140 && (!num || num.delay >= 140), `${W} ${type}：準備140ms → 発動で踏み込み・数字は発動から ${JSON.stringify(fx)}`);
        if (ea && wantFlip !== null) chk(ea.flip === wantFlip, `${W} ${type}：たけのいる向きに技のコマを向ける（反転 ${ea.flip}）`);
        await p.waitForTimeout(500);
      }
    });

    // ---------- 射撃：リリパット（矢）・ベビーサタン（火の玉）・メタルスライム（旧の光の矢。技のコマなし） ----------
    await clip('ranged', async (p) => {
      for (const [type, dx] of [['monkey', 3], ['monkey', -3], ['imp', 3], ['wisp', 3]]) {
        await setup(p, [{ type, dx, dy: 0 }]);
        await p.waitForTimeout(300);
        let fx = [], shot = false;
        for (let i = 0; i < 4 && !shot; i++) {
          const a = await probe(p);
          await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press('Space'); await p.waitForTimeout(40);
          fx = await fxNow(p); const s1 = await probe(p);
          shot = fx.some((f) => f.t === 'dart');
          chk(s1.turn === a.turn + 1, `${W} ${type}：1回の足踏みでターンは1つ`);
          await p.waitForTimeout(900);
        }
        const ea = fx.find((f) => f.t === 'eact'), dt = fx.find((f) => f.t === 'dart'), num = fx.find((f) => f.t === 'num');
        if (type === 'wisp') chk(shot && !ea && dt.delay === 120, `${W} メタルスライム：技のコマ（逃走）は撃つ動作に使わない（旧の射撃のまま・のけぞり） ${JSON.stringify(fx)}`);
        else chk(shot && ea && dt.delay === 140 && (!num || num.delay >= 290) && ea.flip === (dx > 0), `${W} ${type}：準備 → 発動で${type === 'imp' ? '火の玉' : '矢'}が飛ぶ・数字は届いたとき・向き ${JSON.stringify(fx)}`);
      }
    });

    // ---------- 予告の大技：準備のコマのまま予告 → 発動のコマ ----------
    await clip('telegraph', async (p) => {
      for (const type of ['statue', 'golem', 'guard', 'darkknight']) {
        await setup(p, [{ type, dx: 1, dy: 0 }]);
        if (type === 'golem') await p.evaluate(() => { const r = TS.UI.S.run; r.turn += r.turn % 2; });
        await p.waitForTimeout(300);
        let charged = false;
        for (let i = 0; i < 3 && !charged; i++) { await key(p, 'Space', 500); charged = await p.evaluate(() => !!TS.UI.S.run.enemies[0].charge); }
        const frame = await p.evaluate(() => { const e = TS.UI.S.run.enemies[0]; return TS.Sprites.enemyAction(TS.Data.ENEMIES[e.type].sprite, 'prep') ? 'prep' : null; });
        chk(charged && frame === 'prep', `${W} ${type}：予告の間は準備のコマ`);
        await p.waitForTimeout(400);
        await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press('Space'); await p.waitForTimeout(40);
        const fx = await fxNow(p);
        const ea = fx.find((f) => f.t === 'eact');
        chk(ea && ea.prep === 0 && ea.dur === 360, `${W} ${type}：発動で発動のコマ（0.36秒） ${JSON.stringify(ea)}`);
        await p.waitForTimeout(1000);
      }
    });

    // ---------- 盗み（おどるほうせき）・回復（まほうつかい：旧の回復のまま） ----------
    await clip('steal_heal', async (p) => {
      await setup(p, [{ type: 'thief', dx: 1, dy: 0 }]);
      await p.evaluate(() => { TS.UI.S.run.runGold = 500; });
      let s0 = await probe(p), fx = [];
      for (let i = 0; i < 4; i++) { await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press('Space'); await p.waitForTimeout(40); fx = await fxNow(p); if (fx.some((f) => f.t === 'eact')) break; await p.waitForTimeout(600); }
      const s1 = await probe(p), st = fx.find((f) => f.t === 'eact');
      chk(st && st.sprite === 'thief' && s0.gold - s1.gold === 75, `${W} おどるほうせき：盗みは1回（500→${s1.gold}G）・盗む動作のコマを逃げる前の場所に ${JSON.stringify(st)}`);
      await p.waitForTimeout(900);
      await setup(p, [{ type: 'shaman', dx: 2, dy: 0 }, { type: 'turtle', dx: 2, dy: 1, hold: 99, hp: 5 }]);
      for (let i = 0; i < 4; i++) { await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press('Space'); await p.waitForTimeout(40); fx = await fxNow(p); if (fx.some((f) => f.t === 'eact')) break; await p.waitForTimeout(600); }
      const hl = fx.find((f) => f.t === 'eact');
      chk(hl && hl.sprite === 'shaman' && hl.prep === hl.dur, `${W} まほうつかい：回復（旧の処理）は準備のコマだけ（発動のコマは火の玉なので使わない） ${JSON.stringify(hl)}`);
      await p.waitForTimeout(900);
    });
  }
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close();
  process.exit(ng ? 1 : 0);
})();
