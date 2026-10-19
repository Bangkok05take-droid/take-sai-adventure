# 通常バラン戦の部屋（ZIP baran_room_assets_v1）の配置案の画像：python3 -I tools/baran-room-proposal.py <ZIPを展開したフォルダ>
# 背景を引き伸ばさずに（1マス＝絵の50px）、今のボスの階の地図（js/dungeon.js generateBossFloor）に重ねた案を描く。ゲームには組み込まない
#  案A：広間を 15×15 → 15×17（下に2行）。左の通路（地図の y=11）は絵の左の開口と同じ高さ。前室・通路・入口・階段・ボスの位置の決め方は今のまま
#  玉座：背景の上の中央の壇（x≈465、壇の床の手前 y≈398 に足元）。高さ130px（2.6マス）。バラン（立ち姿の本体 約101px）が座れる大きさ
import sys, os
from PIL import Image, ImageDraw, ImageFont
SRC = sys.argv[1]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'docs', 'baran-room-v1')
os.makedirs(OUT, exist_ok=True)
T = 50                    # 1マス＝絵の50px（広間の床の内側 x100〜850 がちょうど15マス）
AX, AY, AW, AH = 100, 492, 15, 17   # 広間（絵の座標）。地図では x13〜27・y4〜20
MAPX, MAPY = 13, 4        # 広間の左上のマス（今の地図と同じ）
THX, THY, THH = 465, 398, 130   # 玉座の中心x・足元y・高さ
F = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 20)

room = Image.open(os.path.join(SRC, 'baran_room.png')).convert('RGBA')
thr = Image.open(os.path.join(SRC, 'baran_throne.png')).convert('RGBA')
thr = thr.crop(thr.split()[3].getbbox())
tw = round(thr.width * THH / thr.height)
thr = thr.resize((tw, THH), Image.LANCZOS)
base = room.copy(); base.alpha_composite(thr, (THX - tw // 2, THY - THH))

baran = Image.open(os.path.join(ROOT, 'assets/bosses/baran.png')).convert('RGBA')
B = baran.resize((round(96 * T / 32), round(96 * T / 32)), Image.NEAREST)   # ゲームと同じ：96の枠を3マスの幅で
k = T / 32
take = Image.open(os.path.join(ROOT, 'assets/chars/take_right.png')).convert('RGBA').resize((round(52 * k), round(64 * k)), Image.NEAREST)

def put_baran(img, tx, ty):   # マス(tx,ty)（絵の座標の左上）の下端に、枠の下端をそろえる（ゲームと同じ）
    img.alpha_composite(B, (round(tx + T / 2 - B.width / 2), round(ty + T - B.height)))
def put_take(img, tx, ty):    # 足元（62）をマスの下端の1ドット上に
    img.alpha_composite(take, (round(tx + T / 2 - 26 * k), round(ty + T - k - 62 * k)))
def label(d, x, y, s, col):
    w = d.textlength(s, font=F)
    d.rectangle([x - 4, y - 3, x + w + 4, y + 25], fill=(0, 0, 0, 190)); d.text((x, y), s, fill=col, font=F)

# 1. 案A：全体
mock = base.copy(); ov = Image.new('RGBA', mock.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
for c in range(AW + 1): d.line([(AX + c * T, AY), (AX + c * T, AY + AH * T)], fill=(255, 255, 255, 60))
for r in range(AH + 1): d.line([(AX, AY + r * T), (AX + AW * T, AY + r * T)], fill=(255, 255, 255, 60))
d.rectangle([AX, AY + 15 * T, AX + AW * T, AY + 17 * T], fill=(80, 200, 255, 45))
d.rectangle([AX, AY, AX + AW * T, AY + AH * T], outline=(80, 255, 120, 230), width=3)
d.rectangle([0, AY + 7 * T, AX, AY + 8 * T], fill=(255, 220, 60, 90), outline=(255, 220, 60, 255), width=2)
d.rectangle([400, AY + AH * T, 540, room.height - 1], fill=(255, 60, 60, 55), outline=(255, 80, 80, 220), width=2)
mock.alpha_composite(ov)
put_baran(mock, AX + 7 * T, AY + 7 * T)          # ボスの最初の位置：広間の中央（15×17なら (7,8)。今の決め方 h>>1）
put_take(mock, AX + 0 * T, AY + 7 * T)           # 入口から広間に入った1歩目
mock.alpha_composite(B, (THX + tw // 2 + 4, THY - B.height + 6))   # 大きさの比較：玉座の右にバランの立ち姿
d = ImageDraw.Draw(mock)
label(d, 110, AY + 8, '広間 15×17マス（1マス＝絵の50px）。地図の x13〜27・y4〜20', (130, 255, 150))
label(d, 110, AY + 15 * T + 12, '足す2行（今の広間は15×15）', (130, 220, 255))
label(d, 4, AY + 7 * T - 32, '左の通路（地図の y=11）', (255, 230, 90))
label(d, 548, AY + AH * T + 30, '下の開口：壁のまま', (255, 130, 130))
label(d, 548, 150, '玉座 高さ130px（2.6マス）', (255, 230, 160))
label(d, 548, 182, '右：バランの立ち姿（同じ倍率）', (255, 230, 160))
mock.convert('RGB').save(os.path.join(OUT, 'proposal-A.jpg'), quality=88)

# 2. スマホ（幅390）での見え方の見本：ゲームの1マスは約 390/9.5 → 41px（CSS）。たけを中心に横9.5マス・縦 約7.5マス
def phone(cx_tile, cy_tile, name):
    vw, vh = 9.5, 9.0
    x0 = AX + (cx_tile + 0.5) * T - vw * T / 2; y0 = AY + (cy_tile + 0.5) * T - vh * T / 2
    c = base.crop((round(x0), round(y0), round(x0 + vw * T), round(y0 + vh * T)))
    put_baran(c, AX + 7 * T - x0, AY + 7 * T - y0) if True else None
    put_take(c, AX + cx_tile * T - x0, AY + cy_tile * T - y0)
    c = c.resize((780, round(780 * c.height / c.width)), Image.LANCZOS)
    c.convert('RGB').save(os.path.join(OUT, name), quality=88)
phone(0, 7, 'phone-entry_390.jpg')     # 入口から入った所
phone(7, 11, 'phone-center_390.jpg')   # 広間の中央の下
print('saved', OUT)
