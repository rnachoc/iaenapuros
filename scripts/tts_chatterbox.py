"""Voz clonada local con Chatterbox (fine-tune de español de España) + marcas por palabra con Whisper.

Uso (con .venv-tts): python scripts/tts_chatterbox.py <jobs.json> <out_dir>
jobs: [{"id", "text", "ref", "exaggeration", "cfg", "seed"}]
Salida por línea: <id>.wav y <id>.json con {"engine": "chatterbox", "file", "words": [{"w","s","e"}]}
"""
import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path

import torch
import torchaudio as ta

# Modelo montado en models/chatterbox-es-es: base de ResembleAI/chatterbox (ve, conds)
# + fine-tune ResembleAI/Chatterbox-Multilingual-es-es (t3_es_es, s3gen_v3 → s3gen.pt)
MODEL_DIR = Path(__file__).resolve().parent.parent / "models" / "chatterbox-es-es"
ASR_MODEL = "openai/whisper-small"


def load_tts(device: str):
    """Como ChatterboxMultilingualTTS.from_local, pero carga s3gen_v3 sin modo estricto:
    ese checkpoint no trae los buffers del tokenizador (filtros mel y ventana), que se recalculan."""
    from safetensors.torch import load_file
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS, Conditionals, MTLTokenizer
    from chatterbox.models.s3gen import S3Gen
    from chatterbox.models.t3 import T3
    from chatterbox.models.t3.modules.t3_config import T3Config
    from chatterbox.models.voice_encoder import VoiceEncoder

    ve = VoiceEncoder()
    ve.load_state_dict(torch.load(MODEL_DIR / "ve.pt", weights_only=True))
    ve.to(device).eval()
    t3 = T3(T3Config.multilingual())
    st = load_file(MODEL_DIR / "t3_es_es.safetensors")
    t3.load_state_dict(st["model"][0] if "model" in st else st)
    t3.to(device).eval()
    s3gen = S3Gen()
    missing, unexpected = s3gen.load_state_dict(torch.load(MODEL_DIR / "s3gen_v3.pt", weights_only=True), strict=False)
    assert not unexpected and all(k.startswith("tokenizer.") for k in missing), (missing, unexpected)
    s3gen.to(device).eval()
    tok = MTLTokenizer(str(MODEL_DIR / "grapheme_mtl_merged_expanded_v1.json"))
    conds = Conditionals.load(MODEL_DIR / "conds.pt").to(device)
    return ChatterboxMultilingualTTS(t3, s3gen, ve, tok, device, conds=conds)


def norm(w: str) -> str:
    w = unicodedata.normalize("NFD", w.lower())
    return re.sub(r"[^a-z0-9ñ]", "", "".join(c for c in w if unicodedata.category(c) != "Mn"))


def align(tokens: list[str], chunks: list[dict], dur: float) -> list[dict]:
    """Asigna a cada palabra del guion los tiempos de la palabra reconocida que le corresponde."""
    rec = [norm(c["text"]) for c in chunks]
    ref = [norm(t) for t in tokens]
    times: list = [None] * len(tokens)
    sm = difflib.SequenceMatcher(a=ref, b=rec, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
            for k in range(i2 - i1):
                times[i1 + k] = tuple(chunks[j1 + k]["timestamp"])
        elif tag == "replace":
            # bloques de distinto tamaño: se reparte el tramo reconocido entre las palabras del guion
            s = chunks[j1]["timestamp"][0]
            e = chunks[j2 - 1]["timestamp"][1] or s
            for k in range(i2 - i1):
                times[i1 + k] = (s + (e - s) * k / (i2 - i1), s + (e - s) * (k + 1) / (i2 - i1))
    # huecos sin correspondencia: interpolación entre vecinos
    out = []
    for i, t in enumerate(times):
        if t is None or t[0] is None:
            prev_e = out[-1]["e"] if out else 0.05
            nxt = next((times[k][0] for k in range(i + 1, len(times)) if times[k] and times[k][0] is not None), dur - 0.05)
            t = (prev_e, prev_e + max(0.08, (nxt - prev_e) / 2))
        s, e = float(t[0]), float(t[1] if t[1] is not None else t[0] + 0.2)
        out.append({"w": tokens[i], "s": round(s, 3), "e": round(max(e, s + 0.05), 3)})
    return out


def main() -> None:
    jobs = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tts = load_tts(device)

    from transformers import pipeline

    asr = pipeline(
        "automatic-speech-recognition",
        model=ASR_MODEL,
        device=0 if device == "cuda" else -1,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32,
    )
    for job in jobs:
        # hasta 3 tomas con semillas distintas; se queda la que Whisper entiende mejor
        ref_words = [w for w in (norm(x) for x in job["text"].split()) if w]
        best = None
        for take in range(3):
            torch.manual_seed(int(job.get("seed", 1)) + 100 * take)
            wav = tts.generate(
                job["text"],
                language_id="es",
                audio_prompt_path=job["ref"],
                exaggeration=float(job.get("exaggeration", 0.5)),
                cfg_weight=float(job.get("cfg", 0.5)),
            )
            wav16 = ta.functional.resample(wav.cpu(), tts.sr, 16000)[0].numpy()
            res = asr(
                {"raw": wav16, "sampling_rate": 16000},
                return_timestamps="word",
                generate_kwargs={"language": "spanish", "task": "transcribe"},
            )
            # las cifras que escribe Whisper ("900") no cuentan como fallo
            heard = [w for w in (norm(c["text"]) for c in res.get("chunks", [])) if w and not w.isdigit()]
            score = difflib.SequenceMatcher(a=ref_words, b=heard, autojunk=False).ratio()
            if best is None or score > best[0]:
                best = (score, wav, res)
            if score >= 0.85:
                break
        score, wav, res = best
        path = out / f"{job['id']}.wav"
        ta.save(str(path), wav.cpu(), tts.sr)
        dur = wav.shape[-1] / tts.sr
        tokens: list[str] = []
        for tok in job["text"].split():  # signos sueltos se unen a la palabra anterior (como en voice.mjs)
            if tokens and not norm(tok):
                tokens[-1] += tok
            else:
                tokens.append(tok)
        words = align(tokens, res.get("chunks", []), dur)
        meta = {"engine": "chatterbox", "file": path.name, "words": words, "asr": res.get("text", "").strip(), "clarity": round(score, 2)}
        (out / f"{job['id']}.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        print(f"{job['id']} chatterbox {len(words)} palabras · oído: {meta['asr'][:60]}")


if __name__ == "__main__":
    main()
