/* 画像素材の設定（ゲーム処理とは別）。画像を差し替えるときは、ここのパスを書きかえるか同じ名前で上書きする。
 * null や読み込めなかった画像は、コードで描いたドット絵を使う（ゲームは止まらない）。
 *
 * 人物（assets/chars/）：デザイン見本 assets/reference/ から tools/extract-art.py で作った透過PNG。
 *   キャンバスは全員 横52×縦64（1ドット＝1ピクセル）。足の裏は下から2ドット目（y=62）、左右は足元の中央が x=26。
 *   front=正面 back=背面 side=横向き（見本は左向き。右向きは左右反転して使う）。
 *   歩行の別コマは見本に無いので、1ドットの上下動で歩きを表している（不足素材：README 参照）。
 * 道具（assets/items/）：tools/extract-items.py で作った透過PNG。list=一覧用48×48、floor=床に置いた状態32×32。
 *   キーは「アイコン名:色分け」（js/data.js の icon と tint）。ここに無い道具はコードで描いたアイコン。
 * portraits / bosses：会話の顔絵・ボスの絵の差し替え先（正方形。ボスは1コマ正方形を横に2コマ）。 */
(function (TS) {
  'use strict';
  const C = 'assets/chars/', I = 'assets/items/';
  const views = (n, side) => ({ front: C + n + '_front.png', back: C + n + '_back.png', side: side ? C + n + '_side.png' : null });
  TS.ASSETS = {
    chars: {
      take: views('take', true), sai: views('sai', true), yanai: views('yanai', true),
      koi: views('koi'), mot: views('mot'), waan: views('waan'), tiw: views('tiw'),
      merchant: views('merchant', true),   // 謎の旅商人（見本 merchant.png。ほかの人物と背丈をそろえて約50ドット）
    },
    charBox: { w: 52, h: 64, foot: 62 },
    items: {
      dir: I,
      map: {
        'sword:wood': 'sword_wood', 'sword:copper': 'sword_copper', 'sword:iron': 'sword_iron', 'sword:steel': 'sword_steel',
        'sword:jade': 'sword_jade', 'sword:crystal': 'sword_crystal', 'sword:gold': 'sword_gold', 'sword:frost': 'sword_frost',
        'sword:dragon': 'sword_dragon', 'sword:hero': 'sword_hero', 'sword:': 'sword',
        'shield:wood': 'shield_wood', 'shield:iron': 'shield_iron', 'shield:steel': 'shield_steel', 'shield:jade': 'shield_jade',
        'shield:crystal': 'shield_crystal', 'shield:gold': 'shield_gold', 'shield:dragon': 'shield_dragon', 'shield:moon': 'shield_moon',
        'shield:hero': 'shield_hero', 'shield:': 'shield',
        'staff:': 'staff', 'staff:king': 'staff_king',
        'scroll:return': 'scroll_return', 'scroll:thunder': 'scroll_thunder', 'scroll:sight': 'scroll_sight',
        'powder:': 'powder', 'sleepgrass:': 'sleepgrass', 'bento:': 'bento',
        'herb:': 'herb', 'herb:big': 'herb_big', 'herb:cure': 'herb_cure',
        'coin:': 'coin', 'orb:': 'orb', 'pendant:': 'pendant_amber',
        'shard:crystal': 'shard_crystal', 'shard:amber': 'shard_amber', 'shard:bronze': 'shard_bronze', 'shard:gold': 'shard_gold',
      },
    },
    portraits: { take: null, sai: null, yanai: null, villager: null },
    /* ボス（assets/bosses/）：見本 assets/reference/bosses.png から tools/extract-bosses.py で作った透過PNG。
     * キャンバス 96×96（1ドット＝1ピクセル。たけと同じ細かさ）、足の裏は y=92、足元の中央は x=48。正面の1枚だけ（横向き・背面・歩行コマは無い）。
     * キーは js/data.js の敵の sprite 名。分身（kill_clone・mist_clone）も同じ絵を使う。 */
    bosses: { croc: 'assets/bosses/croc.png', flame: 'assets/bosses/flame.png', kill: 'assets/bosses/kill.png', baran: 'assets/bosses/baran.png',
      mist: 'assets/bosses/mist.png', vearn: 'assets/bosses/vearn.png', truevearn: 'assets/bosses/truevearn.png' },
    bossBox: { w: 96, h: 96, foot: 92 },
    /* 通常の敵（assets/enemies/）：見本の一覧画像から tools/extract-enemies.py で作る透過PNG。まだ素材が無いので空。
     * 1コマは 64×64（足の裏 y=60、足元の中央 x=32）、待機2コマなら横に並べた 128×64。キーは js/data.js の敵の sprite 名。
     * 書いた敵だけ画像に替わり、書かない敵は今までのコードで描いた絵のまま。必要な素材の一覧は docs/ENEMY_ART.md */
    enemies: {},
    enemyBox: { w: 64, h: 64, foot: 60 },
  };
})(globalThis.TS = globalThis.TS || {});
