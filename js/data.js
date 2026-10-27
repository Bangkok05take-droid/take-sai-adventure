/* ゲームの調整用データ（敵・道具・階層・村）
 * 数値はここをいじればバランス調整できます。 */
(function (TS) {
  'use strict';
  const D = {};

  D.SAVE_VERSION = 9;
  /* ボスの登場ムービー（ボスID → 動画の名前。動画の場所は assets.js の movies）。ボス部屋に初めて入ったとき、戦いの前に1回だけ */
  // baran：第4章・地下30階の玉座のバラン（通常のバラン戦）だけ。隠しダンジョン35階の「竜魔神バラン」は別のボスなので、ここには入れない
  // flame：第2章のフレイザード（2026年10月、名前テロップ入り完成版の動画で追加）
  // kill：第3章のキルバーン（2026年10月、名前テロップ入り完成版の動画で追加）
  // mist：第5章のミストバーン（2026年10月、名前テロップ入り完成版の動画で追加）
  // vearn：最終章30階の大魔王バーン（2026年10月、名前テロップ入り完成版の動画で追加）
  // truevearn：最終章33階の真大魔王バーン（2026年10月、正式採用の動画 9667.mp4。老バーンとミストバーンが白い異空間で融合して覚醒する）。
  //   この動画だけは、ボス部屋に入ったときではなく、32階から33階へ着いた直後に流す（D.BOSS_ARRIVAL）
  D.BOSS_INTROS = { croc: 'crocodine', flame: 'flazzard', kill: 'killvearn', baran: 'baran', mist: 'mistvearn', vearn: 'vearn', truevearn: 'trueVearnAwaken' };
  /* 階に着いた直後に戦いが始まるボス（歩いてボス部屋に入る必要がない）。着いたら、たけをボス部屋の中（入口から3マス）に置き、
   * 登場ムービーをまだ見ていなければムービー → 戦い。見たことがあれば、着いたらすぐ戦い（G.arriveBossFloor） */
  D.BOSS_ARRIVAL = { truevearn: true };
  /* 登場ムービーを見た記録の名前（story.introSeen のキー）。書いていないボスはボスIDのまま。
   * truevearn：以前は仮の会話（「ムービー準備中」）を見ると truevearn に記録していた。正式の動画は、その記録とは別に1回だけ流す */
  D.INTRO_SEEN_KEY = { truevearn: 'truevearnAwaken' };
  D.introSeenKey = (id) => (D.INTRO_SEEN_KEY && D.INTRO_SEEN_KEY[id]) || id;
  /* 撃破後ムービー（ボスID → 物語のムービーの名前）。章の探索でそのボスを倒したとき、撃破の演出のあとに流す。
   * 通常のバラン（baran）だけ。クリア後の竜魔神バランは別のIDにするので、ここには入らない */
  D.BOSS_OUTROS = { baran: 'baranTaken' };
  /* 村で拾える品（2026年10月）。拾った記録は story.found[id]（セーブに残る。お宝の記録・ボスの撃破記録とは別）。
   * at：拾うマス。need：拾えるようになる条件（村の発展の飾りの建設済み。ムービーを見たかどうかは関係しない）
   * 竜の紋章：赤い橋の向こう岸 (4,25)＝橋の下り口 (3,25) のすぐ右。向こう岸の25行は木 (5,25)・(1,25) で区切られていて、
   * 橋から歩いて行けるのは (2,25)・(3,25)・(4,25) だけ。橋が無いと25行へは渡れない */
  D.VILLAGE_PICKUPS = { dragon_crest: { item: 'dragon_crest', at: [4, 25], need: 'bridge' } };
  D.SAVE_KEY = 'takeSaiAdventure.save';

  // マップ（3x3 の区画にランダムな部屋を置く）
  D.MAP = { cols: 3, rows: 3, cellW: 11, cellH: 8 };
  D.MAP_THICK_WALLS = false;   // 試験中（プランB）：薄い壁を作らない地図（js/dungeon.js の thickOk）。本番は false
  D.MAP.w = D.MAP.cols * D.MAP.cellW;
  D.MAP.h = D.MAP.rows * D.MAP.cellH;

  /* 章の進め方（2026年10月から）：各章とも1階から、その章のボスの階（D.CHAPTERS[章].goal）まで。
   * 第1章クロコダイン15階・第2章フレイザード20階・第3章キルバーン25階・第4章バラン30階・第5章ミストバーン30階（別々の章）。
   * 最終章は1階から33階まで。30階で大魔王バーン、33階で真大魔王バーン（配置の版4。版3は35階、版2は35階で連戦）。章・会話は js/story.js
   * 配置の版（run.layout）：2＝この配置。更新前に始めた探索（layout なし）は、以前の配置（第1〜5章のボスは30階）のまま終える。 */
  D.MAX_FLOOR = 30;          // 通常の階の最深（最終章はこの先31〜32階が大魔王の城、33階が真大魔王バーンの玉座）
  D.BOSS_FLOOR = 30;         // 以前の配置（layout 1）での第1〜5章のボスの階
  D.LAYOUT = 4;              // 新しく始める探索の配置の版
  /* 最終章の2体のボスの階。どちらも一度倒したら出ない（skip）。版2の探索（更新前から続いているもの）は、以前どおり35階で連戦。
   *  版4（2026年10月）：地下30階に大魔王バーン、地下33階に真大魔王バーン（31〜32階は探索）。30階の時空の亀裂から31階へ。
   *    真大魔王バーンを倒したあとは、30階の同じ亀裂が隠しダンジョン（最奥35階に竜魔神バラン）の入口になる。
   *  版3（更新前から続いている探索だけ）：30階・35階（31〜34階は探索）。途中の探索の階は変えない */
  D.FINAL_V3 = { vearn: 30, truevearn: 33 };
  D.finalFloors = (layout) => ((layout || D.LAYOUT) >= 4 ? D.FINAL_V3 : { vearn: 30, truevearn: 35 });
  /* 地下30階・大魔王バーンの玉座の間（2026年10月、ChatGPT制作のデザイン assets/reference/throne-room-v1/ をそのまま使う）。
   * 背景の絵（1024×1536）を、絵の 64px を1マスとして敷く。絵の床の升目（約74px。中央の絨毯で左右がずれる）は1マスにしていない。
   * マスの区切りは中央の通路（絨毯 x 450〜577）がちょうど2マスになる位置：列 c は絵の x = 64c+1.5 から、行 r は y = 64r−44 から。
   *  hall：戦う広間（床の内側。左右の炎の台・柱が立つ縁取りの帯と、上の玉座の段は壁＝入れない）
   *  corridor：下の入口から上へ進む通路（両脇の柱・炎の台は壁）。start：入口（通路のいちばん下）
   *  crack：大魔王バーン撃破後に残る時空の亀裂の場所（玉座の右手前。ムービーで亀裂が玉座の右に開く）
   *  flames：絵の中の炎の位置（絵の座標。ゆらぐ明かりを重ねるだけ） */
  D.THRONE_ROOM = {
    w: 16, h: 25, tile: 64, imgX: 1.5, imgY: -44, imgW: 1024, imgH: 1536,
    hall: { x: 2, y: 6, w: 12, h: 13 }, corridor: { x: 7, y: 19, w: 2, h: 5 }, start: { x: 7, y: 23 }, crack: { x: 10, y: 6 },
    flames: [[98, 222], [407, 208], [615, 208], [925, 222], [70, 512], [70, 800], [953, 512], [953, 800], [408, 1222], [615, 1222]],
  };
  /* 通常バラン戦（第4章のボスの階）の部屋（2026年10月20日、ZIP baran_room_assets_v1。背景 941×1672 を引き伸ばさずに敷く）。
   * ボス部屋の共通方針：画面の下の前室・通路から上へ進んで入り、奥のボスへ向かう。
   *  1マス＝絵の 845/17 px（広間の床 y500〜1345 がちょうど17行）。列 c は絵の x = imgX + tile*c、行 r は y = imgY + tile*r から。
   *  列9（広間の中央の列・下の通路の中央）の中心が、絵の中央 x470.5 に来る
   *  広間（戦う床）：x2〜16・y10〜26（15×17）。絵の床 x 約97〜843（縁の帯に少しかかる）。
   *  前室と通路：絵の下の中央の通路（柱の内側 x400〜537）＝ x8〜10・y27〜32（3×6）。入口（たけが立つ所）は (9,32)。
   *  壁：玉座の壇・階段・左右の縁と炎の台・柱・下の通路の両脇・地図のいちばん下の行。左の旧入口は、閉じた版の絵（ZIP baran_room_assets_v2）で閉じている。
   *  throne：玉座（assets/rooms/baran-throne.png）を壇の上に描く。絵の座標で中心x・足元y・高さ（160px は確認用）。当たり判定は無い（壇は壁）
   *  flames：絵の中の炎の位置（ゆらぐ明かりを重ねる） */
  D.BARAN_ROOM = {
    bg: 'baranBg', w: 19, h: 34, tile: 845 / 17, imgX: 470.5 - 845 / 17 * 9.5, imgY: 500 - 845 / 17 * 10, imgW: 941, imgH: 1672,
    hall: { x: 2, y: 10, w: 15, h: 17 }, corridor: { x: 8, y: 27, w: 3, h: 6 }, start: { x: 9, y: 32 },
    throne: { img: 'baranThrone', cx: 470, foot: 398, h: 160 },   // 足元（x470・y398）は固定。高さは 130→160px（2026年10月20日、確認用。確定ではない）
    flames: [[92, 400], [250, 392], [380, 350], [560, 350], [695, 392], [850, 400], [75, 575], [65, 755], [60, 960], [55, 1260], [885, 575], [870, 850], [880, 1260], [375, 1355], [565, 1355]],
  };
  /* 前室を足した版（ZIP baran_room_assets_v2 の baran_room_extended.png、941×1972）。**配置の確認用**（継ぎ目が残るので、ゲームではまだ使わない）。
   * 座標と倍率は D.BARAN_ROOM と同じ（絵の上の1672pxは閉じた版と同じピクセル）。下の300pxに前室：
   *  通路 x8〜10・y27〜33（3×7）→ 前室 x7〜11・y34〜36（5×3。最初の道具を置く）→ 出口側 x8〜10・y37〜38（炎の台の間）。入口は (9,38)。
   *  前室の左右の壁（絵の x 約290〜320・615〜650）、下の炎の台（x365〜405・530〜570、y1845〜1890）は壁 */
  D.BARAN_ROOM_EXT = Object.assign({}, D.BARAN_ROOM, {
    bg: 'baranBgExt', h: 40, imgH: 1972,
    corridor: { x: 7, y: 34, w: 5, h: 3 }, floors: [{ x: 8, y: 27, w: 3, h: 7 }, { x: 8, y: 37, w: 3, h: 2 }], start: { x: 9, y: 38 },
    flames: D.BARAN_ROOM.flames.concat([[305, 1790], [630, 1790], [385, 1868], [550, 1868]]),
  });
  // 通常バラン戦で使う部屋：前室を足した背景が仕上がるまでは D.BARAN_ROOM（確認用の画面は tools/baran-room-check.js が D.BARAN_ROOM_EXT に切り替える）
  D.BARAN_ROOM_LAYOUT = 'BARAN_ROOM';
  /* ボス部屋のパーツ方式（ZIP boss_room_parts_v2）の**プレビュー用**。本番では使わない（D.BOSS_ROOM_PREVIEW が空）。
   * 地図は今の共通の形のまま（広間15×15・通路1×3・前室5×4）。マス(c,r) の絵の座標＝imgX＋tile×c、imgY＋tile×r（広間の左上(9,1)＝layout.json の arena_origin）。
   * 絵（docs/<部屋>-room-v1/preview/composite.png。tools/make-boss-room-preview.py）は床の外が透明で、そこには今の描き方を先に描く（under）：
   *  'void'＝白い異空間の霧（真大魔王バーン）、'tiles'＝その地域のタイル（クロコダイン・フレイザード）
   *  hazardOutline：床の印（炎・氷など）に暗い外枠を足す（フレイザードの部屋だけ。範囲・判定は同じ） */
  const roomPreview = (bg, aw, ox, oy, h, under, extra) => Object.assign({ bg, tile: aw / 15, imgX: ox - aw / 15 * 9, imgY: oy - aw / 15, imgW: 1024, imgH: h, flames: [], under }, extra);
  D.TRUEVEARN_ROOM_PREVIEW = roomPreview('truevearnPreview', 785, 120, 385, 1600, 'void');
  D.CROC_ROOM_PREVIEW = roomPreview('crocPreview', 808, 108, 352, 1600, 'tiles');
  D.FLAME_ROOM_PREVIEW = roomPreview('flamePreview', 718, 150, 365, 1536, 'tiles', { hazardOutline: true });
  D.BOSS_ROOM_PREVIEW = {};   // プレビューのときだけ { truevearn: 'TRUEVEARN_ROOM_PREVIEW' } など（確認の道具が切り替える）
  /* 通常ダンジョンの地域の背景の絵（ZIP dungeon_7themes_art_v1）を使う地域。{ brick: true } のように。
   * 2026年10月21日：レンガの回廊（1〜3階）を本番に反映。10月22日：木の根の遺跡（4〜6階）・地下の遺跡（7〜14階）も反映（1マス幅の正面の壁は仮の絵）。
   * ほかの地域はまだ今までのコードの絵。確認の道具 tools/dungeon-art-preview.js は before/after で切り替えて撮る */
  D.DUNGEON_ART = { brick: 'v2', roots: 'v2', ruins: 'v2', ruins_deep: 'v2' };   // 10月24日：レンガの回廊は v2（承認図の床・3マスの高さの壁）
  /* 壁（正面・上面・縁・角・飾り）だけ暗くする割合（床・敵・道具・攻撃の予告はそのまま）。2026年10月22日：地下の遺跡の奥（11〜14階）を深く荘厳に */
  D.DUNGEON_WALL_DARK = { ruins_deep: 0.3 };
  // v2 の部品の組（js/assets.js の dungeon の名前）。書いていない地域は '<地域>_v2'。地下の遺跡の奥（11〜14階）は地下の遺跡と同じ組を使い、壁だけ暗く（上の WALL_DARK）
  D.DUNGEON_V2_SET = { ruins_deep: 'ruins_v2' };
  /* 正面の壁の柱・灯りと、壁の上面のがれき（追加の飾り）。2026年10月23日：壁に重なって不自然に見えたので、いったん外す（素材と描き方は残す） */
  D.DUNGEON_DECO = false;
  /* レンガの回廊 v2 の補修素材 v3 の角（出っ張った角・壁の上端の角・縁の終わり）。2026年10月24日：線の太さが今の縁と合わず目立ったので使わない（壁の3種だけ差し替え） */
  D.DUNGEON_V2_CORNERS = false;
  /* 縁・角の補修 v4（ZIP edge_fit_v4）を使う地域。2026年10月26日：プレビュー段階（本番は空。確認の道具が切り替える） */
  D.DUNGEON_EDGE_V4 = { brick: true, roots: true, ruins: true, ruins_deep: true };   // 10月26日：レンガの回廊・木の根の遺跡に反映（角6種類＋帯の終わり v5）
  D.DUNGEON_EDGE_V4_ENDS = false;   // 帯の終わりの部品（end_vertical・end_bottom）は合わなかったので使わない
  D.DUNGEON_ENDS_V5 = true;   // 帯の終わりの補修 v5（ZIP ends_fit_v5）。2026年10月26日：暗い切れ目・色の浮きが消えたので採用（DUNGEON_EDGE_V4 の地域だけに効く）
  /* 壁の外の背景（地図の外・壁の奥・未探索の所）を絵にする地域。2026年10月22日：仮の背景のプレビュー段階（本番は空）。
   * DUNGEON_BACKDROP_DARK：背景を暗くする割合（仮の背景＝壁の上面の絵を暗くしたもの）
   * 2026年10月22日：地下の遺跡（7〜14階）だけ本番（岩盤の背景・下へ伸びる外壁・支柱。ZIP ruins_depth_v1）。レンガ・木の根は専用素材待ち（壁柄の仮背景は本番にしない） */
  D.DUNGEON_BACKDROP = {};   // 10月23日：プレイして確認した結果、背景（と下へ伸びる外壁・支柱）はなしに戻した。設定と素材は残す（プレビューの道具で切り替えられる）
  D.DUNGEON_BACKDROP_DARK = 0.6;
  /* 奥行きの背景（専用の素材 cavern）の地域ごとの設定（仮。実画面で決めた値）。size：1枚の大きさ（マス32の座標で）、dark：暗くする割合
   *  地下の遺跡：256（8×8マス。128だと柄のくり返しが目立った）・35%。レンガの回廊・木の根の遺跡：README どおり128（4×4マス）。素材自体が暗いので少しだけ */
  D.DUNGEON_DEPTH = { ruins: { size: 256, dark: 0.35 }, ruins_deep: { size: 256, dark: 0.35 }, brick: { size: 128, dark: 0.15 }, roots: { size: 128, dark: 0.15 } };
  /* 隠しダンジョン（2026年10月確定）：真大魔王バーンを倒したあと、30階の時空の亀裂から入る。
   * 31階から始まり、35階の竜魔神バランまで。31〜34階は部屋の数が本編の約2倍（D.HIDDEN_MAP）。32〜34階は強敵（enemyMul、仮）。帰還の祠は無い。
   * 本編の31〜33階とは別の階（run.hidden）。帰りは帰還の巻物か、竜魔神バランを倒したあとの帰還口
   *  strong：強敵の階（32〜34階）。専用の強敵6種（D.STRONG・敵の定義）が出る。以前の「今の敵を一律1.35倍」はやめた
   *  counts：部屋が約2倍になった分の配置数（仮。本編の魔王の城は 道具5〜7・お金3〜4・敵6〜7）。道具とお金は約2倍、敵は約1.5倍 */
  D.HIDDEN_DUNGEON = { from: 31, to: 35, boss: 'dragonbaran', name: '時空の狭間', strong: { floors: [32, 33, 34] },
    counts: { items: [10, 14], gold: [6, 8], enemies: [9, 11] } };
  /* 隠しダンジョンの強敵の数値（2026年10月：動きは確定。**ここの数値はすべて仮の調整案**。決まったら差し替える）
   *  dragon：炎の射程（マス）・威力（攻撃力×）・使ったあとの待ち（ターン）。炎は壁か最初に当たった相手（敵・たけ）で止まる（貫かない）
   *  bombrock：動かなくなるHPの割合・自爆するHPの割合（確定：20%以下で停止、0より大きく10%以下で自爆）・爆発の範囲（まわり何マス）・威力（攻撃力×）。
   *    爆発は**仮**にたけだけに当たる（まわりの敵・道具には影響しない）。自爆では経験値は入らない（仮）
   *  madhand：つかむ（攻撃が当たると拘束）。自然に解けるまでのターン（仮）。つかんだマドハンドを倒すとすぐ解ける。3点セットでは無効
   *  mimic：1階に化けている数（仮）
   *  spawn：32〜34階の出現の重み（仮）。31階は魔王の城と同じ敵 */
  D.STRONG = {
    dragon: { range: 5, mult: 1.3, cd: 3 },
    bombrock: { stopAt: 0.2, blastAt: 0.1, radius: 1, mult: 2.5 },
    madhand: { turns: 3 },
    mimic: { count: [1, 2] },
    spawn: [['dragon', 2], ['silverdevil', 2], ['gigantes', 2], ['bombrock', 2], ['madhand', 3], ['darkknight', 1], ['imp', 1]],
  };
  /* 真大魔王バーン（最終決戦）の技（2026年10月21日。**数値はすべて仮の調整案**。技の動きは js/bossai.js の AI.truevearn）。
   *  どの技も予告1ターン（範囲が光る → 次の行動で発動）。発動のあとの隙は無い（rest 0）。cd：使ったあとの待ち（行動の回数）[前半, HP enrageAt 未満]
   *  end：カラミティエンド（まわり1マス・防御無視）、wall：カラミティウォール（まわり radius マス・防御無視）、phoenix：カイザーフェニックス（3列・攻撃力×mult） */
  D.TRUEVEARN = {
    enrageAt: 0.4,
    end: { name: 'カラミティエンド', dmg: [120, 150], cd: [3, 2] },
    wall: { name: 'カラミティウォール', dmg: [80, 100], radius: 3, cd: [2, 2] },
    phoenix: { mult: 2, cd: [3, 2] },
    // 天地魔闘の構え：たけが range マス以内なら構える（攻撃しない）。構えている間にたけの攻撃が当たると、そのダメージの reflect 倍を返す（防御無視。バーンは無傷）。
    //   たけが breakAt マス以上離れると構えを解き、カイザーフェニックスを予告する。maxActs 行動で構えを解く。cd：構えを解いてから次に構えるまで
    stance: { name: '天地魔闘の構え', range: 2, reflect: 3, breakAt: 3, maxActs: 4, cd: [8, 6] },
  };
  /* 竜魔神バラン（隠しダンジョン35階）の戦い方（2026年10月：技の種類は確定。**数値はすべて調整案（仮）**）。
   *  通常攻撃：隣なら殴る（ほかの技が使えないとき）
   *  ドルオーラ：一直線（壁まで）を予告して放つ。列の外へ出ればかわせる。後半は縦横の十字
   *  なぎ払い：隣にいると、まわり8マスを予告して振り抜く。1マス離れればかわせる
   *  突進：離れた所から一直線に予告して突っこむ。横へずれればかわせる。たけに当たるか壁で止まる
   *  どの技も予告してから次の行動で発動し、そのあとに隙（rest：動けないターン）がある。
   *  HPが enrageAt 以下でドラゴニックオーラが強まる：攻撃力 aura 倍・待ち時間が短く・ドルオーラが十字に。予告と隙は後半も残す
   *  mult：攻撃力に対する倍率（通常攻撃は1.0）。cd：使ったあとの待ち（[前半, 後半]）。rest：発動後の隙のターン数
   *  rewards：所有していない品だけ出す（装備中・持ち物・倉庫・村のかばん・床に落ちたまま・展示室・村で拾う前の竜の紋章を所有扱い）
   *  materials：撃破するたびに各1個の専用強化素材（名前・種類数は未定なので空） */
  D.DRAGON_KING = {
    enrageAt: 0.5, aura: 1.15,
    doloura: { mult: 2.2, rest: 2, cd: [6, 5], minDist: 2 },
    sweep: { mult: 1.6, rest: 1, cd: [4, 3] },
    rush: { mult: 1.8, rest: 2, cd: [7, 5], minDist: 3, maxDist: 8 },
    rewards: ['dragonic_shield'],   // 2026年10月23日：竜魔神バランの報酬はドラゴニックオーラの盾だけ（真魔剛竜剣・竜の紋章はなし）
    materials: [],
  };
  /* 隠しダンジョンの地図（2026年10月修正）：部屋の数を本編の約2倍に。部屋の大きさ・通路の幅は本編と同じ。
   * 本編（D.MAP）：区画 3×3＝9、そのうち通路の分かれ道 0〜3 → 部屋 6〜9（平均7.5）、地図 33×24
   * 隠しダンジョン：区画 4×4＝16、通路の分かれ道 0〜2 → 部屋 14〜16（平均15）、地図 44×32。追加の通路も少し多め（extra）
   * 下り階段を探す探索が長くなる。ボス部屋（35階）はこの倍率を使わない（本編と同じボス部屋）。
   * 調整案：重い・長すぎるなら 4×3（12区画・分かれ道 0〜1 → 部屋 11〜12、約1.5倍） */
  D.HIDDEN_MAP = { cols: 4, rows: 4, cellW: 11, cellH: 8, hubs: [0, 2], extra: [2, 5] };
  D.HIDDEN_MAP.w = D.HIDDEN_MAP.cols * D.HIDDEN_MAP.cellW;
  D.HIDDEN_MAP.h = D.HIDDEN_MAP.rows * D.HIDDEN_MAP.cellH;
  // 以前の版のボス配置（更新前から続いている探索だけが使う）
  D.LEGACY_BOSS_FLOORS = { 10: 'lion', 20: 'catfish', 30: 'elephant' };
  D.BOSS_FLOORS = D.LEGACY_BOSS_FLOORS;   // 互換のため残す
  /* 帰還の祠：1回の探索につき地下25階に1か所だけ（2026年10月から。以前は3階ごと）。
   * ボスの階は倒すと帰還口が開く。帰還の巻物はいつでも使える。
   * 階の地形は作ったときに保存されるので、更新前に作られた探索中の階はそのまま（祠があればそのまま使える）。 */
  D.RETURN_POINT_FLOORS = [25];
  D.returnFloors = () => D.RETURN_POINT_FLOORS;
  D.BAG_SIZE = 15;
  /* 装備のセット（2026年10月に確定した数値）。名前は js/game.js の G.setsOf。
   * swordCrest：真魔剛竜剣＋竜の紋章で攻撃+5。crestShield：竜の紋章＋ドラゴニックオーラの盾で防御+5。
   * swordShield：真魔剛竜剣＋ドラゴニックオーラの盾で、通常攻撃が正面2マス（手前の敵を貫通して2体）。壁越し・角越しは届かない。
   * all3：3点すべて。上の効果に加えて2回行動（たけ2行動で敵1回・時間1ターン）、床の印のダメージを受けない、新しい毒・拘束を受けない、飛ぶ見た目。
   * shieldRobe：漆黒の盾＋大魔王のローブで、満腹度が減らない・総攻撃力×0.8（四捨五入）。真魔剛竜剣を装備していれば下がらない。
   * robeRegen：大魔王のローブを装備している間、自然回復が2倍（セットと重ねても2倍まで）。
   * crestRevive：竜の紋章の復活は最大HPの50%（四捨五入）、3点セットのときは全回復。どちらも紋章はなくなる */
  D.SETS = { swordCrestAtk: 5, crestShieldDef: 5, shieldRobeAtkMul: 0.8, robeRegen: 2, crestRevive: 0.5 };

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
      desc: 'ぐんたいガニの甲羅をはがねで縁取った、堅い盾。' },
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
    golden_sword:  { name: 'おうごんのつるぎ', type: 'weapon', atk: 18, sell: 1760, icon: 'sword', tint: 'gold',
      desc: '深部の神殿の宝剣。王の力が宿るという。' },
    moss_shield:   { name: 'ひすいの盾', type: 'shield', def: 9, sell: 330, icon: 'shield', tint: 'jade',
      desc: 'ひすいをはめこんだ、苔の庭園の盾。' },
    crystal_shield:{ name: 'すいしょうの盾', type: 'shield', def: 11, sell: 500, icon: 'shield', tint: 'crystal',
      desc: '光を通すすいしょうの盾。' },
    golden_shield: { name: 'おうごんの盾', type: 'shield', def: 13, sell: 1740, icon: 'shield', tint: 'gold',
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
    // 商人の呼鈴（2026年10月）：使うと、この階のどこか（歩いて行ける安全な空きマス）に旅商人が現れる。使い切り。
    // 呼べなかったとき（ボス戦中・もう商人がいる・置ける所が無い）は減らない。売値は未決定なので売れない。絵は仮（コードの鐘の絵）
    merchant_bell: { name: '商人の呼鈴', type: 'bell', sell: 0, noSell: true, icon: 'bell', tint: 'gold',
      desc: '鳴らすと、この階のどこかに謎の旅商人が現れる（探して会いに行こう）。使い切り。ボス戦中は使えない。' },
    return_scroll: { name: '帰還の巻物', type: 'return', sell: 0, noSell: true, noStore: true, icon: 'scroll', tint: 'return',
      desc: 'その場で探索を終え、持ち物と探索中のお金を村へ持ち帰る。出発画面で1回の冒険につき1枚、無料で借りられる。帰還・敗北で消える。' },
    // ---- 章の報酬（ボスを倒すと現れる装備） ----
    // 2026年10月（報酬の見直し）：げっこうの盾（moon_shield）→ ファントムシールド、りゅうきしの剣（dragon_sword）→ 真魔剛竜剣 にまとめた（save.js の RENAME_V6）。
    // 新しい報酬の絵は後で届く予定。それまではコードで描いた絵（icon・tint）
    // 2026年10月：ボスの戦利品（章の報酬・竜魔神バランの報酬）と竜の紋章は売れない（noSell。町・旅商人とも。sell は展示室のお礼の計算に残す）
    croc_axe:      { name: 'クロコダインの斧', type: 'weapon', atk: 16, sell: 560, noSell: true, icon: 'axe', tint: 'iron',
      desc: '獣王クロコダインの大きな斧。重い一撃が魅力。第1章の報酬。' },
    iceflame_shield: { name: '氷炎の盾', type: 'shield', def: 15, sell: 560, noSell: true, icon: 'shield', tint: 'iceflame',
      desc: '半分が氷、半分が炎でできた盾。第2章の報酬。' },
    // 2026年10月：「ファントムシールド」から「漆黒の盾」へ名前だけ変更（内部ID・能力値・絵はそのまま）
    phantom_shield: { name: '漆黒の盾', type: 'shield', def: 17, sell: 620, noSell: true, icon: 'shield', tint: 'moon',
      desc: '銀の縁と紫の宝石に、幻影の意匠が刻まれた黒い盾。第3章の報酬。' },
    shinma_sword:  { name: '真魔剛竜剣', type: 'weapon', atk: 24, sell: 760, noSell: true, icon: 'sword', tint: 'dragon',
      desc: '竜をかたどった金色の鍔と赤い宝石の剣。第4章の報酬。' },
    /* 2026年10月：装備の「勇者の剣・勇者の盾」を「覇者の剣・覇者の盾」へ（名前と絵だけ。IDは hero_sword・hero_shield のまま。
     * 能力値・売値・強化・入手（第5章ミストバーンの初回報酬）は変えない）。絵は ChatGPT 制作のドット絵（assets/items-boss/hasha-*）。
     * 「勇者の剣・勇者の盾」は別IDのお宝（hero_sword_relic・hero_shield_relic）になった */
    hero_sword:    { name: '覇者の剣', type: 'weapon', atk: 27, sell: 900, noSell: true, icon: 'sword', tint: 'hero',
      desc: '金の翼飾りと紫の宝石をあしらった剣。第5章の報酬。' },
    // ドラゴニックオーラの盾（2026年10月）：防御+22。通常の鍛冶屋で+8まで強化できる。入手は地下40階の裏ボス（まだ無い）。
    // 売値は未決定なので、決まるまで売れない（noSell）。絵は受け取った素材を縮めただけ（assets/items-boss/dragonic-aura-shield.png）
    dragonic_shield: { name: 'ドラゴニックオーラの盾', type: 'shield', def: 22, sell: 0, noSell: true, icon: 'shield', tint: 'hero',
      desc: '竜の気をまとう盾。' },
    hero_shield:   { name: '覇者の盾', type: 'shield', def: 19, sell: 860, noSell: true, icon: 'shield', tint: 'hero',
      desc: '金の翼飾りと紫の宝石をあしらった盾。第5章の報酬。' },
    // ---- ボスに備える道具（持っているだけで効く護符・お香） ----
    water_charm:   { name: 'みずがみの護符', type: 'charm', effect: 'fireice', price: 300, sell: 100, icon: 'charm', tint: 'water',
      desc: '持っているだけで、炎と氷の床から受けるダメージが半分になる。' },
    truth_mirror:  { name: 'みやぶりの鏡', type: 'charm', effect: 'truesight', price: 350, sell: 120, icon: 'mirror',
      desc: '持っているだけで、分身に「幻」の印が見えるようになる。' },
    bolt_charm:    { name: 'いかずちよけの護符', type: 'charm', effect: 'bolt', price: 350, sell: 120, icon: 'charm', tint: 'bolt',
      desc: '持っているだけで、雷の印から受けるダメージが半分になる。' },
    clear_incense: { name: 'きりばらいの香', type: 'clear', price: 160, sell: 50, icon: 'incense',
      desc: 'たくと霧が晴れ、体の拘束もとける。しばらく拘束されにくくなる。' },
    sense_scroll:  { name: '気配察知の巻物', type: 'sense', price: 100, sell: 35, icon: 'scroll', tint: 'sense',
      desc: '読むと、この階にいる敵の位置が地図に印で出る（地形や道具はわからない）。この階にいる間だけ有効。' },
    sight_scroll:  { name: 'みとおしの巻物', type: 'map', price: 80, sell: 30, icon: 'scroll', tint: 'sight',
      desc: 'その階の地形・階段・道具の場所がわかる。' },
    old_coin:      { name: 'アユタヤの古金貨', type: 'treasure', sell: 40, icon: 'coin',
      desc: '昔の王国の金貨。サイの店で売れる。' },
    jade_elephant: { name: 'ひすいの象', type: 'treasure', sell: 120, icon: 'elephant',
      desc: '小さなひすいの置物。高く売れる。' },
    golden_lotus:  { name: '黄金の蓮', type: 'treasure', sell: 260, icon: 'lotus',
      desc: '金でできた蓮の花。とても高く売れる。' },
    /* 勇者の剣・勇者の盾（2026年10月21日【確定】：お宝から、装備・強化できる品へ。IDは以前のお宝のまま hero_sword_relic・hero_shield_relic）。
     * ゲームの中でいちばん基礎の数値が高い剣と盾（覇者の剣 攻27・ドラゴニックオーラの盾 防22 より少し強く）。売れない。
     *  勇者の剣：オリハルコンを持ってコイ（鍛冶屋）に話しかけると打ってくれる（1回だけ。G.forgeHeroSword）
     *  勇者の盾：マスターヤナイの像を建てたあと、ワーン（食堂）に話しかけると渡してくれる（1回だけ。G.giveHeroShield）
     *  絵は今までの勇者の剣・盾（コードで描いた絵：icon・tint）。床・敵・店・商人・ボスの報酬には入れない */
    hero_sword_relic:  { name: '勇者の剣', type: 'weapon', atk: 30, sell: 0, noSell: true, icon: 'sword', tint: 'hero',
      desc: 'コイがオリハルコンで打ち上げた、勇者の剣。いちばん強い剣。' },
    hero_shield_relic: { name: '勇者の盾', type: 'shield', def: 24, sell: 0, noSell: true, icon: 'shield', tint: 'hero',
      desc: 'マスターヤナイがワーンに預けていた、勇者の盾。いちばん強い盾。' },
    // お宝の竜の紋章（baran_emblem）は2026年10月に廃止。竜の紋章はアクセサリー（dragon_crest）だけ。以前のセーブの品は読み込みで消す（js/save.js の v8 → v9）
    // 2026年10月：展示室4番目の旧「獅子の守り石」（guardian_gem）→ クロコダインの涙。売れない（noSell。sell は以前の値を残しているだけ）
    croc_tear:     { name: 'クロコダインの涙', type: 'treasure', sell: 350, noSell: true, icon: 'gem', tint: 'crystal',
      desc: '獣王クロコダインの涙が固まったという、青緑の大きなしずく形の宝石。第1章の報酬。' },
    amber_pendant: { name: '琥珀の首飾り', type: 'treasure', sell: 300, icon: 'pendant', depth: 11,
      desc: '地下の遺跡で見つかった琥珀の首飾り。' },
    bronze_bell:   { name: '古都の青銅鐘', type: 'treasure', sell: 420, icon: 'bell', depth: 16,
      desc: '水没した都の小さな鐘。澄んだ音がする。' },
    sunken_crown:  { name: '水の都の王冠', type: 'treasure', sell: 560, icon: 'crown', tint: 'blue', depth: 16,
      desc: '水没した都に沈んでいた古い王冠。' },
    // 展示室8番目の旧「大ナマズの大真珠」（river_pearl）→ 氷炎結晶。売値は以前のまま
    iceflame_crystal: { name: '氷炎結晶', type: 'treasure', sell: 900, noSell: true, icon: 'gem', tint: 'prism',
      desc: '青い氷と赤橙の炎が一つになった結晶。フレイザードを倒すと手に入る。第2章の報酬。' },
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
    // オリハルコン（2026年10月21日）：30階から（床・敵が落とす。D.ORICHALCUM）。勇者の剣を打つのと、+9からの強化に使う
    orichalcum:    { name: 'オリハルコン', type: 'material', sell: 0, noSell: true, icon: 'shard', tint: 'orichalcum', depth: 30,
      desc: '伝説の金属。コイなら勇者の剣を打てるかもしれない。+9からの強化にも使う。持ち帰ると素材箱に入る。' },
    // ---- アクセサリー（装備枠は1つ。持っているだけでは効かず、装備している間だけ効く） ----
    poison_ring:   { name: '毒よけの指輪', type: 'accessory', acc: 'poison', sell: 250, icon: 'ring',
      desc: '装備している間、新しく毒にかからない。すでにかかっている毒は治らない。' },
    purse_charm:   { name: 'がまぐちの守り', type: 'accessory', acc: 'theft', sell: 250, icon: 'purse',
      desc: '装備している間、おどるほうせきなどにお金を盗まれない。盗まれたお金は戻らない。' },
    full_bangle:   { name: '満腹の腕輪', type: 'accessory', acc: 'hunger', sell: 600, icon: 'bangle',
      desc: '装備している間、歩いても休んでも満腹度が減らない。今の満腹度は回復しない。' },
    life_necklace: { name: '命つなぎの首飾り', type: 'accessory', acc: 'revive', sell: 800, icon: 'lifeneck',
      desc: '装備している間にHPが0になると、一度だけHPが全回復して立ち上がる（首飾りはなくなる）。' },
    // ボスの報酬のアクセサリー。atk・def：装備している間だけ攻撃力・防御力に足す
    phantom_mask:  { name: 'ファントムマスク', type: 'accessory', acc: 'hunger', def: 5, sell: 900, noSell: true, icon: 'mask',
      desc: '装備している間、歩いても休んでも満腹度が減らない（今の満腹度は回復しない）。防御力+5。第3章の報酬。' },
    // 2026年10月（v3）：アクセサリーの竜の紋章は、赤い橋の向こう岸で拾う品（D.VILLAGE_PICKUPS）。バランの報酬ではなくなった。
    // お宝の紋章とは別の品（お宝の紋章は、まだゲームに無い）
    dragon_crest:  { name: '竜の紋章', type: 'accessory', acc: 'revive', atk: 5, sell: 1000, noSell: true, icon: 'crest',
      desc: '装備している間にHPが0になると、一度だけHPが全回復して立ち上がる（紋章はなくなる）。攻撃力+5。金のペンダントに青い竜の紋章。' },
    demon_robe:    { name: '大魔王のローブ', type: 'accessory', acc: 'deep', sell: 1500, noSell: true, icon: 'robe',
      desc: '装備して出発すると、21階から探索を始められる（1階からも選べる）。装備している間は毒などの状態異常を受けない（マドハンドにはつかまれる）。大魔王バーンを倒した証。' },
    wish_orb:      { name: '願いの宝珠', type: 'orb', sell: 0, noSell: true, noStore: true, icon: 'orb',
      desc: '遺跡の奥に眠っていた宝珠。村へ持ち帰ろう！' },
  };

  /* 道具を投げる（数値はここで調整する）。
   * range：飛ぶ距離。direct：すべての種類で「直線上の最初の敵に当たる」（外れない）。
   * small：小さな物理ダメージ＝ base + perFloor×階（防御は無視）。盾・お宝・素材・食料・アクセサリー・杖・巻物など。
   * weapon：武器のダメージ＝ (base + (攻撃力+強化値)×mul) を敵の防御で減らす（通常の攻撃と同じ計算式）。
   * sleep / slow：当たった敵だけに効く。ターン数は道具の値（ボスは道具を使ったときと同じ短いターン）。
   * 回復の道具：当たった敵のHPを回復する（たけには効かない）。けむり玉：当たった敵を離れた部屋へ飛ばす（ボスには効かず小さなダメージ）。 */
  D.THROW = {
    range: 10,
    small: { base: 2, perFloor: 0.2 },
    weapon: { base: 4, mul: 2 },
    sleepBoss: 3, slowBoss: 6,
    cureHeal: 20,
  };
  // アクセサリーの入手：ふつうの階の道具の表に低い重みで入る（初期配布・お店・謎の旅商人には無い）
  D.ACCESSORY_DROPS = [
    { id: 'poison_ring', from: 11, w: 0.3 },
    { id: 'purse_charm', from: 11, w: 0.3 },
    { id: 'full_bangle', from: 21, w: 0.12 },
    { id: 'life_necklace', from: 21, w: 0.12 },
  ];

  /* 鍛冶屋の強化：設備の段階で上限が上がる（なし/+3/+5/+8）。
   * +4以降は深い階の素材も必要。売値の上がり方は強化費用よりずっと小さい（換金の抜け道にならない）。 */
  /* +9から（2026年10月21日）：コイが勇者の剣を打つと「無限強化」が解放（V.story.heroForge）。すべての武器・盾が +8 より先へ（アクセサリーは対象外）。
   *  +9にする：オリハルコン1個・お金は +8にするときの金額＋1000G。そこから +1 ごとにオリハルコン＋1個・お金＋1000G
   *  （+9：1個・2200G、+10：2個・3200G、+11：3個・4200G …）。今の強化値はそのまま引き継ぐ */
  D.SMITH = {
    maxPlusByLv: [0, 3, 5, 8],
    maxPlus: 8,
    cost: (plus) => (plus < 3 ? 80 * (plus + 1) : plus < 8 ? 150 * (plus + 1) : 150 * 8 + 1000 * (plus - 7)),
    mats: (plus) => (plus === 3 || plus === 4 ? { amber_shard: 1 } : plus === 5 ? { bronze_shard: 1 } : plus === 6 ? { crystal_shard: 1 } : plus === 7 ? { gold_leaf: 1 } : plus >= 8 ? { orichalcum: plus - 7 } : {}),
    sellPerPlus: 15,
  };
  /* オリハルコン（2026年10月21日）：30階から（30階を含む）。33階の真大魔王バーンの決戦場は最初に置く道具なし（そのまま）。
   *  floor：床に置く道具1つごとに、オリハルコンになる確率。drop：敵を倒したとき、オリハルコンを落とす確率。どちらも 5%
   *  tiw：30階の救援のあと、ティウが町まで持ち帰ってくれる個数。sword：勇者の剣を打つのに使う個数（お金はいらない） */
  D.ORICHALCUM = { from: 30, floor: 0.05, drop: 0.05, tiw: 1, sword: 1 };

  /* 敵
   * ai: melee 普通 / slow 2ターンに1回 / ranged 矢（shot：撃つ物の名前）/ dormant 近づくまで眠る / erratic ふらふら
   *     fast 2回動く / support 仲間を回復 / telegraph 予告してから強打 / area 予告してから周囲を攻撃
   *     poison 毒 / magic 遠くから魔法 / thief お金を盗んで逃げる / boss
   * base: 出現し始める階（ここからの階数で強くなる） */
  D.ENEMIES = {
    frog:   { name: 'スライム',       hp: 9,   atk: 4,  def: 1, exp: 3,   ai: 'melee',   sprite: 'frog' },
    turtle: { name: 'ぐんたいガニ',       hp: 20,  atk: 5,  def: 6, exp: 8,   ai: 'slow',    sprite: 'turtle' },
    monkey: { name: 'リリパット',   hp: 12,  atk: 3,  def: 1, exp: 7,   ai: 'ranged',  sprite: 'monkey', shoot: 4, range: 4, shot: '矢' },
    root:   { name: 'きりかぶおばけ', hp: 24,  atk: 8,  def: 3, exp: 13,  ai: 'dormant', sprite: 'root' },
    /* 2026年10月の行動変更（おすすめ案で確定。数値は調整用）
     *  ホイミスライム：回復役。HP 28→42・攻撃 10→6。ふらふら歩き（erratic）のまま、5マス以内でHP7割未満の仲間（ボス以外）を最大HPの30%回復（heal）、3行動待ち */
    jelly:  { name: 'ホイミスライム',     hp: 42,  atk: 6,  def: 4, exp: 17,  ai: 'erratic', sprite: 'jelly', heal: 0.3,
      tip: '傷ついた仲間を回復する（回復役）。先に倒すか眠らせよう。' },
    statue: { name: 'うごくせきぞう',   hp: 40,  atk: 13, def: 6, exp: 28,  ai: 'telegraph', sprite: 'statue', base: 8, heavy: 2.2,
      tip: '隣にいると拳を振りかぶり、次の行動で強打する。離れればかわせる。' },
    bat:    { name: 'ドラキー', hp: 30,  atk: 17, def: 3, exp: 30,  ai: 'fast',    sprite: 'bat', base: 11, tip: '1ターンに2回動く。' },
    /* まほうつかい（2026年10月）：回復をやめ、距離を取って攻撃魔法（火の玉）を撃つ。旧・苔の祈祷師の回復（ai: support、heal 0.4）は使わない。
     * shoot・range は仮（攻撃力14の1.2倍・一直線4マス）。keep：たけとこの距離以内で撃てないときは、近づかずに1歩離れる */
    shaman: { name: 'まほうつかい',   hp: 38,  atk: 14, def: 4, exp: 38,  ai: 'magic', sprite: 'shaman', base: 12, shoot: 17, range: 4, keep: 2, shot: '火の玉',
      tip: '距離を取って、離れた所から火の玉の呪文を撃つ。角を使ってかわすか、近づいて倒そう。' },
    lizard: { name: 'バブルスライム',     hp: 50,  atk: 22, def: 6, exp: 48,  ai: 'poison',  sprite: 'lizard', base: 16, tip: '噛まれると毒になる。薬草・解毒の葉で治る。' },
    // おどるほうせき：盗んで逃げる（今まで通り）。盗まれた後に倒すと全額戻る。盗まれる前に倒すと、その階のお金の山1つ分を落とす（dropGold）
    thief:  { name: 'おどるほうせき',   hp: 45,  atk: 16, def: 5, exp: 42,  ai: 'thief',   sprite: 'thief', base: 17, dropGold: true,
      tip: '探索中のお金を盗んで逃げる。盗まれる前に倒すとお金を落とし、盗まれた後に倒せば取り返せる。' },
    golem:  { name: 'ゴーレム', hp: 110, atk: 30, def: 16, exp: 90, ai: 'area',    sprite: 'golem', base: 21, heavy: 2.0, slowMove: true,
      tip: '動きは遅いが、地面を踏みならして周囲を攻撃する（予告あり）。' },
    /* メタルスライム（旧・光の精の射撃はやめた）：見えている間は1手番に2歩、たけから逃げる。攻撃しない（追いこまれたらその場にとどまる）。
     *  HP 3〜5（hpRange。深さで増えない）。受けるダメージ（metal）：通常攻撃はミス30%・1が50%・2が20%、杖・巻物の雷は効かない（ミス）、ほかは1。
     *  経験値：倒した時のたけが、ちょうど1つレベルが上がる量（最低300。expLevelUp）。眠り・鈍足の道具は効く。出現の重みは以前の4分の1 */
    wisp:   { name: 'メタルスライム',       hp: 4,   atk: 1,  def: 255, exp: 300, ai: 'flee', sprite: 'wisp', base: 21, hpRange: [3, 5], noScaleHp: true, steps: 2,
      metal: { miss: 0.3, one: 0.5 }, expLevelUp: 300,
      tip: 'とにかく逃げる。防御がとても固く、ダメージは1か2しか入らない。倒すとレベルが上がるほどの経験値。眠らせると捕まえやすい。' },
    guard:  { name: 'さまようよろい',   hp: 120, atk: 40, def: 18, exp: 120, ai: 'telegraph', sprite: 'guard', base: 26, heavy: 2.2,
      tip: '剣を振りかぶってから強打する。予告を見たら離れよう。' },
    lion:   { name: '守護獅子',     hp: 160, atk: 15, def: 8, exp: 120, ai: 'boss',    sprite: 'lion', noScale: true, drop: 'croc_tear',
      pattern: { stomp: 1, stompMult: 2.0, line: 4, lineMult: 1.8, every: 4 } },
    catfish: { name: '大ナマズ王',  hp: 380, atk: 26, def: 12, exp: 320, ai: 'boss',   sprite: 'catfish', noScale: true, drop: 'iceflame_crystal',
      pattern: { stomp: 1, stompMult: 2.0, line: 6, lineMult: 1.7, every: 4, summon: 'jelly', summonEvery: 8, summonMax: 2 } },
    elephant: { name: '夢見の黄金象', hp: 720, atk: 36, def: 17, exp: 600, ai: 'boss', sprite: 'elephant', noScale: true, drop: 'wish_orb', repeatDrop: 'dream_crown',
      pattern: { stomp: 2, stompMult: 1.7, line: 6, lineMult: 2.0, every: 4, summon: 'wisp', summonEvery: 9, summonMax: 2, enrage: 0.5 } },
    // ---- 最終章の31階より下 ----
    /* あくまのきし：予告の大技のあとは、2行動のあいだ攻撃を休んで盾で防御（受けるダメージ40%）。ふだんも隣で20%、攻撃の代わりに防御（次の行動まで40%）。
     *  defend：after 大技のあとの防御の行動数、chance ふだんの防御の確率、cut 受けるダメージの倍率。専用の防御ポーズの絵はまだ無い（待機の絵に盾の印）
     *  2026年10月21日：ふだんの防御 20 → 17、防御中の受けるダメージ 50% → 40%（ふだんは柔らかく、盾の上からは硬く） */
    darkknight: { name: 'あくまのきし', hp: 150, atk: 44, def: 17, exp: 150, ai: 'telegraph', sprite: 'darkknight', base: 31, heavy: 2.0,
      defend: { after: 2, chance: 0.2, cut: 0.4 },
      tip: '斧を振りかぶってから強打する。そのあとは盾で守りを固める（ダメージが大きく減る）。ときどき盾を構えて攻撃を受け止める。' },
    /* ---- 隠しダンジョンの強敵（2026年10月：動きは確定。能力値・数値はすべて**仮**＝D.STRONG の調整案。専用の絵はChatGPT側） ----
     * 絵が届くまでは、今の敵の絵に色を重ねた仮の見た目（js/sprites.js の SP.PLACEHOLDER）。base 31：深さによる強化は31階から */
    // 2026年10月21日：Lv35で苦戦するくらいに弱めた（tools/strong-enemy-balance.js）。ドラゴン HP190→140・攻撃46→30、シルバーデビル 攻撃30→26、ギガンテス HP320→200・攻撃58→30・防御26→20
    dragon:      { name: 'ドラゴン',         hp: 140, atk: 30, def: 20, exp: 230, ai: 'breath', sprite: 'dragon', base: 31,
      tip: '一直線に炎を吐く。炎は最初に当たった相手で止まるので、間にほかの敵がいれば盾になる。' },
    silverdevil: { name: 'シルバーデビル',   hp: 110, atk: 26, def: 16, exp: 200, ai: 'double', sprite: 'silverdevil', base: 31,
      tip: '1回の手番に2回動く。離れていれば2歩、隣なら2回攻撃。' },
    // ギガンテス：2026年10月21日 鈍足に（slowMove：ゴーレムと同じく2ターンに1回だけ動く・殴る）
    gigantes:    { name: 'ギガンテス',       hp: 200, atk: 30, def: 20, exp: 300, ai: 'melee', sprite: 'gigantes', base: 31, slowMove: true,
      tip: 'HPがとても高く、守りも固い。動きは鈍く、2ターンに1回だけ近づいて殴ってくる。' },
    bombrock:    { name: '爆弾岩',           hp: 150, atk: 30, def: 30, exp: 160, ai: 'bomb', sprite: 'bombrock', base: 31,
      tip: 'HPが少なくなると動かなくなり、ぎりぎりまで減ると自爆する。一撃で倒せば爆発しない。' },
    mimic:       { name: 'ミミック',         hp: 160, atk: 48, def: 22, exp: 250, ai: 'mimic', sprite: 'mimic', base: 31,
      tip: '床のお宝に化けている。隣に行くと正体を現して襲ってくる。' },
    madhand:     { name: 'マドハンド',       hp: 70,  atk: 26, def: 12, exp: 90,  ai: 'grab', sprite: 'madhand', base: 31,
      tip: 'つかまれると移動できない（攻撃・道具・装備はできる）。つかんだマドハンドを倒すと解ける。' },
    /* ベビーサタン：火の玉に加えて、5行動ごとに予告つきの炎（blaze）。たけのまわり3×3を予告し、次の行動で攻撃力×1.6。予告のマスの外へ出ればかわせる。
     *  range：使う距離（一直線でなくてよい。見えていて5マス以内）。発動のあと1行動の隙 */
    imp:    { name: 'ベビーサタン',   hp: 62,  atk: 24, def: 8, exp: 80,  ai: 'magic',   sprite: 'imp', base: 31, shoot: 32, range: 5, shot: '火の玉',
      blaze: { every: 5, mult: 1.6, range: 5, rest: 1 },
      tip: '離れた所から火の玉を撃つ。ときどき、たけのまわりを焼く大きな炎の呪文（予告あり）。赤いマスの外へ逃げよう。' },
    /* ---- 章のボス（30階）と最終章（30階・33階）。boss：専用の行動（js/bossai.js）。arena：ボス部屋の景観 ----
     * 単にHPが多いだけにしないよう、予告つきの大技・床の危険・分身・霧などで戦い方を変える。大技のあとは隙ができる。 */
    croc:   { name: 'クロコダイン', hp: 640, atk: 34, def: 15, exp: 700, ai: 'boss', sprite: 'croc', noScale: true, arena: 'arena_croc', big: true },
    flame:  { name: 'フレイザード', hp: 680, atk: 36, def: 15, exp: 800, ai: 'boss', sprite: 'flame', noScale: true, arena: 'arena_flame', big: true },
    kill:   { name: 'キルバーン',   hp: 640, atk: 36, def: 14, exp: 900, ai: 'boss', sprite: 'kill', noScale: true, arena: 'arena_kill', big: true },
    kill_clone: { name: 'キルバーン', hp: 1, atk: 20, def: 0, exp: 0, ai: 'clone', sprite: 'kill', noScale: true, clone: true },
    baran:  { name: '竜騎士バラン',       hp: 780, atk: 40, def: 18, exp: 1000, ai: 'boss', sprite: 'baran', noScale: true, arena: 'arena_baran', big: true },
    mist:   { name: 'ミストバーン', hp: 820, atk: 40, def: 19, exp: 1100, ai: 'boss', sprite: 'mist', noScale: true, arena: 'arena_mist', big: true },
    /* 竜魔神バラン（隠しダンジョン35階）。通常のバランとは別のボス。戦い方はバランと同じ（js/bossai.js）で、強い。
     * 絵はまだ無いので、バランの絵を仮に使う（完成の絵はChatGPT側）。登場ムービー・報酬の品はまだ無い */
    dragonbaran: { name: '竜魔神バラン', hp: 1500, atk: 52, def: 23, exp: 4000, ai: 'boss', sprite: 'baran', noScale: true, arena: 'arena_baran', big: true },
    mist_clone: { name: 'ミストバーン', hp: 1, atk: 22, def: 0, exp: 0, ai: 'clone', sprite: 'mist', noScale: true, clone: true },
    vearn:  { name: '大魔王バーン', hp: 900, atk: 44, def: 20, exp: 1500, ai: 'boss', sprite: 'vearn', noScale: true, arena: 'throne', big: true },
    // arena 'void'：融合と覚醒の舞台（登場ムービーの白い異空間）。白い床・白い霧・空席の水晶の玉座（js/render.js の drawVoidBg）
    truevearn: { name: '真大魔王バーン', hp: 1700, atk: 60, def: 21, exp: 3000, ai: 'boss', sprite: 'truevearn', noScale: true, arena: 'void', big: true },
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
    void:        { name: '白き異空間' },   // 33階の真大魔王バーン（名前は仮）
    // 2026年10月21日（ZIP dungeon_7themes_art_v1 の階の割り当て）：7〜15階は「地下の遺跡」。7〜10階は灯り多め（ruins）、11〜15階は暗く荘厳（ruins_deep）
    ruins:       { name: '地下の遺跡' },
    ruins_deep:  { name: '地下の遺跡' },
  });
  D.THEMES.crystal.name = '地底の古代神殿';   // 2026年10月21日：21〜25階の名前（以前は「水晶の地下神殿」）
  // 以前の版の地域（更新前から続く探索用）
  D.themeOf = (f) => (f <= 3 ? 'brick' : f <= 6 ? 'roots' : f <= 9 ? 'water' : f === 10 ? 'orb' : f <= 15 ? 'garden'
    : f <= 20 ? 'sunken' : f <= 25 ? 'crystal' : f <= 29 ? 'gold' : 'shrine');
  // 章で使う地域（ボスの階は各ボスの景観）
  /* 2026年10月21日（ZIP dungeon_7themes_art_v1 の割り当て）：1〜3 レンガの回廊・4〜6 木の根の遺跡・7〜14 地下の遺跡・16〜19 水没した古代都市・
   * 21〜24 地底の古代神殿・26〜29 封印の最深部・31〜32 大魔王の城。ボスの階（15・20・25・30・33）は各ボスの景観のまま。
   * 後の章でボスの階ではない 15・20・25 階は、ひとつ前の地域（地下の遺跡・水没した古代都市・地底の古代神殿）。
   * 以前の「水の神殿」（7〜10階）と「木の根と苔の地下庭園」（11〜15階）は章の階では使わない（以前の版の探索 D.themeOf だけ） */
  D.themeOfFloor = (f) => (f <= 3 ? 'brick' : f <= 6 ? 'roots' : f <= 10 ? 'ruins' : f <= 15 ? 'ruins_deep'
    : f <= 20 ? 'sunken' : f <= 25 ? 'crystal' : f <= 30 ? 'gold' : 'demon');

  /* 階層ごとの出現テーブル [id, 重み] を作る。地域ごとに敵・道具・お宝が変わる。 */
  /* ch：章の番号（1〜6）、または以前の版の探索なら 'legacy' */
  // 章のボスの階（layout 1＝以前の配置：第1〜5章は30階）
  D.bossFloorOf = (ch, layout) => {
    const C = D.CHAPTERS && D.CHAPTERS[ch];
    if (!C) return D.BOSS_FLOOR;
    if (C.final) return D.finalFloors(layout).truevearn;   // 版2も35階（版3と同じ）
    return (layout || D.LAYOUT) >= 2 ? C.goal : D.BOSS_FLOOR;
  };
  /* 隠しダンジョンの階（31〜35階）。部屋の大きい地図（hidden）。32〜34階は強敵（enemyMul・expMul）。35階は竜魔神バラン */
  function hiddenFloor(f) {
    const H = D.HIDDEN_DUNGEON;
    if (f >= H.to) return { theme: D.ENEMIES[H.boss].arena, areaName: H.name + '・最奥', hidden: true, boss: H.boss, enemies: [], enemyCount: [0, 0], itemCount: [4, 4], goldCount: [0, 0],
      items: [['herb', 2], ['big_herb', 2], ['elixir', 1], ['khaoniao', 1]] };
    const base = demonFloor(f, D.CHAPTERS[D.FINAL_CHAPTER]), strong = H.strong.floors.includes(f);
    return Object.assign({}, base, { areaName: H.name, hidden: true, returnPoint: false,
      enemies: strong ? D.STRONG.spawn : base.enemies, strong, mimics: strong ? D.STRONG.mimic.count : null,
      enemyCount: H.counts.enemies, itemCount: H.counts.items, goldCount: H.counts.gold });
  }
  D.hiddenFloor = (f) => floorCache['hidden:' + f] || (floorCache['hidden:' + f] = hiddenFloor(f));
  function floorDef(f, ch, layout, skip) {
    const legacy = ch === 'legacy' || ch == null;
    const C = legacy ? null : D.CHAPTERS && D.CHAPTERS[ch];
    let bossId = legacy ? D.LEGACY_BOSS_FLOORS[f] : C ? (f === D.bossFloorOf(ch, layout) ? C.boss : null) : null;
    if (C && C.final && (layout || D.LAYOUT) >= 3) {   // 版3の最終章
      const FF = D.finalFloors(layout);
      bossId = Object.keys(FF).find((b) => FF[b] === f) || null;
      if (bossId && skip && skip[bossId]) bossId = null;
    }
    if (bossId) {
      return { theme: legacy ? D.themeOf(f) : D.ENEMIES[bossId].arena, boss: bossId, enemies: [], enemyCount: [0, 0], itemCount: [3, 3], goldCount: [0, 0],
        items: [['herb', 2], ['elixir', 1], ['khaoniao', 1]].concat(f >= 20 ? [['big_herb', 2]] : []) };
    }
    if (f > D.MAX_FLOOR) return demonFloor(f, C);
    const items = [['herb', 4], ['banana', f <= 15 ? 3 : 2], ['sleep_incense', f <= 3 ? 1 : 2], ['thunder_staff', 1]];
    const add = (cond, list) => { if (cond) for (const x of list) items.push(x); };
    add(f >= 3, [['sight_scroll', 1]]);
    add(f >= 5, [['sense_scroll', 0.8]]);
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
    // アクセサリー（まれ）
    for (const a of D.ACCESSORY_DROPS) add(f >= a.from, [[a.id, a.w]]);
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
    if (f <= 25) return [['golem', 2], ['wisp', 0.75], ['lizard', 2], ['shaman', 2], ['thief', 2], ['bat', 1], ['statue', 1]];
    return [['guard', 3], ['golem', 2], ['wisp', 0.5], ['shaman', 2], ['thief', 2], ['lizard', 1]];
  };
  // 最終章の31階より下：大魔王の城
  function demonFloor(f, C) {
    const items = [['herb', 3], ['big_herb', 3], ['elixir', 2], ['khaoniao', 2], ['banana', 1], ['sleep_incense', 2], ['slow_powder', 1],
      ['fire_charm', 1], ['thunder_king_staff', 0.8], ['antidote', 1], ['sight_scroll', 1], ['sense_scroll', 1], ['clear_incense', 1],
      ['golden_sword', 0.6], ['golden_shield', 0.6], ['golden_elephant', 2], ['dream_crown', 1], ['gold_leaf', 2]].concat(D.ACCESSORY_DROPS.map((a) => [a.id, a.w]));
    return { theme: 'demon', enemies: [['darkknight', 3], ['imp', 3], ['guard', 2], ['golem', 1], ['wisp', 0.25]],
      enemyCount: [6, 7], itemCount: [5, 7], goldCount: [3, 4], items };
  }
  // 章・深さごとの階の定義（作った結果は覚えておく）
  const floorCache = {};
  // skip：最終章（版3）で、もう倒したボス { vearn, truevearn }（その階はボスのいない階になる）
  D.floorFor = function (ch, f, layout, skip) {
    const L = layout || D.LAYOUT;
    const k = (ch == null ? 'legacy' : ch) + ':' + f + ':' + L + (skip ? ':' + (skip.vearn ? 'v' : '') + (skip.truevearn ? 't' : '') : '');
    return floorCache[k] || (floorCache[k] = floorDef(f, ch == null ? 'legacy' : ch, L, skip));
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
   * 出現：8階以降のふつうの階で約14%（ボスの階・最終章の真大魔王バーンの階・モンスターハウスの部屋には出ない）。
   * 価格の目安（簡易AI 各200回の平均）：12階まで行って帰ると約1100G、21階で約2200G、30階前後で約3100G。
   *   素材は1マスの道具の約7%（1階あたり約0.4個）なので、自分で集めると同じ地域を2〜3階探す手間。
   *   その手間より高く、1回の探索の稼ぎの半分〜3分の2にあたる値段にする。
   * from：その素材を並べ始める階（拾える階より3階ほど手前から。深いほど貴重な素材が並ぶ）。
   * 支払いは探索中のお金から先に使い、足りない分は村の資金から（商人が村へ受け取りに行く「つけ払い」）。 */
  D.MERCHANT = {
    // 2026年10月：素材の値段は分かりやすい4段階に固定（ばらつき priceSpread は 0）
    name: '謎の旅商人', minFloor: 8, chance: 0.14, maxKinds: 3, stock: [1, 2], priceSpread: 0,
    /* 買い取り（2026年10月）：分類が「お宝」（type: 'treasure'）の品だけ。町の売値（G.sellPrice）の50%（端数は切り捨て。
     * 展示室のお礼30%・使い切った杖の1/3と同じ Math.floor）。売れない品（noSell）は買い取らない。代金は探索中のお金に入る */
    buyRate: 0.5,
    goods: [
      { id: 'amber_shard', from: 8, price: 1000 },
      { id: 'bronze_shard', from: 13, price: 2000 },
      { id: 'crystal_shard', from: 18, price: 3000 },
      { id: 'gold_leaf', from: 23, price: 4000 },
    ],
    /* なくしたボスの報酬の買い戻し（2026年10月）：1個の値段は、報酬をくれたボスで決まる（同じボスの品は同じ値段）。
     * 対象は章の報酬の品（D.CHAPTERS[c].reward.items、G.buybackPrice）。最終章の報酬（大魔王のローブ）は大魔王バーン。
     * 竜魔神バランの報酬・黄金の象などのくり返し出る品・素材は対象外（未指定）。竜の紋章は下の buybackItems */
    buyback: { croc: 1000, flame: 2000, kill: 3000, baran: 4000, mist: 5000, vearn: 6000 },
    /* ボスの章の報酬のほかに買い戻せる品（2026年10月）：竜の紋章（橋の向こうで拾う・竜魔神バランの報酬）。
     * 一度手に入れていて、今は持っていない（復活でなくなった・置いてきた等）ときに並ぶ。何度でも買える。値段は仮 */
    buybackItems: { dragon_crest: { price: 5000, note: '一度手に入れた竜の紋章' } },
  };
  /* 商人の呼鈴（2026年10月確定）：町の建設・改修（村の発展の一覧 D.FACILITIES の施設と飾り）をすべて終えると、
   * こもれびの家（村の発展）で寄付できるようになる。1,000G 寄付するたびに1個。
   * 隠しアイテムの発見・会話の閲覧・お宝の収集そのものは条件に入れない（建設に必要な寄贈などの条件は、各施設の解放条件のまま）。
   * 一覧は別のチャットで見直し中なので、D.FACILITIES に入っている項目をその時の対象にする（足し引きすると自動で変わる） */
  D.BELL = { donation: 1000, unlock: (S) => D.FACILITIES.every((f) => !!(S.village.built && S.village.built[f.id])) };
  // 床に落ちているお金（浅い階は控えめ、深いほど多い）
  D.goldAmount = (floor, r) => Math.round((8 + r * 12) * (1 + 0.28 * (floor - 1)));

  // 村の段階（お店の品ぞろえ）。施設の購入で上がる
  D.VILLAGE_STAGES = [
    null,
    { name: '小さなお店' },
    { name: '倉庫のある店' },
    { name: '鍛冶屋と屋台の村' },
  ];
  /* 倉庫の枠（2026年10月：20→40→60→80 から 10→15→20→30 へ。値段・解放条件・段階は同じ）。
   * 前のセーブで倉庫が上限より多くても品は消さない（上限を下回るまで新しく預けられないだけ。取り出しはできる） */
  D.STORAGE_SIZE = { 1: 10, 2: 15, 3: 20, 4: 30 };
  D.SHOP_STOCK = {
    1: ['herb', 'banana', 'bamboo_shield', 'bronze_sword'],
    2: ['herb', 'banana', 'sleep_incense', 'sight_scroll', 'sense_scroll', 'bamboo_shield', 'bronze_sword'],
    3: ['herb', 'banana', 'khaoniao', 'elixir', 'sleep_incense', 'sight_scroll', 'sense_scroll', 'smoke_ball', 'antidote', 'bamboo_shield', 'bronze_sword'],
  };

  /* 施設・村の飾り。price: 資金、mats: 素材、req: 解放条件（文字列は表示用）
   * 浅い階の収入（1回の帰還で約150〜550G）で最初の施設に届き、
   * 大きな施設や上位の強化は深い階での複数回の冒険が必要な価格にしている。 */
  D.FACILITIES = [
    { id: 'storage2', kind: 'facility', name: '倉庫の拡張（15枠）', price: 200, desc: '倉庫が15枠に。お店にねむり草・みとおしの巻物が並ぶ。灯りが増える。', req: [] },
    { id: 'smith1', kind: 'facility', name: '鍛冶屋と屋台', price: 600, desc: '鍛冶屋で武器・盾を+3まで強化できる。屋台で特製お弁当・いのちの霊薬・けむり玉・どくけしそうが買える。', req: ['storage2'] },
    { id: 'diner', kind: 'facility', name: 'ワーンの食堂', price: 800, desc: '出発前に料理を1品えらべる。次の探索だけ能力が上がる。', req: ['storage2'] },
    { id: 'museum', kind: 'facility', name: 'お宝展示室', price: 1200, desc: '珍しいお宝を寄贈して飾れる。集めると称号と飾りが解放される。', req: ['smith1'] },
    { id: 'storage3', kind: 'facility', name: '倉庫の増築（20枠）', price: 1500, desc: '倉庫が20枠に。', req: ['storage2', 'floor10'] },
    { id: 'smith2', kind: 'facility', name: '鍛冶屋の大きな炉（+5）', price: 2500, mats: { amber_shard: 3, bronze_shard: 2 }, desc: '強化の上限が+5になる。', req: ['smith1'] },
    { id: 'storage4', kind: 'facility', name: '大倉庫（30枠）', price: 4000, desc: '倉庫が30枠に。', req: ['storage3', 'floor20'] },
    { id: 'smith3', kind: 'facility', name: '黄金の炉（+8）', price: 7000, mats: { crystal_shard: 3, gold_leaf: 2 }, desc: '強化の上限が+8になる。', req: ['smith2'] },
    { id: 'lanterns', kind: 'decor', name: '灯籠の並木', price: 300, desc: '道ぞいに灯籠が並び、夕暮れの村が明るくなる。', req: [] },
    // 蓮の庭：2026年10月、増えていた植木鉢（コードの絵）をやめた。新しい花壇のデザインを置くまで、建てても見た目は変わらない（建てた記録・呼鈴の条件はそのまま）
    { id: 'garden', kind: 'decor', name: '蓮の庭', price: 400, desc: '村に花壇が増える（花壇の新しいデザインを準備中）。', req: ['storage2'] },
    { id: 'stalls', kind: 'decor', name: '屋台通り', price: 700, desc: '水路ぞいに色とりどりの屋台が並ぶ。', req: ['smith1'] },
    // 2026年10月：解放は通常のバラン（第4章）を倒した後（以前は地下10階に到達）。値段は同じ。すでに建てた橋はそのまま
    { id: 'bridge', kind: 'decor', name: '水路の赤い橋', price: 900, desc: '水路に赤い橋がかかる。', req: ['baran'] },
    { id: 'statue', kind: 'decor', name: '象の像', price: 500, desc: '白い象の像。', req: ['donate3'] },
    { id: 'fountain', kind: 'decor', name: '噴水', price: 900, desc: '村の真ん中に噴水。', req: ['donate6'] },
    // 2026年10月：「黄金の門」（gate）を「マスターヤナイの像」に変更。値段・解放条件は同じ。旧セーブの購入済みは save.js（v7）で引き継ぐ
    { id: 'yanai_statue', kind: 'decor', name: 'マスターヤナイの像', price: 1500, desc: '広場に、村を守った師匠マスターヤナイの像を建てる。', req: ['donate9'] },
  ];
  D.REQ_TEXT = {
    storage2: '「倉庫の拡張」の後', smith1: '「鍛冶屋と屋台」の後', smith2: '「鍛冶屋の大きな炉」の後', storage3: '「倉庫の増築」の後',
    floor10: '地下10階に到達', baran: 'バラン（第4章）を倒した後', floor20: '地下20階に到達', donate3: 'お宝を3種類寄贈', donate6: 'お宝を6種類寄贈', donate9: 'お宝を9種類寄贈',
  };
  // 食堂の料理（次の探索だけ有効・重ねがけ不可。帰還・敗北で終わる）
  D.MEALS = {
    kaomangai: { name: 'カオマンガイ', price: 120, desc: '満腹度が減りにくくなる（約1.5倍長持ち）。', hungerMul: 1.5 },
    gapao:     { name: 'ガパオライス', price: 150, desc: '最大HP+20。', maxhp: 20 },
    tomyum:    { name: 'トムヤムクン', price: 180, desc: '攻撃力+3。', atk: 3 },
    mango:     { name: 'マンゴーもち米', price: 180, desc: '防御力+3。', def: 3 },
  };
  // 展示室：寄贈できるお宝（各1回まで）、称号
  D.MUSEUM_ITEMS = ['old_coin', 'jade_elephant', 'golden_lotus', 'croc_tear', 'amber_pendant', 'bronze_bell', 'sunken_crown', 'iceflame_crystal', 'giant_crystal', 'prism_flower', 'golden_elephant', 'dream_crown'];
  D.MUSEUM_THANKS = 0.3; // 初めて寄贈したときだけ、売値の3割を村からお礼としてもらえる
  D.TITLES = [[3, '見習い収集家'], [6, '遺跡の目利き'], [9, '宝物殿の主'], [12, 'アユタヤの語り部']];
  D.START_FUNDS = 50;

  TS.Data = D;
})(globalThis.TS = globalThis.TS || {});
