"""
Sintetizador da trilha do reel (numpy + scipy), feito do zero.

Instrumentos: bumbo, palma, chimbal, shaker, baixo sub, pad "supersaw",
pluck com filtro, sino FM, riser, impacto e prato invertido. Mais: filtros
biquad (RBJ), reverb por convolução, delay ping-pong, sidechain e limitador.

Tudo em estéreo float32 a 48 kHz. As funções devolvem arrays (n, 2) ou (n,).
"""
import numpy as np
from scipy import signal

SR = 48000
RNG = np.random.default_rng(20261015)


# ── Básico ───────────────────────────────────────────────────────────────────
def secs(n):
    return int(round(n * SR))


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
        'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def n2m(name):
    """'F#3' -> 54."""
    pitch = name[:-1]
    octave = int(name[-1])
    return 12 * (octave + 1) + NOTE[pitch]


def stereo(x, pan=0.0):
    """Mono -> estéreo com pan de potência constante (-1..1)."""
    a = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def env_adsr(n, a=0.005, d=0.1, s=0.7, r=0.2, hold=None):
    """Envelope ADSR de n amostras; hold = duração da nota antes do release."""
    t = np.arange(n) / SR
    hold = hold if hold is not None else max(0.0, n / SR - r)
    e = np.empty(n)
    att = t < a
    e[att] = t[att] / max(a, 1e-6)
    dec = (t >= a) & (t < a + d)
    e[dec] = 1 - (1 - s) * (t[dec] - a) / max(d, 1e-6)
    sus = (t >= a + d) & (t < hold)
    e[sus] = s
    rel = t >= hold
    lvl = s if hold >= a + d else (hold / max(a, 1e-6) if hold < a else 1 - (1 - s) * (hold - a) / max(d, 1e-6))
    e[rel] = lvl * np.exp(-(t[rel] - hold) / max(r / 5, 1e-4))
    return e


def exp_decay(n, tau):
    return np.exp(-np.arange(n) / SR / tau)


# ── Filtros (RBJ cookbook) ───────────────────────────────────────────────────
def biquad(kind, f0, q=0.707, gain_db=0.0):
    f0 = min(max(f0, 10.0), SR * 0.49)
    w0 = 2 * np.pi * f0 / SR
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2 * q)
    A = 10 ** (gain_db / 40)
    if kind == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'bp':
        b = [alpha, 0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'peak':
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == 'lowshelf':
        sq = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    elif kind == 'highshelf':
        sq = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
        a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return b, a


def filt(x, kind, f0, q=0.707, gain_db=0.0):
    b, a = biquad(kind, f0, q, gain_db)
    return signal.lfilter(b, a, x, axis=0)


def sweep_filter(x, kind, f_start, f_end, q=0.707, block=128, curve='exp'):
    """Filtro com frequência variando no tempo (mono)."""
    n = len(x)
    out = np.zeros(n)
    zi = np.zeros(2)
    nb = (n + block - 1) // block
    for i in range(nb):
        k = i / max(nb - 1, 1)
        f = f_start * (f_end / f_start) ** k if curve == 'exp' else f_start + (f_end - f_start) * k
        b, a = biquad(kind, f, q)
        seg = x[i * block:(i + 1) * block]
        y, zi = signal.lfilter(b, a, seg, zi=zi)
        out[i * block:(i + 1) * block] = y
    return out


def env_filter(x, kind, freqs, q=0.707, block=64):
    """Filtro com frequência por amostra (array freqs, mesmo tamanho de x)."""
    n = len(x)
    out = np.zeros(n)
    zi = np.zeros(2)
    for i in range(0, n, block):
        f = float(np.mean(freqs[i:i + block]))
        b, a = biquad(kind, f, q)
        y, zi = signal.lfilter(b, a, x[i:i + block], zi=zi)
        out[i:i + block] = y
    return out


# ── Osciladores ──────────────────────────────────────────────────────────────
def osc_sine(freq, n, phase=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    ph = phase + 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph)


def osc_saw(freq, n, phase=0.0, max_h=None):
    """Dente-de-serra limitado em banda (aditivo) — freq constante."""
    nh = int(min(max_h or 200, (SR / 2) / freq))
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, nh + 1):
        out += np.sin(2 * np.pi * k * freq * t + phase * k) / k
    return out * (2 / np.pi)


