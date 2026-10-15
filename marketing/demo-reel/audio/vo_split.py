"""
Corta a narração em falas pelos silêncios e mede cada uma.

    python3 audio/vo_split.py audio/vo/take.mp3 --expect 9 [--min-sil 0.28] [--thresh -38]

Grava audio/vo/seg_XX.wav (com 30 ms de folga em cada ponta) e imprime um JSON
com início, fim e duração de cada fala no arquivo original.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import synth as S  # noqa: E402


def load(path):
    out = path + '.48k.wav'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-ar', str(S.SR), '-ac', '2', out], check=True)
    return S.read_wav(out)


def rms_db(x, win=0.02):
    n = S.secs(win)
    mono = x.mean(axis=1)
    pad = np.pad(mono, (n // 2, n - n // 2 - 1), mode='edge')
    sq = np.convolve(pad ** 2, np.ones(n) / n, mode='valid')
    return 10 * np.log10(sq + 1e-12)


def split(x, thresh=-38.0, min_sil=0.28, min_seg=0.25):
    db = rms_db(x)
    voiced = db > thresh
    segs = []
    i = 0
    n = len(voiced)
    while i < n:
        if not voiced[i]:
            i += 1
            continue
        j = i
        while j < n:
            if voiced[j]:
                j += 1
                continue
            k = j
            while k < n and not voiced[k]:
                k += 1
            if (k - j) / S.SR >= min_sil or k >= n:
                break
            j = k
        if (j - i) / S.SR >= min_seg:
            segs.append((i / S.SR, j / S.SR))
        i = j + 1
    return segs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--expect', type=int, default=0)
    ap.add_argument('--thresh', type=float, default=-38.0)
    ap.add_argument('--min-sil', type=float, default=0.28)
    ap.add_argument('--out', default=None)
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    x = load(a.src)
    segs = split(x, a.thresh, a.min_sil)
    res = []
    outdir = a.out or os.path.join(os.path.dirname(a.src), 'segs')
    if a.write:
        os.makedirs(outdir, exist_ok=True)
    for idx, (s0, s1) in enumerate(segs):
        lo = max(0.0, s0 - 0.03)
        hi = min(len(x) / S.SR, s1 + 0.06)
        if a.write:
            seg = x[S.secs(lo):S.secs(hi)].copy()
            fade = S.secs(0.012)
            seg[:fade] *= np.linspace(0, 1, fade)[:, None]
            seg[-fade:] *= np.linspace(1, 0, fade)[:, None]
            S.write_wav(os.path.join(outdir, f'seg_{idx:02d}.wav'), seg)
        res.append({'i': idx, 'start': round(lo, 3), 'end': round(hi, 3), 'dur': round(hi - lo, 3)})
    print(json.dumps({'file': a.src, 'total': round(len(x) / S.SR, 3), 'count': len(res), 'expect': a.expect, 'segments': res}, indent=1))


if __name__ == '__main__':
    main()
