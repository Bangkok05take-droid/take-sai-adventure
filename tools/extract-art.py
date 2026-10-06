"""デザイン見本（assets/reference/）から、ゲームで使う人物のドット絵を作る。
  python3 tools/extract-art.py
見本のドット絵は「1ドット＝約4ピクセル」で描かれているので、格子を推定して1ドット＝1ピクセルに戻し、
紙の背景と足元の影を外周から塗りつぶして透明にする（輪郭線で止まる）。
すべて同じ大きさのキャンバス（横52×縦64）に、足の裏が下から2ドット目にそろうように置く。"""
import os, sys, json
from collections import deque
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import pixelgrid as pg

ROOT = os.path.join(os.path.dirname(__file__), '..')
REF = os.path.join(ROOT, 'assets', 'reference')
OUT = os.path.join(ROOT, 'assets', 'chars')
CW, CH, BASE = 52, 64, 62   # キャンバスの大きさと、足の裏の位置（この行の上に足が立つ）

# 見本の中のおおよその位置（左, 上, 右, 下）。向き：front=正面 side=横（見本は左向き） back=背面
SHEETS = {
    'takesai.png': {
        'take_front': (66, 980, 238, 1182), 'take_side': (246, 980, 412, 1182), 'take_back': (416, 980, 584, 1182),
        'sai_front': (686, 980, 852, 1182), 'sai_side': (856, 980, 1012, 1182), 'sai_back': (1026, 980, 1192, 1182),
    },
    'villagers.png': {
        'koi_front': (60, 812, 198, 1002), 'koi_back': (206, 800, 330, 1002),
        'mot_front': (440, 800, 568, 1002), 'mot_back': (590, 800, 728, 1002),
        'waan_front': (820, 800, 948, 1002), 'waan_back': (970, 800, 1098, 1002),
        'tiw_front': (1186, 800, 1314, 1002), 'tiw_back': (1336, 800, 1468, 1002),
    },
    'yanai.png': {
        'yanai_front': (692, 862, 868, 1122), 'yanai_side': (866, 862, 1018, 1122), 'yanai_back': (1046, 862, 1198, 1122),
    },
}


def paperish(c, bg):
    r, g, b = [int(v) for v in c]
    mx, mn = max(r, g, b), min(r, g, b)
    sat = (mx - mn) / (mx + 1)
    d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
    # 紙の色・その少し暗い影（茶色がかった灰色）
    return d < 70 or (mx > 120 and sat < 0.26 and r >= b - 4)


def cutout(a):
    h, w = a.shape[:2]
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    alpha = np.full((h, w), 255, np.uint8)
    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        q.append((0, x)); q.append((h - 1, x))
    for y in range(h):
        q.append((y, 0)); q.append((y, w - 1))
    while q:
        y, x = q.popleft()
        if y < 0 or y >= h or x < 0 or x >= w or seen[y, x]:
            continue
        seen[y, x] = True
        if not paperish(a[y, x], bg):
            continue
        alpha[y, x] = 0
        q.extend([(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)])
    # 足元の影の残り（両足の間に閉じこめられた薄茶色）：下の6行だけ、影の色に近い画素を消す
    ys = np.nonzero(alpha.any(axis=1))[0]
    if len(ys):
        for y in range(max(0, ys.max() - 5), ys.max() + 1):
            for x in range(w):
                r, g, b = [int(v) for v in a[y, x]]
                mx = max(r, g, b)
                if alpha[y, x] and 150 < mx < 238 and 12 <= r - b <= 75 and (mx - min(r, g, b)) / (mx + 1) < 0.3:
                    alpha[y, x] = 0
    # 小さな離れ島（飾り枠のかけら等）を消す：いちばん大きな塊の 6% 未満は捨てる
    lab = np.zeros((h, w), int); sizes = {}; n = 0
    for y in range(h):
        for x in range(w):
            if alpha[y, x] and not lab[y, x]:
                n += 1; st = [(y, x)]; lab[y, x] = n; cnt = 0
                while st:
                    cy, cx = st.pop(); cnt += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                        yy, xx = cy + dy, cx + dx
                        if 0 <= yy < h and 0 <= xx < w and alpha[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = n; st.append((yy, xx))
                sizes[n] = cnt
    big = max(sizes.values()) if sizes else 0
    for y in range(h):
        for x in range(w):
            if lab[y, x] and sizes[lab[y, x]] < big * 0.06:
                alpha[y, x] = 0
    return np.dstack([a, alpha])


def place(rgba):
    ys, xs = np.nonzero(rgba[:, :, 3])
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    spr = rgba[y0:y1 + 1, x0:x1 + 1]
    sh, sw = spr.shape[:2]
    canvas = np.zeros((CH, CW, 4), np.uint8)
    # 足元の中心：いちばん下の6行にある画素の左右の中央
    fy, fx = np.nonzero(spr[max(0, sh - 6):, :, 3])
    cx = (fx.min() + fx.max()) / 2 if len(fx) else sw / 2
    ox = int(round(CW / 2 - cx - 0.5)); oy = BASE - sh
    if oy < 0 or ox < 0 or ox + sw > CW:
        raise SystemExit(f'キャンバスに入らない: {sw}x{sh} ox={ox} oy={oy}')
    canvas[oy:oy + sh, ox:ox + sw] = spr
    return canvas, (int(sw), int(sh))


def main():
    os.makedirs(OUT, exist_ok=True)
    info = {}
    for sheet, boxes in SHEETS.items():
        im = Image.open(os.path.join(REF, sheet))
        for name, box in boxes.items():
            a, _ = pg.depixel(im, box, s=4.0)
            canvas, size = place(cutout(a))
            Image.fromarray(canvas, 'RGBA').save(os.path.join(OUT, name + '.png'))
            info[name] = size
            print(name, size)
    with open(os.path.join(OUT, 'sizes.json'), 'w') as f:
        json.dump({'canvas': [CW, CH], 'base': BASE, 'sprites': info}, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
