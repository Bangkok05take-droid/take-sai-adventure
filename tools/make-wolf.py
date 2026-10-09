# ティウの相棒のオオカミ（ChatGPT制作の完成画像）を、村の人物と同じ細かさに縮める。描き直さない（縮小と透明部分の整理だけ）。
# python3 -I tools/make-wolf.py [元の画像] [出力]   既定：assets/reference/tiw-wolf-v1/wolf-original.png → assets/village/wolf.png
# 高さ：ティウ（見える高さ約47ドット）の約8割＝耳の先から足の裏まで38ドット。横はそれに合わせる。半透明の縁は128を境に透明か不透明にする（ほかの人物と同じくっきりした縁）
import sys
from PIL import Image
src = sys.argv[1] if len(sys.argv) > 1 else 'assets/reference/tiw-wolf-v1/wolf-original.png'
out = sys.argv[2] if len(sys.argv) > 2 else 'assets/village/wolf.png'
H = 38
im = Image.open(src).convert('RGBA')
a = im.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
im.putalpha(a)
im = im.crop(a.getbbox())
w = round(im.width * H / im.height)
al = im.getchannel('A').resize((w, H), Image.LANCZOS)
small_rgb = im.convert('RGB').resize((w, H), Image.LANCZOS)
outim = Image.merge('RGBA', (*small_rgb.split(), al.point(lambda v: 255 if v >= 110 else 0)))
outim.save(out)
print(out, outim.size)
