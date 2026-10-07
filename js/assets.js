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
    /* たけの歩行・攻撃のコマ（tools/make-walk.py で、見本の静止画の脚・剣・体を動かして作る）。
     * 向き：front（下）・back（上）・side（左）・right（右。剣を体の向こうに持ち、手前に盾＝持ち手は入れ替えない）。
     * コマ：（無印）待機、_w1／_w2 左足・右足、_a1 構え、_a2 振り抜き。_nw は武器なし（剣を消した絵。正面と左だけ。右と背面は剣が見えない） */
    takeFrames: (() => {
      const out = {};
      for (const v of ['front', 'back', 'side', 'right']) for (const f of ['', '_w1', '_w2', '_a1', '_a2']) out[v + f] = C + 'take_' + v + f + '.png';
      for (const v of ['front', 'side']) for (const f of ['', '_w1', '_w2', '_a1', '_a2']) out[v + '_nw' + f] = C + 'take_' + v + '_nw' + f + '.png';
      return out;
    })(),
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
        'scroll:return': 'scroll_return', 'scroll:thunder': 'scroll_thunder', 'scroll:sight': 'scroll_sight', 'scroll:sense': 'scroll_sense',
        'powder:': 'powder', 'sleepgrass:': 'sleepgrass', 'bento:': 'bento',
        'herb:': 'herb', 'herb:big': 'herb_big', 'herb:cure': 'herb_cure',
        'coin:': 'coin', 'orb:': 'orb', 'pendant:': 'pendant_amber',
        'shard:crystal': 'shard_crystal', 'shard:amber': 'shard_amber', 'shard:bronze': 'shard_bronze', 'shard:gold': 'shard_gold',
      },
      /* 追加の道具の絵（assets/items-v2/。2026年10月、18種）。キーは js/data.js の道具の内部ID、値はファイル名。
       * 一覧用は assets/items-v2/○○.png（48×48）、床用は assets/items-v2/floor/○○.png（32×32。tools/make-items-v2-floor.py で作る）。
       * ここに書いた道具は、上の map（アイコン名:色分け）よりこちらの絵を優先する。読み込めなければ今までの絵のまま。 */
      byIdDir: 'assets/items-v2/',
      byId: {
        elixir: 'elixir', banana: 'banana', loan_rice: 'riceball', smoke_ball: 'smoke_ball', clear_incense: 'clear_incense',
        water_charm: 'water_charm', truth_mirror: 'truth_mirror', bolt_charm: 'bolt_charm',
        jade_elephant: 'jade_elephant', golden_lotus: 'golden_lotus', bronze_bell: 'bronze_bell', sunken_crown: 'sunken_crown',
        giant_crystal: 'giant_crystal', prism_flower: 'prism_flower', golden_elephant: 'golden_elephant', dream_crown: 'dream_crown',
        // ボスの報酬（見本 assets/reference/boss-treasures.png から tools/extract-boss-treasures.py で作る）
        croc_tear: 'croc_tear', iceflame_crystal: 'iceflame_crystal', phantom_shield: 'phantom_shield', shinma_sword: 'shinma_sword',
        // アクセサリー（assets/accessories/。値に「/」があるときはフォルダ付きのパス。床用は同じフォルダの floor/）
        poison_ring: 'assets/accessories/poison_ring', purse_charm: 'assets/accessories/money_guard',
        full_bangle: 'assets/accessories/hunger_bracelet', life_necklace: 'assets/accessories/revival_necklace',
      },
    },
    /* 床に落ちているお金（G。拾うと探索中のお金が増える通貨）。お宝「アユタヤの古金貨」（items の coin）とは別の絵。
     * 32px用と48px用。床では描く大きさに近いほうを最近傍で拡大縮小する（読み込めなければコードで描いた絵） */
    gold: { 32: 'assets/gold/gold_pickup_32.png', 48: 'assets/gold/gold_pickup_48.png' },
    /* 床に落ちているお宝（種類 treasure）の宝箱。見本 assets/reference/boss-treasures.png から tools/extract-boss-treasures.py で作る。
     * 床では1マスいっぱいに描く。持ち物・展示室では、お宝ごとの絵（items）を使う */
    chest: { 32: 'assets/chest/chest_32.png', 48: 'assets/chest/chest_48.png' },
    /* 村の素材（assets/village/、2026年10月「サイの店〜ヤナイ像の広場」）。寸法と足元の位置は assets/village/manifest.json。
     * 建物・小物（店・像・木・花壇・屋台・ベンチ）は、見本の細かさが村のマスより細かいので 2/3 の大きさで描く（1マス32ドット）。
     *   2/3 にすると店の幅が今までの店（4マス＋余白）とほぼ同じになる。スマホ（1ドット＝3ピクセル）ではちょうど2ピクセルずつになる。
     * 子供（64×64、足元 32,60）と猫（32×32、足元 16,28）は人物と同じ等倍（子供は大人の約7割、猫はさらに小さい）。
     * 子供の正面・右・背面は歩行のコマではなく、向きの静止画。左向きは右向きを反転する。読み込めなければ今までのコードの絵 */
    village: {
      dir: 'assets/village/', propScale: 2 / 3,
      props: { sai_shop: [112, 222], yanai_statue: [48, 158], tree: [64, 126], flowerbed: [48, 62], market_stall: [64, 126], bench: [48, 62],
        // 施設の外観 v2（2026年10月）：サイの店と同じ 224×224・同じ倍率（2/3）なので、人物に対する扉の大きさがそろう
        blacksmith: [112, 222], eatery: [112, 222], warehouse: [112, 222], exhibition: [112, 222] },
      /* 施設の絵の入口の中心（絵の左からのドット）。絵の足元（anchor）ではなく、この位置を「入る位置」のマスの真上に置く。
       * 食堂の入口は左寄り。鍛冶屋は開いた作業場の正面。炉の口・煙突・鍋の位置は火の光・煙・湯気に使う */
      doors: { sai_shop: 64, blacksmith: 104, eatery: 44, warehouse: 112, exhibition: 112 },
      fx: { blacksmith: { light: [108, 150, 22], smoke: [176, 22] }, eatery: { steam: [128, 150], light: [128, 160, 14] } },
      kids: { play: 'child_play', book: 'child_book', cat: 'child_cat' }, kidAnchor: [32, 60],
      cats: { ginger: 'cat_ginger', calico: 'cat_calico', black: 'cat_black' }, catAnchor: [16, 28],
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
