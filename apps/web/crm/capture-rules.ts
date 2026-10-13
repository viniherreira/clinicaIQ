import type { LeadSource } from '@clinicaiq/db';
import { normalize } from './bot-engine';

/**
 * Captação pela primeira mensagem, sem banco (testado por tabela): quais
 * regras a mensagem aciona e o que elas pedem (tags, funil, origem).
 *
 * A palavra tem que aparecer inteira — "implante" acha "quero um implante" e
 * "implantes", mas "oi" não acha "oito". Acento e maiúscula não importam.
 */

export interface CaptureRuleLite {
  id: string;
  name: string;
  keywords: string[];
  tagIds: string[];
  pipelineId: string | null;
  source: LeadSource | null;
}

export interface CaptureMatch {
  /** As regras acionadas, na ordem, com a palavra que achou cada uma. */
  hits: { ruleId: string; name: string; keyword: string }[];
  tagIds: string[];
  /** Funil e origem: da primeira regra que pede. */
  pipelineId: string | null;
  source: LeadSource | null;
}

export const MAX_CAPTURE_KEYWORDS = 20;

/** Palavras limpas: sem acento, sem repetir, de 2 a 40 letras. Frases valem ("clareamento dental"). */
export function cleanCaptureKeywords(raw: string[]): string[] {
  const out = new Set<string>();
  for (const k of raw) {
    const t = normalize(k);
    if (t.length >= 2 && t.length <= 40 && !/^\d+$/.test(t)) out.add(t);
  }
  return [...out].slice(0, MAX_CAPTURE_KEYWORDS);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A palavra (ou frase) está na mensagem? Aceita o plural com "s" ou "es". */
export function hasKeyword(text: string, keyword: string): boolean {
  const t = normalize(text);
  const k = normalize(keyword);
  if (!t || !k) return false;
  return new RegExp(`(^| )${escape(k)}(s|es)?( |$)`).test(t);
}

export function matchCapture(text: string, rules: CaptureRuleLite[]): CaptureMatch | null {
  const hits: CaptureMatch['hits'] = [];
  const tags = new Set<string>();
  let pipelineId: string | null = null;
  let source: LeadSource | null = null;
  for (const r of rules) {
    const keyword = r.keywords.find((k) => hasKeyword(text, k));
    if (!keyword) continue;
    hits.push({ ruleId: r.id, name: r.name, keyword });
    for (const t of r.tagIds) tags.add(t);
    pipelineId ??= r.pipelineId;
    source ??= r.source;
  }
  return hits.length ? { hits, tagIds: [...tags], pipelineId, source } : null;
}
