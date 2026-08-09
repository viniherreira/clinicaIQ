/**
 * Endereço da clínica em uma linha, do jeito que se escreve no Brasil.
 *
 * Vive fora das actions porque um arquivo `'use server'` só pode exportar
 * funções async — e porque compor endereço é regra de formatação, não de
 * servidor. O resultado é guardado numa coluna própria: é o que a geração do PDF
 * do orçamento lê, e compor aqui, uma vez, evita que o PDF precise saber onde
 * entra vírgula e onde entra hífen.
 */

export interface AddressParts {
  street?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

const limpo = (v: string | null | undefined): string => (v ?? '').trim();

export function composeAddress(p: AddressParts): string | null {
  const rua = [limpo(p.street), limpo(p.addressNumber)].filter(Boolean).join(', ');
  const comComplemento = [rua, limpo(p.complement)].filter(Boolean).join(' — ');
  const cidade = [limpo(p.city), limpo(p.state)].filter(Boolean).join('/');
  const cep = limpo(p.zipCode);

  const partes = [comComplemento, limpo(p.neighborhood), cidade, cep && `CEP ${cep}`].filter(
    Boolean,
  );

  return partes.length > 0 ? partes.join(' · ') : null;
}
