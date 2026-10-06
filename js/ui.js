/* 画面・入力・モーダル。ゲーム処理は TS.Game、描画は TS.Render に任せる。 */
(function (TS) {
  'use strict';
  const D = TS.Data, G = TS.Game, SV = TS.Save, SP = TS.Sprites, RD = TS.Render, AU = TS.Audio;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const UI = { S: null, screen: 'title', lockUntil: 0, modals: [], villageHits: [] };
  TS.UI = UI;
  const INPUT_LOCK_MS = 110;

  // ================= 起動 =================
  function boot() {
    SP.build(); SP.buildTiles();
    SP.loadArt();
    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 200));
    // ページのスクロール・拡大を防ぐ（モーダル内のリストだけはスクロール可）
    document.addEventListener('touchmove', (e) => { if (!e.target.closest('.modal-body')) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // 最初のユーザー操作で音を開始
    const unlock = () => { AU.unlock(); };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);

    UI.S = SV.load() || G.newState();
    AU.setEnabled(UI.S.settings.sound);
    bindTitleImages(); bindTitle(); bindVillage(); bindDungeon();
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    showTitle();
    requestAnimationFrame(loop);
  }

  function setAppHeight() {
    document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  }

  function save() { if (UI.started) SV.save(UI.S); }

  function showScreen(name) {
    if (UI.stopHold) UI.stopHold();
    UI.screen = name;
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === 'screen-' + name);
    AU.playBgm(name === 'dungeon' ? (UI.S.run && G.F(UI.S.run).boss ? 'boss' : 'dungeon') : 'village');
    if (name === 'village') { updateVillageHud(); resetWalker(); }
    if (name === 'dungeon') updateHud();
  }

  // ================= 描画ループ =================
  function loop(now) {
    try {
      if (UI.screen === 'dungeon' && UI.S.run) {
        RD.drawDungeon($('dungeon-canvas'), UI.S, now);
        // 最終決戦の準備中は、道具の確認などを閉じたら準備画面に戻す（準備中は時間が止まっている）
        const fin = UI.S.run.final;
        if (fin && fin.stage === 'prep' && fin.cutsceneSeen && !UI.prepHold && !UI.modals.length && !UI.S.run.over) openFinalPrep();
      }
      else if (UI.screen === 'village') { tickWalker(now); UI.vview = RD.drawVillage($('village-canvas'), UI.S.village, now, UI.walker); }
      else if (UI.screen === 'title') drawTitleScene();
    } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  }

  /* タイトルの冒険イラスト。
   * 人物は見本イラストから切り抜いた assets/title-chars.webp（tests/make-title-art.js で作成）を <img> で表示し、
   * その後ろの景色（夕暮れの空・遠くの光・アユタヤの遺跡・水辺・石のテラス）をこのキャンバスに描く。
   * 景色は人物の表示位置に合わせて描く（地平線は人物の腰、テラスは足元）。静止画なので大きさが変わったときだけ描き直す。
   * 透過画像を表示できないときは、紙の背景つきの assets/title-art.jpg を額に入れて表示する。 */
  let titleKey = '';
  function bindTitleImages() {
    const img = $('title-chars');
    img.addEventListener('load', () => { titleKey = ''; });
    img.addEventListener('error', () => {
      if (img.dataset.fallback) return;
      img.dataset.fallback = '1'; img.classList.add('paper'); img.src = 'assets/title-art.jpg';
    });
  }
  // object-fit: contain; object-position: center bottom で実際に絵が表示される範囲
  function shownRect(img) {
    const r = img.getBoundingClientRect(), nw = img.naturalWidth || 900, nh = img.naturalHeight || 702;
    const sc = Math.min(r.width / nw, r.height / nh), w = nw * sc, h = nh * sc;
    return { x: r.left + (r.width - w) / 2, y: r.top + r.height - h, w, h };
  }
  function drawTitleScene() {
    const c = $('title-bg');
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
    if (!W || !H) return;
    const cr = c.getBoundingClientRect(), img = $('title-chars'), ir = shownRect(img);
    const key = [W, H, ir.x, ir.y, ir.w, ir.h, img.complete].map((v) => Math.round(v)).join(',');
    if (key === titleKey) return;
    titleKey = key;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    // 人物の位置（キャンバス座標）
    const ax = (ir.x - cr.left) * dpr, ay = (ir.y - cr.top) * dpr, aw = ir.w * dpr, ah = ir.h * dpr;
    const u = Math.max(1, ah / 300);                       // 景色の大きさの単位
    // 遠くの岸：ふつうは人物の腰の高さ。縦長の画面で人物の上が空くときは、そのぶん上げて遺跡が見えるようにする
    const head = document.querySelector('.title-head').getBoundingClientRect();
    const gap = Math.max(0, ay - (head.bottom - cr.top) * dpr);
    const horizon = Math.round(ay + ah * 0.5 - Math.min(gap * 0.9, ah * 0.42));
    const deck = Math.round(ay + ah * 0.9);                // テラスの奥の縁（足元の少し上）
    const lightX = ax + aw * 0.52;                         // 遠くの光：二人のあいだ
    const rnd = (i, k) => (SP.hash(i, k, 77) % 10000) / 10000;

    // ---- 空 ----
    let gr = g.createLinearGradient(0, 0, 0, horizon);
    gr.addColorStop(0, '#081c2a'); gr.addColorStop(0.35, '#15475a'); gr.addColorStop(0.68, '#6a5a78');
    gr.addColorStop(0.88, '#e8946a'); gr.addColorStop(1, '#ffd08a');
    g.fillStyle = gr; g.fillRect(0, 0, W, horizon);
    // 星
    for (let i = 0; i < 70; i++) {
      const x = rnd(i, 1) * W, y = rnd(i, 2) * horizon * 0.55;
      g.globalAlpha = 0.25 + rnd(i, 3) * 0.6 * (1 - y / (horizon * 0.55));
      g.fillStyle = '#fff6dc'; g.fillRect(Math.round(x), Math.round(y), Math.ceil(dpr * (rnd(i, 4) < 0.15 ? 1.6 : 1)), Math.ceil(dpr * (rnd(i, 4) < 0.15 ? 1.6 : 1)));
    }
    g.globalAlpha = 1;
    // 遠くの光（地平線の太陽の名残り）
    gr = g.createRadialGradient(lightX, horizon, 0, lightX, horizon, Math.max(W, ah) * 0.75);
    gr.addColorStop(0, 'rgba(255,236,170,0.95)'); gr.addColorStop(0.12, 'rgba(255,200,120,0.55)'); gr.addColorStop(0.45, 'rgba(240,140,100,0.15)'); gr.addColorStop(1, 'rgba(240,140,100,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, horizon);
    // たなびく雲
    for (let i = 0; i < 9; i++) {
      const y = horizon * (0.38 + rnd(i, 5) * 0.5), x = rnd(i, 6) * W, w = (60 + rnd(i, 7) * 140) * u, h = (3 + rnd(i, 8) * 5) * u;
      const t = y / horizon;
      g.fillStyle = `rgba(${Math.round(120 + 135 * t)},${Math.round(110 + 60 * t)},${Math.round(150 - 40 * t)},${0.18 + 0.2 * t})`;
      g.beginPath(); g.ellipse(x, y, w, h, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(255,214,160,${0.22 * t})`;
      g.beginPath(); g.ellipse(x, y + h * 0.5, w * 0.8, h * 0.35, 0, 0, Math.PI * 2); g.fill();
    }
    // ---- 遠くの遺跡（プラーンの塔とチェディ） ----
    const prang = (cx, base, w, h) => {
      g.beginPath();
      g.moveTo(cx - w, base); g.lineTo(cx - w, base - h * 0.12); g.lineTo(cx - w * 0.8, base - h * 0.12); g.lineTo(cx - w * 0.8, base - h * 0.24);
      g.lineTo(cx - w * 0.58, base - h * 0.24);
      g.bezierCurveTo(cx - w * 0.6, base - h * 0.55, cx - w * 0.35, base - h * 0.78, cx - w * 0.1, base - h * 0.86);
      g.lineTo(cx, base - h); g.lineTo(cx + w * 0.1, base - h * 0.86);
      g.bezierCurveTo(cx + w * 0.35, base - h * 0.78, cx + w * 0.6, base - h * 0.55, cx + w * 0.58, base - h * 0.24);
      g.lineTo(cx + w * 0.8, base - h * 0.24); g.lineTo(cx + w * 0.8, base - h * 0.12); g.lineTo(cx + w, base - h * 0.12); g.lineTo(cx + w, base);
      g.closePath(); g.fill();
    };
    const chedi = (cx, base, w, h) => {
      g.beginPath();
      g.moveTo(cx - w, base); g.lineTo(cx - w, base - h * 0.1); g.lineTo(cx - w * 0.75, base - h * 0.16);
      g.bezierCurveTo(cx - w * 0.8, base - h * 0.5, cx - w * 0.3, base - h * 0.55, cx - w * 0.12, base - h * 0.6);
      g.lineTo(cx, base - h); g.lineTo(cx + w * 0.12, base - h * 0.6);
      g.bezierCurveTo(cx + w * 0.3, base - h * 0.55, cx + w * 0.8, base - h * 0.5, cx + w * 0.75, base - h * 0.16);
      g.lineTo(cx + w, base - h * 0.1); g.lineTo(cx + w, base); g.closePath(); g.fill();
    };
    const ruins = (alphaMul) => {
      g.fillStyle = `rgba(98,72,104,${0.75 * alphaMul})`;   // かすんだ遠景
      for (let i = 0; i < 7; i++) { const x = (i + 0.3 + rnd(i, 9) * 0.4) / 7 * W; if (Math.abs(x - lightX) < 40 * u) continue;
        (i % 2 ? chedi : prang)(x, horizon, (9 + rnd(i, 10) * 7) * u, (30 + rnd(i, 11) * 26) * u); }
      g.fillStyle = `rgba(60,40,62,${0.92 * alphaMul})`;    // 中央の大きな塔（光を背負う）
      prang(lightX, horizon, 26 * u, 96 * u);
      prang(lightX - 46 * u, horizon, 15 * u, 58 * u); prang(lightX + 46 * u, horizon, 15 * u, 58 * u);
      g.fillStyle = `rgba(36,30,48,${alphaMul})`;           // 手前の木々と城壁
      g.fillRect(0, horizon - 6 * u, W, 6 * u);
      for (let i = 0; i < 26; i++) { const x = rnd(i, 12) * W, r = (5 + rnd(i, 13) * 9) * u; if (Math.abs(x - lightX) < 34 * u) continue;
        g.beginPath(); g.ellipse(x, horizon - 4 * u, r * 1.3, r, 0, Math.PI, 0); g.fill(); }
    };
    ruins(1);
    // ---- 水辺 ----
    gr = g.createLinearGradient(0, horizon, 0, deck);
    gr.addColorStop(0, '#c8826a'); gr.addColorStop(0.18, '#5a5a74'); gr.addColorStop(0.6, '#1f4656'); gr.addColorStop(1, '#0f2c38');
    g.fillStyle = gr; g.fillRect(0, horizon, W, deck - horizon);
    // 遺跡の映り込み
    g.save(); g.beginPath(); g.rect(0, horizon, W, deck - horizon); g.clip();
    g.translate(0, horizon * 2); g.scale(1, -1); g.globalAlpha = 0.28; ruins(1); g.restore();
    // 光の帯と、さざ波
    for (let i = 0; i < 46; i++) {
      const t = rnd(i, 14), y = horizon + 2 * u + t * t * (deck - horizon - 4 * u);
      const spread = (10 + t * 60) * u, x = lightX + (rnd(i, 15) - 0.5) * spread * 2, w = (6 + rnd(i, 16) * 18) * u * (0.5 + t);
      g.fillStyle = `rgba(255,${Math.round(220 - t * 60)},${Math.round(150 - t * 50)},${0.75 - t * 0.55})`;
      g.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w), Math.max(1, Math.round(u * (0.8 + t))));
    }
    g.fillStyle = 'rgba(180,220,230,0.18)';
    for (let i = 0; i < 40; i++) { const t = rnd(i, 17), y = horizon + t * (deck - horizon), w = (8 + rnd(i, 18) * 30) * u; g.fillRect(rnd(i, 19) * W, y, w, Math.max(1, u * 0.7)); }
    // 蓮
    const lotus = (x, y, s) => {
      g.fillStyle = '#1e5a3a'; g.beginPath(); g.ellipse(x, y, 11 * s, 3.2 * s, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2f7a48'; g.beginPath(); g.ellipse(x - 2 * s, y - 0.8 * s, 8 * s, 2.2 * s, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f49ab8'; g.beginPath(); g.moveTo(x - 4 * s, y - 1 * s); g.quadraticCurveTo(x, y - 12 * s, x + 4 * s, y - 1 * s); g.fill();
      g.fillStyle = '#ffd0e0'; g.beginPath(); g.moveTo(x - 1.5 * s, y - 2 * s); g.quadraticCurveTo(x, y - 9 * s, x + 1.5 * s, y - 2 * s); g.fill();
    };
    const lotusY = horizon + (deck - horizon) * 0.62;
    lotus(W * 0.06, lotusY, u * 1.1); lotus(W * 0.94, lotusY + 6 * u, u * 1.2); lotus(W * 0.16, lotusY + 14 * u, u * 0.8); lotus(W * 0.86, lotusY - 8 * u, u * 0.7);
    // ---- 石のテラス（遠近の目地） ----
    const vy = horizon - ah * 0.2;
    gr = g.createLinearGradient(0, deck, 0, H);
    gr.addColorStop(0, '#9a7254'); gr.addColorStop(0.25, '#6a4a3a'); gr.addColorStop(1, '#2a1c1a');
    g.fillStyle = gr; g.fillRect(0, deck, W, H - deck);
    g.fillStyle = '#e8bc7a'; g.fillRect(0, deck, W, Math.max(1, Math.round(1.5 * u)));      // 縁の光
    g.fillStyle = 'rgba(30,16,12,0.55)'; g.fillRect(0, deck + Math.round(1.5 * u), W, Math.max(1, Math.round(2 * u)));
    g.strokeStyle = 'rgba(36,20,16,0.35)'; g.lineWidth = Math.max(1, u * 0.6);
    let y = deck + 6 * u, step = 9 * u;
    while (y < H) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); y += step; step *= 1.45; }
    for (let i = -8; i <= 8; i++) {   // 奥（光の方）に向かってすぼまる目地
      const xb = lightX + i * 60 * u, xt = lightX + (xb - lightX) * (deck - vy) / (H - vy);
      g.beginPath(); g.moveTo(xt, deck + 2 * u); g.lineTo(xb, H); g.stroke();
    }
    // 人物の影
    const shadow = (cx, rx) => {
      const sy = ay + ah * 0.985;
      const sg = g.createRadialGradient(cx, sy, 0, cx, sy, rx);
      sg.addColorStop(0, 'rgba(14,10,12,0.55)'); sg.addColorStop(1, 'rgba(14,10,12,0)');
      g.save(); g.translate(cx, sy); g.scale(1, 0.2); g.translate(-cx, -sy);
      g.fillStyle = sg; g.beginPath(); g.arc(cx, sy, rx, 0, Math.PI * 2); g.fill(); g.restore();
    };
    if (img.complete && !img.dataset.fallback) { shadow(ax + aw * 0.25, aw * 0.24); shadow(ax + aw * 0.75, aw * 0.2); }
    // ボタンの下を暗くして読みやすく
    const btn = document.querySelector('.title-buttons').getBoundingClientRect();
    const by = (btn.top - cr.top) * dpr;
    gr = g.createLinearGradient(0, by - 30 * dpr, 0, H);
    gr.addColorStop(0, 'rgba(8,28,36,0)'); gr.addColorStop(0.35, 'rgba(8,28,36,0.6)'); gr.addColorStop(1, 'rgba(6,20,26,0.88)');
    g.fillStyle = gr; g.fillRect(0, by - 30 * dpr, W, H - by + 30 * dpr);
    // 四隅を少し暗く
    gr = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,8,14,0.55)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }

  // ================= モーダル =================
  /* opts: { title, html, buttons:[{label, cls, onClick(close), keep}], onClose, noClose, right } */
  function modal(opts) {
    const back = document.createElement('div');
    back.className = 'back';
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = (opts.title ? `<h2>${opts.title}${opts.right ? `<span class="right">${opts.right}</span>` : ''}</h2>` : '') +
      (opts.tabs ? '<div class="tabs"></div>' : '') + '<div class="modal-body"></div><div class="modal-buttons"></div>';
    back.appendChild(m);
    $('modal-root').appendChild(back);
    const body = m.querySelector('.modal-body');
    if (typeof opts.html === 'string') body.innerHTML = opts.html; else if (opts.html) body.appendChild(opts.html);
    if (UI.stopHold) UI.stopHold();
    const handle = { el: m, body, back, opts, close };
    // モーダルを開いたタップの「後から来るclick」で誤って閉じたり押したりしないよう、
    // モーダル内で押し始めた操作（またはキーボード）だけを受け付ける
    let armed = false;
    back.addEventListener('pointerdown', () => { armed = true; });
    handle.accept = (e) => armed || e.detail === 0;
    back.addEventListener('click', (e) => { if (!handle.accept(e)) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    UI.modals.push(handle);
    const btns = m.querySelector('.modal-buttons');
    const buttons = opts.buttons || [{ label: '閉じる' }];
    if (!buttons.length) btns.remove();
    for (const b of buttons) {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.cls) el.className = b.cls;
      if (b.disabled) el.disabled = true;
      el.addEventListener('click', (e) => {
        if (!handle.accept(e)) return;
        AU.sfx('tap');
        if (b.onClick) { const r = b.onClick(handle); if (r === false || b.keep) return; }
        close();
      });
      btns.appendChild(el);
    }
    if (!opts.noClose) back.addEventListener('click', (e) => { if (e.target === back && handle.accept(e)) close(); });
    function close() {
      const i = UI.modals.indexOf(handle);
      if (i < 0) return;
      UI.modals.splice(i, 1);
      back.remove();
      if (opts.onClose) opts.onClose();
    }
    if (opts.onOpen) opts.onOpen(handle);
    return handle;
  }
  UI.modal = modal;
  function closeAllModals() { while (UI.modals.length) UI.modals[UI.modals.length - 1].close(); }
  function topModal() { return UI.modals[UI.modals.length - 1]; }

  function confirmBox(title, html, okLabel, onOk, cancelLabel) {
    return modal({ title, html, buttons: [
      { label: cancelLabel || 'やめる' },
      { label: okLabel || 'はい', cls: 'primary', onClick: () => { onOk(); } },
    ] });
  }
  function info(title, html, cb) { return modal({ title, html, onClose: cb }); }

  // 会話：lines = [[who, text], ...]
  /* 会話。lines：[話す人, セリフ]。話す人は D.CAST のID、ボスは 'boss:敵ID'、'narration' は語り（顔絵なし）。
   * opts.skip が true なら「スキップ」ボタン（再挑戦時など一度見た会話）。 */
  function speaker(w) {
    if (String(w).startsWith('boss:')) { const E = D.ENEMIES[w.slice(5)]; return { name: E ? E.name : '', portrait: w }; }
    const c = D.CAST[w] || D.CAST.villager;
    return { name: c.name, portrait: c.portrait && (TS.ASSETS && TS.ASSETS.portraits && TS.ASSETS.portraits[w] ? w : c.portrait) };
  }
  const fillNames = (t) => String(t).replace(/\{(\w+)\}/g, (m, k) => (D.CAST[k] ? D.CAST[k].name : m));
  function talk(lines, done, opts) {
    let i = 0;
    lines = lines.filter(Boolean);
    const buttons = [{ label: '▶ つぎへ', cls: 'primary', keep: true, onClick: () => { i++; if (i >= lines.length) { h.close(); } else show(); } }];
    if (opts && opts.skip && lines.length > 1) buttons.unshift({ label: 'スキップ', onClick: () => {} });
    const h = modal({
      html: '<div class="talk"><img alt=""><div><div class="who"></div><div class="txt"></div></div></div>',
      buttons, noClose: true, onClose: done,
    });
    const img = h.body.querySelector('img'), who = h.body.querySelector('.who'), txt = h.body.querySelector('.txt');
    const ports = {};
    function show() {
      const [w, t] = lines[i];
      const sp = speaker(w);
      if (sp.portrait) { img.style.display = ''; img.src = ports[sp.portrait] || (ports[sp.portrait] = SP.portraitURL(sp.portrait, 72)); }
      else img.style.display = 'none';
      h.body.querySelector('.talk').classList.toggle('narration', !sp.portrait);
      who.textContent = sp.name;
      txt.textContent = fillNames(t);
    }
    show();
    h.body.addEventListener('click', (e) => { if (h.accept(e)) { const b = h.el.querySelector('.modal-buttons button'); if (b) b.click(); } });
    return h;
  }

  // 物語の会話：一度見たものは2回目から「スキップ」できる
  function storyTalk(key, lines, done) {
    const st = UI.S.village.story;
    const seen = !!st.seen[key];
    st.seen[key] = true; save();
    talk(lines, done, { skip: seen });
  }

  function toast(msg, cls) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'show ' + (cls || '');
    clearTimeout(UI.toastTimer);
    UI.toastTimer = setTimeout(() => { t.className = ''; }, 1300);
  }
  function flash() {
    const f = $('flash');
    f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }

  // ================= 遊び方 =================
  const HELP_HTML = `<div class="help">
    <h3>目的</h3>
    <p>師匠マスターヤナイが大魔王を封じた遺跡へ、勇者たけが挑む。第1〜5章は、1階から30階をめざし、30階で待つ魔王軍の将を倒す。倒すと報酬と帰還口が現れ、村へ帰ると次の章へ進む。第5章のあと、35階の大魔王に挑む最終章が始まる。</p>
    <p>途中で帰還しても、倒れても、章はそのまま（クリアした章をやり直すことはない）。拾ったお宝はサイの店で売って村を復興させ、次の挑戦の準備をしよう。</p>
    <h3>ボス戦</h3>
    <ul>
      <li>大技の前には必ず予告がある：<b>赤いマス</b>（次の行動で攻撃）と、<b>色つきの床の印</b>（数字は発動までに動ける回数。0で発動）。印のない床へ移ればかわせる。</li>
      <li>大技のあとには隙ができる。反撃のチャンス。ボスにも眠り・鈍足が短く効く。</li>
      <li>分身には影がない。霧の中でも予告と印は見える。拘束（移動できない）の間も、攻撃・道具・足踏みはできる。</li>
      <li>章ごとにお店へ並ぶ護符・お香が、そのボスへの備えになる。</li>
    </ul>
    <h3>操作</h3>
    <ul>
      <li><b>方向ボタン</b>（3×3）：8方向に1マス移動。斜めも1ターン。押し続けると連続で進む（敵が隣に来た・道具や階段の上などで止まる）。</li>
      <li>敵のいる方向へ動くと攻撃（斜めの敵にも攻撃できる）。押しっぱなしで攻撃を繰り返すことはない。</li>
      <li>壁の角をはさんだ斜めには移動・攻撃できない（敵も同じ）。</li>
      <li><b>中央の「向き」</b>（PCはF）：タップでオン/オフ。オンの間は方向ボタンで向きだけ変わる（移動・攻撃なし、時間も進まない）。杖などはこの向きに使う。</li>
      <li><b>「向き」を長押し</b>（PCはRを押し続ける）：休息（連続足踏み）。1回ごとに普通に1ターン待ち、自然回復でHPが戻る。敵の行動や満腹度も普通に進む。指を離す・HP全回復・敵が見える・ダメージ・満腹度が少ない・毒のときは止まる。</li>
      <li><b>足踏み</b>（スペース）：その場で1ターンだけ待つ。</li>
      <li>PC：矢印キー/WASDで上下左右、Q・E・Z・C（またはテンキー7・9・1・3）で斜め。</li>
      <li><b>ダッシュ</b>（PCはX）：オンにして方向ボタンを押し続けると、その方向へ速く進む（1マスごとに1ターン）。指を離すとすぐ止まる。新しい敵・ダメージ・敵が隣・壁・分かれ道・道具・階段・帰還地点・HPや満腹度の危険で自動で止まり、止まった理由が表示される。押し直すと再び進む。</li>
      <li><b>足元</b>（Enter）：階段を降りる・道具を拾う・帰還する。</li>
      <li><b>道具</b>（I）：使う・装備する・置く・整理。<b>メニュー</b>（Esc）：地図・説明・音。</li>
    </ul>
    <h3>ターン</h3>
    <ul>
      <li>移動・攻撃・待つ・道具を使う・装備変更で1ターン。そのあと敵が1回ずつ動く。</li>
      <li>壁にぶつかる、メニューや道具の説明を見るだけなら時間は進まない。</li>
    </ul>
    <h3>満腹度とHP</h3>
    <ul>
      <li>満腹度は行動するたびに少しずつ減る。食べ物で回復。</li>
      <li>満腹度があればHPはゆっくり回復。0になるとHPが減っていく。</li>
    </ul>
    <h3>帰還と敗北</h3>
    <ul>
      <li><b>帰還の巻物</b>（出発時に1枚無料）を使うと、その場で持ち物とお金を持って村へ帰れる。</li>
      <li>3階ごと（3・6・9…27階）に<b>帰還の碑</b>がある。10・20階の守り手を倒すと、帰還口と下への階段が開く。</li>
      <li>帰って再出発すると1階から。帰る・進むの判断が大事。探索の途中で中断しても、続きから再開できる。</li>
      <li>倒れると、持ち物と探索中のお金を失う。村の資金・倉庫・施設は残る。</li>
    </ul>
    <h3>村</h3>
    <ul>
      <li><b>サイの店</b>：お宝を売る・食料や薬・武器を買う。旅人のおにぎりは無料で借りられる。</li>
      <li><b>倉庫</b>：大事な物を預けておけば、倒れても失わない（20→40→60→80枠）。</li>
      <li><b>村の発展</b>：施設と飾りの価格・効果・解放条件を見て建てる。画面上に「次の目標」が出る。</li>
      <li><b>鍛冶屋</b>：武器・盾を強化（設備しだいで+3→+5→+8。+4以降は深い階の素材が必要）。</li>
      <li><b>サイの食堂</b>：出発前に料理を1品。次の探索だけ能力が上がる。</li>
      <li><b>お宝展示室</b>：珍しいお宝を売らずに寄贈して飾れる。集めると称号と特別な飾りが解放。</li>
      <li>深い階ほど高価なお宝と素材が見つかる。素材は持ち帰ると素材箱へ。</li>
    </ul></div>`;
  function showHelp(cb) { modal({ title: '遊び方', html: HELP_HTML, onClose: cb }); }

  // ================= タイトル =================
  function bindTitle() {
    $('btn-continue').addEventListener('click', () => { AU.sfx('tap'); continueGame(); });
    $('btn-newgame').addEventListener('click', () => {
      AU.sfx('tap');
      if (SV.exists()) {
        confirmBox('はじめから', '<div class="warnbox">今のセーブデータ（村・倉庫・探索途中）はすべて消えます。本当にはじめからにしますか？</div>', '消してはじめる', () => {
          setTimeout(() => confirmBox('最終確認', 'セーブデータを削除します。元には戻せません。', '削除する', newGame), 0);
        });
      } else newGame();
    });
    $('btn-help-title').addEventListener('click', () => { AU.sfx('tap'); showHelp(); });
    $('btn-sound-title').addEventListener('click', () => { toggleSound(); });
  }
  function showTitle() {
    closeAllModals();
    const has = SV.exists();
    $('btn-continue').style.display = has ? '' : 'none';
    $('btn-newgame').classList.toggle('primary', !has); // 「つづきから」がないときは「はじめから」を目立たせる
    $('btn-sound-title').textContent = '音：' + (UI.S.settings.sound ? 'オン' : 'オフ');
    showScreen('title');
  }
  function toggleSound() {
    UI.S.settings.sound = !UI.S.settings.sound;
    AU.setEnabled(UI.S.settings.sound);
    if (UI.S.settings.sound) { AU.unlock(); AU.sfx('tap'); }
    $('btn-sound-title').textContent = '音：' + (UI.S.settings.sound ? 'オン' : 'オフ');
    save();
  }
  function newGame() {
    const sound = UI.S.settings.sound;
    SV.clear();
    UI.S = G.newState();
    UI.S.settings.sound = sound;
    UI.started = true;
    save();
    showScreen('village');
    talk(D.STORY.intro.concat([['sai', 'おにぎりは無料で持たせるね。武器は遺跡で拾えるし、お金がたまったらお店でも買えるよ。危なくなったら帰還の巻物で帰ってきて！']]), () => {
      UI.S.village.seenIntro = true; UI.S.village.story.introDone = true; save();
      showHelp(() => info('はじめの一歩', '<p>下の<b>「遺跡へ出発」</b>から探索に出かけよう。</p><p class="note">はじめは素手です。出発前にサイの店で<b>旅人のおにぎりを無料で借りられます</b>。武器や盾は遺跡で拾えます。</p>'));
    });
  }
  function continueGame() {
    const L = SV.load();
    if (!L) { info('つづきから', 'セーブデータを読み込めませんでした。'); return; }
    UI.S = L;
    UI.started = true;
    AU.setEnabled(UI.S.settings.sound);
    if (UI.S.run) {
      showScreen('dungeon');
      if (UI.S.run.over) handleRunOver();
      else {
        pushLog(); toast('地下' + UI.S.run.floor + '階から再開');
        if (UI.S.run.final && UI.S.run.final.stage === 'prep') setTimeout(() => finalCutscene(), 300);
      }
    } else { showScreen('village'); showStoryPending(); }
  }

  // ================= 村 =================
  function bindVillage() {
    for (const b of document.querySelectorAll('.vbuttons .fac')) {
      b.addEventListener('click', () => { AU.sfx('tap'); openFacility(b.dataset.fac); });
    }
    $('v-menu').addEventListener('click', () => { AU.sfx('tap'); villageMenu(); });
    $('village-canvas').addEventListener('click', (e) => {
      if (UI.modals.length || !UI.vview) return;
      const r = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const inside = (h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
      // 人 → 施設の建物 → 像・建設予定地 → 地面 の順に調べる
      const h = UI.vview.hits.find((h) => h.kind === 'npc' && inside(h)) || UI.vview.hits.find((h) => h.kind !== 'npc' && inside(h));
      AU.sfx('tap');
      if (h && h.kind === 'site') { toast('学校・図書館は建設予定地です（まだ使えません）'); return; }
      if (h && h.kind === 'statue') { walkTo(Math.abs(UI.walker.x - 9) <= Math.abs(UI.walker.x - 10) ? 9 : 10, 13, 'up', statueTalk); return; }
      if (h) { const f = UI.vview.fac.find((f) => f.id === h.id); if (f) { walkTo(f.at[0], f.at[1], f.face, () => openFacility(f.id)); return; } }
      const t = UI.vview.tile(x, y);
      walkTo(t.x, t.y);
    });
  }

  /* 村を歩く：たけの位置は村の画面の中だけのもの（保存しない）。タップした場所・施設まで道をさがして1マスずつ歩く */
  function resetWalker() {
    if (!UI.walker) UI.walker = { x: TS.Village.START.x, y: TS.Village.START.y, dir: TS.Village.START.dir, moving: false, path: [] };
    UI.walker.path = []; UI.walker.goal = null; UI.walker.onArrive = null;
  }
  const VSTEP = 140;
  function walkTo(tx, ty, face, onArrive) {
    const w = UI.walker;
    if (!w || !UI.vview) return false;
    const sx = w.x, sy = w.y;
    const p = TS.Village.path(UI.vview.solid, sx, sy, tx, ty);
    if (!p) { if (!onArrive) toast('そこへは行けない'); return false; }
    w.path = p; w.goal = p.length ? { x: tx, y: ty } : null; w.face = face || null; w.onArrive = onArrive || null;
    if (!w.moving) tickWalker(performance.now());
    return true;
  }
  function tickWalker(now) {
    const w = UI.walker;
    if (!w) return;
    if (w.moving && now - w.t0 < w.dur) return;
    w.moving = false;
    if (UI.modals.length) { w.path = []; w.goal = null; return; }
    if (w.path && w.path.length) {
      const n = w.path.shift(), dx = n.x - w.x, dy = n.y - w.y;
      w.from = { x: w.x, y: w.y }; w.x = n.x; w.y = n.y;
      w.dir = dx ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      w.t0 = now; w.dur = dx && dy ? VSTEP * 1.4 : VSTEP; w.moving = true;
      return;
    }
    w.goal = null;
    if (w.face) { w.dir = w.face; w.face = null; }
    if (w.onArrive) { const f = w.onArrive; w.onArrive = null; f(); }
  }
  // キー操作：1マス歩く。行き止まりが施設の入口なら入る
  function villageStep(dir) {
    const w = UI.walker, v = UI.vview;
    if (!w || !v || w.moving || UI.modals.length) return;
    const [dx, dy] = G.DIRS[dir];
    if (dx && dy) return;
    w.dir = dir;
    const nx = w.x + dx, ny = w.y + dy;
    const f = v.fac.find((f) => f.at[0] === w.x && f.at[1] === w.y && (f.face === dir));
    if (f) { openFacility(f.id); return; }
    if (nx < 0 || ny < 0 || nx >= TS.Village.MW || ny >= TS.Village.MH || v.solid[ny * TS.Village.MW + nx]) return;
    w.path = [{ x: nx, y: ny }]; tickWalker(performance.now());
  }
  function statueTalk() {
    const L = D.STORY.yanaiMemories || [];
    UI.statueN = ((UI.statueN || 0) + 1) % Math.max(1, L.length);
    talk([['narration', 'マスターヤナイの像。村を守った師匠をしのんで、みんなで建てた。'], L[UI.statueN] || ['yanai', '……']], null, { skip: false });
  }
  function updateVillageHud() {
    const V = UI.S.village;
    const ss = G.storyStatus(V);
    $('v-chapter').innerHTML = ss.cleared
      ? `<b>★ 全章クリア</b>　最終章の35階には、何度でも挑戦できます`
      : `<b>${esc(ss.name)}「${esc(ss.title)}」</b>　次のボス：<b>${esc(ss.bossName)}</b>　目標：<b>地下${ss.goal}階</b>`;
    $('v-funds').textContent = V.funds;
    $('v-stage').textContent = G.title(V) || D.VILLAGE_STAGES[Math.min(3, V.stage)].name;
    $('v-stage-lbl').textContent = G.title(V) ? '称号' : '村';
    $('v-best').textContent = V.bestFloor ? '地下' + V.bestFloor + '階' : '-';
    document.querySelector('.fac[data-fac="smith"]').classList.toggle('locked', !V.smithLv);
    document.querySelector('.fac[data-fac="diner"]').classList.toggle('locked', !V.diner);
    document.querySelector('.fac[data-fac="museum"]').classList.toggle('locked', !V.museum);
    // 次に目指せる買い物
    const g = G.nextGoals(UI.S);
    const mats = Object.entries(V.materials || {}).filter(([, n]) => n > 0).map(([m, n]) => D.ITEMS[m].name.replace(/の?欠?片$/, '') + n).join(' ');
    let goal;
    if (g.can.length) goal = `<b class="ok">✨ ${esc(g.can[0].name)}</b> が建てられます（${g.can[0].price}G）${g.can.length > 1 ? ` ほか${g.can.length - 1}件` : ''}`;
    else if (g.next) goal = `🎯 次の目標：<b>${esc(g.next.name)}</b>（${g.next.price}G・あと${g.need}G）`;
    else goal = '🏆 すべての施設が完成しました！';
    if (V.meal) goal += `<br>🍛 次の探索の料理：${esc(D.MEALS[V.meal].name)}`;
    if (mats) goal += `<br>🧱 素材：${esc(mats)}`;
    $('v-goal').innerHTML = goal;
  }
  function villageChanged() { updateVillageHud(); save(); }

  function openFacility(id) {
    if (UI.modals.length) return;
    switch (id) {
      case 'shop': return openShop('buy');
      case 'storage': return openStorage('in');
      case 'smith': return openSmith();
      case 'diner': return openDiner();
      case 'museum': return openMuseum();
      case 'develop': return openDevelop();
      case 'bag': return openVillageBag();
      case 'depart': return openDepart();
    }
  }

  function itemRow(it, right, extra) {
    const d = G.def(it);
    const tags = (it.eq ? '<span class="eq">装備</span>' : '') + esc(G.itemName(it)) + (d.loan ? '<span class="loan">貸出</span>' : '');
    return `<button class="row ${extra || ''}" data-uid="${it.uid}"><img src="${SP.iconURL(d)}" alt=""><span class="nm">${tags}<small>${esc(shortDesc(it))}</small></span><span class="pr">${right || ''}</span></button>`;
  }
  function defRow(id, right, extra) {
    const d = D.ITEMS[id];
    return `<button class="row ${extra || ''}" data-id="${id}"><img src="${SP.iconURL(d)}" alt=""><span class="nm">${esc(d.name)}<small>${esc(d.desc)}</small></span><span class="pr">${right || ''}</span></button>`;
  }
  function shortDesc(it) {
    const d = G.def(it);
    if (d.type === 'weapon') return '攻撃力+' + (d.atk + (it.plus || 0));
    if (d.type === 'shield') return '防御力+' + (d.def + (it.plus || 0));
    return d.desc;
  }

  // ---- サイの店 ----
  function openShop(tab) {
    const V = UI.S.village;
    const h = modal({ title: 'サイの店', right: V.funds + 'G', tabs: true, buttons: [{ label: '閉じる' }] });
    const tabs = h.el.querySelector('.tabs');
    tabs.innerHTML = '<button data-t="buy">買う</button><button data-t="sell">売る</button><button data-t="loan">貸出</button>';
    tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { AU.sfx('tap'); render(b.dataset.t); }));
    function render(t) {
      tab = t;
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
      h.el.querySelector('h2 .right').textContent = V.funds + 'G';
      let html = '';
      if (t === 'buy') {
        html += `<p class="note">バッグ ${V.bag.length}/${D.BAG_SIZE}　食料と回復薬はここで買えます。</p><div class="list">`;
        for (const id of G.shopStock(V)) html += defRow(id, D.ITEMS[id].price + 'G', V.funds < D.ITEMS[id].price ? 'disabled' : '');
        html += '</div>';
        if (V.stage < 3) html += '<p class="note">村が発展すると品ぞろえが増えます。</p>';
      } else if (t === 'sell') {
        html += '<p class="note">売ったお金は村の資金になり、探索で倒れても失いません。</p><div class="list">';
        if (!V.bag.length) html += '<p>バッグは空です。</p>';
        for (const it of V.bag) html += itemRow(it, (G.canSell(it) ? G.sellPrice(it) + 'G' : '売れない') + (G.canDonate(V, it) ? '<br><small>展示室に未展示</small>' : ''), G.canSell(it) ? '' : 'disabled');
        html += '</div>';
      } else {
        const ls = G.loanStatus(UI.S);
        html += '<p>お金がなくても大丈夫。おにぎりはサイが無料で持たせてくれます。</p><div class="list">';
        html += defRow('loan_rice', ls.food ? '無料' : '持っている', ls.food ? '' : 'disabled');
        html += '</div><p class="note">貸出品は売ったり預けたりできません。持っていないときに1つ借りられます。</p>';
      }
      h.body.innerHTML = html;
      h.body.querySelectorAll('.row').forEach((r) => r.addEventListener('click', () => {
        AU.sfx('tap');
        if (t === 'buy') {
          const id = r.dataset.id, d = D.ITEMS[id];
          confirmBox('買う', `<p><b>${esc(d.name)}</b>を <b>${d.price}G</b> で買いますか？</p><p class="note">${esc(d.desc)}</p><p class="note">資金 ${V.funds}G → ${V.funds - d.price}G</p>`, '買う', () => {
            const res = G.buy(UI.S, id);
            if (res.ok) AU.sfx('buy');
            villageChanged(); render(tab);
            if (!res.ok) info('サイの店', res.msg);
          });
        } else if (t === 'sell') {
          const it = V.bag.find((i) => i.uid === +r.dataset.uid);
          if (!it) return;
          if (!G.canSell(it)) { info('売れません', esc(G.def(it).name) + 'は売ることができません。'); return; }
          const p = G.sellPrice(it);
          confirmBox('売る', `<p><b>${esc(G.itemName(it))}</b>を <b>${p}G</b> で売りますか？</p>${it.eq ? '<p class="warnbox">装備中の品です。</p>' : ''}<p class="note">資金 ${V.funds}G → ${V.funds + p}G</p>`, '売る', () => {
            const res = G.sell(UI.S, it.uid);
            if (res.ok) AU.sfx('gold');
            villageChanged(); render(tab);
          });
        } else {
          const res = G.takeLoan(UI.S, 'food');
          if (res.ok) AU.sfx('pickup');
          villageChanged(); render(tab);
          if (!res.ok) info('貸出', res.msg);
        }
      }));
    }
    render(tab || 'buy');
  }

  // ---- 倉庫 ----
  function openStorage(tab) {
    const V = UI.S.village;
    const h = modal({ title: '倉庫', right: G.storageSize(V) + '枠', tabs: true, buttons: [
      { label: '整理', keep: true, onClick: () => { sortList(tab === 'in' ? V.bag : V.storage); render(tab); } },
      { label: '閉じる' }] });
    const tabs = h.el.querySelector('.tabs');
    tabs.innerHTML = '<button data-t="in">預ける</button><button data-t="out">取り出す</button>';
    tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { AU.sfx('tap'); render(b.dataset.t); }));
    function render(t) {
      tab = t;
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
      let html = `<p class="note">「整理」は${t === 'in' ? 'バッグ' : '倉庫'}を種類順に並べます。<br>倉庫 ${V.storage.length}/${G.storageSize(V)}　バッグ ${V.bag.length}/${D.BAG_SIZE}</p><div class="list">`;
      const list = t === 'in' ? V.bag : V.storage;
      if (!list.length) html += '<p>' + (t === 'in' ? 'バッグは空です。' : '倉庫は空です。') + '</p>';
      for (const it of list) html += itemRow(it, t === 'in' ? (G.canStore(it) ? '預ける' : '不可') : '出す', t === 'in' && !G.canStore(it) ? 'disabled' : '');
      html += '</div>';
      const nx = ['storage2', 'storage3', 'storage4'].map(G.facility).find((f) => !G.hasFacility(V, f.id));
      if (nx) html += `<p class="note">次の拡張：「${esc(nx.name)}」${nx.price}G（村の発展から）</p>`;
      h.body.innerHTML = html;
      h.body.querySelectorAll('.row').forEach((r) => r.addEventListener('click', () => {
        const res = t === 'in' ? G.deposit(UI.S, +r.dataset.uid) : G.withdraw(UI.S, +r.dataset.uid);
        AU.sfx(res.ok ? 'pickup' : 'bump');
        villageChanged(); render(t);
        if (!res.ok) info('倉庫', res.msg);
      }));
    }
    render(tab);
  }

  // ---- 鍛冶屋 ----
  function matsText(mats) { return Object.entries(mats || {}).map(([m, n]) => esc(D.ITEMS[m].name) + '×' + n).join('、'); }
  function materialsBox(V) {
    const all = ['amber_shard', 'bronze_shard', 'crystal_shard', 'gold_leaf'];
    return '<div class="kv">' + all.map((m) => `<span>${esc(D.ITEMS[m].name)}</span><span>${V.materials[m] || 0}個 <small class="note">（${D.ITEMS[m].depth}階〜）</small></span>`).join('') + '</div>';
  }
  function openSmith() {
    const V = UI.S.village;
    if (!V.smithLv) {
      const f = G.facility('smith1');
      info('鍛冶屋', `<p>鍛冶屋はまだありません。</p><p>「村の発展」で<b>${esc(f.name)}</b>（${f.price}G）を建てると、武器と盾を強化できるようになります。</p>`);
      return;
    }
    const h = modal({ title: '鍛冶屋', right: V.funds + 'G', buttons: [{ label: '閉じる' }] });
    function render() {
      h.el.querySelector('h2 .right').textContent = V.funds + 'G';
      const list = V.bag.concat(V.storage).filter((i) => ['weapon', 'shield'].includes(G.def(i).type));
      const nx = ['smith2', 'smith3'].map(G.facility).find((f) => !G.hasFacility(V, f.id));
      let html = `<p>設備：<b>Lv${V.smithLv}</b>　強化の上限：<b>+${G.smithMax(V)}</b>${nx ? `<br><span class="note">次の設備「${esc(nx.name)}」${nx.price}G＋${matsText(nx.mats)}</span>` : ''}</p>`;
      html += '<details><summary class="note">素材箱を見る</summary>' + materialsBox(V) + '</details><div class="list">';
      if (!list.length) html += '<p>強化できる武器・盾がありません（バッグと倉庫の品が対象）。</p>';
      for (const it of list) {
        const ok = G.canSmith(V, it);
        const m = G.smithMats(it);
        const right = ok ? G.smithCost(it) + 'G' + (Object.keys(m).length ? '<br><small>' + matsText(m) + '</small>' : '') : (G.def(it).loan ? '貸出品' : (it.plus || 0) >= D.SMITH.maxPlus ? '最大' : '上限');
        html += itemRow(it, right, ok ? '' : 'disabled');
      }
      h.body.innerHTML = html + '</div>';
      h.body.querySelectorAll('.row').forEach((r) => r.addEventListener('click', () => {
        const it = list.find((i) => i.uid === +r.dataset.uid);
        if (!G.canSmith(V, it)) { if (!G.def(it).loan && (it.plus || 0) < D.SMITH.maxPlus) info('鍛冶屋', '今の設備ではここまで。「村の発展」で鍛冶屋を拡張しよう。'); return; }
        const cost = G.smithCost(it), m = G.smithMats(it);
        confirmBox('強化', `<p><b>${esc(G.itemName(it))}</b>を <b>${cost}G</b>${Object.keys(m).length ? '＋' + matsText(m) : ''} で+${(it.plus || 0) + 1}に強化しますか？</p><p class="note">資金 ${V.funds}G → ${V.funds - cost}G</p>`, '強化する', () => {
          const res = G.smith(UI.S, it.uid);
          AU.sfx(res.ok ? 'levelup' : 'bump');
          villageChanged(); render();
          if (!res.ok) info('鍛冶屋', res.msg);
        });
      }));
    }
    render();
  }

  // ---- 村の発展（施設と飾り） ----
  const BUILD_TALK = {
    storage2: [['sai', '倉庫が広くなったよ！灯りも増えて、村がにぎやかになってきた。'], ['take', 'お宝をたくさん預けられるね。']],
    smith1: [['sai', '鍛冶屋さんと屋台が来てくれたよ！夕方はいい匂いがするね。'], ['take', '装備を鍛えて、もっと奥まで行けそうだ！']],
    diner: [['sai', '食堂を開いたよ！出発の前に、私の料理を食べていってね。'], ['take', 'サイのガパオ、楽しみだなあ。']],
    museum: [['sai', '展示室ができたよ。珍しいお宝はここに飾れるんだ。'], ['take', '売るか飾るか、迷っちゃうね。']],
    storage3: [['sai', '倉庫を増築したよ。二階もあるんだ。'], ['take', 'これで深い階のお宝もしまえるね。']],
    smith2: [['sai', '鍛冶屋さん、大きな炉に大喜びだったよ。'], ['take', '+5まで鍛えられるのか…！']],
    storage4: [['sai', '大倉庫が完成！村で一番大きな建物だよ。'], ['take', 'すごいなあ。サイのお店も有名になってきたね。']],
    smith3: [['sai', '黄金の炉に火が入ったよ。最高の装備を作れるって！'], ['take', '30階の守り手にも負けないぞ。']],
    lanterns: [['sai', '灯籠が並ぶと、夕方の水路がきれいだね。'], ['take', '遺跡から帰るとき、遠くからでも村が見えるよ。']],
    garden: [['sai', '蓮の庭、気に入ってくれた？'], ['take', 'いい香り。ほっとするね。']],
    stalls: [['sai', '屋台通りができたよ！夜までにぎやかだね。'], ['take', 'もち米の屋台、毎日寄っちゃいそう。']],
    bridge: [['sai', '赤い橋がかかったよ。向こう岸まで散歩できるね。'], ['take', '今度いっしょに渡ろう。']],
    statue: [['sai', '象の像、展示室を見に来た人がみんな触っていくよ。'], ['take', '幸運のおまじないかな。']],
    fountain: [['sai', '噴水ができて、子どもたちが大はしゃぎ！'], ['take', '村がどんどん明るくなるね。']],
    gate: [['sai', '黄金の門だよ。遺跡に向かうたけを見送る門。'], ['take', 'くぐるたびに、気合いが入るよ。']],
  };
  function facilityRow(f) {
    const V = UI.S.village, st = G.facilityStatus(UI.S, f.id);
    const status = st.built ? '<span class="ok">✔ 完成</span>'
      : !st.unlocked ? '🔒 ' + st.missing.map((r) => esc(D.REQ_TEXT[r])).join('・')
        : st.lackMats.length ? '素材不足：' + st.lackMats.map(([m, n]) => esc(D.ITEMS[m].name) + '×' + n).join('、')
          : st.affordable ? '<span class="ok">建てられます</span>' : 'あと' + (f.price - V.funds) + 'G';
    const cls = st.built ? 'done' : st.unlocked && st.affordable && !st.lackMats.length ? 'next' : '';
    return `<button class="stage ${cls}" data-id="${f.id}"><div><b>${esc(f.name)}</b>　<span class="price">${st.built ? '' : f.price + 'G' + (f.mats ? '＋' + matsText(f.mats) : '')}</span></div><div class="note">${esc(f.desc)}</div><div class="cond">${status}</div></button>`;
  }
  function openDevelop(tab) {
    const V = UI.S.village;
    const h = modal({ title: '村の発展', right: V.funds + 'G', tabs: true, buttons: [{ label: '閉じる' }] });
    const tabs = h.el.querySelector('.tabs');
    tabs.innerHTML = '<button data-t="facility">施設</button><button data-t="decor">村の飾り</button>';
    tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { AU.sfx('tap'); render(b.dataset.t); }));
    function render(t) {
      tab = t;
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
      h.el.querySelector('h2 .right').textContent = V.funds + 'G';
      let html = t === 'facility' ? '<p class="note">価格・効果・解放条件を確認して建てられます。</p>' : '<p class="note">好きな飾りを選んで村を整えよう。お宝を寄贈すると特別な飾りが解放されます。</p>';
      html += '<div class="list">' + D.FACILITIES.filter((f) => f.kind === t).map(facilityRow).join('') + '</div>';
      h.body.innerHTML = html;
      h.body.querySelectorAll('.stage').forEach((r) => r.addEventListener('click', () => {
        const f = G.facility(r.dataset.id), st = G.facilityStatus(UI.S, f.id);
        if (st.built) return;
        if (!st.unlocked || st.lackMats.length || !st.affordable) { info(f.name, `<p>${esc(f.desc)}</p><p>価格：${f.price}G${f.mats ? '＋' + matsText(f.mats) : ''}</p><p class="warnbox">${!st.unlocked ? '解放条件：' + st.missing.map((x) => esc(D.REQ_TEXT[x])).join('・') : st.lackMats.length ? '素材が足りません' : '資金が足りません（あと' + (f.price - V.funds) + 'G）'}</p>`); return; }
        confirmBox(f.kind === 'decor' ? '村の飾り' : '施設', `<p><b>${esc(f.name)}</b>を <b>${f.price}G</b>${f.mats ? '＋' + matsText(f.mats) : ''} で作りますか？</p><p class="note">${esc(f.desc)}</p><p class="note">資金 ${V.funds}G → ${V.funds - f.price}G</p>`, '作る', () => {
          const res = G.buildFacility(UI.S, f.id);
          if (res.ok) { AU.sfx('levelup'); villageChanged(); render(tab); talk(BUILD_TALK[f.id] || [['sai', res.msg]]); }
          else info('村の発展', res.msg);
        });
      }));
    }
    render(tab || 'facility');
  }

  // ---- サイの食堂 ----
  function openDiner() {
    const V = UI.S.village;
    if (!V.diner) { const f = G.facility('diner'); info('サイの食堂', `<p>食堂はまだありません。</p><p>「村の発展」で<b>${esc(f.name)}</b>（${f.price}G）を建てると、出発前に料理を食べられます。</p>`); return; }
    const h = modal({ title: 'サイの食堂', right: V.funds + 'G', buttons: [{ label: '閉じる' }] });
    function render() {
      h.el.querySelector('h2 .right').textContent = V.funds + 'G';
      let html = `<p class="note">料理は次の探索だけ効果があります。1品だけ選べて、重ねがけはできません（帰還・敗北で終わります）。</p>`;
      html += V.meal ? `<div class="okbox">注文済み：<b>${esc(D.MEALS[V.meal].name)}</b> — ${esc(D.MEALS[V.meal].desc)}</div>` : '';
      html += '<div class="list">' + Object.entries(D.MEALS).map(([id, m]) => `<button class="row ${V.meal === id || V.funds < m.price ? 'disabled' : ''}" data-id="${id}"><span class="dish">🍛</span><span class="nm">${esc(m.name)}<small>${esc(m.desc)}</small></span><span class="pr">${m.price}G</span></button>`).join('') + '</div>';
      h.body.innerHTML = html;
      h.body.querySelectorAll('.row').forEach((r) => r.addEventListener('click', () => {
        const id = r.dataset.id, m = D.MEALS[id];
        if (V.meal === id) return;
        confirmBox('料理', `<p><b>${esc(m.name)}</b>を <b>${m.price}G</b> で注文しますか？</p><p class="note">${esc(m.desc)}</p>${V.meal ? `<p class="warnbox">今の注文（${esc(D.MEALS[V.meal].name)}）は取り消しになり、お金は戻りません。</p>` : ''}`, '注文する', () => {
          const res = G.buyMeal(UI.S, id);
          if (res.ok) { AU.sfx('buy'); villageChanged(); render(); talk([['sai', m.name + 'だね。出発前に用意しておくよ！']]); }
          else info('サイの食堂', res.msg);
        });
      }));
    }
    render();
  }

  // ---- お宝展示室 ----
  function openMuseum() {
    const V = UI.S.village;
    if (!V.museum) { const f = G.facility('museum'); info('お宝展示室', `<p>展示室はまだありません。</p><p>「村の発展」で<b>${esc(f.name)}</b>（${f.price}G）を建てると、珍しいお宝を飾れます。</p>`); return; }
    const h = modal({ title: 'お宝展示室', right: G.donatedCount(V) + '/' + D.MUSEUM_ITEMS.length, buttons: [{ label: '閉じる' }] });
    function render() {
      h.el.querySelector('h2 .right').textContent = G.donatedCount(V) + '/' + D.MUSEUM_ITEMS.length;
      let html = `<p>称号：<b>${esc(G.title(V) || 'なし')}</b></p><div class="museum">`;
      for (const id of D.MUSEUM_ITEMS) {
        const d = D.ITEMS[id], has = V.donated[id];
        html += `<div class="pedestal ${has ? 'has' : ''}"><img src="${SP.iconURL(d)}" alt=""><small>${has ? esc(d.name) : '？？？'}</small></div>`;
      }
      html += '</div><p class="note">' + D.TITLES.map(([n, t]) => `${n}種：${esc(t)}`).join('　') + '<br>3・6・9種で特別な飾り（象の像・噴水・黄金の門）が解放されます。初めて寄贈したお宝だけ、売値の3割をお礼としてもらえます。</p>';
      const cand = V.bag.concat(V.storage).filter((it) => D.MUSEUM_ITEMS.includes(it.id));
      html += '<h3 class="sub">寄贈できるお宝（バッグと倉庫）</h3><div class="list">';
      if (!cand.length) html += '<p class="note">寄贈できるお宝を持っていません。</p>';
      for (const it of cand) html += itemRow(it, G.canDonate(V, it) ? '寄贈' : '展示済み', G.canDonate(V, it) ? '' : 'disabled');
      h.body.innerHTML = html + '</div>';
      h.body.querySelectorAll('.row').forEach((r) => r.addEventListener('click', () => {
        const it = cand.find((i) => i.uid === +r.dataset.uid);
        if (!G.canDonate(V, it)) { info('展示室', '同じお宝はもう飾ってあります。売ればお金になります。'); return; }
        const thanks = Math.floor(G.def(it).sell * D.MUSEUM_THANKS);
        confirmBox('寄贈', `<p><b>${esc(G.itemName(it))}</b>を展示室に寄贈しますか？</p><div class="kv"><span>売ると</span><span>${G.sellPrice(it)}G</span><span>寄贈すると</span><span>お礼${thanks}G＋展示（1回だけ）</span></div>`, '寄贈する', () => {
          const res = G.donate(UI.S, it.uid);
          if (res.ok) {
            AU.sfx('levelup'); villageChanged(); render();
            const lines = [['sai', esc(G.def(it).name).replace(/&amp;/g, '&') + '、きれいに飾ったよ！']];
            if (res.newTitle) lines.push(['sai', 'たけ、村のみんなが「' + res.newTitle + '」って呼んでるよ！']);
            talk(lines);
          } else info('展示室', res.msg);
        });
      }));
    }
    render();
  }

  // ---- 持ち物（村） ----
  function openVillageBag() {
    const V = UI.S.village;
    const h = modal({ title: '持ち物', right: `${V.bag.length}/${D.BAG_SIZE}`, buttons: [
      { label: '整理', keep: true, onClick: () => { sortList(V.bag); render(); } },
      { label: '閉じる' }] });
    function render() {
      h.el.querySelector('h2 .right').textContent = `${V.bag.length}/${D.BAG_SIZE}`;
      let html = '<p class="note">タップで詳細。持ち物は探索に持っていく物です（倒れると失います）。</p><div class="list">';
      if (!V.bag.length) html += '<p>バッグは空です。</p>';
      for (const it of V.bag) html += itemRow(it, '');
      h.body.innerHTML = html + '</div>';
      h.body.querySelectorAll('.row').forEach((r) => r.addEventListener('click', () => {
        const it = V.bag.find((i) => i.uid === +r.dataset.uid);
        const d = G.def(it);
        const eqable = d.type === 'weapon' || d.type === 'shield';
        const buttons = [{ label: '戻る' }];
        if (eqable) buttons.push({ label: it.eq ? '外す' : '装備する', cls: 'primary', onClick: () => { G.toggleEquipInBag(V.bag, it.uid); AU.sfx('pickup'); villageChanged(); render(); } });
        if (d.loan) buttons.push({ label: '返す', onClick: () => { G.discard(UI.S, it.uid); villageChanged(); render(); } });
        modal({ title: esc(G.itemName(it)), html: detailHtml(it), buttons });
      }));
    }
    render();
  }

  function detailHtml(it) {
    const d = G.def(it);
    const typeName = { weapon: '武器', shield: '盾', heal: '回復', food: '食料', sleep: '道具', staff: '杖', return: '巻物', map: '巻物', treasure: 'お宝', orb: '大切な物' }[d.type];
    let kv = `<span>種類</span><span>${typeName}</span>`;
    if (d.type === 'weapon') kv += `<span>攻撃力</span><span>+${d.atk + (it.plus || 0)}${it.plus ? `（強化+${it.plus}）` : ''}</span>`;
    if (d.type === 'shield') kv += `<span>防御力</span><span>+${d.def + (it.plus || 0)}${it.plus ? `（強化+${it.plus}）` : ''}</span>`;
    if (d.type === 'staff') kv += `<span>残り回数</span><span>${it.charges || 0}回</span>`;
    kv += `<span>売値</span><span>${G.canSell(it) ? G.sellPrice(it) + 'G' : '売れない'}</span>`;
    kv += `<span>倉庫</span><span>${G.canStore(it) ? '預けられる' : '預けられない'}</span>`;
    if (it.eq) kv += '<span>状態</span><span>装備中</span>';
    return `<div class="detail-head"><img src="${SP.iconURL(d)}" alt=""><div><b>${esc(G.itemName(it))}</b></div></div><p>${esc(d.desc)}</p><div class="kv">${kv}</div>`;
  }

  // ---- 出発 ----
  function openDepart() {
    const V = UI.S.village;
    const chk = G.canDepart(UI.S);
    const w = G.equipped(V.bag, 'weapon'), s = G.equipped(V.bag, 'shield');
    const ls = G.loanStatus(UI.S);
    const food = V.bag.filter((i) => G.def(i).type === 'food').length;
    let html = `<p><b>持ち物 ${V.bag.length}/${D.BAG_SIZE}</b>　武器：${w ? esc(G.itemName(w)) : 'なし'}　盾：${s ? esc(G.itemName(s)) : 'なし'}　食料：${food}個</p>`;
    html += `<div class="warnbox">⚠ 倒れると、<b>持ち物すべて</b>と<b>探索中に拾ったお金</b>を失います。<br>村の資金・倉庫・施設は失いません。</div>`;
    html += `<div class="okbox">帰還の巻物を1枚無料で持っていきます。使えばいつでも持ち物を持って帰れます。</div>`;
    if (V.meal) html += `<div class="okbox">🍛 ${esc(D.MEALS[V.meal].name)}を食べて出発：${esc(D.MEALS[V.meal].desc)}（この探索だけ）</div>`;
    else if (V.diner) html += '<p class="note">サイの食堂で料理を注文すると、この探索が少し楽になります。</p>';
    if (!w) html += '<p class="note">武器がありません（素手で戦います）。武器は遺跡で拾えるほか、サイの店でも買えます。</p>';
    if (!chk.ok) html += `<p class="warnbox">${esc(chk.msg)}</p>`;
    const buttons = [{ label: 'やめる' }];
    if (ls.food) buttons.push({ label: 'おにぎりを借りる', onClick: () => {
      G.takeLoan(UI.S, 'food');
      AU.sfx('pickup'); villageChanged();
      setTimeout(openDepart, 0);
    } });
    buttons.push({ label: '出発する', cls: 'primary', disabled: !chk.ok, onClick: () => depart() });
    modal({ title: '遺跡へ出発', html, buttons });
  }
  function depart() {
    const res = G.depart(UI.S);
    if (!res.ok) { info('出発', res.msg); return; }
    RD.fx = [];
    save();
    showScreen('dungeon');
    pushLog();
    const V = UI.S.village;
    const ch = UI.S.run.chapter;
    if (V.story.endingDone) talk([['sai', '大魔王はもういないけど、遺跡にはまだお宝が眠ってるよ。気をつけてね！'], ['take', 'いってきます！']]);
    else storyTalk('depart' + ch, D.STORY.depart[ch]);
  }

  function villageMenu() {
    modal({ title: 'メニュー', html: `<p class="note">セーブは自動で行われます。</p><p>帰還 ${UI.S.village.returns}回　敗北 ${UI.S.village.defeats}回　最深 地下${UI.S.village.bestFloor}階</p>
      <p>${(() => { const ss = G.storyStatus(UI.S.village); return ss.cleared ? '★ 全章クリア（最終決戦の勝利 ' + UI.S.village.clears + '回）' : '現在：' + esc(ss.name + '「' + ss.title + '」') + '　次のボス：' + esc(ss.bossName) + '（地下' + ss.goal + '階）'; })()}</p>
      ${UI.S.village.legacyClear30 ? '<p class="note">旧版のクリア記録：30階「願いの宝珠」（以前の版・' + (UI.S.village.legacyClears30 || 1) + '回）</p>' : ''}
      ${UI.S.village.legacyClear10 ? '<p class="note">旧記録：10階「宝珠の間」踏破（以前の版）</p>' : ''}`, buttons: [
      { label: 'ヤナイの記録', onClick: () => { setTimeout(showRecords, 0); } },
      { label: '遊び方', onClick: () => { setTimeout(() => showHelp(), 0); } },
      { label: '音：' + (UI.S.settings.sound ? 'オン' : 'オフ'), onClick: () => { toggleSound(); setTimeout(villageMenu, 0); } },
      { label: 'タイトルへ', onClick: () => { save(); setTimeout(showTitle, 0); } },
      { label: '閉じる', cls: 'primary' },
    ] });
  }

  // ================= ダンジョン =================
  function bindDungeon() {
    for (const b of document.querySelectorAll('#dpad .dir')) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.classList.add('pressed');
        try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        pressDir(b.dataset.dir, 'ptr:' + b.dataset.dir);
      });
      const end = () => { b.classList.remove('pressed'); releaseDir('ptr:' + b.dataset.dir); };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('lostpointercapture', end);
    }
    const act = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); if (UI.modals.length) return; AU.sfx('tap'); fn(); });
    bindFaceButton();
    act('b-wait', () => { stopHold(); doAct({ type: 'wait' }); });
    act('b-items', openItems);
    act('b-menu', dungeonMenu);
    act('b-foot', footAction);
    act('b-dash', toggleDash);
    $('h-map').addEventListener('click', () => { cycleMap(); });
    $('log').addEventListener('click', () => { if (!UI.modals.length) showLog(); });
    // どこで指を離しても・画面が隠れても入力を確実に解除する
    window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse' || !e.buttons) releaseAllPointers(); });
    window.addEventListener('pointercancel', releaseAllPointers);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopAllInput(); });
    window.addEventListener('blur', stopAllInput);
    window.addEventListener('pagehide', stopAllInput);
    updateModeButtons();
  }
  function releaseAllPointers() {
    for (const b of document.querySelectorAll('#dpad .dir.pressed')) b.classList.remove('pressed');
    if (UI.hold && UI.hold.source.startsWith('ptr:')) stopHold();
    if (UI.facePress) faceRelease(true);
  }

  // ---- 「向き」ボタン：短押し＝向き変更モードのオン/オフ（離したときに確定）、長押し＝休息（連続足踏み） ----
  const REST_DELAY = 400, REST_MS = 180;
  function bindFaceButton() {
    const b = $('b-face');
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (UI.modals.length || UI.facePress) return;
      try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      b.classList.add('pressed');
      const fp = { long: false, timer: null };
      UI.facePress = fp;
      fp.timer = setTimeout(() => { if (UI.facePress === fp) { fp.long = true; startRest(); } }, REST_DELAY);
    });
    const up = () => faceRelease(false);
    const cancel = () => faceRelease(true);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('lostpointercapture', () => { if (UI.facePress) faceRelease(false); });
  }
  // cancel=true のとき（キャンセル・画面外など）は短押しとして扱わない
  function faceRelease(cancel) {
    const fp = UI.facePress;
    if (!fp) return;
    UI.facePress = null;
    clearTimeout(fp.timer);
    $('b-face').classList.remove('pressed');
    if (fp.long) { stopRest(); return; } // 長押しとして処理済み：短押しは発動しない
    if (!cancel && !UI.modals.length) { AU.sfx('tap'); toggleFacing(); }
  }
  function startRest() {
    stopHold(); // 移動・ダッシュの連続処理を止める
    const S = UI.S;
    if (!S.run || S.run.over || UI.modals.length) return;
    const block = G.restBlock(S);
    if (block) { showStop(block, false, '休めない：' + G.REST_STOP[block]); return; }
    const st = { timer: null };
    UI.rest = st;
    $('restnote').classList.add('show');
    const tick = () => {
      if (UI.rest !== st) return;
      if (UI.modals.length || UI.screen !== 'dungeon' || document.hidden || !UI.S.run || UI.S.run.over) { stopRest(); return; }
      const logLen = UI.S.run.log.length;
      const out = G.restStep(UI.S);
      if (out.res.consumed) afterAction(out.res, { type: 'wait' }, logLen);
      if (out.stop) { UI.lastStop = out.stop; showStop(out.stop, false, '休息終了：' + G.REST_STOP[out.stop]); stopRest(); return; }
      st.timer = setTimeout(tick, REST_MS);
    };
    tick();
  }
  function stopRest() {
    if (UI.rest) clearTimeout(UI.rest.timer);
    UI.rest = null;
    const n = $('restnote'); if (n) n.classList.remove('show');
  }
  UI.stopRest = stopRest;

  function cycleMap() {
    const st = UI.S.settings;
    st.minimap = (st.minimap + 1) % 3;
    toast(['地図：非表示', '地図：小', '地図：大'][st.minimap]);
    save();
  }

  // ---- 移動モード（通常・ダッシュ・向き変更） ----
  const WALK_DELAY = 300, WALK_MS = 170, DASH_MS = 85;
  UI.timing = { WALK_DELAY, WALK_MS, DASH_MS };
  function toggleDash() {
    UI.S.settings.dash = !UI.S.settings.dash;
    if (UI.S.settings.dash) UI.facing = false;
    stopHold();
    updateModeButtons();
    toast(UI.S.settings.dash ? 'ダッシュ：オン' : 'ダッシュ：オフ');
    save();
  }
  function toggleFacing() {
    UI.facing = !UI.facing;
    stopHold();
    updateModeButtons();
    toast(UI.facing ? '向き変更：オン' : '向き変更：オフ');
  }
  function updateModeButtons() {
    const b = $('b-dash');
    const on = !!(UI.S && UI.S.settings.dash);
    b.classList.toggle('on', on);
    b.innerHTML = 'ダッシュ<small>' + (on ? 'オン' : 'オフ') + '</small>';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const f = $('b-face');
    f.classList.toggle('on', !!UI.facing);
    f.innerHTML = UI.facing ? '向き<small>変更中</small>' : '向き';
    f.setAttribute('aria-pressed', UI.facing ? 'true' : 'false');
    $('dpad').classList.toggle('facing', !!UI.facing);
    $('view').classList.toggle('facing', !!UI.facing);
    RD.facingMode = !!UI.facing;
  }
  /* 方向入力。
   * 向き変更中：向きだけ変える（ターンも敵も進まない）。
   * 通常：押した瞬間に1歩。300ms押し続けると約170msごとに連続移動。
   * ダッシュ：押している間、約85msごとに1マス。
   * どちらも指を離すと即停止し、入力はため込まない。安全停止したら押し直すまで再開しない。 */
  function pressDir(dir, source) {
    if (UI.modals.length || UI.rest || (UI.facePress && UI.facePress.long)) return; // 休息中は方向入力で動かない
    stopHold();
    const run = UI.S.run;
    if (!run || run.over) return;
    if (UI.facing) { faceDir(dir); return; }
    const dash = !!UI.S.settings.dash;
    const st = { dir, source, timer: null, stopped: false, dash, ctx: null };
    UI.hold = st;
    const [dx, dy] = G.DIRS[dir];
    // 押した方向に敵がいれば、その1回だけ攻撃して止まる（押しっぱなしで攻撃を繰り返さない）
    if (G.enemyAt(run, run.player.x + dx, run.player.y + dy)) {
      doAct({ type: 'move', dir });
      st.stopped = true;
      return;
    }
    if (dash) st.ctx = G.dashContext(UI.S);
    RD.stepDur = dash ? DASH_MS : 120;
    const tick = (first) => {
      if (UI.hold !== st || st.stopped) return;
      if (UI.modals.length || UI.screen !== 'dungeon' || document.hidden || !UI.S.run || UI.S.run.over) { stopHold(); return; }
      let stop;
      if (dash) stop = doDashStep(dir, st.ctx);
      else {
        if (first) {
          const now = performance.now();
          if (now < UI.lockUntil) { stopHold(); return; } // 同じタップの二重入力は無視
          UI.lockUntil = now + 90;
        }
        const logLen = UI.S.run.log.length;
        const res = G.act(UI.S, { type: 'move', dir });
        if (!res.consumed && !res.events.length) AU.sfx('bump');
        afterAction(res, { type: 'move', dir }, logLen);
        stop = G.walkCheck(UI.S, dir, res);
      }
      if (stop) {
        UI.lastStop = stop;
        st.stopped = true; // 押し直すまで再開しない
        if (!first || dash) showStop(stop, dash);
        return;
      }
      if (!dash && !first) RD.stepDur = WALK_MS - 10;
      st.timer = setTimeout(() => tick(false), dash ? DASH_MS : (first ? WALK_DELAY : WALK_MS));
    };
    tick(true);
  }
  function releaseDir(source) { if (UI.hold && UI.hold.source === source) stopHold(); }
  function stopHold() { if (UI.hold) { clearTimeout(UI.hold.timer); UI.hold = null; } }
  function stopAllInput() { stopHold(); stopRest(); if (UI.facePress) faceRelease(true); }
  UI.stopDash = stopHold; UI.stopHold = stopAllInput;
  function faceDir(dir) {
    const run = UI.S.run;
    run.player.dir = dir;
    G.act(UI.S, { type: 'face', dir });
    AU.sfx('tap');
    save();
  }
  // 停止理由を短く表示（不具合ではなく安全停止だと分かるように）
  function showStop(reason, dash, text) {
    if (reason === 'over' || (!text && !dash && reason === 'wall')) return;
    const el = $('stopnote');
    el.textContent = text || ((dash ? 'ダッシュ停止：' : '停止：') + (G.DASH_STOP[reason] || reason));
    el.classList.add('show');
    clearTimeout(UI.stopTimer);
    UI.stopTimer = setTimeout(() => el.classList.remove('show'), 1400);
  }

  function doDashStep(dir, ctx) {
    const S = UI.S;
    if (!S.run || S.run.over || UI.modals.length) return 'over';
    const logLen = S.run.log.length;
    const out = G.dashStep(S, dir, ctx);
    UI.lockUntil = performance.now() + 60;
    afterAction(out.res, { type: 'move', dir }, logLen);
    return out.stop;
  }

  function onKey(e) {
    if (UI.screen === 'title') return;
    const top = topModal();
    if (top) {
      if (e.key === 'Escape') { top.close(); e.preventDefault(); }
      else if (e.key === 'Enter') { const b = top.el.querySelector('.modal-buttons button.primary:not(:disabled)'); if (b) { b.click(); e.preventDefault(); } }
      return;
    }
    if (UI.screen === 'village') { const d = keyDir(e); if (d) { e.preventDefault(); villageStep(d); } return; }
    if (UI.screen !== 'dungeon' || !UI.S.run) return;
    const dir = keyDir(e);
    if (dir) {
      e.preventDefault();
      if (e.repeat) return; // キーの自動連打では動かない（ダッシュは押している間だけ）
      pressDir(dir, 'key:' + e.code);
      return;
    }
    if (e.repeat) return;
    if (e.key === ' ' || e.key === '.' || e.code === 'Numpad5') { e.preventDefault(); stopHold(); doAct({ type: 'wait' }); }
    else if (e.key === 'i' || e.key === 'I') openItems();
    else if (e.key === 'x' || e.key === 'X' || e.key === 'Shift') toggleDash();
    else if (e.key === 'f' || e.key === 'F') toggleFacing();
    else if (e.key === 'r' || e.key === 'R') { UI.keyRest = true; startRest(); }
    else if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') dungeonMenu();
    else if (e.key === 'Enter') footAction();
  }
  function keyDir(e) {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right',
      q: 'upleft', e: 'upright', z: 'downleft', c: 'downright', Home: 'upleft', PageUp: 'upright', End: 'downleft', PageDown: 'downright' };
    const num = { Numpad8: 'up', Numpad2: 'down', Numpad4: 'left', Numpad6: 'right', Numpad7: 'upleft', Numpad9: 'upright', Numpad1: 'downleft', Numpad3: 'downright' };
    return num[e.code] || map[e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key] || null;
  }
  function onKeyUp(e) { releaseDir('key:' + e.code); if ((e.key === 'r' || e.key === 'R') && UI.keyRest) { UI.keyRest = false; stopRest(); } }

  /* 行動の実行。入力ロック中（直前の行動の直後）は無視して予約しない。 */
  function doAct(action) {
    const S = UI.S;
    if (!S.run || S.run.over || UI.modals.length) return null;
    const now = performance.now();
    if (now < UI.lockUntil) return null;
    UI.lockUntil = now + INPUT_LOCK_MS;
    const logLen = S.run.log.length;
    const res = G.act(S, action);
    if (!res.consumed && action.type === 'move' && !res.events.length) AU.sfx('bump');
    afterAction(res, action, logLen);
    return res;
  }
  function afterAction(res, action, logLen) {
    const S = UI.S;
    handleEvents(res.events, action);
    save();
    updateHud();
    pushLog(logLen);
    if (S.run && S.run.over) { stopHold(); setTimeout(handleRunOver, 350); return; }
    if (res.floorChanged) {
      stopHold(); AU.playBgm(G.F(S.run).boss ? 'boss' : 'dungeon'); toast('地下' + S.run.floor + '階');
      const boss = G.F(S.run).boss;
      // ボスの登場：名前の表示と短い会話（会話中は時間が進まない）
      if (boss && G.chapterOf(S.run) !== 'legacy' && D.STORY.bossPre[boss]) {
        setTimeout(() => { flash(); toast(D.ENEMIES[boss].name + ' 出現！', 'danger'); AU.sfx('warn'); storyTalk('pre_' + boss, D.STORY.bossPre[boss]); }, 400);
      }
    }
    if (res.events.some((e) => e.t === 'bossDown')) {
      const b = res.events.find((e) => e.t === 'bossDown').boss;
      stopHold();
      setTimeout(() => { flash(); toast(D.ENEMIES[b].name + 'を倒した！', 'levelup'); if (D.STORY.bossPost[b]) storyTalk('post_' + b, D.STORY.bossPost[b]); }, 500);
      return;
    }
    if (res.events.some((e) => e.t === 'finalTransform')) { stopHold(); setTimeout(() => finalCutscene(), 500); return; }
    if (res.events.some((e) => e.t === 'finalWin')) { stopHold(); setTimeout(() => { flash(); storyTalk('final_win', D.STORY.finalWin); }, 500); return; }
    // 階段などに乗ったら確認
    const ev = res.events;
    if (ev.some((e) => e.t === 'onStairs')) { stopHold(); setTimeout(() => promptStairs(), 60); }
    else if (ev.some((e) => e.t === 'onReturnPoint' || e.t === 'onPortal')) { stopHold(); setTimeout(() => promptReturnPoint(), 60); }
  }
  UI.doAct = doAct;

  function handleEvents(events, action) {
    const run = UI.S.run, p = run.player;
    for (const e of events) {
      switch (e.t) {
        case 'hit':
          RD.addFx({ t: 'num', x: e.x, y: e.y, text: String(e.n), color: e.target === 'player' ? '#ff6a6a' : '#ffffff' });
          RD.addFx({ t: 'flash', x: e.x, y: e.y, target: e.target, dur: 200 });
          AU.sfx(e.target === 'player' ? 'hurt' : 'hit');
          break;
        case 'miss': RD.addFx({ t: 'num', x: e.x, y: e.y, text: 'ミス', color: '#aaccff' }); AU.sfx('miss'); break;
        case 'kill': RD.addFx({ t: 'sparkle', x: e.x, y: e.y, color: '#ffffff', dur: 500 }); AU.sfx('kill'); break;
        case 'heal': RD.addFx({ t: 'sparkle', x: e.x, y: e.y, color: '#9effa0', dur: 700 }); RD.addFx({ t: 'num', x: e.x, y: e.y, text: '+' + e.n, color: '#9effa0' }); AU.sfx('heal'); break;
        case 'eat': RD.addFx({ t: 'sparkle', x: e.x, y: e.y, color: '#ffe08a', dur: 600 }); AU.sfx('eat'); break;
        case 'levelup': RD.addFx({ t: 'banner', x: e.x, y: e.y, text: 'LEVEL UP!', dur: 1100 }); RD.addFx({ t: 'sparkle', x: e.x, y: e.y, color: '#ffe04a', dur: 900 }); AU.sfx('levelup'); toast('レベル' + p.lvl + 'になった！', 'levelup'); break;
        case 'move': RD.noteMove(); break;
        case 'pickup': AU.sfx('pickup'); break;
        case 'gold': RD.addFx({ t: 'num', x: e.x, y: e.y, text: '+' + e.n + 'G', color: '#ffe04a' }); AU.sfx('gold'); break;
        case 'bolt': RD.addFx({ t: 'bolt', from: { x: p.x, y: p.y }, to: e.path.length ? e.path[e.path.length - 1] : { x: p.x, y: p.y }, dur: 300 }); AU.sfx('bolt'); break;
        case 'dart': RD.addFx({ t: 'dart', from: e.from, to: e.to, dur: 300 }); AU.sfx('dart'); break;
        case 'sleep': for (const t of e.targets) RD.addFx({ t: 'num', x: t.x, y: t.y, text: 'Zzz', color: '#c8b8ff' }); AU.sfx('sleep'); break;
        case 'lunge': {
          const dx = Math.sign(p.x - e.x), dy = Math.sign(p.y - e.y);
          RD.addFx({ t: 'lunge', id: e.id, dx, dy, dur: 140 });
          break;
        }
        case 'warn': toast(e.msg); AU.sfx('warn'); break;
        case 'telegraph': toast('！' + e.msg.replace(/！$/, ''), 'danger'); AU.sfx('warn'); break;
        case 'blast': AU.sfx('bolt'); break;
        case 'steal': RD.addFx({ t: 'num', x: e.x, y: e.y, text: '-' + e.n + 'G', color: '#ffb0b0' }); toast(e.n + 'G 盗まれた！', 'danger'); AU.sfx('hurt'); break;
        case 'summon': RD.addFx({ t: 'sparkle', x: e.x, y: e.y, color: '#ff8a8a', dur: 600 }); AU.sfx('warn'); break;
        case 'enemyHeal': RD.addFx({ t: 'num', x: e.x, y: e.y, text: '+' + e.n, color: '#9effa0' }); RD.addFx({ t: 'sparkle', x: e.x, y: e.y, color: '#9effa0', dur: 600 }); break;
        case 'fire': for (const t of e.targets) RD.addFx({ t: 'sparkle', x: t.x, y: t.y, color: '#fff36a', dur: 600 }); flash(); AU.sfx('bolt'); break;
        case 'slow': for (const t of e.targets) RD.addFx({ t: 'num', x: t.x, y: t.y, text: '鈍', color: '#c8b8ff' }); AU.sfx('sleep'); break;
        case 'warp': AU.sfx('stairs'); flash(); break;
        case 'bagFull': toast('バッグがいっぱい！'); break;
        case 'monsterHouse': toast('モンスターハウスだ！', 'danger'); AU.sfx('warn'); break;
        case 'bossDown': case 'finalWin': for (let i = 0; i < 4; i++) RD.addFx({ t: 'sparkle', x: p.x + (i % 2 ? 2 : -2), y: p.y + (i < 2 ? 1 : -1), color: '#ffe080', dur: 1200 }); AU.sfx('levelup'); break;
        case 'finalTransform': AU.sfx('warn'); break;
        case 'stairs': AU.sfx('stairs'); flash(); break;
        case 'reveal': AU.sfx('heal'); break;
        case 'return': AU.sfx('return'); flash(); break;
        case 'portal': AU.sfx('levelup'); toast('帰還口が開いた！', 'levelup'); break;
        default: break;
      }
    }
    if (action.type === 'move' && events.some((e) => e.t === 'hit' && e.target === 'enemy' || e.t === 'miss') && !events.some((e) => e.t === 'move')) {
      const [dx, dy] = G.DIRS[action.dir];
      RD.addFx({ t: 'lunge', id: 'p', dx, dy, dur: 140 });
    }
  }

  function updateHud() {
    const run = UI.S.run;
    if (!run) return;
    const p = run.player;
    $('h-floor').textContent = '地下' + run.floor + '階';
    $('h-lv').textContent = 'Lv' + p.lvl;
    $('h-hp').textContent = Math.max(0, p.hp) + '/' + p.maxhp;
    const r = Math.max(0, p.hp) / p.maxhp;
    const bar = $('h-hpbar');
    bar.style.width = (r * 100) + '%';
    bar.className = r <= 0.3 ? 'low' : r <= 0.6 ? 'mid' : '';
    $('h-food').textContent = p.hunger;
    const fb = $('h-foodbar'); fb.style.width = Math.max(0, Math.min(100, p.hunger / D.PLAYER.maxHunger * 100)) + '%';
    fb.className = p.hunger <= 10 ? 'low' : p.hunger <= 30 ? 'mid' : '';
    $('h-status').textContent = p.poison ? '毒' + p.poison : '';
    $('h-food').className = p.hunger <= 10 ? 'hungry' : '';
    $('h-atk').textContent = G.playerAtk(run);
    $('h-def').textContent = G.playerDef(run);
    $('h-gold').textContent = run.runGold;
    const hot = G.onStairs(run) || G.onReturnPoint(run) || G.onPortal(run) || !!G.itemAt(run, p.x, p.y);
    $('b-foot').classList.toggle('hot', hot);
  }

  function pushLog() {
    const run = UI.S.run;
    if (!run) return;
    const lines = run.log.slice(-2);
    $('log').innerHTML = lines.map((l, i) => `<div class="${i === lines.length - 1 ? 'new' : ''}">${esc(l)}</div>`).join('');
  }
  function showLog() {
    const run = UI.S.run;
    modal({ title: 'メッセージ履歴', html: run.log.slice().reverse().map((l) => `<div>${esc(l)}</div>`).join(''), buttons: [{ label: '閉じる' }] });
  }

  function promptStairs() {
    if (!UI.S.run || UI.modals.length || !G.onStairs(UI.S.run)) return;
    const f = UI.S.run.floor;
    const run = UI.S.run, F1 = G.F(run, f + 1), F0 = G.F(run, f);
    const nextBoss = F1.boss;
    const bossWarn = nextBoss ? `<div class="warnbox">この先は「${D.THEMES[F1.theme].name}」。${D.ENEMIES[nextBoss].name}が待っています。HPと道具を整えてから進もう。</div>` : '';
    const region = F1.theme !== F0.theme && !nextBoss ? `<p class="note">この先は「${D.THEMES[F1.theme].name}」。</p>` : '';
    modal({ title: '階段', html: `<p>下へ続く階段がある。地下${f + 1}階へ降りますか？</p>${bossWarn}${region}<p class="note">降りなかった場合も「足元」ボタンからいつでも降りられます。</p>`, buttons: [
      { label: 'まだ探索する' },
      { label: '降りる', cls: 'primary', onClick: () => { setTimeout(() => doDescend(), 0); } },
    ] });
  }
  function doDescend() {
    UI.lockUntil = 0;
    doAct({ type: 'descend' });
  }
  function promptReturnPoint() {
    const run = UI.S.run;
    if (!run || UI.modals.length) return;
    const portal = G.onPortal(run);
    if (!portal && !G.onReturnPoint(run)) return;
    const orb = run.bag.some((i) => i.id === 'wish_orb');
    const html = portal
      ? `<p>光る帰還口だ。村へ帰りますか？</p>${run.floorItems.some((f) => f.item && G.F(run).boss) ? '<div class="warnbox">まだ拾っていない品（ボスの報酬など）があります！</div>' : ''}`
      : `<p>帰還の碑がある。ここから村へ帰れます。</p><p>持ち物 ${run.bag.length}個・探索中のお金 ${run.runGold}G を持ち帰れます。</p><p class="note">先に進めば、もっと良いお宝があるかもしれません。帰還の巻物は残ります（帰還すると消えます）。</p>`;
    modal({ title: portal ? '帰還口' : '帰還の碑', html, buttons: [
      { label: portal ? 'まだ残る' : '先に進む' },
      { label: '村へ帰る', cls: 'primary', onClick: () => { setTimeout(() => { UI.lockUntil = 0; doAct({ type: 'returnHome' }); }, 0); } },
    ] });
  }

  function footAction() {
    const run = UI.S.run;
    if (!run || UI.modals.length) return;
    if (G.onStairs(run)) return promptStairs();
    if (G.onReturnPoint(run) || G.onPortal(run)) return promptReturnPoint();
    const f = G.itemAt(run, run.player.x, run.player.y);
    if (f) {
      if (run.bag.length >= D.BAG_SIZE && !f.gold) {
        modal({ title: '足元', html: `<p>${esc(G.itemName(f.item))}がある。</p><p class="warnbox">バッグがいっぱい（${D.BAG_SIZE}個）で拾えません。「道具」から何かを置くか使ってください。</p>` });
        return;
      }
      doAct({ type: 'pickup' });
      return;
    }
    toast('足元には何もない');
  }

  // ---- 道具 ----
  function openItems() {
    const run = UI.S.run;
    if (!run || run.over || UI.modals.length) return;
    stopHold();
    const h = modal({ title: '道具', right: `${run.bag.length}/${D.BAG_SIZE}`, buttons: [
      { label: '整理', keep: true, onClick: () => { sortList(run.bag); render(); } },
      { label: '閉じる' }] });
    function render() {
      let html = '<p class="note">道具を見ている間は時間が進みません。「整理」もターンを使いません。</p><div class="list">';
      if (!run.bag.length) html += '<p>何も持っていない。</p>';
      for (const it of run.bag) html += itemRow(it, '');
      h.body.innerHTML = html + '</div>';
      // 選んだ品は表示位置ではなく uid で特定する（並び替えても取り違えない）
      h.body.querySelectorAll('.row').forEach((r) => r.addEventListener('click', () => {
        AU.sfx('tap');
        const it = run.bag.find((i) => i.uid === +r.dataset.uid);
        if (it) itemDetail(it, h);
      }));
    }
    render();
  }
  // 整理：種類順の安定した並び替え。数・強化値・装備・貸出などは変えない
  function sortList(list) {
    G.sortItems(list);
    AU.sfx('pickup');
    save();
    if (UI.screen === 'village') updateVillageHud();
  }

  // 使える消耗品の種類と、そのボタンの表示（ここにない種類は「置く」だけ）
  const USE_LABEL = { heal: '使う（1ターン）', food: '食べる（1ターン）', sleep: 'たく（1ターン）', map: '読む（1ターン）',
    slow: 'まく（1ターン）', warp: '投げる（1ターン）', fire: '読む（1ターン）', cure: '使う（1ターン）', clear: 'たく（1ターン）' };
  UI.USE_LABEL = USE_LABEL;
  function itemDetail(it, listModal) {
    const d = G.def(it);
    const buttons = [{ label: '戻る' }];
    const finish = (action) => { closeAllModals(); UI.lockUntil = 0; doAct(action); };
    if (d.type === 'weapon' || d.type === 'shield') buttons.push({ label: it.eq ? '外す（1ターン）' : '装備する（1ターン）', cls: 'primary', onClick: () => finish({ type: 'equip', uid: it.uid }) });
    else if (d.type === 'staff') buttons.push({ label: 'ふる（向きを選ぶ）', cls: 'primary', onClick: () => { setTimeout(() => pickDir((dir) => finish({ type: 'use', uid: it.uid, dir })), 0); } });
    else if (d.type === 'return') buttons.push({ label: '使う', cls: 'primary', onClick: () => { setTimeout(() => confirmReturnScroll(it), 0); } });
    else if (USE_LABEL[d.type]) buttons.push({ label: USE_LABEL[d.type], cls: 'primary', onClick: () => finish({ type: 'use', uid: it.uid }) });
    buttons.push({ label: '置く（1ターン）', onClick: () => {
      const run = UI.S.run;
      if (G.itemAt(run, run.player.x, run.player.y) || G.onStairs(run) || G.onReturnPoint(run) || G.onPortal(run)) { setTimeout(() => info('置けません', 'ここには置けません。'), 0); return; }
      finish({ type: 'drop', uid: it.uid });
    } });
    modal({ title: esc(G.itemName(it)), html: detailHtml(it), buttons });
  }

  function pickDir(cb) {
    const run = UI.S.run;
    const h = modal({ title: '雷を飛ばす向き', html: `<p class="note">今の向き：${G.DIR_NAMES[run.player.dir]}（斜めにも撃てます）</p><div class="dir-pick">
      <button data-d="upleft">◤</button><button data-d="up">▲</button><button data-d="upright">◥</button>
      <button data-d="left">◀</button><button data-d="${run.player.dir}" class="primary">今の向き</button><button data-d="right">▶</button>
      <button data-d="downleft">◣</button><button data-d="down">▼</button><button data-d="downright">◢</button></div>`, buttons: [{ label: 'やめる' }] });
    h.body.querySelectorAll('button[data-d]').forEach((b) => b.addEventListener('click', () => { const dir = b.dataset.d; h.close(); cb(dir); }));
    h.body.querySelector('.primary').style.fontSize = '14px';
  }

  function confirmReturnScroll(it) {
    const run = UI.S.run;
    const items = run.bag.filter((i) => i.id !== 'return_scroll').length;
    confirmBox('帰還の巻物', `<p>帰還の巻物を使って村へ帰りますか？</p><div class="okbox">持ち物 ${items}個と探索中のお金 ${run.runGold}G を持ち帰れます。</div><p class="note">探索はここで終わります。巻物はなくなります。</p>`, '帰る', () => {
      closeAllModals(); UI.lockUntil = 0;
      doAct({ type: 'use', uid: it.uid });
    }, 'やめる');
  }

  function dungeonMenu() {
    if (UI.modals.length) return;
    stopHold();
    const run = UI.S.run;
    const p = run.player;
    const nextExp = D.EXP_TABLE[p.lvl + 1];
    const html = `<div class="kv"><span>場所</span><span>地下${run.floor}階（${D.THEMES[G.F(run).theme].name}）</span>
      <span>章</span><span>${G.chapterOf(run) === 'legacy' ? '以前の版の冒険（帰還後に第1章へ）' : esc(D.CHAPTERS[run.chapter].name + '「' + D.CHAPTERS[run.chapter].title + '」')}</span>
      <span>レベル</span><span>${p.lvl}（次まで ${nextExp ? nextExp - p.exp : '-'}）</span>
      <span>HP</span><span>${p.hp}/${p.maxhp}</span><span>満腹度</span><span>${p.hunger}%</span>
      <span>攻撃/防御</span><span>${G.playerAtk(run)} / ${G.playerDef(run)}</span>
      <span>探索中のお金</span><span>${run.runGold}G</span><span>ターン</span><span>${run.turn}</span></div>
      <p class="note">メニューを開いている間は時間が進みません。セーブは行動ごとに自動で行われます。</p>`;
    modal({ title: 'メニュー', html, buttons: [
      { label: '地図：' + ['非表示', '小', '大'][UI.S.settings.minimap], onClick: () => { cycleMap(); setTimeout(dungeonMenu, 0); } },
      { label: 'メッセージ履歴', onClick: () => { setTimeout(showLog, 0); } },
      { label: '遊び方', onClick: () => { setTimeout(() => showHelp(), 0); } },
      { label: '音：' + (UI.S.settings.sound ? 'オン' : 'オフ'), onClick: () => { toggleSound(); setTimeout(dungeonMenu, 0); } },
      { label: '中断してタイトルへ', onClick: () => { save(); setTimeout(showTitle, 0); } },
      { label: '閉じる', cls: 'primary' },
    ] });
  }

  // ================= 35階の最終決戦 =================
  /* 静寂 → ミストバーンの再出現と変身 → サイたちの支援（回復はゲーム処理で1回だけ済んでいる） → 準備画面。
   * 演出は一度だけ（再読み込みで繰り返さない）。準備中は時間が止まっている。 */
  function finalCutscene() {
    const run = UI.S.run;
    if (!run || !run.final || run.final.stage !== 'prep') return;
    if (run.final.cutsceneSeen) { openFinalPrep(); return; }
    closeAllModals();
    talk(D.STORY.finalSilence, () => {
      flash(); AU.sfx('warn');
      talk(D.STORY.finalTransform, () => { G.markFinalCutscene(UI.S); save(); updateHud(); openFinalPrep(); });
    });
  }
  function openFinalPrep() {
    const run = UI.S.run;
    if (!run || !run.final || run.final.stage !== 'prep' || UI.modals.length) return;
    const p = run.player, w = G.equipped(run.bag, 'weapon'), sh = G.equipped(run.bag, 'shield');
    const heal = run.bag.filter((i) => ['heal', 'food', 'cure'].includes(G.def(i).type)).length;
    UI.prepOpen = true;
    modal({ title: '最終決戦の準備', noClose: true, html: `<p>サイたちの祈りで、たけのHPが全回復した。</p>
      <div class="kv"><span>HP</span><span>${p.hp}/${p.maxhp}</span><span>満腹度</span><span>${p.hunger}%</span>
      <span>武器</span><span>${w ? esc(G.itemName(w)) : 'なし'}</span><span>盾</span><span>${sh ? esc(G.itemName(sh)) : 'なし'}</span>
      <span>回復・食料</span><span>${heal}個</span><span>持ち物</span><span>${run.bag.length}/${D.BAG_SIZE}</span></div>
      <p class="note">準備の間は時間が止まっています（敵は動きません）。「道具を確認」で装備の付け替えや回復ができます。</p>
      <div class="warnbox">真大魔王バーン：天地の掌（周り8マス）・滅びの炎（3列）・魔界の炎（輪）。どれも予告を見てからかわせる。</div>`,
      onClose: () => { UI.prepOpen = false; },
      buttons: [
        { label: '道具を確認', onClick: () => { UI.prepHold = true; setTimeout(() => { UI.prepHold = false; openItems(); }, 0); } },
        { label: '最終決戦へ', cls: 'primary', onClick: () => { G.startFinalBattle(UI.S); save(); AU.playBgm('boss'); flash(); toast('最終決戦！', 'danger'); updateHud(); } },
      ] });
  }

  // ================= 村での章のできごと =================
  /* 章クリアの帰還イベント・エンディングは story.pending に残してあるので、読み込み直しても必ず一度見られる。 */
  function showStoryPending() {
    const V = UI.S.village, st = V.story, pend = st.pending;
    if (!pend || UI.modals.length) return false;
    const finish = () => { st.pending = null; save(); updateVillageHud(); };
    if (pend.type === 'chapterClear') {
      const ch = pend.chapter, C = D.CHAPTERS[ch], next = D.CHAPTERS[ch + 1];
      const rec = D.STORY.records[ch];
      talk(D.STORY.chapterClear[ch] || [], () => {
        modal({ title: C.name + ' クリア！', html: `<div class="ending"><p class="big-t">${esc(D.ENEMIES[C.boss].name)}を倒した！</p></div>
          <div class="kv"><span>復興支援金</span><span>${pend.funds ? pend.funds + 'G（村の資金へ）' : '受け取り済み'}</span>
          <span>ヤナイの記録</span><span>${rec ? '「' + esc(rec.title) + '」が読めるようになった' : '-'}</span>
          <span>次の章</span><span>${next ? esc(next.name + '「' + next.title + '」') + '　目標：地下' + next.goal + '階' : '-'}</span></div>
          <p class="note">村の人が増え、景色も少しずつ元に戻っていきます。記録は村のメニューから読めます。</p>`,
        onClose: finish, buttons: [{ label: 'OK', cls: 'primary' }] });
      });
      return true;
    }
    if (pend.type === 'ending') { ending(true, finish); return true; }
    finish();
    return false;
  }
  function showRecords() {
    const st = UI.S.village.story, recs = D.STORY.records;
    const html = recs.map((r, i) => i < st.records
      ? `<details${i === st.records - 1 ? ' open' : ''}><summary><b>${esc(r.title)}</b></summary><p>${esc(r.text)}</p></details>`
      : `<p class="note">？？？（章を進めると読める）</p>`).join('');
    modal({ title: 'マスターヤナイの記録', right: `${Math.min(st.records, recs.length)}/${recs.length}`, html, buttons: [{ label: '閉じる', cls: 'primary' }] });
  }

  // ================= 探索の終了 =================
  function handleRunOver() {
    const S = UI.S;
    if (!S.run || !S.run.over) return;
    closeAllModals();
    const r = S.run.result;
    if (r.type === 'dead') {
      const lostItems = S.run.bag.filter((i) => i.id !== 'return_scroll').length;
      const html = `<div class="ending"><p class="big-t" style="color:#ff8a8a">たけは倒れた…</p></div>
        <div class="kv"><span>原因</span><span>${esc(r.cause)}</span><span>到達</span><span>地下${r.floor}階</span>
        <span>失った物</span><span>持ち物${lostItems}個・お金${r.lostGold}G</span></div>
        <div class="okbox">村の資金・倉庫・施設は無事です。</div>`;
      modal({ title: '探索失敗', html, noClose: true, buttons: [
        { label: '村へ戻る', onClick: () => { setTimeout(() => backToVillage(false), 0); } },
        { label: 'すぐ再挑戦', cls: 'primary', onClick: () => { setTimeout(() => backToVillage(true), 0); } },
      ] });
    } else {
      backToVillage(false);
    }
  }

  function backToVillage(retry) {
    const S = UI.S;
    const res = G.finishRun(S);
    save();
    showScreen('village');
    if (!res) return;
    if (res.type === 'dead') {
      talk([
        ['sai', 'たけ！気がついた？遺跡の入口で倒れてたんだよ…。'],
        ['take', 'ごめん、地下' + res.floor + '階で無理しちゃった。'],
        ['sai', '無事でよかった。お店のお金と倉庫はそのままだよ。おにぎりは無料で持たせるからね。'],
      ], () => { if (showStoryPending()) return; if (retry) openDepart(); }, { skip: UI.S.village.defeats > 1 });
      return;
    }
    const mats = Object.entries(res.materials || {}).map(([id, n]) => D.ITEMS[id].name + '×' + n).join('、');
    const html = `<div class="kv"><span>到達</span><span>地下${res.floor}階</span><span>持ち帰ったお金</span><span>${res.gold}G（村の資金へ）</span><span>持ち帰った道具</span><span>${res.items}個</span>${mats ? `<span>素材</span><span>${esc(mats)}（素材箱へ）</span>` : ''}</div>
      <p class="note">お宝はサイの店で売るとお金になります。</p>`;
    const after = () => {
      if (showStoryPending()) return;
      const V = S.village;
      const sellable = V.bag.filter((i) => G.def(i).type === 'treasure').length;
      const decor = Object.values(V.decor || {}).filter(Boolean).length;
      // サイのあいさつは村の発展に合わせて変わる
      const hello = decor >= 4 ? 'おかえり！村のみんなも、たけの帰りを待ってたよ。'
        : V.diner ? 'おかえり、たけ！食堂でごはんができてるよ。'
          : V.smithLv ? 'おかえり！鍛冶屋さんも、たけの装備を見たがってたよ。'
            : V.stage >= 2 ? 'おかえり、たけ！倉庫もちゃんと空けてあるよ。' : 'おかえり、たけ！';
      const lines = [['sai', hello + (res.gold ? '　' + res.gold + 'Gも持って帰ってきたんだね。' : '')]];
      if (res.materials && Object.keys(res.materials).length) lines.push(['take', '深い階の素材も拾ってきたよ。鍛冶屋さんに見せてあげて。']);
      if (sellable) lines.push(['take', 'お宝も見つけたよ！'], ['sai', V.museum ? '売ってもいいし、展示室に飾ってもいいね。' : 'お店で見せて！売ったお金で村をもっとにぎやかにしよう。']);
      else lines.push(['take', 'ただいま！次はもっと奥まで行ってみる。']);
      const g = G.nextGoals(S);
      if (g.can.length) lines.push(['sai', '資金がたまったね！「村の発展」で' + g.can[0].name + 'が作れるよ。']);
      else if (g.next) lines.push(['sai', '次は「' + g.next.name + '」を目指そう。あと' + g.need + 'Gだよ。']);
      talk(lines);
    };
    modal({ title: '帰還！', html, onClose: after, buttons: [{ label: 'OK', cls: 'primary' }] });
  }

  function ending(first, done) {
    const V = UI.S.village;
    talk(D.STORY.ending, () => {
      V.seenEnding = true; save();
      modal({ title: 'エンディング', noClose: true, html: `<div class="ending"><p class="big-t">大魔王の封印は守られた！</p>
        <p>勇者たけとサイ、そして村のみんなの力で、アユタヤの村に平和が戻りました。</p>
        <p>マスターヤナイの想いは、これからも村とともに。</p>
        <p>帰還 ${V.returns}回・敗北 ${V.defeats}回</p>
        <p class="big-t">THANK YOU FOR PLAYING!</p>
        <p class="note">このあとも探索・収集・強化・村の発展を続けられます。最終章の35階には何度でも挑戦できます。</p></div>`,
      onClose: done, buttons: [{ label: '村へ', cls: 'primary' }] });
    });
  }

  // テスト用に一部を公開
  UI.debug = { handleRunOver, openDepart, depart, openItems, footAction, save, finalCutscene, openFinalPrep, showStoryPending, showRecords };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(globalThis.TS = globalThis.TS || {});
