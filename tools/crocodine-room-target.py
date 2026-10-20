# クロコダインの部屋：ChatGPT が直すための目標の寸法の図：python3 -I tools/crocodine-room-target.py
# 今の絵（1024×1536）の倍率（1マス＝808/15≒53.87px、広間の床の左上＝(108,352)）のまま、今の共通のボスの階（地図33×24）に合わせると：
#  広間 15×15：x108〜916・y352〜1160（今の絵より床を下へ約75px のばす）
#  通路 1マス幅×3マス：x485〜539・y1160〜1322
#  前室 5×4：x377〜647・y1322〜1537（入口＝たけが立つ所 (16,21)：x485〜539・y1430〜1484）
#  いちばん下の壁：y1537〜1591。画像は 1024×1600 以上（下を岩・壁で埋める）
import os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/crocodine-room-v1/crocodine_room.png')
OUT = os.path.join(ROOT, 'docs', 'crocodine-room-v1')
F = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 20)
T = 808 / 15
X = lambda c: 108 + (c - 9) * T
Y = lambda r: 352 + (r - 1) * T
src = Image.open(SRC).convert('RGBA')
H = 1600
img = Image.new('RGBA', (1024, H), (20, 18, 16, 255)); img.alpha_composite(src.crop((0, 0, 1024, 352)), (0, 0))   # 上の壇・玉座はそのまま
src2 = src.copy(); src2.putalpha(90); img.alpha_composite(src2.crop((0, 352, 1024, 1536)), (0, 352))            # 下は今の絵を薄く（参考）
ov = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
def box(c0, r0, c1, r1, col, label=None, ly=None):
    x0, y0, x1, y1 = X(c0), Y(r0), X(c1 + 1), Y(r1 + 1)
    d.rectangle([x0, y0, x1, y1], outline=col + (255,), width=4, fill=col + (60,))
    for c in range(c0, c1 + 2): d.line([(X(c), y0), (X(c), y1)], fill=col + (110,))
    for r in range(r0, r1 + 2): d.line([(x0, Y(r)), (x1, Y(r))], fill=col + (110,))
    if label:
        w = d.textlength(label, font=F); yy = ly if ly is not None else y0 + 6
        d.rectangle([x0 + 4, yy - 2, x0 + 12 + w, yy + 26], fill=(0, 0, 0, 220)); d.text((x0 + 8, yy), label, fill=col + (255,), font=F)
box(9, 1, 23, 15, (90, 255, 130), '広間 15×15：x108〜916・y352〜1160（床を下へ約75pxのばす）')
box(16, 16, 16, 18, (90, 200, 255))
box(14, 19, 18, 22, (90, 200, 255), '前室 5×4：x377〜647・y1322〜1537', Y(19) + 6)
d.rectangle([X(16), Y(21), X(17), Y(22)], outline=(255, 230, 60, 255), width=5)
img.alpha_composite(ov); d = ImageDraw.Draw(img)
def label(x, y, s, col):
    w = d.textlength(s, font=F); d.rectangle([x - 4, y - 3, x + w + 4, y + 25], fill=(0, 0, 0, 220)); d.text((x, y), s, fill=col, font=F)
label(560, Y(16) + 10, '通路 1マス幅×3：x485〜539・y1160〜1322', (130, 210, 255))
label(560, Y(21) + 14, '入口（たけ）：x485〜539・y1430〜1484', (255, 230, 90))
label(20, Y(23) + 8, 'いちばん下の壁 y1537〜1591。画像は 1024×1600 以上', (255, 160, 160))
label(20, 300, '上（y0〜352：玉座・壇・旗）は今の絵のまま', (255, 230, 160))
img.convert('RGB').save(os.path.join(OUT, 'target-layout.jpg'), quality=88)
print('saved')
