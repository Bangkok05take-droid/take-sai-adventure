# 通常バラン戦の部屋の素材を作る：python3 -I tools/make-baran-room.py
# 元の素材（ChatGPT制作。描き直しはしない）：assets/reference/baran-room-v1/
#   baran_room.png（941×1672）→ assets/rooms/baran-room.webp（同じ大きさ）
#     ※仮のつぎあて：左の壁の開口（旧入口。絵の x0〜104・y857〜927）は通れないので、同じ絵の左の壁（y990〜1060）を写して閉じる。
#       ChatGPT の直した絵が届いたら、このつぎあては外す（PATCH を空にする）
#   baran_throne.png（透過あり）→ 透明な余白を切り落として高さ260（ゲームでは130px＝2.6マス相当で描く。倍の細かさ）→ assets/rooms/baran-throne.png
import os
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/baran-room-v1/')
OUT = os.path.join(ROOT, 'assets/rooms/')
PATCH = [((0, 990, 104, 1060), (0, 857))]   # (写す範囲, 貼る左上)。下の炎の台の下の壁の柱を写す
bg = Image.open(SRC + 'baran_room.png').convert('RGB')
for box, at in PATCH:
    bg.paste(bg.crop(box), at)
bg.save(OUT + 'baran-room.webp', 'WEBP', quality=92, method=6)
th = Image.open(SRC + 'baran_throne.png').convert('RGBA')
th = th.crop(th.getchannel('A').getbbox())
h = 260
th = th.resize((round(th.width * h / th.height), h), Image.LANCZOS)
th.save(OUT + 'baran-throne.png', optimize=True)
print('bg', bg.size, 'throne', th.size)
