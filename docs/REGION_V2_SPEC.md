# 3マスの高さの壁の描き方（v2）：地域の素材の受け入れ（2026年10月26日）

レンガの回廊・木の根の遺跡で確かめた描き方を、地域ごとの素材を差し替えるだけで使えるようにしたもの。描き方は `js/tiles.js` の `artOverlayV2`、部品の一覧は `js/assets.js` の `regionV2`。

## 必要な部品（1マス＝32px。拡大・縮小せずにそのまま描く）
| 部品 | 大きさ | 置き方 |
|---|---|---|
| 床 floor_4x4 | 128×128（4×4マス） | 地図全体の座標で4マスごとにそろえて敷く。部屋も通路も同じ。地域で1種類 |
| 正面の壁（2〜4種類＋細い1マス） | 高さ96（3マス）、幅は32の倍数 | 下端を床との境目に。各マスは自分のマスの中だけ描く（上の段に床があれば描かない）。左の端から決まった順にくり返し、入らない残りは指定の幅の壁で埋める。左右の端6pxは共通の柱の半分にすると、並べて柱1本になる |
| edge_left | 16×128 | 部屋の左の壁の帯（マスの右16px）。行ごとに32pxずつ（y%4） |
| edge_right | 16×64 | 部屋の右の壁の帯（マスの左16px）。y%2 |
| edge_bottom | 128×24 | 部屋の下の壁の帯（マスの上24px）。x%4 |
| corner_bottom_left / right | 24×24 | 部屋の左下・右下の角（斜めだけ床の壁のマス） |
| edge_fit の部品（任意） | outer 32×32 ほか | 出っ張った角・下の角・帯の上端（帯の位相ごと） |
| ends_fit の部品（任意） | 16×24・24×24 | 帯の終わり（縦は下に続く壁の絵ごと） |

- 背景は暗い単色。下へ伸びる外壁・支柱・遠景はなし。床の色は部屋と通路で変えない（通路だけ暗くする処理もない）。
- 未探索・視界外を暗くする表示はそのまま。攻撃予告は濃い赤の塗りと二重の枠で、人物・道具の上にも枠を描く。

## 地域ごとの設定
- 壁の並び（seq）と、残りを埋める壁（fill）。
- 壁を暗くする割合（`D.DUNGEON_WALL_DARK`）。地下の遺跡の奥（11〜14階）は 0.3（床・予告は暗くしない）。
- 同じ部品を使う地域（`D.DUNGEON_V2_SET`）。地下の遺跡の奥は地下の遺跡と同じ組。

## 受け入れの手順
1. 素材を `assets/reference/<名前>/` に原寸のまま保存。
2. `tools/region-v2/<地域>.json` にファイルの対応を書き、`python3 -I tools/make-region-v2.py <地域> <素材のフォルダ>`。
3. `js/assets.js` の dungeon に `regionV2('<地域>_v2', { walls, seq, fill })` を足す。
4. `node tools/dungeon-art-preview.js <地域> <出力> v2` でプレビュー（before＝今の絵、after＝v2）。
5. 確認後、`js/data.js` の `D.DUNGEON_ART.<地域> = 'v2'`（縁・角の補修があれば `D.DUNGEON_EDGE_V4.<地域> = true`）。

## 地下の遺跡（7〜14階）
- 今の絵（第1回の追加原画）のまま。新しい素材が届いたら上の手順で入れる（`tools/region-v2/ruins.json` は見込みの設定）。
- 7〜10階は通常の明るさ、11〜14階は壁・縁・角だけ少し暗く（v2 でも同じ設定が効く）。

## 2026年10月26日：地下の遺跡 v2（ZIP ruins_match_v1）をプレビュー
- `assets/reference/ruins-match-v1/` → `python3 -I tools/make-region-v2.py ruins assets/reference/ruins-match-v1` → `assets/dungeon/ruins_v2/`。
- 壁は 浮き彫り4・彫刻3・破損3 のくり返し、残り3は彫刻、2・1は細い壁。edge_fit（角・上端）・ends_fit（帯の終わり）つき。11〜14階は同じ部品で壁・帯・角・終端だけ30%暗く。
- 本番はまだ（`D.DUNGEON_ART.ruins`・`ruins_deep` は今の絵）。プレビュー：`node tools/dungeon-art-preview.js ruins|ruins_deep docs/ruins-v2/<地域> e5`。代表 `docs/ruins-v2/ruins_7-10_390.jpg`・`ruins_11-14_390.jpg`。
- 2026年10月26日：本番に反映（`D.DUNGEON_ART.ruins/ruins_deep = 'v2'`、`D.DUNGEON_EDGE_V4.ruins/ruins_deep`）。

## 2026年10月27日：水没した古代都市 v2（ZIP sunken_match_v1）をプレビュー
- `assets/reference/sunken-match-v1/` → `python3 -I tools/make-region-v2.py sunken assets/reference/sunken-match-v1` → `assets/dungeon/sunken_v2/`。壁は 水の守護像4・波3・侵食3、残り3は波、2・1は細い壁。16〜19階は同じ明るさ（暗くしない）。
- 水は壁の足元の絵だけ。v2 の地域では、昔の水の地域の描き方（岸から2マスの水面・水面のきらめき）を出さない（`js/render.js` の reach、`artOverlayV2` の out.water）。
- 壁のマスの下地の色を、その地域の背景色（`SP.themeColors[地域].bg`）にした（壁の外との境目が見えないように。レンガ・木の根・地下の遺跡もこの色）。
- 本番はまだ。プレビュー：`node tools/dungeon-art-preview.js sunken docs/sunken-v2 e5`。代表 `docs/sunken-v2/sunken_16-19_390.jpg`、全体 `docs/sunken-v2/sunken_overview.png`。
- 2026年10月27日：壁の正面の上に壁が2マス以下しかない所（床と床にはさまれた薄い壁）は、絵の上端と足元を残して中を省く（縮めない）。上に床があれば下の縁の帯をそろえて描く。
- 見にくい所の分類（`docs/sunken-v2/thin_walls_marks.png`）：赤＝左右とも床の1マス幅の壁（左右の帯が2本並ぶ）、黄＝上下とも床の1マスの壁（帯と足元の水だけの低い壁）、青＝1〜2マスだけの短い正面の壁。地形を変えずに自然にするには、薄い壁用の部品が必要。
- 2026年10月27日：薄い壁の専用部品（ZIP sunken_thin_v1、`assets/reference/sunken-thin-v1/` → `assets/dungeon/sunken_v2/thin/`）。水没した古代都市だけ（`regionV2(..., { thin: true })`）。
  - 上下とも床の壁は low_wall（h=x%4、となりが床なら閉じた端）、左右とも床の壁は pillar_v（v=y%4）。そのマスには帯・角・壁の切れ端を描かない。となりの部屋の下の角も描かない。
  - 幅1・2マスだけの正面の壁で、どの列も上に3マスの高さがあれば short_wall_1・2。
  - 比較 `docs/sunken-v2/thin_3spots_before_after.png`（指摘の3か所、左が前・右が後）。
- 2026年10月27日：プランB を採用（`D.MAP_THICK_WALLS = true`、`js/dungeon.js` の thickOk）。新しく作る階から、全地域で薄い壁（壁の正面の上に壁が2マス未満・左右とも床の1マス幅の壁）を作らない。部屋の数・大きさ・敵・道具・戦闘は同じ。すでに作られた階はそのまま。比較 `docs/plan-b/`。
