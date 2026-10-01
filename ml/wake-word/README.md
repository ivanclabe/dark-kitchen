# «Oye Quanela»: entrenamiento de la palabra de activación

Código para reproducir el modelo de la [ADR 0016](../../docs/adr/0016-oye-quanela-palabra-de-activacion.md). Aquí no hay datos ni modelos. Los modelos publicados están en el bucket público `dk-voice-models`, carpeta `wake/oye-quanela-v1/`, y la app los descarga desde ahí.

| Archivo publicado | Tamaño | SHA-256 |
|---|---|---|
| `melspectrogram.onnx` | 1.086.693 B | `23a9aada0160ee63c37dfe9c076b51049f12cb49dac66750495793bba95a14b9` |
| `speech_embedding.onnx` | 1.316.738 B | `7ddc8dd0828196507ea5f64e7e336366e16187676f3bcc3c6306f9fa1f3be96e` |
| `oye_quanela.onnx` | 859.926 B | `cce08899e6a0a73f4240a929d5188b0f0ee60baaf9c7b35f35bac284476208ae` |

El clasificador publicado es la ronda 4: `WW_DROPOUT=0.3 WW_FEAT_NOISE=0.3 WW_WD=0.05 python -m ww.train models/final 10000`, con todos los negativos. La detección usa umbral 0,9 y 2 tramos seguidos.

## Cadena
Audio de 16 kHz en tramos de 80 ms:
1. **Espectrograma mel** (`melspectrogram.onnx`): 32 bandas.
2. **Red de características** (`speech_embedding.onnx`): convierte 76 tramos de mel en un vector de 96 números.
3. **Clasificador** (`oye_quanela.onnx`): mira los últimos 16 vectores y da una probabilidad.

La app hace exactamente lo mismo en el navegador (`src/shared/voice/wakeWord/`), y su prueba de paridad da una diferencia menor a 0,00001.

## Fuentes y licencias

**Modelos base (exportados por nosotros):**

| Pieza | Origen | Licencia |
|---|---|---|
| `melspectrogram.onnx` | `build_melspec.py`: fórmulas estándar (ventana Hann, banco mel Slaney, 60–3.800 Hz). Da lo mismo que el de openWakeWord (diferencia 1,5e-5). | Propio |
| `speech_embedding.onnx` | `build_embedding.py`: pesos de Google `speech_embedding/1` (TF Hub). Da exactamente lo mismo que el de openWakeWord (diferencia 0,0). | Apache 2.0 |

**Datos de entrenamiento y evaluación:**

| Datos | Origen | Licencia |
|---|---|---|
| Voz sintética | [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M): voces en español mezcladas con otras voces de Kokoro | Apache 2.0 |
| Voz sintética | Piper `es_ES-carlfm-x_low`: datos de dominio público, entrenada desde cero | Dominio público |
| Voces clonadas, **solo para evaluar** | Chatterbox Multilingual, a partir de hablantes de FLEURS test | MIT (FLEURS: CC BY 4.0) |
| Habla en español | [FLEURS](https://huggingface.co/datasets/google/fleurs) `es_419` | CC BY 4.0 |
| Ruido, música y habla | [MUSAN](https://www.openslr.org/17/) (sin contenido de uso no comercial) | CC / dominio público |
| Reverberación | [OpenSLR 28](https://www.openslr.org/28/): solo `simulated_rirs` y `pointsource_noises` | Apache 2.0 |
| Ruido de cocina | `gen/kitchen_noise.py`: síntesis, sin grabaciones | Propio |

**No se usan:**
- Las otras voces de Piper en español: se ajustaron a partir de voces inglesas con licencia de investigación (Lessac) o no comercial (Ryan).
- XTTS.
- Las voces del sistema de Apple.
- Los modelos preentrenados de openWakeWord.
- ACAV100M.
- Las respuestas de sala reales de OpenSLR 28 (RWCP, AIR y REVERB tienen otras licencias).

## Cómo reproducirlo
Probado en macOS (Apple Silicon) con Python 3.12. Hace falta `brew install espeak-ng`, porque Kokoro la usa para la pronunciación.

1. **Instalar dependencias.** Entorno principal:
   ```bash
   python3.12 -m venv .venv && . .venv/bin/activate
   pip install numpy scipy soundfile onnx onnxruntime torch tensorflow tensorflow-hub "setuptools<70" piper-tts kokoro "misaki[en]"
   ```
   Chatterbox necesita otro entorno, porque fija versiones de torch y numpy:
   ```bash
   python3.12 -m venv .venv-cb && .venv-cb/bin/pip install chatterbox-tts soundfile
   ```
2. **Construir los modelos base:** `python build_embedding.py` y `python build_melspec.py`.
3. **Descargar las fuentes** en `data/raw/`: `fleurs/` (es_419: tsv y audio), `musan/` y `RIRS_NOISES/`. Además, bajar la voz de Piper en `tts/piper/`.
4. **Generar la voz sintética:**
   - `python gen/gen_kokoro.py KIND N SPLIT SEED`, con `KIND` = `pos`, `adv`, `hard`, `kitchen` o `speech`;
   - `gen/gen_piper.py` y `gen/gen_chatterbox.py` usan los mismos argumentos;
   - el ruido de cocina se genera con `python gen/kitchen_noise.py N SPLIT SEED`.
5. **Calcular las características:**
   - `python -m ww.build clips train pos 3 300 0/4` (fragmentos en paralelo);
   - `python -m ww.build streams train` y `python -m ww.build streams eval`.
6. **Entrenar y exportar:**
   ```bash
   WW_DROPOUT=0.3 WW_FEAT_NOISE=0.3 WW_WD=0.05 python -m ww.train models/final 10000
   python -m ww.export models/final
   ```
7. **Evaluar:** `python -m ww.evaluate models/final`. Recorre umbrales y deja los resultados en `results.json`.
8. **Grabaciones reales (fase 2b):**
   ```bash
   python -m ww.evaluate_real models/final CARPETA_FRASES CARPETA_AMBIENTE 0.95 2
   ```
   Las grabaciones solo se leen; no se copian ni se guardan.

El umbral y los tramos de confirmación que se publican son los de la función `voice_wake_word`, que la plataforma puede ajustar.
