/**
 * Writes a BRL amount out in Portuguese words, e.g. 1234.5 →
 * "mil duzentos e trinta e quatro reais e cinquenta centavos". Used on payment
 * receipts. Pure (no I/O), so it is unit-tested directly.
 */

const UNITS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function under1000(n: number): string {
  if (n === 100) return 'cem';
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (rest > 0) {
    if (rest < 20) parts.push(UNITS[rest]);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u > 0 ? `${TENS[t]} e ${UNITS[u]}` : TENS[t]);
    }
  }
  return parts.join(' e ');
}

function intToWords(n: number): string {
  if (n === 0) return 'zero';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  const groups: string[] = [];
  if (millions > 0) groups.push(millions === 1 ? 'um milhão' : `${under1000(millions)} milhões`);
  if (thousands > 0) groups.push(thousands === 1 ? 'mil' : `${under1000(thousands)} mil`);

  const head = groups.join(', ');
  const restText = rest > 0 ? under1000(rest) : '';
  if (!restText) return head;
  if (!head) return restText;

  // "e" before the final group only when it's under 100 or an exact hundred
  // ("mil e duzentos", "mil e cinquenta") — otherwise just a space
  // ("mil duzentos e trinta e quatro").
  const connector = rest < 100 || rest % 100 === 0 ? ' e ' : ' ';
  return head + connector + restText;
}

/** "R$ 1.234,50" spoken as "mil duzentos e trinta e quatro reais e cinquenta centavos". */
export function valorPorExtenso(value: number): string {
  const reais = Math.floor(value + 1e-6);
  const cents = Math.round((value - reais) * 100);
  const reaisText = `${intToWords(reais)} ${reais === 1 ? 'real' : 'reais'}`;
  if (cents === 0) return reaisText;
  const centsText = `${intToWords(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`;
  return `${reaisText} e ${centsText}`;
}
