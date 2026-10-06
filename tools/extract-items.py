"""デザイン見本「冒険の道具」（assets/reference/items.png）から道具のアイコンを作る。
  python3 tools/extract-items.py
- 見本の1ドット＝約5ピクセル。格子を推定して1ドット＝1ピクセルに戻す。
- 濃い青緑の背景を外周から塗りつぶして透明にし、四隅の飾りのかけらは捨てる。名前の文字は切り抜かない。
- 一覧用：48×48（元の細かさのまま。大きいものだけ縮める）。床に置いた状態用：32×32（縮めたあと輪郭線を付け直す）。
- 同じ形で色違いの道具（剣・盾・巻物など）は、色相を置きかえて作る。"""
import os, sys, colorsys
from collections import deque
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import pixelgrid as pg

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'assets', 'items')
XS = [8, 318, 630, 940, 1248]; YS = [108, 388, 668, 948, 1228]
NAMES = [['sword', 'shield', 'robe', 'necklace'], ['staff', 'king_staff', 'scroll', 'powder'],
         ['herb', 'sleepgrass', 'bento', 'soup'], ['coin', 'ore', 'orb', 'plan']]


def is_bg(c):
    r, g, b = [int(v) for v in c]
    return max(r, g, b) < 80 and g >= r + 8 and b >= r + 8 and abs(g - b) < 22


def cutout(a):
    h, w = a.shape[:2]
    alpha = np.full((h, w), 255, np.uint8); seen = np.zeros((h, w), bool); q = deque()
    for x in range(w): q += [(0, x), (h - 1, x)]
    for y in range(h): q += [(y, 0), (y, w - 1)]
    while q:
        y, x = q.popleft()
        if y < 0 or y >= h or x < 0 or x >= w or seen[y, x]: continue
        seen[y, x] = True
        if not is_bg(a[y, x]): continue
        alpha[y, x] = 0; q.extend([(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)])
    # 背景に囲まれた内側の背景色（鍋の取っ手の内側など）も消す
    for y in range(h):
        for x in range(w):
            if alpha[y, x] and is_bg(a[y, x]): alpha[y, x] = 0
    lab = np.zeros((h, w), int); sizes = {}; n = 0
    for y in range(h):
        for x in range(w):
            if alpha[y, x] and not lab[y, x]:
                n += 1; st = [(y, x)]; lab[y, x] = n; cnt = 0
                while st:
                    cy, cx = st.pop(); cnt += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            yy, xx = cy + dy, cx + dx
                            if 0 <= yy < h and 0 <= xx < w and alpha[yy, xx] and not lab[yy, xx]:
                                lab[yy, xx] = n; st.append((yy, xx))
                sizes[n] = cnt
    big = max(sizes.values())
    keep = {k for k, v in sizes.items() if v >= big * 0.04}
    for y in range(h):
        for x in range(w):
            if lab[y, x] not in keep: alpha[y, x] = 0
    rgba = np.dstack([a, alpha])
    ys, xs = np.nonzero(alpha)
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def fit(rgba, size, outline):
    im = Image.fromarray(rgba, 'RGBA')
    pad = 1 if outline else 0
    k = min(1.0, (size - 2 * pad) / max(im.width, im.height))
    if k < 1:
        # 色は面積平均、形は不透明度のしきい値で決める（にじみを残さない）
        w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
        a = np.asarray(im).astype(np.float64)
        pre = a.copy(); pre[:, :, :3] *= a[:, :, 3:4] / 255
        sm = np.asarray(Image.fromarray(pre.clip(0, 255).astype(np.uint8), 'RGBA').resize((w, h), Image.BOX)).astype(np.float64)
        al = sm[:, :, 3:4]
        col = np.where(al > 0, sm[:, :, :3] * 255 / np.maximum(al, 1), 0)
        out = np.dstack([col, np.where(al[:, :, 0] > 110, 255, 0)]).clip(0, 255).astype(np.uint8)
        im = Image.fromarray(out, 'RGBA')
    c = Image.new('RGBA', (size, size))
    c.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    if outline:
        a = np.asarray(c).copy(); al = a[:, :, 3] > 0
        ring = np.zeros_like(al)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ring |= np.roll(np.roll(al, dy, 0), dx, 1)
        ring &= ~al
        a[ring] = (24, 14, 10, 255)
        c = Image.fromarray(a, 'RGBA')
    return c


def hue_map(rgba, sel, fn):
    """sel(h,s,v) が真の画素の色を fn(h,s,v)->(h,s,v) で置きかえる。"""
    a = rgba.copy()
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if not a[y, x, 3]: continue
            r, g, b = a[y, x, :3] / 255.0
            h, s, v = colorsys.rgb_to_hsv(r, g, b)
            if sel(h, s, v):
                h2, s2, v2 = fn(h, s, v)
                a[y, x, :3] = [round(c * 255) for c in colorsys.hsv_to_rgb(h2 % 1, min(1, max(0, s2)), min(1, max(0, v2)))]
    return a


