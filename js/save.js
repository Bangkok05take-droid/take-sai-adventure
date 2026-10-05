/* セーブ／ロード。形式にバージョンを付け、古いデータは migrate で引き継ぐ。 */
(function (TS) {
  'use strict';
  const D = TS.Data, G = TS.Game;
  const S_ = {};

  function storage() {
    try { return globalThis.localStorage || null; } catch (e) { return null; }
  }

  S_.serialize = (S) => JSON.stringify(S);

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
    const def = G.newState();
    fill(data, def);
    fill(data.village, def.village);
    fill(data.settings, def.settings);
    // 施設の段階（旧セーブの「村の発展」段階から倉庫・鍛冶屋の段階を引き継ぐ）
    G.applyFacilities(data.village);
    if (data.run) {
      if (!data.run.map || !data.run.player) data.run = null;
      else fill(data.run.player, { poison: 0, poisonGuard: 0 });
    }
    data.version = D.SAVE_VERSION;
    return data;
  };

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
