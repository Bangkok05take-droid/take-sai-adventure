"""見本 assets/reference/boss-treasures.png（ボス報酬と宝箱の一覧、2026年10月）から、各アイコンを透過PNGに切り出す。
- お宝・装備：一覧用 48×48（assets/items-v2/）。床用 32×32 は tools/make-items-v2-floor.py で作る。
- 宝箱：床の1マス用 32×32 と 48×48（assets/chest/）。
背景と周囲の光は artcut.cutout で外周からたどって消す（輪郭線の内側は残す）。見本の絵は描き直さない（縮小のみ）。
使い方：python3 tools/extract-boss-treasures.py [確認用の出力フォルダ]"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from artcut import cutout, shrink, bbox

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'reference', 'boss-treasures.png')
DBG = sys.argv[1] if len(sys.argv) > 1 else None

# 見本の中の範囲（左, 上, 右, 下）と出力
PARTS = [
    ('croc_tear', (110, 30, 425, 525), [('assets/items-v2/croc_tear.png', 48)]),
    ('iceflame_crystal', (560, 15, 985, 510), [('assets/items-v2/iceflame_crystal.png', 48)]),
    ('phantom_shield', (1060, 10, 1510, 545), [('assets/items-v2/phantom_shield.png', 48)]),
    ('shinma_sword', (25, 520, 825, 965), [('assets/items-v2/shinma_sword.png', 48)]),   # 斜め45度に傾けて枠を広く使う（ほかの剣の絵と同じ向き）
    ('chest', (835, 550, 1440, 960), [('assets/chest/chest_48.png', 48), ('assets/chest/chest_32.png', 32)]),
]


def outline(img):
    """外側に暗い輪郭を1ドット（床の上でも形が分かるように）"""
    a = np.asarray(img).copy(); al = a[:, :, 3] > 0
    ring = np.zeros_like(al)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ring |= np.roll(np.roll(al, dy, 0), dx, 1)
    ring &= ~al
    a[ring] = (24, 14, 10, 255)
    return Image.fromarray(a, 'RGBA')


def chest_finish(s):
    """床の1マスで宝箱と分かるように仕上げる（縮小後の絵に対して）：
    ふたと本体の境目を暗い1ドットの線ではっきりさせ、中央の鍵穴を大きめの暗い形で描き直す。位置は見本の絵の比率"""
    s = s.copy(); h, w = s.shape[:2]; op = s[:, :, 3] > 0
    dark = (34, 16, 10, 255)
    def line(y, xa, xb):
        y = int(round(y * h))
        for x in range(int(round(xa * w)), int(round(xb * w))):
            if op[y, x]: s[y, x] = dark
    line(0.515, 0.04, 0.27); line(0.515, 0.40, 0.66)   # 正面の境目（錠前の板はまたがない）
    line(0.45, 0.68, 0.95)                              # 側面の境目
    cx, cy = 0.33 * w, 0.535 * h
    r = max(1, round(w / 30))                          # 32なら丸1ドット半径、48なら2
    for y in range(h):
        for x in range(w):
            dx, dy = x + 0.5 - cx, y + 0.5 - (cy - r * 0.6)
            ball = dx * dx + dy * dy <= (r + 0.35) ** 2
            stem = abs(dx) <= max(0.5, r * 0.55) and 0 <= y + 0.5 - (cy - r * 0.6) <= r * 2.6
            if (ball or stem) and op[y, x]: s[y, x] = (14, 8, 6, 255)
    return s


def main():
    im = np.asarray(Image.open(SRC).convert('RGB'))
    for name, (l, t, r, b), outs in PARTS:
        a = im[t:b, l:r]
        fg = cutout(a)
        y0, y1, x0, x1 = bbox(fg)
        a, fg = a[y0:y1 + 1, x0:x1 + 1], fg[y0:y1 + 1, x0:x1 + 1]
        if name == 'shinma_sword':
            rgba = Image.fromarray(np.dstack([a, np.where(fg, 255, 0).astype(np.uint8)]), 'RGBA').rotate(16, Image.NEAREST, expand=True)
            r = np.asarray(rgba); fg = r[:, :, 3] > 0; a = r[:, :, :3]
            y0, y1, x0, x1 = bbox(fg); a, fg = a[y0:y1 + 1, x0:x1 + 1], fg[y0:y1 + 1, x0:x1 + 1]
        if DBG:
            d = np.dstack([a, np.where(fg, 255, 0).astype(np.uint8)])
            Image.fromarray(d, 'RGBA').save(os.path.join(DBG, name + '_cut.png'))
        for path, size in outs:
            k = (size - 2) / max(a.shape[0], a.shape[1])
            s = shrink(a, fg, k)
            if name == 'chest': s = chest_finish(s)
            c = Image.new('RGBA', (size, size))
            c.alpha_composite(Image.fromarray(s, 'RGBA'), ((size - s.shape[1]) // 2, (size - s.shape[0]) // 2))
            c = outline(c)
            p = os.path.join(ROOT, path); os.makedirs(os.path.dirname(p), exist_ok=True)
            c.save(p)
            print(path, s.shape[1], 'x', s.shape[0])


if __name__ == '__main__':
    main()
