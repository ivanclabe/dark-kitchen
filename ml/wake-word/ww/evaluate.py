"""Evaluates an exported "Oye Quanela" model in streaming, as the browser runs it (ADR 0016).
  - misses: held-out voices (Kokoro eval voices, Chatterbox clones of FLEURS test speakers),
    each clip inside continuous audio: clean, 10 dB and 5 dB of held-out background noise
  - near misses: held-out adversarial phrases, per phrase
  - false activations per hour: held-out streams (Spanish speech ± kitchen, kitchen, MUSAN)
  - latency: detection time − end of the phrase
Sweeps threshold × confirm frames and writes results.json.
Usage: python -m ww.evaluate MODEL_DIR
"""
import csv, glob, json, os, random, sys
from collections import defaultdict
import numpy as np, onnxruntime as ort
from ww.augment import Augmenter, load, rms_db, trim, SR
from ww.features import CHUNK, Features

THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.97, 0.99]
CONFIRM = [1, 2, 3]
REFRACTORY = 25
PRE, POST = int(2.5 * SR), int(1.5 * SR)
ROOT = os.environ.get('WW_EVAL_ROOT', 'data/tts/eval')
LIMIT = int(os.environ.get('WW_EVAL_LIMIT', '0')) or None  # smoke runs only

def detections(scores, threshold, confirm):
    """Chunk indices where the browser logic fires (same as WakeWordStream)."""
    out, above, quiet = [], 0, 0
    for i, s in enumerate(scores):
        if quiet > 0:
            quiet -= 1; continue
        above = above + 1 if s >= threshold else 0
        if above >= confirm:
            out.append(i); above = 0; quiet = REFRACTORY
    return out

class Scorer:
    def __init__(self, model_dir):
        self.feats = Features(threads=6)
        self.clf = ort.InferenceSession(f'{model_dir}/oye_quanela.onnx', providers=['CPUExecutionProvider'])

    def classify(self, windows):
        out = [self.clf.run(None, {'features': windows[i:i + 4096].astype(np.float32)})[0][:, 0] for i in range(0, len(windows), 4096)]
        return np.concatenate(out) if out else np.zeros(0, np.float32)

    def stream_scores(self, emb):
        """Score after each chunk once 16 embeddings exist; index j ends at sample 1280·(j + 25)."""
        if len(emb) < 16:
            return np.zeros(0, np.float32)
        idx = np.arange(len(emb) - 15)[:, None] + np.arange(16)[None, :]
        return self.classify(emb[idx])

    def audio_scores(self, audio_int16):
        return self.stream_scores(self.feats.stream_embeddings(audio_int16))

def texts_of(folder):
    t = {}
    for m in glob.glob(f'{folder}/*_meta.csv'):
        for row in csv.reader(open(m)):
            t[row[0]] = row[-1]
    return t

def clip_trials(scorer, folder, aug, snr, seed):
    """Each clip inside continuous background audio. Returns [(name, scores, clip_start, clip_end)].
    The embeddings do not depend on the model, so they are cached per folder, condition and seed."""
    files = sorted(glob.glob(f'{folder}/*.wav'))[:LIMIT]
    cache = f'data/features/trials_{folder.replace("/", "_")}_{snr}_{seed}_{len(files)}.npz'
    if os.path.exists(cache) and not LIMIT:
        c = np.load(cache, allow_pickle=True)
        return [(n, scorer.stream_scores(e.astype(np.float32)), int(a), int(b)) for n, e, a, b in zip(c['names'], c['embs'], c['starts'], c['ends'])]
    rng = random.Random(seed)
    aug = Augmenter('eval', seed=seed)  # same background and reverb draws on every run
    trials, embs = [], []
    for f in files:
        x = aug.voice(trim(load(f)))
        n = PRE + len(x) + POST
        bg, _ = aug.background(n, rng.choice(['kitchen', 'kitchen', 'musan_noise', 'musan_music', 'babble']))
        level = rng.uniform(-35, -18)
        speech = np.zeros(n, np.float32); speech[PRE:PRE + len(x)] = x * 10 ** ((level - rms_db(x)) / 20)
        noise = bg * 10 ** ((level - (snr if snr is not None else 45) - rms_db(bg)) / 20)
        audio = np.clip(speech + noise + np.random.default_rng(len(trials)).normal(scale=1e-4, size=n), -1, 1)
        emb = scorer.feats.stream_embeddings((audio * 32767).astype(np.int16))
        embs.append(emb.astype(np.float16))
        trials.append((os.path.basename(f), scorer.stream_scores(emb), PRE, PRE + len(x)))
    if not LIMIT:
        e = np.empty(len(embs), dtype=object); e[:] = embs
        np.savez(cache, names=np.array([t[0] for t in trials]), embs=e, starts=np.array([t[2] for t in trials]), ends=np.array([t[3] for t in trials]))
    return trials

