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
# 追加の原画（真上から見た形。2026年10月21日）：assets/reference/dungeon-7themes-v1/<地域>-extra-v1/
#  brick_parts.png：1段目 床4枚・2段目 壁の上面4枚（各約246px＝2×2マス）・3段目 縁（右に縁・左に縁＝1マス幅2マス高、上に縁＝2マス幅）・4段目 角
#  brick_inner_corners.png：内角（L字）4枚。今は使っていない（角は縁の継ぎ目の小さな四角で足りるため。docs/DUNGEON_ART_V1.md）
#  ・壁の上面 top_0〜3：内側を切り出して 64×64（2×2マス）
#  ・縁の帯：原画の縁（明るい石＋外側の影、約37px＝ゲームで約10ドット）だけを切り出す。rimW（左に床）10×64、rimE（右に床）10×64、rimN（上に床）64×10
#  ・継ぎ目 joint：角の部品の、縁が直角に曲がる所の四角 10×10（斜めにだけ床がある壁の角・2方向の縁が出会う所に重ねる）
EXTRA = {
  'brick': {'dir': 'brick-extra-v1/', 'file': 'brick_parts.png',
            'top': [(51, 341, 285, 573), (345, 341, 578, 573), (640, 341, 873, 573), (932, 341, 1166, 573)],
            'rimW': (459, 628, 496, 864), 'rimE': (132, 628, 169, 864), 'rimN': (636, 757, 878, 794),
            'joint': (731, 1009, 768, 1046)},
}
# 第1回の追加原画（ZIP dungeon_part1 ＝ dungeon_batch1_roots_ruins_v2。2026年10月22日）：assets/reference/dungeon-batch1-v2/<番号_地域>/topdown_supplement_source.png
#  4段×4セル（1マス＝約137px）。1段目 床2枚・上面2枚（2×2マス）。2段目 縁（壁が左＝右に縁／壁が右＝左に縁／下に縁／上に縁）。3段目 外角。4段目 内角（L字）
#  ・床 floor_0〜1・上面 top_0〜1：セルのふちの線（約6px）を落として 64×64（2×2マス）
#  ・縁 rimE（右に床）・rimW（左に床）・rimN（上に床）：2段目の縁の帯（明るい石＋内側の影）だけ。幅は原画 RW px → ゲームで round(RW*32/137)
#    「下に縁」（下に床）はこのゲームでは壁の正面（前回の原画の正面の壁）が受け持つので使わない
#  ・角の四角（RW×RW）：jOutNE・jOutNW＝外角（上と右／上と左に床）。jInNE・jInNW・jInSE・jInSW＝内角（斜めだけ床。4段目のL字の曲がり角）
#    切り出しは、各セルの透明な所（床の側）の角から RW の正方形
#  ・正面の壁：前回の原画（sheets/02_roots.png・03_ruins.png）2段目の4枚を 64×64（2マス幅）。1マス幅の細い壁は原画に無いので、
#    2マス幅の絵の左右の柱の部分（左右16pxずつ）をつないだ 32×64（仮。原画の切り貼りで、描き足しはしていない）
#  ・地下の遺跡の奥（ruins_deep、11〜14階）は同じ絵（assets/dungeon/ruins/）を使う（js/assets.js）
BATCH1 = {
  'roots': {'dir': 'dungeon-batch1-v2/02_roots/', 'RW': 33, 'sheet': '02_roots.png',
            'floor': [(31, 25, 300, 291), (349, 25, 619, 293)], 'top': [(666, 25, 939, 293), (986, 25, 1257, 293)],
            'rimE': (135, 329, 168, 599), 'rimW': (480, 329, 513, 599), 'rimN': (985, 450, 1257, 483),
            'jOutNE': (780, 738), 'jOutNW': (1113, 738), 'jInNE': (780, 1027), 'jInNW': (1113, 1027), 'jInSE': (136, 1014), 'jInSW': (480, 1014),
            'wall': [(30, 329, 298, 524), (338, 331, 609, 524), (647, 332, 916, 524), (956, 330, 1225, 527)]},
  'ruins': {'dir': 'dungeon-batch1-v2/03_ruins/', 'RW': 37, 'sheet': '03_ruins.png',
            'floor': [(22, 22, 292, 291), (336, 22, 605, 291)], 'top': [(649, 22, 918, 291), (963, 22, 1232, 291)],
            'rimE': (123, 334, 160, 605), 'rimW': (466, 334, 503, 605), 'rimN': (963, 459, 1232, 496),
            'jOutNE': (770, 740), 'jOutNW': (1075, 740), 'jInNE': (749, 1072), 'jInNW': (1095, 1072), 'jInSE': (131, 1059), 'jInSW': (460, 1059),
            'wall': [(34, 343, 316, 549), (338, 343, 616, 549), (641, 343, 919, 549), (943, 343, 1224, 549)]},
}
def clean_alpha(cv):
  px = cv.load()
  for y in range(cv.height):
    for x in range(cv.width):
      if px[x, y][3] < 160: px[x, y] = (0, 0, 0, 0)
  return cv
