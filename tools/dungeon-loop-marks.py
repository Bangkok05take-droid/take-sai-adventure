# 周回ルートの印：python3 -I tools/dungeon-loop-marks.py <フォルダ>（dungeon-art-preview.js の map.json と overview_after.png）→ loops_marks.png
#  部屋（床のつながり）を1つの点、通路のマスを点にした図で、橋（切ると2つに分かれるつながり）でないものが輪の一部。
#  橙＝輪の上の通路、橙の枠＝輪の上の部屋、赤い×＝出口が1つだけの部屋（行き止まり）、赤い点＝行き止まりの通路の端
import json, os, sys
from PIL import Image, ImageDraw
D = sys.argv[1]
M = json.load(open(os.path.join(D, 'map.json'))); W, H, T = M['w'], M['h'], M['tiles']
node = [-1] * (W * H); rooms = []
for i in range(W * H):
  if T[i] == 1 and node[i] < 0:
    rid = len(rooms); st = [i]; node[i] = rid; cells = []
    while st:
      j = st.pop(); cells.append(j); x, y = j % W, j // W
      for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        xx, yy = x + dx, y + dy
        if 0 <= xx < W and 0 <= yy < H and T[yy * W + xx] == 1 and node[yy * W + xx] < 0: node[yy * W + xx] = rid; st.append(yy * W + xx)
    rooms.append(cells)
V = len(rooms)
for i in range(W * H):
  if T[i] == 2: node[i] = V; V += 1
adj = [set() for _ in range(V)]
for y in range(H):
  for x in range(W):
    a = node[y * W + x]
    if a < 0: continue
    for dx, dy in ((1, 0), (0, 1)):
      xx, yy = x + dx, y + dy
      if xx < W and yy < H:
        c = node[yy * W + xx]
        if c >= 0 and c != a: adj[a].add(c); adj[c].add(a)
# 橋（Tarjan、繰り返しで）
sys.setrecursionlimit(100000)
disc = [-1] * V; low = [0] * V; bridges = set(); t = [0]
def dfs(u, p):
  disc[u] = low[u] = t[0]; t[0] += 1
  for v in adj[u]:
    if disc[v] < 0:
      dfs(v, u); low[u] = min(low[u], low[v])
      if low[v] > disc[u]: bridges.add((min(u, v), max(u, v)))
    elif v != p: low[u] = min(low[u], disc[v])
dfs(0, -1)
onloop = set()
for u in range(V):
  for v in adj[u]:
    if (min(u, v), max(u, v)) not in bridges: onloop.add(u)
E = sum(len(a) for a in adj) // 2
im = Image.open(os.path.join(D, 'overview_after.png')).convert('RGBA'); ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
for i in range(W * H):
  n = node[i]
  if n >= len(rooms) and n in onloop:
    x, y = i % W, i // W; d.rectangle([x * 32 + 8, y * 32 + 8, x * 32 + 23, y * 32 + 23], fill=(255, 150, 30, 200))
deadR = 0; deadC = 0
for r, cells in enumerate(rooms):
  xs = [c % W for c in cells]; ys = [c // W for c in cells]; box = [min(xs) * 32 + 3, min(ys) * 32 + 3, max(xs) * 32 + 28, max(ys) * 32 + 28]
  if r in onloop: d.rectangle(box, outline=(255, 150, 30, 255), width=4)
  if len(adj[r]) == 1:
    deadR += 1; cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
    d.line([cx - 20, cy - 20, cx + 20, cy + 20], fill=(255, 40, 40, 255), width=6); d.line([cx - 20, cy + 20, cx + 20, cy - 20], fill=(255, 40, 40, 255), width=6)
for i in range(W * H):
  n = node[i]
  if n >= len(rooms) and len(adj[n]) == 1:
    deadC += 1; x, y = i % W, i // W; d.ellipse([x * 32 + 9, y * 32 + 9, x * 32 + 22, y * 32 + 22], fill=(255, 40, 40, 255))
Image.alpha_composite(im, ov).convert('RGB').save(os.path.join(D, 'loops_marks.png'))
print(os.path.basename(D.rstrip('/')), {'loops': E - V + 1, 'deadRooms': deadR, 'deadCorridors': deadC, 'rooms': len(rooms)})
