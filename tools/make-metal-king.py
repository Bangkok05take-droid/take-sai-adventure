# メタルキング（レア敵）とイオナズンの絵（2026年11月17日。ChatGPT制作の素材 assets/reference/metal-king-v1/。描き直しはしない）：python3 -I tools/make-metal-king.py
#  ・metal_king.png → assets/enemies/mking.png：隠しダンジョンの強敵と同じ枠（64×64・足の裏 y=60・中央 x=32）の3倍（192×192）。
#    表示は約2×2マス（高さ58・幅62ドットまで）。当たり判定・移動は1マスのまま（js/assets.js の enemyArtScale）
#  ・iona_sheet.png（横3列×縦2段の6コマ、1コマ 512×512）→ assets/fx/iona/iona_0〜5.png（上段の左→右、下段の左→右の順）。
#    どのコマも同じ 512 の枠のまま 256×256 に縮める（爆発が広がっていく大きさの違いを保つ）。ほぼ透明なかすかな点（透明度8以下）は消す
import os
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
P = lambda *a: os.path.join(ROOT, *a)
S = 3
im = Image.open(P('assets/reference/metal-king-v1/metal_king.png')).convert('RGBA')
a = np.array(im); a[a[:, :, 3] <= 16] = 0; im = Image.fromarray(a)
im = im.crop(im.getchannel('A').getbbox())
k = min(58 * S / im.height, 62 * S / im.width)
im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
c = Image.new('RGBA', (64 * S, 64 * S), (0, 0, 0, 0))
c.alpha_composite(im, (32 * S - im.width // 2, 60 * S - im.height))
c.save(P('assets/enemies/mking.png'), optimize=True)
print('mking', round(im.width / S, 1), 'x', round(im.height / S, 1))
sh = Image.open(P('assets/reference/metal-king-v1/iona_sheet.png')).convert('RGBA')
cw, ch = sh.width // 3, sh.height // 2
for i in range(6):
    r, col = divmod(i, 3)
    cell = sh.crop((col * cw, r * ch, (col + 1) * cw, (r + 1) * ch))
    a = np.array(cell); a[a[:, :, 3] <= 8] = 0
    # 枠の外周 6px は必ず透明に（隣のコマのにじみが入らないように）
    a[:6, :, 3] = 0; a[-6:, :, 3] = 0; a[:, :6, 3] = 0; a[:, -6:, 3] = 0
    Image.fromarray(a).resize((256, 256), Image.LANCZOS).save(P('assets/fx/iona/iona_%d.png' % i), optimize=True)
print('iona frames 6')
