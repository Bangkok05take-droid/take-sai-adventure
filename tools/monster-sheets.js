// モンスターの現状調査（2026年10月）：比較シートと動きの録画。ゲームの処理・絵は変えない（読み込まれた絵をそのまま並べ、遊ぶ様子を録るだけ）
//   node tools/monster-sheets.js [出力フォルダ]   （既定 docs/monsters/）
// 1. 比較シート：ゲームが実際に読み込んだ絵（TS.Sprites）を、ゲームと同じ大きさの比（1マス＝32ドット）で並べる。たけも同じ比で並べる
//    sheet-normal.png / sheet-strong.png / sheet-boss.png / sheet-legacy.png（1ドット＝2ピクセル。灰色の升目が1マス）
//    読み込めなかった絵は、その旨を書いた枠にする（仮の見た目で代わりに描かない）
// 2. ゲーム画面での並び（幅390）：ingame-*.png
// 3. 動きの録画（幅390、そのままの速さ）：motion/*.webm → ffmpeg で motion/*.mp4（H.264）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'monsters'), MOT = path.join(OUT, 'motion');
fs.mkdirSync(MOT, { recursive: true });
const PORT = 8821;
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
const W = 390, H = 844;

/* 探索を作って保存 → 読み込み直して「つづきから」。prep はページの中で動く（S を受け取る） */
async function boot(p, prep, arg) {
  await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
  await p.evaluate(([src, arg]) => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true;
    st.introSeen = { croc: true, flame: true, kill: true, baran: true, mist: true, vearn: true, truevearn: true, dragonbaran: true };
    new Function('S', 'G', 'arg', src)(S, G, arg); const r = S.run; r.player.hp = r.player.maxhp = Math.max(r.player.maxhp, 3000); r.player.lvl = Math.max(r.player.lvl, 30); TS.Save.save(S); }, [prep, arg]);
  await p.reload(); await p.waitForTimeout(700); await p.tap('#btn-continue'); await p.waitForTimeout(900);
  await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
  p.__mark = Date.now();   // 録画はここから使う（読み込み中の画面は切る）
}
// 第ch章の f 階まで降りる（ボスの階ならボス部屋に入って戦いを始める）
const DESCEND = `st = S.village.story; st.chapter = arg.ch; if (arg.ch === 6) for (const k of ['croc','flame','kill','baran','mist']) st.defeated[k] = true;
  G.depart(S, arg.seed || 4242); while (S.run.floor < arg.f) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }`;
/* いちばん大きい部屋に、たけと敵を置く（ほかの敵・道具は片づける）。spec：{ type, dx, dy, hold, sleep, slow, hp, disguised, boss } */
const setup = (p, spec, opt) => p.evaluate(([spec, opt]) => { const S = TS.UI.S, r = S.run, G = TS.Game;
  const room = r.map.rooms.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
  r.enemies = r.enemies.filter((e) => opt && opt.keepBoss && e.boss); r.floorItems = []; r.hazards = []; r.player.bound = 0; r.player.boundBy = null; r.player.bindGuard = 0; r.player.poison = 0;
  if (!(opt && opt.keepBoss)) { r.player.x = room.x + (opt && opt.px != null ? opt.px : 1); r.player.y = room.y + (opt && opt.py != null ? opt.py : Math.min(2, room.h - 1)); }
  r.player.hp = r.player.maxhp; r.player.dir = 'right';
  const ids = {};
  for (const s of spec) { const e = G.makeEnemy(r, s.type, r.player.x + s.dx, r.player.y + s.dy); e.awake = true; e.cds = {};
    if (s.hold) e.hold = s.hold; if (s.sleep) e.sleep = s.sleep; if (s.slow) e.slow = s.slow; if (s.hp) e.hp = s.hp; if (s.disguised) e.disguised = true; if (s.def != null) e.def = s.def;
    r.enemies.push(e); ids[s.key || s.type] = e.id; }
  G.updateVision(r); r.explored.fill(1); TS.UI.lockUntil = 0; return { room: [room.w, room.h], ids }; }, [spec, opt || null]);
const key = async (p, k, wait) => { await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press(k); await p.waitForTimeout(wait == null ? 450 : wait); };
const hold = (p, ms) => p.waitForTimeout(ms);

