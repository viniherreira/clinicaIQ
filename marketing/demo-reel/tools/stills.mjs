// Quadros soltos para revisar uma cena sem renderizar o vídeo todo.
//
//   node tools/stills.mjs --scene agenda --times 0.2,0.8,1.5 [--out out/stills/agenda] [--sheet]
//   node tools/stills.mjs --times 3.0,3.2 (tempo global, todas as cenas)
//   node tools/stills.mjs --scene agenda --every 0.25 --sheet   (folha de contato da cena toda)
//
// Com --scene, os tempos são LOCAIS à cena (0 = início dela), e só ela aparece.
// --sheet junta tudo numa folha de contato (out/.../sheet.png), em 1/4 do tamanho.
// Os avisos e erros do console da página são impressos no fim.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, chromium, serve, openPage, args } from './lib.mjs';

const a = args();
const { server, port } = await serve();
const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
const query = a.scene ? `?scene=${a.scene}${a.hud ? '&hud=1' : ''}` : a.hud ? '?hud=1' : '';
const { page, errors } = await openPage(browser, port, query);

let offset = 0;
let span = null;
if (a.scene) {
  const w = await page.evaluate((id) => {
    const s = R.scenes.find((x) => x.id === id);
    return s ? { start: s.start, end: s.end, pre: s.pre, post: s.post } : null;
  }, a.scene);
  if (!w) {
    console.error(`cena "${a.scene}" não existe`);
    process.exit(1);
  }
  offset = w.start;
  span = w;
}
let times;
if (a.every) {
  const step = Number(a.every);
  const lo = span ? -span.pre : 0;
  const hi = span ? span.end - span.start + span.post : await page.evaluate(() => R.duration());
  times = [];
  for (let t = lo; t < hi - 1e-6; t += step) times.push(Number(t.toFixed(3)));
} else {
  times = String(a.times || '0').split(',').map(Number);
}
const outDir = path.resolve(ROOT, a.out || `out/stills/${a.scene || 'global'}`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const files = [];
for (const lt of times) {
  await page.evaluate((tt) => R.render(tt), offset + lt);
  const f = path.join(outDir, `t_${lt.toFixed(2).replace('-', 'm')}.png`);
  await page.screenshot({ path: f, type: 'png' });
  files.push(f);
}
await browser.close();
server.close();
console.log(files.join('\n'));
if (a.sheet) {
  const cols = Math.min(6, files.length);
  const sheet = path.join(outDir, 'sheet.png');
  const inputs = files.flatMap((f) => ['-i', f]);
  const rows = Math.ceil(files.length / cols);
  const filters = files.map((_, i) => `[${i}:v]scale=270:480,drawtext=text='${times[i].toFixed(2)}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`).join(';');
  const pad = rows * cols - files.length;
  const padIns = Array.from({ length: pad }, (_, i) => `color=c=gray:s=270x480:d=1[p${i}]`).join(';');
  const all = [...files.map((_, i) => `[v${i}]`), ...Array.from({ length: pad }, (_, i) => `[p${i}]`)].join('');
  const fc = `${filters}${pad ? ';' + padIns : ''};${all}xstack=inputs=${rows * cols}:layout=${Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 270}_${Math.floor(i / cols) * 480}`).join('|')}[out]`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', fc, '-map', '[out]', '-frames:v', '1', sheet]);
  console.log('folha:', sheet);
}
if (errors.length) console.log('AVISOS/ERROS DA PÁGINA:\n  ' + [...new Set(errors)].join('\n  '));
