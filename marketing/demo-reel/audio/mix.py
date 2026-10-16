"""
Mixagem final: narração no lugar de cada fala, trilha com ducking sob a voz,
efeitos sonoros nos acontecimentos e loudness de rede social.

    python3 audio/mix.py  →  audio/work/mix.wav

Entradas: audio/work/music.wav (audio/music.py), audio/vo/take1.mp3 (ElevenLabs)
e audio/sfx/*.mp3 (ElevenLabs). Os tempos de destino das falas são os mesmos de
src/timeline.js (TIMELINE.vo).
"""
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import synth as S  # noqa: E402

TOTAL = 45.0

# (início e fim no take original, início no vídeo) — já com folga de 30/60 ms.
VO = [
    (0.061, 1.007, 0.25),    # Paciente faltou?
    (1.291, 2.530, 1.30),    # Planilha que não fecha?
    (3.097, 3.938, 3.15),    # Respira.
    (4.401, 5.466, 4.25),    # Isso é DreamClin.
    (6.010, 7.546, 6.75),    # A recepção marca a Mariana.
    (7.810, 9.892, 8.45),    # Conflito? Avisado na hora.
    (10.316, 12.622, 10.90),  # Marcou, a confirmação vai pelo WhatsApp.
    (13.050, 15.646, 13.60),  # Ela toca em Confirmar, e a agenda já sabe.
    (16.011, 18.128, 17.20),  # Ela chega, a recepção acompanha.
    (18.504, 20.897, 19.60),  # Na ficha, odontograma dente a dente.
    (21.223, 23.015, 22.75),  # O orçamento sai em minutos.
    (23.281, 23.961, 25.40),  # Ela aceita.
    (24.329, 25.527, 27.10),  # E paga como preferir:
    (25.778, 30.179, 28.55),  # pix, cartão ... transferência.
    (30.405, 31.926, 33.10),  # À vista ou parcelado.
    (32.285, 35.649, 35.40),  # Você fecha o dia sem planilha, com os dados protegidos.
    (36.238, 37.783, 40.20),  # Sua clínica em dia.
    (37.985, 40.259, 41.95),  # Comece grátis em DreamClin ponto com.
]

