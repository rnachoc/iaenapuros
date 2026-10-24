# IA en apuros 🧯

An automated, fully local pipeline that writes, renders, reviews and ships **one vertical comedy short per day** (Instagram Reels / TikTok, 9:16, 30–45 s). It powers the Spanish channel [@iaenapuros](https://www.instagram.com/iaenapuros/) ("AI in trouble"), starring **Claude**, a terracotta clay figure that always gets itself into a mess.

> **Unofficial parody.** The character is an original design inspired by Claude. The channel is not affiliated with or endorsed by Anthropic, and it never uses Anthropic's logo, spark mark or brand colours.

No paid APIs: every model runs on your machine or uses a free service. The only creative step, picking the topic and writing the script, is done by an AI coding agent (Claude Code) on a schedule, following the rules in this repo.

## What it does

Every morning a scheduled agent runs the whole show:

```
npm run context ─► pick a topic ─► write episodes/<date>/episode.json
                                         │
                                         ▼
                 npm run daily: voice ─► 3D render ─► QA ─► caption
                                         │
                                         ▼
          simulated audience panel (5 AI viewers) ─► rewrite? (max 3 rounds)
                                         │
                                         ▼
       npm run publish (Instagram API) + npm run export (ready-to-post folder)
```

1. **Topic.** The agent reads `npm run context` (date, used topics, lessons learned) and picks either:
   - *actualidad*: an AI news item from the last 48 h, verified in the source article (outlet, URL and date are stored), or
   - *día a día*: an evergreen everyday situation with AI.
2. **Script.** It writes a small `episode.json`: 4–14 lines of dialogue with speaker, pose, camera, effects and caption. The engine never changes day to day; only this file does.
3. **Production.** `npm run daily` generates voices, renders the video frame by frame, runs QA and writes the caption.
4. **Review.** Five AI viewers with different profiles watch the video second by second and vote. Shared faults trigger a rewrite; the best round wins.
5. **Delivery.** The video is published through the Instagram API when it works, and a ready-to-post package is always saved locally (see [Publishing](#publishing)).

## Features

- **Data-driven episodes:** each video is one `episode.json`. Rendering is deterministic: the same file always gives the same MP4.
- **Procedural 3D character:** a Three.js clay figure with a painted face (eyes, brows, blush, lip-sync), 10 poses, a 4-point "context spark" that turns green → amber → red with stress, and cracks in the clay when things go badly. Effects include sweat, smoke, confetti, glitch and alarms. Rendered with [HyperFrames](https://github.com/heygen-com/hyperframes).
- **Four sets:** `terminal` (dark room with floating console logs, the default for everyday episodes), `oficina` (office), `servidor` (server room) and `plato` (news studio, the default for news episodes).
- **Voices:**
  - Edge TTS (free) for the character and the narrator.
  - A locally cloned "user" voice with [Chatterbox](https://github.com/resemble-ai/chatterbox) (Spain-Spanish fine-tune, GPU) from a CC0 reference, with an automatic fallback to Edge TTS.
  - Word timestamps from Whisper and re-takes for unclear lines.
- **Word-by-word subtitles** calibrated against the real waveform and kept inside the platform safe zones.
- **Synthesized audio:** sound effects and a ducked music bed are generated in code, so there is no copyrighted material.
- **Automatic QA:** duration, loudness (EBU R128), silences, black or frozen frames, subtitle pace, layout and contrast, plus a contact sheet for a visual check. Up to 2 retries; a failed video is never published.
- **Simulated audience panel:** each viewer says whether they would watch to the end or in which second they would scroll away, and scores hook, humour and punchline. Faults repeated across days become writing rules in `docs/APRENDIZAJE.md`, so the channel improves over time.

## Publishing

`npm run publish` publishes the reel to **Instagram (Reels) and TikTok in one call** through the [PostEverywhere](https://posteverywhere.ai) API, the same API its official [MCP server](https://github.com/posteverywhere/mcp) wraps. PostEverywhere publishes with its own approved Meta and TikTok apps, so there's no app review and no public video URL needed.

1. `POST /media/upload` returns a short-lived URL; the local MP4 is `PUT` there, confirmed with `/media/{id}/complete`, and polled until `ready`.
2. `POST /posts` with both accounts. Instagram is posted as a Reel; TikTok is posted public, with the AI-generated label and comments, duets and stitches on.
3. `/posts/{id}/results` is polled until each destination is `published` or `failed`. The run is idempotent: a re-run retries failed destinations instead of posting twice.

It only acts when `state/config.json → publish.mode` is `"live"`; otherwise it writes a dry-run plan (and, if a key is present, checks the connected accounts read-only). `npm run publish:check` verifies the plan and account health without posting. PostEverywhere is a paid service (from $9/month for 2 accounts); set `POSTEVERYWHERE_API_KEY` in `.env`.

Alternatives: `publish.provider: "meta"` posts to Instagram only through the Graph API (Facebook Login, resumable upload). `npm run export` builds a ready-to-post package in `para-publicar/<date>/` for manual posting.

## Repository layout

```
engine/      video engine: Three.js rig and face, poses, sets, overlays, HyperFrames template, generated SFX
scripts/     pipeline: context, daily, produce, voice, build, qa, panel, caption, publish, export, ig-setup, snap
episodes/    one episode.json per day
docs/        decisions, episode spec, panel profiles, learned rules, setup manual (Spanish)
brand/       character sheet, profile pictures and the CC0 voice reference
state/       config (voices, publish mode), topic and source history, panel learnings
out/         generated per-day output (git-ignored)
para-publicar/  ready-to-post packages (git-ignored)
```

## Requirements

- Windows 10/11 (macOS and Linux should work with small path changes)
- Node.js 22+ and Python 3.13
- An NVIDIA GPU for the cloned voice (optional: without it, Edge TTS is used)
- [Claude Code](https://claude.com/claude-code) (or another coding agent) to run the daily routine

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

Check the install by rendering the character sheet:

```bash
npm run poses            # writes brand/identidad-poses.jpg
```

### Instagram credentials (optional)

Only needed for `npm run publish`. The full walkthrough is in `docs/MANUAL.md`:

1. Switch the Instagram account to a professional account and link it to a Facebook Page.
2. Create a Meta app (type *Business*) with the Instagram product set up with Facebook Login.
3. Copy `.env.example` to `.env`, fill in `META_APP_ID` and `META_APP_SECRET`, and paste a short-lived token from the Graph API Explorer as `META_SHORT_TOKEN`. Permissions: `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `pages_show_list`, `pages_read_engagement`, `business_management`.
4. Run `npm run ig:setup`. It swaps the short token for a non-expiring Page token, fills in `META_USER_TOKEN`, `META_PAGE_ID`, `META_PAGE_TOKEN` and `IG_USER_ID`, and deletes the short token. Token checks and renewal are automatic afterwards.

`.env` is git-ignored and the scripts never print tokens.

## Usage

```bash
npm run context              # date, suggested series, used topics and panel lessons
npm run daily                # voice + render + QA + caption (+ TikTok copy)
npm run daily -- --date 2026-10-24 --force   # re-render a given day
npm run panel:prep           # viewing pack for the simulated audience
npm run panel:score          # verdict: publish or rewrite
npm run panel:finalize       # keeps the best round and updates the learned rules
npm run publish              # Instagram API (dry-run unless mode is live)
npm run export               # ready-to-post package in para-publicar/<date>/
npm run export -- --portada 1.9   # same, taking the cover frame at 1.9 s
npm run publish:mode -- live      # or dry-run
npm run poses                # character sheet with every pose and set
```

## Integrating it into your own channel

1. **Write an episode by hand first.** Copy `docs/ejemplo-episode.json` to `episodes/<today>/episode.json`, edit the lines and run `npm run daily`. The schema and the writing rules are in `docs/EPISODE.md`. A minimal line looks like:

   ```json
   { "speaker": "lia", "text": "Hecho. Lo he resumido en una palabra.", "pose": "chulita", "cam": "medio", "fx": ["zoom"], "sticker": "¡ZAS!" }
   ```

   `speaker` is `user`, `lia` (the character's internal id) or `narrador`. Unset fields such as pose, camera, set and HUD carry over from the previous line.
2. **Automate it with an agent.** Create a daily scheduled task in Claude Code whose prompt follows the routine in `CLAUDE.md`: `context` → write `episode.json` → `daily` → review the contact sheet → panel → `panel:finalize` → `publish` → `export`. The agent only edits `episode.json`; everything else is scripted.
3. **Hook it into your posting flow.** Either let `publish` post through the API, or pick up the files in `para-publicar/<date>/` from any scheduler or sync tool.

## Making it your own

- Change the character's look, poses and sets in `engine/src/` (`rig.js`, `face.js`, `poses.js`, `backgrounds.js`).
- Change voices in `state/config.json`. Any Edge TTS voice works, or point `refs` to your own CC0 or consented recording.
- Rewrite the panel profiles in `docs/PANEL.md` to match your audience.
- Adapt the tone and writing rules in `docs/EPISODE.md`.

Only clone voices you have the rights to: your own, a consenting person's, or openly licensed data. If you parody a real product, keep your own visual identity and say clearly that you are not affiliated with it.

## Third-party assets

- Voice reference: Mozilla Common Voice, CC0 1.0 (see `brand/REFERENCIA-VOZ.md`).
- Chatterbox models: MIT. Whisper: MIT.
- Fonts: Archivo Black and Inter (SIL OFL), installed via `@fontsource`.
- HyperFrames: Apache 2.0. Three.js: MIT.

## License

[MIT](LICENSE)
