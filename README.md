# IA en apuros 🧯

An automated, fully local pipeline that writes, renders, reviews and publishes **one vertical short-form video per day** (Instagram Reels / TikTok, 9:16, 30–45 s). It powers the Spanish comedy channel *IA en apuros* ("AI in trouble"), starring **Lía**, a blocky 3D AI that always gets herself into a mess.

No paid APIs: every model runs on your machine or uses a free service. The only "creative" step (picking a topic and writing the script) is done by an AI coding agent following the rules in this repo.

## Features

- **Data-driven episodes:** each video is a small `episode.json` (lines, speakers, poses, camera, effects, captions). The engine turns it into an MP4 deterministically.
- **Procedural 3D character:** Three.js rig with an animated LED face, lip-sync, 10 poses, 3 sets (office, server room, news studio), sweat, smoke, confetti, glitch and alarm effects. Rendered frame by frame with [HyperFrames](https://github.com/heygen-com/hyperframes).
- **Voices:**
  - Edge TTS (free) for the main character and the narrator.
  - A locally cloned voice with [Chatterbox](https://github.com/resemble-ai/chatterbox) (Spain-Spanish fine-tune, GPU) from a CC0 reference.
  - Word timestamps from Whisper, re-takes for unclear lines, and an automatic fallback to Edge if the GPU path fails.
- **Word-by-word subtitles** calibrated against the real waveform, kept inside the platform safe zones.
- **Synthesized audio:** sound effects and a ducked music bed generated in code, so there's no copyrighted material.
- **Automatic QA:** duration, loudness (EBU R128), silences, black or frozen frames, subtitle pace, layout and contrast audit, plus a contact sheet for visual review. Up to 2 retries; it never publishes a failed video.
- **Simulated audience panel:** five AI viewers with different profiles watch the video second by second.
  - Each one reports whether they'd watch it to the end or in which second they'd scroll away, and scores hook, humour and punchline.
  - Faults that several viewers agree on trigger an automatic rewrite (up to 3 rounds), and the best round is published.
  - Faults that repeat across days become writing rules (`docs/APRENDIZAJE.md`), so the channel improves over time.
- **Publishing:** Instagram Graph API with resumable upload from a local file, automatic token checks, and a dry-run mode by default. A TikTok-ready copy and caption are saved locally.

## Repository layout

```
engine/      video engine: Three.js rig, poses, sets, overlays, HyperFrames template, generated SFX
scripts/     pipeline: daily, produce, voice, build, qa, panel, caption, publish, ig-setup
episodes/    one episode.json per day
docs/        design decisions, episode spec, panel profiles, learned rules, setup manual (Spanish)
brand/       character sheet and the CC0 voice reference
state/       config (voices, publish mode), topic history and panel learnings
```

## Requirements

- Windows 10/11 (macOS and Linux should work with small path changes)
- Node.js 22+ and Python 3.13
- An NVIDIA GPU for the cloned voice (optional: without it, Edge TTS is used)

## Setup

```bash
npm install
npx skills experimental_install          # restores the HyperFrames agent skills from skills-lock.json
npx hyperframes browser ensure           # headless Chrome used for rendering
npm run sfx                              # generates the sound-effect library

python -m venv .venv
.venv/Scripts/pip install edge-tts duckdb

# optional, local voice cloning (GPU)
python -m venv .venv-tts
.venv-tts/Scripts/pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124
.venv-tts/Scripts/pip install chatterbox-tts
```

The Chatterbox Spain-Spanish model is assembled into `models/chatterbox-es-es/` from `ResembleAI/chatterbox` (`ve.pt`, `conds.pt`, `Cangjie5_TC.json`) and `ResembleAI/Chatterbox-Multilingual-es-es` (`t3_es_es.safetensors`, `s3gen_v3.pt`, `grapheme_mtl_merged_expanded_v1.json`).

To publish on Instagram, copy `.env.example` to `.env` and follow `docs/MANUAL.md`. Credentials stay in `.env`, which is git-ignored.

## Usage

```bash
npm run context          # today's date, suggested series, used topics and panel lessons
npm run daily            # voice + render + QA + caption + TikTok copy
npm run panel:prep       # viewing pack for the simulated audience
npm run panel:score      # verdict: publish or rewrite
npm run panel:finalize   # keeps the best round and updates the learned rules
npm run publish          # dry-run until you switch to live
npm run publish:mode -- live
npm run poses            # character sheet with every pose and set
```

The daily routine (topic → `episode.json` → render → panel → publish) is meant to be run by an AI coding agent on a schedule. The step-by-step rules are in `CLAUDE.md`, `docs/EPISODE.md` and `docs/PANEL.md`.

## Making it your own

- Change the character's look, poses and sets in `engine/src/`.
- Change voices in `state/config.json`. Any Edge TTS voice works, or point `refs` to your own CC0 or consented recording.
- Rewrite the panel profiles in `docs/PANEL.md` to match your audience.
- Adapt the tone and writing rules in `docs/EPISODE.md`.

Only clone voices you have the rights to: your own, a consenting person's, or openly licensed data.

## Third-party assets

- Voice reference: Mozilla Common Voice, CC0 1.0 (see `brand/REFERENCIA-VOZ.md`).
- Chatterbox models: MIT. Whisper: MIT.
- Fonts: Archivo Black and Inter (SIL OFL), installed via `@fontsource`.
- HyperFrames: Apache 2.0. Three.js: MIT.

## License

[MIT](LICENSE)
