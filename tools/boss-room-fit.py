# ボス部屋の背景と、今のボスの階（共通の形）の通れるマスを照合する：python3 -I tools/boss-room-fit.py <croc|truevearn|flame>
# 画像は歪めない（縦横同じ倍率）。広間15×15の横幅を、絵の広間の床の横幅（実測）に合わせて1マスの大きさを決める。
#  今の共通の形（js/dungeon.js generateBossFloor）：広間 x9〜23・y1〜15、通路 x16・y16〜18（1マス幅）、前室 x14〜18・y19〜22、入口 (16,21)、ボス (16,8)
# 出力（docs/<部屋>-room-v1/）：
#  overlay-current.jpg … 緑＝通れるマスが絵の床の上、赤＝通れるのに絵では壁・柱・縁・雲、黄＝絵では床なのに通れない。青い枠＝絵の床（実測）
#  target-layout.jpg   … 今の倍率のまま今の地図に合わせるための、絵の目標の寸法（ChatGPT 向け）
import os, sys
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
F = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 20)
ROOMS = {
  # クロコダイン（ZIP crocodine_room_v1、1024×1536）。床の実測：広間 x108〜916・y352〜1085、通路 x455〜570、前室 x335〜690・y1245〜1405、入口 y1405〜
  'croc': dict(src='assets/reference/crocodine-room-v1/crocodine_room.png', out='docs/crocodine-room-v1', boss='assets/bosses/croc.png', top='玉座・壇・旗',
               floor=[(108, 352, 916, 1085), (455, 1085, 570, 1245), (335, 1245, 690, 1405), (455, 1405, 570, 1536)]),
  # 真大魔王バーン（ZIP truevearn_room_v1、1024×1536）。床の実測：広間 x120〜905・y385〜1035（遠近で下ほど少し広い台形）、通路 x455〜555、前室 x385〜640・y1210〜1390、入口 y1395〜
  'truevearn': dict(src='assets/reference/truevearn-room-v1/truevearn_room.png', out='docs/truevearn-room-v1', boss='assets/bosses/truevearn.png', top='透明な玉座・壇',
                    floor=[(120, 385, 905, 1035), (455, 1035, 555, 1210), (385, 1210, 640, 1390), (455, 1395, 555, 1536)]),
  # フレイザード（ZIP flazzard_room_v1、1024×1536）。床の実測：広間 x150〜868・y365〜1050（左は氷・右は溶岩の縁）、通路 x450〜575、前室 x345〜695・y1235〜1395、入口 x450〜563・y1395〜
  'flame': dict(src='assets/reference/flazzard-room-v1/flazzard_room.png', out='docs/flazzard-room-v1', boss='assets/bosses/flame.png', top='氷と炎の玉座・壇',
                floor=[(150, 365, 868, 1050), (450, 1050, 575, 1235), (345, 1235, 695, 1395), (450, 1395, 563, 1536)]),
}
R = ROOMS[sys.argv[1]]
SRC, OUT = os.path.join(ROOT, R['src']), os.path.join(ROOT, R['out']); os.makedirs(OUT, exist_ok=True)
FLOOR = R['floor']; fx0, fy0, fx1, fy1 = FLOOR[0]
T = (fx1 - fx0) / 15                  # 1マス
X = lambda c: fx0 + (c - 9) * T       # マス(9,1)＝広間の左上を、絵の床の左上に
Y = lambda r: fy0 + (r - 1) * T
src = Image.open(SRC).convert('RGBA')
def label(d, x, y, s, col):
    w = d.textlength(s, font=F); d.rectangle([x - 4, y - 3, x + w + 4, y + 25], fill=(0, 0, 0, 215)); d.text((x, y), s, fill=col, font=F)

# 1. 重ねた図
def on_floor(x0, y0, x1, y1):
    a = sum(max(0, min(x1, b[2]) - max(x0, b[0])) * max(0, min(y1, b[3]) - max(y0, b[1])) for b in FLOOR)
    return a >= 0.7 * (x1 - x0) * (y1 - y0)
pas = {(x, y) for y in range(1, 16) for x in range(9, 24)} | {(16, y) for y in range(16, 19)} | {(x, y) for y in range(19, 23) for x in range(14, 19)}
img = src.copy(); ov = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov); bad = miss = 0
for gy in range(-8, 30):
    for gx in range(0, 33):
        x0, y0 = X(gx), Y(gy); x1, y1 = x0 + T, y0 + T
        if x1 < 0 or y1 < 0 or x0 > img.width or y0 > img.height: continue
        p, f = (gx, gy) in pas, on_floor(x0, y0, x1, y1)
        if p and f: d.rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], fill=(60, 220, 100, 45), outline=(40, 200, 90, 190))
        elif p: d.rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], fill=(255, 40, 40, 110), outline=(230, 40, 40, 240)); bad += 1
        elif f: d.rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], fill=(255, 210, 0, 80), outline=(230, 180, 0, 220)); miss += 1
