"""見本画像のドット絵部分から、元のドットの格子を推定して1ドット＝1ピクセルの素材に戻す道具。
使い方は tools/extract-art.py から。"""
import numpy as np
from PIL import Image


def profile(a, axis):
    # 隣り合う画素の色の差（ドットの境目で大きくなる）
    d = np.abs(np.diff(a.astype(np.int32), axis=axis)).sum(axis=2)
    return d.sum(axis=1 - axis).astype(np.float64)


def best_grid(p, smin=3.0, smax=8.0):
    """境目の強さ p（長さ n）から、ドットの大きさ s と位相 o を推定する。"""
    n = len(p)
    p = p - p.mean()
    best = (-1e18, None, None)
    for s in np.arange(smin, smax, 0.01):
        for o in np.arange(0, s, 0.25):
            idx = np.round(o + np.arange(0, (n - o) / s) * s - 0.5).astype(int)
            idx = idx[(idx >= 0) & (idx < n)]
            if len(idx) < 4:
                continue
            sc = p[idx].mean()
            if sc > best[0]:
                best = (sc, s, o)
    return best[1], best[2]


def resample(a, sx, ox, sy, oy):
    """各ドットの中央部分の色の中央値をとる。"""
    h, w = a.shape[:2]
    nx = int((w - ox) // sx)
    ny = int((h - oy) // sy)
    out = np.zeros((ny, nx, a.shape[2]), np.uint8)
    for j in range(ny):
        y0 = oy + j * sy
        ya, yb = int(round(y0 + sy * 0.25)), max(int(round(y0 + sy * 0.75)), int(round(y0 + sy * 0.25)) + 1)
        for i in range(nx):
            x0 = ox + i * sx
            xa, xb = int(round(x0 + sx * 0.25)), max(int(round(x0 + sx * 0.75)), int(round(x0 + sx * 0.25)) + 1)
            blk = a[ya:yb, xa:xb].reshape(-1, a.shape[2])
            out[j, i] = np.median(blk, axis=0)
    return out


def depixel(img, box, s=None):
    a = np.asarray(img.convert('RGB').crop(box))
    if s:
        sx = sy = s
        _, ox = best_grid_fixed(profile(a, 1), s)
        _, oy = best_grid_fixed(profile(a, 0), s)
    else:
        sx, ox = best_grid(profile(a, 1))
        sy, oy = best_grid(profile(a, 0))
    return resample(a, sx, ox, sy, oy), (sx, ox, sy, oy)


def best_grid_fixed(p, s):
    n = len(p); p = p - p.mean(); best = (-1e18, 0)
    for o in np.arange(0, s, 0.1):
        idx = np.round(o + np.arange(0, (n - o) / s) * s - 0.5).astype(int)
        idx = idx[(idx >= 0) & (idx < n)]
        sc = p[idx].mean()
        if sc > best[0]:
            best = (sc, o)
    return s, best[1]


def period(p, smin=3.2, smax=9.0):
    """自己相関から基本周期（ドットの大きさ）を推定する。倍の周期を選ばないよう、最初の強い山をとる。"""
    p = p - p.mean(); n = len(p)
    xs = np.arange(n)
    res = []
    for s in np.arange(smin, smax, 0.02):
        q = np.interp(xs + s, xs, p, right=0)
        res.append((np.dot(p[: n - int(s) - 1], q[: n - int(s) - 1]) / (n - s), s))
    mx = max(v for v, _ in res)
    for i in range(1, len(res) - 1):
        v, s = res[i]
        if v >= 0.7 * mx and v >= res[i - 1][0] and v >= res[i + 1][0]:
            return s
    return max(res)[1]


def depixel_auto(img, box):
    a = np.asarray(img.convert('RGB').crop(box))
    sx = period(profile(a, 1)); sy = period(profile(a, 0))
    s = (sx + sy) / 2
    _, ox = best_grid_fixed(profile(a, 1), s)
    _, oy = best_grid_fixed(profile(a, 0), s)
    return resample(a, s, ox, s, oy), (sx, sy, ox, oy)
