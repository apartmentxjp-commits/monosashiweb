"""Build the 15s soundtrack: user-supplied music (audio/source.m4a) + a synced SFX layer.

The music window starts at the drop of the section at 14.965s of the track (see
src/timeline.js MUSIC_OFFSET), so the drop hits the opening flash and the section's
one-bar break carries the logo. All SFX are synthesized here from audio/cues.json.

usage: python3 audio/make_audio.py   -> out/audio/mix.wav
"""
import json
import os
import subprocess

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "out", "audio")
os.makedirs(OUT, exist_ok=True)

SR = 48000
DUR = 15.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
cues = json.load(open(os.path.join(HERE, "cues.json")))


def load_music():
    raw = os.path.join(OUT, "music_raw.f32")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-ss", str(cues["musicOffset"]), "-t", str(DUR + 0.2),
         "-i", os.path.join(HERE, "source.m4a"), "-ac", "2", "-ar", str(SR), "-f", "f32le", raw],
        check=True,
    )
    m = np.fromfile(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)
    out = np.zeros((N, 2))
    out[: min(N, len(m))] = m[:N]
    return out


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def env(n, a, d, curve=4.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) * curve / max(d, 1e-4))
    return e


def place(buf, sig, t, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if i >= N:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    n = min(len(sig), N - i)
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        buf[i : i + n, 0] += sig[:n] * gain * l * 1.414
        buf[i : i + n, 1] += sig[:n] * gain * r * 1.414
    else:
        buf[i : i + n] += sig[:n] * gain


def tick(freq=5200, dur=0.03, noise=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) * np.exp(-t * 180)
    s += bp(rng.standard_normal(n), 2500, 11000) * np.exp(-t * 260) * noise
    return s


def blip(f0, f1, dur=0.09):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = np.geomspace(f0, f1, n)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(n, 0.002, dur * 0.5, 5) * 0.8


def bell(freq, dur=1.6, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * 2.2 * bright * np.exp(-t * 6)
    s = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t * 2.8)
    s += 0.35 * np.sin(2 * np.pi * freq * 2.01 * t) * np.exp(-t * 5)
    return s * env(n, 0.003, dur, 1.0)


def whoosh(dur, f0, f1, rise=True):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blocks = 64
    edges = np.linspace(0, n, blocks + 1).astype(int)
    for b in range(blocks):
        u = b / (blocks - 1)
        fc = f0 * (f1 / f0) ** u
        seg = bp(x, max(40, fc * 0.6), min(SR / 2 - 100, fc * 1.6))[edges[b] : edges[b + 1]]
        out[edges[b] : edges[b + 1]] = seg
    shape = np.linspace(0, 1, n) ** (2.2 if rise else 0.5)
    if not rise:
        shape = shape[::-1]
    fade = np.minimum(1, np.arange(n) / (0.01 * SR))[::1] * np.minimum(1, (n - np.arange(n)) / (0.02 * SR))
    return out * shape * fade


def sub_boom(dur=1.2, f0=110, f1=38):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 18)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh(1.6 * np.sin(ph)) * np.exp(-t * 3.2) * env(n, 0.002, dur, 0.1)


def shimmer(dur, chord, gain=1.0):
    n = int(dur * SR)
    out = np.zeros((n, 2))
    for k, f in enumerate(chord):
        for side, det in ((0, 0.997), (1, 1.003)):
            b = bell(f * det, dur, 0.6)[:n]
            out[: len(b), side] += b * gain / len(chord)
    return out


def reverb(x, seconds=2.2, mix=0.25, seed=3):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.stack([r.standard_normal(n), r.standard_normal(n)], 1) * np.exp(-t * 6.9 / seconds)[:, None]
    ir[:, 0] = lp(ir[:, 0], 7000)
    ir[:, 1] = lp(ir[:, 1], 7000)
    ir /= np.sqrt((ir**2).sum(0))
    wet = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)
    return x * (1 - mix) + wet * mix


music = load_music()
sfx = np.zeros((N, 2))

# --- 0.05: the drop. Layer a sub boom + bright air burst under the music's own hit.
place(sfx, sub_boom(1.4), cues["drop"], 0.55)
burst = hp(rng.standard_normal(int(0.5 * SR)), 3000) * env(int(0.5 * SR), 0.002, 0.25, 6)
place(sfx, burst, cues["drop"], 0.12, -0.2)

# --- warp: a ratchet of clicks, one per year crossed; buzz that decelerates into ticks.
for y in cues["warpYears"]:
    big = y["year"] % 10 == 0
    f = 3800 + y["year"] * 22 + (1800 if big else 0)
    g = (0.2 if big else 0.1) * (0.6 + 0.4 * min(1, y["t"] / 0.6))
    place(sfx, tick(f, 0.035 if big else 0.02), y["t"], g, -0.5 if y["year"] % 2 else 0.5)
