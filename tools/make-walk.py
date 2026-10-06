"""たけの歩行コマを、見本から作った静止画（assets/chars/take_*.png）の脚を動かして作る。
  python3 tools/make-walk.py
- 正面・背面：左足を上げたコマ（w1）と右足を上げたコマ（w2）。上げた足は2ドット上がり、反対の足は地面に着いたまま。
  体は足を上げたコマで1ドット下がる（踏みこみの重さ）。
- 横向き：歩幅を広げたコマ（w1：前の足を前へ、後ろの足を後ろへ）と、足が交差するコマ（w2：前の足を引いて少し上げる）。
- 頭・胴・装備の絵と足元の位置（y=62）は全コマ共通。キャンバスは 52×64。
- 右向き（*_right）：左向きを左右反転すると剣が左手に入れ替わるので、反転した絵から剣を取りのぞき、
  背面の絵に見えている盾（横から見た盾）を手前の手に持たせる（左向きの絵で盾が体に隠れているのと同じ考え方）。"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
CH = os.path.join(ROOT, 'assets', 'chars')
LEG = {'front': (52, 61, 26), 'back': (52, 61, 26), 'side': (51, 61, 26)}   # 脚の行の範囲と、左右の脚を分ける列


def load(n):
    return np.asarray(Image.open(os.path.join(CH, n + '.png')).convert('RGBA')).copy()


def save(a, n):
    Image.fromarray(a, 'RGBA').save(os.path.join(CH, n + '.png'))


def move(src, dst, rows, cols, dy, dx):
    """src の rows×cols の範囲の不透明な画素を (dy, dx) ずらして dst に描く"""
    y0, y1 = rows; x0, x1 = cols
    for y in range(y0, y1 + 1):
        for x in range(x0, x1):
            if src[y, x, 3] and 0 <= y + dy < 64 and 0 <= x + dx < 52:
                dst[y + dy, x + dx] = src[y, x]


def clear(a, rows, cols):
    a[rows[0]:rows[1] + 1, cols[0]:cols[1]] = 0


def walk_frontback(a, view):
    y0, y1, xc = LEG[view]
    out = []
    for lift_left in (True, False):
        b = np.zeros_like(a)
        # 上半身（脚より上）は1ドット下げる
        b[1:y0 + 1] = a[0:y0]
        lifted, planted = ((0, xc), (xc, 52)) if lift_left else ((xc, 52), (0, xc))
        # 着いている足：そのまま
        move(a, b, (y0, y1), planted, 0, 0)
        # 上げた足：2ドット上へ（すねが短く見え、足の裏が地面から離れる）
        move(a, b, (y0, y1), lifted, -2, 0)
        # 腰まわりのつなぎ目（上半身を下げた1行のすき間）を、元の脚の一番上の行で埋める
        for x in range(52):
            if not b[y0, x, 3] and a[y0, x, 3]: b[y0, x] = a[y0, x]
        out.append(b)
    return out


def walk_side(a):
    y0, y1, xc = LEG['side']
    out = []
    for stride in (True, False):
        b = a.copy(); clear(b, (y0, y1), (0, 52))
        back = np.zeros_like(a); front = np.zeros_like(a)
        move(a, back, (y0, y1), (xc, 52), 0, 0); move(a, front, (y0, y1), (0, xc), 0, 0)
        if stride:   # 歩幅を広げる：前の足（左）を前へ2、後ろの足を後ろへ2
            move(back, b, (y0, y1), (0, 52), 0, 2); move(front, b, (y0, y1), (0, 52), 0, -2)
        else:        # 交差：前の足を引いて少し上げ、後ろの足を前へ
            move(back, b, (y0, y1), (0, 52), 0, -2); move(front, b, (y0, y1), (0, 52), -1, 3)
        b2 = np.zeros_like(a); b2[1:64] = b[0:63]          # 歩いているコマは体が1ドット下がる
        b2[62:64] = b[62:64] * 0
        move(b, b2, (y0, y1), (0, 52), 0, 0)              # 足は地面の高さのまま
        out.append(b2)
    return out


def sword_mask(side):
    """左向きの横の絵で、手前の手に持つ剣（刃・輪郭・金のつば）の画素。手（肌色）は残す"""
    h, w = side.shape[:2]
    m = np.zeros((h, w), bool)
    for y in range(22, 46):
        xr = min(16.5, 13.5 + (y - 24) * 0.45) if y < 40 else 17    # 刃の傾きにそった右端
        for x in range(4, 20):
            if x > xr or not side[y, x, 3]: continue
            r, g, b, al = [int(v) for v in side[y, x]]
            skin = r > 170 and 110 < g < 190 and b < 140 and r - b > 60
            if y >= 40 and skin: continue
            m[y, x] = True
    return m


def right_facing(side, back):
    s = side.copy()
    m = sword_mask(side)
    s[m] = 0
    R = s[:, ::-1].copy()
    # 盾：背面の絵の左端に見えている盾（横から見た形）を切り出して、手前の手（右向きの絵の右側）に持たせる
    sh = back[29:52, 9:18].copy()
    sh_mask = sh[:, :, 3] > 0
    ox, oy = 29, 30
    for y in range(sh.shape[0]):
        for x in range(sh.shape[1]):
            if sh_mask[y, x] and 0 <= oy + y < 64 and 0 <= ox + x < 52: R[oy + y, ox + x] = sh[y, x]
    return R


def front_sword_mask(front):
    """正面の絵の、手に持つ剣（刃・輪郭・つば）の画素。手（肌色）は残す"""
    m = np.zeros(front.shape[:2], bool)
    for y in range(22, 44):
        for x in range(3, 16):
            if not front[y, x, 3]: continue
            r, g, b, al = [int(v) for v in front[y, x]]
            skin = r > 170 and 110 < g < 190 and b < 140 and r - b > 60
            if y <= 40 and x <= 13: m[y, x] = True
            elif 41 <= y <= 43 and 6 <= x <= 15 and not skin: m[y, x] = True
    return m


def shifted(a, mask, dy, dx):
    """mask の画素だけを (dy, dx) ずらした絵（ずらした先は上書き）"""
    b = a.copy(); b[mask] = 0
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        if 0 <= y + dy < 64 and 0 <= x + dx < 52: b[y + dy, x + dx] = a[y, x]
    return b


def lean(a, dx, dy=0):
    """上半身（脚より上）だけを傾ける：dx ずらす（足は地面のまま）"""
    b = np.zeros_like(a); y0 = 51
    for y in range(64):
        for x in range(52):
            if not a[y, x, 3]: continue
            ny, nx = (y + dy, x + dx) if y < y0 else (y, x)
            if 0 <= ny < 64 and 0 <= nx < 52: b[ny, nx] = a[y, x]
    return b


def attack_frames(front, side, right, back):
    """攻撃のコマ：a1＝構え（剣を引く・体を少し引く）、a2＝振り抜き（剣を前へ・体を前へ）。
    正面と左向きは剣そのものを動かす。右向き・背面は剣が体の向こう側で見えないので、体の傾きだけ（斬撃は演出で描く）"""
    fm, sm = front_sword_mask(front), sword_mask(side)
    out = {}
    out['front_a1'] = lean(shifted(front, fm, -3, -1), 0, -1)
    out['front_a2'] = lean(shifted(front, fm, 5, 3), 0, 1)
    out['side_a1'] = lean(shifted(side, sm, -2, 3), 1)
    out['side_a2'] = lean(shifted(side, sm, 4, -3), -2)
    out['right_a1'] = lean(right, -1)
    out['right_a2'] = lean(right, 2)
    out['back_a1'] = lean(back, 0, 1)
    out['back_a2'] = lean(back, 0, -2)
    return out, fm, sm


def main():
    front, back, side = load('take_front'), load('take_back'), load('take_side')
    f1, f2 = walk_frontback(front, 'front'); save(f1, 'take_front_w1'); save(f2, 'take_front_w2')
    b1, b2 = walk_frontback(back, 'back'); save(b1, 'take_back_w1'); save(b2, 'take_back_w2')
    s1, s2 = walk_side(side); save(s1, 'take_side_w1'); save(s2, 'take_side_w2')
    R = right_facing(side, back); save(R, 'take_right')
    r1, r2 = walk_side(R[:, ::-1].copy()); save(r1[:, ::-1].copy(), 'take_right_w1'); save(r2[:, ::-1].copy(), 'take_right_w2')
    atk, fm, sm = attack_frames(front, side, R, back)
    for k, a in atk.items(): save(a, 'take_' + k)
    # 武器を持っていないとき（素手）：正面と左向きの剣を消した絵（歩き・攻撃のコマも）
    for view, base, m in (('front', front, fm), ('side', side, sm)):
        def nw(a):
            b = a.copy(); b[m] = 0
            return b
        save(nw(base), f'take_{view}_nw')
        w1, w2 = (walk_frontback(nw(base), 'front') if view == 'front' else walk_side(nw(base)))
        save(w1, f'take_{view}_nw_w1'); save(w2, f'take_{view}_nw_w2')
        save(lean(nw(base), 0, -1) if view == 'front' else lean(nw(base), 1), f'take_{view}_nw_a1')
        save(lean(nw(base), 0, 1) if view == 'front' else lean(nw(base), -2), f'take_{view}_nw_a2')
    print('ok')


if __name__ == '__main__':
    main()
