// Prueba segura de subida de Reels a Instagram: crea el contenedor y sube el vídeo, pero NUNCA publica
// (no llama a media_publish; el contenedor caduca solo en 24 h).
//   node scripts/ig-test.mjs --via rupload [--date D]   subida directa desde archivo (rupload.facebook.com)
//   node scripts/ig-test.mjs --via url [--date D]       Meta descarga el vídeo de una URL pública temporal (cloudflared)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { arg, todayMadrid, outDir, loadEnv, ffmpeg } from './lib/common.mjs';
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

// diagnóstico: --version vXX (versión de la Graph API), --params query (parámetros del contenedor en la query),
// --sample (vídeo mínimo de 5 s generado con ffmpeg), --file F (otro mp4)
const gv = () => arg('version') || graphVersion();
const createUrl = (igUserId) => `https://graph.facebook.com/${gv()}/${igUserId}/media`;
const createContainer = (token, igUserId, params) =>
  arg('params') === 'query' ? graph.post(createUrl(igUserId), { token, query: params }) : graph.post(createUrl(igUserId), { token, json: params });
const safeHeaders = (h) => Object.fromEntries([...h].filter(([k]) => /^x-fb|^x-ig|trace|debug|^content-type|^www-auth|^proxy-status/i.test(k)));

async function viaRupload(token, igUserId, mp4, log) {
  const c = await createContainer(token, igUserId, { media_type: 'REELS', upload_type: 'resumable', caption: 'prueba (no se publica)' });
  log(`contenedor ${c.id} creado (API ${gv()}, parámetros en ${arg('params') === 'query' ? 'query' : 'JSON'})`);
  log(`  campos devueltos: ${Object.keys(c).join(', ')}`);
  if (c.uri) log(`  uri devuelta: ${new URL(c.uri).host}${new URL(c.uri).pathname}`);
  const size = fs.statSync(mp4).size;
  // la subida a rupload se firma con el token de usuario (con el de Página da 500); --token page reproduce el fallo
  const upToken = arg('token') === 'page' ? token : loadEnv().META_USER_TOKEN || token;
  log(`subida firmada con token de ${upToken === token ? 'Página' : 'usuario'} · ${size} bytes`);
  const upUrl = c.uri || `https://rupload.facebook.com/ig-api-upload/${gv()}/${c.id}`;
  const up = await fetch(upUrl, {
    method: 'POST',
    headers: { Authorization: `OAuth ${upToken}`, offset: '0', file_size: String(size), ...(arg('ctype') ? { 'Content-Type': arg('ctype') } : {}) },
    body: fs.readFileSync(mp4),
  });
  const body = await up.text();
  log(`rupload ${new URL(upUrl).host}${new URL(upUrl).pathname} → HTTP ${up.status}: ${body.slice(0, 600)}`);
  log(`  cabeceras: ${JSON.stringify(safeHeaders(up.headers))}`);
  if (arg('quick')) return { id: c.id, upload: { http: up.status, body: body.slice(0, 500) }, status_code: up.ok ? 'UPLOADED' : 'ERROR' };
  return { id: c.id, upload: { http: up.status, body: body.slice(0, 500) }, ...(await waitContainer(token, c.id, log)) };
}

function sampleVideo() {
  const f = path.join(os.tmpdir(), 'iaenapuros-sample.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '5', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-b:a', '128k', '-movflags', '+faststart', f]);
  return f;
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
    const c = await createContainer(token, igUserId, { media_type: 'REELS', video_url: pub.url, caption: 'prueba (no se publica)' });
    log(`contenedor ${c.id} creado`);
    return { id: c.id, ...(await waitContainer(token, c.id, log)) };
  } finally {
    pub.close();
  }
}

const date = arg('date', todayMadrid());
const mp4 = arg('sample') ? sampleVideo() : arg('file') || path.join(outDir(date), 'reel.mp4');
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
