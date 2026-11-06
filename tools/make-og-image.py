# リンクを送ったときに出る画像（OGP。1200×1200の正方形）：python3 -I tools/make-og-image.py
# タイトルの背景（人物なし）を扉が中心になるよう正方形に切り、上にロゴを重ねるだけ（人物は出さない。2026年11月6日のご指定の見本どおり）
import os
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
P = lambda *a: os.path.join(ROOT, *a)
S = 1200
bg = Image.open(P('assets/reference/thai_title_parts_v1/title_bg.png')).convert('RGBA')
X0, Y0, SZ = 67, 22, 890   # 背景（1024×1536）の中の正方形：空・両側の塔と像・扉・階段の上がりはじめまで（見本の切り方）
cv = bg.crop((X0, Y0, X0 + SZ, Y0 + SZ)).resize((S, S), Image.LANCZOS)
logo = Image.open(P('assets/reference/thai_title_parts_v1/title_logo.png')).convert('RGBA')
lw = 1180; logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
cv.alpha_composite(logo, ((S - lw) // 2, 12))
cv.convert('RGB').save(P('og-image.jpg'), quality=88, optimize=True)
print('og-image.jpg', cv.size, os.path.getsize(P('og-image.jpg')))
