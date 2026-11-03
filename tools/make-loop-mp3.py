# ループする録音の曲を MP3 にする：python3 -I tools/make-loop-mp3.py <元のWAV> <出力MP3> [前後の余白（秒）=0.5] [曲の終わり（秒）] [終わりのフェード（ミリ秒）]
# MP3 は再生する機器によって頭に数ミリ秒のずれが入るので、そのままループするとつなぎ目でわずかに途切れる。
# そこで「曲の最後の0.5秒＋曲の全体＋曲の最初の0.5秒」をつないで書き出し、ゲーム側は 0.5秒〜0.5秒＋曲の長さ を
# ループする（js/music.js の loopStart・loopEnd）。ずれがあっても、ちょうど1周分の長さを切り出すので、つなぎ目は元の曲どおりになる
import subprocess, sys, wave, os, tempfile
import numpy as np
src, out = sys.argv[1], sys.argv[2]
pad = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
w = wave.open(src); sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth(); assert sw == 2
a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, ch)
# 曲の終わり（秒）：最後に無音が入っている曲は、ループの長さ（小節の切れ目）で切る（例：ボス戦の曲は 150BPM・16小節 ＝ 25.6秒）
if len(sys.argv) > 4: a = a[:int(round(float(sys.argv[4]) * sr))]
# 終わりのフェード（ミリ秒）：切った所の音が大きく、曲の頭（無音から始まる）へ跳ぶと「プチッ」と鳴るので、最後の数ミリ秒だけ消していく
if len(sys.argv) > 5:
  f = int(round(float(sys.argv[5]) / 1000 * sr)); a = a.astype(np.float64)
  a[-f:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, f)))[:, None]
  a = np.round(a).astype(np.int16)
k = int(round(pad * sr))
b = np.concatenate([a[-k:], a, a[:k]])
tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False).name
o = wave.open(tmp, 'wb'); o.setnchannels(ch); o.setsampwidth(2); o.setframerate(sr); o.writeframes(b.tobytes()); o.close()
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', '192k', out], check=True)
os.unlink(tmp)
print(out, 'loopStart', pad, 'loopEnd', round(pad + len(a) / sr, 6))
