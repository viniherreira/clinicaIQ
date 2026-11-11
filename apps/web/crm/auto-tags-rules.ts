import type { LeadSource } from '@clinicaiq/db';
import { hasKeyword } from './capture-rules';
import { normalize } from './bot-engine';
import type { CrmColor } from './defaults';

/**
 * Tags automáticas, sem banco (testado por tabela): a tag do canal de entrada
 * e as tags dos procedimentos que a pessoa citou na conversa.
 */

/** O canal de entrada vira tag. Manual e "outro" não dizem de onde veio: sem tag. */
export const CHANNEL_TAG: Partial<Record<LeadSource, { name: string; color: CrmColor }>> = {
  WHATSAPP: { name: 'whatsapp', color: 'green' },
  INSTAGRAM: { name: 'instagram', color: 'pink' },
  FACEBOOK: { name: 'facebook', color: 'blue' },
  SITE: { name: 'site', color: 'teal' },
  INDICACAO: { name: 'indicação', color: 'amber' },
};

/** Os nomes das tags de canal (para trocar uma pela outra quando a origem fica mais precisa). */
export const CHANNEL_TAG_NAMES = Object.values(CHANNEL_TAG).map((t) => t!.name);

/**
 * Os procedimentos mais pedidos em clínica odontológica e de estética, com o
 * jeito que as pessoas escrevem. A palavra precisa aparecer inteira (acento,
 * maiúscula e plural não importam): "quero fazer implantes" acha implante.
 */
export const PROCEDURE_DICTIONARY: readonly { tag: string; words: readonly string[] }[] = [
  { tag: 'implante', words: ['implante', 'implante dentario', 'implantodontia'] },
  { tag: 'protocolo', words: ['protocolo', 'protese protocolo', 'dentadura fixa'] },
  { tag: 'prótese', words: ['protese', 'dentadura', 'ponte movel', 'ponte fixa'] },
  { tag: 'clareamento', words: ['clareamento', 'clarear', 'clareamento dental', 'branqueamento', 'dente branco', 'dentes brancos'] },
  { tag: 'lentes de contato', words: ['lente de contato', 'lentes de contato', 'lente dental', 'faceta', 'laminado', 'porcelana'] },
  { tag: 'aparelho', words: ['aparelho', 'ortodontia', 'ortodontico', 'alinhador', 'alinhadores', 'invisalign', 'aparelho invisivel'] },
  { tag: 'limpeza', words: ['limpeza', 'profilaxia', 'tartaro'] },
  { tag: 'canal', words: ['tratamento de canal', 'endodontia', 'canal do dente', 'fazer canal', 'fazer um canal'] },
  { tag: 'extração', words: ['extracao', 'extrair', 'arrancar', 'tirar o dente', 'tirar um dente', 'siso', 'dente do siso'] },
  { tag: 'restauração', words: ['restauracao', 'obturacao', 'carie', 'dente quebrado', 'dente quebrou'] },
  { tag: 'gengiva', words: ['gengiva', 'gengivoplastia', 'periodontia', 'gengiva sangrando'] },
  { tag: 'odontopediatria', words: ['odontopediatria', 'odontopediatra', 'dentista infantil', 'dentista para crianca'] },
  { tag: 'botox', words: ['botox', 'toxina botulinica'] },
  { tag: 'harmonização facial', words: ['harmonizacao', 'harmonizacao facial', 'preenchimento', 'acido hialuronico', 'bioestimulador', 'fios de pdo'] },
  { tag: 'bichectomia', words: ['bichectomia'] },
];

/** O que a clínica cadastrou em Procedimentos (só o necessário). */
export interface ProcedureLite {
  id: string;
  name: string;
}

export interface ProcedureMatch {
  /** Nome da tag (minúsculas): o do dicionário, ou o do procedimento da clínica. */
  tag: string;
  /** O procedimento da clínica que corresponde, para o "interesse" do lead. */
  procedureId: string | null;
  /** O que foi achado no texto (para a nota no histórico). */
  word: string;
}

/** O procedimento da clínica cujo nome bate com um item do dicionário ("Implante unitário" → implante). */
function clinicProcedureFor(words: readonly string[], procedures: readonly ProcedureLite[]): string | null {
  for (const p of procedures) if (words.some((w) => hasKeyword(p.name, w))) return p.id;
  return null;
}

/**
 * Os procedimentos citados no texto: primeiro o dicionário; depois o nome de
 * cada procedimento da clínica que não está no dicionário (até 4 palavras,
 * para "Ozonioterapia" valer e "Consulta de avaliação inicial completa" não
 * virar ruído). Sem repetir tag.
 */
export function matchProcedures(text: string, procedures: readonly ProcedureLite[]): ProcedureMatch[] {
  if (!normalize(text)) return [];
  const out: ProcedureMatch[] = [];
  const usados = new Set<string>();
  for (const item of PROCEDURE_DICTIONARY) {
    const word = item.words.find((w) => hasKeyword(text, w));
    if (!word) continue;
    out.push({ tag: item.tag, procedureId: clinicProcedureFor(item.words, procedures), word });
    usados.add(normalize(item.tag));
  }
  for (const p of procedures) {
    const nome = normalize(p.name);
    if (!nome || nome.length < 4 || nome.split(' ').length > 4) continue;
    // Já coberto pelo dicionário (o nome tem uma das palavras de lá)?
    if (PROCEDURE_DICTIONARY.some((item) => item.words.some((w) => hasKeyword(p.name, w)))) continue;
    if (usados.has(nome) || !hasKeyword(text, p.name)) continue;
    out.push({ tag: p.name.trim().toLowerCase().slice(0, 40), procedureId: p.id, word: p.name.trim() });
    usados.add(nome);
  }
  return out;
}
