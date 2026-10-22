# 地下の遺跡の奥行き（ZIP ruins_depth_v1。ChatGPT制作。描き直しはしない）：python3 -I tools/make-ruins-depth.py
# 元の素材：assets/reference/ruins-depth-v1/（README は CLAUDE_README.md、目標の絵 approved_concept.png）。ゲーム用を assets/dungeon/ruins/ へ
#  ・cavern.png：岩盤と霧の背景 512×512 をそのまま（画面では 256×256＝8×8マスに縮めて（D.DUNGEON_CAVERN_SIZE）地図に固定してくり返す。js/render.js）
#  ・foundation.png：床の端から下へ伸びる正面の外壁 256×344 → 64×86（2マス幅・約2.7マス高）。下の4分の1を少しずつ透明に（霧になじませる）
#  ・pillar.png：支柱 81×640 → 16×128（4マス高）。上端を床の端にそろえる。下の4分の1を少しずつ透明に
import os
from PIL import Image, ImageEnhance
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/ruins-depth-v1/assets/')
OUT = os.path.join(ROOT, 'assets/dungeon/ruins/')
def fade(im, frac=0.25):
  px = im.load(); h = im.height; f0 = int(h * (1 - frac))
  for y in range(f0, h):
    k = 1 - (y - f0) / (h - f0)
    for x in range(im.width):
      r, g, b, a = px[x, y]; px[x, y] = (r, g, b, int(a * k))
  return im
Image.open(SRC + 'cavern_background_512.png').convert('RGB').save(OUT + 'cavern.png', optimize=True)
# 外壁・支柱は床より暗く（岩盤より少し明るく）：明るさ 0.62（仮。実画面で決めた値）
dim = lambda im, k=0.62: ImageEnhance.Brightness(im).enhance(k)
fade(dim(Image.open(SRC + 'foundation_wall.png').convert('RGBA').resize((64, 86), Image.LANCZOS))).save(OUT + 'foundation.png', optimize=True)
fade(dim(Image.open(SRC + 'support_pillar.png').convert('RGBA').resize((16, 128), Image.LANCZOS))).save(OUT + 'pillar.png', optimize=True)
print('ok')
