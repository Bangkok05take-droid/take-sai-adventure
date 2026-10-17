# 30階・玉座の間の素材を作る：python3 tools/make-throne-room.py
# 元の素材（ChatGPT制作。描き直しはしない）：assets/reference/throne-room-v1/
#   throne-room.png … 部屋全体（1024×1536、透過なし）→ assets/rooms/throne-room.webp（同じ大きさ。圧縮だけ）
#   time-crack.png  … 時空の亀裂（透過あり）→ 透明な余白を切り落として高さ768に縮小 → assets/rooms/time-crack.png
#   throne.png      … 玉座の単体。部屋の絵に玉座が描かれているので、ゲームでは使わない（二重に出さない。パーツで組むとき用に保管）
from PIL import Image
import numpy as np
SRC = 'assets/reference/throne-room-v1/'
bg = Image.open(SRC + 'throne-room.png').convert('RGB')
bg.save('assets/rooms/throne-room.webp', 'WEBP', quality=92, method=6)
cr = Image.open(SRC + 'time-crack.png').convert('RGBA')
a = np.array(cr.getchannel('A'))
ys, xs = np.where(a > 8)
m = 8
box = (max(0, xs.min() - m), max(0, ys.min() - m), min(cr.width, xs.max() + 1 + m), min(cr.height, ys.max() + 1 + m))
cr = cr.crop(box)
h = 768
cr = cr.resize((round(cr.width * h / cr.height), h), Image.LANCZOS)
cr.save('assets/rooms/time-crack.png', optimize=True)
print('bg', bg.size, 'crack box', box, '->', cr.size)
