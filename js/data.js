/* ゲームの調整用データ（敵・道具・階層・村）
 * 数値はここをいじればバランス調整できます。 */
(function (TS) {
  'use strict';
  const D = {};

  D.SAVE_VERSION = 3;
  D.SAVE_KEY = 'takeSaiAdventure.save';

  // マップ（3x3 の区画にランダムな部屋を置く）
  D.MAP = { cols: 3, rows: 3, cellW: 11, cellH: 8 };
  D.MAP.w = D.MAP.cols * D.MAP.cellW;
  D.MAP.h = D.MAP.rows * D.MAP.cellH;

  /* 章の進め方：第1〜5章は1階から30階まで。30階でその章のボスが待つ（31階へは進めない）。
   * 最終章は1階から35階まで。35階で大魔王バーン → 真大魔王バーン。章・会話は js/story.js */
  D.MAX_FLOOR = 30;          // 第1〜5章の最深階
  D.BOSS_FLOOR = 30;
  // 以前の版のボス配置（更新前から続いている探索だけが使う）
  D.LEGACY_BOSS_FLOORS = { 10: 'lion', 20: 'catfish', 30: 'elephant' };
  D.BOSS_FLOORS = D.LEGACY_BOSS_FLOORS;   // 互換のため残す
  // 3階ごとに帰還の碑（ボスの階は倒すと帰還口が開く）。最終章は30階・33階にもある
  D.RETURN_POINT_FLOORS = [3, 6, 9, 12, 15, 18, 21, 24, 27];
  D.returnFloors = (ch) => (ch === 6 ? D.RETURN_POINT_FLOORS.concat([30, 33]) : D.RETURN_POINT_FLOORS);
  D.BAG_SIZE = 15;

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
  for (let n = 21; n <= 45; n++) D.EXP_TABLE[n] = Math.round(D.EXP_TABLE[n - 1] + 220 * Math.pow(1.1, n - 20));

  D.ENEMY_HIT_RATE = 0.88;
  D.SPAWN_INTERVAL = 45;   // この行動数ごとに見えない場所へ敵が湧く
  D.MAX_ENEMIES = 8;
  D.maxEnemies = (f) => (f <= 10 ? 8 : f <= 20 ? 9 : 10);

  /* 道具（20種）
   * type: weapon / shield / heal / food / sleep / staff / return / map / treasure / orb
   * price: お店の買値（0 = 売っていない）, sell: 売値
   * loan: 貸出品（売却・預入不可） noSell / noStore: 売却不可・預入不可 */
  D.ITEMS = {
    wood_sword:    { name: 'かしだしの木刀', type: 'weapon', atk: 1, sell: 0, loan: true, noSell: true, noStore: true, icon: 'sword', tint: 'wood',
      desc: '以前サイの店で貸し出していた木刀。売却・預入はできない。' },
    bronze_sword:  { name: 'どうのつるぎ', type: 'weapon', atk: 3, price: 150, sell: 60, icon: 'sword', tint: 'copper',
      desc: '銅でできた、旅立ちにちょうどいい剣。' },
    iron_katana:   { name: 'てつのつるぎ', type: 'weapon', atk: 6, sell: 130, icon: 'sword', tint: 'iron',
      desc: '遺跡で眠っていた、よく切れる鉄の剣。' },
    ivory_blade:   { name: 'はがねのつるぎ', type: 'weapon', atk: 9, sell: 240, icon: 'sword', tint: 'steel',
      desc: '王の護衛が持っていたという、はがねの剣。' },
    bamboo_shield: { name: '木の盾', type: 'shield', def: 2, price: 120, sell: 45, icon: 'shield', tint: 'wood',
      desc: '軽くて丈夫な木の丸盾。' },
    bronze_shield: { name: 'てつの盾', type: 'shield', def: 4, sell: 100, icon: 'shield', tint: 'iron',
      desc: '象の紋章が入った鉄の盾。' },
    turtle_shield: { name: 'はがねの盾', type: 'shield', def: 7, sell: 210, icon: 'shield', tint: 'steel',
      desc: '石ガメの甲羅をはがねで縁取った、堅い盾。' },
    herb:          { name: 'やくそう', type: 'heal', heal: 35, price: 30, sell: 12, icon: 'herb',
      desc: 'HPを35回復し、毒も治す。' },
    elixir:        { name: 'いのちの霊薬', type: 'heal', heal: 999, price: 150, sell: 55, icon: 'potion',
      desc: 'HPを全回復し、毒も治す。' },
    banana:        { name: '甘いバナナ', type: 'food', food: 45, price: 20, sell: 8, icon: 'banana',
      desc: '満腹度を45回復する。' },
    khaoniao:      { name: '特製お弁当', type: 'food', food: 100, price: 45, sell: 18, icon: 'bento',
      desc: 'もち米のカオニャオが入ったサイの特製弁当。満腹度を100回復する。' },
    loan_rice:     { name: '旅人のおにぎり', type: 'food', food: 50, sell: 0, loan: true, noSell: true, noStore: true, icon: 'onigiri',
      desc: 'サイが無料で持たせてくれるおにぎり。満腹度を50回復。売却・預入はできない。' },
    sleep_incense: { name: 'ねむり草', type: 'sleep', turns: 10, price: 90, sell: 35, icon: 'sleepgrass',
      desc: '香りで見えている敵を10ターン眠らせる（守護者は3ターン）。' },
    thunder_staff: { name: 'いかずちの杖', type: 'staff', dmg: 30, sell: 60, icon: 'staff',
      desc: '選んだ方向（8方向）にまっすぐ雷を飛ばし、最初に当たった敵に30ダメージ。防御を無視する。壁で止まる。' },
    thunder_king_staff: { name: '雷帝の杖', type: 'staff', dmg: 54, sell: 170, icon: 'staff', tint: 'king',
      desc: '雷帝の力が宿る上位の杖。選んだ方向（8方向）に激しい雷を飛ばし、最初に当たった敵に54ダメージ。防御を無視する。壁で止まる。' },
    jade_sword:    { name: 'ひすいのつるぎ', type: 'weapon', atk: 12, sell: 360, icon: 'sword', tint: 'jade',
      desc: '苔の庭園に眠っていた、ひすい色に光る剣。' },
    crystal_blade: { name: 'すいしょうのつるぎ', type: 'weapon', atk: 15, sell: 520, icon: 'sword', tint: 'crystal',
      desc: 'すいしょうを削り出した、軽くて鋭い剣。' },
    golden_sword:  { name: 'おうごんのつるぎ', type: 'weapon', atk: 18, sell: 760, icon: 'sword', tint: 'gold',
      desc: '深部の神殿の宝剣。王の力が宿るという。' },
    moss_shield:   { name: 'ひすいの盾', type: 'shield', def: 9, sell: 330, icon: 'shield', tint: 'jade',
      desc: 'ひすいをはめこんだ、苔の庭園の盾。' },
    crystal_shield:{ name: 'すいしょうの盾', type: 'shield', def: 11, sell: 500, icon: 'shield', tint: 'crystal',
      desc: '光を通すすいしょうの盾。' },
    golden_shield: { name: 'おうごんの盾', type: 'shield', def: 13, sell: 740, icon: 'shield', tint: 'gold',
      desc: '神殿の守り手の黄金の盾。' },
    big_herb:      { name: '上やくそう', type: 'heal', heal: 90, price: 90, sell: 30, icon: 'herb', tint: 'big',
      desc: 'HPを90回復し、毒も治す。' },
    smoke_ball:    { name: 'けむり玉', type: 'warp', price: 120, sell: 40, icon: 'smoke',
      desc: '煙にまぎれて、この階の離れた部屋へ逃げる。' },
    slow_powder:   { name: 'どんそくの粉', type: 'slow', turns: 15, price: 110, sell: 35, icon: 'powder',
      desc: 'まくと、見えている敵すべての動きを15ターン遅くする（2ターンに1回しか動けない。守護者は6ターン）。見えている敵がいないと効果はない。' },
    fire_charm:    { name: '雷鳴の巻物', type: 'fire', dmg: 35, price: 160, sell: 50, icon: 'scroll', tint: 'thunder',
      desc: '読むと雷が鳴り、見えている敵すべてに35ダメージ（防御無視）。' },
    antidote:      { name: 'どくけしそう', type: 'cure', price: 40, sell: 12, icon: 'herb', tint: 'cure',
      desc: '毒を治し、しばらく毒にかからなくなる。HPも20回復。' },
    return_scroll: { name: '帰還の巻物', type: 'return', sell: 0, noSell: true, noStore: true, icon: 'scroll', tint: 'return',
      desc: 'その場で探索を終え、持ち物と探索中のお金を村へ持ち帰る。出発時に1枚無料支給。帰還・敗北で消える。' },
    // ---- 章の報酬（ボスを倒すと現れる装備） ----
    dragon_shield: { name: 'りゅうりんの盾', type: 'shield', def: 15, sell: 520, icon: 'shield', tint: 'dragon',
      desc: '獣王の大盾から作られた、竜のうろこ模様の盾。第1章の報酬。' },
    frost_sword:   { name: 'ひょうえんの剣', type: 'weapon', atk: 21, sell: 640, icon: 'sword', tint: 'frost',
      desc: '炎と氷の力を宿した剣。第2章の報酬。' },
    moon_shield:   { name: 'げっこうの盾', type: 'shield', def: 17, sell: 620, icon: 'shield', tint: 'moon',
      desc: '月の光を映す盾。幻にまどわされない心をくれる。第3章の報酬。' },
    dragon_sword:  { name: 'りゅうきしの剣', type: 'weapon', atk: 24, sell: 760, icon: 'sword', tint: 'dragon',
      desc: '竜の騎士が認めた者に渡る剣。第4章の報酬。' },
    hero_sword:    { name: 'ゆうしゃの剣', type: 'weapon', atk: 27, sell: 900, icon: 'sword', tint: 'hero',
      desc: '師匠ヤナイが遺した、勇者の剣。第5章の報酬。' },
    hero_shield:   { name: 'ゆうしゃの盾', type: 'shield', def: 19, sell: 860, icon: 'shield', tint: 'hero',
      desc: '師匠ヤナイが遺した、勇者の盾。第5章の報酬。' },
    // ---- ボスに備える道具（持っているだけで効く護符・お香） ----
    water_charm:   { name: 'みずがみの護符', type: 'charm', effect: 'fireice', price: 300, sell: 100, icon: 'charm', tint: 'water',
      desc: '持っているだけで、炎と氷の床から受けるダメージが半分になる。' },
    truth_mirror:  { name: 'みやぶりの鏡', type: 'charm', effect: 'truesight', price: 350, sell: 120, icon: 'mirror',
      desc: '持っているだけで、分身に「幻」の印が見えるようになる。' },
    bolt_charm:    { name: 'いかずちよけの護符', type: 'charm', effect: 'bolt', price: 350, sell: 120, icon: 'charm', tint: 'bolt',
      desc: '持っているだけで、雷の印から受けるダメージが半分になる。' },
    clear_incense: { name: 'きりばらいの香', type: 'clear', price: 160, sell: 50, icon: 'incense',
      desc: 'たくと霧が晴れ、体の拘束もとける。しばらく拘束されにくくなる。' },
    sight_scroll:  { name: 'みとおしの巻物', type: 'map', price: 80, sell: 30, icon: 'scroll', tint: 'sight',
      desc: 'その階の地形・階段・道具の場所がわかる。' },
    old_coin:      { name: 'アユタヤの古金貨', type: 'treasure', sell: 40, icon: 'coin',
      desc: '昔の王国の金貨。サイの店で売れる。' },
    jade_elephant: { name: 'ひすいの象', type: 'treasure', sell: 120, icon: 'elephant',
      desc: '小さなひすいの置物。高く売れる。' },
    golden_lotus:  { name: '黄金の蓮', type: 'treasure', sell: 260, icon: 'lotus',
      desc: '金でできた蓮の花。とても高く売れる。' },
    guardian_gem:  { name: '獅子の守り石', type: 'treasure', sell: 350, icon: 'gem',
      desc: '10階の守護獅子が守っていた輝く石。とても高く売れる。' },
    amber_pendant: { name: '琥珀の首飾り', type: 'treasure', sell: 300, icon: 'pendant', depth: 11,
      desc: '地下庭園で見つかった琥珀の首飾り。' },
    bronze_bell:   { name: '古都の青銅鐘', type: 'treasure', sell: 420, icon: 'bell', depth: 16,
      desc: '水没した都の小さな鐘。澄んだ音がする。' },
    sunken_crown:  { name: '水の都の王冠', type: 'treasure', sell: 560, icon: 'crown', tint: 'blue', depth: 16,
      desc: '水没した都に沈んでいた古い王冠。' },
    river_pearl:   { name: '大ナマズの大真珠', type: 'treasure', sell: 900, icon: 'pearl', depth: 20,
      desc: '20階の大ナマズ王が抱えていた大きな真珠。' },
    giant_crystal: { name: '大すいしょう', type: 'treasure', sell: 700, icon: 'gem', tint: 'crystal', depth: 21,
      desc: '洞窟を照らしていた大きなすいしょう。' },
    prism_flower:  { name: '七色の水晶花', type: 'treasure', sell: 950, icon: 'lotus', tint: 'prism', depth: 21,
      desc: '光を受けて七色に輝くすいしょうの花。' },
    golden_elephant:{ name: '黄金の象', type: 'treasure', sell: 1300, icon: 'elephant', tint: 'gold', depth: 26,
      desc: '神殿の奥に祀られていた黄金の象。' },
    dream_crown:   { name: '夢見の宝冠', type: 'treasure', sell: 2000, icon: 'crown', depth: 26,
      desc: '遺跡が見る夢を映すという宝冠。' },
    amber_shard:   { name: '琥珀のかけら', type: 'material', sell: 0, noSell: true, icon: 'shard', tint: 'amber', depth: 11,
      desc: '鍛冶屋の拡張と強化に使う素材。持ち帰ると素材箱に入る（倉庫の枠を使わない）。' },
    bronze_shard:  { name: '古都の青銅かけら', type: 'material', sell: 0, noSell: true, icon: 'shard', tint: 'bronze', depth: 16,
      desc: '鍛冶屋の拡張と強化に使う素材。持ち帰ると素材箱に入る。' },
    crystal_shard: { name: 'すいしょうのかけら', type: 'material', sell: 0, noSell: true, icon: 'shard', tint: 'crystal', depth: 21,
      desc: '鍛冶屋の拡張と強化に使う素材。持ち帰ると素材箱に入る。' },
    gold_leaf:     { name: '神殿の金ぱく', type: 'material', sell: 0, noSell: true, icon: 'shard', tint: 'gold', depth: 26,
      desc: '鍛冶屋の拡張と強化に使う素材。持ち帰ると素材箱に入る。' },
    wish_orb:      { name: '願いの宝珠', type: 'orb', sell: 0, noSell: true, noStore: true, icon: 'orb',
      desc: '遺跡の奥に眠っていた宝珠。村へ持ち帰ろう！' },
  };

  /* 鍛冶屋の強化：設備の段階で上限が上がる（なし/+3/+5/+8）。
   * +4以降は深い階の素材も必要。売値の上がり方は強化費用よりずっと小さい（換金の抜け道にならない）。 */
  D.SMITH = {
    maxPlusByLv: [0, 3, 5, 8],
    maxPlus: 8,
    cost: (plus) => (plus < 3 ? 80 * (plus + 1) : 150 * (plus + 1)),
    mats: (plus) => (plus === 3 || plus === 4 ? { amber_shard: 1 } : plus === 5 ? { bronze_shard: 1 } : plus === 6 ? { crystal_shard: 1 } : plus === 7 ? { gold_leaf: 1 } : {}),
    sellPerPlus: 15,
  };

  /* 敵
   * ai: melee 普通 / slow 2ターンに1回 / ranged 吹き矢 / dormant 近づくまで眠る / erratic ふらふら
   *     fast 2回動く / support 仲間を回復 / telegraph 予告してから強打 / area 予告してから周囲を攻撃
   *     poison 毒 / magic 遠くから魔法 / thief お金を盗んで逃げる / boss
   * base: 出現し始める階（ここからの階数で強くなる） */
  D.ENEMIES = {
    frog:   { name: 'ガマ蛙',       hp: 9,   atk: 4,  def: 1, exp: 3,   ai: 'melee',   sprite: 'frog' },
    turtle: { name: '石ガメ',       hp: 20,  atk: 5,  def: 6, exp: 8,   ai: 'slow',    sprite: 'turtle' },
    monkey: { name: '吹き矢ザル',   hp: 12,  atk: 3,  def: 1, exp: 7,   ai: 'ranged',  sprite: 'monkey', shoot: 4, range: 4 },
    root:   { name: '根っこオバケ', hp: 24,  atk: 8,  def: 3, exp: 13,  ai: 'dormant', sprite: 'root' },
    jelly:  { name: '水クラゲ',     hp: 28,  atk: 10, def: 4, exp: 17,  ai: 'erratic', sprite: 'jelly' },
    statue: { name: '石像の戦士',   hp: 40,  atk: 13, def: 6, exp: 28,  ai: 'telegraph', sprite: 'statue', base: 8, heavy: 2.2,
      tip: '隣にいると剣を振りかぶり、次の行動で強打する。離れればかわせる。' },
    bat:    { name: 'ヤミコウモリ', hp: 30,  atk: 17, def: 3, exp: 30,  ai: 'fast',    sprite: 'bat', base: 11, tip: '1ターンに2回動く。' },
    shaman: { name: '苔の祈祷師',   hp: 38,  atk: 14, def: 4, exp: 38,  ai: 'support', sprite: 'shaman', base: 12, heal: 0.4,
      tip: '傷ついた仲間を回復する。先に倒すか眠らせよう。' },
    lizard: { name: '毒トカゲ',     hp: 50,  atk: 22, def: 6, exp: 48,  ai: 'poison',  sprite: 'lizard', base: 16, tip: '噛まれると毒になる。薬草・解毒の葉で治る。' },
    thief:  { name: '金ぴかザル',   hp: 45,  atk: 16, def: 5, exp: 42,  ai: 'thief',   sprite: 'thief', base: 17,
      tip: '探索中のお金を盗んで逃げる。倒せば取り返せる。' },
    golem:  { name: '結晶ゴーレム', hp: 110, atk: 30, def: 16, exp: 90, ai: 'area',    sprite: 'golem', base: 21, heavy: 2.0, slowMove: true,
      tip: '動きは遅いが、地面を踏みならして周囲を攻撃する（予告あり）。' },
    wisp:   { name: '光の精',       hp: 45,  atk: 18, def: 6, exp: 60,  ai: 'magic',   sprite: 'wisp', base: 21, shoot: 26, range: 5,
      tip: '離れた所から光の矢を撃つ。物陰や斜めの角を使ってかわそう。' },
    guard:  { name: '神殿の番兵',   hp: 120, atk: 40, def: 18, exp: 120, ai: 'telegraph', sprite: 'guard', base: 26, heavy: 2.2,
      tip: '大剣を振りかぶってから強打する。予告を見たら離れよう。' },
    lion:   { name: '守護獅子',     hp: 160, atk: 15, def: 8, exp: 120, ai: 'boss',    sprite: 'lion', noScale: true, drop: 'guardian_gem',
      pattern: { stomp: 1, stompMult: 2.0, line: 4, lineMult: 1.8, every: 4 } },
    catfish: { name: '大ナマズ王',  hp: 380, atk: 26, def: 12, exp: 320, ai: 'boss',   sprite: 'catfish', noScale: true, drop: 'river_pearl',
      pattern: { stomp: 1, stompMult: 2.0, line: 6, lineMult: 1.7, every: 4, summon: 'jelly', summonEvery: 8, summonMax: 2 } },
    elephant: { name: '夢見の黄金象', hp: 720, atk: 36, def: 17, exp: 600, ai: 'boss', sprite: 'elephant', noScale: true, drop: 'wish_orb', repeatDrop: 'dream_crown',
      pattern: { stomp: 2, stompMult: 1.7, line: 6, lineMult: 2.0, every: 4, summon: 'wisp', summonEvery: 9, summonMax: 2, enrage: 0.5 } },
    // ---- 最終章の31〜35階 ----
    darkknight: { name: '魔王軍の騎士', hp: 150, atk: 44, def: 20, exp: 150, ai: 'telegraph', sprite: 'darkknight', base: 31, heavy: 2.0,
      tip: '大剣を振りかぶってから強打する。予告を見たら離れよう。' },
    imp:    { name: '魔界の小鬼',   hp: 62,  atk: 24, def: 8, exp: 80,  ai: 'magic',   sprite: 'imp', base: 31, shoot: 32, range: 5,
      tip: '離れた所から火の玉を撃つ。角を使ってかわそう。' },
    /* ---- 章のボス（30階）と最終章（35階）。boss：専用の行動（js/bossai.js）。arena：ボス部屋の景観 ----
     * 単にHPが多いだけにしないよう、予告つきの大技・床の危険・分身・霧などで戦い方を変える。大技のあとは隙ができる。 */
    croc:   { name: 'クロコダイン', hp: 640, atk: 34, def: 15, exp: 700, ai: 'boss', sprite: 'croc', noScale: true, arena: 'arena_croc', big: true },
    flame:  { name: 'フレイザード', hp: 680, atk: 36, def: 15, exp: 800, ai: 'boss', sprite: 'flame', noScale: true, arena: 'arena_flame', big: true },
    kill:   { name: 'キルバーン',   hp: 640, atk: 36, def: 14, exp: 900, ai: 'boss', sprite: 'kill', noScale: true, arena: 'arena_kill', big: true },
    kill_clone: { name: 'キルバーン', hp: 1, atk: 20, def: 0, exp: 0, ai: 'clone', sprite: 'kill', noScale: true, clone: true },
    baran:  { name: 'バラン',       hp: 780, atk: 40, def: 18, exp: 1000, ai: 'boss', sprite: 'baran', noScale: true, arena: 'arena_baran', big: true },
    mist:   { name: 'ミストバーン', hp: 820, atk: 40, def: 19, exp: 1100, ai: 'boss', sprite: 'mist', noScale: true, arena: 'arena_mist', big: true },
    mist_clone: { name: 'ミストバーン', hp: 1, atk: 22, def: 0, exp: 0, ai: 'clone', sprite: 'mist', noScale: true, clone: true },
    vearn:  { name: '大魔王バーン', hp: 900, atk: 44, def: 20, exp: 1500, ai: 'boss', sprite: 'vearn', noScale: true, arena: 'throne', big: true },
    truevearn: { name: '真大魔王バーン', hp: 1200, atk: 48, def: 21, exp: 3000, ai: 'boss', sprite: 'truevearn', noScale: true, arena: 'throne', big: true },
  };
  D.POISON = { chance: 0.4, turns: 8, guard: 15, dmgRate: 0.025 }; // 毒：最大HPの2.5%を毎ターン。治った後しばらくかからない
  D.ENEMY_SCALE = { hp: 0.12, atk: 0.08, exp: 0.12 }; // 出現し始めた階から1階ごとの上昇率

  // テーマ（地域）
  D.THEMES = {
    brick:   { name: 'レンガの回廊' },
    roots:   { name: '木の根の遺跡' },
    water:   { name: '水の神殿' },
    orb:     { name: '守護獅子の間' },
    garden:  { name: '木の根と苔の地下庭園' },
    sunken:  { name: '水没した古代都市' },
    crystal: { name: '水晶の地下神殿' },
    gold:    { name: '封印の最深部' },
    shrine:  { name: '願いの宝珠の間' },
  };
  Object.assign(D.THEMES, {
    demon:       { name: '大魔王の城' },
    throne:      { name: '封印の玉座' },
    arena_croc:  { name: '獣王の沼の広間' },
    arena_flame: { name: '炎と氷の祭壇' },
    arena_kill:  { name: '死神の遊技場' },
    arena_baran: { name: '竜の騎士の神殿' },
    arena_mist:  { name: '影の霧の間' },
  });
  // 以前の版の地域（更新前から続く探索用）
  D.themeOf = (f) => (f <= 3 ? 'brick' : f <= 6 ? 'roots' : f <= 9 ? 'water' : f === 10 ? 'orb' : f <= 15 ? 'garden'
    : f <= 20 ? 'sunken' : f <= 25 ? 'crystal' : f <= 29 ? 'gold' : 'shrine');
  // 章で使う地域（ボスの階は各ボスの景観）
  D.themeOfFloor = (f) => (f <= 3 ? 'brick' : f <= 6 ? 'roots' : f <= 10 ? 'water' : f <= 15 ? 'garden'
    : f <= 20 ? 'sunken' : f <= 25 ? 'crystal' : f <= 30 ? 'gold' : 'demon');

  /* 階層ごとの出現テーブル [id, 重み] を作る。地域ごとに敵・道具・お宝が変わる。 */
  /* ch：章の番号（1〜6）、または以前の版の探索なら 'legacy' */
  function floorDef(f, ch) {
    const legacy = ch === 'legacy' || ch == null;
    const C = legacy ? null : D.CHAPTERS && D.CHAPTERS[ch];
    const bossId = legacy ? D.LEGACY_BOSS_FLOORS[f] : C ? (C.final ? (f === D.LAST_FLOOR ? 'vearn' : null) : (f === D.BOSS_FLOOR ? C.boss : null)) : null;
    if (bossId) {
      return { theme: legacy ? D.themeOf(f) : D.ENEMIES[bossId].arena, boss: bossId, enemies: [], enemyCount: [0, 0], itemCount: [3, 3], goldCount: [0, 0],
        items: [['herb', 2], ['elixir', 1], ['khaoniao', 1]].concat(f >= 20 ? [['big_herb', 2]] : []) };
    }
    if (f > D.MAX_FLOOR) return demonFloor(f, C);
    const items = [['herb', 4], ['banana', f <= 15 ? 3 : 2], ['sleep_incense', f <= 3 ? 1 : 2], ['thunder_staff', 1]];
    const add = (cond, list) => { if (cond) for (const x of list) items.push(x); };
    add(f >= 3, [['sight_scroll', 1]]);
    add(f >= 4, [['khaoniao', f >= 11 ? 2 : 1]]);
    add(f >= 5, [['elixir', 1]]);
    add(f >= 6, [['smoke_ball', 1]]);
    add(f >= 8, [['slow_powder', 1]]);
    add(f >= 16, [['thunder_king_staff', 0.5]]);   // 上位の杖：深い階でまれに
    add(f >= 11, [['big_herb', 2], ['fire_charm', 1]]);
    add(f >= 14, [['antidote', 1]]);
    // 装備
    add(f <= 3, [['bamboo_shield', 1]]);
    add(f >= 2 && f <= 5, [['bronze_sword', 1]]);
    add(f >= 3 && f <= 8, [['bronze_shield', 1]]);
    add(f >= 4 && f <= 12, [['iron_katana', 1]]);
    add(f >= 6 && f <= 14, [['turtle_shield', 1]]);
    add(f >= 7 && f <= 15, [['ivory_blade', 1]]);
    add(f >= 12 && f <= 22, [['jade_sword', 1]]);
    add(f >= 13 && f <= 22, [['moss_shield', 1]]);
    add(f >= 21, [['crystal_blade', 1], ['crystal_shield', 1]]);
    add(f >= 27, [['golden_sword', 1], ['golden_shield', 1]]);
    // お宝と素材（深いほど高価）
    add(f <= 3, [['old_coin', 3]]);
    add(f >= 3 && f <= 9, [['jade_elephant', f === 3 ? 1 : 2]]);
    add(f >= 4 && f <= 9, [['old_coin', 2]]);
    add(f >= 6 && f <= 15, [['golden_lotus', 1]]);
    add(f >= 11 && f <= 19, [['amber_pendant', 2]]);
    add(f >= 11 && f <= 15, [['amber_shard', 2]]);
    add(f >= 16 && f <= 25, [['bronze_bell', 1]]);
    add(f >= 16 && f <= 19, [['sunken_crown', 1], ['bronze_shard', 2]]);
    add(f >= 21 && f <= 29, [['giant_crystal', 2]]);
    add(f >= 21 && f <= 25, [['prism_flower', 1], ['crystal_shard', 2]]);
    add(f >= 26, [['golden_elephant', 2], ['dream_crown', 1], ['gold_leaf', 2]]);
    // 章ごとの「ボスに備える道具」（深い階ほど拾いやすい）
    if (C) add(f >= 6, C.prep.map(([id, w]) => [id, w * (f >= 16 ? 1 : 0.5)]));
    let enemies = D.enemyTable(f);
    if (C && C.bias) enemies = enemies.map(([id, w]) => [id, w * (C.bias[id] || 1)]);
    return {
      theme: legacy ? D.themeOf(f) : D.themeOfFloor(f),
      enemies,
      enemyCount: f === 1 ? [2, 3] : f <= 3 ? [3, 4] : f <= 6 ? [4, 5] : f <= 9 ? [4, 6] : f <= 20 ? [5, 7] : [6, 7],
      itemCount: f <= 3 ? [4, 5] : f <= 9 ? [5, 6] : [5, 7],
      goldCount: f <= 9 ? [2, 3] : [2, 4],
      items,
    };
  }
  // 敵の出現テーブル
  D.enemyTable = function (f) {
    if (f === 1) return [['frog', 1]];
    if (f === 2) return [['frog', 4], ['turtle', 1]];
    if (f === 3) return [['frog', 3], ['turtle', 1], ['monkey', 2]];
    if (f <= 6) return [['frog', 2], ['turtle', 2], ['monkey', 3], ['root', 3]].concat(f === 6 ? [['jelly', 1]] : []);
    if (f <= 9) return [['turtle', 2], ['monkey', 3], ['root', 2], ['jelly', 3]].concat(f >= 8 ? [['statue', 1]] : []);
    if (f <= 15) return [['root', 2], ['jelly', 2], ['monkey', 2], ['bat', 3]].concat(f >= 12 ? [['shaman', 2]] : [], f >= 13 ? [['statue', 2]] : []);
    if (f <= 20) return [['jelly', 2], ['bat', 2], ['shaman', 2], ['statue', 2], ['lizard', 3], ['turtle', 1]].concat(f >= 17 ? [['thief', 2]] : []);
    if (f <= 25) return [['golem', 2], ['wisp', 3], ['lizard', 2], ['shaman', 2], ['thief', 2], ['bat', 1], ['statue', 1]];
    return [['guard', 3], ['golem', 2], ['wisp', 2], ['shaman', 2], ['thief', 2], ['lizard', 1]];
  };
  // 最終章の31〜35階：大魔王の城
  function demonFloor(f, C) {
    const items = [['herb', 3], ['big_herb', 3], ['elixir', 2], ['khaoniao', 2], ['banana', 1], ['sleep_incense', 2], ['slow_powder', 1],
      ['fire_charm', 1], ['thunder_king_staff', 0.8], ['antidote', 1], ['sight_scroll', 1], ['clear_incense', 1],
      ['golden_sword', 0.6], ['golden_shield', 0.6], ['golden_elephant', 2], ['dream_crown', 1], ['gold_leaf', 2]];
    return { theme: 'demon', enemies: [['darkknight', 3], ['imp', 3], ['guard', 2], ['golem', 1], ['wisp', 1]],
      enemyCount: [6, 7], itemCount: [5, 7], goldCount: [3, 4], items };
  }
  // 章・深さごとの階の定義（作った結果は覚えておく）
  const floorCache = {};
  D.floorFor = function (ch, f) {
    const k = (ch == null ? 'legacy' : ch) + ':' + f;
    return floorCache[k] || (floorCache[k] = floorDef(f, ch == null ? 'legacy' : ch));
  };
  // 章による敵の強さ（深い階ほど差がつく。浅い階はほぼ同じ）
  D.chapterMul = (ch, f) => (typeof ch === 'number' ? 1 + 0.06 * (ch - 1) * Math.min(1, f / 18) : 1);
  // D.FLOORS は第1章の定義（テスト・表示用の互換）。章のデータを読んだあとに作り直す
  D.FLOORS = [null];
  for (let f = 1; f <= D.MAX_FLOOR; f++) D.FLOORS.push(floorDef(f, 'legacy'));
  D.rebuildFloors = function () { for (const k of Object.keys(floorCache)) delete floorCache[k]; for (let f = 1; f <= D.MAX_FLOOR; f++) D.FLOORS[f] = D.floorFor(1, f); };

  D.ENEMY_DROP_RATE = 0.12;
  // モンスターハウス：地下6階以降の通常階でまれに。1階に1部屋まで。敵とお宝が多い部屋
  D.MONSTER_HOUSE = { minFloor: 6, chance: 0.08, minArea: 12, enemiesMax: 10, extraItems: 3 };
  /* ダンジョンの希少素材商人「謎の旅商人」。鍛冶の強化・鍛冶屋の拡張に使う素材だけを売る（武器や道具は売らない）。
   * 出現：8階以降のふつうの階で約14%（ボスの階・最終章35階・モンスターハウスの部屋には出ない）。
   * 価格の目安（簡易AI 各200回の平均）：12階まで行って帰ると約1100G、21階で約2200G、30階前後で約3100G。
   *   素材は1マスの道具の約7%（1階あたり約0.4個）なので、自分で集めると同じ地域を2〜3階探す手間。
   *   その手間より高く、1回の探索の稼ぎの半分〜3分の2にあたる値段にする。
   * from：その素材を並べ始める階（拾える階より3階ほど手前から。深いほど貴重な素材が並ぶ）。
   * 支払いは探索中のお金から先に使い、足りない分は村の資金から（商人が村へ受け取りに行く「つけ払い」）。 */
  D.MERCHANT = {
    name: '謎の旅商人', minFloor: 8, chance: 0.14, maxKinds: 3, stock: [1, 2], priceSpread: 0.1,
    goods: [
      { id: 'amber_shard', from: 8, price: 600 },
      { id: 'bronze_shard', from: 13, price: 900 },
      { id: 'crystal_shard', from: 18, price: 1400 },
      { id: 'gold_leaf', from: 23, price: 2200 },
    ],
  };
  // 床に落ちているお金（浅い階は控えめ、深いほど多い）
  D.goldAmount = (floor, r) => Math.round((8 + r * 12) * (1 + 0.28 * (floor - 1)));

  // 村の段階（お店の品ぞろえ）。施設の購入で上がる
  D.VILLAGE_STAGES = [
    null,
    { name: '小さなお店' },
    { name: '倉庫のある店' },
    { name: '鍛冶屋と屋台の村' },
  ];
  D.STORAGE_SIZE = { 1: 20, 2: 40, 3: 60, 4: 80 };
  D.SHOP_STOCK = {
    1: ['herb', 'banana', 'bamboo_shield', 'bronze_sword'],
    2: ['herb', 'banana', 'sleep_incense', 'sight_scroll', 'bamboo_shield', 'bronze_sword'],
    3: ['herb', 'banana', 'khaoniao', 'elixir', 'sleep_incense', 'sight_scroll', 'smoke_ball', 'antidote', 'bamboo_shield', 'bronze_sword'],
  };

  /* 施設・村の飾り。price: 資金、mats: 素材、req: 解放条件（文字列は表示用）
   * 浅い階の収入（1回の帰還で約150〜550G）で最初の施設に届き、
   * 大きな施設や上位の強化は深い階での複数回の冒険が必要な価格にしている。 */
  D.FACILITIES = [
    { id: 'storage2', kind: 'facility', name: '倉庫の拡張（40枠）', price: 200, desc: '倉庫が40枠に。お店にねむり草・みとおしの巻物が並ぶ。灯りが増える。', req: [] },
    { id: 'smith1', kind: 'facility', name: '鍛冶屋と屋台', price: 600, desc: '鍛冶屋で武器・盾を+3まで強化できる。屋台で特製お弁当・いのちの霊薬・けむり玉・どくけしそうが買える。', req: ['storage2'] },
    { id: 'diner', kind: 'facility', name: 'サイの食堂', price: 800, desc: '出発前に料理を1品えらべる。次の探索だけ能力が上がる。', req: ['storage2'] },
    { id: 'museum', kind: 'facility', name: 'お宝展示室', price: 1200, desc: '珍しいお宝を寄贈して飾れる。集めると称号と飾りが解放される。', req: ['smith1'] },
    { id: 'storage3', kind: 'facility', name: '倉庫の増築（60枠）', price: 1500, desc: '倉庫が60枠に。', req: ['storage2', 'floor10'] },
    { id: 'smith2', kind: 'facility', name: '鍛冶屋の大きな炉（+5）', price: 2500, mats: { amber_shard: 3, bronze_shard: 2 }, desc: '強化の上限が+5になる。', req: ['smith1'] },
    { id: 'storage4', kind: 'facility', name: '大倉庫（80枠）', price: 4000, desc: '倉庫が80枠に。', req: ['storage3', 'floor20'] },
    { id: 'smith3', kind: 'facility', name: '黄金の炉（+8）', price: 7000, mats: { crystal_shard: 3, gold_leaf: 2 }, desc: '強化の上限が+8になる。', req: ['smith2'] },
    { id: 'lanterns', kind: 'decor', name: '灯籠の並木', price: 300, desc: '道ぞいに灯籠が並び、夕暮れの村が明るくなる。', req: [] },
    { id: 'garden', kind: 'decor', name: '蓮の庭', price: 400, desc: '花壇と蓮が増える。', req: ['storage2'] },
    { id: 'stalls', kind: 'decor', name: '屋台通り', price: 700, desc: '水路ぞいに色とりどりの屋台が並ぶ。', req: ['smith1'] },
    { id: 'bridge', kind: 'decor', name: '水路の赤い橋', price: 900, desc: '水路に赤い橋がかかる。', req: ['floor10'] },
    { id: 'statue', kind: 'decor', name: '象の像', price: 500, desc: '白い象の像。', req: ['donate3'] },
    { id: 'fountain', kind: 'decor', name: '噴水', price: 900, desc: '村の真ん中に噴水。', req: ['donate6'] },
    { id: 'gate', kind: 'decor', name: '黄金の門', price: 1500, desc: '遺跡へ続く道に黄金の門。', req: ['donate9'] },
  ];
  D.REQ_TEXT = {
    storage2: '「倉庫の拡張」の後', smith1: '「鍛冶屋と屋台」の後', smith2: '「鍛冶屋の大きな炉」の後', storage3: '「倉庫の増築」の後',
    floor10: '地下10階に到達', floor20: '地下20階に到達', donate3: 'お宝を3種類寄贈', donate6: 'お宝を6種類寄贈', donate9: 'お宝を9種類寄贈',
  };
  // 食堂の料理（次の探索だけ有効・重ねがけ不可。帰還・敗北で終わる）
  D.MEALS = {
    kaomangai: { name: 'カオマンガイ', price: 120, desc: '満腹度が減りにくくなる（約1.5倍長持ち）。', hungerMul: 1.5 },
    gapao:     { name: 'ガパオライス', price: 150, desc: '最大HP+20。', maxhp: 20 },
    tomyum:    { name: 'トムヤムクン', price: 180, desc: '攻撃力+3。', atk: 3 },
    mango:     { name: 'マンゴーもち米', price: 180, desc: '防御力+3。', def: 3 },
  };
  // 展示室：寄贈できるお宝（各1回まで）、称号
  D.MUSEUM_ITEMS = ['old_coin', 'jade_elephant', 'golden_lotus', 'guardian_gem', 'amber_pendant', 'bronze_bell', 'sunken_crown', 'river_pearl', 'giant_crystal', 'prism_flower', 'golden_elephant', 'dream_crown'];
  D.MUSEUM_THANKS = 0.3; // 初めて寄贈したときだけ、売値の3割を村からお礼としてもらえる
  D.TITLES = [[3, '見習い収集家'], [6, '遺跡の目利き'], [9, '宝物殿の主'], [12, 'アユタヤの語り部']];
  D.START_FUNDS = 50;

  TS.Data = D;
})(globalThis.TS = globalThis.TS || {});