def build_batch1(theme):
  B = BATCH1[theme]; od = OUT + theme + '/'; os.makedirs(od, exist_ok=True)
  im = Image.open(SRC + '../../' + B['dir'] + 'topdown_supplement_source.png').convert('RGBA')
  RW = B['RW']; rw = round(RW * 32 / 137); ins = 6
  for k in ('floor', 'top'):
    for i, (x0, y0, x1, y1) in enumerate(B[k]):
      im.crop((x0 + ins, y0 + ins, x1 - ins, y1 - ins)).resize((64, 64), Image.LANCZOS).save(od + '%s_%d.png' % (k, i), optimize=True)
  im.crop(B['rimE']).resize((rw, 64), Image.LANCZOS).save(od + 'rimE.png', optimize=True)
  im.crop(B['rimW']).resize((rw, 64), Image.LANCZOS).save(od + 'rimW.png', optimize=True)
  im.crop(B['rimN']).resize((64, rw), Image.LANCZOS).save(od + 'rimN.png', optimize=True)
  for k in ('jOutNE', 'jOutNW', 'jInNE', 'jInNW', 'jInSE', 'jInSW'):
    x, y = B[k]; im.crop((x, y, x + RW, y + RW)).resize((rw, rw), Image.LANCZOS).save(od + k + '.png', optimize=True)
  sh = Image.open(SRC + B['sheet']).convert('RGBA')
  for i, box in enumerate(B['wall']):
    w = sh.crop(box); h = round(w.height * 64 / w.width); w = w.resize((64, h), Image.LANCZOS)
    cv = Image.new('RGBA', (64, 64), (0, 0, 0, 0)); cv.alpha_composite(w, (0, 64 - h)); clean_alpha(cv).save(od + 'wall_%d.png' % i, optimize=True)
    if i < 2:   # 細い壁（仮）：左右の柱の部分をつなぐ
      nv = Image.new('RGBA', (32, 64), (0, 0, 0, 0)); nv.alpha_composite(cv.crop((0, 0, 16, 64)), (0, 0)); nv.alpha_composite(cv.crop((48, 0, 64, 64)), (16, 0))
      nv.save(od + 'narrow_%d.png' % i, optimize=True)
  build_deco(theme)
  print(theme, 'ok (rim %dpx)' % rw)

# 飾り（2026年10月22日に置き方が決まった：案1と案2を控えめに併用。通路や敵を隠さない）：前回の原画の4段目
#  ・decoWall（柱・灯り。地下の遺跡は崩れた浮き彫りも）。アーチは通れる入口に見えるので使わない：64×64（2マス幅・2マス高。正面の壁の絵と同じ置き方）の下ぞろえ・左右中央。
#    正面の壁の2マス分の上に重ねる（壁のマスの中だけ。床には出ない）。高さは柱58・灯り50・浮き彫り48まで（幅60まで）
#  ・decoTop_0（がれき）：32×32 の中央に26×26まで。部屋から離れた壁の上面に、ときどき
DECO = {
  'brick': {'sheet': '01_brick.png', 'wall': [(82, 881, 250, 1201), (375, 890, 520, 1206)], 'top': (944, 953, 1217, 1191)},
  'roots': {'sheet': '02_roots.png', 'wall': [(25, 838, 320, 1223), (388, 835, 557, 1210)], 'top': (945, 930, 1233, 1182)},
  'ruins': {'sheet': '03_ruins.png', 'wall': [(81, 893, 255, 1195), (378, 900, 560, 1191), (644, 911, 910, 1203)], 'top': (961, 972, 1216, 1197)},
}
def fit(img, mw, mh):
  k = min(mw / img.width, mh / img.height); return img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
def build_deco(theme):
  B = DECO.get(theme)
  if not B: return
  od = OUT + theme + '/'; sh = Image.open(SRC + B['sheet']).convert('RGBA')
  for f in os.listdir(od):
    if f.startswith('decoWall_'): os.remove(od + f)
  for i, (box, mh) in enumerate(zip(B['wall'], (58, 50, 48))):
    d = fit(sh.crop(box), 60, mh); cv = Image.new('RGBA', (64, 64), (0, 0, 0, 0)); cv.alpha_composite(d, ((64 - d.width) // 2, 63 - d.height))
    clean_alpha(cv).save(od + 'decoWall_%d.png' % i, optimize=True)
  d = fit(sh.crop(B['top']), 26, 26); cv = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); cv.alpha_composite(d, ((32 - d.width) // 2, (32 - d.height) // 2))
  clean_alpha(cv).save(od + 'decoTop_0.png', optimize=True)

def build_extra(theme):
  X = EXTRA.get(theme)
  if not X: return
  im = Image.open(SRC + '../' + X['dir'] + X['file']).convert('RGBA'); od = OUT + theme + '/'
  for i, box in enumerate(X['top']):
    im.crop(box).resize((64, 64), Image.LANCZOS).save(od + 'top_%d.png' % i, optimize=True)
  im.crop(X['rimW']).resize((10, 64), Image.LANCZOS).save(od + 'rimW.png', optimize=True)
  im.crop(X['rimE']).resize((10, 64), Image.LANCZOS).save(od + 'rimE.png', optimize=True)
  im.crop(X['rimN']).resize((64, 10), Image.LANCZOS).save(od + 'rimN.png', optimize=True)
  im.crop(X['joint']).resize((10, 10), Image.LANCZOS).save(od + 'joint.png', optimize=True)

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
  build_extra(theme)
  build_deco(theme)
  print(theme, 'ok')
for t in (sys.argv[1:] or list(SHEETS.keys()) + list(BATCH1.keys())): build_batch1(t) if t in BATCH1 else build(t)
