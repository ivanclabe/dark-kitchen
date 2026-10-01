"""Chatterbox Multilingual (MIT) clips for ADR 0016: zero-shot voices cloned from FLEURS
es_419 utterances (CC BY 4.0) — many real Latin American speakers. Train refs come from the
FLEURS train split, eval refs from the test split (disjoint speakers).
Usage: python gen/gen_chatterbox.py KIND N SPLIT SEED
"""
import csv, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np, soundfile as sf, torch
import perth
perth.PerthImplicitWatermarker = perth.DummyWatermarker  # optional dep missing; watermark is irrelevant for training data
from scipy.signal import resample_poly
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from gen.texts import ADVERSARIAL, KITCHEN, POSITIVE

def references(split):
    fleurs_split = 'train' if split == 'train' else 'test'
    rows = list(csv.reader(open(f'data/raw/fleurs/{fleurs_split}.tsv'), delimiter='\t', quoting=csv.QUOTE_NONE))
    root = f'data/raw/fleurs/wav/{fleurs_split}/{fleurs_split}'
    return [f'{root}/{r[1]}' for r in rows if 16000 * 4 < int(r[5]) < 16000 * 12 and os.path.exists(f'{root}/{r[1]}')]

def main():
    kind, n, split, seed = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4])
    rng = random.Random(seed)
    texts = {'pos': POSITIVE, 'adv': ADVERSARIAL, 'kitchen': KITCHEN}[kind]
    refs = references(split)
    out = f'data/tts/{split}/{kind}'
    os.makedirs(out, exist_ok=True)
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    model = ChatterboxMultilingualTTS.from_pretrained(device=device)
    meta = open(f'{out}/chatterbox_meta.csv', 'a')
    ref = None
    for i in range(n):
        if i % 3 == 0:  # a new cloned speaker every 3 clips (cloning costs as much as a clip)
            ref, exaggeration = rng.choice(refs), rng.uniform(0.3, 0.8)
            model.prepare_conditionals(ref, exaggeration=exaggeration)
        text = rng.choice(texts)
        cfg, temperature = rng.uniform(0.3, 0.7), rng.uniform(0.6, 1.0)
        try:
            wav = model.generate(text, language_id='es', exaggeration=exaggeration, cfg_weight=cfg, temperature=temperature)
        except Exception as err:  # a bad reference must not stop the batch
            print('skip', ref, err, file=sys.stderr); continue
        wav = wav.squeeze().cpu().numpy()
        if len(wav) > model.sr * 4:  # runaway generation: drop
            continue
        wav = resample_poly(wav, 16000 // 1000, model.sr // 1000)
        wav = (wav / max(1e-6, np.abs(wav).max()) * 0.9 * 32767).astype(np.int16)
        name = f'chatterbox_{seed}_{i:05d}.wav'
        sf.write(f'{out}/{name}', wav, 16000)
        meta.write(f'{name},{os.path.basename(ref)},{exaggeration:.2f},{cfg:.2f},{temperature:.2f},"{text}"\n')
        meta.flush()
    meta.close()

if __name__ == '__main__':
    main()
