"""通常の敵の見本（ドット絵の一覧画像）から、ゲームで使う透過画像を作る。
  python3 tools/extract-enemies.py 設定.json [出力先]
設定（JSON）の例：
  {
    "sheet": "assets/reference/enemies.png",
    "takeBox": [1186, 600, 1536, 1024],      // 見本の中の比較用のたけ（大きさの基準。素材にはしない）。無ければ "scale": 0.15 などで指定
    "enemies": {
      "frog":   { "frames": [[0, 0, 300, 300], [300, 0, 600, 300]] },   // 待機の2コマ（1コマだけでもよい）
      "turtle": { "frames": [[600, 0, 900, 300]] }
    }
  }
- 背景（単色・グラデーション・光のにじみ）は外周から取り除く（tools/artcut.py）。黒い輪郭・黒い体は残る。
- 縮小率は、比較用のたけがゲームのたけ（背丈48ドット）と同じ背丈になる値。こうすると見本どおりの大きさの比になる。
- 出力：assets/enemies/<sprite名>.png。1コマはキャンバス 64×64（足の裏 y=60、足元の中央 x=32）。2コマなら横に並べて 128×64。
- js/assets.js の TS.ASSETS.enemies に「sprite名: パス」を書くとゲームで使われる（書かなければ今までの絵のまま）。"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from artcut import cutout, shrink, bbox, place

ROOT = os.path.join(os.path.dirname(__file__), '..')
CW, CH, FOOT = 64, 64, 60
TAKE_GAME_H = 48


def main():
    cfg = json.load(open(sys.argv[1]))
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'assets', 'enemies')
    os.makedirs(out, exist_ok=True)
    im = np.asarray(Image.open(os.path.join(ROOT, cfg['sheet'])).convert('RGB'))
    if 'takeBox' in cfg:
        x0, y0, x1, y1 = cfg['takeBox']
        ty0, ty1, _, _ = bbox(cutout(im[y0:y1, x0:x1]))
        k = TAKE_GAME_H / (ty1 - ty0 + 1)
    else:
        k = float(cfg['scale'])
    print('scale', round(k, 4))
    sizes = {}
    for name, spec in cfg['enemies'].items():
        frames = []
        for (x0, y0, x1, y1) in spec['frames']:
            a = im[y0:y1, x0:x1]
            c, size = place(shrink(a, cutout(a), k), CW, CH, FOOT)
            frames.append(c); sizes[name] = size
        sheet = np.concatenate(frames, axis=1)
        Image.fromarray(sheet, 'RGBA').save(os.path.join(out, name + '.png'))
        print(name, len(frames), 'frames', sizes[name])
    json.dump({'scale': k, 'canvas': [CW, CH], 'foot': FOOT, 'sprites': sizes}, open(os.path.join(out, 'sizes.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
