"""村の木・川・こもれびの家（2026年10月、ZIP take-sai-community-nature-v1）の完成素材から、村で描く大きさのPNGを作る。
元の素材は assets/reference/community-nature-v1/ にそのまま置いてある（描き直しはしない）。
- こもれびの家（community-house.png、1536×1024）：透明度200以上の範囲で切り、0.1倍（約117×96）。
  「村の発展」の敷地（4マス×3マス＝128×96）に収まり、サイの店と同じくらいの大きさ。階段の下の端が足元。
- 白い花の広葉樹（flowering-tree.png、1312×1199）：透明度200以上の範囲で切り、幅64（2マス）に縮める。幹の根元が足元。
- 水面（river-water.png、1254×1254、不透明）：256×256 に縮める（面積の平均）。村では世界の座標で、交互に反転して並べる（512で1周）。
縮小は面積の中央値（artcut.shrink。にじませない）。水面は面積の平均（なめらかな模様なので）。
使い方：python3 tools/extract-community.py"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from artcut import shrink

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'reference', 'community-nature-v1', 'assets')
OUT = os.path.join(ROOT, 'assets', 'village', 'community')


def cut(name, k):
    a = np.asarray(Image.open(os.path.join(SRC, name)).convert('RGBA'))
    fg = a[:, :, 3] >= 200
    ys, xs = np.nonzero(fg)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    c, f = a[box[1]:box[3], box[0]:box[2], :3], fg[box[1]:box[3], box[0]:box[2]]
    return shrink(c, f, k), box


def main():
    os.makedirs(OUT, exist_ok=True)
    info = {}
    house, box = cut('community-house.png', 0.1)
    Image.fromarray(house, 'RGBA').save(os.path.join(OUT, 'house.png'))
    # 看板の中心（元の絵の約 768,420）を、縮めた絵の中の位置へ
    info['house'] = {'size': [house.shape[1], house.shape[0]], 'sign': [round((768 - box[0]) * house.shape[1] / (box[2] - box[0])), round((420 - box[1]) * house.shape[0] / (box[3] - box[1]))]}
    tree, box = cut('flowering-tree.png', 64 / 1257)
    Image.fromarray(tree, 'RGBA').save(os.path.join(OUT, 'tree.png'))
    info['tree'] = {'size': [tree.shape[1], tree.shape[0]]}
    w = Image.open(os.path.join(SRC, 'river-water.png')).convert('RGB').resize((256, 256), Image.BOX)
    w.save(os.path.join(ROOT, 'assets', 'village', 'ground', 'water.png'))
    print(json.dumps(info))


if __name__ == '__main__':
    main()
