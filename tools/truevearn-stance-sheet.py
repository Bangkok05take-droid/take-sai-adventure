# 天地魔闘の構えの比較の画像：python3 -I tools/truevearn-stance-sheet.py（先に node tools/truevearn-stance-compare.js）
# 幅ごとに「通常 → 構え → 通常」を同じ範囲で切り抜いて並べる。上の段＝エフェクトなし、下の段＝エフェクトあり。
# 線：緑＝足の裏（96×96の絵の y91）、青＝目の高さ（y47）、橙＝ベルトの宝石（y67）。どれも同じ高さに来れば、頭・胴の大きさと足元がそろっている
import json, os
from PIL import Image, ImageDraw
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'docs', 'truevearn-stance-v2')
crops = json.load(open(os.path.join(OUT, 'crops.json')))
for c in crops:
    x, y, w, h = c['rect']; cv = c['canvas']; dpr = 2
    k = c['canvas']['s'] * dpr                       # キャンバスの1ピクセル → 画面写真のピクセル
    X, Y, S = (cv['x'] * dpr + x * k), (cv['y'] * dpr + y * k), w * k   # 96×96 の枠
    box = (round(X - S * 0.15), round(Y - S * 0.1), round(X + S * 1.15), round(Y + S * 1.05))
    tiles = [Image.open(f).convert('RGB').crop(box) for f in c['files']]
    tw, th = tiles[0].size
    sheet = Image.new('RGB', (tw * 3 + 20, th * 2 + 40), (30, 30, 40))
    d = ImageDraw.Draw(sheet)
    for i, t in enumerate(tiles):
        ox, oy = (i % 3) * (tw + 10), (i // 3) * (th + 10) + 30
        sheet.paste(t, (ox, oy))
        for yy, col in ((91.5, (0, 200, 0)), (47, (0, 120, 255)), (67, (255, 140, 0))):
            ly = oy + (Y + S * yy / 96) - box[1]
            d.line([(ox, ly), (ox + tw, ly)], fill=col, width=1)
    for i, t in enumerate(['通常', '構え', '通常（戻った）']):
        d.text((i * (tw + 10) + 6, 8), ['idle', 'stance', 'idle again'][i], fill=(255, 255, 255))
    sheet.save(os.path.join(OUT, 'compare_%d.png' % c['W']))
    print('compare_%d.png' % c['W'], sheet.size)
    for f in c['files']: os.remove(f)   # 画面の写真は比べる画像を作ったら消す（リポジトリを重くしない）
os.remove(os.path.join(OUT, 'crops.json'))
