# 地域の背景のプレビューに、足りない素材・継ぎ目の印をつける：python3 -I tools/dungeon-art-marks.py [地域]
# 入力：docs/dungeon-art-v1/<地域>/overview_after.png と map.json（node tools/dungeon-art-preview.js が作る）。出力：overview_marks.png
#  橙の枠＝1マス幅の細い壁の絵を使った所（壁の正面が奇数マスで終わる最後の1マス・1マスだけの壁）。2マス幅の絵と並ぶ所の継ぎ目を見る
#  青い線＝横向きの壁（部屋の左右）：絵が無いので今のコードの絵
#  紫の線＝部屋の下側の壁（下に床が無い、上に床がある壁）：絵が無いので今のコードの絵
#  黄色の点＝角（床の斜めだけに壁の角がある所）：角の絵が無い
import json, os, sys
from PIL import Image, ImageDraw
TH = sys.argv[1] if len(sys.argv) > 1 else 'brick'
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'dungeon-art-v1', TH)
M = json.load(open(os.path.join(D, 'map.json'))); W, H, T = M['w'], M['h'], M['tiles']
at = lambda x, y: 0 if x < 0 or y < 0 or x >= W or y >= H else T[y * W + x]
walk = lambda x, y: at(x, y) != 0
face = lambda x, y: at(x, y) == 0 and walk(x, y + 1)
im = Image.open(os.path.join(D, 'overview_after.png')).convert('RGB'); d = ImageDraw.Draw(im)
n = {'narrow': 0, 'side': 0, 'bottom': 0, 'corner': 0}
for y in range(H):
  for x in range(W):
    X, Y = x * 32, y * 32
    if face(x, y):
      # 細い1マスの絵を使う所（奇数マスの壁の最後の1マス・1マスだけの壁）：橙の枠
      s0 = x
      while face(s0 - 1, y): s0 -= 1
      s1 = x
      while face(s1 + 1, y): s1 += 1
      if (s1 - s0 + 1) % 2 == 1 and x == s1:
        d.rectangle([X + 1, Y - 31, X + 30, Y + 30], outline=(255, 150, 30), width=3); n['narrow'] += 1
    elif at(x, y) == 0:
      if walk(x - 1, y) or walk(x + 1, y):
        xx = X + 2 if walk(x - 1, y) else X + 29
        d.line([xx, Y, xx, Y + 31], fill=(60, 140, 255), width=3); n['side'] += 1
      if walk(x, y - 1):
        d.line([X, Y + 2, X + 31, Y + 2], fill=(200, 80, 255), width=3); n['bottom'] += 1
      if not walk(x - 1, y) and not walk(x + 1, y) and not walk(x, y - 1) and not walk(x, y + 1) and any(walk(x + dx, y + dy) for dx in (-1, 1) for dy in (-1, 1)):
        d.ellipse([X + 11, Y + 11, X + 21, Y + 21], fill=(255, 220, 40)); n['corner'] += 1
im.save(os.path.join(D, 'overview_marks.png'))
print(TH, n)
