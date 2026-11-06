# リンクを送ったときに出る画像（OGP。1200×630）：python3 -I tools/make-og-image.py
# タイトルの背景（人物なし）＋ロゴ＋たけ・サイ（ドット絵を整数倍で）＋大魔王バーン（奥に大きく、少し暗く）。文字の説明は焼き込まない
import os
from PIL import Image, ImageEnhance, ImageFilter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
P = lambda *a: os.path.join(ROOT, *a)
W, H = 1200, 630
bg = Image.open(P('assets/reference/thai_title_parts_v1/title_bg.png')).convert('RGBA')
k = W / bg.width
bg = bg.resize((W, round(bg.height * k)), Image.LANCZOS)
Y0 = 470   # 扉の紋章（y≈37%）と階段が入る位置
cv = bg.crop((0, Y0, W, Y0 + H))
# 下と左右を少し暗く（文字と人物を立たせる）
sh = Image.new('L', (W, H), 0)
for y in range(H):
    for_line = int(max(0, (y - H * 0.55) / (H * 0.45)) * 120)
    sh.paste(for_line, (0, y, W, y + 1))
cv = Image.composite(Image.new('RGBA', (W, H), (10, 18, 10, 255)), cv, sh)
# 大魔王バーン：扉の右奥に大きく（暗く・少しにじませて「待ち構える」感じ）
boss = Image.open(P('assets/bosses/vearn.png')).convert('RGBA')
boss = boss.crop(boss.getbbox())
bh = 470; boss = boss.resize((round(boss.width * bh / boss.height), bh), Image.NEAREST)
glow = boss.copy(); glow = ImageEnhance.Brightness(glow).enhance(0.0)
a = glow.getchannel('A').filter(ImageFilter.GaussianBlur(14)); glowc = Image.new('RGBA', boss.size, (170, 60, 255, 0)); glowc.putalpha(a.point(lambda v: int(v * 0.8)))
bx, by = W - boss.width - 40, H - bh - 10
cv.alpha_composite(glowc, (bx, by)); cv.alpha_composite(boss, (bx, by))
# たけ・サイ：手前の左下（ドット絵を整数倍）
def char(f, s, x, foot):
    im = Image.open(P('assets/chars', f)).convert('RGBA'); im = im.crop(im.getbbox())
    im = im.resize((im.width * s, im.height * s), Image.NEAREST)
    shadow = Image.new('RGBA', (im.width, 18), (0, 0, 0, 0))
    from PIL import ImageDraw
    ImageDraw.Draw(shadow).ellipse((4, 0, im.width - 4, 17), fill=(0, 0, 0, 110))
    cv.alpha_composite(shadow, (x, foot - 10)); cv.alpha_composite(im, (x, foot - im.height))
char('sai_front.png', 5, 70, H - 22)
char('take_front.png', 6, 240, H - 14)
# ロゴ：左上
logo = Image.open(P('assets/reference/thai_title_parts_v1/title_logo.png')).convert('RGBA')
lw = 640; logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
cv.alpha_composite(logo, (10, 4))
cv.convert('RGB').save(P('og-image.jpg'), quality=88, optimize=True)
print('og-image.jpg', cv.size, os.path.getsize(P('og-image.jpg')))