# Efeitos: (arquivo, tempo, ganho dB, alinhar pelo 'start' ou pelo 'peak').
SFX = [
    ('pop_a', 0.55, -4, 'peak'),       # carimbo "Faltou"
    ('whoosh_a', 1.20, -8, 'peak'),    # chicote para a planilha
    ('whoosh_b', 2.45, -6, 'peak'),    # a estrela corta o caos
    ('pop_c', 2.62, -10, 'peak'),      # estilhaços
    ('impact_c', 3.00, -3, 'peak'),    # íris / logo
    ('whoosh_c', 3.95, -16, 'peak'),   # traço do D
    ('pop_b', 4.50, -12, 'peak'),      # cabeça
    ('whoosh_b', 6.25, -9, 'peak'),    # mergulho no D
    ('pop_b', 7.50, -13, 'peak'),      # bloco da Mariana aparece
    ('pop_c', 7.70, -11, 'peak'),      # cursor pega o bloco
    ('pop_a', 8.50, -8, 'peak'),       # conflito
    ('pop_b', 9.60, -10, 'peak'),      # encaixa
    ('notif_b', 9.65, -14, 'start'),
    ('whoosh_c', 10.00, -15, 'peak'),  # bloco vira o cartão
    ('whoosh_a', 10.62, -13, 'peak'),  # cartão voa para o celular
    ('notif_c', 11.20, -9, 'start'),   # mensagem chega
    ('pop_b', 11.60, -13, 'peak'),     # botões
    ('pop_b', 11.72, -14, 'peak'),
    ('notif_b', 12.40, -13, 'start'),  # lembrete
    ('pop_a', 14.40, -6, 'peak'),      # toque em Confirmar
    ('pop_c', 14.52, -10, 'peak'),
    ('whoosh_c', 15.60, -13, 'peak'),  # câmera recua
    ('pop_b', 15.94, -11, 'peak'),     # flip
    ('pop_c', 16.16, -14, 'peak'),     # selo de check
    ('pop_b', 17.12, -15, 'peak'),     # cartão encaixa na sala de espera
    ('pop_b', 17.40, -12, 'peak'),     # chegou
    ('whoosh_a', 19.20, -12, 'peak'),  # círculo menta abre a ficha
    ('whoosh_c', 20.40, -17, 'peak'),  # dentes se desenham
    ('pop_a', 20.90, -10, 'peak'),     # dente 16
    ('pop_a', 21.30, -10, 'peak'),     # dente 26
    ('notif_b', 21.90, -14, 'start'),  # atendido
    ('whoosh_c', 22.05, -12, 'peak'),  # dentes voam
    ('whoosh_a', 22.70, -15, 'peak'),  # documento
    ('pop_b', 24.50, -11, 'peak'),     # link
    ('pop_b', 24.62, -12, 'peak'),     # pdf
    ('pop_c', 25.10, -12, 'peak'),     # visualizado
    ('pop_a', 26.00, -4, 'peak'),      # carimbo "Aceito"
    ('impact_b', 26.00, -15, 'peak'),
    ('whoosh_c', 26.70, -12, 'peak'),  # documento vira pílula
    ('whoosh_b', 27.10, -11, 'peak'),  # íris do degradê
    ('pop_c', 28.55, -10, 'peak'),     # pix
    ('pop_c', 28.95, -10, 'peak'),     # crédito
    ('pop_b', 29.25, -15, 'peak'),     # até 12x
    ('pop_c', 29.85, -10, 'peak'),     # débito
    ('pop_c', 30.75, -10, 'peak'),     # boleto
    ('pop_b', 31.05, -15, 'peak'),     # até 24x
    ('pop_c', 31.20, -10, 'peak'),     # dinheiro
    ('pop_c', 31.95, -10, 'peak'),     # transferência
    ('whoosh_c', 32.40, -13, 'peak'),  # cards compactam
    ('pop_b', 33.10, -14, 'peak'),     # alternador aparece
    ('pop_a', 33.80, -9, 'peak'),      # toque em Parcelado
    ('notif_b', 34.30, -11, 'start'),  # entrada paga
    ('whoosh_a', 34.62, -12, 'peak'),  # moeda sai e o painel sobe
    ('pop_a', 35.50, -8, 'peak'),      # moeda cai no card
    ('whoosh_a', 36.58, -11, 'peak'),  # risca a planilha
    ('pop_c', 36.86, -11, 'peak'),     # planilha estilhaça
    ('pop_a', 37.50, -10, 'peak'),     # modo escuro
    ('pop_c', 38.60, -9, 'peak'),      # cadeado fecha
    ('pop_b', 38.85, -13, 'peak'),     # selos
    ('pop_b', 39.10, -13, 'peak'),
    ('pop_b', 39.35, -13, 'peak'),
    ('whoosh_b', 39.75, -9, 'peak'),   # íris do final
    ('pop_c', 41.70, -12, 'peak'),     # botão
    ('pop_a', 42.38, -10, 'peak'),     # toque no botão
]


def load_any(path):
    wav = path if path.endswith('.wav') else os.path.join(HERE, 'work', os.path.basename(path) + '.48k.wav')
    if not path.endswith('.wav') and not os.path.exists(wav):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-ar', str(S.SR), '-ac', '2', wav], check=True)
    return S.read_wav(wav)


def compressor(x, thresh_db=-22.0, ratio=3.0, attack=0.005, release=0.12, makeup_db=4.0):
    mono = np.abs(x).max(axis=1)
    env = np.zeros_like(mono)
    a = np.exp(-1 / (attack * S.SR))
    r = np.exp(-1 / (release * S.SR))
    cur = 0.0
    for i, v in enumerate(mono):
        cur = (a * cur + (1 - a) * v) if v > cur else (r * cur + (1 - r) * v)
        env[i] = cur
    db = 20 * np.log10(env + 1e-9)
    over = np.maximum(0, db - thresh_db)
    gain_db = -over * (1 - 1 / ratio) + makeup_db
    return x * (10 ** (gain_db / 20))[:, None]


