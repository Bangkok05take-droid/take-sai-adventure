/* ゲームの調整用データ（敵・道具・階層・村）
 * 数値はここをいじればバランス調整できます。 */
(function (TS) {
  'use strict';
  const D = {};

  D.SAVE_VERSION = 1;
  D.SAVE_KEY = 'takeSaiAdventure.save';

  // マップ（3x3 の区画にランダムな部屋を置く）
  D.MAP = { cols: 3, rows: 3, cellW: 11, cellH: 8 };
  D.MAP.w = D.MAP.cols * D.MAP.cellW;
  D.MAP.h = D.MAP.rows * D.MAP.cellH;

  D.MAX_FLOOR = 10;
  D.RETURN_POINT_FLOORS = [3, 6, 9];
  D.BAG_SIZE = 12;

  // プレイヤー
  D.PLAYER = {
    baseHp: 30,
    hpPerLevel: 6,
    baseAtk: 4,
    atkPerLevel: 1,
    maxHunger: 100,
    hungerTurns: 8,      // この行動数ごとに満腹度 -1
    regenTurns: 110,     // この行動数で最大HP分回復する速さ
    starveTurns: 2,      // 満腹度0のとき、この行動数ごとにHP -1
    hitRate: 0.95,
  };
  // レベルnに必要な累計経験値（index = レベル）
  D.EXP_TABLE = [0, 0, 8, 20, 38, 62, 92, 130, 176, 232, 300, 380, 470, 570, 680, 800, 940, 1100, 1280, 1480, 1700];

  D.ENEMY_HIT_RATE = 0.88;
  D.SPAWN_INTERVAL = 45;   // この行動数ごとに見えない場所へ敵が湧く
  D.MAX_ENEMIES = 8;

  /* 道具（20種）
   * type: weapon / shield / heal / food / sleep / staff / return / map / treasure / orb
   * price: お店の買値（0 = 売っていない）, sell: 売値
   * loan: 貸出品（売却・預入不可） noSell / noStore: 売却不可・預入不可 */
  D.ITEMS = {
    wood_sword:    { name: '貸出の木刀', type: 'weapon', atk: 1, sell: 0, loan: true, noSell: true, noStore: true, icon: 'sword', tint: 'wood',
      desc: 'サイの店で無料で借りられる木刀。売却・預入はできない。' },
    bronze_sword:  { name: '青銅の剣', type: 'weapon', atk: 3, price: 150, sell: 60, icon: 'sword', tint: 'bronze',
      desc: '昔の兵士の剣。手になじむ。' },
    iron_katana:   { name: '鉄の刀', type: 'weapon', atk: 6, sell: 130, icon: 'sword', tint: 'iron',
      desc: '遺跡で眠っていた鋭い刀。' },
    ivory_blade:   { name: '象牙の大刀', type: 'weapon', atk: 9, sell: 240, icon: 'sword', tint: 'ivory',
      desc: '王の護衛が持っていたという大刀。' },
    bamboo_shield: { name: '竹の盾', type: 'shield', def: 2, price: 120, sell: 45, icon: 'shield', tint: 'bamboo',
      desc: '軽くて丈夫な竹あみの盾。' },
    bronze_shield: { name: '青銅の盾', type: 'shield', def: 4, sell: 100, icon: 'shield', tint: 'bronze',
      desc: '象の紋章が入った盾。' },
    turtle_shield: { name: '亀甲の盾', type: 'shield', def: 7, sell: 210, icon: 'shield', tint: 'turtle',
      desc: '石ガメの甲羅で作った堅い盾。' },
    herb:          { name: '薬草', type: 'heal', heal: 35, price: 30, sell: 12, icon: 'herb',
      desc: 'HPを35回復する。' },
    elixir:        { name: '霊薬', type: 'heal', heal: 999, price: 150, sell: 55, icon: 'potion',
      desc: 'HPを全回復する。' },
    banana:        { name: 'バナナ', type: 'food', food: 45, price: 20, sell: 8, icon: 'banana',
      desc: '満腹度を45回復する。' },
    khaoniao:      { name: 'カオニャオ', type: 'food', food: 100, price: 45, sell: 18, icon: 'rice',
      desc: '竹かごのもち米。満腹度を100回復する。' },
    loan_rice:     { name: '貸出のおにぎり', type: 'food', food: 50, sell: 0, loan: true, noSell: true, noStore: true, icon: 'onigiri',
      desc: 'サイが無料で持たせてくれるおにぎり。満腹度を50回復。売却・預入はできない。' },
    sleep_incense: { name: '眠りのお香', type: 'sleep', turns: 10, price: 90, sell: 35, icon: 'incense',
      desc: '見えている敵を10ターン眠らせる（守護者は3ターン）。' },
    thunder_staff: { name: '稲妻の杖', type: 'staff', dmg: 30, sell: 60, icon: 'staff',
      desc: '向いている方向にまっすぐ稲妻を飛ばし、最初に当たった敵に30ダメージ。防御を無視する。' },
    return_scroll: { name: '帰還の巻物', type: 'return', sell: 0, noSell: true, noStore: true, icon: 'scroll', tint: 'red',
      desc: 'その場で探索を終え、持ち物と探索中のお金を村へ持ち帰る。出発時に1枚無料支給。帰還・敗北で消える。' },
    sight_scroll:  { name: '見通しの巻物', type: 'map', price: 80, sell: 30, icon: 'scroll', tint: 'blue',
      desc: 'その階の地形・階段・道具の場所がわかる。' },
    old_coin:      { name: '古い金貨', type: 'treasure', sell: 40, icon: 'coin',
      desc: '昔の王国の金貨。サイの店で売れる。' },
    jade_elephant: { name: '翡翠の象', type: 'treasure', sell: 120, icon: 'elephant',
      desc: '小さな翡翠の置物。高く売れる。' },
    golden_lotus:  { name: '黄金の蓮', type: 'treasure', sell: 260, icon: 'lotus',
      desc: '金でできた蓮の花。とても高く売れる。' },
    guardian_gem:  { name: '守護の輝石', type: 'treasure', sell: 350, icon: 'gem',
      desc: '守護獅子が守っていた輝く石。とても高く売れる。' },
    wish_orb:      { name: '願いの宝珠', type: 'orb', sell: 0, noSell: true, noStore: true, icon: 'orb',
      desc: '遺跡の奥に眠っていた宝珠。村へ持ち帰ろう！' },
  };

  // 鍛冶屋の強化
  D.SMITH = { maxPlus: 3, cost: (plus) => 80 * (plus + 1), sellPerPlus: 15 };

  /* 敵
   * ai: melee 普通 / slow 2ターンに1回動く / ranged 吹き矢 / dormant 近づくまで眠る / erratic ふらふら / boss */
  D.ENEMIES = {
    frog:   { name: 'ガマ蛙',       hp: 9,   atk: 4,  def: 1, exp: 3,   ai: 'melee',   sprite: 'frog' },
    turtle: { name: '石ガメ',       hp: 20,  atk: 5,  def: 6, exp: 8,   ai: 'slow',    sprite: 'turtle' },
    monkey: { name: '吹き矢ザル',   hp: 12,  atk: 3,  def: 1, exp: 7,   ai: 'ranged',  sprite: 'monkey', shoot: 4, range: 4 },
    root:   { name: '根っこオバケ', hp: 24,  atk: 8,  def: 3, exp: 13,  ai: 'dormant', sprite: 'root' },
    jelly:  { name: '水クラゲ',     hp: 28,  atk: 10, def: 4, exp: 17,  ai: 'erratic', sprite: 'jelly' },
    lion:   { name: '守護獅子',     hp: 150, atk: 14, def: 8, exp: 120, ai: 'boss',    sprite: 'lion', noScale: true },
  };
  D.ENEMY_SCALE = { hp: 0.11, atk: 0.07, exp: 0.12 }; // 1階ごとの上昇率

  // テーマ
  D.THEMES = {
    brick: { name: 'レンガの回廊' },
    roots: { name: '木の根の遺跡' },
    water: { name: '水の神殿' },
    orb:   { name: '宝珠の間' },
  };

  // 階層ごとの出現テーブル [id, 重み]
  D.FLOORS = [
    null,
    { theme: 'brick', enemies: [['frog', 1]], enemyCount: [2, 3], itemCount: [4, 5], goldCount: [2, 3],
      items: [['herb', 4], ['banana', 3], ['old_coin', 3], ['bamboo_shield', 1], ['sleep_incense', 1]] },
    { theme: 'brick', enemies: [['frog', 4], ['turtle', 1]], enemyCount: [3, 4], itemCount: [4, 5], goldCount: [2, 3],
      items: [['herb', 4], ['banana', 3], ['old_coin', 3], ['bronze_sword', 1], ['bamboo_shield', 1], ['sleep_incense', 1], ['thunder_staff', 1]] },
    { theme: 'brick', enemies: [['frog', 3], ['turtle', 1], ['monkey', 2]], enemyCount: [3, 4], itemCount: [4, 6], goldCount: [2, 3],
      items: [['herb', 4], ['banana', 3], ['old_coin', 3], ['jade_elephant', 1], ['bronze_sword', 1], ['bronze_shield', 1], ['sleep_incense', 1], ['thunder_staff', 1], ['sight_scroll', 1]] },
    { theme: 'roots', enemies: [['frog', 2], ['turtle', 2], ['monkey', 2], ['root', 2]], enemyCount: [4, 5], itemCount: [4, 6], goldCount: [2, 3],
      items: [['herb', 4], ['banana', 2], ['khaoniao', 1], ['old_coin', 2], ['jade_elephant', 2], ['iron_katana', 1], ['bronze_shield', 1], ['sleep_incense', 2], ['thunder_staff', 1], ['sight_scroll', 1]] },
    { theme: 'roots', enemies: [['frog', 1], ['turtle', 2], ['monkey', 2], ['root', 3]], enemyCount: [4, 5], itemCount: [4, 6], goldCount: [2, 3],
      items: [['herb', 4], ['banana', 2], ['khaoniao', 1], ['old_coin', 2], ['jade_elephant', 2], ['iron_katana', 1], ['bronze_shield', 1], ['sleep_incense', 2], ['thunder_staff', 1], ['sight_scroll', 1], ['elixir', 1]] },
    { theme: 'roots', enemies: [['turtle', 2], ['monkey', 2], ['root', 3], ['jelly', 1]], enemyCount: [4, 6], itemCount: [5, 6], goldCount: [2, 4],
      items: [['herb', 4], ['banana', 2], ['khaoniao', 1], ['jade_elephant', 2], ['golden_lotus', 1], ['iron_katana', 1], ['turtle_shield', 1], ['sleep_incense', 2], ['thunder_staff', 1], ['sight_scroll', 1], ['elixir', 1]] },
    { theme: 'water', enemies: [['turtle', 2], ['monkey', 2], ['root', 2], ['jelly', 3]], enemyCount: [4, 6], itemCount: [5, 6], goldCount: [2, 4],
      items: [['herb', 4], ['banana', 2], ['khaoniao', 2], ['jade_elephant', 2], ['golden_lotus', 1], ['ivory_blade', 1], ['turtle_shield', 1], ['sleep_incense', 2], ['thunder_staff', 1], ['sight_scroll', 1], ['elixir', 1]] },
    { theme: 'water', enemies: [['turtle', 1], ['monkey', 2], ['root', 2], ['jelly', 3]], enemyCount: [5, 6], itemCount: [5, 6], goldCount: [2, 4],
      items: [['herb', 4], ['banana', 2], ['khaoniao', 2], ['jade_elephant', 2], ['golden_lotus', 2], ['ivory_blade', 1], ['turtle_shield', 1], ['sleep_incense', 2], ['thunder_staff', 1], ['sight_scroll', 1], ['elixir', 1]] },
    { theme: 'water', enemies: [['monkey', 2], ['root', 2], ['jelly', 3]], enemyCount: [5, 6], itemCount: [5, 7], goldCount: [3, 4],
      items: [['herb', 5], ['banana', 2], ['khaoniao', 2], ['jade_elephant', 2], ['golden_lotus', 2], ['ivory_blade', 1], ['turtle_shield', 1], ['sleep_incense', 2], ['thunder_staff', 1], ['elixir', 2]] },
    { theme: 'orb', boss: 'lion', enemies: [], enemyCount: [0, 0], itemCount: [2, 2], goldCount: [0, 0],
      items: [['herb', 3], ['elixir', 1], ['khaoniao', 1]] },
  ];
  D.ENEMY_DROP_RATE = 0.12;
  D.goldAmount = (floor, r) => Math.round((10 + r * 18) * (1 + 0.3 * (floor - 1)));

  // 村の発展（3段階）
  D.VILLAGE_STAGES = [
    null,
    { name: '小さなお店', cost: 0, desc: 'サイの小さなお店と倉庫（20枠）。' },
    { name: '倉庫の拡張', cost: 200, desc: '倉庫が40枠になり、お店に眠りのお香と見通しの巻物が並ぶ。灯りが増える。' },
    { name: '鍛冶屋と屋台', cost: 600, desc: '鍛冶屋で武器・盾を強化（最大+3）。屋台でカオニャオと霊薬が買える。夕暮れの屋台が並ぶ。' },
  ];
  D.STORAGE_SIZE = { 1: 20, 2: 40, 3: 40 };
  D.SHOP_STOCK = {
    1: ['herb', 'banana', 'bamboo_shield', 'bronze_sword'],
    2: ['herb', 'banana', 'sleep_incense', 'sight_scroll', 'bamboo_shield', 'bronze_sword'],
    3: ['herb', 'banana', 'khaoniao', 'elixir', 'sleep_incense', 'sight_scroll', 'bamboo_shield', 'bronze_sword'],
  };
  D.START_FUNDS = 50;

  TS.Data = D;
})(globalThis.TS = globalThis.TS || {});
