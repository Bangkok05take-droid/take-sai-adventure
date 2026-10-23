# 封印の最深部（26〜29階）・大魔王の城（31〜34階）の床と壁（ZIP dungeon_part3 ＝ late_dungeons_v1。ChatGPT制作。描き直しはしない）
#   python3 -I tools/make-late-dungeons.py → assets/dungeon/<gold|demon>/
# 元の素材：assets/reference/late-dungeons-v1/（README・manifest。assets/ は切り出し済み）。今回は床・基本の壁・縁だけ（optional の装飾は使わない）
#  ・floor_0：floor.png 256→64（2×2マス）。地域ごとに1種類
#  ・top_0：wall_top.png 256→64（壁の上面）
#  ・wall_0：wall_front.png 256→64（2マス幅・2マス高。下の1マスが壁の正面、上の1マスがその上の段）／narrow_0：wall_narrow.png 128×256→32×64
#  ・rimW：rim_vertical_strip（左に縁）12×128→3×32 を縦に2つ＝3×64。rimE はその左右反転。rimN：rim_horizontal_strip（上に縁）128×12→32×3 を横に2つ＝64×3
#  ・joint：縁の帯の端 3×3（外角・内角の小さな四角。専用の角の絵は今回なし）
import os
from PIL import Image, ImageOps
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/late-dungeons-v1/')
for theme, d in (('gold', '06_sealed_depths'), ('demon', '07_demon_castle')):
  a = SRC + d + '/assets/'; od = os.path.join(ROOT, 'assets/dungeon', theme) + '/'; os.makedirs(od, exist_ok=True)
  L = lambda n: Image.open(a + n + '.png').convert('RGBA')
  L('floor').resize((64, 64), Image.LANCZOS).save(od + 'floor_0.png', optimize=True)
  L('wall_top').resize((64, 64), Image.LANCZOS).save(od + 'top_0.png', optimize=True)
  L('wall_front').resize((64, 64), Image.LANCZOS).save(od + 'wall_0.png', optimize=True)
  L('wall_narrow').resize((32, 64), Image.LANCZOS).save(od + 'narrow_0.png', optimize=True)
  v = L('rim_vertical_strip').resize((3, 32), Image.LANCZOS); h = L('rim_horizontal_strip').resize((32, 3), Image.LANCZOS)
  rv = Image.new('RGBA', (3, 64)); rv.paste(v, (0, 0)); rv.paste(v, (0, 32)); rv.save(od + 'rimW.png', optimize=True)
  ImageOps.mirror(rv).save(od + 'rimE.png', optimize=True)
  rh = Image.new('RGBA', (64, 3)); rh.paste(h, (0, 0)); rh.paste(h, (32, 0)); rh.save(od + 'rimN.png', optimize=True)
  v.crop((0, 0, 3, 3)).save(od + 'joint.png', optimize=True)
  print(theme, 'ok')
