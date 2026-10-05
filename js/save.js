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
    // ここに将来の変換を追加する（例：if (data.version === 1) { ...; data.version = 2; }）
    const def = G.newState();
    fill(data, def);
    fill(data.village, def.village);
    fill(data.settings, def.settings);
    if (data.run) {
      if (!data.run.map || !data.run.player) data.run = null;
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