(async () => {
  const b = await chromium.launch();
  /* ---------- 1. 比較シート ---------- */
  {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(1500);
    const groups = {
      normal: ['frog', 'turtle', 'monkey', 'root', 'jelly', 'statue', 'bat', 'shaman', 'lizard', 'thief', 'golem', 'wisp', 'guard', 'darkknight', 'imp'],
      strong: ['dragon', 'silverdevil', 'gigantes', 'bombrock', 'mimic', 'madhand'],
      boss: ['croc', 'flame', 'kill', 'kill_clone', 'baran', 'mist', 'mist_clone', 'vearn', 'truevearn', 'dragonbaran'],
      legacy: ['lion', 'catfish', 'elephant'],
    };
    const titles = { normal: '通常のモンスター（出てくる階の順）', strong: '強敵（隠しダンジョン32〜34階）', boss: 'ボス・分身', legacy: '以前の版だけのボス（新しい探索では出ない）' };
    const info = await p.evaluate(() => { const SP = TS.Sprites, A = TS.ASSETS, D = TS.Data, out = {};
      for (const [id, E] of Object.entries(D.ENEMIES)) { const s = E.sprite, fr = SP.s.enemy[s];
        const src = A.enemies && A.enemies[s] ? 'enemies' : A.enemySheets && A.enemySheets.map[s] ? 'sheet' : A.bosses && A.bosses[s] ? 'bosses' : 'code';
        const loaded = src === 'enemies' ? !!SP.art.enemies[s] : src === 'sheet' ? !!SP.art.enemySheet[s] : src === 'bosses' ? !!SP.art.bosses[s] : !!fr;
        const f0 = fr && fr[0], f1 = fr && fr[1];
        out[id] = { sprite: s, src, loaded, w: f0 ? f0.width : 0, logical: f0 ? (f0.logical || f0.width) : 0, frames: fr ? (f0 === f1 ? 1 : 2) : 0, art: !!(f0 && f0.art) }; }
      out._take = !!(SP.s.take.down && SP.s.take.down.art); return out; });
    fs.writeFileSync(path.join(OUT, 'sheet-info.json'), JSON.stringify(info, null, 1));
    for (const [g, list] of Object.entries(groups)) {
      const url = await p.evaluate(([list, title]) => {
        const SP = TS.Sprites, A = TS.ASSETS, D = TS.Data, DOT = 2, TILE = 32 * DOT;
        const cells = [{ id: '_take' }].concat(list.map((id) => ({ id })));
        for (const c of cells) {
          if (c.id === '_take') { const set = SP.s.take.down; c.img = set && (set.idle || set.walk && set.walk[0]); c.name = 'たけ'; c.sub = '主人公（比較用）'; c.dw = c.img ? c.img.width * DOT : TILE; c.dh = c.img ? c.img.height * DOT : TILE; c.take = true; c.note = set && set.art ? '専用（見本の絵 52×64）' : 'コードの絵'; c.bodyDots = 47; continue; }
          const E = D.ENEMIES[c.id], s = E.sprite, src = A.enemies && A.enemies[s] ? 'enemies' : A.enemySheets && A.enemySheets.map[s] ? 'sheet' : A.bosses && A.bosses[s] ? 'bosses' : 'code';
          const loaded = src === 'enemies' ? !!SP.art.enemies[s] : src === 'sheet' ? !!SP.art.enemySheet[s] : src === 'bosses' ? !!SP.art.bosses[s] : !!SP.s.enemy[s];
          c.name = E.name; c.sub = c.id;
          if (!loaded) { c.img = null; c.dw = c.dh = TILE * (src === 'enemies' ? 2 : src === 'bosses' ? 3 : 1); c.note = '読み込めなかった'; continue; }
          const img = SP.s.enemy[s][0]; c.img = img; c.dw = c.dh = (img.logical || img.width) * DOT;
          if (src === 'sheet') c.foot = img.footY / img.height;
          if (src === 'sheet') c.bodyDots = Math.round(img.bodyH);
          c.note = src === 'sheet' ? '専用（ChatGPT・4コマ）' : src === 'enemies' ? '専用（ChatGPT ' + img.width + '×' + img.height + '）' : src === 'bosses' ? (c.id === 'dragonbaran' ? '借用・仮（バランの絵）' : E.clone ? '本体の絵を借用' : '専用（見本の絵 ' + img.width + '×' + img.height + '）') : '仮（コードの絵 ' + img.width + '×' + img.height + '）';
          c.tiles = (img.logical || img.width) / 32;
        }
        const pad = 18, labelH = 64, top = 46, perRow = cells.length > 9 ? Math.ceil(cells.length / 2) : cells.length;
        const rows = []; for (let i = 0; i < cells.length; i += perRow) rows.push(cells.slice(i, i + perRow));
        const rowH = rows.map((r) => Math.max(...r.map((c) => c.dh)) + labelH + pad);
        const rowW = rows.map((r) => r.reduce((a, c) => a + Math.max(c.dw, 150) + pad, pad));
        const cw = Math.max(...rowW), ch = top + rowH.reduce((a, b) => a + b, 0) + 10;
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d');
        g.fillStyle = '#20202a'; g.fillRect(0, 0, cw, ch);
        g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.fillText(title + '　（1マス＝灰色の升目。ゲームと同じ大きさの比）', pad, 28);
        let y = top;
        rows.forEach((r, ri) => {
          const base = y + Math.max(...r.map((c) => c.dh));
          // 升目（1マス）
          g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
          for (let gx = pad; gx < cw - pad; gx += TILE) for (let gy = base; gy > y - 1; gy -= TILE) g.strokeRect(gx + 0.5, gy - TILE + 0.5, TILE, TILE);
          g.strokeStyle = 'rgba(255,220,120,0.6)'; g.beginPath(); g.moveTo(pad, base + 0.5); g.lineTo(cw - pad, base + 0.5); g.stroke();
          let x = pad;
          for (const c of r) {
            const w = Math.max(c.dw, 150), cx = x + w / 2;
            g.imageSmoothingEnabled = !!(c.img && c.img.logical && !c.img.sheet); g.imageSmoothingQuality = 'high';   // 通常の敵15種は最近傍（ゲームと同じ）
            if (c.img) {
              if (c.take) { const B = TS.ASSETS.charBox; g.drawImage(c.img, Math.round(cx - B.w / 2 * DOT), Math.round(base - DOT - B.foot * DOT), c.dw, c.dh); }
              else if (c.foot) g.drawImage(c.img, Math.round(cx - c.dw / 2), Math.round(base - DOT - c.dh * c.foot), c.dw, c.dh);   // ゲームと同じ：足元をたけの足元の高さに
              else g.drawImage(c.img, Math.round(cx - c.dw / 2), base - c.dh, c.dw, c.dh);
            } else {
              g.setLineDash([6, 4]); g.strokeStyle = '#ff7070'; g.strokeRect(cx - c.dw / 2, base - c.dh, c.dw, c.dh); g.setLineDash([]);
              g.fillStyle = '#ff9090'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText('画像なし', cx, base - c.dh / 2); g.textAlign = 'left';
            }
            g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.fillText(c.name, cx, base + 20);
            g.fillStyle = '#c8c8d8'; g.font = '12px sans-serif'; g.fillText(c.sub + (c.bodyDots ? '　本体' + c.bodyDots + 'ドット' : c.tiles ? '　' + c.tiles + 'マス' : ''), cx, base + 37);
            g.fillStyle = c.note === '読み込めなかった' ? '#ff9090' : /仮|借用/.test(c.note) ? '#ffd890' : '#a8e8b0'; g.fillText(c.note, cx, base + 54); g.textAlign = 'left';
            x += w + pad;
          }
          y += rowH[ri];
        });
        return cv.toDataURL('image/png');
      }, [list, titles[g]]);
      fs.writeFileSync(path.join(OUT, `sheet-${g}.png`), Buffer.from(url.split(',')[1], 'base64'));
      const miss = list.filter((id) => !info[id].loaded);
      chk(true, `比較シート ${g}：${list.length}体＋たけ。読み込めなかった絵：${miss.length ? miss.join(',') : 'なし'}`);
    }
    chk(info._take, 'たけの絵が読み込まれている');
    chk(!errs.length, 'シートでエラーなし ' + errs.join(' / '));
    await ctx.close();
  }

  /* ---------- 2. 動きの録画（と、ゲーム画面での並び） ---------- */
  const clips = [];
  async function clip(name, title, fn) {
    const dir = path.join(MOT, '_rec_' + name), t0 = Date.now();
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: { dir, size: { width: W, height: H } } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    let note = '', ss = 0;
    try { note = (await fn(p)) || ''; ss = Math.max(0, ((p.__mark || t0) - t0) / 1000 - 0.2); } catch (e) { errs.push('tool: ' + e.message); }
    chk(!errs.length, `録画 ${name}（${title}） ${note} ${errs.join(' / ')}`);
    await ctx.close();
    const f = fs.readdirSync(dir).find((n) => n.endsWith('.webm'));
    if (f) { const webm = path.join(dir, f);
      try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-movflags', '+faststart', path.join(MOT, name + '.mp4')]); } catch (e) { console.log('ffmpeg 失敗', name, e.message); }
      if (process.env.KEEP_WEBM) fs.copyFileSync(webm, path.join(process.env.KEEP_WEBM, name + '.webm')); }   // 確認用（Chromium で再生できる形）
    fs.rmSync(dir, { recursive: true, force: true });
    clips.push({ name, title, note });
  }
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.jpg'), quality: 85 });
  const NORMAL_FLOOR = { ch: 6, f: 20, seed: 777 };

  // 待機：コードの絵は2コマの切り替え（420ミリ秒、ヤミコウモリは160ミリ秒）。絵の敵は1ドットの上下動（520ミリ秒）
  await clip('01_idle', '待機', async (p) => {
    await boot(p, DESCEND, NORMAL_FLOOR);
    const s = await setup(p, [{ type: 'frog', dx: 2, dy: -1, hold: 99 }, { type: 'bat', dx: 3, dy: -1, hold: 99 }, { type: 'jelly', dx: 4, dy: -1, hold: 99 }, { type: 'golem', dx: 5, dy: -1, hold: 99 },
      { type: 'dragon', dx: 2, dy: 1, hold: 99 }, { type: 'gigantes', dx: 4, dy: 1, hold: 99 }], { py: 2 });
    await hold(p, 300); await shot(p, 'ingame-idle'); await hold(p, 3500); return '部屋 ' + s.room.join('x');
  });
  // 移動：1マスを110ミリ秒で滑らかに。蛙は跳ぶ・亀はのそのそ・猿は足運び・ほかは滑るだけ
  await clip('02_move', '移動', async (p) => {
    await boot(p, DESCEND, { ch: 1, f: 6, seed: 778 });
    await setup(p, [{ type: 'frog', dx: 5, dy: -1 }, { type: 'turtle', dx: 5, dy: 0 }, { type: 'root', dx: 5, dy: 1, sleep: 0 }, { type: 'jelly', dx: 5, dy: 2 }], { px: 0 });
    await p.evaluate(() => { for (const e of TS.UI.S.run.enemies) e.sleep = 0; });
    for (let i = 0; i < 6; i++) await key(p, 'Space', 520);
    await hold(p, 600);
  });
  await clip('03_move_strong', '移動（絵の敵：滑るだけ）・シルバーデビルの2歩', async (p) => {
    await boot(p, DESCEND, NORMAL_FLOOR);
    await setup(p, [{ type: 'dragon', dx: 5, dy: -1 }, { type: 'silverdevil', dx: 6, dy: 1 }, { type: 'gigantes', dx: 5, dy: 2 }], { px: 0 });
    for (let i = 0; i < 4; i++) await key(p, 'Space', 600);
    await hold(p, 600);
  });
  // 通常攻撃：たけの方へ踏み込む（140ミリ秒）。たけは赤い数字と点滅・揺れ
  await clip('04_attack', '通常攻撃（踏み込み）・被弾', async (p) => {
    await boot(p, DESCEND, NORMAL_FLOOR);
    await setup(p, [{ type: 'frog', dx: 1, dy: 0 }, { type: 'gigantes', dx: 0, dy: 1 }]);
    for (let i = 0; i < 4; i++) await key(p, 'Space', 650);
    // たけが攻撃：敵は白く光って揺れる（コードの絵は明るく重ね、絵の敵は白い影絵を重ねる）
    for (let i = 0; i < 2; i++) await key(p, 'ArrowRight', 650);
    await p.evaluate(() => { TS.UI.S.run.player.dir = 'down'; });
    for (let i = 0; i < 2; i++) await key(p, 'ArrowDown', 650);
    await hold(p, 500);
  });
  // 射撃：のけぞって狙う（220ミリ秒）→ 矢が飛ぶ（300ミリ秒）
  await clip('05_ranged', '射撃（吹き矢・光の矢・火の玉）', async (p) => {
    await boot(p, DESCEND, NORMAL_FLOOR);
    await setup(p, [{ type: 'monkey', dx: 3, dy: 0 }, { type: 'wisp', dx: 3, dy: 3 }, { type: 'imp', dx: 0, dy: 3 }]);
    for (let i = 0; i < 5; i++) await key(p, 'Space', 700);
  });
  // 予告→発動→隙：赤いマス＋「！」→ 次の行動で発動（光るマス）→「…」の隙
  await clip('06_telegraph', '予告・発動・隙（石像の戦士・結晶ゴーレム）', async (p) => {
    await boot(p, DESCEND, NORMAL_FLOOR);
    await setup(p, [{ type: 'statue', dx: 1, dy: 0 }]);
    await key(p, 'Space', 900); await shot(p, 'ingame-telegraph');
    await key(p, 'ArrowLeft', 900);   // 離れてかわす
    await key(p, 'Space', 900); await key(p, 'Space', 900);
    await setup(p, [{ type: 'golem', dx: 1, dy: 1 }]);
    await p.evaluate(() => { TS.UI.S.run.turn += TS.UI.S.run.turn % 2; });
    for (let i = 0; i < 4; i++) await key(p, 'Space', 900);
  });
  // 撃破：コードの絵・絵の敵とも、縦につぶれながら白く消える（240ミリ秒）＋経験値の数字
  await clip('07_defeat', '撃破（通常の敵）', async (p) => {
    await boot(p, DESCEND, NORMAL_FLOOR);
    await setup(p, [{ type: 'frog', dx: 1, dy: 0, hp: 1, hold: 99 }]);
    await hold(p, 500); await key(p, 'ArrowRight', 1200);
    await setup(p, [{ type: 'dragon', dx: 1, dy: 0, hp: 1, hold: 99 }]);
    await hold(p, 500); await key(p, 'ArrowRight', 1200);
  });
  // 状態異常：眠り（月）・鈍足（砂時計）。たけの毒（しずく）・拘束（鎖と輪）
  await clip('08_status', '状態異常のしるし', async (p) => {
    await boot(p, DESCEND, NORMAL_FLOOR);
    await setup(p, [{ type: 'frog', dx: 2, dy: 0, sleep: 50 }, { type: 'turtle', dx: 3, dy: 0, slow: 50, hold: 99 }, { type: 'dragon', dx: 2, dy: 2, sleep: 50 }, { type: 'madhand', dx: 1, dy: 1, hold: 99 }]);
    await p.evaluate(() => { const r = TS.UI.S.run; r.player.poison = 8; r.player.bound = 3; r.player.boundBy = r.enemies.find((e) => e.type === 'madhand').id; });
    await hold(p, 300); await shot(p, 'ingame-status'); await hold(p, 3000);
  });
  // 強敵の専用の動き：炎（最初に当たった相手で止まる）・2回攻撃・自爆・正体・つかむ
  await clip('09_strong_special', '強敵の技（炎・2回攻撃・自爆・ミミック・つかむ）', async (p) => {
    await boot(p, DESCEND, NORMAL_FLOOR);
    await setup(p, [{ type: 'dragon', dx: 4, dy: 0 }]); await hold(p, 400); await key(p, 'Space', 1100);
    await setup(p, [{ type: 'dragon', dx: 4, dy: 0 }, { type: 'gigantes', dx: 2, dy: 0, hold: 99 }]); await hold(p, 400); await key(p, 'Space', 1100);
    await setup(p, [{ type: 'silverdevil', dx: 1, dy: 0 }]); await hold(p, 400); await key(p, 'Space', 1100);
    await setup(p, [{ type: 'bombrock', dx: 1, dy: 0, hold: 99, def: 0 }]);
    await p.evaluate(() => { const e = TS.UI.S.run.enemies[0]; e.hp = Math.floor(e.maxhp * 0.1) + 25; });
    await hold(p, 400); await key(p, 'ArrowRight', 1300);
    await setup(p, [{ type: 'mimic', dx: 2, dy: 0, disguised: 1 }]); await hold(p, 900); await key(p, 'ArrowRight', 1300);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    await setup(p, [{ type: 'madhand', dx: 1, dy: 0 }]);
    for (let i = 0; i < 6 && !(await p.evaluate(() => TS.UI.S.run.player.bound)); i++) await key(p, 'Space', 700);
    await hold(p, 900);
    return await p.evaluate(() => 'つかまれた：' + (TS.UI.S.run.player.bound > 0));
  });
  // ボス：待機の上下動、予告（赤く点滅して震える）、隙、被弾（白い影絵）、撃破（白く光って沈む）
  await clip('10_boss', 'ボス（クロコダイン）：予告・隙・被弾・撃破', async (p) => {
    await boot(p, DESCEND + `; const r = S.run, A = r.bossFight; r.player.x = A.x + 1; r.player.y = A.y + (A.h >> 1); G.updateVision(r); G.checkBossRoom(S, []);`, { ch: 1, f: 15, seed: 779 });
    await p.evaluate(() => { const r = TS.UI.S.run, b = r.enemies.find((e) => e.boss); r.player.x = b.x - 4; r.player.y = b.y; b.cds = { axe: 9 }; TS.Game.updateVision(r); TS.UI.lockUntil = 0; });
    await hold(p, 1000);
    for (let i = 0; i < 3 && !(await p.evaluate(() => !!TS.UI.S.run.enemies.find((e) => e.boss).charge)); i++) await key(p, 'Space', 900);
    const tele = await p.evaluate(() => !!TS.UI.S.run.enemies.find((e) => e.boss).charge);
    await shot(p, 'ingame-boss-telegraph');
    await key(p, 'ArrowUp', 1100);   // 列の外へよける → 突進は外れて隙
    await p.evaluate(() => { const r = TS.UI.S.run, b = r.enemies.find((e) => e.boss); r.player.x = b.x - 1; r.player.y = b.y; r.player.dir = 'right'; TS.Game.updateVision(r); });
    await key(p, 'ArrowRight', 800); await key(p, 'ArrowRight', 800);
    await p.evaluate(() => { const b = TS.UI.S.run.enemies.find((e) => e.boss); b.hp = 1; b.rest = 3; });
    await key(p, 'ArrowRight', 2200);
    return await p.evaluate((tele) => '予告：' + tele + '　ボス残り：' + TS.UI.S.run.enemies.filter((e) => e.boss).length, tele);
  });
  // 分身：影がなく、ゆらゆら透ける（キルバーン）
  await clip('11_clone', '分身（キルバーン）', async (p) => {
    await boot(p, DESCEND + `; const r = S.run, A = r.bossFight; r.player.x = A.x + 1; r.player.y = A.y + (A.h >> 1); G.updateVision(r); G.checkBossRoom(S, []);`, { ch: 3, f: 25, seed: 780 });
    for (let i = 0; i < 5; i++) await key(p, 'Space', 800);
    await shot(p, 'ingame-clone'); await hold(p, 800);
    return await p.evaluate(() => '分身：' + TS.UI.S.run.enemies.filter((e) => e.type === 'kill_clone').length);
  });
  // ゲーム画面での大きさの並び（たけ・通常・強敵・ボスの絵）
  {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await boot(p, DESCEND, NORMAL_FLOOR);
    const s = await setup(p, [{ type: 'frog', dx: 1, dy: 0, hold: 99 }, { type: 'golem', dx: 2, dy: 0, hold: 99 }, { type: 'guard', dx: 3, dy: 0, hold: 99 },
      { type: 'dragon', dx: -1, dy: 2, hold: 99 }, { type: 'gigantes', dx: 1, dy: 2, hold: 99 }, { type: 'croc', dx: 3, dy: 2, hold: 99 }], { py: 1 });
    await hold(p, 500); await shot(p, 'ingame-sizes');
    const m = await p.evaluate(() => { const c = document.getElementById('dungeon-canvas'); const ts = Math.max(32, Math.floor(Math.min(c.width / 9.5, c.height / 7.5) / 16) * 16); return { canvas: c.width + 'x' + c.height, tile: ts }; });
    chk(!errs.length, `ゲーム画面の並び 部屋${s.room.join('x')} 1マス=${m.tile}px（キャンバス ${m.canvas}） ${errs.join(' / ')}`);
    await ctx.close();
  }
  fs.writeFileSync(path.join(MOT, 'clips.json'), JSON.stringify(clips, null, 1));
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close();
  process.exit(ng ? 1 : 0);
})();
