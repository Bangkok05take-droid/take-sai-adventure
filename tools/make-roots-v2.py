# 木の根の遺跡 v2（ZIP roots_match_v1。承認図から切り出した部品。描き直しはしない）：python3 -I tools/make-roots-v2.py
# 元：assets/reference/roots-match-v1/assets/（ゲームの1マス32pxで切り出し済み）→ assets/dungeon/roots_v2/
#  床 floor_4x4（4×4マス）・正面の壁（3マスの高さ）：wall_roots（4マス）・wall_shrine（3マス、石壁と灯り）・wall_roots_right（4マス）・wall_narrow（1マス）
#  縁：edge_left → rimE（床が右）、edge_right → rimW（床が左）、edge_bottom → rimN（床が上）。角：corner_lower_left/right → jInNE/jInNW（部屋の左下・右下）、
#  corner_upper_left/right → upper_left/right（左右の縁が正面の壁の上端に届く所）
import os, shutil
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/roots-match-v1/assets/'); OUT = os.path.join(ROOT, 'assets/dungeon/roots_v2/')
os.makedirs(OUT, exist_ok=True)
for a, b in [('floor_4x4', 'floor_0'), ('wall_roots', 'wallRoots'), ('wall_shrine', 'shrine'), ('wall_roots_right', 'wallRootsR'), ('wall_narrow', 'narrow3'),
             ('edge_left', 'rimE'), ('edge_right', 'rimW'), ('edge_bottom', 'rimN'), ('corner_lower_left', 'jInNE'), ('corner_lower_right', 'jInNW'),
             ('corner_upper_left', 'upper_left'), ('corner_upper_right', 'upper_right')]:
  shutil.copyfile(SRC + a + '.png', OUT + b + '.png')
print('ok')
