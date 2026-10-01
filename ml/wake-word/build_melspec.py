"""Builds the log-mel front end as ONNX from standard DSP formulas (ADR 0016).

STFT: n_fft 512, hop 160, Hann window of 400 centred in 512, no padding.
Power spectrum → 32 Slaney mel bands (60–3800 Hz) → 10·log10(max(x, 1e-10)),
floored at (max − 80 dB) per clip (the original reduces over the whole batch;
identical for one clip, which is how streaming runs). Input: int16-scaled float audio [N, samples];
output [time, 1, frames, 32]. (openWakeWord then applies x/10 + 2.)
"""
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

SR, N_FFT, HOP, WIN, N_MELS, FMIN, FMAX = 16000, 512, 160, 400, 32, 60.0, 3800.0

def hz_to_mel(f):  # Slaney (librosa default, htk=False)
    f = np.asanyarray(f, dtype=np.float64)
    f_sp, min_log_hz, logstep = 200.0 / 3, 1000.0, np.log(6.4) / 27.0
    mels = f / f_sp
    return np.where(f >= min_log_hz, min_log_hz / f_sp + np.log(np.maximum(f, 1e-10) / min_log_hz) / logstep, mels)

def mel_to_hz(m):
    m = np.asanyarray(m, dtype=np.float64)
    f_sp, min_log_hz, logstep = 200.0 / 3, 1000.0, np.log(6.4) / 27.0
    min_log_mel = min_log_hz / f_sp
    return np.where(m >= min_log_mel, min_log_hz * np.exp(logstep * (m - min_log_mel)), f_sp * m)

def mel_filterbank():
    fft_freqs = np.linspace(0, SR / 2, N_FFT // 2 + 1)
    mel_f = mel_to_hz(np.linspace(hz_to_mel(FMIN), hz_to_mel(FMAX), N_MELS + 2))
    fdiff, ramps = np.diff(mel_f), mel_f[:, None] - fft_freqs[None, :]
    weights = np.zeros((N_MELS, len(fft_freqs)))
    for i in range(N_MELS):
        lower, upper = -ramps[i] / fdiff[i], ramps[i + 2] / fdiff[i + 1]
        weights[i] = np.maximum(0, np.minimum(lower, upper))
    weights *= (2.0 / (mel_f[2:N_MELS + 2] - mel_f[:N_MELS]))[:, None]  # Slaney area norm
    return weights.T.astype(np.float32)  # [257, 32]

def stft_kernels():
    n = np.arange(WIN)
    hann = 0.5 - 0.5 * np.cos(2 * np.pi * n / WIN)  # periodic Hann (fftbins=True)
    window = np.zeros(N_FFT); start = (N_FFT - WIN) // 2
    window[start:start + WIN] = hann
    k, t = np.arange(N_FFT // 2 + 1)[:, None], np.arange(N_FFT)[None, :]
    real = (window * np.cos(2 * np.pi * k * t / N_FFT)).astype(np.float32)[:, None, :]
    imag = (-window * np.sin(2 * np.pi * k * t / N_FFT)).astype(np.float32)[:, None, :]
    return real, imag

if __name__ == '__main__':
    real, imag = stft_kernels()
    C = lambda name, value: helper.make_node('Constant', [], [name], value=numpy_helper.from_array(np.array(value, dtype=np.float32), name + '_v'))
    nodes = [
        helper.make_node('Constant', [], ['ax1'], value=numpy_helper.from_array(np.array([1], dtype=np.int64), 'ax1_v')),
        helper.make_node('Unsqueeze', ['input', 'ax1'], ['x']),
        helper.make_node('Conv', ['x', 'w_real'], ['re'], kernel_shape=[N_FFT], strides=[HOP], pads=[0, 0]),
        helper.make_node('Conv', ['x', 'w_imag'], ['im'], kernel_shape=[N_FFT], strides=[HOP], pads=[0, 0]),
        helper.make_node('Unsqueeze', ['re', 'ax1'], ['re4']), helper.make_node('Transpose', ['re4'], ['re_t'], perm=[0, 1, 3, 2]),
        helper.make_node('Unsqueeze', ['im', 'ax1'], ['im4']), helper.make_node('Transpose', ['im4'], ['im_t'], perm=[0, 1, 3, 2]),
        helper.make_node('Mul', ['re_t', 're_t'], ['re2']), helper.make_node('Mul', ['im_t', 'im_t'], ['im2']),
        helper.make_node('Add', ['re2', 'im2'], ['power']),
        helper.make_node('MatMul', ['power', 'mel_w'], ['mel']),
        C('amin', 1e-10), C('ten', 10.0), C('ln10', np.log(10.0)), C('top_db', 80.0),
        helper.make_node('Max', ['mel', 'amin'], ['mel_c']),
        helper.make_node('Log', ['mel_c'], ['ln']), helper.make_node('Mul', ['ln', 'ten'], ['ln10x']), helper.make_node('Div', ['ln10x', 'ln10'], ['db']),
        helper.make_node('ReduceMax', ['db'], ['db_max'], axes=[1, 2, 3], keepdims=1),  # per clip, so batches of 80 ms chunks behave like streaming
        helper.make_node('Sub', ['db_max', 'top_db'], ['floor']),
        helper.make_node('Max', ['db', 'floor'], ['output']),
    ]
    graph = helper.make_graph(nodes, 'log_mel', [helper.make_tensor_value_info('input', TensorProto.FLOAT, ['batch', 'samples'])],
                              [helper.make_tensor_value_info('output', TensorProto.FLOAT, ['batch', 1, 'frames', N_MELS])],
                              [numpy_helper.from_array(real, 'w_real'), numpy_helper.from_array(imag, 'w_imag'), numpy_helper.from_array(mel_filterbank(), 'mel_w')])
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 13)], producer_name='quanela')
    model.ir_version = 8
    model.doc_string = 'Log-mel front end (standard DSP, written by Quanela, ADR 0016).'
    onnx.checker.check_model(model)
    onnx.save(model, 'models/melspectrogram.onnx')
    print('saved models/melspectrogram.onnx')