def smooth_env(x, attack=0.04, release=0.35, win=0.03):
    n = S.secs(win)
    mono = x.mean(axis=1) ** 2
    rms = np.sqrt(np.convolve(mono, np.ones(n) / n, mode='same'))
    out = np.zeros_like(rms)
    a = np.exp(-1 / (attack * S.SR))
    r = np.exp(-1 / (release * S.SR))
    cur = 0.0
    for i, v in enumerate(rms):
        cur = (a * cur + (1 - a) * v) if v > cur else (r * cur + (1 - r) * v)
        out[i] = cur
    return out


def main():
    n = S.secs(TOTAL)
    # ── Narração ────────────────────────────────────────────────────────────
    take = load_any(os.path.join(HERE, 'vo', 'take1.mp3'))
    vo = np.zeros((n, 2))
    fade = S.secs(0.012)
    for a, b, dst in VO:
        seg = take[S.secs(a):S.secs(b)].copy()
        seg[:fade] *= np.linspace(0, 1, fade)[:, None]
        seg[-fade:] *= np.linspace(1, 0, fade)[:, None]
        S.place(vo, seg, dst)
    vo = S.filt(vo, 'hp', 85)
    vo = S.filt(vo, 'peak', 220, q=1.0, gain_db=-1.5)    # tira um pouco de "caixa"
    vo = S.filt(vo, 'peak', 3200, q=0.9, gain_db=2.0)    # presença
    vo = S.filt(vo, 'highshelf', 9000, gain_db=1.5)      # ar
    vo = compressor(vo, thresh_db=-24, ratio=3.2, makeup_db=5)
    vo = vo / (np.max(np.abs(vo)) + 1e-9) * 0.85

    # ── Trilha com ducking ──────────────────────────────────────────────────
    music = load_any(os.path.join(HERE, 'work', 'music.wav'))[:n]
    if len(music) < n:
        music = np.concatenate([music, np.zeros((n - len(music), 2))])
    env = smooth_env(vo)
    env = env / (np.percentile(env[env > 1e-4], 90) + 1e-9)
    duck = 1 - 0.5 * np.clip(env, 0, 1)  # até ~-6 dB sob a voz
    music_d = music * duck[:, None]
    # Abre espaço na região da voz quando ela fala.
    music_mid = S.filt(music_d, 'peak', 2500, q=0.7, gain_db=-3.0)
    w = np.clip(env, 0, 1)[:, None]
    music_d = music_d * (1 - w) + music_mid * w

    # ── Efeitos ─────────────────────────────────────────────────────────────
    sfx = np.zeros((n, 2))
    cache = {}
    for name, t, gdb, align in SFX:
        if name not in cache:
            cache[name] = load_any(os.path.join(HERE, 'sfx', name + '.mp3'))
            x = cache[name]
            cache[name] = x / (np.max(np.abs(x)) + 1e-9)
        x = cache[name]
        at = t
        if align == 'peak':
            at = t - np.argmax(np.abs(x).max(axis=1)) / S.SR
        S.place(sfx, x, at, 10 ** (gdb / 20))
    sfx = S.filt(sfx, 'hp', 60)

    mix = music_d * 0.62 + vo * 1.0 + sfx * 0.55
    # Final curto: fade de 12 ms no começo e respiro no fim.
    fi = S.secs(0.012)
    mix[:fi] *= np.linspace(0, 1, fi)[:, None]
    fo = S.secs(0.25)
    mix[-fo:] *= np.linspace(1, 0.0, fo)[:, None]
    mix = S.limiter(mix / (np.max(np.abs(mix)) + 1e-9) * 0.95, ceiling=0.89)
    out = os.path.join(HERE, 'work', 'mix_pre.wav')
    S.write_wav(out, mix)
    S.write_wav(os.path.join(HERE, 'work', 'vo_placed.wav'), vo)
    # Loudness de rede social: -14 LUFS, pico -1 dBTP (duas passadas do loudnorm).
    final = os.path.join(HERE, 'work', 'mix.wav')
    meas = subprocess.run(['ffmpeg', '-hide_banner', '-i', out, '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json', '-f', 'null', '-'],
                          capture_output=True, text=True).stderr
    import json
    j = json.loads(meas[meas.rfind('{'):meas.rfind('}') + 1])
    af = (f"loudnorm=I=-14:TP=-1.0:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
          f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out, '-af', af, '-ar', str(S.SR), final], check=True)
    print('ok:', final, 'entrada', j['input_i'], 'LUFS')


if __name__ == '__main__':
    main()
