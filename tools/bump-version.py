# 公開するたびに、index.html の js・css の読み込みに版の印（?v=…）を付け直す：python3 -I tools/bump-version.py
# GitHub Pages はファイルを10分ほど覚えておく（キャッシュ）ので、更新の直後に開くと、新しいファイルと古いファイルが混ざって
# 動かなくなることがある（2026年11月20日：再戦の出発で荷物が消えた件）。印を変えると、ブラウザは必ず全部を新しく読み直す
import os, re, time
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
v = time.strftime('%Y%m%d%H%M')
s = open(P, encoding='utf-8').read()
s2 = re.sub(r'((?:src|href)="(?:js|css)/[^"?]+\.(?:js|css))(?:\?v=[0-9a-z]+)?"', r'\1?v=' + v + '"', s)
open(P, 'w', encoding='utf-8').write(s2)
print('version', v, 'tags', len(re.findall(r'\?v=' + v, s2)))
