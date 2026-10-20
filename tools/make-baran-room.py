# 通常バラン戦の部屋の素材を作る：python3 -I tools/make-baran-room.py
# 元の素材（ChatGPT制作。描き直しはしない）：
#   assets/reference/baran-room-v2/baran_room_closed.png（941×1672。v1 の左の旧入口を閉じた版）→ assets/rooms/baran-room.webp（同じ大きさ）
#     v1 で入れていた仮のつぎあて（PATCH）は、閉じた版が届いたので外した（PATCH は空）
#   assets/reference/baran-room-v2/baran_room_extended.png（941×1972。下に前室を足した版）→ 継ぎ目が残っているので、ゲームの背景には使わない。
#     配置の確認用（node tools/baran-room-check.js が D.BARAN_ROOM_EXT で読み込む）。仕上がった版が届いたら baran-room.webp をこれに替える
#   assets/reference/baran-room-v1/baran_throne.png（透過あり）→ 透明な余白を切り落として高さ320（ゲームでは160px＝3.2マス相当で描く。倍の細かさ）→ assets/rooms/baran-throne.png
import os
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/baran-room-v2/')
SRC1 = os.path.join(ROOT, 'assets/reference/baran-room-v1/')
OUT = os.path.join(ROOT, 'assets/rooms/')
PATCH = []   # (写す範囲, 貼る左上)。v1 の仮のつぎあて ((0, 990, 104, 1060), (0, 857)) は外した
bg = Image.open(SRC + 'baran_room_closed.png').convert('RGB')
for box, at in PATCH:
    bg.paste(bg.crop(box), at)
bg.save(OUT + 'baran-room.webp', 'WEBP', quality=92, method=6)
th = Image.open(SRC1 + 'baran_throne.png').convert('RGBA')
th = th.crop(th.getchannel('A').getbbox())
h = 320
th = th.resize((round(th.width * h / th.height), h), Image.LANCZOS)
th.save(OUT + 'baran-throne.png', optimize=True)
print('bg', bg.size, 'throne', th.size)
