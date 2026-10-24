// Sube el reel del día a TikTok como borrador (npm run tiktok:draft [-- --date D] [--force]).
// Solo actúa en modo live (o con --force), con la QA superada y el jurado cerrado. No sube dos veces el mismo día.
import fs from 'node:fs';
import path from 'node:path';
import { arg, todayMadrid, outDir, readJSON, readLog, upsertLog, config } from './lib/common.mjs';
import { uploadDraft, tiktokConfigured } from './lib/tiktok.mjs';

const date = arg('date', todayMadrid());
const out = outDir(date);
const done = (code, o) => (console.log('TIKTOK ' + JSON.stringify({ fecha: date, ...o })), process.exit(code));

const prev = (readLog().episodes.find((e) => e.date === date) || {}).tiktok;
if (prev && ['SEND_TO_USER_INBOX', 'PUBLISH_COMPLETE'].includes(prev.status)) done(0, { ok: true, estado: 'ya_subido', ...prev });
if (!tiktokConfigured()) done(0, { ok: false, estado: 'sin_configurar', siguiente: 'npm run tiktok:setup (docs/MANUAL.md)' });
if ((config().publish || {}).mode !== 'live' && !arg('force')) done(0, { ok: true, estado: 'dry-run', detalle: 'solo sube en modo live' });
const qa = readJSON(path.join(out, 'qa.json'));
if (!qa || !qa.passed) done(1, { ok: false, estado: 'qa_no_superada' });
if (fs.existsSync(path.join(out, 'panel')) && !fs.existsSync(path.join(out, 'panel', 'final.json'))) done(1, { ok: false, estado: 'jurado_sin_cerrar' });

try {
  const r = await uploadDraft(path.join(out, 'reel.mp4'), { log: console.log });
  const rec = { publishId: r.publishId, status: r.status, failReason: r.failReason, at: new Date().toISOString() };
  upsertLog(date, { tiktok: rec });
  const ok = ['SEND_TO_USER_INBOX', 'PUBLISH_COMPLETE'].includes(r.status);
  done(ok ? 0 : 1, { ok, estado: ok ? 'en_borradores' : 'fallido', ...rec, avisos: r.warnings, pie: `out/tiktok/${date}_iaenapuros_pie.txt` });
} catch (e) {
  upsertLog(date, { tiktok: { status: 'ERROR', error: e.message, at: new Date().toISOString() } });
  done(1, { ok: false, estado: 'error', error: e.message });
}
