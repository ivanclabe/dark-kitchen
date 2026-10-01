"""Synthetic kitchen ambience (ADR 0016): extractor hood, frying, metal clatter,
timer/POS beeps and running water, mixed at random. Pure DSP, no recordings.
Usage: python gen/kitchen_noise.py N SPLIT SEED   → data/noise/kitchen_{split}/*.wav (30 s, 16 kHz)
"""
import os, sys
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

SR, SECONDS = 16000, 30

def colored(rng, n, exponent):  # 1/f^exponent noise
    spec = np.fft.rfft(rng.normal(size=n))
    f = np.fft.rfftfreq(n, 1 / SR); f[0] = f[1]
    x = np.fft.irfft(spec / f ** (exponent / 2), n)
    return x / (np.abs(x).max() + 1e-9)

def band(x, lo, hi, order=4):
    sos = butter(order, [lo, hi], btype='band', fs=SR, output='sos')
    return sosfilt(sos, x)

def hood(rng, n):
    t = np.arange(n) / SR
    mains = rng.choice([50, 60])
    hum = sum(rng.uniform(0.1, 0.5) / k * np.sin(2 * np.pi * mains * k * t + rng.uniform(0, 6)) for k in range(1, 6))
    blade = rng.uniform(80, 250)
    whirr = 0.2 * np.sin(2 * np.pi * blade * t) * (1 + 0.3 * np.sin(2 * np.pi * rng.uniform(0.2, 2) * t))
    return colored(rng, n, rng.uniform(1.0, 2.0)) + 0.3 * hum + whirr

def frying(rng, n):
    base = band(rng.normal(size=n), rng.uniform(1500, 3000), 7500) * 0.3
    pops = np.zeros(n)
    for pos in rng.integers(0, n - 400, size=int(rng.uniform(20, 120) * SECONDS)):
        length = rng.integers(20, 300)
        pops[pos:pos + length] += rng.normal(size=length) * np.exp(-np.arange(length) / rng.uniform(10, 80)) * rng.uniform(0.2, 1)
    return base + band(pops, 1000, 7900)

def clatter(rng, n):
    x = np.zeros(n)
    for pos in rng.integers(0, n - 8000, size=rng.integers(3, 25)):
        length = rng.integers(800, 6000); t = np.arange(length) / SR
        partials = rng.uniform(500, 7000, size=rng.integers(3, 8))
        hit = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * rng.uniform(0.2, 1) for f in partials)
        x[pos:pos + length] += hit * np.exp(-t / rng.uniform(0.03, 0.3)) * rng.uniform(0.3, 1)
    return x

def beeps(rng, n):
    x = np.zeros(n)
    for pos in rng.integers(0, n - 16000, size=rng.integers(0, 6)):
        f, dur, reps = rng.uniform(1500, 4200), rng.uniform(0.06, 0.4), rng.integers(1, 5)
        for r in range(reps):
            length = int(dur * SR); start = pos + int(r * dur * 1.8 * SR)
            if start + length < n:
                x[start:start + length] += np.sin(2 * np.pi * f * np.arange(length) / SR) * 0.5
    return x

def water(rng, n):
    t = np.arange(n) / SR
    x = band(rng.normal(size=n), rng.uniform(300, 800), rng.uniform(3000, 7000))
    on = np.zeros(n)
    for pos in rng.integers(0, n, size=rng.integers(0, 3)):
        on[pos:pos + int(rng.uniform(2, 10) * SR)] = 1
    return x * on * (1 + 0.3 * np.sin(2 * np.pi * rng.uniform(3, 9) * t))

def main():
    count, split, seed = int(sys.argv[1]), sys.argv[2], int(sys.argv[3])
    rng = np.random.default_rng(seed)
    out = f'data/noise/kitchen_{split}'; os.makedirs(out, exist_ok=True)
    n = SR * SECONDS
    for i in range(count):
        mix = np.zeros(n)
        for source, p in ((hood, 0.8), (frying, 0.5), (clatter, 0.6), (beeps, 0.4), (water, 0.3)):
            if rng.random() < p:
                s = source(rng, n); mix += s / (np.abs(s).max() + 1e-9) * rng.uniform(0.15, 1.0)
        if not mix.any():
            mix = hood(rng, n)
        mix = mix / np.abs(mix).max() * 10 ** (rng.uniform(-20, -3) / 20)
        sf.write(f'{out}/kitchen_{seed}_{i:04d}.wav', (mix * 32767).astype(np.int16), SR)

if __name__ == '__main__':
    main()