def osc_square(freq, n, phase=0.0, max_h=None):
    nh = int(min(max_h or 200, (SR / 2) / freq))
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, nh + 1, 2):
        out += np.sin(2 * np.pi * k * freq * t + phase * k) / k
    return out * (4 / np.pi)


def supersaw(freq, n, voices=7, detune=0.22, max_h=60):
    """Vários serrotes desafinados espalhados no estéreo."""
    out = np.zeros((n, 2))
    for v in range(voices):
        spread = (v - (voices - 1) / 2) / ((voices - 1) / 2) if voices > 1 else 0
        cents = spread * detune * 100
        f = freq * 2 ** (cents / 1200)
        x = osc_saw(f, n, phase=RNG.uniform(0, 2 * np.pi), max_h=max_h)
        out += stereo(x, pan=spread * 0.85)
    return out / np.sqrt(voices)


# ── Instrumentos ─────────────────────────────────────────────────────────────
def kick(punch=1.0, length=0.42, tone=48.0):
    n = secs(length)
    t = np.arange(n) / SR
    f = tone + (175 - tone) * np.exp(-t / 0.032)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    click = filt(RNG.standard_normal(n) * np.exp(-t / 0.004), 'hp', 2500) * 0.35
    x = np.tanh((body + click) * 1.8 * punch) / np.tanh(1.8 * punch)
    return x * 0.95


def clap(length=0.35):
    n = secs(length)
    noise = RNG.standard_normal(n)
    env = np.zeros(n)
    for i, off in enumerate([0.0, 0.011, 0.022, 0.034]):
        s = secs(off)
        tail = 0.006 if i < 3 else 0.11
        env[s:] += np.exp(-np.arange(n - s) / SR / tail) * (0.8 if i < 3 else 1.0)
    x = filt(noise * env, 'bp', 1400, q=0.9)
    x = filt(x, 'hp', 600)
    return x / (np.max(np.abs(x)) + 1e-9) * 0.8


def hat(open_=False, length=None):
    length = length or (0.28 if open_ else 0.06)
    n = secs(length)
    t = np.arange(n) / SR
    # Metálico: soma de quadradas em razões inarmônicas + ruído.
    metal = np.zeros(n)
    for r in [1.0, 1.342, 1.2312, 1.6532, 1.9523, 2.1523]:
        metal += np.sign(np.sin(2 * np.pi * 317 * r * t))
    x = metal * 0.15 + RNG.standard_normal(n) * 0.6
    x = filt(x, 'hp', 7000)
    x = filt(x, 'highshelf', 10000, gain_db=3)
    x *= np.exp(-t / (0.09 if open_ else 0.018))
    return x / (np.max(np.abs(x)) + 1e-9) * 0.5


def shaker(length=0.09):
    n = secs(length)
    t = np.arange(n) / SR
    e = (1 - np.exp(-t / 0.008)) * np.exp(-t / 0.03)
    x = filt(RNG.standard_normal(n), 'bp', 6500, q=1.2) * e
    return x / (np.max(np.abs(x)) + 1e-9) * 0.35


def sub_bass(midi, dur, glide_from=None):
    n = secs(dur + 0.08)
    f0 = midi_hz(midi)
    if glide_from is not None:
        f = midi_hz(glide_from) + (f0 - midi_hz(glide_from)) * (1 - np.exp(-np.arange(n) / SR / 0.03))
    else:
        f = np.full(n, f0)
    x = osc_sine(f, n) + 0.32 * osc_sine(f * 2, n) + 0.14 * osc_sine(f * 3, n) + 0.05 * osc_sine(f * 4, n)
    x = np.tanh(x * 1.6)
    e = env_adsr(n, a=0.004, d=0.08, s=0.85, r=0.06, hold=dur)
    return x * e * 0.6


