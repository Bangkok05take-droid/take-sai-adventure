# ボス部屋の背景を作るための配置テンプレート（ChatGPT 向け）：python3 -I tools/boss-room-template.py [部屋]（既定 truevearn）
# 今のボスの階（js/dungeon.js generateBossFloor。地図33×24・広間 x9〜23・y1〜15）を、絵の座標に置いた図。
#   1マス T＝広間の横幅/15（端数のまま）。マス(c,r) の左上＝(X0 + (c-9)*T, Y0 + (r-1)*T)。X0,Y0＝広間の左上
#   通れる床：広間 15×15・通路 1マス幅×3（x16・y16〜18）・前室 5×4（x14〜18・y19〜22）。それ以外は壁
#   入口のマス (16,21)：たけを置くマス（前室の中。開口部ではない）。ボスの最初の位置 (16,8)：広間の中央
#   到着位置 (16,12)：33階で着いた直後のたけ（広間の下の端から3マス上。覚醒ムービーのあと）
# 出力：docs/<部屋>-room-v1/template-labeled.png（確認用・ラベルつき）・template-plain.png（背景制作用・ラベルなし）
# 端数の座標をそのまま描くため、4倍の大きさで描いてから縮める（色の境目は端数の位置で、なめらかに混ざる）
import os, sys
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ROOMS = {   # キャンバス・広間の左上・広間の横幅（px）
  'truevearn': dict(out='docs/truevearn-room-v1', W=1024, H=1600, X0=120, Y0=385, AW=785, name='真大魔王バーン（33階）', arrive=True),
  'croc': dict(out='docs/crocodine-room-v1', W=1024, H=1600, X0=108, Y0=352, AW=808, name='クロコダイン（15階）', arrive=False),
  'flame': dict(out='docs/flazzard-room-v1', W=1024, H=1536, X0=150, Y0=365, AW=718, name='フレイザード（20階）', arrive=False),
}
key = sys.argv[1] if len(sys.argv) > 1 else 'truevearn'
R = ROOMS[key]; T = R['AW'] / 15; S = 4
X = lambda c: R['X0'] + (c - 9) * T
Y = lambda r: R['Y0'] + (r - 1) * T
COL = { 'wall': (58, 58, 66), 'arena': (120, 200, 120), 'path': (110, 170, 225), 'start': (250, 210, 40), 'boss': (230, 60, 60), 'arrive': (255, 150, 40), 'grid': (20, 20, 20) }
arena = {(x, y) for y in range(1, 16) for x in range(9, 24)}
path = {(16, y) for y in range(16, 19)} | {(x, y) for y in range(19, 23) for x in range(14, 19)}
marks = [('start', 16, 21), ('boss', 16, 8)] + ([('arrive', 16, 12)] if R['arrive'] else [])

def draw(labeled):
    img = Image.new('RGB', (R['W'] * S, R['H'] * S), COL['wall']); d = ImageDraw.Draw(img)
    sc = lambda v: v * S
    for (c, r) in arena | path:
        d.rectangle([sc(X(c)), sc(Y(r)), sc(X(c + 1)) - 1, sc(Y(r + 1)) - 1], fill=COL['arena'] if (c, r) in arena else COL['path'])
    for k, c, r in marks:
        m = T * 0.12
        d.rectangle([sc(X(c) + m), sc(Y(r) + m), sc(X(c + 1) - m) - 1, sc(Y(r + 1) - m) - 1], fill=COL[k])
    # マス目（地図全体。端数の位置）
    c0, c1 = int((0 - R['X0']) // T) + 8, int((R['W'] - R['X0']) // T) + 10
    r0, r1 = int((0 - R['Y0']) // T), int((R['H'] - R['Y0']) // T) + 2
    for c in range(c0, c1 + 1): d.line([(sc(X(c)), 0), (sc(X(c)), R['H'] * S)], fill=COL['grid'], width=S)
    for r in range(r0, r1 + 1): d.line([(0, sc(Y(r))), (R['W'] * S, sc(Y(r)))], fill=COL['grid'], width=S)
    img = img.resize((R['W'], R['H']), Image.LANCZOS)
    if labeled:
        d = ImageDraw.Draw(img); F = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 17); Fs = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 13)
        def lab(x, y, s, col=(255, 255, 255), f=F):
            w = d.textlength(s, font=f); d.rectangle([x - 3, y - 2, x + w + 3, y + f.size + 4], fill=(0, 0, 0)); d.text((x, y), s, fill=col, font=f)
        f2 = lambda v: ('%.2f' % v).rstrip('0').rstrip('.')
        lab(10, 8, '%s　配置テンプレート %d×%d　1マス＝%s px（%d/15）' % (R['name'], R['W'], R['H'], f2(T), R['AW']))
        lab(10, 32, '緑＝広間（通れる）　青＝通路・前室（通れる）　灰＝壁（通れない）　黒い線＝マス目', (220, 220, 220))
        lab(X(9) + 6, Y(1) + 6, '広間 15×15：x%s〜%s・y%s〜%s' % (f2(X(9)), f2(X(24)), f2(Y(1)), f2(Y(16))), (200, 255, 200))
        lab(X(17) + 8, Y(16) + 6, '通路 1マス幅×3：x%s〜%s・y%s〜%s' % (f2(X(16)), f2(X(17)), f2(Y(16)), f2(Y(19))), (190, 225, 255))
        lab(X(19) + 8, Y(19) + 6, '前室 5×4：x%s〜%s・y%s〜%s' % (f2(X(14)), f2(X(19)), f2(Y(19)), f2(Y(23))), (190, 225, 255))
        lab(X(17) + 8, Y(21) + 14, '黄＝入口のマス（たけを置く所。開口部ではない）(16,21)', (255, 230, 120))
        lab(X(17) + 8, Y(8) + 14, '赤＝ボスの最初の位置 (16,8)', (255, 160, 160))
        if R['arrive']: lab(X(17) + 8, Y(12) + 14, '橙＝33階に着いた直後のたけ (16,12)', (255, 200, 120))
        lab(10, Y(23) + 8, '前室の下（y%s〜）は壁。下へ続く通路・開口は描かない' % f2(Y(23)), (255, 180, 180))
        for c in range(9, 24, 2): lab(X(c) + 2, Y(1) - 18, str(c), (200, 200, 200), Fs)
        for r in range(1, 23, 3): lab(X(9) - 22, Y(r) + 2, str(r), (200, 200, 200), Fs)
    return img
os.makedirs(os.path.join(ROOT, R['out']), exist_ok=True)
draw(True).save(os.path.join(ROOT, R['out'], 'template-labeled.png'), optimize=True)
draw(False).save(os.path.join(ROOT, R['out'], 'template-plain.png'), optimize=True)
print(key, 'T=%.4f' % T, 'arena', X(9), Y(1), X(24), Y(16), 'corr', X(16), Y(16), X(17), Y(19), 'ante', X(14), Y(19), X(19), Y(23), 'start', X(16), Y(21), X(17), Y(22))
