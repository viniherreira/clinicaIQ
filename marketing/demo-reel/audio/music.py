"""
Compõe a trilha do reel a partir dos marcos do vídeo (out/cues.json).

    python3 audio/music.py out/cues.json audio/work/music.wav

cues.json:
  { "total": 45.0, "bpm": 120, "grid": 0.0,           # grid = tempo de uma cabeça de compasso
    "logo": 3.5,                                       # impacto da logo (cabeça de compasso)
    "groove": 7.5,                                     # entra a bateria cheia
    "lift": 27.5,                                      # segunda metade (mais brilho)
    "drop": 39.0, "cta": 39.5,                         # respiro de 1 tempo e impacto do final
    "stabs": [0.3, 1.2, 2.1],                          # batidas do gancho (cada dor)
    "glints": [12.0, 20.5]                             # brilhos de sino (estrela)
  }

Tom de Ré maior, 120 BPM. Gancho escuro (Si menor, tique-taque), virada na
logo para Sol maj7 aberto, groove G–A–F#m–Bm, e fecho em Ré.
"""
import json
import sys
import os

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import synth as S  # noqa: E402

m = S.n2m

PROG = [
    # (baixo, notas do pad, notas do arpejo)
    ('G1', ['G3', 'B3', 'D4', 'F#4'], ['G4', 'B4', 'D5', 'F#5']),
    ('A1', ['A3', 'C#4', 'E4', 'B4'], ['A4', 'C#5', 'E5', 'B5']),
    ('F#1', ['F#3', 'A3', 'C#4', 'E4'], ['F#4', 'A4', 'C#5', 'E5']),
    ('B1', ['B3', 'D4', 'F#4', 'A4'], ['B4', 'D5', 'F#5', 'A5']),
]
FINAL = ('D2', ['D4', 'F#4', 'A4', 'C#5', 'E5'], ['D5', 'F#5', 'A5', 'C#6'])
STAR_MOTIF = ['A5', 'D6', 'F#6', 'A6']  # o "brilho" da estrela


