# たけの飛行のポーズ（ZIP take_flying_sprites）の色を、元の立ち絵の色にそろえる：python3 -I tools/fix-take-flying-colors.py
# 形は描き直さない。色だけを直す（2026年11月4日のご指示「元々のデザインのままで」）
#  ① どの絵も、同じ向きの立ち絵（take_front・take_back・take_side）に使われている色のうち、いちばん近い色に置きかえる（服の青の濃さなどがそろう）
#  ② 横向きの盾：飛行の絵では茶色い盾になっていたので、金の縁の内側（茶色の部分）を、正面の立ち絵の盾の青に明るさの順で置きかえる
# 元：assets/reference/take-flying-v1/  →  assets/chars/take_fly_{front,back,side}.png（武器なしの絵は使わない：3点セットは剣を装備しているので）
import os
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC, OUT = os.path.join(ROOT, 'assets/reference/take-flying-v1/'), os.path.join(ROOT, 'assets/chars/')
def load(p): return np.array(Image.open(p).convert('RGBA')).astype(int)
def palette(a): return np.unique(a[a[..., 3] > 40][:, :3], axis=0)
def nearest(c, pal):
    # 明るさと色合いの両方を見る（人の目に近い重み）
    d = ((pal - c) ** 2 * np.array([3, 4, 2])).sum(1)
    return pal[d.argmin()]
front0 = load(os.path.join(ROOT, 'assets/chars/take_front.png'))
#  ③ 服の青：盾の枠の外の青は、元の立ち絵の服の青（盾を除いた胴体の青）に、明るさの順で置きかえる（盾の濃い青に寄ってしまわないように）
SHIELD = {'front': (32, 30, 48, 56), 'side': (23, 37, 35, 50), 'back': (5, 30, 18, 52)}   # 飛行の絵の盾の範囲（x0, y0, x1, y1）
SHIRT0 = {'front': (12, 28, 31, 46), 'side': (14, 28, 34, 46), 'back': (14, 28, 36, 48)}   # 立ち絵の服の範囲
isblue = lambda c: c[2] > c[0] + 70 and c[2] > 110
blues = [c for c in palette(front0) if c[2] > c[0] + 70 and c[2] > 120]   # 正面の盾・服の青
blues.sort(key=lambda c: c.sum())
for v in ('front', 'back', 'side'):
    a = load(SRC + 'take_fly_' + v + '.png')
    pal = palette(load(os.path.join(ROOT, 'assets/chars/take_' + v + '.png')))
    if v == 'side': pal = np.unique(np.concatenate([pal, palette(front0)]), axis=0)   # 横の立ち絵には盾の面が見えないので、正面の盾の色も使えるように
    out = a.copy()
    st = load(os.path.join(ROOT, 'assets/chars/take_' + v + '.png')); x0, y0, x1, y1 = SHIRT0[v]
    shirt = sorted({tuple(st[y, x, :3]) for y in range(y0, y1) for x in range(x0, x1) if st[y, x, 3] > 40 and isblue(st[y, x, :3])}, key=sum)
    sx0, sy0, sx1, sy1 = SHIELD[v]
    inShield = lambda x, y: sx0 <= x <= sx1 and sy0 <= y <= sy1
    fb = [a[y, x, :3].sum() for y in range(a.shape[0]) for x in range(a.shape[1]) if a[y, x, 3] > 40 and isblue(a[y, x, :3]) and not inShield(x, y)]
    lo, hi = (min(fb), max(fb)) if fb else (0, 1)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] <= 40: continue
            c = a[y, x, :3]
            if v == 'side' and 23 <= x <= 34 and 38 <= y <= 49 and 0x30 <= c[0] <= 0x80 and c[0] > c[2] and c[0] - c[2] < 0x50 and c[1] < c[0]:
                lum = c.sum() / 3; i = int(np.clip((lum - 0x30) / (0x60 - 0x30) * (len(blues) - 1), 0, len(blues) - 1))
                out[y, x, :3] = blues[i]   # 盾の面（茶色）→ 正面の盾の青
            elif shirt and isblue(c) and not inShield(x, y):
                i = int(round((c.sum() - lo) / max(1, hi - lo) * (len(shirt) - 1)))
                out[y, x, :3] = shirt[i]   # 服の青 → 立ち絵の服の青（明るさの順）
            else:
                out[y, x, :3] = nearest(c, pal)
    Image.fromarray(out.astype(np.uint8), 'RGBA').save(OUT + 'take_fly_' + v + '.png', optimize=True)
    print(v, 'colors', len(palette(a)), '->', len(palette(out)))
