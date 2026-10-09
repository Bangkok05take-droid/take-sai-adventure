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
        croc_tear: 'croc_tear', iceflame_crystal: 'iceflame_crystal',
        // ボスの報酬の装備7種（2026年10月、ZIP take-sai-boss-equipment-v2-complete。元の素材は assets/reference/boss-equipment-v2/）。
        // 一覧・装備・報酬の画面は assets/items-boss/（icons-128、128×128）、床は assets/items-boss/floor/（icons-64）。描き直しはしていない
        croc_axe: 'assets/items-boss/crocodine-axe', iceflame_shield: 'assets/items-boss/icefire-shield',
        phantom_shield: 'assets/items-boss/phantom-shield', phantom_mask: 'assets/items-boss/phantom-mask',
        shinma_sword: 'assets/items-boss/shinma-goryuken', demon_robe: 'assets/items-boss/great-demon-robe',
        // アクセサリーの竜の紋章（2026年10月 v3）：金のペンダントに青い竜の紋章（ZIP take-sai-dragon-pendant-v3 の 128・64）。
        // 以前の青い紋章だけの絵（dragon-emblem.png）は、お宝の紋章用に残している（お宝の紋章はまだゲームに無い）
        dragon_crest: 'assets/items-boss/dragon-pendant',
        // お宝の竜の紋章（通常のバランの報酬）：以前の青い紋章の絵。ドラゴニックオーラの盾：受け取った絵を128／64に縮めたもの
        baran_emblem: 'assets/items-boss/dragon-emblem', dragonic_shield: 'assets/items-boss/dragonic-aura-shield',
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
    /* ボスの登場ムービー（2026年10月、ZIP take-sai-crocodine-movie-v1）。どのボスで流すかは data.js の D.BOSS_INTROS（ボスID → 名前）。
     * 起動時には読み込まない（ボスの階に着いたときに準備し、部屋に入ったら流す）。720×1280・約10秒・H.264＋AAC（再エンコードなし）。
     * poster：読み込み中に出す最初の1コマ */
    movies: { crocodine: { video: 'assets/movies/crocodine-intro.mp4', poster: 'assets/movies/crocodine-poster.jpg' },
      // バランの登場ムービー（2026年10月、採用済みの完成動画。720×1280・約10秒・H.264＋AAC。再エンコードなし）。poster は動画の最初の1コマ
      baran: { video: 'assets/movies/baran-intro.mp4', poster: 'assets/movies/baran-poster.jpg' },
      // 通常のバランの撃破後ムービー（2026年10月、完成動画。ミストバーンが黒紫の霧でバランを連れ去る。720×1280・10秒・H.264＋AAC。再エンコードなし）
      baranTaken: { video: 'assets/movies/baran-taken.mp4', poster: 'assets/movies/baran-taken-poster.jpg' } },
    /* 村の素材（assets/village/、2026年10月「サイの店〜ヤナイ像の広場」）。寸法と足元の位置は assets/village/manifest.json。
     * 建物・小物（店・像・木・花壇・屋台・ベンチ）は、見本の細かさが村のマスより細かいので 2/3 の大きさで描く（1マス32ドット）。
     *   2/3 にすると店の幅が今までの店（4マス＋余白）とほぼ同じになる。スマホ（1ドット＝3ピクセル）ではちょうど2ピクセルずつになる。
     * 子供（64×64、足元 32,60）と猫（32×32、足元 16,28）は人物と同じ等倍（子供は大人の約7割、猫はさらに小さい）。
     * 子供の正面・右・背面は歩行のコマではなく、向きの静止画。左向きは右向きを反転する。読み込めなければ今までのコードの絵 */
    village: {
      dir: 'assets/village/', propScale: 2 / 3,
      /* 街の床（2026年10月）：128×128＝32ドットの床4×4マス分の連続した模様。1マスに縮めず、地図のドット座標（128で割った余り）で
       * そのまま写すので、模様は世界に固定（カメラが動いてもずれない）。contrast：明暗を少し弱める割合（人物・建物を引き立てる） */
      ground: { dir: 'assets/village/ground/', size: 128, textures: { sandstone: 0.72, brick: 0.72, grass: 0.8, earth: 0.8, water: 0.9 } },
      /* 村の木・川・こもれびの家（2026年10月、assets/reference/community-nature-v1/ の完成素材を tools/extract-community.py で縮めた絵）。
       * water（上の ground）：川の水面。256×256 を世界の座標で交互に反転して並べる（size の 128 ではなく絵の大きさで写す）。
       * house：「村の発展」のテントに代わる「こもれびの家」（117×96）。階段の下の端が足元。名前は TS.Village.COMMUNITY_NAME。
       * tree：ヤシに代わる白い花の広葉樹（64×56）。幹の根元が足元 */
      community: { dir: 'assets/village/community/', names: ['house', 'tree'] },
      props: { sai_shop: [112, 222], yanai_statue: [48, 158], tree: [64, 126], flowerbed: [48, 62], market_stall: [64, 126], bench: [48, 62],
        // 施設の外観 v2（2026年10月）：サイの店と同じ 224×224・同じ倍率（2/3）なので、人物に対する扉の大きさがそろう
        blacksmith: [112, 222], eatery: [112, 222], warehouse: [112, 222], exhibition: [112, 222],
        // 港 v1（2026年10月）：桟橋・小舟・岸壁・荷物・係留杭。建物と同じ倍率（桟橋の板の幅＝店の扉の幅）
        pier: [48, 222], boat: [128, 94], quay: [128, 62], supplies: [48, 62], bollard: [16, 62] },
      /* 港の絵の使い方（manifest の content_rect＝不透明な部分 [x, y, 幅, 高さ]）
       * pierCut：桟橋は川（3マス）に合わせて、くり返しの区間（綱の所 83〜178 行）を抜いて短くする
       * quayRect：岸壁は左右の透明な余白を除いた部分を横に並べる。quayTop：上面の石の高さ（その下が前面の石積み）
       * boatBob：舟だけゆっくり上下（描く位置だけ。操作の範囲は動かさない） */
      /* アユタヤの遺跡（2026年10月）：見本 assets/reference/ayutthaya-ruins-v1.png から tools/extract-ruins.py で作った、村の大きさそのままの絵。
       * gateOpen：門の開口の中心（絵の左から）。この位置を石段（x9〜10）の真ん中に置く */
      /* 村の飾り（2026年10月）：街灯・白いゾウの像・噴水・赤い橋。見本 assets/reference/village-decor-v1.png から tools/extract-decor.py で作った、
       * 村の大きさそのままの絵。lampHead：街灯の灯りの中心（足元からの高さ）。fountainSpout：噴水の吹き出し口（絵の上からの高さ）。
       * bridgeDeck：橋の床板の上端（絵の上から）。ここを岸壁の上面に重ねる。橋の長さは extract-decor.py で中ほどを抜いて、岸壁から向こう岸の草地まで。
       * bridgeRail：左右の欄干の幅（人物との前後を決めるため、この幅で横に切って重ねる） */
      decor: { dir: 'assets/village/decor/', names: ['lamp', 'elephant', 'fountain', 'bridge', 'fountain_spray'], lampHead: 47, fountainSpout: 10, bridgeDeck: 25, bridgeRail: 18,
        /* 噴水の水流（2026年10月、ZIP take-sai-fountain-endgame-v1。元の素材と描画の見本は assets/reference/fountain-endgame-v1/）。
         * fountain_spray.png：ChatGPT制作の透過の水流（1328×1173 を縦横比のまま幅256へ縮めただけ。描き直しなし）。
         * nozzle：噴水の絵（78×77）の中の吹き出し口＝頂の飾りの先。水流の下端中央をここに合わせる。
         * basin：外側の水盤の楕円 [中心x, 中心y, 横半径, 縦半径]（波紋の範囲）。basinSeed：外側の水面の1点（水面だけを選ぶ）。
         * width：水流の幅＝外側の水盤の幅（絵の幅）×0.46。alpha：不透明度 0.82（見本のまま） */
        fountainFx: { nozzle: [39, 2], basin: [39, 41, 29, 13], basinSeed: [12, 40], width: 0.46, alpha: 0.82 } },
      ruins: { dir: 'assets/village/ruins/', names: ['tower', 'gate', 'banyan_wall', 'broken_wall'], gateOpen: 82 },
      harbor: { pierCut: [83, 178], quayRect: [2, 11, 252, 51], quayTop: 25, boatBob: { amp: 1, period: 4000 } },
      /* 施設の絵の入口の中心（絵の左からのドット）。絵の足元（anchor）ではなく、この位置を「入る位置」のマスの真上に置く。
       * 食堂の入口は左寄り。鍛冶屋は開いた作業場の正面。炉の口・煙突・鍋の位置は火の光・煙・湯気に使う */
      doors: { sai_shop: 64, blacksmith: 104, eatery: 44, warehouse: 112, exhibition: 112 },
      fx: { blacksmith: { light: [108, 150, 22], smoke: [176, 22] }, eatery: { steam: [128, 150], light: [128, 160, 14] } },
      kids: { play: 'child_play', book: 'child_book', cat: 'child_cat' }, kidAnchor: [32, 60],
      cats: { ginger: 'cat_ginger', calico: 'cat_calico', black: 'cat_black' }, catAnchor: [16, 28],
      /* ティウの相棒のオオカミ（2026年10月、ChatGPT制作の完成画像。元は assets/reference/tiw-wolf-v1/wolf-original.png）。
       * tools/make-wolf.py で縮めただけ（44×38、高さはティウの約8割）。左を向いた絵。anchor：足元の中央 [x, 足の裏の高さ] */
      wolf: { name: 'wolf', anchor: [22, 37] },
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
