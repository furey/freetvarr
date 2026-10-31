import sys, subprocess
import numpy as np
sys.path.insert(0, '.')
from mix import load, save, trim, silence, gain_to, lufs, SR
tmp = 'out/_tmp.wav'
seq = []
for n in range(1, 5):
    seq.append(gain_to(trim(load(f'out/label-{n}.wav')), -16, tmp)); seq.append(silence(0.7))
    seg = []
    for f in ['1', '2', '3b1', '4']:
        seg.append(trim(load(f'out/O{n}-{f}.wav'))); seg.append(silence(0.8))
    seq.append(gain_to(np.concatenate(seg), -16, tmp)); seq.append(silence(1.2))
for k in 'ABC':
    seq.append(gain_to(trim(load(f'out/label-{k}.wav')), -16, tmp)); seq.append(silence(0.7))
    seq.append(load(f'out/music-{k}.wav')); seq.append(silence(1.2))
x = np.concatenate(seq)
save(x, 'out/_all.wav')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', 'out/_all.wav', '-af', 'alimiter=limit=0.89:level=false', '-ac', '1', '-b:a', '128k', '../elevenlabs-options-comparison.mp3'], check=True)
print(len(x) / SR)
