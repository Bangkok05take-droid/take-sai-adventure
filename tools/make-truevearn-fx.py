# 真大魔王バーンの技の演出と構えのポーズ（ZIP truevearn_effects_v1。ChatGPT制作。描き直しはしない）：python3 -I tools/make-truevearn-fx.py
# 元の素材：assets/reference/truevearn-effects-v1/（README は CLAUDE_README.md）
#  ・技の演出：calamity_end・calamity_wall・tenchi_mato の 00〜03.png（256×256 透過・中心が基準）をそのまま assets/fx/truevearn/ へ写す（切り抜かない・縮めない）
#  ・天地魔闘の構えのポーズ → assets/bosses/truevearn-stance.png（v2 の正面の構え。下の説明。v1 の stance_192.png は使わない）
import os, shutil
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/truevearn-effects-v1/')
OUT = os.path.join(ROOT, 'assets/fx/truevearn/')
os.makedirs(OUT, exist_ok=True)
for k in ('calamity_end', 'calamity_wall', 'tenchi_mato'):
    for i in range(4):
        shutil.copyfile(SRC + '%s/%02d.png' % (k, i), OUT + '%s_%d.png' % (k, i))
# 構えのポーズ（2026年10月21日 v2：ZIP truevearn_stance_front_v2 の正面の構え。assets/reference/truevearn-stance-front-v2/）
#  通常の絵（assets/bosses/truevearn.png。96×96）と頭・胴体の大きさをそろえる：同じ目印の間の長さで、縦横同じ倍率にする（歪めない）
#   目の高さ → ベルトの赤い宝石の中心：通常 y47 → y67（20px）、構えの384版 y137 → y222（85px）。倍率 20/85（顔の幅 12.5px と 54px でもほぼ同じ 0.23）
#  足元：靴底のいちばん下の行（通常 y91・構え y349）と、両足の中央（通常 x48.5・構え x192.5）を同じ所に置く。当たり判定は1マスのまま
#  手や角まで、96×96 の枠に縮めずに収まる（x10〜92・y16〜93）。縮小は最近傍（ドット絵のまま。表示もなめらかにしない）
idle = Image.open(os.path.join(ROOT, 'assets/bosses/truevearn.png')).convert('RGBA')
st = Image.open(os.path.join(ROOT, 'assets/reference/truevearn-stance-front-v2/truevearn_stance_front_384.png')).convert('RGBA')
K = 20 / 85
EYE_GEM_IDLE, SOLE_IDLE, FOOT_X_IDLE = (47, 67), 91, 48.5
SOLE_ST, FOOT_X_ST = 349, 192.5
w = round(st.width * K)
body = st.resize((w, w), Image.NEAREST)
ox, oy = round(FOOT_X_IDLE - FOOT_X_ST * K), round(SOLE_IDLE - SOLE_ST * K)
cv = Image.new('RGBA', idle.size, (0, 0, 0, 0))
cv.alpha_composite(body, (ox, oy))
bb = body.getchannel('A').getbbox()
assert ox + bb[0] >= 0 and oy + bb[1] >= 0 and ox + bb[2] <= idle.width and oy + bb[3] <= idle.height, '枠からはみ出す'
cv.save(os.path.join(ROOT, 'assets/bosses/truevearn-stance.png'), optimize=True)
print('stance', (w, w), 'at', (ox, oy), 'bbox', cv.getchannel('A').getbbox())
