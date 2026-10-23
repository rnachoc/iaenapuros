"""Síntesis de voz por línea con Edge TTS (marcas por palabra) y fallback local SAPI.

Uso: python scripts/tts.py <jobs.json> <out_dir>
jobs.json: [{"id": "l00", "text": "...", "voice": "es-ES-ElviraNeural", "rate": "+8%", "pitch": "+0Hz"}]
Salida por línea: <id>.mp3 o <id>.wav y <id>.json con {"engine", "file", "words": [{"w","s","e"}]}
"""
import asyncio
import json
import subprocess
import sys
from pathlib import Path


async def edge(job: dict, out: Path) -> dict:
    import edge_tts

    comm = edge_tts.Communicate(
        job["text"],
        job["voice"],
        rate=job.get("rate", "+0%"),
        pitch=job.get("pitch", "+0Hz"),
        boundary="WordBoundary",
    )
    words: list[dict] = []
    mp3 = out / f"{job['id']}.mp3"
    with open(mp3, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                s = chunk["offset"] / 1e7
                words.append({"w": chunk["text"], "s": s, "e": s + chunk["duration"] / 1e7})
    if mp3.stat().st_size < 1000 or not words:
        raise RuntimeError("edge-tts devolvió audio vacío")
    return {"engine": "edge", "file": mp3.name, "words": words}


def sapi(job: dict, out: Path) -> dict:
    """Fallback local: voz SAPI de Windows (es-ES). Sin marcas por palabra."""
    wav = out / f"{job['id']}.wav"
    rate = 1 if job.get("speaker") == "lia" else 0
    pitch = "+2st" if job.get("speaker") == "lia" else "-2st"
    text = job["text"].replace("&", "y").replace("<", "").replace(">", "")
    ssml = (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-ES">'
        f'<prosody pitch="{pitch}">{text}</prosody></speak>'
    )
    ps = (
        "Add-Type -AssemblyName System.Speech;"
        "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
        "$v=$s.GetInstalledVoices()|?{$_.VoiceInfo.Culture.Name -eq 'es-ES'}|select -First 1;"
        "if($v){$s.SelectVoice($v.VoiceInfo.Name)};"
        f"$s.Rate={rate};"
        f"$s.SetOutputToWaveFile('{wav}');"
        "$s.SpeakSsml([Console]::In.ReadToEnd());$s.Dispose()"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], input=ssml, text=True, check=True, encoding="utf-8")
    return {"engine": "sapi", "file": wav.name, "words": []}


async def main() -> None:
    jobs = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    force_local = len(sys.argv) > 3 and sys.argv[3] == "--local"
    for job in jobs:
        res = None
        if not force_local:
            for attempt in range(3):
                try:
                    res = await edge(job, out)
                    break
                except Exception as e:  # red caída, límite, etc.
                    print(f"edge-tts fallo {job['id']} intento {attempt + 1}: {e}", file=sys.stderr)
                    await asyncio.sleep(2 * (attempt + 1))
        if res is None:
            res = sapi(job, out)
        (out / f"{job['id']}.json").write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
        print(f"{job['id']} {res['engine']} {len(res['words'])} palabras")


if __name__ == "__main__":
    asyncio.run(main())
