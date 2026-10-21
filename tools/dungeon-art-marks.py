# 地域の背景のプレビューに、足りない素材・継ぎ目の印をつける：python3 -I tools/dungeon-art-marks.py [地域]
# 入力：docs/dungeon-art-v1/<地域>/overview_after.png と map.json（node tools/dungeon-art-preview.js が作る）。出力：overview_marks.png
#  橙の枠＝1マス幅の細い壁の絵を使った所（壁の正面が奇数マスで終わる最後の1マス・1マスだけの壁）。2マス幅の絵と並ぶ所の継ぎ目を見る
#  （brick-extra-v1 の上面・縁・角を入れたので、部屋の左右・下の壁、内角・外角は絵で埋まる。残る要確認の所だけ印）
#  赤の枠＝左右の縁が、壁の正面の絵（上半分）の横で止まる所：縁の端と正面の絵の縁取りが段違いになる
#  緑の線＝1マス幅の通路で両側に縁が並ぶ所（縁2本＋床12px）：通路の見え方を確かめる所
import json, os, sys
from PIL import Image, ImageDraw
TH = sys.argv[1] if len(sys.argv) > 1 else 'brick'
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'dungeon-art-v1', TH)
M = json.load(open(os.path.join(D, 'map.json'))); W, H, T = M['w'], M['h'], M['tiles']
at = lambda x, y: 0 if x < 0 or y < 0 or x >= W or y >= H else T[y * W + x]
walk = lambda x, y: at(x, y) != 0
face = lambda x, y: at(x, y) == 0 and walk(x, y + 1)
im = Image.open(os.path.join(D, 'overview_after.png')).convert('RGB'); d = ImageDraw.Draw(im)
n = {'narrow': 0, 'rimStop': 0, 'corr1': 0}
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
      if face(x, y + 1) and (walk(x - 1, y) or walk(x + 1, y)):
        d.rectangle([X + 2, Y + 2, X + 29, Y + 29], outline=(255, 40, 40), width=2); n['rimStop'] += 1
    elif walk(x, y) and at(x - 1, y) == 0 and at(x + 1, y) == 0 and not face(x - 1, y) and not face(x + 1, y):
      d.line([X + 16, Y + 4, X + 16, Y + 27], fill=(60, 220, 90), width=3); n['corr1'] += 1
im.save(os.path.join(D, 'overview_marks.png'))
print(TH, n)
