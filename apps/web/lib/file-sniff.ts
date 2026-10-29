/**
 * O arquivo é mesmo do tipo que diz ser?
 *
 * O tipo que chega no upload (`File.type`) é o que o navegador — ou quem monta
 * a requisição à mão — declarou. Sem conferir o conteúdo, dava para guardar um
 * HTML ou SVG com script dentro chamando de "image/png" no depósito do
 * prontuário. Aqui se olham os primeiros bytes (a "assinatura" de cada formato)
 * e o arquivo só passa se ela bater com o tipo declarado.
 *
 * Puro: sem Next, sem banco. Basta passar o começo do arquivo (32 bytes chegam).
 */

const ascii = (b: Uint8Array, at: number, text: string) =>
  b.length >= at + text.length && [...text].every((c, i) => b[at + i] === c.charCodeAt(0));

const starts = (b: Uint8Array, ...sig: number[]) => b.length >= sig.length && sig.every((v, i) => b[i] === v);

/** A marca do contêiner ISO (MP4, HEIC, 3GP): "ftyp" no byte 4 e a marca logo depois. */
const ftypBrand = (b: Uint8Array) => (ascii(b, 4, 'ftyp') ? String.fromCharCode(...b.slice(8, 12)) : null);

const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);
const ZIP = (b: Uint8Array) => starts(b, 0x50, 0x4b, 0x03, 0x04);
const OLE = (b: Uint8Array) => starts(b, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

const CHECKS: Record<string, (b: Uint8Array) => boolean> = {
  'image/jpeg': (b) => starts(b, 0xff, 0xd8, 0xff),
  'image/png': (b) => starts(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  'image/gif': (b) => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a'),
  'image/webp': (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP'),
  'image/heic': (b) => HEIF_BRANDS.has(ftypBrand(b) ?? ''),
  'image/heif': (b) => HEIF_BRANDS.has(ftypBrand(b) ?? ''),
  'application/pdf': (b) => ascii(b, 0, '%PDF-'),
  'video/mp4': (b) => ftypBrand(b) !== null && !HEIF_BRANDS.has(ftypBrand(b)!),
  'video/3gpp': (b) => (ftypBrand(b) ?? '').startsWith('3g'),
  'audio/mp4': (b) => ftypBrand(b) !== null && !HEIF_BRANDS.has(ftypBrand(b)!),
  'audio/ogg': (b) => ascii(b, 0, 'OggS'),
  'audio/amr': (b) => ascii(b, 0, '#!AMR'),
  'audio/mpeg': (b) => ascii(b, 0, 'ID3') || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  'audio/aac': (b) => ascii(b, 0, 'ADIF') || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0),
  'application/msword': OLE,
  'application/vnd.ms-excel': OLE,
  'application/vnd.ms-powerpoint': OLE,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ZIP,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ZIP,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ZIP,
  // Texto puro não tem assinatura: basta não ter bytes de controle binários.
  'text/plain': (b) => !b.some((x) => x === 0 || (x < 0x09) || (x > 0x0d && x < 0x20 && x !== 0x1b)),
};

/** Os primeiros bytes de um arquivo enviado. */
export async function fileHead(file: Blob, size = 32): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, size).arrayBuffer());
}

/** O conteúdo bate com o tipo declarado? Tipo desconhecido ou arquivo vazio: não. */
export function contentMatchesType(declared: string | null | undefined, head: Uint8Array): boolean {
  if (head.length === 0) return false;
  const tipo = (declared ?? '').toLowerCase().split(';')[0].trim();
  const check = CHECKS[tipo];
  return check ? check(head) : false;
}
