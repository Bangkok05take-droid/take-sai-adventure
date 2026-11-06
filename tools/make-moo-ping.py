# 「甘いムーピン」の絵（2026年11月。いただいた絵 assets/reference/moo-ping/moo_ping_source.png。描き直しはしない）：python3 -I tools/make-moo-ping.py
# 道具の一覧用 48×48（assets/items-v2/moo_ping.png）。ほかの道具の絵と同じく、絵の部分を切り出して縦横の長い方を 42 ドットにし、中央に置く。
# 床に置いたときの 32×32 は tools/make-items-v2-floor.py で作る（ほかの道具と同じ縮め方）
import os
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = Image.open(os.path.join(ROOT, 'assets/reference/moo-ping/moo_ping_source.png')).convert('RGBA')
a = np.array(src); a[a[:, :, 3] <= 40] = 0   # ほぼ透明なかすかな点は消す
src = Image.fromarray(a)
src = src.crop(src.getchannel('A').getbbox())
k = 42 / max(src.size)
im = src.resize((max(1, round(src.width * k)), max(1, round(src.height * k))), Image.LANCZOS)
cv = Image.new('RGBA', (48, 48), (0, 0, 0, 0))
cv.alpha_composite(im, ((48 - im.width) // 2, (48 - im.height) // 2))
cv.save(os.path.join(ROOT, 'assets/items-v2/moo_ping.png'), optimize=True)
print('moo_ping.png', im.size)
