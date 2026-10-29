"""曲の音の立ち上がりを解析して、3難易度の譜面(charts.js)を作る
使い方: python3 tools/make_chart.py song.wav charts.js
"""
import numpy as np, scipy.io.wavfile as w, scipy.signal as s, sys, json

wav, out = sys.argv[1], sys.argv[2]
BPM, FIRST = 156.0, 0.264
sr, x = w.read(wav); x = x.astype(float) / 32768
dur = len(x) / sr
hop, n = 256, 1024
f, t, Z = s.stft(x, sr, nperseg=n, noverlap=n - hop)
M = np.log1p(100 * np.abs(Z))
D = np.maximum(0, np.diff(M, axis=1))
flux = D.sum(0); flux = (flux - np.median(flux)) / flux.std()
fps = sr / hop
bands = [(0, 250), (250, 1000), (1000, 3000), (3000, 11000)]
bandflux = np.array([D[(f >= lo) & (f < hi)].sum(0) for lo, hi in bands])
bandflux /= bandflux.std(axis=1, keepdims=True)

per8 = 60 / BPM / 2
grid = np.arange(FIRST, dur - 1.2, per8)

def strength(tm):
    i = int(tm * fps); a, b = max(0, i - 3), min(len(flux), i + 4)
    return flux[a:b].max(), bandflux[:, a:b].max(axis=1)

pts = []
for k, tm in enumerate(grid):
    st, bf = strength(tm)
    pts.append(dict(k=k, t=round(float(tm), 4), s=float(st), bf=bf))

rng = np.random.default_rng(7)

def lane_for(p, prev, prev2):
    # 低い音は左、高い音は右。同じレーンが3連続しないようにする
    bf = p['bf'] / (p['bf'].max() + 1e-9)
    score = bf + rng.normal(0, 0.35, 4) - 0.25 * recent
    if prev >= 0 and prev == prev2:
        score[prev] -= 9
    lane = int(np.argmax(score))
    recent[:] *= 0.7; recent[lane] += 1
    return lane

recent = np.zeros(4)

def make(step, thr, chord_thr=None, min_gap=1):
    notes, last_k, prev, prev2 = [], -99, -1, -1
    for p in pts:
        k = p['k']
        if k % step: continue
        # 拍頭(4分)は少し出やすく、裏拍は強い音だけ
        on_beat = k % 2 == 0
        need = thr if on_beat else thr + 0.6
        if p['s'] < need or k - last_k < min_gap: continue
        lane = lane_for(p, prev, prev2)
        notes.append([p["t"], int(lane)])
        if chord_thr is not None and p['s'] > chord_thr and k % 4 == 0:
            other = (lane + 2) % 4
            notes.append([p["t"], int(other)])
        prev2, prev, last_k = prev, lane, k
    return notes

charts = {
    'easy':   make(step=2, thr=0.9, min_gap=4),
    'normal': make(step=2, thr=0.4, min_gap=2),
    'hard':   make(step=1, thr=1.1, chord_thr=3.2, min_gap=1),
}
for k, v in charts.items():
    print(k, len(v), 'notes', round(len(v) / dur, 2), '/s')
with open(out, 'w') as fo:
    fo.write('// 譜面データ（自動生成）。[秒, レーン(0〜3)] の並び。\n')
    fo.write('// tools/make_chart.py で作り直せます。手で書き足してもOK。\n')
    fo.write('window.SONG = ' + json.dumps({'bpm': BPM, 'firstBeat': FIRST, 'duration': round(dur, 2)}) + ';\n')
    fo.write('window.CHARTS = {\n')
    for k, v in charts.items():
        fo.write(f'  {k}: ' + json.dumps(v, separators=(',', ':')) + ',\n')
    fo.write('};\n')
