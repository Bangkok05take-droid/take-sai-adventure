/* セーブ／ロード。形式にバージョンを付け、古いデータは migrate で引き継ぐ。 */
(function (TS) {
  'use strict';
  const D = TS.Data, G = TS.Game;
  const S_ = {};

  function storage() {
    try { return globalThis.localStorage || null; } catch (e) { return null; }
  }

  S_.serialize = (S) => JSON.stringify(S);

  // v4 で変わった道具の内部ID（旧 → 新）
  S_.RENAME_V4 = { guardian_gem: 'croc_tear', river_pearl: 'iceflame_crystal', dragon_shield: 'phantom_shield', frost_sword: 'shinma_sword' };

  // 足りない項目を既定値で補う（将来の項目追加に備える）
  function fill(target, defaults) {
    for (const k of Object.keys(defaults)) {
      if (target[k] === undefined) target[k] = defaults[k];
    }
    return target;
  }

  S_.migrate = function (data) {
    if (!data || typeof data !== 'object') return null;
    if (typeof data.version !== 'number') data.version = 1;
    if (data.version > D.SAVE_VERSION) return data; // 新しい版のデータはそのまま
    // v1 → v2：10階クリアの記録は「旧記録」として残し、30階の新しい目標と区別する
    if (data.version === 1) {
      const V = data.village || {};
      if (V.cleared) { V.legacyClear10 = true; V.legacyClears = V.clears || 1; }
      V.cleared = false; V.clears = 0;
      // 探索途中に旧・宝珠（10階）を持っていた場合は、守護の輝石に置き換えて旧記録に加える
      const swap = (it) => { if (it && it.id === 'wish_orb') { it.id = 'guardian_gem'; V.legacyClear10 = true; } };
      if (data.run) {
        (data.run.bag || []).forEach(swap);
        (data.run.floorItems || []).forEach((f) => swap(f.item));
      }
      (V.bag || []).forEach(swap); (V.storage || []).forEach(swap);
      data.village = V;
      data.version = 2;
    }
    /* v2 → v3：章の進行を追加。以前の30階クリア（願いの宝珠）は「旧版のクリア記録」として残し、
     * 新しい章は第1章から（旧版クリアで全章攻略済みにはしない）。所持金・道具・装備・施設・倉庫はそのまま。
     * 更新前から続いている探索は、地形と状態をそのまま残し、以前のルールで村へ帰る（帰還後に章の進行が始まる）。 */
    if (data.version === 2) {
      const V = data.village || {};
      if (V.cleared) { V.legacyClear30 = true; V.legacyClears30 = V.clears || 1; }
      V.cleared = false; V.clears = 0;
      const swap = (it) => { if (it && it.id === 'wish_orb') { it.id = 'dream_crown'; V.legacyClear30 = true; } };
      if (data.run) {
        (data.run.bag || []).forEach(swap);
        (data.run.floorItems || []).forEach((f) => swap(f.item));
        delete data.run.chapter;   // 以前のルールの探索（legacy）
      }
      (V.bag || []).forEach(swap); (V.storage || []).forEach(swap);
      V.story = G.newStory();
      data.village = V;
      data.version = 3;
    }
    /* v3 → v4（2026年10月）：ボスの報酬の入れ替え。
     * お宝：獅子の守り石 → クロコダイルの涙、大ナマズの大真珠 → 氷炎結晶（展示室の4番目・8番目の枠）。
     * 装備：りゅうりんの盾 → ファントムシールド、ひょうえんの剣 → 真魔剛竜剣（強化値・装備中・番号はそのまま）。
     * 寄贈済みの記録も新しいお宝へ移す（数は増やさない・お礼は払わない）。
     * 新しい報酬になる前にクロコダイン・フレイザードを倒していた場合、そのお宝はもう手に入らないので、
     * 持っていなければ1つだけ倉庫へ届ける（村で一度だけお知らせする）。 */
    if (data.version === 3) {
      const V = data.village || {};
      const RENAME = S_.RENAME_V4;
      const fix = (it) => { if (it && RENAME[it.id]) it.id = RENAME[it.id]; };
      const all = () => {
        const list = (V.bag || []).concat(V.storage || []);
        if (data.run) list.push(...(data.run.bag || []), ...(data.run.floorItems || []).map((f) => f.item).filter(Boolean));
        return list;
      };
      all().forEach(fix);
      const don = V.donated || {};
      for (const [from, to] of Object.entries(RENAME)) {
        if (don[from]) { don[to] = true; delete don[from]; }
      }
      V.donated = don;
      const st = V.story || {}, defeated = st.defeated || {};
      const gifts = [];
      for (const [boss, id] of [['croc', 'croc_tear'], ['flame', 'iceflame_crystal']]) {
        if (!defeated[boss] || don[id] || all().some((it) => it.id === id)) continue;
        V.storage = V.storage || [];
        V.nextUid = V.nextUid || 1;
        V.storage.push({ uid: V.nextUid++, id, plus: 0 });
        gifts.push(id);
      }
      if (gifts.length) V.giftNotice = gifts;
      data.village = V;
      data.version = 4;
    }
    // v4 → v5（2026年10月）：ボス部屋の戦いの状態（run.bossFight）を、探索途中のセーブから安全に作る（下の fixBossFight）
    if (data.version === 4) data.version = 5;
    const def = G.newState();
    fill(data, def);
    fill(data.village, def.village);
    const st = fill(data.village.story, G.newStory());
    for (const k of ['defeated', 'rewardClaimed', 'returnDone']) fill(st[k], G.newStory()[k]);
    fill(data.settings, def.settings);
    // 施設の段階（旧セーブの「村の発展」段階から倉庫・鍛冶屋の段階を引き継ぐ）
    G.applyFacilities(data.village);
    if (data.run) {
      if (!data.run.map || !data.run.player) data.run = null;
      else {
        fill(data.run.player, { poison: 0, poisonGuard: 0, bound: 0, bindGuard: 0 });
        fill(data.run, { hazards: [], fog: 0 });
        fixBossFight(data.run);
      }
    }
    data.version = D.SAVE_VERSION;
    return data;
  };

  /* ボスの階の探索途中のセーブ（この更新の前）に、ボス部屋の戦いの状態を足す。HP・報酬・撃破の記録は変えない。
   * - ボス部屋：ボスの階の地図のいちばん大きな部屋（ボスの階は「前室」と「大広間」の2部屋）
   * - すでにボスがいない（倒した）：戦いは終わり（won）
   * - ボスが傷ついている・目を覚ましている・予告中・分身や手下がいる・床の印がある・たけが部屋の中・最終決戦の途中：戦い中（engaged）
   * - どれでもない：まだ始まっていない（ボスを部屋の中央へ戻す）
   * - ボス・手下が通路など部屋の外にいたら、たけと重ならない部屋の中の空いた床へ移す（予告中の大技は取り消す） */
  function fixBossFight(run) {
    if (run.bossFight !== undefined && run.bossFight !== null) return;
    let F; try { F = G.F(run); } catch (e) { return; }
    if (!F || !F.boss || !run.map.rooms || !run.map.rooms.length) { run.bossFight = null; return; }
    const room = run.map.rooms.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
    run.bossFight = { x: room.x, y: room.y, w: room.w, h: room.h, engaged: false };
    const A = run.bossFight, p = run.player;
    const bosses = (run.enemies || []).filter((e) => e.boss), helpers = (run.enemies || []).filter((e) => e.summoned || e.clone);
    const inside = (o) => G.inArena(run, o.x, o.y);
    if (!bosses.length) { A.engaged = true; A.won = true; return; }
    A.engaged = bosses.some((b) => b.hp < b.maxhp || b.awake || b.charge || (b.cds && Object.keys(b.cds).length)) || helpers.length > 0 ||
      (run.hazards && run.hazards.length > 0) || inside(p) || !!(run.final && run.final.stage && run.final.stage !== 'battle1');
    for (const e of bosses.concat(helpers)) {
      if (inside(e) && (A.engaged || !e.boss)) continue;
      const c = G.arenaCenter(run, [p]);
      e.x = c.x; e.y = c.y; e.tx = e.ty = null; e.charge = null;
    }
  }

  S_.deserialize = function (text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return null; }
    data = S_.migrate(data);
    if (data && data.run) G.updateVision(data.run);
    return data;
  };

  S_.save = function (S) {
    const ls = storage();
    if (!ls) return false;
    try { ls.setItem(D.SAVE_KEY, S_.serialize(S)); return true; } catch (e) { return false; }
  };
  S_.load = function () {
    const ls = storage();
    if (!ls) return null;
    const t = ls.getItem(D.SAVE_KEY);
    return t ? S_.deserialize(t) : null;
  };
  S_.exists = function () {
    const ls = storage();
    return !!(ls && ls.getItem(D.SAVE_KEY));
  };
  S_.clear = function () {
    const ls = storage();
    if (ls) ls.removeItem(D.SAVE_KEY);
  };

  TS.Save = S_;
})(globalThis.TS = globalThis.TS || {});