def main(cue_path, out_path, stems_dir=None):
    cue = json.load(open(cue_path))
    total = cue['total']
    bpm = cue.get('bpm', 120)
    beat = 60 / bpm
    bar = beat * 4
    grid = cue.get('grid', 0.0)
    logo = cue['logo']
    groove = cue.get('groove', logo + 2 * bar)
    lift = cue.get('lift', total)
    drop = cue.get('drop', total - 6)
    cta = cue.get('cta', drop + beat)
    end = total + 2.5  # rabo do reverb
    n = S.secs(end)

    drums = np.zeros((n, 2))
    bass = np.zeros((n, 2))
    pads = np.zeros((n, 2))
    arps = np.zeros((n, 2))
    fx = np.zeros((n, 2))
    bells = np.zeros((n, 2))

    def beats_between(a, b, step=beat, offset=0.0):
        k0 = int(np.ceil((a - grid - offset) / step - 1e-9))
        t = grid + offset + k0 * step
        out = []
        while t < b - 1e-9:
            if t >= a - 1e-9:
                out.append(round(t, 6))
            t += step
        return out

    in_drop = lambda t: drop - 1e-6 <= t < cta - 1e-6  # noqa: E731

    # ── Gancho: tensão ──────────────────────────────────────────────────────
    hook_end = logo
    drone = S.sub_bass(m('B1'), cue.get('hush', hook_end) + 0.05) * 0.4
    S.place(bass, drone, 0)
    dark = S.pad_chord([m('B2'), m('F#3'), m('C#4'), m('D4')], cue.get('hush', hook_end), attack=0.6, release=0.25, cutoff=900, detune=0.12)
    S.place(pads, dark, 0, 0.9)
    hush = cue.get('hush', hook_end)
    for i, t in enumerate(beats_between(0, hush - 0.01, beat / 2)):
        S.place(fx, S.tick(0.32 if i % 2 == 0 else 0.2), t)
    for t in cue.get('stabs', []):
        S.place(drums, S.kick(punch=0.8, length=0.35, tone=44), t, 0.75)
        stab = S.pad_chord([m('B2'), m('D3'), m('F#3')], 0.18, attack=0.003, release=0.25, cutoff=1800, detune=0.25)
        S.place(pads, stab, t, 0.9)
    rise_len = min(2.0, max(0.8, hook_end - 0.4))
    S.place(fx, S.riser(rise_len, 250, 7000, 0.32), hook_end - rise_len)
    S.place(fx, S.reverse_cymbal(1.0, 0.28), hook_end - 1.0)

    # ── Logo: impacto e abertura ────────────────────────────────────────────
    S.place(fx, S.impact(0.75), logo)
    S.place(drums, S.kick(punch=1.3, length=0.6, tone=40), logo, 0.9)
    for mo in cue.get('motifs', [{'t': logo + 0.12, 'n': 4}]):
        notes = STAR_MOTIF[:mo.get('n', 4)]
        step = beat / 4
        t0 = mo['t'] - step * (len(notes) - 1)  # a última nota cai no tempo dado
        for i, nn in enumerate(notes):
            S.place(bells, S.bell(m(nn), 1.8), t0 + i * step, 0.5 if mo.get('n', 4) == 4 else 0.42)

    # ── Harmonia do resto ───────────────────────────────────────────────────
    bars = beats_between(logo, cta, bar)
    for bi, t0 in enumerate(bars):
        chord = PROG[bi % 4]
        dur = min(bar, cta - t0)
        energy = 0.0 if t0 < groove else (1.0 if t0 < lift else 1.25)
        bright = 1800 if t0 < groove else (2600 if t0 < lift else 3400)
        pad = S.pad_chord([m(x) for x in chord[1]], dur, attack=0.25 if bi else 0.05, release=0.5, cutoff=bright)
        S.place(pads, pad, t0, 1.0)
        # Baixo: na entrada só sustenta; no groove, colcheias com pulso.
        if t0 < groove:
            S.place(bass, S.sub_bass(m(chord[0]), dur - 0.05), t0, 0.8)
        else:
            for j, tb in enumerate(beats_between(t0, t0 + dur, beat / 2)):
                if in_drop(tb):
                    continue
                note = m(chord[0]) + (12 if j % 4 == 3 else 0)
                S.place(bass, S.sub_bass(note, beat / 2 - 0.04), tb, 0.85 if j % 2 == 0 else 0.6)
        # Arpejo: colcheias na entrada, semicolcheias depois do lift.
        step = beat / 2 if t0 < lift else beat / 4
        pattern = [0, 1, 2, 3, 2, 1, 2, 3] if t0 < lift else [0, 1, 2, 3, 1, 2, 3, 2, 0, 2, 1, 3, 2, 1, 3, 2]
        for j, ta in enumerate(beats_between(t0, t0 + dur, step)):
            if in_drop(ta):
                continue
            nn = chord[2][pattern[j % len(pattern)]]
            vel = 0.55 if j % 2 == 0 else 0.4
            if t0 < groove:
                vel *= 0.7
            S.place(arps, S.pluck(m(nn), step * 0.9, bright=0.7 + 0.3 * (energy > 1)), ta, vel)

    # ── Bateria do groove ───────────────────────────────────────────────────
    k = S.kick()
    cl = S.clap()
    hc = S.hat()
    ho = S.hat(open_=True)
    sh = S.shaker()
    kicks = []
    for t in beats_between(logo + bar, cta, beat / 4):
        if in_drop(t):
            continue
        pos = round((t - grid) / beat * 4) % 16  # semicolcheia no compasso
        if t >= groove:
            if pos % 4 == 0:
                S.place(drums, k, t, 0.95)
                kicks.append(t)
            if pos in (4, 12):
                S.place(drums, cl, t, 0.42)
            if pos % 4 == 2:
                S.place(drums, ho, t, 0.16)
            if t >= lift and pos % 2 == 1:
                S.place(drums, hc, t, 0.12)
        if pos % 2 == 0 or t >= lift:
            S.place(drums, sh, t, 0.22 if pos % 4 == 2 else 0.12)
    # Virada antes do groove: palmas acelerando.
    for i, t in enumerate(beats_between(groove - beat, groove, beat / 4)):
        S.place(drums, cl, t, 0.15 + 0.07 * i)
    S.place(fx, S.riser(bar, 400, 8000, 0.2), groove - bar)

    # Brilhos agudos soltos.
    for t in cue.get('glints', []):
        S.place(bells, S.bell(m('D7'), 1.0), t, 0.22)

    # ── Respiro e final ─────────────────────────────────────────────────────
    S.place(fx, S.reverse_cymbal(1.0, 0.35), cta - 1.0)
    S.place(fx, S.riser(1.5, 500, 9000, 0.22), cta - 1.5)
    S.place(fx, S.impact(0.8), cta)
    S.place(drums, S.kick(punch=1.3, length=0.6, tone=40), cta, 0.95)
    tail = end - cta
    S.place(pads, S.pad_chord([m(x) for x in FINAL[1]], tail - 1.2, attack=0.02, release=1.6, cutoff=3800), cta, 1.1)
    S.place(bass, S.sub_bass(m(FINAL[0]), tail - 1.5), cta, 0.8)
    for i, nn in enumerate(FINAL[2] + ['D6']):
        S.place(bells, S.bell(m(nn), 2.2), cta + 0.1 + i * beat / 2, 0.32)
    # No final ainda pulsa leve até o fim do vídeo.
    for t in beats_between(cta + bar / 2, total - 0.6, beat):
        S.place(drums, k, t, 0.55)
        kicks.append(t)
    for t in beats_between(cta, total - 0.5, beat / 2):
        S.place(arps, S.pluck(m(FINAL[2][int((t - cta) / (beat / 2)) % 4]), 0.2, bright=0.6), t, 0.35)

    # ── Mixagem ─────────────────────────────────────────────────────────────
    sc = S.sidechain_env(n, kicks, depth=0.55, release=0.22)[:, None]
    pads *= sc
    bass *= S.sidechain_env(n, kicks, depth=0.75, release=0.16)[:, None]
    arps *= (0.5 + 0.5 * sc)

    ir_big = S.make_ir(2.8, 0.9, hp=350, lp=6500)
    ir_small = S.make_ir(1.2, 0.35, hp=500, lp=8000)
    arps = arps + S.pingpong(arps, beat * 0.75, 0.32, 5) * 0.5
    wet = S.reverb(pads * 0.25 + arps * 0.35 + bells * 0.5 + fx * 0.25, ir_big) + S.reverb(drums * 0.12, ir_small)

    bass = S.filt(bass, 'hp', 32)
    pads = S.filt(pads, 'peak', 2800, q=0.8, gain_db=-2.5)  # abre espaço para a voz
    arps = S.filt(arps, 'hp', 300)

    mix = drums * 0.9 + bass * 0.62 + pads * 0.75 + arps * 0.55 + bells * 0.6 + fx * 0.8 + wet * 0.55
    mix = S.filt(mix, 'lowshelf', 70, gain_db=-3.0)
    mix = S.filt(mix, 'highshelf', 9000, gain_db=1.5)
    # Fade-in curtinho e saída.
    fi = S.secs(0.01)
    mix[:fi] *= np.linspace(0, 1, fi)[:, None]
    fo0 = S.secs(total + 1.0)
    if fo0 < n:
        mix[fo0:] *= np.linspace(1, 0, n - fo0)[:, None]
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.9
    mix = S.limiter(mix, ceiling=0.89)
    S.write_wav(out_path, mix)
    if stems_dir:
        os.makedirs(stems_dir, exist_ok=True)
        for name, x in [('drums', drums), ('bass', bass), ('pads', pads), ('arps', arps), ('bells', bells), ('fx', fx)]:
            S.write_wav(os.path.join(stems_dir, f'{name}.wav'), x / (np.max(np.abs(x)) + 1e-9) * 0.8)
    print(f'ok: {out_path} ({end:.1f}s)')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
