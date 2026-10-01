"""Streaming features for "Oye Quanela" (ADR 0016) — the reference the browser must match.

Audio: int16, 16 kHz, processed in 80 ms chunks (1280 samples).
  chunk n → log-mel of [480 previous samples + chunk] (1760 samples) → 8 frames × 32, then x/10 + 2
  once 76 mel frames exist → one 96-d embedding per chunk (last 76 frames)
  once 16 embeddings exist → one classifier score per chunk (last 16 embeddings)
Batch helpers below compute exactly the same thing for many chunks at once.
"""
import numpy as np
import onnxruntime as ort

CHUNK, CONTEXT, MEL_FRAMES, EMB_WINDOW, N_EMB = 1280, 480, 8, 76, 16
WARMUP_CHUNKS = -(-EMB_WINDOW // MEL_FRAMES)            # 10: chunk index 9 yields the first embedding
BUFFER_CHUNKS = WARMUP_CHUNKS - 1 + N_EMB                # 25 chunks → exactly 16 embeddings
BUFFER_SAMPLES = CONTEXT + BUFFER_CHUNKS * CHUNK         # 32480

class Features:
    def __init__(self, mel_path='models/melspectrogram.onnx', emb_path='models/speech_embedding.onnx', threads=4):
        opts = ort.SessionOptions(); opts.intra_op_num_threads = threads; opts.inter_op_num_threads = 1
        self.mel = ort.InferenceSession(mel_path, opts, providers=['CPUExecutionProvider'])
        self.emb = ort.InferenceSession(emb_path, opts, providers=['CPUExecutionProvider'])

    def mel_chunks(self, segments):
        """[N, 1760] float32 → [N, 8, 32] transformed log-mel."""
        out = []
        for i in range(0, len(segments), 4096):
            out.append(self.mel.run(None, {'input': segments[i:i + 4096]})[0][:, 0])
        return np.concatenate(out) / 10 + 2

    def embed_windows(self, windows):
        """[N, 76, 32] → [N, 96]."""
        out = []
        for i in range(0, len(windows), 1024):
            out.append(self.emb.run(None, {'input_1': windows[i:i + 1024, :, :, None].astype(np.float32)})[0].reshape(-1, 96))
        return np.concatenate(out) if out else np.zeros((0, 96), np.float32)

    def stream_embeddings(self, audio):
        """Long int16 audio → [T, 96]; row t is the embedding after chunk t + 9 (ends at sample 1280·(t+10)).
        480 zeros are prepended as the initial context, like the browser."""
        audio = np.concatenate([np.zeros(CONTEXT, np.int16), audio.astype(np.int16)])
        n_chunks = (len(audio) - CONTEXT) // CHUNK
        if n_chunks < WARMUP_CHUNKS:
            return np.zeros((0, 96), np.float32)
        idx = np.arange(n_chunks)[:, None] * CHUNK + np.arange(CHUNK + CONTEXT)[None, :]
        mel = self.mel_chunks(audio[idx].astype(np.float32)).reshape(-1, 32)
        ends = (np.arange(WARMUP_CHUNKS - 1, n_chunks) + 1) * MEL_FRAMES
        win = mel[ends[:, None] - EMB_WINDOW + np.arange(EMB_WINDOW)[None, :]]
        return self.embed_windows(win)

    def buffer_features(self, buffers):
        """[B, 32480] int16 buffers → [B, 16, 96]: the classifier input after the last chunk."""
        B = len(buffers)
        idx = np.arange(BUFFER_CHUNKS)[:, None] * CHUNK + np.arange(CHUNK + CONTEXT)[None, :]
        mel = self.mel_chunks(buffers[:, idx].reshape(-1, CHUNK + CONTEXT).astype(np.float32)).reshape(B, -1, 32)
        ends = (np.arange(WARMUP_CHUNKS - 1, BUFFER_CHUNKS) + 1) * MEL_FRAMES
        win = mel[:, ends[:, None] - EMB_WINDOW + np.arange(EMB_WINDOW)[None, :]]  # [B, 16, 76, 32]
        return self.embed_windows(win.reshape(-1, EMB_WINDOW, 32)).reshape(B, N_EMB, 96)
