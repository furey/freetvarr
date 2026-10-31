import sys, json
import numpy as np
import parselmouth

def rise_at(pitch, end):
    f = pitch.selected_array['frequency']; t = pitch.xs()
    mask = (t >= end - 0.6) & (t <= end + 0.05) & (f > 0)
    tv, fv = t[mask], f[mask]
    if len(tv) < 8: return None
    st = 12 * np.log2(fv / 100)
    last = tv[-1]
    tail = st[tv >= last - 0.12]
    before = st[(tv >= last - 0.5) & (tv < last - 0.15)]
    if len(tail) == 0 or len(before) == 0: return None
    return round(float(np.median(tail) - np.median(before)), 1)

out = {}
for row in json.load(open(sys.argv[1])):
    snd = parselmouth.Sound(row['mp3'])
    pitch = snd.to_pitch_ac(time_step=0.01, pitch_floor=60, pitch_ceiling=250, octave_jump_cost=0.6)
    out[row['id']] = [rise_at(pitch, e['end']) for e in row['ends']]
print(json.dumps(out))