for b in FLOOR: d.rectangle(list(b), outline=(40, 140, 255, 255), width=3)
img.alpha_composite(ov)
k = T / 32
boss = Image.open(os.path.join(ROOT, R['boss'])).convert('RGBA').resize((round(96 * k), round(96 * k)), Image.NEAREST)
take = Image.open(os.path.join(ROOT, 'assets/chars/take_back.png')).convert('RGBA').resize((round(52 * k), round(64 * k)), Image.NEAREST)
img.alpha_composite(boss, (round(X(16) + T / 2 - boss.width / 2), round(Y(9) - boss.height)))
img.alpha_composite(take, (round(X(16) + T / 2 - take.width / 2), round(Y(22) - k - 62 * k)))
dd = ImageDraw.Draw(img)
label(dd, fx0 + 12, fy0 + 10, '今の広間 15×15（1マス≒%.1fpx、横幅を絵の床に合わせた）' % T, (130, 255, 150))
label(dd, fx0 + 12, Y(16) + 10, '赤：通れるのに絵は壁・柱・縁（%d マス）' % bad, (255, 130, 130))
label(dd, 600, img.height - 96, '黄：絵は床なのに通れない（%d マス）' % miss, (255, 230, 90))
label(dd, 600, img.height - 60, '青い枠：絵の床（実測）', (130, 200, 255))
img.convert('RGB').save(os.path.join(OUT, 'overlay-current.jpg'), quality=88)

# 2. 目標の寸法（今の倍率・上の部分はそのまま、今の地図に合わせる）
H = int(Y(24)) + 10
tg = Image.new('RGBA', (src.width, max(H, src.height)), (20, 18, 16, 255)); tg.alpha_composite(src.crop((0, 0, src.width, fy0)), (0, 0))
s2 = src.copy(); s2.putalpha(90); tg.alpha_composite(s2.crop((0, fy0, src.width, src.height)), (0, fy0))
ov = Image.new('RGBA', tg.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
def box(c0, r0, c1, r1, col):
    x0, y0, x1, y1 = X(c0), Y(r0), X(c1 + 1), Y(r1 + 1)
    d.rectangle([x0, y0, x1, y1], outline=col + (255,), width=4, fill=col + (60,))
    for c in range(c0, c1 + 2): d.line([(X(c), y0), (X(c), y1)], fill=col + (110,))
    for r in range(r0, r1 + 2): d.line([(x0, Y(r)), (x1, Y(r))], fill=col + (110,))
box(9, 1, 23, 15, (90, 255, 130)); box(16, 16, 16, 18, (90, 200, 255)); box(14, 19, 18, 22, (90, 200, 255))
d.rectangle([X(16), Y(21), X(17), Y(22)], outline=(255, 230, 60, 255), width=5)
tg.alpha_composite(ov); d = ImageDraw.Draw(tg)
r0 = lambda v: int(round(v))
xy = lambda b: (b[0], b[2], b[1], b[3])   # (x0,y0,x1,y1) → 文字の順（x0,x1,y0,y1）
spec = {
  'arena': (r0(X(9)), r0(Y(1)), r0(X(24)), r0(Y(16))), 'corr': (r0(X(16)), r0(Y(16)), r0(X(17)), r0(Y(19))),
  'ante': (r0(X(14)), r0(Y(19)), r0(X(19)), r0(Y(23))), 'start': (r0(X(16)), r0(Y(21)), r0(X(17)), r0(Y(22))), 'bottom': (r0(Y(23)), r0(Y(24))),
}
label(d, 20, fy0 - 40, '上（y0〜%d：%s）は今の絵のまま' % (fy0, R['top']), (255, 230, 160))
label(d, spec['arena'][0] + 8, spec['arena'][1] + 8, '広間 15×15：x%d〜%d・y%d〜%d' % xy(spec['arena']), (130, 255, 150))
label(d, spec['corr'][2] + 12, spec['corr'][1] + 10, '通路 1マス幅×3：x%d〜%d・y%d〜%d' % xy(spec['corr']), (130, 210, 255))
label(d, spec['ante'][0] + 4, spec['ante'][1] + 6, '前室 5×4：x%d〜%d・y%d〜%d' % xy(spec['ante']), (130, 210, 255))
label(d, spec['start'][2] + 12, spec['start'][1] + 12, '入口（たけ）：x%d〜%d・y%d〜%d' % xy(spec['start']), (255, 230, 90))
label(d, 20, spec['bottom'][0] + 8, 'いちばん下の壁 y%d〜%d。画像は %d×%d 以上' % (spec['bottom'] + (src.width, (spec['bottom'][1] + 9) // 10 * 10)), (255, 160, 160))
tg.convert('RGB').save(os.path.join(OUT, 'target-layout.jpg'), quality=88)
print(sys.argv[1], 'tile %.2f' % T, 'red', bad, 'yellow', miss, spec)
