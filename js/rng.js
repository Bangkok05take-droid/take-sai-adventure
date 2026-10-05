/* 保存可能なシード付き乱数（mulberry32）。状態 {s} をセーブに含めるので
 * 再読み込みしても同じ結果になり、アイテムや敵が増殖しない。 */
(function (TS) {
  'use strict';
  const R = {
    create(seed) { return { s: seed >>> 0 }; },
    next(st) {
      let t = (st.s = (st.s + 0x6D2B79F5) | 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(st, a, b) { return a + Math.floor(R.next(st) * (b - a + 1)); },
    chance(st, p) { return R.next(st) < p; },
    pick(st, arr) { return arr[Math.floor(R.next(st) * arr.length)]; },
    weighted(st, pairs) {
      let total = 0;
      for (const p of pairs) total += p[1];
      let r = R.next(st) * total;
      for (const p of pairs) { r -= p[1]; if (r < 0) return p[0]; }
      return pairs[pairs.length - 1][0];
    },
    shuffle(st, arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(R.next(st) * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
  TS.RNG = R;
})(globalThis.TS = globalThis.TS || {});
