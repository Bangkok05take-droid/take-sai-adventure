"""assets/items-v2/（道具の絵 48×48、追加分18種）から、床に置いたときの絵 32×32 を作る。
既存の床の絵（tools/extract-items.py の fit）と同じ方法：絵の部分だけを切り出し、色は面積平均・形は不透明度のしきい値で縮め、
暗い輪郭を1ドット付けて中央に置く。元の48×48の絵は変更しない。
使い方：python3 tools/make-items-v2-floor.py"""
import os, glob
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'items-v2')
OUT = os.path.join(SRC, 'floor')


def fit(im, size):
    pad = 1
    k = min(1.0, (size - 2 * pad) / max(im.width, im.height))
    if k < 1:
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
    a = np.asarray(c).copy(); al = a[:, :, 3] > 0
    ring = np.zeros_like(al)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ring |= np.roll(np.roll(al, dy, 0), dx, 1)
    ring &= ~al
    a[ring] = (24, 14, 10, 255)
    return Image.fromarray(a, 'RGBA')


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
        im = Image.open(f).convert('RGBA')
        im = im.crop(im.getbbox())
        fit(im, 32).save(os.path.join(OUT, os.path.basename(f)))
        print(os.path.basename(f), im.size)


if __name__ == '__main__':
    main()
