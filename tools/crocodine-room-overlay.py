# クロコダインの部屋（ZIP crocodine_room_v1、1024×1536）に、今のボスの階の通れるマスを重ねて照合する：python3 -I tools/crocodine-room-overlay.py
# 画像は歪めない（縦横同じ倍率）。広間15×15の横幅を、絵の床の横幅（x108〜916、実測）に合わせる → 1マス＝808/15≒53.9px
#  今の共通の形（js/dungeon.js generateBossFloor）：広間 x9〜23・y1〜15、通路 x16・y16〜18、前室 x14〜18・y19〜22、入口 (16,21)
#  緑＝通れるマスが絵の床に乗っている所、赤＝通れるマスなのに絵では壁・柱・炎の台の所、黄＝絵では床なのに通れないマス
import os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/crocodine-room-v1/crocodine_room.png')
OUT = os.path.join(ROOT, 'docs', 'crocodine-room-v1'); os.makedirs(OUT, exist_ok=True)
F = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 20)
T = 808 / 15; X0 = 108 - 9 * T; Y0 = 352 - 1 * T          # マス(9,1)＝広間の左上を、絵の床の左上(108,352)に
# 絵の床（実測。通れそうに見える所）
FLOOR = [(108, 352, 916, 1085), (455, 1085, 570, 1245), (335, 1245, 690, 1405), (455, 1405, 570, 1536)]
def on_floor(x0, y0, x1, y1):   # マスの7割以上が絵の床の上か
    a = 0
    for fx0, fy0, fx1, fy1 in FLOOR: a += max(0, min(x1, fx1) - max(x0, fx0)) * max(0, min(y1, fy1) - max(y0, fy0))
    return a >= 0.7 * (x1 - x0) * (y1 - y0)
pas = set()
for y in range(1, 16):
    for x in range(9, 24): pas.add((x, y))
for y in range(16, 19): pas.add((16, y))
for y in range(19, 23):
    for x in range(14, 19): pas.add((x, y))
img = Image.open(SRC).convert('RGBA'); ov = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
bad = 0; miss = 0
for gy in range(0, 30):
    for gx in range(5, 28):
        x0, y0 = X0 + gx * T, Y0 + gy * T; x1, y1 = x0 + T, y0 + T
        if x1 < 0 or y1 < 0 or x0 > img.width or y0 > img.height: continue
        p, f = (gx, gy) in pas, on_floor(x0, y0, x1, y1)
        if p and f: d.rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], fill=(80, 255, 120, 40), outline=(80, 255, 120, 170))
        elif p: d.rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], fill=(255, 40, 40, 110), outline=(255, 60, 60, 230)); bad += 1
        elif f: d.rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], fill=(255, 220, 40, 70), outline=(255, 220, 40, 200)); miss += 1
for fx0, fy0, fx1, fy1 in FLOOR: d.rectangle([fx0, fy0, fx1, fy1], outline=(80, 180, 255, 255), width=3)
img.alpha_composite(ov)
k = T / 32
croc = Image.open(os.path.join(ROOT, 'assets/bosses/croc.png')).convert('RGBA').resize((round(96 * k), round(96 * k)), Image.NEAREST)
take = Image.open(os.path.join(ROOT, 'assets/chars/take_back.png')).convert('RGBA').resize((round(52 * k), round(64 * k)), Image.NEAREST)
cx, cy = X0 + 16 * T, Y0 + 8 * T   # ボスの最初の位置（広間の中央 16,8）
img.alpha_composite(croc, (round(cx + T / 2 - croc.width / 2), round(cy + T - croc.height)))
sx, sy = X0 + 16 * T, Y0 + 21 * T   # 入口 (16,21)
img.alpha_composite(take, (round(sx + T / 2 - take.width / 2), round(sy + T - k - 62 * k)))
dd = ImageDraw.Draw(img)
def label(x, y, s, col):
    w = dd.textlength(s, font=F); dd.rectangle([x - 4, y - 3, x + w + 4, y + 25], fill=(0, 0, 0, 210)); dd.text((x, y), s, fill=col, font=F)
label(120, 362, '今の広間 15×15（1マス≒53.9px、横幅を絵の床に合わせた）', (130, 255, 150))
label(120, 1095, '赤：通れるのに絵は壁・柱（%d マス）' % bad, (255, 130, 130))
label(600, 1440, '黄：絵は床なのに通れない（%d マス）' % miss, (255, 230, 90))
label(600, 1475, '青い枠：絵の床（実測）', (130, 200, 255))
img.convert('RGB').save(os.path.join(OUT, 'overlay-current.jpg'), quality=88)
print('red', bad, 'yellow', miss)
