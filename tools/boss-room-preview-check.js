// ボス部屋のパーツ方式（ZIP boss_room_parts_v2）のプレビューの確認：node tools/boss-room-preview-check.js <croc|flame> [出力フォルダ]（既定 docs/<部屋>-room-v1/preview/）
// 本番では使わない（D.BOSS_ROOM_PREVIEW をこの道具の中だけで切り替える）。絵は tools/make-boss-room-preview.py の composite.png。PCのブラウザ、幅360・390・430
//  入口（前室）・玉座の前・戦闘中（左右の縁のそばに予告と炎・氷の床の印）・撃破後の帰還口の画面
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOMS = { croc: { ch: 1, def: 'CROC_ROOM_PREVIEW', key: 'crocPreview', dir: 'crocodine-room-v1' }, flame: { ch: 2, def: 'FLAME_ROOM_PREVIEW', key: 'flamePreview', dir: 'flazzard-room-v1' } };
const NAME = process.argv[2] || 'croc', R = ROOMS[NAME];
const ROOT = path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'docs', R.dir, 'preview'), IMG = `docs/${R.dir}/preview/composite.png`;
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8839;
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
const closeAll = (p) => p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
(async () => {
  const b = await chromium.launch();
  for (const [W, H] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/*.mp4', (route) => route.fulfill({ status: 404, body: '' }));
    await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
    await p.evaluate(([R, NAME]) => { localStorage.clear(); TS.Data.BOSS_ROOM_PREVIEW = { [NAME]: R.def };
      const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = R.ch;
      for (const k of ['croc', 'flame', 'kill'].slice(0, R.ch - 1)) st.defeated[k] = true;
      G.depart(S, 7300 + R.ch); const r = S.run;
      while (r.floor < G.maxFloor(r)) { r.enemies = r.enemies.filter((e) => e.boss); r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      r.player.hp = r.player.maxhp = 9999; r.player.lvl = 30; TS.Save.save(S); }, [R, NAME]);
    await p.reload(); await p.waitForTimeout(700);
    await p.evaluate(async ([src, key]) => { const im = new Image(); im.src = src; await im.decode(); TS.Sprites.art.rooms[key] = im; }, [IMG, R.key]);
    await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeAll(p);
    const a = await p.evaluate(() => { const r = TS.UI.S.run, A = r.bossFight; return { floor: r.floor, bg: r.map.bg, boss: (r.enemies.find((e) => e.boss) || {}).type, p: [r.player.x, r.player.y], A }; });
    chk(a.bg === R.def && a.boss === NAME && a.p.join() === '16,21', `${W} ${NAME}：プレビューの部屋・前室の入口のマスに立つ ${JSON.stringify(a)}`);
    await p.screenshot({ path: path.join(OUT, `preview-entry_${W}.jpg`), quality: 85 });
    // 玉座の前（広間のいちばん上の列）
    await p.evaluate(() => { const r = TS.UI.S.run, A = r.bossFight, bo = r.enemies.find((e) => e.boss); A.engaged = true; A.intro = 'done'; bo.hold = 99;
      r.player.x = A.x + (A.w >> 1) - 2; r.player.y = A.y; r.player.dir = 'up'; r.explored.fill(1); TS.Game.updateVision(r); });
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, `preview-top_${W}.jpg`), quality: 85 });
    // 戦闘中：左右の縁のそばに3×3の予告と床の印（左＝氷、右＝炎。見た目だけ。ターンは進めない）。たけを縁の近くに立たせて縁が画面に入るように
    for (const side of ['right', 'left']) {
      await p.evaluate((side) => { const r = TS.UI.S.run, A = r.bossFight, bo = r.enemies.find((e) => e.boss), R = side === 'right';
        const ex = R ? A.x + A.w - 1 : A.x, inw = R ? -1 : 1;
        bo.x = ex + inw * 2; bo.y = A.y + 5; r.player.x = ex + inw * 3; r.player.y = A.y + 9; r.player.dir = R ? 'right' : 'left';
        bo.charge = { tiles: [], kind: null }; for (let dy = -1; dy <= 1; dy++) for (let d = 0; d <= 2; d++) bo.charge.tiles.push({ x: ex + inw * d, y: A.y + 8 + dy });
        r.hazards = [0, 1].map((d) => ({ x: ex + inw * d, y: A.y + 11, kind: 'ice', t: 3 })).concat([0, 1].map((d) => ({ x: ex + inw * d, y: A.y + 12, kind: 'fire', t: 2 })));
        TS.Game.updateVision(r); }, side);
      await p.waitForTimeout(600);
      await p.screenshot({ path: path.join(OUT, `preview-battle-${side}_${W}.jpg`), quality: 85 });
    }
    // 撃破：帰還口
    await p.evaluate(() => { const r = TS.UI.S.run, A = r.bossFight, bo = r.enemies.find((e) => e.boss); r.hazards = []; bo.charge = null; bo.hp = 1; bo.hold = 0; bo.sleep = 50;
      bo.x = A.x + (A.w >> 1); bo.y = A.y + 7; r.player.x = bo.x; r.player.y = bo.y + 1; TS.Game.updateVision(r); });
    for (let i = 0; i < 15 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; TS.UI.doAct({ type: 'move', dir: 'up' }); }); await p.waitForTimeout(200); }
    for (let i = 0; i < 40 && !(await p.evaluate(() => !!TS.UI.S.run.portal)); i++) { await p.waitForTimeout(150); await closeAll(p); }
    for (let i = 0; i < 8; i++) { await p.waitForTimeout(150); await closeAll(p); }
    const P = await p.evaluate(() => { const r = TS.UI.S.run, P = r.portal; if (P) { r.player.x = P.x - 1; r.player.y = P.y + 1; TS.Game.updateVision(r); } return P && TS.Game.inArena(r, P.x, P.y); });
    await p.waitForTimeout(1200);
    chk(P, `${W} 撃破後：帰還口は広間の床`);
    await p.screenshot({ path: path.join(OUT, `preview-portal_${W}.jpg`), quality: 85 });
    chk(!errs.length, `${W} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close(); process.exit(ng ? 1 : 0);
})();
