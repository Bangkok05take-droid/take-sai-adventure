"""アユタヤの遺跡の見本 assets/reference/ayutthaya-ruins-v1.png（透過、1312×1199、4つの部品）から、村で描く大きさの透過PNGを作る。
- 透明度 200 未満（ふちの薄い半透明＝見本の外側の赤茶のにじみ）は消し、それ以外は不透明にする。
- 縮小は面積の中央値（artcut.shrink）。村の1ドット＝出力の1ピクセル（ゲームではそのまま整数倍で描く）。描き直しはしない。
使い方：python3 tools/extract-ruins.py"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from artcut import shrink

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'reference', 'ayutthaya-ruins-v1.png')
OUT = os.path.join(ROOT, 'assets', 'village', 'ruins')
# 見本の中の範囲（左, 上, 右, 下）と縮小率。門は人が通れる開口（約24ドット）、塔は寺院の段の上に収まる高さ
PARTS = {
    'tower': ((104, 12, 608, 704), 0.17),
    'gate': ((628, 228, 1296, 684), 0.25),
    'banyan_wall': ((20, 696, 680, 1172), 0.2),
    'broken_wall': ((700, 840, 1300, 1172), 0.2),
}


def main():
    a = np.asarray(Image.open(SRC).convert('RGBA'))
    os.makedirs(OUT, exist_ok=True)
    for name, ((l, t, r, b), k) in PARTS.items():
        c = a[t:b, l:r]
        fg = c[:, :, 3] >= 200
        ys, xs = np.nonzero(fg)
        c, fg = c[ys.min():ys.max() + 1, xs.min():xs.max() + 1, :3], fg[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        s = shrink(c, fg, k)
        Image.fromarray(s, 'RGBA').save(os.path.join(OUT, name + '.png'))
        print(name, s.shape[1], 'x', s.shape[0])


if __name__ == '__main__':
    main()
