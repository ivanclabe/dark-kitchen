"""Phase 2b (ADR 0016): evaluates real, consented recordings with the exported model.
  POSITIVES: folder of recordings where someone says "Oye Quanela" once (any format soundfile reads)
  AMBIENT:   folder of kitchen ambience without the phrase (hours)
Reports misses, false activations per hour and near misses per file, with the browser logic.
Usage: python -m ww.evaluate_real MODEL_DIR POSITIVES AMBIENT [THRESHOLD] [CONFIRM]
Recordings are only read; nothing is copied or kept.
"""
import glob, os, sys
import numpy as np
from ww.augment import load
from ww.evaluate import Scorer, detections

def files(folder):
    return sorted(f for f in glob.glob(f'{folder}/**/*', recursive=True) if os.path.isfile(f) and not f.endswith(('.txt', '.csv', '.json')))

def main():
    model_dir, pos_dir, amb_dir = sys.argv[1:4]
    th = float(sys.argv[4]) if len(sys.argv) > 4 else 0.95
    cf = int(sys.argv[5]) if len(sys.argv) > 5 else 2
    scorer = Scorer(model_dir)
    pad = np.zeros(int(2.5 * 16000), np.float32)  # warm-up before the phrase, as when the tablet is already listening
    missed = []
    pos = files(pos_dir)
    for f in pos:
        x = np.concatenate([pad, load(f), pad[:16000]])
        if not detections(scorer.audio_scores((np.clip(x, -1, 1) * 32767).astype(np.int16)), th, cf):
            missed.append(os.path.basename(f))
    hours, fired = 0.0, []
    for f in files(amb_dir):
        x = load(f); hours += len(x) / 16000 / 3600
        n = len(detections(scorer.audio_scores((np.clip(x, -1, 1) * 32767).astype(np.int16)), th, cf))
        if n:
            fired.append(f'{os.path.basename(f)}: {n}')
    print(f'threshold {th}, confirm {cf}')
    print(f'misses: {len(missed)}/{len(pos)} ({len(missed) / max(1, len(pos)):.1%})', *missed, sep='\n  ')
    print(f'false activations: {len(fired)} files, {sum(int(s.split(": ")[1]) for s in fired) / max(hours, 1e-9):.2f} per hour over {hours:.2f} h', *fired, sep='\n  ')

if __name__ == '__main__':
    main()
