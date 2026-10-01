"""Trains the "Oye Quanela" classifier (ADR 0016).
Positives: augmented synthetic phrases. Negatives: near misses and other synthetic speech
(same voices), plus windows of long real audio (Spanish speech, kitchen, MUSAN).
Two rounds: base training, then hard negatives mined from the training streams.
Usage: python -m ww.train OUT_DIR [steps]
"""
import glob, json, os, sys, time
import numpy as np, torch
from torch import nn
from ww.model import WakeNet

F = os.environ.get('WW_FEATURES', 'data/features')
rng = np.random.default_rng(0)
torch.manual_seed(0)

def load(pattern):
    files = sorted(glob.glob(f'{F}/{pattern}'))
    return np.concatenate([np.load(f) for f in files]).astype(np.float32) if files else np.zeros((0, 16, 96), np.float32)

def windows(stream, idx):
    return stream[idx[:, None] + np.arange(16)[None, :]]

def main():
    out = sys.argv[1]
    steps = int(sys.argv[2]) if len(sys.argv) > 2 else 12000
    dropout = float(os.environ.get('WW_DROPOUT', '0'))
    feat_noise = float(os.environ.get('WW_FEAT_NOISE', '0'))  # × per-dimension std
    weight_decay = float(os.environ.get('WW_WD', '0.01'))
    os.makedirs(out, exist_ok=True)
    pos = load('train_pos_*.npy')
    neg_clips = np.concatenate([load(f'train_{k}_*.npy') for k in ('adv', 'hard', 'kitchen', 'speech')])
    streams = {os.path.basename(f)[13:-4]: np.load(f).astype(np.float32) for f in sorted(glob.glob(f'{F}/train_stream_*.npy'))}
    print('pos', pos.shape, 'neg clips', neg_clips.shape, {k: round(len(v) * 0.08 / 3600, 1) for k, v in streams.items()}, 'h', flush=True)

    # Hold out 5 % of the clips to watch over-fitting.
    def split(a):
        p = rng.permutation(len(a)); n = max(1, len(a) // 20)
        return a[p[n:]], a[p[:n]]
    pos, pos_val = split(pos)
    neg_clips, neg_val = split(neg_clips)
    names = list(streams)
    sizes = np.array([len(streams[k]) - 16 for k in names], dtype=np.float64)
    stream_p = np.sqrt(sizes) / np.sqrt(sizes).sum()  # every source counts, big ones a bit more

    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    model = WakeNet(dropout=dropout).to(device)
    feat_std = torch.from_numpy(pos[:5000].reshape(-1, 96).std(axis=0)).to(device)
    hard = np.zeros((0, 16, 96), np.float32)

    def stream_batch(n):
        counts = rng.multinomial(n, stream_p)
        parts = [windows(streams[k], rng.integers(0, len(streams[k]) - 16, size=c)) for k, c in zip(names, counts) if c]
        return np.concatenate(parts)

    def train(n_steps, lr, neg_weight_max):
        opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
        sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=n_steps, pct_start=0.1)
        bce = nn.BCEWithLogitsLoss(reduction='none')
        t0 = time.time()
        for step in range(n_steps):
            bp = pos[rng.integers(0, len(pos), 256)]
            bn = neg_clips[rng.integers(0, len(neg_clips), 256)]
            bs = stream_batch(384 if len(hard) else 512)
            parts = [bp, bn, bs] + ([hard[rng.integers(0, len(hard), 128)]] if len(hard) else [])
            x = torch.from_numpy(np.concatenate(parts)).to(device)
            if feat_noise:
                x = x + torch.randn_like(x) * feat_std * feat_noise
            y = torch.cat([torch.ones(len(bp)), torch.zeros(len(x) - len(bp))]).to(device)
            # Negatives weigh more as training goes on (false activations are the costly error).
            w_neg = 1 + (neg_weight_max - 1) * min(1.0, step / (0.6 * n_steps))
            w = torch.where(y > 0, torch.ones_like(y), torch.full_like(y, w_neg))
            loss = (bce(model(x), y) * w).mean()
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            if step % 1000 == 0 or step == n_steps - 1:
                print(f'step {step} loss {loss.item():.4f} w_neg {w_neg:.1f} ({time.time() - t0:.0f}s) {validate()}', flush=True)

    @torch.no_grad()
    def score(a, batch=8192):
        model.eval()
        out = [torch.sigmoid(model(torch.from_numpy(a[i:i + batch]).to(device))).cpu().numpy() for i in range(0, len(a), batch)]
        model.train()
        return np.concatenate(out) if out else np.zeros(0)

    def validate():
        sp, sn = score(pos_val), score(neg_val)
        return f'val recall@0.5 {np.mean(sp >= 0.5):.3f} clip-FP@0.5 {np.mean(sn >= 0.5):.4f}'

    def mine(threshold=0.1, cap=60000):
        found = []
        for k in names:
            s = streams[k]
            for start in range(0, len(s) - 16, 200000):
                idx = np.arange(start, min(start + 200000, len(s) - 16))
                w = windows(s, idx)
                sc = score(w)
                found.append(w[sc >= threshold])
        found = np.concatenate(found)
        clip_scores = score(neg_clips)
        found = np.concatenate([found, neg_clips[clip_scores >= threshold]])
        if len(found) > cap:
            found = found[rng.permutation(len(found))[:cap]]
        return found

    train(steps, 1e-3, 20)
    hard = mine()
    print('hard negatives', len(hard), flush=True)
    train(steps // 2, 3e-4, 30)
    torch.save(model.state_dict(), f'{out}/wakenet.pt')
    json.dump({'steps': steps, 'dropout': dropout, 'feat_noise': feat_noise, 'weight_decay': weight_decay, 'pos': len(pos), 'neg_clips': len(neg_clips), 'hard': len(hard),
               'stream_hours': {k: len(v) * 0.08 / 3600 for k, v in streams.items()}}, open(f'{out}/train.json', 'w'), indent=1)
    print('saved', out, flush=True)

if __name__ == '__main__':
    main()