def pluck(midi, dur=0.25, bright=1.0, decay=0.22):
    n = secs(dur + 0.3)
    f = midi_hz(midi)
    x = osc_saw(f, n, max_h=40) * 0.6 + osc_square(f * 1.003, n, max_h=30) * 0.4
    t = np.arange(n) / SR
    cutoff = 400 + 6000 * bright * np.exp(-t / 0.07)
    y = env_filter(x, 'lp', cutoff, q=1.4)
    e = np.exp(-t / decay) * (1 - np.exp(-t / 0.002))
    return y * e * 0.5


def bell(midi, dur=1.6, ratio=3.5, index=2.2):
    n = secs(dur)
    t = np.arange(n) / SR
    f = midi_hz(midi)
    imod = index * np.exp(-t / 0.35)
    mod = np.sin(2 * np.pi * f * ratio * t) * imod
    x = np.sin(2 * np.pi * f * t + mod) * np.exp(-t / 0.55)
    x += 0.25 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.25)
    return x * 0.4


def pad_chord(midis, dur, attack=0.35, release=0.6, cutoff=2600, detune=0.18):
    n = secs(dur + release)
    out = np.zeros((n, 2))
    for m in midis:
        out += supersaw(midi_hz(m), n, voices=5, detune=detune, max_h=50) * 0.5
    t = np.arange(n) / SR
    e = env_adsr(n, a=attack, d=0.4, s=0.8, r=release, hold=dur)
    out = filt(out, 'lp', cutoff, q=0.6)
    out = filt(out, 'hp', 140)
    return out * e[:, None] * (0.32 / np.sqrt(len(midis)))


def riser(dur, f_lo=300, f_hi=9000, level=0.5):
    n = secs(dur)
    x = RNG.standard_normal(n)
    y = sweep_filter(x, 'bp', f_lo, f_hi, q=2.0)
    t = np.arange(n) / SR
    e = (t / dur) ** 2.2
    # Tom subindo por baixo.
    f = 110 * (4 ** (t / dur))
    tone = osc_saw(220, n, max_h=12) * 0  # reservado
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.15
    l = y * e + tone * e
    r = np.roll(y, 37) * e + tone * e
    return np.stack([l, r], axis=1) * level / (np.max(np.abs(y * e)) + 1e-9)


def downlifter(dur=1.2, level=0.35):
    n = secs(dur)
    x = RNG.standard_normal(n)
    y = sweep_filter(x, 'bp', 7000, 250, q=1.5)
    e = np.exp(-np.arange(n) / SR / (dur / 3))
    return stereo(y * e / (np.max(np.abs(y * e)) + 1e-9) * level)


def impact(level=0.9, length=2.6):
    n = secs(length)
    t = np.arange(n) / SR
    f = 32 + 70 * np.exp(-t / 0.08)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    crack = filt(RNG.standard_normal(n), 'lp', 5000) * np.exp(-t / 0.05) * 0.5
    x = np.tanh((boom + crack) * 1.6)
    return stereo(x * level)


def reverse_cymbal(dur=1.0, level=0.35):
    n = secs(dur)
    t = np.arange(n) / SR
    x = filt(RNG.standard_normal(n), 'hp', 4000) * np.exp(-t / (dur / 4))
    x = x[::-1]
    return np.stack([x, np.roll(x, 53)], axis=1) * level / (np.max(np.abs(x)) + 1e-9)


def tick(level=0.4):
    """Tique de relógio (gancho de tensão)."""
    n = secs(0.05)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 2900 * t) * np.exp(-t / 0.006) + filt(RNG.standard_normal(n), 'hp', 5000) * np.exp(-t / 0.003) * 0.4
    return x * level


