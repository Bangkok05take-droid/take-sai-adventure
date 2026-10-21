# 真大魔王バーンの技の演出と構えのポーズ（ZIP truevearn_effects_v1。ChatGPT制作。描き直しはしない）：python3 -I tools/make-truevearn-fx.py
# 元の素材：assets/reference/truevearn-effects-v1/（README は CLAUDE_README.md）
#  ・技の演出：calamity_end・calamity_wall・tenchi_mato の 00〜03.png（256×256 透過・中心が基準）をそのまま assets/fx/truevearn/ へ写す（切り抜かない・縮めない）
#  ・天地魔闘の構えのポーズ → assets/bosses/truevearn-stance.png（v3 の構え。下の説明。v1 の stance_192.png・v2 の正面の構えは使わない）
import os, shutil
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/truevearn-effects-v1/')
OUT = os.path.join(ROOT, 'assets/fx/truevearn/')
os.makedirs(OUT, exist_ok=True)
for k in ('calamity_end', 'calamity_wall', 'tenchi_mato'):
    for i in range(4):
        shutil.copyfile(SRC + '%s/%02d.png' % (k, i), OUT + '%s_%d.png' % (k, i))
# 構えのポーズ（2026年10月21日 v3：チャットで届いた新しい構えの画像 1127×1395。assets/reference/truevearn-stance-v3/source.png。採用済み）
#  （以前の v2：assets/reference/truevearn-stance-front-v2/。今は使わない）
#  通常の絵（assets/bosses/truevearn.png。96×96）と頭・胴体の大きさをそろえる：同じ目印の間の長さで、縦横同じ倍率にする（歪めない）
#   目の高さ → ベルトの赤い宝石の中心：通常 20px、v3 の原画 330px。倍率 20/330
#  足元：靴底のいちばん下の行（通常 y91・原画 y1219）と、両足の中央（通常 x48.5・原画 x558）を同じ所に置く。当たり判定は1マスのまま
#  縮小は最近傍（ドット絵のまま。表示もなめらかにしない）
idle = Image.open(os.path.join(ROOT, 'assets/bosses/truevearn.png')).convert('RGBA')
st = Image.open(os.path.join(ROOT, 'assets/reference/truevearn-stance-v3/source.png')).convert('RGBA')
K = 20 / 330
SOLE_IDLE, FOOT_X_IDLE = 91, 48.5
SOLE_ST, FOOT_X_ST = 1219, 558
body = st.resize((round(st.width * K), round(st.height * K)), Image.NEAREST)
ox, oy = round(FOOT_X_IDLE - FOOT_X_ST * K), round(SOLE_IDLE - SOLE_ST * K)
cv = Image.new('RGBA', idle.size, (0, 0, 0, 0))
cv.alpha_composite(body, (ox, oy))
bb = body.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()   # 原画の靴底の下にある、ほぼ透明なかすかな点（枠の外に出て切れる）は数えない
assert ox + bb[0] >= 0 and oy + bb[1] >= 0 and ox + bb[2] <= idle.width and oy + bb[3] <= idle.height, '枠からはみ出す'
cv.save(os.path.join(ROOT, 'assets/bosses/truevearn-stance.png'), optimize=True)
print('stance', body.size, 'at', (ox, oy), 'bbox', cv.getchannel('A').getbbox())
