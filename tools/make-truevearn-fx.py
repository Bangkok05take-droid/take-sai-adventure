# 真大魔王バーンの技の演出と構えのポーズ（ZIP truevearn_effects_v1。ChatGPT制作。描き直しはしない）：python3 -I tools/make-truevearn-fx.py
# 元の素材：assets/reference/truevearn-effects-v1/（README は CLAUDE_README.md）
#  ・技の演出：calamity_end・calamity_wall・tenchi_mato の 00〜03.png（256×256 透過・中心が基準）をそのまま assets/fx/truevearn/ へ写す（切り抜かない・縮めない）
#  ・天地魔闘の構えのポーズ：truevearn_stance/stance_192.png を、今の待機の絵（assets/bosses/truevearn.png。96×96・足の裏 y=92）と
#    見える高さ（不透明の範囲の高さ）と足元（下の端・横の中央）がそろうように縮めて、96×96 に置く → assets/bosses/truevearn-stance.png
import os, shutil
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/truevearn-effects-v1/')
OUT = os.path.join(ROOT, 'assets/fx/truevearn/')
os.makedirs(OUT, exist_ok=True)
for k in ('calamity_end', 'calamity_wall', 'tenchi_mato'):
    for i in range(4):
        shutil.copyfile(SRC + '%s/%02d.png' % (k, i), OUT + '%s_%d.png' % (k, i))
idle = Image.open(os.path.join(ROOT, 'assets/bosses/truevearn.png')).convert('RGBA')
ib = idle.getchannel('A').getbbox()   # (左, 上, 右, 下)
st = Image.open(SRC + 'truevearn_stance/stance_192.png').convert('RGBA')
sb = st.getchannel('A').getbbox()
body = st.crop(sb)
h = ib[3] - ib[1]
w = round(body.width * h / body.height)
body = body.resize((w, h), Image.LANCZOS)
cv = Image.new('RGBA', idle.size, (0, 0, 0, 0))
foot = ib[3]                                  # 足の裏（下の端）をそろえる
cx = (ib[0] + ib[2]) / 2                      # 横は不透明の範囲の中央をそろえる
cv.paste(body, (round(cx - w / 2), foot - h), body)
cv.save(os.path.join(ROOT, 'assets/bosses/truevearn-stance.png'), optimize=True)
print('idle bbox', ib, 'stance bbox', sb, '->', (w, h), 'at', (round(cx - w / 2), foot - h))
