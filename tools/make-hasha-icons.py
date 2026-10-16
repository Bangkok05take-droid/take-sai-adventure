"""覇者の剣・覇者の盾（ChatGPT制作のドット絵の原画、assets/reference/hasha-v1/）から、ゲームで使う大きさの絵を作る。
ほかのボスの報酬の装備と同じ寸法：一覧・装備・報酬の画面は 128×128（assets/items-boss/）、床は 64×64（assets/items-boss/floor/）。
縮めるだけで、描き直し・飾りの追加はしない。縦横比はそのまま（正方形の中央に置く）。
方法：不透明度128以上の部分で絵の範囲を決めて切り出し → 色は不透明度で重みづけした面積平均、形は不透明度のしきい値で縮める（ほかの道具の絵と同じ）。
使い方：python3 -I tools/make-hasha-icons.py"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'reference', 'hasha-v1')
OUT = os.path.join(ROOT, 'assets', 'items-boss')
JOBS = [('hasha-sword-original.png', 'hasha-sword.png'), ('hasha-shield-original.png', 'hasha-shield.png')]
# 絵の部分の最大の大きさ（ほかの報酬の装備：128 では約112、64 では約56）
SIZES = [(128, 112, OUT), (64, 56, os.path.join(OUT, 'floor'))]


def shrink(im, box):
    k = box / max(im.width, im.height)
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    a = np.asarray(im).astype(np.float64)
    pre = a.copy(); pre[:, :, :3] *= a[:, :, 3:4] / 255
    sm = np.asarray(Image.fromarray(pre.clip(0, 255).astype(np.uint8), 'RGBA').resize((w, h), Image.BOX)).astype(np.float64)
    al = sm[:, :, 3:4]
    col = np.where(al > 0, sm[:, :, :3] * 255 / np.maximum(al, 1), 0)
    return Image.fromarray(np.dstack([col, np.where(al[:, :, 0] > 110, 255, 0)]).clip(0, 255).astype(np.uint8), 'RGBA')


for src, name in JOBS:
    im = Image.open(os.path.join(SRC, src)).convert('RGBA')
    a = np.asarray(im).copy()
    a[a[:, :, 3] < 128] = 0          # 原画の縁の薄いにじみ（不透明度128未満）は透明に
    im = Image.fromarray(a, 'RGBA')
    im = im.crop(im.getchannel('A').getbbox())
    for size, box, out in SIZES:
        os.makedirs(out, exist_ok=True)
        s = shrink(im, box)
        c = Image.new('RGBA', (size, size))
        c.alpha_composite(s, ((size - s.width) // 2, (size - s.height) // 2))
        c.save(os.path.join(out, name))
        print(os.path.join(out, name), c.size, s.size)
