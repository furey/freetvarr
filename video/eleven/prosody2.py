import sys, json, os
import numpy as np
import parselmouth

def segments(snd, min_pause=0.15, floor_db=-35):
    inten = snd.to_intensity(time_step=0.01)
    t = inten.xs(); v = inten.values[0]
    voiced = v > (v.max() + floor_db)
    segs, start = [], None
    for ti, on in zip(t, voiced):
        if on and start is None: start = ti
        if not on and start is not None: segs.append([start, ti]); start = None
    if start is not None: segs.append([start, t[-1]])
    merged = [segs[0]]
    for s in segs[1:]:
        if s[0] - merged[-1][1] < min_pause: merged[-1][1] = s[1]
        else: merged.append(s)
    return merged, v

def end_rise(pitch, seg):
    f = pitch.selected_array['frequency']; t = pitch.xs()
    mask = (t >= seg[0]) & (t <= seg[1]) & (f > 0)
    tv, fv = t[mask], f[mask]
    if len(tv) < 8: return None
    st = 12 * np.log2(fv / 100)
    end = tv[-1]
    tail = st[tv >= end - 0.12]
    before = st[(tv >= end - 0.5) & (tv < end - 0.15)]
    if len(tail) == 0 or len(before) == 0: return None
    return float(np.median(tail) - np.median(before))

out = {}
for path in sys.argv[1:]:
    snd = parselmouth.Sound(path)
    pitch = snd.to_pitch_ac(time_step=0.01, pitch_floor=60, pitch_ceiling=250, octave_jump_cost=0.6)
    segs, inten = segments(snd)
    f = pitch.selected_array['frequency']; f = f[f > 0]
    st = 12*np.log2(f/100)
    pauses = [round(b[0] - a[1], 2) for a, b in zip(segs, segs[1:])]
    rises = [None if r is None else round(r, 1) for r in (end_rise(pitch, s) for s in segs)]
    noise = float(np.percentile(inten, 5)); peak = float(inten.max())
    out[os.path.basename(path)[:-4]] = {'dur': round(snd.duration, 2), 'f0_med_hz': round(float(np.median(f)),0), 'f0_range_st': round(float(np.percentile(st,95)-np.percentile(st,5)),1), 'snr_db': round(peak-noise,0), 'pauses': pauses, 'end_rise_st': rises}
for k, v in out.items(): print(k, json.dumps(v))
