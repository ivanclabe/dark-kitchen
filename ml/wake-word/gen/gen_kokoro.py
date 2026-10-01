"""Kokoro-82M (Apache 2.0) clips for ADR 0016: native Spanish voices blended with
the other Kokoro voices to get many timbres, speaking Spanish phonemes.
Usage: python gen/gen_kokoro.py KIND N SPLIT SEED   (KIND: pos | adv | kitchen | speech)
"""
import csv, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import kokoro_setup  # noqa: F401
import numpy as np, soundfile as sf, torch
from scipy.signal import resample_poly
from kokoro import KPipeline
from gen.texts import ADVERSARIAL, HARD, KITCHEN, POSITIVE

NATIVE = ['ef_dora', 'em_alex', 'em_santa']
PARTNERS = {
    'train': ['af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'af_sky', 'af_kore', 'af_nova', 'af_river', 'am_adam', 'am_echo',
              'am_eric', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'ff_siwis', 'if_sara', 'im_nicola', 'jf_alpha', 'jm_kumo',
              'zf_xiaoxiao', 'zm_yunxi', 'hf_alpha', 'hm_omega'],
    'eval': ['bf_emma', 'bf_isabella', 'bm_daniel', 'bm_george', 'pf_dora', 'pm_alex', 'pm_santa', 'zf_xiaoyi'],
}

def speech_texts():
    rows = []
    for split in ('train', 'dev'):
        p = f'data/raw/fleurs/{split}.tsv'
        if os.path.exists(p):
            rows += [r[1] for r in csv.reader(open(p), delimiter='\t', quoting=csv.QUOTE_NONE) if len(r) > 2]
    return rows or KITCHEN

def main():
    kind, n, split, seed = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4])
    rng = random.Random(seed)
    texts = {'pos': POSITIVE, 'adv': ADVERSARIAL, 'hard': HARD, 'kitchen': KITCHEN}.get(kind) or speech_texts()
    out = f'data/tts/{split}/{kind}'
    os.makedirs(out, exist_ok=True)
    pipe = KPipeline(lang_code='e', repo_id='hexgrad/Kokoro-82M')
    cache = {}
    voice = lambda name: cache.setdefault(name, pipe.load_single_voice(name))
    meta = open(f'{out}/kokoro_meta.csv', 'a')
    for i in range(n):
        base, partner = rng.choice(NATIVE), rng.choice(PARTNERS[split])
        w = rng.uniform(0.35, 1.0)
        style = w * voice(base) + (1 - w) * voice(partner)
        text, speed = rng.choice(texts), rng.uniform(0.8, 1.25)
        audio = [a for _, _, a in pipe(text, voice=style, speed=speed) if a is not None]
        if not audio:
            continue
        wav = resample_poly(torch.cat(audio).numpy(), 2, 3)
        wav = (wav / max(1e-6, np.abs(wav).max()) * 0.9 * 32767).astype(np.int16)
        name = f'kokoro_{seed}_{i:05d}.wav'
        sf.write(f'{out}/{name}', wav, 16000)
        meta.write(f'{name},{base},{partner},{w:.2f},{speed:.2f},"{text}"\n')
    meta.close()

if __name__ == '__main__':
    main()
