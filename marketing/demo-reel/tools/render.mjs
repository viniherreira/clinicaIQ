// Renderiza o vídeo quadro a quadro com o Playwright e codifica com o ffmpeg.
//
//   node tools/render.mjs [--from 0] [--to 45] [--fps 60] [--sub 2] [--workers 3] [--audio audio/work/mix.wav] [--out out/video.mp4] [--scene id]
//
// Cada página do Chromium chama R.render(t) e tira um PNG; o ffmpeg junta.
// --sub N renderiza N subquadros por quadro e faz a média (desfoque de
// movimento com obturador de 180° para N = 2).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, chromium, serve, openPage, args } from './lib.mjs';

const a = args();
const fps = Number(a.fps || 60);
const sub = Number(a.sub || 1);
const rfps = fps * sub;
const workers = Number(a.workers || 3);
const outFile = path.resolve(ROOT, a.out || 'out/video.mp4');
const framesDir = path.resolve(ROOT, a.frames || 'out/frames');
const query = a.scene ? `?scene=${a.scene}` : '';

const { server, port } = await serve();
const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-color-profile=srgb', '--font-render-hinting=none'] });
const probe = await openPage(browser, port, query);
const total = await probe.page.evaluate(() => R.duration());
let from = Number(a.from ?? 0);
let to = Number(a.to ?? total);
if (a.scene) {
  const w = await probe.page.evaluate((id) => {
    const s = R.scenes.find((x) => x.id === id);
    return s ? [s.start - s.pre, s.end + s.post] : null;
  }, a.scene);
  if (w && a.from == null) from = Math.max(0, w[0]);
  if (w && a.to == null) to = w[1];
}
await probe.page.close();

const n = Math.round((to - from) * rfps);
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
console.log(`renderizando ${n} quadros (${from.toFixed(2)}s → ${to.toFixed(2)}s @ ${rfps}fps, ${sub} subquadro(s)) com ${workers} páginas`);

const t0 = Date.now();
let done = 0;
const allErrors = [];
await Promise.all(
  Array.from({ length: workers }, async (_, w) => {
    const { page, errors } = await openPage(browser, port, query);
    for (let i = w; i < n; i += workers) {
      const t = from + i / rfps;
      await page.evaluate((tt) => R.render(tt), t);
      await page.screenshot({ path: path.join(framesDir, `f_${String(i).padStart(5, '0')}.png`), type: 'png' });
      done++;
      if (done % 120 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`  ${done}/${n}  ${(done / el).toFixed(1)} q/s  faltam ~${((n - done) / (done / el)).toFixed(0)}s`);
      }
    }
    allErrors.push(...errors);
    await page.close();
  }),
);
await browser.close();
server.close();
if (allErrors.length) console.log('avisos da página:\n  ' + [...new Set(allErrors)].slice(0, 20).join('\n  '));

fs.mkdirSync(path.dirname(outFile), { recursive: true });
const vf = sub > 1 ? [`tmix=frames=${sub}`, `fps=${fps}`] : [];
const audioArgs = a.audio ? ['-i', path.resolve(ROOT, a.audio)] : [];
const audioOut = a.audio ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest'] : [];
execFileSync(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-framerate', String(rfps), '-i', path.join(framesDir, 'f_%05d.png'), ...audioArgs,
    ...(vf.length ? ['-vf', vf.join(',')] : []),
    '-c:v', 'libx264', '-preset', a.preset || 'slow', '-crf', String(a.crf || 14), '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-r', String(fps), ...audioOut, '-movflags', '+faststart', outFile],
  { stdio: 'inherit' },
);
console.log(`ok: ${outFile} em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
