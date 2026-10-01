"""Builds the speech-embedding ONNX model from Google's TF Hub weights (Apache 2.0).

Same topology as Google's `speech_embedding/1` (MudpuppyLite): 19 conv+BN
blocks (LeakyReLU 0.2, then max(x, -0.4)), 5 max-pools and a final conv.
Batch norm is folded into each conv. Input [N, 76, 32, 1] (log-mel frames),
output [N, 1, 1, 96] — the same contract openWakeWord uses.
"""
import sys
import numpy as np
import onnx
import tensorflow_hub as hub
from onnx import TensorProto, helper, numpy_helper

EPS = float(sys.argv[1]) if len(sys.argv) > 1 else 1e-3
ZERO_MEAN = (sys.argv[2] == '1') if len(sys.argv) > 2 else True
OUT = sys.argv[3] if len(sys.argv) > 3 else 'models/speech_embedding.onnx'

mod = hub.load('https://tfhub.dev/google/speech_embedding/1')
v = {x.name.replace('embeddings/state/MudpuppyLite/', '').replace(':0', ''): x.numpy() for x in mod.variables}

conv_names = ['ZeroMeanConv2d'] + ['Conv'] + [f'Conv_{i}' for i in range(1, 19)]
bn_names = ['BatchNorm'] + [f'BatchNorm_{i}' for i in range(1, 19)]
# Max-pools after these conv indices (0-based), with (kernel, stride).
POOLS = {2: (2, 2), 6: (1, 2), 10: (2, 2), 14: (1, 2), 18: (2, 2)}

nodes, inits = [], []
nodes.append(helper.make_node('Transpose', ['input_1'], ['x0'], perm=[0, 3, 1, 2]))  # NHWC → NCHW
inits.append(numpy_helper.from_array(np.array([[[[-0.4]]]], dtype=np.float32), 'floor'))
x = 'x0'
for i, cname in enumerate(conv_names):
    w = v[f'{cname}/weights']  # [kh, kw, in, out]
    if i == 0 and ZERO_MEAN:
        w = w - w.mean(axis=(0, 1, 2), keepdims=True)
    w = np.transpose(w, (3, 2, 0, 1)).astype(np.float32)  # → [out, in, kh, kw]
    kh, kw = w.shape[2], w.shape[3]
    pads = [0, 1, 0, 1] if kw == 3 else [0, 0, 0, 0]  # 'same' on mel, 'valid' on time
    ins = [x, f'w{i}']
    if i < len(bn_names):
        bn = bn_names[i]
        gamma, beta, mean, var = (v[f'{bn}/{k}'] for k in ('gamma', 'beta', 'moving_mean', 'moving_variance'))
        scale = gamma / np.sqrt(var + EPS)
        w = w * scale[:, None, None, None]
        b = (beta - mean * scale).astype(np.float32)
        inits.append(numpy_helper.from_array(b, f'b{i}'))
        ins.append(f'b{i}')
    inits.append(numpy_helper.from_array(w.astype(np.float32), f'w{i}'))
    nodes.append(helper.make_node('Conv', ins, [f'c{i}'], kernel_shape=[kh, kw], pads=pads, strides=[1, 1]))
    x = f'c{i}'
    if i < len(bn_names):
        nodes.append(helper.make_node('LeakyRelu', [x], [f'l{i}'], alpha=0.2))
        nodes.append(helper.make_node('Max', [f'l{i}', 'floor'], [f'm{i}']))
        x = f'm{i}'
        if i in POOLS:
            k, s = POOLS[i]
            nodes.append(helper.make_node('MaxPool', [x], [f'p{i}'], kernel_shape=[k, 2], strides=[k, 2] if k == 2 else [1, 2]))
            x = f'p{i}'
nodes.append(helper.make_node('Transpose', [x], ['conv2d_19'], perm=[0, 2, 3, 1]))  # NCHW → NHWC [N,1,1,96]

graph = helper.make_graph(
    nodes, 'speech_embedding',
    [helper.make_tensor_value_info('input_1', TensorProto.FLOAT, ['batch', 76, 32, 1])],
    [helper.make_tensor_value_info('conv2d_19', TensorProto.FLOAT, ['batch', 1, 1, 96])],
    inits,
)
model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 13)], producer_name='quanela')
model.ir_version = 8
model.doc_string = "Google speech_embedding/1 (TF Hub, Apache-2.0) exported by Quanela (ADR 0016)."
onnx.checker.check_model(model)
onnx.save(model, OUT)
print('saved', OUT)
