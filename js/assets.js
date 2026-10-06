/* 画像素材の差し替え設定（ゲーム処理とは別）。
 * 完成画像ができたら assets/ に置き、ここにパスを書く。null のものは、コードで描いた暫定のドット絵を使う。
 *  portraits：会話の顔絵（正方形。64×64 など）。friend1 / friend2 はサイの友達（名前は js/story.js の D.CAST）
 *  bosses   ：ボスの絵（1コマ正方形を横に2コマ並べた画像。例 128×64）。キーは js/data.js の敵の sprite 名 */
(function (TS) {
  'use strict';
  TS.ASSETS = {
    portraits: { take: null, sai: null, yanai: null, villager: null, friend1: null, friend2: null },
    bosses: { croc: null, flame: null, kill: null, baran: null, mist: null, vearn: null, truevearn: null },
  };
})(globalThis.TS = globalThis.TS || {});
