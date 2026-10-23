// Genera la librería de efectos de sonido sintetizados (sin derechos de terceros).
// Uso: node scripts/sfx.mjs   → engine/sfx/<nombre>.wav
import fs from 'node:fs';
import { P, ffmpeg } from './lib/common.mjs';

export const SFX = {
  boing: { d: 0.55, e: '0.8*sin(2*PI*t*(160+420*t)+4*sin(2*PI*16*t))*exp(-5*t)' },
  pop: { d: 0.14, e: '0.9*sin(2*PI*(1100-3000*t)*t)*exp(-28*t)' },
  ding: { d: 0.9, e: '0.6*(sin(2*PI*1318*t)+0.45*sin(2*PI*2636*t)+0.2*sin(2*PI*3954*t))*exp(-5*t)' },
  alarma: { d: 1.3, e: '0.35*sgn(sin(2*PI*if(lt(mod(t,0.5),0.25),880,660)*t))*min(1,(1.3-t)*6)' },
  error: { d: 0.5, e: '0.4*sgn(sin(2*PI*150*t))*if(lt(mod(t,0.24),0.17),1,0)' },
  glitch: { d: 0.45, e: '0.55*(random(0)*2-1)*if(lt(mod(t*31,1),0.45),1,0.15)*sgn(sin(2*PI*90*t+random(1)))' },
  whoosh: { d: 0.5, e: '0.6*(random(0)*2-1)*pow(sin(PI*t/0.5),2)', f: 'lowpass=f=1800,highpass=f=300' },
  tecla: { d: 0.7, e: '0.7*(random(0)*2-1)*exp(-160*mod(t,0.11))', f: 'highpass=f=1200' },
  fail: {
    d: 1.7,
    e: '0.45*sin(2*PI*if(lt(t,0.35),392,if(lt(t,0.7),370,if(lt(t,1.05),349,330)))*t+3*sin(2*PI*6*t)*gte(t,1.05))*min(1,(1.7-t)*4)',
    f: 'lowpass=f=2500',
  },
  tic: { d: 1.0, e: '0.7*sin(2*PI*2400*t)*exp(-90*mod(t,0.5))' },
};

export function buildSfx() {
  const dir = P('engine', 'sfx');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, s] of Object.entries(SFX)) {
    const src = `aevalsrc='${s.e}':s=48000:d=${s.d}`;
    const filters = ['afade=t=out:st=' + Math.max(0, s.d - 0.04) + ':d=0.04', s.f].filter(Boolean).join(',');
    ffmpeg(['-f', 'lavfi', '-i', src, '-af', filters, '-ac', '1', P('engine', 'sfx', name + '.wav')]);
  }
  return Object.keys(SFX);
}

if (process.argv[1] && process.argv[1].endsWith('sfx.mjs')) console.log('SFX:', buildSfx().join(', '));
