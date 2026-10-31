import subprocess, sys, json, re
import numpy as np
SR = 48000
DIR = sys.argv[1] if len(sys.argv) > 1 else 'out'

def load(path, seconds_from=0.0, seconds=None):
    cmd = ['ffmpeg', '-loglevel', 'error']
    if seconds_from: cmd += ['-ss', str(seconds_from)]
    if seconds: cmd += ['-t', str(seconds)]
    cmd += ['-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()

def save(x, path):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', path], input=x.astype(np.float32).tobytes(), check=True)

def lufs(path):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', out)[-1])

def trim(x, thr=10 ** (-50 / 20)):
    idx = np.where(np.abs(x) > thr)[0]
    return x[idx[0]:idx[-1] + 1] if len(idx) else x

def gain_to(x, target, tmp):
    save(x, tmp)
    return x * 10 ** ((target - lufs(tmp)) / 20)

def silence(s): return np.zeros(int(s * SR), dtype=np.float32)

def narration(parts):
    out, spans, t = [], [], 0.0
    for kind, val in parts:
        if kind == 'gap':
            out.append(silence(val)); t += val
        else:
            x = trim(load(val)); out.append(x); spans.append((t, t + len(x) / SR)); t += len(x) / SR
    return np.concatenate(out), spans

def envelope(n, spans, ducked_db, open_db, attack=0.3, release=0.8, fade_in=1.5, fade_out=3.0, min_open=1.5):
    t = np.arange(n) / SR
    db = np.full(n, open_db, dtype=np.float64)
    merged = []
    for a, b in spans:
        if merged and a - merged[-1][1] < min_open: merged[-1][1] = b
        else: merged.append([a, b])
    for a, b in merged:
        down = np.clip((t - (a - attack)) / attack, 0, 1)
        up = np.clip(1 - (t - b) / release, 0, 1)
        depth = np.where(t < a, down, np.where(t > b, up, 1.0))
        db = np.minimum(db, open_db + depth * (ducked_db - open_db))
    g = 10 ** (db / 20)
    g *= np.clip(t / fade_in, 0, 1)
    g *= np.clip((t[-1] - t) / fade_out, 0, 1)
    return g

if __name__ == '__main__':
    cfg = json.load(open(sys.argv[2]))
    tmp = f'{DIR}/_tmp.wav'
    voice, spans = narration([(p[0], p[1]) for p in cfg['parts']])
    voice = gain_to(voice, -16, tmp)
    total = cfg['length']
    voice = np.concatenate([voice, silence(max(0, total - len(voice) / SR))])[: int(total * SR)]
    for tr in cfg['tracks']:
        music = load(tr['file'], tr.get('from', 0), total)
        music = np.concatenate([music, silence(total)])[: len(voice)]
        music = gain_to(music, -16, tmp)
        g = envelope(len(voice), spans, ducked_db=-22, open_db=-11)
        mix = voice + music * g
        save(mix, tmp)
        mix = mix * 10 ** ((-13.6 - lufs(tmp)) / 20)
        save(mix, f"{DIR}/{tr['id']}-raw.wav")
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f"{DIR}/{tr['id']}-raw.wav", '-af', 'alimiter=limit=0.89:attack=5:release=50:level=false', '-ar', str(SR), f"{DIR}/{tr['id']}.wav"], check=True)
        print(tr['id'], 'LUFS', lufs(f"{DIR}/{tr['id']}.wav"))
