import json, re, subprocess, sys
import numpy as np

SR = 48000
DUCKED_DB = -22.0
OPEN_DB = -11.0
ATTACK = 0.3
RELEASE = 0.8
MIN_OPEN = 1.5
FADE_IN = 2.0
FADE_OUT = 3.0
TARGET_LUFS = -14.0
LOOP_FROM, LOOP_TO, XFADE = 66.0, 90.0, 0.15


def load(path):
    cmd = ['ffmpeg', '-loglevel', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).astype(np.float64)


def save(x, path, channels=1):
    data = np.repeat(x[:, None], channels, axis=1) if channels > 1 else x
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', str(channels), '-i', '-', path],
                   input=data.astype(np.float32).tobytes(), check=True)


def measure(path):
    err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=framelog=quiet:peak=true', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    lufs = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', err)[-1])
    peak = float(re.findall(r'Peak:\s+(-?[\d.inf]+) dBFS', err)[-1])
    return lufs, peak


def gain_to(x, target, tmp):
    save(x, tmp)
    return x * 10 ** ((target - measure(tmp)[0]) / 20)


def looped(music, n):
    a, b, f = int(LOOP_FROM * SR), int(LOOP_TO * SR), int(XFADE * SR)
    out = music[:b].copy()
    ramp = np.linspace(0, 1, f)
    while len(out) < n:
        piece = music[a - f:b]
        out[-f:] = out[-f:] * (1 - ramp) + piece[:f] * ramp
        out = np.concatenate([out, piece[f:]])
    return out[:n]


def speech_spans(timeline):
    return [(s['start'] + c['start'], s['start'] + c['start'] + c['duration']) for s in timeline['scenes'] for c in s['cues']]


def envelope(n, spans):
    t = np.arange(n) / SR
    db = np.full(n, OPEN_DB)
    merged = []
    for a, b in spans:
        if merged and a - merged[-1][1] < MIN_OPEN: merged[-1][1] = b
        else: merged.append([a, b])
    smooth = lambda p: 0.5 - 0.5 * np.cos(np.pi * np.clip(p, 0, 1))
    for a, b in merged:
        down = smooth((t - (a - ATTACK)) / ATTACK)
        up = smooth(1 - (t - b) / RELEASE)
        depth = np.where(t < a, down, np.where(t > b, up, 1.0))
        db = np.minimum(db, OPEN_DB + depth * (DUCKED_DB - OPEN_DB))
    g = 10 ** (db / 20)
    g *= smooth(t / FADE_IN)
    g *= smooth((t[-1] - t) / FADE_OUT)
    return g


timeline_path, voice_path, music_path, out_path = sys.argv[1:5]
timeline = json.load(open(timeline_path))
tmp = out_path.replace('.wav', '-tmp.wav')
voice = gain_to(load(voice_path), -16, tmp)
n = len(voice)
music = gain_to(looped(load(music_path), n), -16, tmp)
mix = voice + music * envelope(n, speech_spans(timeline))
gain = 0.0
for _ in range(4):
    save(mix * 10 ** (gain / 20), tmp)
    limited = out_path.replace('.wav', '-lim.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', 'aresample=192000,alimiter=limit=0.79:attack=3:release=60:level=false,aresample=48000', '-ac', '2', '-c:a', 'pcm_f32le', limited], check=True)
    lufs, peak = measure(limited)
    if abs(lufs - TARGET_LUFS) < 0.15: break
    gain += TARGET_LUFS - lufs
subprocess.run(['mv', limited, out_path], check=True)
subprocess.run(['rm', '-f', tmp], check=True)
print(f'mix {lufs:.1f} LUFS, true peak {peak:.1f} dBTP, length {n / SR:.1f}s')
