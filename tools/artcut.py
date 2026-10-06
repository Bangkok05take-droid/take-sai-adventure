"""見本画像から人物・敵を切り出す共通の部品（tools/extract-bosses.py・tools/extract-enemies.py が使う）。
- cutout：外周から「となりとの色の差が小さい所（背景のグラデーションや光）」だけをたどって背景を消す。輪郭線（黒）や衣装は残る。
- shrink：面積平均＋中央値で縮小（格子のそろっていない見本でも、にじませずに1ドット＝1ピクセルへ）。
- place：決まった大きさのキャンバスに、足の裏の位置と足元の中央をそろえて置く。"""
from collections import deque
import numpy as np


def cutout(a):
    """外周から背景をたどって透明にする。戻り値：不透明マスク"""
    h, w = a.shape[:2]
    ai = a.astype(np.int32)
    mx = ai.max(axis=2)
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not bg[y, x]: bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not bg[y, x]: bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        c = ai[y, x]
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if yy < 0 or xx < 0 or yy >= h or xx >= w or bg[yy, xx]: continue
            d = np.abs(ai[yy, xx] - c).sum()
            # 背景はなめらか。暗い所（輪郭に近い色）では、さらに差が小さいときだけ進む
            # 暗い所（輪郭に近い色）と明るい所（炎の体に近い色）では、差がごく小さいときだけ進む
            lim = 9 if mx[yy, xx] < 40 else 26 if mx[yy, xx] < 150 else 7
            if d <= lim:
                bg[yy, xx] = True; q.append((yy, xx))
    fg = ~bg
    # 小さな離れ島（光の粒など）を消す：いちばん大きな塊の 3% 未満
    lab = np.zeros((h, w), np.int32); sizes = [0]; n = 0
    for y in range(h):
        for x in range(w):
            if fg[y, x] and not lab[y, x]:
                n += 1; st = [(y, x)]; lab[y, x] = n; cnt = 0
                while st:
                    cy, cx = st.pop(); cnt += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            yy, xx = cy + dy, cx + dx
                            if 0 <= yy < h and 0 <= xx < w and fg[yy, xx] and not lab[yy, xx]:
                                lab[yy, xx] = n; st.append((yy, xx))
                sizes.append(cnt)
    big = max(sizes)
    keep = np.array([s >= big * 0.03 for s in sizes]); keep[0] = False
    fg = keep[lab]
    # 輪郭のすぐ外に残る光のにじみ（明るく彩度の高い1〜2ピクセル）を削る
    for _ in range(2):
        edge = fg & ~(np.roll(fg, 1, 0) & np.roll(fg, -1, 0) & np.roll(fg, 1, 1) & np.roll(fg, -1, 1))
        glow = edge & (mx > 70) & ((ai.max(axis=2) - ai.min(axis=2)) > 60) & (mx < 200)
        fg &= ~glow
    return fg


def shrink(a, fg, k):
    """面積平均で縮小。色は不透明な画素だけで平均し、形は覆う割合で決める"""
    h, w = fg.shape
    W, H = max(1, round(w * k)), max(1, round(h * k))
    out = np.zeros((H, W, 4), np.uint8)
    for j in range(H):
        y0, y1 = int(j / k), max(int((j + 1) / k), int(j / k) + 1)
        for i in range(W):
            x0, x1 = int(i / k), max(int((i + 1) / k), int(i / k) + 1)
            m = fg[y0:y1, x0:x1]
            cov = m.mean()
            if cov < 0.45: continue
            px = a[y0:y1, x0:x1][m].astype(np.float64)
            # 中央値で色を決める（輪郭と中の色が混ざってにごるのを防ぐ）
            out[j, i, :3] = np.median(px, axis=0)
            out[j, i, 3] = 255
    return out


def bbox(m):
    ys, xs = np.nonzero(m)
    return ys.min(), ys.max(), xs.min(), xs.max()


def place(s, cw, ch, foot):
    ys, xs = np.nonzero(s[:, :, 3])
    s = s[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = s.shape[:2]
    fy, fx = np.nonzero(s[max(0, h - 6):, :, 3])
    cx = (fx.min() + fx.max()) / 2
    ox, oy = int(round(cw / 2 - cx - 0.5)), foot - h
    ox = max(0, min(cw - w, ox))
    if oy < 0 or w > cw:
        raise ValueError(f'キャンバスに入らない {w}x{h}')
    c = np.zeros((ch, cw, 4), np.uint8); c[oy:oy + h, ox:ox + w] = s
    return c, (int(w), int(h))
