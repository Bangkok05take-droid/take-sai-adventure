# 隠しダンジョンの強敵6種の絵を作る：python3 tools/make-strong-enemies.py
# 元の素材（ChatGPT制作、透過PNG。描き直しはしない）：assets/reference/strong-enemies-v1/<名前>.png
# → 透明な余白を切り、縦横比を保って縮小し、敵の絵の枠（64×64・足の裏 y=60・足元の中央 x=32。js/assets.js の enemyBox）の
#   3倍の細かさ（192×192・足の裏 y=180・中央 x=96）に置く → assets/enemies/<名前>.png（1コマ。歩きのコマは無い）
# 大きさ（枠の中の高さ・幅の上限。1マス＝32）：隣のマスの敵や道具を隠しすぎないよう、幅は約1.4マスまで
from PIL import Image
import numpy as np
SCALE = 3
SIZES = {   # 名前: (高さの上限, 幅の上限)  ※枠の単位（1マス＝32）
    'dragon': (46, 46), 'silverdevil': (42, 44), 'gigantes': (48, 44),
    'bombrock': (34, 38), 'mimic': (36, 40), 'madhand': (38, 40),
}
for name, (H, W) in SIZES.items():
    im = Image.open('assets/reference/strong-enemies-v1/%s.png' % name).convert('RGBA')
    a = np.array(im.getchannel('A'))
    ys, xs = np.where(a > 16)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    s = min(H * SCALE / im.height, W * SCALE / im.width)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    c = Image.new('RGBA', (64 * SCALE, 64 * SCALE), (0, 0, 0, 0))
    c.alpha_composite(im, (32 * SCALE - im.width // 2, 60 * SCALE - im.height))
    c.save('assets/enemies/%s.png' % name, optimize=True)
    print(name, 'size in box', round(im.width / SCALE, 1), 'x', round(im.height / SCALE, 1))