# tunnel air: filtered noise whose cutoff follows the speed
w = whoosh(cues["warpLand"] + 0.25, 7000, 400, rise=False)
place(sfx, w, 0.02, 0.1)
# landing: soft lock + low swell into bar 2
place(sfx, tick(2400, 0.08, 0.3), cues["warpLand"], 0.3)
place(sfx, bell(1174.66, 1.4, 0.5), cues["warpLand"], 0.07, 0.2)
place(sfx, whoosh(0.35, 300, 3000), cues["hits"][1]["t"] - 0.35, 0.08)

# --- copy reveals: breathy swishes
for k, g in (("line1", 0.05), ("line2", 0.06), ("buildCopy", 0.045), ("numbers1", 0.05), ("numbers2", 0.07), ("tagline", 0.04)):
    place(sfx, whoosh(0.45, 1500, 9000), cues["copy"][k] - 0.05, g, 0.1)

# --- scene cuts: whoosh into each cut + low thump on it
for h in cues["hits"][2:5]:
    place(sfx, whoosh(0.4, 600, 8000), h["t"] - 0.4, 0.09)
    place(sfx, sub_boom(0.5, 90, 45), h["t"], 0.25)

# --- building: floors click in with rising pitch; scan hum
scale = [587.33, 659.25, 739.99, 880.0, 987.77, 1108.73, 1174.66]
for i, t in enumerate(cues["floors"]):
    place(sfx, tick(2600 + i * 260, 0.03, 0.4), t, 0.16, -0.3 + i * 0.1)
    place(sfx, bell(scale[i] * 2, 0.35, 0.3), t, 0.03, -0.3 + i * 0.1)
hum_n = int(3.6 * SR)
th = np.arange(hum_n) / SR
hum = (np.sin(2 * np.pi * 110 * th) + 0.5 * np.sin(2 * np.pi * 220.7 * th)) * np.sin(np.pi * np.clip(th / 3.6, 0, 1)) ** 2
place(sfx, lp(hum, 800), cues["hits"][2]["t"], 0.035)

# --- HUD cards: data blips + count-up tick burst
for i, t in enumerate(cues["cards"]):
    pan = 0.6 if i % 2 == 0 else -0.6
    place(sfx, blip(1800, 4200, 0.07), t, 0.1, pan)
    place(sfx, blip(4200, 2600, 0.05), t + 0.1, 0.06, pan)
    for k in range(9):
        place(sfx, tick(6000 + k * 150, 0.012, 0.2), t + 0.2 + k * 0.045 * (1 + k * 0.12), 0.035, pan)

# --- graph: milestone bells on the beat, rising; break-even chime in ice
mile = [587.33, 739.99, 880.0, 1108.73, 1174.66]
for i, t in enumerate(cues["milestones"]):
    place(sfx, bell(mile[i] * 2, 1.2, 0.7), t, 0.06, -0.4 + i * 0.2)
    place(sfx, tick(5000, 0.02, 0.2), t, 0.08, -0.4 + i * 0.2)
place(sfx, shimmer(1.6, [1760.0, 2217.46, 2637.02], 0.8), cues["breakEven"], 0.08)

# --- rush into the logo: rising riser, then a warm impact + shimmer chord on the break
r0, r1 = cues["rush"]
place(sfx, whoosh(r1 - r0 + 0.25, 200, 12000), r0 - 0.25, 0.16)
logo = cues["hits"][5]["t"]
place(sfx, sub_boom(2.0, 95, 36), logo, 0.5)
place(sfx, shimmer(2.2, [587.33, 739.99, 880.0, 1108.73, 1318.51], 1.2), logo, 0.16)
g0, g1 = cues["glint"]
place(sfx, whoosh(g1 - g0, 4000, 14000), g0, 0.035, 0.5)

sfx = reverb(sfx, 2.4, 0.3)

# --- mix: music on top; gentle sidechain of music under the big hits; tail fade
duck = np.ones(N)
for t, depth, rel in ((cues["drop"], 0.0, 0.1), (logo, 0.15, 0.6)):
    i = int(t * SR)
    n = int(rel * 4 * SR)
    seg = 1 - depth * np.exp(-np.arange(n) / (rel * SR))
    duck[i : i + n] *= seg[: max(0, min(n, N - i))]
mix = music * duck[:, None] * 0.9 + sfx * 0.9
fade_n = int(0.45 * SR)
mix[-fade_n:] *= (np.cos(np.linspace(0, np.pi / 2, fade_n)) ** 2)[:, None]
mix[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))[:, None]
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
pre = os.path.join(OUT, "mix_pre.wav")
import wave

pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2")
with wave.open(pre, "wb") as wf:
    wf.setnchannels(2)
    wf.setsampwidth(2)
    wf.setframerate(SR)
    wf.writeframes(pcm.tobytes())
# broadcast-ish loudness for web: -14 LUFS integrated, -1 dBTP
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", pre, "-af", "loudnorm=I=-14:TP=-1.0:LRA=11",
     "-ar", str(SR), os.path.join(OUT, "mix.wav")],
    check=True,
)
print("wrote", os.path.join(OUT, "mix.wav"))
