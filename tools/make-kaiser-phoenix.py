# 大魔王バーンの「カイザーフェニックス」の絵を作る：python3 tools/make-kaiser-phoenix.py
# 元の素材（ChatGPT制作。描き直しはしない）：assets/reference/kaiser-phoenix-v1/kaiser-phoenix.png（下向きに飛ぶ火の鳥、透過あり）
# → 透明な余白を切り落とし、長い辺を320pxに縮小 → assets/fx/kaiser-phoenix.png（透過はそのまま。向きは下向きのまま。回転はゲームで行う）
from PIL import Image
import numpy as np
im = Image.open('assets/reference/kaiser-phoenix-v1/kaiser-phoenix.png').convert('RGBA')
a = np.array(im.getchannel('A'))
print('size', im.size, 'transparent', round(float((a == 0).mean()), 3), 'corners', [int(a[0, 0]), int(a[0, -1]), int(a[-1, 0]), int(a[-1, -1])])
ys, xs = np.where(a > 8)
m = 6
box = (max(0, xs.min() - m), max(0, ys.min() - m), min(im.width, xs.max() + 1 + m), min(im.height, ys.max() + 1 + m))
im = im.crop(box)
s = 320 / max(im.size)
im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
im.save('assets/fx/kaiser-phoenix.png', optimize=True)
print('box', box, '->', im.size)
