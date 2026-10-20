# ボス部屋のパーツ方式（ZIP boss_room_parts_v2）のプレビュー用の合成画像：python3 -I tools/make-boss-room-preview.py <truevearn|croc|flame>
# 本番の背景ではない（確認用）。素材は assets/reference/boss-room-parts-v2/<部屋>/（元絵 design_reference とテンプレートは別に保管済みなので除いた）
#  1. 床レイヤーが、ゲームの通れるマス（広間15×15・通路1×3・前室5×4。1マス＝785/15、広間の左上＝(120,385)）と合っているかを、ピクセルで調べる
#  2. 合成：上部（玉座込み）＋床レイヤー＋左右の縁の見本（広間の左右に、縦にくり返して置く）。床の外は透明のまま
#     （ゲームでは、透明な所に今の描き方が見える：真大魔王バーンは白い異空間の霧、クロコダイン・フレイザードはその地域のタイル）
#  3. 継ぎ目・不足の場所に印をつけた図
# 出力：docs/<部屋>-room-v1/preview/composite.png（ゲームのプレビューで使う）・seams.jpg（印つき）・coverage.txt
import os, sys, json
from PIL import Image, ImageDraw, ImageFont
import numpy as np
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ROOMS = { 'truevearn': ('truevearn', 'docs/truevearn-room-v1/preview', (236, 238, 245)), 'croc': ('crocodine', 'docs/crocodine-room-v1/preview', (40, 36, 30)),
          'flame': ('flazzard', 'docs/flazzard-room-v1/preview', (30, 30, 36)) }   # 部品のフォルダ・出力・印つきの図の下地の色
key = sys.argv[1] if len(sys.argv) > 1 else 'truevearn'
P = os.path.join(ROOT, 'assets/reference/boss-room-parts-v2', ROOMS[key][0]) + '/'
OUT = os.path.join(ROOT, ROOMS[key][1]); os.makedirs(OUT, exist_ok=True)
L = json.load(open(P + 'layout.json'))
W, H = L['canvas']; T = L['tile_size_fraction'][0] / L['tile_size_fraction'][1]; X0, Y0 = L['arena_origin']
X = lambda c: X0 + (c - 9) * T
Y = lambda r: Y0 + (r - 1) * T
floor = Image.open(P + 'floor_layer.png').convert('RGBA'); upper = Image.open(P + 'upper_scene.png').convert('RGBA')
left = Image.open(P + 'left_surround_sample.png').convert('RGBA'); right = Image.open(P + 'right_surround_sample.png').convert('RGBA')

# 1. 床レイヤーと通れるマス（ピクセルの中心で判定）
walk = np.zeros((H, W), bool)
tiles = [(x, y) for y in range(1, 16) for x in range(9, 24)] + [(16, y) for y in range(16, 19)] + [(x, y) for y in range(19, 23) for x in range(14, 19)]
yy, xx = np.mgrid[0:H, 0:W] + 0.5
for (c, r) in tiles: walk |= (xx >= X(c)) & (xx < X(c + 1)) & (yy >= Y(r)) & (yy < Y(r + 1))
a = np.array(floor)[:, :, 3] > 127
miss, extra = int((walk & ~a).sum()), int((~walk & a).sum())
open(os.path.join(OUT, 'coverage.txt'), 'w').write('通れるマスなのに床レイヤーが透明: %d px\n通れないのに床レイヤーが不透明: %d px\n1マス=%.4f px\n' % (miss, extra, T))
print('coverage miss', miss, 'extra', extra)

# 2. 合成
comp = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ax0, ay0, ax1, ay1 = L['regions']['arena']
side = Image.new('RGBA', (W, H), (0, 0, 0, 0))
for y in range(int(ay0), int(round(ay1)), left.height):   # 広間の左右（上部の下端から広間の下の端まで。下の端で切る）
    side.alpha_composite(left, (int(round(ax0)) - left.width, y))
    side.alpha_composite(right, (int(round(ax1)), y))
side.paste((0, 0, 0, 0), (0, int(round(ay1)), W, H))
comp.alpha_composite(side)
comp.alpha_composite(floor)
comp.alpha_composite(upper, (0, 0))
comp.save(os.path.join(OUT, 'composite.png'), optimize=True)

# 3. 継ぎ目・不足の印
F = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 20)
bg = Image.new('RGBA', (W, H), ROOMS[key][2] + (255,)); bg.alpha_composite(comp)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
marks = []
def mark(box, n, txt):
    d.rectangle(box, outline=(230, 0, 120, 255), width=4); marks.append((box, n, txt))
mark((0, Y0 - 12, W, Y0 + 14), 'A', '上部と床・左右の縁の境目（y%d）' % Y0)
for y in range(int(ay0) + left.height, int(round(ay1)), left.height):
    mark((0, y - 8, int(ax0), y + 8), 'B', '左右の縁の見本のくり返しの継ぎ目（y%d）' % y if y == int(ay0) + left.height else ''); mark((int(ax1), y - 8, W, y + 8), 'B', '')
mark((max(0, int(ax0) - 120), int(ay1) - 6, min(W, int(ax1) + 120), int(ay1) + 40), 'C', '広間の下の縁が無い（床が下地に途切れる）')
cx0, cy0, cx1, cy1 = L['regions']['corridor']; mark((int(cx0) - 30, int(cy0), int(cx1) + 30, int(cy1)), 'D', '通路の両脇の縁・柱が無い')
qx0, qy0, qx1, qy1 = L['regions']['antechamber']; mark((int(qx0) - 30, int(qy0) - 10, int(qx1) + 30, int(round(qy1)) + 40), 'E', '前室の縁・下の閉じた壁が無い')
mark((0, int(ay1) + 44, int(ax0) + 200, H - 6), 'F', '広間より下の左右：周囲の絵が無い（下地だけ）')
tile = Image.open(P + 'floor_tile.png')
mark((int(ax0) + 60, int(ay0) + 60, int(ax0) + 360, int(ay0) + 200), 'G', '床：同じタイル（%dpx）のくり返しで、継ぎ目が等間隔に見える' % tile.width)
bg.alpha_composite(ov); d = ImageDraw.Draw(bg)
seen = set()
for box, n, txt in marks:
    if n in seen: continue
    seen.add(n); x, y = box[0] + 6, box[1] + 6
    d.rectangle([x - 3, y - 2, x + 28, y + 26], fill=(230, 0, 120)); d.text((x + 3, y), n, fill=(255, 255, 255), font=F)
legend = [m for m in marks if m[2]]
yL = H - 30 * len(legend) - 10
for i, (box, n, txt) in enumerate(legend):
    s = '%s：%s' % (n, txt); w = d.textlength(s, font=F)
    d.rectangle([10, yL + i * 30 - 2, 16 + w, yL + i * 30 + 26], fill=(0, 0, 0, 200)); d.text((13, yL + i * 30), s, fill=(255, 255, 255), font=F)
bg.convert('RGB').save(os.path.join(OUT, 'seams.jpg'), quality=88)
print('saved')
