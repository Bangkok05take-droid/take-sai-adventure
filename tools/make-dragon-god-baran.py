# 竜魔神バランの絵と技の演出（ZIP baran-images-v2。ChatGPT制作。描き直しはしない）：python3 -I tools/make-dragon-god-baran.py
# 元の素材：assets/reference/baran-images-v2/
#  ・キャラクター（01_character）→ assets/bosses/dragonbaran*.png
#     細かく持つ（3倍：1ドット＝3ピクセル。js/assets.js の bossArtScale）。画面ではボスの枠（96×96・足の裏 y=92・足元の中央 x=48）として描く
#     idle：待機。原画の本体の高さ（透明度 40 より濃い所）を 72 ドットにする（通常のバラン 65・真大魔王バーン 66 より少し大きい）
#     doruora・sword：ドルオーラの構え（両手を体の前で重ねる）・ギガブレイクの溜め（剣を頭上に）。同じ原画の左右。
#       待機と同じ大きさに見えるよう、髪のてっぺん〜靴底の長さ（待機 1137・構え 795）の比 1.43 で、待機より大きい倍率にする
#     dash：ギガブレイクの突進と斬撃（右向き。左へはゲームで反転）。横に長いので枠は 128×128（足の裏 y=124・中央 x=64。占有は1マスのまま）。
#       頭の大きさが構えの原画の約1.08倍なので、その分小さい倍率にする
#     縮小は LANCZOS（隠しダンジョンの強敵と同じ。表示はなめらかに）
#  ・技の演出（02_effects）→ assets/fx/dragonbaran/*.png
#     各シートを4つの区画に分け、区画ごとに透明な余白を切る（余白は大きさ・当たり判定に数えない）。長い辺が 384 を超えるものだけ縮める
#     当たり判定は1マスの単位でゲームが決める（絵の大きさとは無関係）
import os
from PIL import Image
import numpy as np
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/baran-images-v2/')
OUT_B = os.path.join(ROOT, 'assets/bosses/')
OUT_F = os.path.join(ROOT, 'assets/fx/dragonbaran/')
os.makedirs(OUT_F, exist_ok=True)
S3 = 3


def cut(im, thr=40):
    a = np.array(im.getchannel('A'))
    im = im.copy()
    arr = np.array(im)
    arr[a <= thr] = 0   # ほぼ透明なかすかな点は消す（縮小で点が残らないように）
    im = Image.fromarray(arr)
    ys, xs = np.nonzero(a > thr)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def place(body, k, canvas, foot, name):
    b = body.resize((max(1, round(body.width * k)), max(1, round(body.height * k))), Image.LANCZOS)
    W = canvas * S3
    cv = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ox, oy = round(W / 2 - b.width / 2), foot * S3 - b.height
    assert ox >= 0 and oy >= 0 and ox + b.width <= W, name + ' はみ出す'
    cv.alpha_composite(b, (ox, oy))
    cv.save(OUT_B + name + '.png', optimize=True)
    print(name, 'logical size', round(b.width / S3, 1), 'x', round(b.height / S3, 1), 'top', round(oy / S3, 1))


idle = cut(Image.open(SRC + '01_character/baran_idle.png').convert('RGBA'))
K = 72 * S3 / idle.height
place(idle, K, 96, 92, 'dragonbaran')
poses = Image.open(SRC + '01_character/baran_doruora_and_sword_charge_poses.png').convert('RGBA')
KP = K * 1137 / 795
place(cut(poses.crop((0, 0, 768, 1024))), KP, 96, 92, 'dragonbaran-doruora')
place(cut(poses.crop((768, 0, 1536, 1024))), KP, 96, 92, 'dragonbaran-sword')
place(cut(Image.open(SRC + '01_character/baran_giga_break_dash.png').convert('RGBA')), KP / 1.08, 128, 124, 'dragonbaran-dash')
# 追加のポーズ（ZIP baran_giga_break_extra_poses。03_giga_extra/）：枠は突進と同じ 128×128（足の裏 y=124）
#   dash_down・dash_up：上下への突進。正面・背面なので、額の飾り（水色）の幅を構えの原画（215px）とそろえる（下向き 241px。上向きは飾りが見えないので下向きと同じ倍率）
#   sweep：ギガブレイクのなぎ払い（左向き。右へはゲームで反転）。斜めの顔なので、飾りの高さを構えの原画（150px）とそろえる（なぎ払い 192px）
X = SRC + '03_giga_extra/baran_giga_break_'
place(cut(Image.open(X + 'dash_down.png').convert('RGBA')), KP * 215 / 241, 128, 124, 'dragonbaran-dash-down')
place(cut(Image.open(X + 'dash_up.png').convert('RGBA')), KP * 215 / 241, 128, 124, 'dragonbaran-dash-up')
place(cut(Image.open(X + 'sweep.png').convert('RGBA')), KP * 150 / 192, 128, 124, 'dragonbaran-sweep')

# 技の演出：区画 → 名前
SHEETS = {
    'doruora_effect_sheet.png': ['doruora_charge', 'doruora_head_0', 'doruora_head_1', 'doruora_burst'],
    'giga_break_effect_sheet.png': ['giga_bolt', 'giga_streak', 'giga_slash', 'giga_impact'],
    'dragon_aura_effect_sheet.png': ['aura_0', 'aura_1', 'aura_ring', 'aura_burst'],
}
for sheet, names in SHEETS.items():
    im = Image.open(SRC + '02_effects/' + sheet).convert('RGBA')
    hw, hh = im.width // 2, im.height // 2
    for i, n in enumerate(names):
        c = cut(im.crop(((i % 2) * hw, (i // 2) * hh, (i % 2 + 1) * hw, (i // 2 + 1) * hh)), 16)
        s = min(1, 384 / max(c.size))
        if s < 1: c = c.resize((round(c.width * s), round(c.height * s)), Image.LANCZOS)
        c.save(OUT_F + n + '.png', optimize=True)
        a = np.array(c.getchannel('A')) > 60
        info = ''
        if n.startswith('doruora_head'):   # 竜の頭の口先（右端）の高さ：右から 15% の列の中心
            ys = np.nonzero(a[:, int(c.width * 0.85):])[0]
            info = 'mouthY %.3f' % ((ys.min() + ys.max()) / 2 / c.height)
        print(n, c.size, info)
