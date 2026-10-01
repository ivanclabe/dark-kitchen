"""Data augmentation for ADR 0016: room reverb (simulated RIRs), kitchen/music/babble
background at random SNR, speed/pitch, microphone band limits and level."""
import glob, hashlib, os, random
import numpy as np, soundfile as sf
from scipy.signal import butter, fftconvolve, resample_poly, sosfilt

SR = 16000

def split_of(path, eval_share=0.2):
    """Stable train/eval split by file name."""
    h = int(hashlib.md5(os.path.basename(path).encode()).hexdigest(), 16) % 1000
    return 'eval' if h < eval_share * 1000 else 'train'

def load(path):
    x, sr = sf.read(path, dtype='float32', always_2d=True)
    x = x.mean(axis=1)
    if sr != SR:
        g = np.gcd(sr, SR); x = resample_poly(x, SR // g, sr // g).astype(np.float32)
    return x

def trim(x, top_db=35, frame=320):
    """Cut leading/trailing silence (energy below peak − top_db)."""
    n = len(x) // frame
    if n == 0:
        return x
    e = 10 * np.log10(np.mean(x[:n * frame].reshape(n, frame) ** 2, axis=1) + 1e-12)
    on = np.where(e > e.max() - top_db)[0]
    return x[on[0] * frame:(on[-1] + 1) * frame] if len(on) else x

def rms_db(x):
    return 10 * np.log10(np.mean(x ** 2) + 1e-12)

def pools(split, include_musan=True):
    """Background sources for one split: {kind: [paths]}."""
    p = {
        'kitchen': sorted(glob.glob(f'data/noise/kitchen_{split}/*.wav')),
        'pointsource': [f for f in sorted(glob.glob('data/raw/RIRS_NOISES/pointsource_noises/*.wav')) if split_of(f) == split],
        'babble': sorted(glob.glob(f'data/raw/fleurs/wav/{"train" if split == "train" else "test"}/**/*.wav', recursive=True)),
    }
    if include_musan:
        for kind in ('noise', 'music', 'speech'):
            files = [f for f in sorted(glob.glob(f'data/raw/musan/{kind}/**/*.wav', recursive=True)) if split_of(f) == split]
            if files:
                p[f'musan_{kind}'] = files
    return {k: v for k, v in p.items() if v}

class Augmenter:
    def __init__(self, split, seed=0, include_musan=True):
        self.rng = random.Random(seed)
        self.np_rng = np.random.default_rng(seed)
        self.pools = pools(split, include_musan)
        rirs = sorted(glob.glob('data/raw/RIRS_NOISES/simulated_rirs/smallroom/**/*.wav', recursive=True)) + \
            sorted(glob.glob('data/raw/RIRS_NOISES/simulated_rirs/mediumroom/**/*.wav', recursive=True))
        self.rirs = [f for f in rirs if split_of(f) == split]
        self.cache = {}
        self.info = {}
        weights = {'kitchen': 3, 'pointsource': 2, 'babble': 2, 'musan_noise': 2, 'musan_music': 3, 'musan_speech': 1}
        self.kinds = [k for k in self.pools]
        self.kind_weights = [weights.get(k, 1) for k in self.kinds]

    def _audio(self, path):
        if path not in self.cache:
            if len(self.cache) > 300:
                self.cache.pop(next(iter(self.cache)))
            self.cache[path] = load(path)
        return self.cache[path]

    def background(self, n, kind=None):
        """A random n-sample stretch of one background file (read from disk, not the whole file)."""
        kind = kind or self.rng.choices(self.kinds, self.kind_weights)[0]
        path = self.rng.choice(self.pools[kind])
        info = self.info.get(path) or self.info.setdefault(path, sf.info(path))
        if info.samplerate != SR or info.frames < n:
            x = self._audio(path)
            x = np.tile(x, n // max(1, len(x)) + 1) if len(x) < n else x
            start = self.rng.randrange(0, len(x) - n + 1)
            return x[start:start + n].copy(), kind
        start = self.rng.randrange(0, info.frames - n + 1)
        x, _ = sf.read(path, start=start, frames=n, dtype='float32', always_2d=True)
        return x.mean(axis=1), kind

    def voice(self, x):
        """Speed/pitch, reverb and microphone colouring of a dry clip."""
        rng = self.rng
        if rng.random() < 0.5:
            factor = rng.choice([15, 16, 17, 18, 19, 20, 21])  # ±~7 % speed+pitch
            x = resample_poly(x, 18, factor).astype(np.float32)
        if self.rirs and rng.random() < 0.5:
            rir = self._audio(rng.choice(self.rirs))
            rir = rir / (np.abs(rir).max() + 1e-9)
            peak = int(np.argmax(np.abs(rir)))
            x = fftconvolve(x, rir[max(0, peak - 16):])[:len(x) + SR // 4].astype(np.float32)
        if rng.random() < 0.3:
            lo, hi = rng.uniform(80, 400), rng.uniform(3400, 7500)
            x = sosfilt(butter(4, [lo, hi], btype='band', fs=SR, output='sos'), x).astype(np.float32)
        return x

    def mix(self, fg, n, end, snr_db=None):
        """Places `fg` so it ends at sample `end` of an n-sample buffer over background noise.
        Returns int16."""
        rng = self.rng
        bg, kind = self.background(n)
        level = rng.uniform(-42, -14)  # speech level in dBFS: far to near
        buf = np.zeros(n, np.float32)
        start = end - len(fg)
        a, b = max(0, start), min(n, end)
        if b > a:
            buf[a:b] = fg[a - start:b - start]
        fg_db = rms_db(fg) if len(fg) else -100
        buf *= 10 ** ((level - fg_db) / 20)
        if snr_db is None:
            snr_db = rng.uniform(30, 45) if rng.random() < 0.2 else rng.uniform(0 if kind != 'babble' else 8, 25)
        bg *= 10 ** ((level - snr_db - rms_db(bg)) / 20)
        out = buf + bg + self.np_rng.normal(scale=10 ** (-80 / 20), size=n).astype(np.float32)
        return (np.clip(out, -1, 1) * 32767).astype(np.int16)
