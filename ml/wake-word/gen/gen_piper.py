"""Piper es_ES-carlfm-x_low (public domain dataset, trained from scratch) clips for ADR 0016.
The only Spanish Piper voice with a clean chain: the others are fine-tuned from research-only
(Lessac) or non-commercial (Ryan) English checkpoints. Variety comes from the sampling noise.
Usage: python gen/gen_piper.py KIND N SPLIT SEED
"""
import os, random, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np, soundfile as sf
from piper import PiperVoice, SynthesisConfig
from gen.gen_kokoro import speech_texts
from gen.texts import ADVERSARIAL, KITCHEN, POSITIVE

def main():
    kind, n, split, seed = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4])
    rng = random.Random(seed)
    texts = {'pos': POSITIVE, 'adv': ADVERSARIAL, 'kitchen': KITCHEN}.get(kind) or speech_texts()
    out = f'data/tts/{split}/{kind}'
    os.makedirs(out, exist_ok=True)
    voice = PiperVoice.load('tts/piper/es_ES-carlfm-x_low.onnx')
    meta = open(f'{out}/piper_meta.csv', 'a')
    for i in range(n):
        cfg = SynthesisConfig(length_scale=rng.uniform(0.8, 1.3), noise_scale=rng.uniform(0.3, 1.0), noise_w_scale=rng.uniform(0.3, 1.2))
        text = rng.choice(texts)
        wav = np.concatenate([c.audio_int16_array for c in voice.synthesize(text, syn_config=cfg)])
        name = f'piper_{seed}_{i:05d}.wav'
        sf.write(f'{out}/{name}', wav, 16000)
        meta.write(f'{name},{cfg.length_scale:.2f},{cfg.noise_scale:.2f},{cfg.noise_w_scale:.2f},"{text}"\n')
    meta.close()

if __name__ == '__main__':
    main()
