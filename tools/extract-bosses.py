"""デザイン見本「ボス7体」（assets/reference/bosses.png）からボスの透過画像を作る。
  python3 tools/extract-bosses.py
- 見本のドットは格子がそろっていない（1ドット約6ピクセルで場所により揺れる）ので、格子へ無理に合わせず、
  背景を取り除いてから面積平均で縮小する。縮小率は、同じ見本の右下のたけ（比較用）がゲームのたけ（背丈48ドット）と
  同じ背丈になる値。こうすると見本どおりの「たけとの大きさの比」になる。
- 背景（暗いグラデーションと色の光）は、外周から「となりとの色の差が小さい所」だけをたどって消す。
  ドット絵の輪郭（黒）との境目は色の差が大きいので、そこで止まる（黒い衣装・輪郭は残る）。
- 出力：assets/bosses/<id>.png（1ドット＝1ピクセル、キャンバス 96×96、足の裏は y=92、足元の中央は x=48）。
  比較用のたけは素材にしない（大きさの基準を測るだけ）。"""
import os, sys, json
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'reference', 'bosses.png')
OUT = os.path.join(ROOT, 'assets', 'bosses')
CW, CH, FOOT = 96, 96, 92
TAKE_GAME_H = 48                    # ゲームのたけの背丈（assets/chars/take_front.png）
# 見本の中の範囲（左, 上, 右, 下）。となりの絵にかからないように区切る
BOXES = {
    'croc': (0, 0, 438, 528), 'flame': (438, 0, 792, 528), 'kill': (792, 0, 1188, 528), 'baran': (1188, 0, 1536, 528),
    'mist': (0, 528, 412, 1024), 'vearn': (412, 528, 782, 1024), 'truevearn': (782, 528, 1186, 1024),
    '_take': (1186, 600, 1536, 1024),
}


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


def main():
    os.makedirs(OUT, exist_ok=True)
    im = np.asarray(Image.open(SRC).convert('RGB'))
    cut = {}
    for name, (x0, y0, x1, y1) in BOXES.items():
        a = im[y0:y1, x0:x1]
        fg = cutout(a)
        cut[name] = (a, fg)
    y0, y1, _, _ = bbox(cut['_take'][1])
    k = TAKE_GAME_H / (y1 - y0 + 1)
    info = {'scale': k, 'canvas': [CW, CH], 'foot': FOOT, 'sprites': {}}
    print('take height in sheet', y1 - y0 + 1, 'scale', round(k, 4))
    for name, (a, fg) in cut.items():
        if name.startswith('_'): continue
        s = shrink(a, fg, k)
        ys, xs = np.nonzero(s[:, :, 3])
        s = s[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        h, w = s.shape[:2]
        # 足元の中央：下から6行の不透明な画素の左右の中央
        fy, fx = np.nonzero(s[max(0, h - 6):, :, 3])
        cx = (fx.min() + fx.max()) / 2
        ox, oy = int(round(CW / 2 - cx - 0.5)), FOOT - h
        ox = max(0, min(CW - w, ox))
        if oy < 0 or w > CW: raise SystemExit(f'{name}: キャンバスに入らない {w}x{h}')
        c = np.zeros((CH, CW, 4), np.uint8); c[oy:oy + h, ox:ox + w] = s
        Image.fromarray(c, 'RGBA').save(os.path.join(OUT, name + '.png'))
        info['sprites'][name] = [int(w), int(h)]
        print(name, w, h)
    with open(os.path.join(OUT, 'sizes.json'), 'w') as f: json.dump(info, f, indent=1)


if __name__ == '__main__':
    main()
