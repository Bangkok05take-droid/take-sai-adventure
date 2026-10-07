"""村の飾りの見本 assets/reference/village-decor-v1.png（透過、1312×1199、4つの部品）から、村で描く大きさの透過PNGを作る。
街灯（lamp）・白いゾウの像（elephant）・噴水（fountain）・赤い橋（bridge）。
- 透明度 200 未満（ふちの薄い半透明＝見本の外側のにじみ）は消す。縮小は面積の中央値（artcut.shrink）。描き直しはしない。
- 赤い橋は川（3マス）に合わせて、欄干の柱のくり返し区間（見本の橋の中の 90〜341 行）を抜いて短くする（柱と柱の間で切るので継ぎ目が目立たない）。
使い方：python3 tools/extract-decor.py"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from artcut import shrink

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'reference', 'village-decor-v1.png')
OUT = os.path.join(ROOT, 'assets', 'village', 'decor')
# 見本の中の範囲（左, 上, 右, 下）、縮小率、抜く行（部品の中の行）
PARTS = {
    'lamp': ((312, 24, 444, 560), 0.11, None),
    'elephant': ((640, 44, 1128, 560), 0.11, None),
    'fountain': ((200, 616, 688, 1104), 0.16, None),
    'bridge': ((860, 588, 1080, 1160), 0.33, (90, 259)),
}


def main():
    a = np.asarray(Image.open(SRC).convert('RGBA'))
    os.makedirs(OUT, exist_ok=True)
    for name, ((l, t, r, b), k, cut) in PARTS.items():
        c = a[t:b, l:r]
        if cut: c = np.concatenate([c[:cut[0]], c[cut[1]:]], axis=0)
        fg = c[:, :, 3] >= 200
        ys, xs = np.nonzero(fg)
        c, fg = c[ys.min():ys.max() + 1, xs.min():xs.max() + 1, :3], fg[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        s = shrink(c, fg, k)
        Image.fromarray(s, 'RGBA').save(os.path.join(OUT, name + '.png'))
        print(name, s.shape[1], 'x', s.shape[0])


if __name__ == '__main__':
    main()