def chunk_end(j):
    return CHUNK * (j + 25)

def main():
    model_dir = sys.argv[1]
    scorer, aug = Scorer(model_dir), Augmenter('eval', seed=5)
    results = {'conditions': {}, 'adversarial': {}, 'streams': {}, 'sweep': []}

    pos = {name: clip_trials(scorer, f'{ROOT}/pos', aug, snr, 10 + i) for i, (name, snr) in enumerate([('clean', None), ('10dB', 10), ('5dB', 5)])}
    adv = clip_trials(scorer, f'{ROOT}/adv', aug, None, 20) + clip_trials(scorer, f'{ROOT}/adv', aug, 10, 21)
    adv_text = texts_of(f'{ROOT}/adv')
    streams = {os.path.basename(f)[12:-4]: np.load(f).astype(np.float32) for f in sorted(glob.glob('data/features/eval_stream_*.npy'))}
    stream_scores = {k: scorer.stream_scores(v) for k, v in streams.items()}
    hours = {k: len(v) * 0.08 / 3600 for k, v in streams.items()}
    total_h = max(1e-9, sum(hours.values()))

    for th in THRESHOLDS:
        for cf in CONFIRM:
            row = {'threshold': th, 'confirm': cf}
            for name, trials in pos.items():
                hits, lat, by_gen = 0, [], defaultdict(lambda: [0, 0])
                for clip, sc, start, end in trials:
                    d = [chunk_end(j) for j in detections(sc, th, cf) if start + 0.3 * SR <= chunk_end(j) <= end + 1.0 * SR]
                    gen = clip.split('_')[0]; by_gen[gen][1] += 1
                    if d:
                        hits += 1; lat.append((d[0] - end) / SR * 1000); by_gen[gen][0] += 1
                row[f'miss_{name}'] = 1 - hits / max(1, len(trials))
                row[f'miss_{name}_by_generator'] = {g: f'{t - h}/{t}' for g, (h, t) in by_gen.items()}
                if name == 'clean':
                    row['latency_ms_median'] = float(np.median(lat)) if lat else None
                    row['latency_ms_p90'] = float(np.percentile(lat, 90)) if lat else None
            fired = defaultdict(int); count = defaultdict(int)
            for name, sc, _, _ in adv:
                text = adv_text.get(name, '?'); count[text] += 1
                if detections(sc, th, cf):
                    fired[text] += 1
            row['adv_fired'] = sum(fired.values()); row['adv_total'] = sum(count.values())
            row['adv_by_phrase'] = {t: f'{fired[t]}/{count[t]}' for t in sorted(count) if fired[t]}
            fa = {k: len(detections(s, th, cf)) for k, s in stream_scores.items()}
            row['fa_per_hour'] = sum(fa.values()) / total_h
            row['fa_by_stream'] = {k: round(fa[k] / hours[k], 2) for k in fa}
            results['sweep'].append(row)
    results['hours'] = hours
    results['counts'] = {'pos_clips': len(pos['clean']), 'adv_trials': len(adv)}
    json.dump(results, open(f'{model_dir}/results.json', 'w'), indent=1, ensure_ascii=False)
    print(f"eval hours {total_h:.1f} {', '.join(f'{k} {v:.1f}' for k, v in hours.items())}; pos {len(pos['clean'])}; adv {len(adv)}")
    print('th   cf  miss clean/10dB/5dB   FA/h   adv   latency med/p90')
    for r in results['sweep']:
        lat = f"{r['latency_ms_median']:.0f}/{r['latency_ms_p90']:.0f}" if r['latency_ms_median'] is not None else '-'
        print(f"{r['threshold']:.2f} {r['confirm']}  {r['miss_clean']:.3f}/{r['miss_10dB']:.3f}/{r['miss_5dB']:.3f}  {r['fa_per_hour']:.2f}  {r['adv_fired']}/{r['adv_total']}  {lat}")

if __name__ == '__main__':
    main()
