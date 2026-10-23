# レンガの回廊・木の根の遺跡の奥行き（ZIP early_depth_v1。ChatGPT制作。描き直しはしない）：python3 -I tools/make-early-depth.py
# 元の素材：assets/reference/early-depth-v1/（README.md・manifest.json・各地域の approved_concept.png）。ゲーム用を assets/dungeon/<地域>/ へ
#  ・cavern.png：背景 512×512 をそのまま（画面では 128×128＝4×4マス。js/render.js）。そのまま並べると上下左右の継ぎ目が目立たず、
#    反転して並べると左右対称の模様が目立ったので、反転はしない（docs/early-depth-v1/seams_*.png）
#  ・foundation.png：正面の外壁 256×384 → 64×96（2×3マス）。床より暗く（明るさ BRIGHT）、下の4分の1を少しずつ透明に（背景になじませる）。反転はしない
#  ・pillar.png：支柱 → 高さ128（4マス）・縦横比そのまま。外壁と同じ明るさ。下の4分の1を少しずつ透明に
#  ・hang_0〜1.png：控えめの飾り（レンガ：旗・松明、木の根：根・ランタン）→ 高さ64（2マス）。外壁の上端から下げる
import os
from PIL import Image, ImageEnhance
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/early-depth-v1/')
SETS = {'brick': {'dir': '01_brick', 'bright': 0.6, 'hang': ['optional_banner', 'optional_torch']},
        'roots': {'dir': '02_roots', 'bright': 0.75, 'hang': ['optional_roots', 'optional_lantern']}}
def fade(im, frac=0.25):
  px = im.load(); h = im.height; f0 = int(h * (1 - frac))
  for y in range(f0, h):
    k = 1 - (y - f0) / (h - f0)
    for x in range(im.width):
      r, g, b, a = px[x, y]; px[x, y] = (r, g, b, int(a * k))
  return im
def to_h(im, h): return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)
for theme, C in SETS.items():
  a = SRC + C['dir'] + '/assets/'; od = os.path.join(ROOT, 'assets/dungeon', theme) + '/'
  dim = lambda im: ImageEnhance.Brightness(im).enhance(C['bright'])
  Image.open(a + 'background.png').convert('RGB').save(od + 'cavern.png', optimize=True)
  fade(dim(Image.open(a + 'foundation_wall.png').convert('RGBA').resize((64, 96), Image.LANCZOS))).save(od + 'foundation.png', optimize=True)
  fade(dim(to_h(Image.open(a + 'support_pillar.png').convert('RGBA'), 128))).save(od + 'pillar.png', optimize=True)
  for i, n in enumerate(C['hang']):
    to_h(Image.open(a + n + '.png').convert('RGBA'), 64).save(od + 'hang_%d.png' % i, optimize=True)
  print(theme, 'ok')