# ── Efeitos de mixagem ───────────────────────────────────────────────────────
def make_ir(length=2.4, decay=0.6, hp=300, lp=7000, predelay=0.012):
    n = secs(length)
    t = np.arange(n) / SR
    pre = secs(predelay)
    out = np.zeros((n + pre, 2))
    for c in range(2):
        x = RNG.standard_normal(n) * np.exp(-t / decay)
        x = filt(x, 'hp', hp)
        x = filt(x, 'lp', lp)
        out[pre:, c] = x
    return out / np.sqrt(np.sum(out ** 2) / 2)


def reverb(x, ir):
    if x.ndim == 1:
        x = stereo(x)
    y = np.stack([signal.fftconvolve(x[:, c], ir[:, c]) for c in range(2)], axis=1)
    return y[:len(x)]


def pingpong(x, delay_s, feedback=0.35, repeats=6, lp=4500):
    if x.ndim == 1:
        x = stereo(x)
    d = secs(delay_s)
    out = np.zeros((len(x) + d * repeats, 2))
    out[:len(x)] += x
    cur = x.mean(axis=1)
    for i in range(1, repeats + 1):
        cur = filt(cur, 'lp', lp) * feedback
        ch = i % 2
        out[d * i:d * i + len(cur), ch] += cur
    return out[:len(x)]


def sidechain_env(n, hits, depth=0.6, release=0.18, attack=0.004):
    """Ganho que abaixa a cada batida (hits em segundos)."""
    g = np.ones(n)
    t_r = np.arange(secs(release * 4)) / SR
    shape = 1 - depth * np.exp(-t_r / (release / 2.2))
    a = secs(attack)
    for h in hits:
        s = secs(h) - a
        if s >= n:
            continue
        s0 = max(s, 0)
        seg = np.concatenate([np.linspace(1, 1 - depth, a, endpoint=False), shape]) if a else shape
        seg = seg[s0 - s:]
        e = min(n, s0 + len(seg))
        g[s0:e] = np.minimum(g[s0:e], seg[:e - s0])
    return g


def place(bus, x, at, gain=1.0):
    """Soma x (mono ou estéreo) no bus a partir de at segundos."""
    if x.ndim == 1:
        x = stereo(x)
    s = secs(at)
    if s >= len(bus):
        return
    if s < 0:
        x = x[-s:]
        s = 0
    e = min(len(bus), s + len(x))
    bus[s:e] += x[:e - s] * gain


def limiter(x, ceiling=0.93, lookahead=0.004, release=0.08):
    """Limitador de pico com antecipação (envelope de ganho suave)."""
    peak = np.max(np.abs(x), axis=1)
    la = secs(lookahead)
    # Máximo em janela deslizante (antecipação).
    from numpy.lib.stride_tricks import sliding_window_view
    padded = np.concatenate([peak, np.zeros(la)])
    win = sliding_window_view(padded, la + 1).max(axis=1)[:len(peak)]
    need = np.minimum(1.0, ceiling / np.maximum(win, 1e-9))
    # Suaviza: ataque instantâneo, soltura exponencial.
    g = np.empty_like(need)
    coef = np.exp(-1 / (release * SR))
    cur = 1.0
    for i in range(len(need)):
        v = need[i]
        cur = v if v < cur else v + (cur - v) * coef
        g[i] = cur
    return x * g[:, None]


def soft_clip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def write_wav(path, x):
    from scipy.io import wavfile
    y = np.clip(x, -1, 1)
    wavfile.write(path, SR, (y * 32767).astype(np.int16))


def read_wav(path):
    from scipy.io import wavfile
    sr, y = wavfile.read(path)
    if y.dtype == np.int16:
        y = y.astype(np.float64) / 32768
    elif y.dtype == np.int32:
        y = y.astype(np.float64) / 2147483648
    if sr != SR:
        n = int(len(y) * SR / sr)
        y = signal.resample(y, n, axis=0)
    if y.ndim == 1:
        y = stereo(y)
    return y
