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
    bindTitle(); bindVillage(); bindDungeon();
    document.addEventListener('keydown', onKey);
    showTitle();
    requestAnimationFrame(loop);
  }

  function setAppHeight() {
    document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  }

  function save() { if (UI.started) SV.save(UI.S); }

  function showScreen(name) {
    UI.screen = name;
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === 'screen-' + name);
    AU.playBgm(name === 'dungeon' ? (UI.S.run && UI.S.run.floor === D.MAX_FLOOR ? 'boss' : 'dungeon') : name === 'village' ? 'village' : 'village');
    if (name === 'village') updateVillageHud();
    if (name === 'dungeon') updateHud();
  }

  // ================= 描画ループ =================
  function loop(now) {
    try {
      if (UI.screen === 'dungeon' && UI.S.run) RD.drawDungeon($('dungeon-canvas'), UI.S, now);
      else if (UI.screen === 'village') UI.villageHits = RD.drawVillage($('village-canvas'), UI.S.village, now);
      else if (UI.screen === 'title') drawTitleArt(now);
    } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  }

  function drawTitleArt(now) {
    const c = $('title-canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);
    const sc = Math.floor(Math.min(w / 96, h / 56)) || 1;
    const ox = (w - 96 * sc) / 2, oy = (h - 56 * sc) / 2;
    g.save(); g.translate(ox, oy); g.scale(sc, sc);
    // 遺跡の塔
    const R = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
    R(36, 14, 24, 30, '#9a4a3a'); R(40, 6, 16, 8, '#9a4a3a'); R(44, 0, 8, 6, '#9a4a3a'); R(47, -4, 2, 4, '#9a4a3a');
    for (let y = 16; y < 44; y += 4) R(36, y, 24, 1, '#7a3a2a');
    R(44, 30, 8, 14, '#3a1a14');
    R(8, 44, 80, 12, '#3a8fc0'); R(8, 44, 80, 2, '#7ac8e8');
    R(14, 48, 6, 2, '#3a8a40'); R(16, 46, 3, 2, '#ff8fb8'); R(72, 50, 6, 2, '#3a8a40'); R(74, 48, 3, 2, '#ff8fb8');
    const b = Math.floor(now / 500) % 2;
    g.drawImage(SP.s.take.down[Math.floor(now / 450) % 2], 18, 26 + b, 16, 16);
    g.drawImage(SP.s.sai, 62, 26 + (1 - b), 16, 16);
    const gl = 0.5 + 0.5 * Math.sin(now / 400);
    g.globalAlpha = gl; g.drawImage(SP.s.icon.orb, 40, 16 - b, 16, 16); g.globalAlpha = 1;
    g.restore();
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
  function talk(lines, done) {
    let i = 0;
    const h = modal({
      html: '<div class="talk"><img alt=""><div><div class="who"></div><div class="txt"></div></div></div>',
      buttons: [{ label: '▶ つぎへ', cls: 'primary', keep: true, onClick: () => { i++; if (i >= lines.length) { h.close(); } else show(); } }],
      noClose: true, onClose: done,
    });
    const img = h.body.querySelector('img'), who = h.body.querySelector('.who'), txt = h.body.querySelector('.txt');
    const ports = { take: SP.portraitURL('take', 72), sai: SP.portraitURL('sai', 72) };
    function show() {
      const [w, t] = lines[i];
      img.src = ports[w];
      who.textContent = w === 'take' ? 'たけ' : 'サイ';
      txt.textContent = t;
    }
    show();
    h.body.addEventListener('click', (e) => { if (h.accept(e)) { const b = h.el.querySelector('.modal-buttons button'); if (b) b.click(); } });
    return h;
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
    <p>たけを操作して遺跡（地下10階）を探索し、最深部の「願いの宝珠」を村へ持ち帰ろう。拾ったお宝はサイの店で売って村を発展させよう。</p>
    <h3>操作</h3>
    <ul>
      <li><b>方向ボタン</b>（3×3）：8方向に1マス移動。斜めも1ターン。敵のいる方向へ動くと攻撃（斜めの敵にも攻撃できる）。</li>
      <li>壁の角をはさんだ斜めには移動・攻撃できない（敵も同じ）。</li>
      <li><b>中央の「待つ」</b>（スペース）：その場で1ターン休む。</li>
      <li>PC：矢印キー/WASDで上下左右、Q・E・Z・C（またはテンキー7・9・1・3）で斜め。</li>
      <li><b>足元</b>（Enter）：階段を降りる・道具を拾う・帰還する。</li>
      <li><b>道具</b>（I）：使う・装備する・置く。<b>メニュー</b>（Esc）：地図・説明・音。</li>
    </ul>
    <h3>ターン</h3>
    <ul>
      <li>移動・攻撃・待つ・道具を使う・装備変更で1ターン。そのあと敵が1回ずつ動く。</li>
      <li>壁にぶつかる、メニューや道具の説明を見るだけなら時間は進まない。</li>
      <li>ボタン押しっぱなしで連続移動。敵が見えたり何か起きると止まる。</li>
    </ul>
    <h3>満腹度とHP</h3>
    <ul>
      <li>満腹度は行動するたびに少しずつ減る。食べ物で回復。</li>
      <li>満腹度があればHPはゆっくり回復。0になるとHPが減っていく。</li>
    </ul>
    <h3>帰還と敗北</h3>
    <ul>
      <li><b>帰還の巻物</b>（出発時に1枚無料）を使うと、その場で持ち物とお金を持って村へ帰れる。</li>
      <li>3・6・9階には<b>帰還の碑</b>がある。10階で守護者を倒すと帰還口が開く。</li>
      <li>倒れると、持ち物と探索中のお金を失う。村の資金・倉庫・施設は残る。</li>
    </ul>
    <h3>村</h3>
    <ul>
      <li>サイの店：お宝を売る・食料や薬を買う。無料の貸出品（木刀・おにぎり）もある。</li>
      <li>倉庫：大事な物を預けておけば、倒れても失わない。</li>
      <li>村の発展：資金で施設を増やす。鍛冶屋で武器と盾を強化できる。</li>
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
    $('btn-continue').style.display = SV.exists() ? '' : 'none';
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
    talk([
      ['sai', 'たけ、見て！水路の向こうの遺跡、今日も夕日できれいだね。'],
      ['take', 'あの遺跡の奥に「願いの宝珠」が眠ってるって、本当かな？'],
      ['sai', 'うわさだけどね。でも、拾ったお宝を売れば、このお店も大きくできるよ。'],
      ['take', 'よし、ぼくが探してくる！サイはお店をよろしく。'],
      ['sai', 'うん。無理しないでね。危なくなったら帰還の巻物で帰ってきて！'],
    ], () => {
      UI.S.village.seenIntro = true; save();
      showHelp(() => info('はじめの一歩', '<p>下の<b>「遺跡へ出発」</b>から探索に出かけよう。</p><p class="note">装備がなくても、出発前にサイの店で<b>木刀とおにぎりを無料で借りられます</b>。</p>'));
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
      else { pushLog(); toast('地下' + UI.S.run.floor + '階から再開'); }
    } else showScreen('village');
  }

  // ================= 村 =================
  function bindVillage() {
    for (const b of document.querySelectorAll('.vbuttons .fac')) {
      b.addEventListener('click', () => { AU.sfx('tap'); openFacility(b.dataset.fac); });
    }
    $('v-menu').addEventListener('click', () => { AU.sfx('tap'); villageMenu(); });
    $('village-canvas').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const h = UI.villageHits.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
      if (h) { AU.sfx('tap'); openFacility(h.id); }
    });
  }
  function updateVillageHud() {
    const V = UI.S.village;
    $('v-funds').textContent = V.funds;
    $('v-stage').textContent = D.VILLAGE_STAGES[V.stage].name;
    $('v-best').textContent = V.bestFloor ? '地下' + V.bestFloor + '階' : '-';
    document.querySelector('.fac[data-fac="smith"]').classList.toggle('locked', V.stage < 3);
  }
  function villageChanged() { updateVillageHud(); save(); }

  function openFacility(id) {
    if (UI.modals.length) return;
    switch (id) {
      case 'shop': return openShop('buy');
      case 'storage': return openStorage('in');
      case 'smith': return openSmith();
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
        for (const it of V.bag) html += itemRow(it, G.canSell(it) ? G.sellPrice(it) + 'G' : '売れない', G.canSell(it) ? '' : 'disabled');
        html += '</div>';
      } else {
        const ls = G.loanStatus(UI.S);
        html += '<p>装備やお金がなくても大丈夫。サイが無料で貸してくれます。</p><div class="list">';
        html += defRow('wood_sword', ls.weapon ? '無料' : '借りている', ls.weapon ? '' : 'disabled');
        html += defRow('loan_rice', ls.food ? '無料' : '持っている', ls.food ? '' : 'disabled');
        html += '</div><p class="note">貸出品は売ったり預けたりできません。持っていないときに1つずつ借りられます。</p>';
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
          const kind = r.dataset.id === 'wood_sword' ? 'weapon' : 'food';
          const res = G.takeLoan(UI.S, kind);
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
    const h = modal({ title: '倉庫', tabs: true, buttons: [{ label: '閉じる' }] });
    const tabs = h.el.querySelector('.tabs');
    tabs.innerHTML = '<button data-t="in">預ける</button><button data-t="out">取り出す</button>';
    tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { AU.sfx('tap'); render(b.dataset.t); }));
    function render(t) {
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
      let html = `<p class="note">倉庫 ${V.storage.length}/${G.storageSize(V)}　バッグ ${V.bag.length}/${D.BAG_SIZE}</p><div class="list">`;
      const list = t === 'in' ? V.bag : V.storage;
      if (!list.length) html += '<p>' + (t === 'in' ? 'バッグは空です。' : '倉庫は空です。') + '</p>';
      for (const it of list) html += itemRow(it, t === 'in' ? (G.canStore(it) ? '預ける' : '不可') : '出す', t === 'in' && !G.canStore(it) ? 'disabled' : '');
      html += '</div>';
      if (V.stage < 2) html += '<p class="note">「村の発展」で倉庫を40枠に拡張できます。</p>';
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
  function openSmith() {
    const V = UI.S.village;
    if (V.stage < 3) {
      info('鍛冶屋', `<p>鍛冶屋はまだありません。</p><p>「村の発展」で<b>${esc(D.VILLAGE_STAGES[3].name)}</b>（${D.VILLAGE_STAGES[3].cost}G）を建てると、武器と盾を強化できるようになります。</p>`);
      return;
    }
    const h = modal({ title: '鍛冶屋', right: V.funds + 'G', buttons: [{ label: '閉じる' }] });
    function render() {
      h.el.querySelector('h2 .right').textContent = V.funds + 'G';
      const list = V.bag.concat(V.storage).filter((i) => ['weapon', 'shield'].includes(G.def(i).type));
      let html = '<p class="note">武器・盾を最大+3まで強化できます（バッグと倉庫の品）。</p><div class="list">';
      if (!list.length) html += '<p>強化できる武器・盾がありません。</p>';
      for (const it of list) {
        const ok = G.canSmith(V, it);
        html += itemRow(it, ok ? G.smithCost(it) + 'G' : (G.def(it).loan ? '貸出品' : '最大'), ok ? '' : 'disabled');
      }
      h.body.innerHTML = html + '</div>';
      h.body.querySelectorAll('.row').forEach((r) => r.addEventListener('click', () => {
        const it = list.find((i) => i.uid === +r.dataset.uid);
        if (!G.canSmith(V, it)) return;
        const cost = G.smithCost(it);
        confirmBox('強化', `<p><b>${esc(G.itemName(it))}</b>を <b>${cost}G</b> で+${(it.plus || 0) + 1}に強化しますか？</p><p class="note">資金 ${V.funds}G → ${V.funds - cost}G</p>`, '強化する', () => {
          const res = G.smith(UI.S, it.uid);
          AU.sfx(res.ok ? 'levelup' : 'bump');
          villageChanged(); render();
          if (!res.ok) info('鍛冶屋', res.msg);
        });
      }));
    }
    render();
  }

  // ---- 村の発展 ----
  function openDevelop() {
    const V = UI.S.village;
    let html = `<p>資金：<b>${V.funds}G</b></p>`;
    for (let i = 1; i < D.VILLAGE_STAGES.length; i++) {
      const s = D.VILLAGE_STAGES[i];
      const cls = i <= V.stage ? 'done' : i === V.stage + 1 ? 'next' : '';
      html += `<div class="stage ${cls}"><div><b>${i}. ${esc(s.name)}</b>　${i <= V.stage ? '✔ 完成' : s.cost + 'G'}</div><div class="note">${esc(s.desc)}</div></div>`;
    }
    const next = D.VILLAGE_STAGES[V.stage + 1];
    modal({ title: '村の発展', html, buttons: next ? [
      { label: '閉じる' },
      { label: `${next.name}（${next.cost}G）`, cls: 'primary', disabled: V.funds < next.cost, onClick: () => {
        confirmBox('村の発展', `<p><b>${esc(next.name)}</b>を <b>${next.cost}G</b> で作りますか？</p><p class="note">${esc(next.desc)}</p>`, '作る', () => {
          const res = G.upgradeVillage(UI.S);
          if (res.ok) {
            AU.sfx('levelup'); villageChanged();
            const lines = V.stage === 2
              ? [['sai', '倉庫が広くなったよ！灯りも増えて、村がにぎやかになってきた。'], ['take', 'お宝をたくさん預けられるね。']]
              : [['sai', '鍛冶屋さんと屋台が来てくれたよ！夕方はいい匂いがするね。'], ['take', '装備を鍛えて、もっと奥まで行けそうだ！']];
            talk(lines);
          } else info('村の発展', res.msg);
        });
      } },
    ] : [{ label: '閉じる' }] });
  }

  // ---- 持ち物（村） ----
  function openVillageBag() {
    const V = UI.S.village;
    const h = modal({ title: '持ち物', right: `${V.bag.length}/${D.BAG_SIZE}`, buttons: [{ label: '閉じる' }] });
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
    if (!w && ls.weapon) html += '<p class="note">武器がありません。サイの店の「貸出」で木刀を無料で借りられます。</p>';
    if (!chk.ok) html += `<p class="warnbox">${esc(chk.msg)}</p>`;
    const buttons = [{ label: 'やめる' }];
    if (ls.weapon || ls.food) buttons.push({ label: '無料で借りる', onClick: () => {
      if (ls.weapon) G.takeLoan(UI.S, 'weapon');
      if (ls.food) G.takeLoan(UI.S, 'food');
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
    const lines = V.runs === 1
      ? [['sai', 'いってらっしゃい、たけ！お腹がすいたらちゃんと食べてね。'], ['take', 'いってきます！お宝、たくさん持って帰るよ。']]
      : V.cleared ? [['sai', '宝珠のおかげで村がにぎやかだね。今日も気をつけて！'], ['take', 'まだ見てない部屋があるはず。いってきます！']]
      : [['sai', '今日はどこまで行くの？無理はしないでね。'], ['take', 'うん。危なくなったら帰ってくるよ。']];
    talk(lines);
  }

  function villageMenu() {
    modal({ title: 'メニュー', html: `<p class="note">セーブは自動で行われます。</p><p>帰還 ${UI.S.village.returns}回　敗北 ${UI.S.village.defeats}回　${UI.S.village.cleared ? '宝珠：入手済み' : ''}</p>`, buttons: [
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
        startHold(b.dataset.dir);
      });
      const end = () => { b.classList.remove('pressed'); stopHold(); };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('lostpointercapture', end);
    }
    const act = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); if (UI.modals.length) return; AU.sfx('tap'); fn(); });
    $('b-wait').addEventListener('pointerdown', (e) => { e.preventDefault(); if (UI.modals.length) return; AU.sfx('tap'); doAct({ type: 'wait' }); });
    act('b-items', openItems);
    act('b-menu', dungeonMenu);
    act('b-foot', footAction);
    $('h-map').addEventListener('click', () => { cycleMap(); });
    $('log').addEventListener('click', () => { if (!UI.modals.length) showLog(); });
  }

  function cycleMap() {
    const st = UI.S.settings;
    st.minimap = (st.minimap + 1) % 3;
    toast(['地図：非表示', '地図：小', '地図：大'][st.minimap]);
    save();
  }

  // 押しっぱなし移動：1回目は即時、その後は一定間隔。何か起きたら止まる。
  function startHold(dir) {
    stopHold();
    if (UI.modals.length) return;
    const r = doAct({ type: 'move', dir });
    if (!r || !calm(r)) return;
    UI.hold = { dir, timer: setTimeout(function rep() {
      if (!UI.hold || UI.modals.length) return;
      const r2 = doAct({ type: 'move', dir });
      if (!r2 || !calm(r2)) { stopHold(); return; }
      UI.hold.timer = setTimeout(rep, 150);
    }, 380) };
  }
  function stopHold() { if (UI.hold) { clearTimeout(UI.hold.timer); UI.hold = null; } }
  // 連続移動を続けてよいか（移動だけで、新しい敵も見えていない）
  function calm(r) {
    if (!r.consumed) return false;
    if (r.events.some((e) => e.t !== 'move')) return false;
    return G.visibleEnemies(UI.S.run).length === 0;
  }

  function onKey(e) {
    if (UI.screen === 'title') return;
    const top = topModal();
    if (top) {
      if (e.key === 'Escape') { top.close(); e.preventDefault(); }
      else if (e.key === 'Enter') { const b = top.el.querySelector('.modal-buttons button.primary:not(:disabled)'); if (b) { b.click(); e.preventDefault(); } }
      return;
    }
    if (UI.screen !== 'dungeon' || !UI.S.run) return;
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right',
      q: 'upleft', e: 'upright', z: 'downleft', c: 'downright', Home: 'upleft', PageUp: 'upright', End: 'downleft', PageDown: 'downright' };
    const num = { Numpad8: 'up', Numpad2: 'down', Numpad4: 'left', Numpad6: 'right', Numpad7: 'upleft', Numpad9: 'upright', Numpad1: 'downleft', Numpad3: 'downright' };
    const dir = num[e.code] || map[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (dir) {
      e.preventDefault();
      if (e.repeat && UI.lastKeyResult && !calm(UI.lastKeyResult)) return; // 何か起きたらキーを離すまで止める
      UI.lastKeyResult = doAct({ type: 'move', dir }) || UI.lastKeyResult;
      return;
    }
    if (e.repeat) return;
    if (e.key === ' ' || e.key === '.' || e.code === 'Numpad5') { e.preventDefault(); doAct({ type: 'wait' }); }
    else if (e.key === 'i' || e.key === 'I') openItems();
    else if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') dungeonMenu();
    else if (e.key === 'Enter') footAction();
  }

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
    handleEvents(res.events, action);
    save();
    updateHud();
    pushLog(logLen);
    if (S.run && S.run.over) { stopHold(); setTimeout(handleRunOver, 350); return res; }
    if (res.floorChanged) { AU.playBgm(S.run.floor === D.MAX_FLOOR ? 'boss' : 'dungeon'); toast('地下' + S.run.floor + '階'); }
    // 階段などに乗ったら確認
    const ev = res.events;
    if (ev.some((e) => e.t === 'onStairs')) { stopHold(); setTimeout(() => promptStairs(), 60); }
    else if (ev.some((e) => e.t === 'onReturnPoint' || e.t === 'onPortal')) { stopHold(); setTimeout(() => promptReturnPoint(), 60); }
    return res;
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
        case 'bagFull': toast('バッグがいっぱい！'); break;
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
    const lines = run.log.slice(-3);
    $('log').innerHTML = lines.map((l, i) => `<div class="${i === lines.length - 1 ? 'new' : ''}">${esc(l)}</div>`).join('');
  }
  function showLog() {
    const run = UI.S.run;
    modal({ title: 'メッセージ履歴', html: run.log.slice().reverse().map((l) => `<div>${esc(l)}</div>`).join(''), buttons: [{ label: '閉じる' }] });
  }

  function promptStairs() {
    if (!UI.S.run || UI.modals.length || !G.onStairs(UI.S.run)) return;
    const f = UI.S.run.floor;
    const nextBoss = f + 1 === D.MAX_FLOOR;
    modal({ title: '階段', html: `<p>下へ続く階段がある。地下${f + 1}階へ降りますか？</p>${nextBoss ? '<div class="warnbox">この先は「宝珠の間」。守護者が待っています。HPと道具を整えてから進もう。</div>' : ''}<p class="note">降りなかった場合も「足元」ボタンからいつでも降りられます。</p>`, buttons: [
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
      ? `<p>光る帰還口だ。村へ帰りますか？</p>${!orb && run.floorItems.some((f) => f.item && (f.item.id === 'wish_orb')) ? '<div class="warnbox">まだ宝珠を拾っていません！</div>' : ''}`
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
    const h = modal({ title: '道具', right: `${run.bag.length}/${D.BAG_SIZE}`, buttons: [{ label: '閉じる' }] });
    let html = '<p class="note">道具を見ている間は時間が進みません。</p><div class="list">';
    if (!run.bag.length) html += '<p>何も持っていない。</p>';
    for (const it of run.bag) html += itemRow(it, '');
    h.body.innerHTML = html + '</div>';
    h.body.querySelectorAll('.row').forEach((r) => r.addEventListener('click', () => {
      AU.sfx('tap');
      const it = run.bag.find((i) => i.uid === +r.dataset.uid);
      if (it) itemDetail(it, h);
    }));
  }

  function itemDetail(it, listModal) {
    const d = G.def(it);
    const buttons = [{ label: '戻る' }];
    const finish = (action) => { closeAllModals(); UI.lockUntil = 0; doAct(action); };
    if (d.type === 'weapon' || d.type === 'shield') buttons.push({ label: it.eq ? '外す（1ターン）' : '装備する（1ターン）', cls: 'primary', onClick: () => finish({ type: 'equip', uid: it.uid }) });
    else if (d.type === 'staff') buttons.push({ label: 'ふる（向きを選ぶ）', cls: 'primary', onClick: () => { setTimeout(() => pickDir((dir) => finish({ type: 'use', uid: it.uid, dir })), 0); } });
    else if (d.type === 'return') buttons.push({ label: '使う', cls: 'primary', onClick: () => { setTimeout(() => confirmReturnScroll(it), 0); } });
    else if (['heal', 'food', 'sleep', 'map'].includes(d.type)) buttons.push({ label: d.type === 'food' ? '食べる（1ターン）' : '使う（1ターン）', cls: 'primary', onClick: () => finish({ type: 'use', uid: it.uid }) });
    buttons.push({ label: '置く（1ターン）', onClick: () => {
      const run = UI.S.run;
      if (G.itemAt(run, run.player.x, run.player.y) || G.onStairs(run) || G.onReturnPoint(run) || G.onPortal(run)) { setTimeout(() => info('置けません', 'ここには置けません。'), 0); return; }
      finish({ type: 'drop', uid: it.uid });
    } });
    modal({ title: esc(G.itemName(it)), html: detailHtml(it), buttons });
  }

  function pickDir(cb) {
    const run = UI.S.run;
    const h = modal({ title: '稲妻の向き', html: `<p class="note">今の向き：${G.DIR_NAMES[run.player.dir]}（斜めにも撃てます）</p><div class="dir-pick">
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
    const html = `<div class="kv"><span>場所</span><span>地下${run.floor}階（${D.THEMES[D.FLOORS[run.floor].theme].name}）</span>
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
        ['sai', '無事でよかった。お店のお金と倉庫はそのままだよ。木刀とおにぎりも貸せるからね。'],
      ], () => { if (retry) openDepart(); });
      return;
    }
    const html = `<div class="kv"><span>到達</span><span>地下${res.floor}階</span><span>持ち帰ったお金</span><span>${res.gold}G（村の資金へ）</span><span>持ち帰った道具</span><span>${res.items}個</span></div>
      <p class="note">お宝はサイの店で売るとお金になります。</p>`;
    const after = () => {
      if (res.orb) return ending(res.firstClear);
      const V = S.village;
      const sellable = V.bag.filter((i) => G.def(i).type === 'treasure').length;
      const lines = [['sai', 'おかえり、たけ！' + (res.gold ? res.gold + 'Gも持って帰ってきたんだね。' : 'けがはない？')]];
      if (sellable) lines.push(['take', 'お宝も見つけたよ！お店で見てくれる？'], ['sai', 'まかせて！売ったお金で村をもっとにぎやかにしよう。']);
      else lines.push(['take', 'ただいま！次はもっと奥まで行ってみる。']);
      const next = D.VILLAGE_STAGES[V.stage + 1];
      if (next && V.funds >= next.cost) lines.push(['sai', '資金がたまったね！「村の発展」で' + next.name + 'が作れるよ。']);
      talk(lines);
    };
    modal({ title: '帰還！', html, onClose: after, buttons: [{ label: 'OK', cls: 'primary' }] });
  }

  function ending(first) {
    const V = UI.S.village;
    const lines = first ? [
      ['take', 'サイ！見て、これが願いの宝珠だよ！'],
      ['sai', 'わあ…夕日みたいにあったかい光。本当にあったんだね。'],
      ['take', '遺跡の守護獅子が、最後に道を開けてくれたんだ。'],
      ['sai', 'この宝珠、村の真ん中にまつろうよ。みんなが集まる場所になるように。'],
      ['take', 'うん。ぼくの願いは…このお店と村が、ずっとにぎやかでありますように。'],
      ['sai', 'ふふ、私も同じ願い。これからもよろしくね、たけ。'],
    ] : [
      ['take', '守護の輝石を持って帰ったよ！'],
      ['sai', 'すごい！宝珠のとなりに飾ろうか…やっぱり売って村のために使おう！'],
    ];
    talk(lines, () => {
      if (!first) return;
      V.seenEnding = true; save();
      modal({ title: 'エンディング', noClose: true, html: `<div class="ending"><p class="big-t">願いの宝珠を手に入れた！</p>
        <p>たけとサイの小さなお店は、宝珠の光に照らされて、今日もにぎやかです。</p>
        <p>帰還 ${V.returns}回・敗北 ${V.defeats}回</p>
        <p class="big-t">THANK YOU FOR PLAYING!</p>
        <p class="note">このあとも探索と村の発展を続けられます。10階の守護者は「守護の輝石」を落とすようになります。</p></div>`,
      buttons: [{ label: '村へ', cls: 'primary' }] });
    });
  }

  // テスト用に一部を公開
  UI.debug = { handleRunOver, openDepart, depart, openItems, footAction, save };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(globalThis.TS = globalThis.TS || {});
