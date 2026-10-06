"""確認用：素材を市松模様の上に並べて拡大した一覧画像を作る。 python3 tools/contact.py 出力.png 倍率 ファイル..."""
import sys
from PIL import Image
out, k, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert('RGBA') for f in files]
W = sum(i.width + 2 for i in ims); H = max(i.height for i in ims)
bg = Image.new('RGBA', (W, H))
for y in range(H):
    for x in range(W):
        bg.putpixel((x, y), (200, 200, 200, 255) if ((x // 4 + y // 4) % 2) else (150, 160, 150, 255))
x = 0
for i in ims:
    bg.alpha_composite(i, (x, 0)); x += i.width + 2
bg.resize((W * k, H * k), Image.NEAREST).save(out)