grey = lambda h, s, v: s < 0.22 and v > 0.35          # 刃・金属
blue = lambda h, s, v: 0.55 < h < 0.72 and s > 0.35    # 盾の青
teal = lambda h, s, v: 0.42 < h < 0.56 and s > 0.3     # 宝石・巻物の印
red = lambda h, s, v: (h < 0.04 or h > 0.93) and s > 0.45
cyanish = lambda h, s, v: 0.5 < h < 0.7 and s > 0.2


def tint_to(hue, sat=None, val=1.0):
    return lambda h, s, v: (hue, s if sat is None else sat, v * val)


def metal(hue, sat, val=1.0):
    return lambda h, s, v: (hue, sat, min(1, v * val))


def variants(base):
    """（出力名, 元の形, 変換）。元の道具の色分け（tint）に合わせる。"""
    V = []
    sw = base['sword']
    V += [('sword', sw, None), ('sword_iron', sw, None), ('sword_steel', sw, (grey, metal(0.58, 0.08, 1.12))),
          ('sword_copper', sw, (grey, metal(0.07, 0.55, 0.95))), ('sword_wood', sw, (grey, metal(0.08, 0.55, 0.62))),
          ('sword_jade', sw, (grey, metal(0.38, 0.45, 0.95))), ('sword_crystal', sw, (grey, metal(0.52, 0.35, 1.15))),
          ('sword_gold', sw, (grey, metal(0.12, 0.65, 1.05))), ('sword_frost', sw, (grey, metal(0.55, 0.45, 1.1))),
          ('sword_dragon', sw, (grey, metal(0.0, 0.55, 0.9))), ('sword_hero', sw, (grey, metal(0.6, 0.3, 1.15)))]
    sh = base['shield']
    V += [('shield_hero', sh, None), ('shield', sh, None),
          ('shield_wood', sh, (blue, metal(0.07, 0.6, 0.75))), ('shield_iron', sh, (blue, metal(0.6, 0.12, 0.85))),
          ('shield_steel', sh, (blue, metal(0.58, 0.18, 1.05))), ('shield_jade', sh, (blue, tint_to(0.4))),
          ('shield_crystal', sh, (blue, metal(0.52, 0.4, 1.25))), ('shield_gold', sh, (blue, metal(0.11, 0.75, 1.15))),
          ('shield_dragon', sh, (blue, tint_to(0.99))), ('shield_moon', sh, (blue, metal(0.75, 0.35, 1.1)))]
    V += [('staff', base['staff'], None), ('staff_king', base['king_staff'], None)]
    sc = base['scroll']
    V += [('scroll_return', sc, None), ('scroll_thunder', sc, (teal, metal(0.14, 0.85, 1.1))),
          ('scroll_sight', sc, (teal, tint_to(0.33))), ('scroll_sense', sc, (teal, tint_to(0.0)))]
    V += [('powder', base['powder'], None), ('sleepgrass', base['sleepgrass'], None), ('bento', base['bento'], None)]
    hb = base['herb']
    V += [('herb', hb, None), ('herb_big', hb, (red, metal(0.13, 0.85, 1.15))), ('herb_cure', hb, (red, metal(0.58, 0.7, 1.1)))]
    V += [('coin', base['coin'], None), ('orb', base['orb'], None)]
    ore = base['ore']
    V += [('shard_crystal', ore, None), ('shard_amber', ore, (cyanish, metal(0.09, 0.8, 1.1))),
          ('shard_bronze', ore, (cyanish, metal(0.42, 0.45, 0.85))), ('shard_gold', ore, (cyanish, metal(0.12, 0.75, 1.2)))]
    nk = base['necklace']
    V += [('pendant', nk, None), ('pendant_amber', nk, (teal, metal(0.08, 0.85, 1.1)))]
    # 未実装の道具（見本にはあるが、ゲームにまだ無い）。素材だけ作っておく
    V += [('robe', base['robe'], None), ('soup', base['soup'], None), ('plan', base['plan'], None)]
    return V


def main():
    os.makedirs(os.path.join(OUT, 'list'), exist_ok=True); os.makedirs(os.path.join(OUT, 'floor'), exist_ok=True)
    im = Image.open(os.path.join(ROOT, 'assets', 'reference', 'items.png'))
    base = {}
    for r in range(4):
        for c in range(4):
            box = (XS[c] + 20, YS[r] + 12, XS[c + 1] - 20, YS[r + 1] - 70)
            a, _ = pg.depixel(im, box, s=5.0)
            base[NAMES[r][c]] = cutout(a)
            print(NAMES[r][c], base[NAMES[r][c]].shape[:2])
    for name, src, tr in variants(base):
        rgba = hue_map(src, *tr) if tr else src
        fit(rgba, 48, False).save(os.path.join(OUT, 'list', name + '.png'))
        fit(rgba, 32, True).save(os.path.join(OUT, 'floor', name + '.png'))


if __name__ == '__main__':
    main()
