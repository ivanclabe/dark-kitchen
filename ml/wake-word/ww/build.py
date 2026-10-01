"""Builds classifier training data (ADR 0016).
  clips  → data/features/{split}_{kind}.npy   [N, 16, 96] float16 (one buffer per augmented clip)
  streams→ data/features/{split}_stream_{name}.npy [T, 96] float16 (long negative audio)
Usage: python -m ww.build clips SPLIT KIND COPIES SEED [SHARD/SHARDS]   |   python -m ww.build streams SPLIT
"""
import glob, os, random, sys
import numpy as np
from ww.augment import Augmenter, load, split_of, trim, SR
from ww.features import BUFFER_SAMPLES, Features

OUT = 'data/features'

def build_clips(split, kind, copies, seed, shard=0, shards=1):
    files = sorted(glob.glob(f'data/tts/{split}/{kind}/*.wav'))[shard::shards]
    aug, feats, rng = Augmenter(split, seed), Features(threads=3), random.Random(seed)
    out, batch = [], []
    for i, f in enumerate(files):
        x = trim(load(f))
        if kind == 'pos' and not (0.5 * SR < len(x) < 2.4 * SR):
            continue  # truncated or runaway synthesis
        for _ in range(copies):
            v = aug.voice(x)
            if kind == 'pos':
                end = BUFFER_SAMPLES - int(rng.uniform(0, 0.3) * SR)       # phrase just finished
            elif kind in ('adv', 'hard', 'kitchen') and rng.random() < 0.6:
                end = BUFFER_SAMPLES - int(rng.uniform(0, 0.4) * SR)       # hardest case: same placement as positives
            else:
                end = rng.randrange(int(0.4 * SR), BUFFER_SAMPLES + len(v))  # anywhere, possibly cut
            batch.append(aug.mix(v, BUFFER_SAMPLES, end))
        if len(batch) >= 256 or i == len(files) - 1:
            if batch:
                out.append(feats.buffer_features(np.stack(batch)).astype(np.float16))
            batch = []
            print(f'{split}/{kind}: {i + 1}/{len(files)}', flush=True)
    os.makedirs(OUT, exist_ok=True)
    np.save(f'{OUT}/{split}_{kind}_{seed}_{shard}.npy', np.concatenate(out))

def build_streams(split, seed=7):
    """Real negative audio: Spanish speech (clean and over kitchen noise), kitchen noise, MUSAN."""
    aug, feats, rng = Augmenter(split, seed), Features(threads=6), random.Random(seed)
    fleurs = 'train' if split == 'train' else 'test'
    groups = {
        'speech': sorted(glob.glob(f'data/raw/fleurs/wav/{fleurs}/**/*.wav', recursive=True)),
        'kitchen': sorted(glob.glob(f'data/noise/kitchen_{split}/*.wav')),
    }
    for kind in ('noise', 'music', 'speech'):
        groups[f'musan_{kind}'] = [f for f in sorted(glob.glob(f'data/raw/musan/{kind}/**/*.wav', recursive=True)) if split_of(f) == split]
    # MUSAN speech (~60 h, mostly English) and music (~42 h): a third of each is enough variety for training.
    if split == 'train':
        for kind in ('musan_speech', 'musan_music'):
            groups[kind] = random.Random(1).sample(groups[kind], len(groups[kind]) // 3) if groups[kind] else []
    os.makedirs(OUT, exist_ok=True)
    for name, files in groups.items():
        if not files or os.path.exists(f'{OUT}/{split}_stream_{name}.npy'):
            continue
        embs, seconds = [], 0.0
        for i, f in enumerate(files):
            x = load(f)
            seconds += len(x) / SR
            x = x / (np.abs(x).max() + 1e-9) * 10 ** (rng.uniform(-30, -3) / 20)
            if name == 'speech' and rng.random() < 0.6:  # talk over a working kitchen
                bg, _ = aug.background(len(x), 'kitchen')
                x = x + bg / (np.abs(bg).max() + 1e-9) * np.abs(x).max() * 10 ** (-rng.uniform(0, 20) / 20)
            x = x + np.random.default_rng(i).normal(scale=1e-4, size=len(x))
            embs.append(feats.stream_embeddings((np.clip(x, -1, 1) * 32767).astype(np.int16)).astype(np.float16))
            if i % 200 == 0:
                print(f'{split}/stream {name}: {i}/{len(files)} ({seconds / 3600:.1f} h)', flush=True)
        np.save(f'{OUT}/{split}_stream_{name}.npy', np.concatenate(embs))
        print(f'{split}/stream {name}: {seconds / 3600:.2f} h', flush=True)

if __name__ == '__main__':
    if sys.argv[1] == 'clips':
        shard, shards = (int(v) for v in (sys.argv[6] if len(sys.argv) > 6 else '0/1').split('/'))
        build_clips(sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]) + shard, shard, shards)
    else:
        build_streams(sys.argv[2])
