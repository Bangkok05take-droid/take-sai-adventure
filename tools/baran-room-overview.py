# 通常バラン戦の部屋の全体図：python3 -I tools/baran-room-overview.py <地図のJSON> [出力フォルダ]（node tools/baran-room-check.js が書き出して呼ぶ）
# 背景（assets/rooms/baran-room.webp）に、通れるマス（緑の枠）・入口・ボスの位置・玉座・バランとたけ（ゲームと同じ倍率）を重ねる
import sys, os, json
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
J = json.load(open(sys.argv[1])); B = J['B']; T = B['tile']
F = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 20)
bg = Image.open(os.path.join(ROOT, J.get('bgPath') or 'assets/rooms/baran-room.webp')).convert('RGBA')
th = Image.open(os.path.join(ROOT, 'assets/rooms/baran-throne.png')).convert('RGBA')
t = B['throne']; tw = round(th.width * t['h'] / th.height); thr = th.resize((tw, round(t['h'])), Image.LANCZOS)
bg.alpha_composite(thr, (round(t['cx'] - tw / 2), round(t['foot'] - t['h'])))
clean = bg.copy()
ov = Image.new('RGBA', bg.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
X = lambda c: B['imgX'] + T * c; Y = lambda r: B['imgY'] + T * r
for r in range(J['h']):
    for c in range(J['w']):
        if J['pass'][r * J['w'] + c]: d.rectangle([X(c) + 1, Y(r) + 1, X(c + 1) - 1, Y(r + 1) - 1], fill=(80, 255, 120, 34), outline=(80, 255, 120, 150))
s = J['start']; d.rectangle([X(s['x']), Y(s['y']), X(s['x'] + 1), Y(s['y'] + 1)], outline=(255, 230, 60, 255), width=4)
bg.alpha_composite(ov)
k = T / 32
baran = Image.open(os.path.join(ROOT, 'assets/bosses/baran.png')).convert('RGBA').resize((round(96 * k), round(96 * k)), Image.NEAREST)
take = Image.open(os.path.join(ROOT, 'assets/chars/take_back.png')).convert('RGBA').resize((round(52 * k), round(64 * k)), Image.NEAREST)
def put(img, im, c, r, foot):
    img.alpha_composite(im, (round(X(c) + T / 2 - im.width / 2), round(Y(r + 1) - (foot * k))))
for img in (bg, clean):
    put(img, baran, J['boss']['x'], J['boss']['y'], 96)     # ボスの枠の下端をマスの下端に（ゲームと同じ）
    put(img, take, s['x'], s['y'], 63)                     # たけの足元（62）をマスの下端の1ドット上に
    # 大きさの比較：玉座の左にたけ、右にバラン（壇の上。ゲームでは立てない場所。比較のためだけ）
    img.alpha_composite(take, (round(t['cx'] - tw / 2 - take.width - 2), round(t['foot'] - 62 * k)))
    img.alpha_composite(baran, (round(t['cx'] + tw / 2 - 30 * k), round(t['foot'] - 92 * k)))
d = ImageDraw.Draw(bg)
def label(x, y, s, col):
    w = d.textlength(s, font=F); d.rectangle([x - 4, y - 3, x + w + 4, y + 25], fill=(0, 0, 0, 200)); d.text((x, y), s, fill=col, font=F)
label(110, 508, '広間 15×17（緑の枠＝通れるマス）', (130, 255, 150))
ext = J['h'] > 34
label(560, 1530, '通路 3×7・前室 5×3（確認用）' if ext else '前室・通路 3×6', (130, 255, 150))
label(560, 1600 if not ext else 1900, '入口（黄色の枠）', (255, 230, 90))
label(4, 820, '旧入口：閉じた版の絵', (255, 140, 140))
label(560, 150, '玉座 高さ%dpx（足元固定）' % round(t['h']), (255, 230, 160))
if ext: label(4, 1640, '継ぎ目（y1672）', (255, 140, 140))
label(560, 182, '左：たけ　右：バラン（大きさの比較）', (255, 230, 160))
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'docs', 'baran-room-v1'); os.makedirs(out, exist_ok=True)
bg.convert('RGB').save(os.path.join(out, 'overview.jpg'), quality=88)
clean.convert('RGB').save(os.path.join(out, 'overview-clean.jpg'), quality=88)
print('saved')
