// 資料用の一覧画像を作る：node tools/make-catalog.js → docs/catalog/ の enemies・bosses・items・unused の各 _sheet.png と catalog_info.json（測った大きさ）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const { start, BASE } = require('../tests/serve');
const fs = require('fs'), path = require('path'), OUT = path.join(__dirname, '..', 'docs', 'catalog') + '/';
(async () => {
  const srv = await start(8788); const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await p.goto(`http://localhost:8788${BASE}`); await p.waitForTimeout(1500);
  const res = await p.evaluate(async () => {
    const D = TS.Data, SP = TS.Sprites;
    const bbox = (cv) => { const g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return { w: x1 - x0 + 1, h: y1 - y0 + 1, x0, y0, x1, y1 }; };
    const info = { enemies: {}, items: {} };
    const normal = ['frog', 'turtle', 'monkey', 'root', 'jelly', 'statue', 'bat', 'shaman', 'lizard', 'thief', 'golem', 'wisp', 'guard', 'darkknight', 'imp'];
    const legacy = ['lion', 'catfish', 'elephant'];
    const chap = ['croc', 'flame', 'kill', 'baran', 'mist', 'vearn', 'truevearn'];
    for (const id of normal.concat(legacy, chap)) { const fr = SP.s.enemy[D.ENEMIES[id].sprite]; info.enemies[id] = { n: fr.length, w: fr[0].width, h: fr[0].height, art: !!fr[0].art, bb: bbox(fr[0]), same: fr[0] === fr[1] }; }
    const font = (s) => `${s}px "Noto Sans CJK JP", "Noto Sans JP", sans-serif`;
    const out = {};
    // ---- 通常の敵：2コマ並べ（4倍）----
    { const k = 4, cw = 300, ch = 32 * k + 92, cols = 5, rows = Math.ceil(normal.length / cols);
      const c = document.createElement('canvas'); c.width = cw * cols; c.height = ch * rows + 60; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.fillStyle = '#3e4652'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#fff'; g.font = font(20); g.fillText('通常の敵 15種（すべてコードで描いた仮画像 32×32・4倍表示。左＝コマ0／右＝コマ1）', 12, 34);
      normal.forEach((id, i) => { const x = (i % cols) * cw, y = 52 + Math.floor(i / cols) * ch, E = D.ENEMIES[id], fr = SP.s.enemy[E.sprite];
        for (let f = 0; f < 2; f++) { g.fillStyle = '#586272'; g.fillRect(x + 10 + f * 140, y + 6, 32 * k, 32 * k); g.drawImage(fr[f], x + 10 + f * 140, y + 6, 32 * k, 32 * k); }
        g.fillStyle = '#fff'; g.font = font(17); g.fillText(E.name, x + 10, y + 32 * k + 30);
        g.fillStyle = '#c8d4e8'; g.font = font(14); g.fillText(id + '　仮画像（コード描画）', x + 10, y + 32 * k + 52); });
      out.enemies = c.toDataURL(); }
    // ---- ボス（参考）----
    { const k = 2, cw = 230, ch = 96 * k + 70, list = chap.concat(legacy), cols = 5;
      const c = document.createElement('canvas'); c.width = cw * cols; c.height = ch * Math.ceil(list.length / cols) + 60; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.fillStyle = '#3e4652'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#fff'; g.font = font(20); g.fillText('参考：ボス（章のボス7体＝見本の絵 96×96／以前の版のボス3体＝コード描画 48×48を同じ枠に拡大）', 12, 34);
      list.forEach((id, i) => { const x = (i % cols) * cw, y = 52 + Math.floor(i / cols) * ch, E = D.ENEMIES[id], img = SP.s.enemy[E.sprite][0];
        g.fillStyle = '#586272'; g.fillRect(x + 10, y + 4, 96 * k, 96 * k); g.drawImage(img, x + 10, y + 4, 96 * k, 96 * k);
        g.fillStyle = '#fff'; g.font = font(16); g.fillText(E.name, x + 10, y + 96 * k + 26);
        g.fillStyle = img.art ? '#a8f0a8' : '#ffd08a'; g.font = font(13); g.fillText(id + (img.art ? '　見本の絵' : '　仮画像（コード描画）'), x + 10, y + 96 * k + 46); });
      out.bosses = c.toDataURL(); }
    // ---- 道具 ----
    const ids = Object.keys(D.ITEMS);
    for (const id of ids) { const d = D.ITEMS[id], key = d.icon + ':' + (d.tint || ''), a = SP.art.items[key]; const fl = SP.iconFor(d);
      const bid = (TS.ASSETS.items.byId || {})[id], b = SP.art.itemsById && SP.art.itemsById[id];
      info.items[id] = { key, art: !!((b && b.list) || (a && a.list)), file: bid ? 'items-v2/' + bid : (TS.ASSETS.items.map[key] || null), floorW: fl.width, floorH: fl.height }; }
    const TYPE = { weapon: '武器', shield: '盾', heal: '回復', food: '食料', sleep: '補助', staff: '杖', warp: '補助', slow: '補助', fire: '巻物', cure: '回復', return: '帰還', charm: '護符', clear: '補助', sense: '巻物', map: '巻物', treasure: 'お宝', material: '素材', orb: '大切な物' };
    const bid2 = (id) => !!(TS.ASSETS.items.byId || {})[id];
    const loadImg = (src) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = src; });
    { const cw = 270, ch = 150, cols = 5;
      const c = document.createElement('canvas'); c.width = cw * cols; c.height = ch * Math.ceil(ids.length / cols) + 60; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.fillStyle = '#3e4652'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#fff'; g.font = font(20); g.fillText('道具 ' + ids.length + '種（一覧で使う絵を96×96で表示。緑枠＝画像ファイルの絵 48×48、橙枠＝コードで描いた仮アイコン）', 12, 34);
      for (let i = 0; i < ids.length; i++) { const id = ids[i], d = D.ITEMS[id], x = (i % cols) * cw, y = 52 + Math.floor(i / cols) * ch;
        const im = await loadImg(SP.iconURL(d)); const art = info.items[id].art;
        g.fillStyle = '#586272'; g.fillRect(x + 10, y + 6, 96, 96); if (im) g.drawImage(im, x + 10, y + 6, 96, 96);
        g.strokeStyle = art ? '#7ae07a' : '#ffa040'; g.lineWidth = 3; g.strokeRect(x + 10, y + 6, 96, 96);
        g.fillStyle = '#fff'; g.font = font(15); g.fillText(d.name, x + 10, y + 124);
        g.fillStyle = '#c8d4e8'; g.font = font(12); g.fillText(id, x + 10, y + 142);
        g.fillStyle = art ? '#a8f0a8' : '#ffd08a'; g.font = font(13); g.fillText(TYPE[d.type] || d.type, x + 114, y + 26); g.fillText(art ? (bid2(id) ? '追加の絵' : '見本の絵') : '仮アイコン', x + 114, y + 46);
        g.fillStyle = '#c8d4e8'; g.fillText(art ? info.items[id].file + '.png' : 'コード:' + d.icon + (d.tint ? '/' + d.tint : ''), x + 114, y + 66); }
      out.items = c.toDataURL(); }
    // ---- 用意済みだが未使用の絵 ----
    { const used = new Set(Object.values(info.items).filter((v) => v.art).map((v) => v.file));
      const files = ['bento','coin','herb','herb_big','herb_cure','orb','pendant','pendant_amber','plan','powder','robe','scroll_return','scroll_sense','scroll_sight','scroll_thunder','shard_amber','shard_bronze','shard_crystal','shard_gold','shield','shield_crystal','shield_dragon','shield_gold','shield_hero','shield_iron','shield_jade','shield_moon','shield_steel','shield_wood','sleepgrass','soup','staff','staff_king','sword','sword_copper','sword_crystal','sword_dragon','sword_frost','sword_gold','sword_hero','sword_iron','sword_jade','sword_steel','sword_wood'];
      const unused = files.filter((f) => !used.has(f)); info.unusedFiles = unused;
      const cw = 200, c = document.createElement('canvas'); c.width = cw * unused.length + 20; c.height = 210; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.fillStyle = '#3e4652'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff'; g.font = font(18); g.fillText('画像はあるが未使用（assets/items/list の48×48・2倍）', 12, 30);
      for (let i = 0; i < unused.length; i++) { const im = await loadImg('assets/items/list/' + unused[i] + '.png'); const x = 12 + i * cw;
        g.fillStyle = '#586272'; g.fillRect(x, 44, 96, 96); if (im) g.drawImage(im, x, 44, 96, 96); g.fillStyle = '#fff'; g.font = font(14); g.fillText(unused[i] + '.png', x, 166); }
      out.unused = c.toDataURL(); }
    return { info, out };
  });
  for (const [k, u] of Object.entries(res.out)) fs.writeFileSync(OUT + k + '_sheet.png', Buffer.from(u.split(',')[1], 'base64'));
  fs.writeFileSync(OUT + 'catalog_info.json', JSON.stringify(res.info, null, 1));
  await b.close(); srv.close();
})();
