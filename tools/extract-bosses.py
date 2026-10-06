"""デザイン見本「ボス7体」（assets/reference/bosses.png）からボスの透過画像を作る。
  python3 tools/extract-bosses.py
- 見本のドットは格子がそろっていない（1ドット約6ピクセルで場所により揺れる）ので、格子へ無理に合わせず、
  背景を取り除いてから面積平均で縮小する。縮小率は、同じ見本の右下のたけ（比較用）がゲームのたけ（背丈48ドット）と
  同じ背丈になる値。こうすると見本どおりの「たけとの大きさの比」になる。
- 背景（暗いグラデーションと色の光）は、外周から「となりとの色の差が小さい所」だけをたどって消す。
  ドット絵の輪郭（黒）との境目は色の差が大きいので、そこで止まる（黒い衣装・輪郭は残る）。
- 出力：assets/bosses/<id>.png（1ドット＝1ピクセル、キャンバス 96×96、足の裏は y=92、足元の中央は x=48）。
  比較用のたけは素材にしない（大きさの基準を測るだけ）。"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from artcut import cutout, shrink, bbox, place

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'reference', 'bosses.png')
OUT = os.path.join(ROOT, 'assets', 'bosses')
CW, CH, FOOT = 96, 96, 92
TAKE_GAME_H = 48                    # ゲームのたけの背丈（assets/chars/take_front.png）
# 見本の中の範囲（左, 上, 右, 下）。となりの絵にかからないように区切る
BOXES = {
    'croc': (0, 0, 438, 528), 'flame': (438, 0, 792, 528), 'kill': (792, 0, 1188, 528), 'baran': (1188, 0, 1536, 528),
    'mist': (0, 528, 412, 1024), 'vearn': (412, 528, 782, 1024), 'truevearn': (782, 528, 1186, 1024),
    '_take': (1186, 600, 1536, 1024),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    im = np.asarray(Image.open(SRC).convert('RGB'))
    cut = {}
    for name, (x0, y0, x1, y1) in BOXES.items():
        a = im[y0:y1, x0:x1]
        fg = cutout(a)
        cut[name] = (a, fg)
    y0, y1, _, _ = bbox(cut['_take'][1])
    k = TAKE_GAME_H / (y1 - y0 + 1)
    info = {'scale': k, 'canvas': [CW, CH], 'foot': FOOT, 'sprites': {}}
    print('take height in sheet', y1 - y0 + 1, 'scale', round(k, 4))
    for name, (a, fg) in cut.items():
        if name.startswith('_'): continue
        c, (w, h) = place(shrink(a, fg, k), CW, CH, FOOT)
        Image.fromarray(c, 'RGBA').save(os.path.join(OUT, name + '.png'))
        info['sprites'][name] = [w, h]
        print(name, w, h)
    with open(os.path.join(OUT, 'sizes.json'), 'w') as f: json.dump(info, f, indent=1)


if __name__ == '__main__':
    main()
