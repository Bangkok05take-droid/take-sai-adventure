# 通常ダンジョンの地域の背景（ZIP dungeon_7themes_art_v1。ChatGPT制作の素材原画。描き直しはしない）：python3 -I tools/make-dungeon-art.py [地域…]
# 元の原画：assets/reference/dungeon-7themes-v1/sheets/（原寸・無加工で保存）。ゲーム用に切り出して縮めたものを assets/dungeon/<地域>/ へ
#  ・床：原画の上の段の床4枚のうち3枚（柄違い）を、ふちの縁取りを落として内側だけ切り出し、64×64（ゲームの2×2マス）に縮める → floor_0〜2.png
#      4枚目の飾り床（モザイク）も同じ大きさに → floor_deco.png（今は使っていない）
#  ・壁：2段目の横長の壁2枚（アーチ2つ・たいまつ左／右）を、64×64（2マス幅・2マス高。下の1マスが壁の正面、上の1マスが壁の上の段）に縮める → wall_0〜1.png
#      縦横の比を変えないよう、幅64に合わせて縮め、下ぞろえ（上の足りない分は透明＝今の壁の上面の絵が見える）
#  ・1マス幅の壁：2段目の細い壁2枚（アーチ1つ）を 32×64（1マス幅・2マス高）に → narrow_0〜1.png
#  ・3段目の斜めの角・4段目の飾り（柱・火鉢・アーチ・がれき）は、今は使わない（docs/DUNGEON_ART_V1.md）
# 切り出しの位置は、原画の不透明な部分の帯から（下の SHEETS）。地域ごとに原画の並びが違えば、ここで直す
import os, sys
from PIL import Image, ImageEnhance
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/dungeon-7themes-v1/sheets/')
OUT = os.path.join(ROOT, 'assets/dungeon/')
SHEETS = {
  'brick': {'file': '01_brick.png',
            # 床：(左, 上, 右, 下)。ふちの縁取り（約12px）を落とした内側
            'floor': [(53, 58, 296, 293), (355, 58, 598, 293), (659, 58, 902, 293)], 'deco': (960, 58, 1204, 293),
            # 壁：アーチ2つの横長の壁（たいまつ左・右）。原画の不透明な範囲
            'wall': [(40, 327, 311, 566), (341, 327, 611, 566)],
            # 1マス幅の壁：アーチ1つの細い壁（たいまつ左・右）。壁が奇数マスで終わる所・1マスだけの壁に使う
            'narrow': [(678, 327, 867, 566), (1000, 327, 1188, 566)]},
}
def build(theme):
  S = SHEETS[theme]; im = Image.open(SRC + S['file']).convert('RGBA')
  od = OUT + theme + '/'; os.makedirs(od, exist_ok=True)
  for i, box in enumerate(S['floor']):
    # 床は少し明るく・色を少し抑える（原画のままだと今の床より暗く、敵や赤い予告のマスが沈むため）
    f = im.crop(box).resize((64, 64), Image.LANCZOS)
    f = ImageEnhance.Color(ImageEnhance.Brightness(f).enhance(S.get('floorBright', 1.2))).enhance(0.85)
    f.save(od + 'floor_%d.png' % i, optimize=True)
  im.crop(S['deco']).resize((64, 64), Image.LANCZOS).save(od + 'floor_deco.png', optimize=True)
  for i, box in enumerate(S['wall']):
    w = im.crop(box); h = round(w.height * 64 / w.width)
    w = w.resize((64, h), Image.LANCZOS)
    cv = Image.new('RGBA', (64, 64), (0, 0, 0, 0)); cv.alpha_composite(w, (0, 64 - h))
    # 原画のふちの赤いにじみ（透明に近い画素）を消す
    px = cv.load()
    for y in range(64):
      for x in range(64):
        r, g, b, a = px[x, y]
        if a < 160: px[x, y] = (0, 0, 0, 0)
    cv.save(od + 'wall_%d.png' % i, optimize=True)
  for i, box in enumerate(S.get('narrow', [])):   # 1マス幅：幅32に合わせて縮め、32×64 に下ぞろえ
    w = im.crop(box); h = min(64, round(w.height * 32 / w.width))
    w = w.resize((32, h), Image.LANCZOS)
    cv = Image.new('RGBA', (32, 64), (0, 0, 0, 0)); cv.alpha_composite(w, (0, 64 - h))
    px = cv.load()
    for y in range(64):
      for x in range(32):
        if px[x, y][3] < 160: px[x, y] = (0, 0, 0, 0)
    cv.save(od + 'narrow_%d.png' % i, optimize=True)
  print(theme, 'ok')
for t in (sys.argv[1:] or SHEETS.keys()): build(t)
