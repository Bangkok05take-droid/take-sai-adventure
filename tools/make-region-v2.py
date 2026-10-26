# 3マスの高さの壁の描き方（v2）の地域の部品を、届いた素材から写す（加工しない）：python3 -I tools/make-region-v2.py <地域> <素材のフォルダ>
#   設定：tools/region-v2/<地域>.json（out＝assets/dungeon/ の下のフォルダ名、files＝{ゲームの名前: 素材の中の場所}、
#         e4・e5＝edge_fit・ends_fit の部品のフォルダ（あれば。中のPNGをそのまま e4/・e5/ へ））
#   ゲームの名前は js/assets.js の regionV2 の説明のとおり（floor_0・壁の部品名・rimE・rimW・rimN・jInNE・jInNW）。
#   写したら js/assets.js の dungeon に regionV2('<out>', {...}) を足し、js/data.js の D.DUNGEON_ART.<地域> を 'v2' にするとその地域で使う
import json, os, shutil, sys
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
region, src = sys.argv[1], sys.argv[2]
C = json.load(open(os.path.join(ROOT, 'tools/region-v2', region + '.json')))
out = os.path.join(ROOT, 'assets/dungeon', C['out']); os.makedirs(out, exist_ok=True)
for name, rel in C['files'].items():
  p = os.path.join(src, rel); im = Image.open(p)
  w, h = im.size
  if name == 'floor_0': assert (w, h) == (128, 128), (rel, im.size)
  elif name in C.get('walls', {}): assert h == 96 and w % 32 == 0, (rel, im.size)
  shutil.copyfile(p, os.path.join(out, name + '.png')); print(name, '<-', rel, im.size)
for k in ('e4', 'e5'):
  if C.get(k):
    d = os.path.join(out, k); os.makedirs(d, exist_ok=True)
    for f in os.listdir(os.path.join(src, C[k])):
      if f.endswith('.png'): shutil.copyfile(os.path.join(src, C[k], f), os.path.join(d, f))
    print(k, 'copied')
