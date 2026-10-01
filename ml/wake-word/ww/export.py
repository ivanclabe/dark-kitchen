"""Exports the trained classifier to ONNX (opset 13, IR 8) and checks it against torch."""
import sys
import numpy as np, onnx, onnxruntime as ort, torch
from ww.model import Exported, WakeNet

model_dir = sys.argv[1]
state = torch.load(f'{model_dir}/wakenet.pt', map_location='cpu')
if 'net.1.weight' in state:  # round 1 was trained before the dropout layers existed
    state = {k.replace(f'net.{a}.', f'net.{b}.'): v for k, v in state.items() for a, b in [(1, 2), (2, 3), (4, 6), (5, 7), (7, 10)] if k.startswith(f'net.{a}.')}
net = WakeNet(); net.load_state_dict(state); net.eval()
wrapped = Exported(net).eval()
x = torch.randn(4, 16, 96)
torch.onnx.export(wrapped, (x,), f'{model_dir}/oye_quanela.onnx', input_names=['features'], output_names=['score'],
                  dynamic_axes={'features': {0: 'batch'}, 'score': {0: 'batch'}}, opset_version=13, dynamo=False)
m = onnx.load(f'{model_dir}/oye_quanela.onnx'); m.ir_version = 8; m.producer_name = 'quanela'
m.doc_string = '"Oye Quanela" wake-word classifier (ADR 0016): 16 x 96 speech embeddings -> probability.'
onnx.checker.check_model(m); onnx.save(m, f'{model_dir}/oye_quanela.onnx')
ref = wrapped(x).detach().numpy()
got = ort.InferenceSession(f'{model_dir}/oye_quanela.onnx').run(None, {'features': x.numpy()})[0]
print('export max|diff|', float(np.abs(ref - got).max()), 'size', len(m.SerializeToString()))
