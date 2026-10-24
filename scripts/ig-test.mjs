// Prueba segura de subida de Reels a Instagram: crea el contenedor y sube el vídeo, pero NUNCA publica
// (no llama a media_publish; el contenedor caduca solo en 24 h).
//   node scripts/ig-test.mjs --via rupload [--date D]   subida directa desde archivo (rupload.facebook.com)
//   node scripts/ig-test.mjs --via url [--date D]       Meta descarga el vídeo de una URL pública temporal (cloudflared)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { arg, todayMadrid, outDir, loadEnv } from './lib/common.mjs';
import { graph, ensureToken, graphVersion } from './lib/meta.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLOUDFLARED = process.platform === 'win32' ? 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe' : 'cloudflared';

async function waitContainer(token, id, log) {
  let st = {};
  for (let i = 0; i < 20; i++) {
    await sleep(15000);
    st = await graph.get(`/${id}`, { token, query: { fields: 'status_code,status,video_status' } });
    log(`  estado: ${st.status_code} · ${st.status || ''}`);
    if (['FINISHED', 'ERROR', 'EXPIRED'].includes(st.status_code)) break;
  }
  return st;
}

async function viaRupload(token, igUserId, mp4, log) {
  const c = await graph.post(`/${igUserId}/media`, { token, json: { media_type: 'REELS', upload_type: 'resumable', caption: 'prueba (no se publica)' } });
  log(`contenedor ${c.id} creado`);
  const size = fs.statSync(mp4).size;
  // --token user: la subida a rupload firma con el token de usuario en vez del de Página
  const upToken = arg('token') === 'user' ? loadEnv().META_USER_TOKEN || token : token;
  log(`subida firmada con token de ${upToken === token ? 'Página' : 'usuario'}`);
  const up = await fetch(c.uri || `https://rupload.facebook.com/ig-api-upload/${graphVersion()}/${c.id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${upToken}`, offset: '0', file_size: String(size), ...(arg('ctype') ? { 'Content-Type': arg('ctype') } : {}) },
    body: fs.readFileSync(mp4),
  });
  const body = await up.text();
  log(`rupload → HTTP ${up.status}: ${body.slice(0, 300)}`);
  if (arg('quick')) return { id: c.id, upload: { http: up.status, body: body.slice(0, 500) }, status_code: up.ok ? 'UPLOADED' : 'ERROR' };
  return { id: c.id, upload: { http: up.status, body: body.slice(0, 500) }, ...(await waitContainer(token, c.id, log)) };
}

// servidor local + túnel temporal de Cloudflare (gratis, sin cuenta)
async function publicUrl(mp4, log) {
  const size = fs.statSync(mp4).size;
  const server = http.createServer((req, res) => {
    log(`  Meta pide ${req.method} ${req.url} ${req.headers.range || ''}`);
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    const start = m ? +m[1] : 0;
    const end = m && m[2] ? +m[2] : size - 1;
    res.writeHead(m ? 206 : 200, {
      'Content-Type': 'video/mp4',
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
      ...(m ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(mp4, { start, end }).pipe(res);
  });
  await new Promise((r) => server.listen(47900, '127.0.0.1', r));
  const tunnel = spawn(CLOUDFLARED, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:47900'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cloudflared no dio URL en 40 s')), 40000);
    const onData = (d) => {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(d.toString());
      if (m) {
        clearTimeout(t);
        resolve(m[0]);
      }
    };
    tunnel.stdout.on('data', onData);
    tunnel.stderr.on('data', onData);
  });
  await sleep(4000); // el DNS del túnel tarda unos segundos
  return { url: url + '/reel.mp4', close: () => (tunnel.kill(), server.close()) };
}

async function viaUrl(token, igUserId, mp4, log) {
  const pub = await publicUrl(mp4, log);
  log(`URL temporal: ${pub.url}`);
  try {
    const check = await fetch(pub.url, { method: 'HEAD' });
    log(`comprobación propia de la URL → HTTP ${check.status}`);
    const c = await graph.post(`/${igUserId}/media`, { token, json: { media_type: 'REELS', video_url: pub.url, caption: 'prueba (no se publica)' } });
    log(`contenedor ${c.id} creado`);
    return { id: c.id, ...(await waitContainer(token, c.id, log)) };
  } finally {
    pub.close();
  }
}

const date = arg('date', todayMadrid());
const mp4 = path.join(outDir(date), 'reel.mp4');
const via = arg('via', 'rupload');
const lines = [];
const log = (s) => (console.log(s), lines.push(s));
try {
  if (!fs.existsSync(mp4)) throw new Error('no existe ' + mp4);
  const { token, igUserId, warnings } = await ensureToken();
  warnings.forEach((w) => log('aviso: ' + w));
  const r = via === 'url' ? await viaUrl(token, igUserId, mp4, log) : await viaRupload(token, igUserId, mp4, log);
  const ok = r.status_code === 'FINISHED';
  console.log('PRUEBA ' + JSON.stringify({ via, ok, contenedor: r.id, status_code: r.status_code, status: r.status, video_status: r.video_status, publicado: false }));
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.log('PRUEBA ' + JSON.stringify({ via, ok: false, error: e.message, publicado: false }));
  process.exit(1);
}
