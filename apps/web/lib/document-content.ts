/**
 * Textos e regras dos documentos da clínica (orçamento, contrato, recibo).
 *
 * Puro — sem banco, sem storage — para a tela de configurações mostrar o texto
 * padrão e a página do orçamento listar o que falta, com a mesma régua que o
 * gerador de PDF usa.
 */

/** Impresso no fim do orçamento quando a clínica não escreveu as próprias. */
export const DEFAULT_QUOTE_TERMS =
  'Os valores deste orçamento são válidos até a data indicada. O plano de tratamento foi elaborado a partir da avaliação clínica e pode precisar de ajustes caso surjam intercorrências durante o tratamento; qualquer procedimento adicional será previamente informado e orçado. A execução dos procedimentos está condicionada à aprovação deste orçamento e ao cumprimento das condições de pagamento.';

/**
 * "Odontológicos" só quando o registro é de dentista. A mesma base atende
 * clínica de estética, e um contrato de harmonização dizendo "serviços
 * odontológicos" é um erro que o paciente lê na primeira linha.
 */
export function contractTitle(registration: string | null | undefined): string {
  return /\bCRO\b/i.test(registration ?? '')
    ? 'Contrato de prestação de serviços odontológicos'
    : 'Contrato de prestação de serviços';
}

const MARITAL: Record<string, string> = {
  solteiro: 'solteiro(a)',
  casado: 'casado(a)',
  divorciado: 'divorciado(a)',
  viuvo: 'viúvo(a)',
  uniao: 'em união estável',
};

export function maritalStatusText(code: string | null | undefined): string | undefined {
  return code ? MARITAL[code] : undefined;
}

/** "(11) 99999-0000" a partir do que estiver gravado — máscara ou só dígitos. */
export function formatPhoneBR(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let d = raw.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw.trim() || undefined;
}

/** Menor de 18 na data de hoje. Data de nascimento é data de parede (UTC). */
export function isMinor(birthDate: Date | null | undefined, now: Date = new Date()): boolean {
  if (!birthDate) return false;
  const y = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const aniversarioPassou =
    now.getUTCMonth() > birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() >= birthDate.getUTCDate());
  return (aniversarioPassou ? y : y - 1) < 18;
}

export interface DocumentGap {
  label: string;
  href: string;
}

/**
 * O que falta para o contrato sair sem linha em branco.
 *
 * Não impede gerar: o PDF imprime traço para completar à caneta, e a clínica
 * com o paciente na cadeira não pode ficar refém de um cadastro incompleto. A
 * lista existe para ela saber antes de imprimir, não depois.
 */
export function contractGaps(input: {
  patientId: string;
  clinic: {
    document?: string | null;
    address?: string | null;
    city?: string | null;
    technicalResponsible?: string | null;
  };
  patient: { hasCpf: boolean; hasAddress: boolean };
}): DocumentGap[] {
  const gaps: DocumentGap[] = [];
  const paciente = `/pacientes/${input.patientId}/editar`;
  if (!input.patient.hasCpf) gaps.push({ label: 'CPF do paciente', href: paciente });
  if (!input.patient.hasAddress) gaps.push({ label: 'Endereço do paciente', href: paciente });
  if (!input.clinic.document) gaps.push({ label: 'CNPJ ou CPF da clínica', href: '/configuracoes#clinica' });
  if (!input.clinic.address) gaps.push({ label: 'Endereço da clínica', href: '/configuracoes#clinica' });
  else if (!input.clinic.city) gaps.push({ label: 'Cidade da clínica (foro)', href: '/configuracoes#clinica' });
  if (!input.clinic.technicalResponsible) {
    gaps.push({ label: 'Responsável técnico', href: '/configuracoes#documentos' });
  }
  return gaps;
}
