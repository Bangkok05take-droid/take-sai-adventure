# レンガの回廊 v2（ZIP brick_match_v2。承認図 approved_board.png から切り出した部品。描き直しはしない）：python3 -I tools/make-brick-v2.py
# 元：assets/reference/brick-match-v2/assets/（どれもゲームの1マス32pxの大きさで切り出し済み）→ assets/dungeon/brick_v2/
#  floor_4x4（128×128＝4×4マス）・wall_arch（4×3マス）・wall_banner（2×3マス）・wall_narrow（1×3マス）はそのまま
#  edge_left（部屋の左の壁の縁＝床が右）→ rimE、edge_right（部屋の右の壁の縁＝床が左）→ rimW、edge_bottom（部屋の下の壁の縁＝床が上）→ rimN
#  corner_bottom_left（部屋の左下の角）→ jInNE（斜め右上だけ床の壁のマス）。右下の角 jInNW はその左右反転（仮。専用の絵は無い）
import os, shutil
from PIL import Image, ImageOps
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets/reference/brick-match-v2/assets/'); OUT = os.path.join(ROOT, 'assets/dungeon/brick_v2/')
os.makedirs(OUT, exist_ok=True)
for a, b in [('floor_4x4', 'floor_0'), ('wall_arch', 'arch'), ('wall_banner', 'banner'), ('wall_narrow', 'narrow3'),
             ('edge_left', 'rimE'), ('edge_right', 'rimW'), ('edge_bottom', 'rimN'), ('corner_bottom_left', 'jInNE')]:
  shutil.copyfile(SRC + a + '.png', OUT + b + '.png')
ImageOps.mirror(Image.open(SRC + 'corner_bottom_left.png')).save(OUT + 'jInNW.png')
print('ok')

# 補修素材 v3（ZIP brick_repair_v3、2026年10月24日）：assets/reference/brick-repair-v3/assets/ の15点で、壁3種と角を差し替え・追加
#  壁（左右6pxが共通の柱の半分。並べると柱1本になる）：wall_arch → arch、wall_banner → banner、wall_narrow → narrow3
#  角：lower_left/right（部屋の左下・右下）→ jInNE/jInNW、outer_nw/ne/sw/se（出っ張った角）、upper_left/right（左右の縁が正面の壁の上端に届く所）、
#      end_left/right（左右の縁が正面の壁の上で終わる所）、end_bottom_left/right（下の縁が通路の口で終わる所）
R3 = os.path.join(ROOT, 'assets/reference/brick-repair-v3/assets/')
# 角の部品は線の太さ（約8px）が今の縁（左右16px・下24px）と合わず、継ぎ目がかえって目立ったので、ゲームでは使わない（D.DUNGEON_V2_CORNERS = false）。
# 部屋の左下・右下の角は brick_match_v2 の角（jInNE・その反転 jInNW）のまま。lower_left/right は lower_l/lower_r の名前で置いておく
for a, b in [('wall_arch', 'arch'), ('wall_banner', 'banner'), ('wall_narrow', 'narrow3'), ('lower_left', 'lower_l'), ('lower_right', 'lower_r'),
             ('outer_nw', 'outer_nw'), ('outer_ne', 'outer_ne'), ('outer_sw', 'outer_sw'), ('outer_se', 'outer_se'), ('upper_left', 'upper_left'),
             ('upper_right', 'upper_right'), ('end_left', 'end_left'), ('end_right', 'end_right'), ('end_bottom_left', 'end_bl'), ('end_bottom_right', 'end_br')]:
  shutil.copyfile(R3 + a + '.png', OUT + b + '.png')
print('repair v3 ok')
