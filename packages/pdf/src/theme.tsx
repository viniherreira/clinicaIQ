import React from 'react';
import { Font, Image, StyleSheet, Text, View } from '@react-pdf/renderer';

/**
 * Peças comuns aos documentos da clínica: orçamento, contrato e recibo.
 *
 * O documento é da clínica, não do ClinicaIQ — por isso a paleta é sóbria (um
 * azul-saúde de destaque sobre cinzas frios) e não há marca nossa em lugar
 * nenhum. O que identifica o papel é o logotipo e os dados de quem o emite.
 */

// O react-pdf hifeniza com regras do inglês e quebra "proce-dimento" em lugares
// que nenhum leitor de português aceitaria. Palavra inteira, sempre.
Font.registerHyphenationCallback((word) => [word]);

export const color = {
  ink: '#1A1F2B',
  body: '#2D3445',
  muted: '#646D7E',
  faint: '#98A0AE',
  line: '#E1E6EE',
  soft: '#F3F6FA',
  zebra: '#F9FBFD',
  // Um tom abaixo do azul da logo (#1669C7): no papel, o azul claro desbota.
  accent: '#1458A6',
  accentSoft: '#E9F1FB',
};

export const s = StyleSheet.create({
  // Sem `lineHeight` aqui de propósito: herdado da página, ele some com todo
  // elemento `fixed` de posição absoluta (bug do react-pdf 4) — e o rodapé com
  // "página x de y" desaparecia sem erro nenhum. Cada texto corrido define o seu.
  page: {
    paddingTop: 34,
    paddingBottom: 62,
    paddingHorizontal: 42,
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    color: color.body,
  },
  bold: { fontFamily: 'Helvetica-Bold', color: color.ink },
  muted: { color: color.muted },
  label: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: color.muted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: color.accent,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  paragraph: { fontSize: 9.5, lineHeight: 1.5, textAlign: 'justify' },
  box: {
    backgroundColor: color.soft,
    borderRadius: 6,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
});

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/** CPF tem 11 dígitos, CNPJ tem 14. O rótulo errado num documento fiscal é erro de fato. */
export function documentLabel(doc: string | undefined): 'CPF' | 'CNPJ' | 'Documento' {
  const d = (doc ?? '').replace(/\D/g, '');
  if (d.length === 11) return 'CPF';
  if (d.length === 14) return 'CNPJ';
  return 'Documento';
}

export interface ClinicInfo {
  name: string;
  /** CNPJ ou CPF já formatado. */
  document?: string;
  /** Endereço em uma linha. */
  address?: string;
  /** "São Paulo" — para a linha "São Paulo, 3 de outubro de 2026". */
  city?: string;
  /** "São Paulo/SP" — para o foro do contrato. */
  cityState?: string;
  phone?: string;
  email?: string;
  /** data:image/png;base64,… ou data:image/jpeg;base64,… */
  logo?: string;
  technicalResponsible?: string;
  technicalRegistration?: string;
}

export interface Person {
  name: string;
  registration?: string;
}

export interface DocMeta {
  label: string;
  value: string;
}

/**
 * Cabeçalho: identidade da clínica à esquerda, o que é o papel à direita.
 * Repetido em toda página (`fixed`) — um contrato de três folhas grampeado
 * precisa dizer de quem é em cada uma.
 */
export function DocHeader({
  clinic,
  kind,
  code,
  meta = [],
}: {
  clinic: ClinicInfo;
  kind: string;
  code: string;
  meta?: DocMeta[];
}) {
  const contato = [clinic.phone, clinic.email].filter(Boolean).join('  ·  ');
  return (
    <View fixed style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 }}>
          {clinic.logo ? (
            <Image
              src={clinic.logo}
              style={{ width: 54, height: 54, objectFit: 'contain', marginRight: 12 }}
            />
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontFamily: 'Helvetica-Bold', color: color.ink }}>
              {clinic.name}
            </Text>
            {clinic.document ? (
              <Text style={{ fontSize: 8, color: color.muted, marginTop: 2 }}>
                {documentLabel(clinic.document)} {clinic.document}
              </Text>
            ) : null}
            {clinic.address ? (
              <Text style={{ fontSize: 8, color: color.muted, marginTop: 2 }}>{clinic.address}</Text>
            ) : null}
            {contato ? (
              <Text style={{ fontSize: 8, color: color.muted, marginTop: 2 }}>{contato}</Text>
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', minWidth: 130 }}>
          <Text style={{ ...s.sectionTitle, marginBottom: 2 }}>{kind}</Text>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: color.ink }}>{code}</Text>
          {meta.map((m) => (
            <Text key={m.label} style={{ fontSize: 8, color: color.muted, marginTop: 2 }}>
              {m.label}: <Text style={{ color: color.body }}>{m.value}</Text>
            </Text>
          ))}
        </View>
      </View>
      <View style={{ height: 2, backgroundColor: color.accent, marginTop: 12 }} />
    </View>
  );
}

/** Rodapé fixo: quem emitiu, quando, e "página x de y". */
export function DocFooter({ clinic, issuedAt }: { clinic: ClinicInfo; issuedAt: string }) {
  const esquerda = [clinic.name, clinic.document && `${documentLabel(clinic.document)} ${clinic.document}`]
    .filter(Boolean)
    .join('  ·  ');
  return (
    <View
      fixed
      style={{
        position: 'absolute',
        bottom: 26,
        left: 42,
        right: 42,
        borderTopWidth: 0.75,
        borderTopColor: color.line,
        paddingTop: 7,
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 7.5,
        color: color.faint,
      }}
    >
      <Text>{esquerda}</Text>
      <Text>Emitido em {issuedAt}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

/** Rótulo pequeno e valor embaixo. `blank` imprime linha para preencher à mão. */
export function Field({
  label,
  value,
  blank = false,
  flex = 1,
}: {
  label: string;
  value?: string;
  blank?: boolean;
  flex?: number;
}) {
  return (
    <View style={{ flex, paddingRight: 10, marginBottom: 6 }}>
      <Text style={s.label}>{label}</Text>
      {value ? (
        <Text style={{ fontSize: 9.5, color: color.ink }}>{value}</Text>
      ) : blank ? (
        <View style={{ borderBottomWidth: 0.75, borderBottomColor: color.faint, height: 12 }} />
      ) : (
        <Text style={{ fontSize: 9.5, color: color.faint }}>—</Text>
      )}
    </View>
  );
}

/** Linha de assinatura com nome e uma ou duas linhas de identificação. */
export function Signature({
  title,
  lines = [],
  width,
}: {
  title: string;
  lines?: (string | undefined)[];
  /** Largura fixa, para assinatura sozinha. Sem ela, divide a linha com as vizinhas. */
  width?: number;
}) {
  // `flex: 1` só faz sentido lado a lado (linha). Sozinha numa coluna, ele zera
  // a altura e some com o nome embaixo do traço — por isso a largura explícita.
  return (
    <View style={{ ...(width ? { width } : { flex: 1 }), paddingHorizontal: 12, alignItems: 'center' }}>
      <View style={{ width: '100%', borderTopWidth: 0.9, borderTopColor: color.ink, marginTop: 34 }} />
      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: color.ink, marginTop: 4, textAlign: 'center' }}>
        {title}
      </Text>
      {lines.filter(Boolean).map((l, i) => (
        <Text key={i} style={{ fontSize: 8, color: color.muted, textAlign: 'center', lineHeight: 1.4 }}>
          {l}
        </Text>
      ))}
    </View>
  );
}

export interface TreatmentItem {
  name: string;
  /** Dente, região ou detalhe. */
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  total: number;
}

/**
 * Tabela do plano de tratamento. Linhas não se partem entre páginas, e o
 * cabeçalho segura a primeira linha junto (`minPresenceAhead`) para não sobrar
 * cabeçalho sozinho no pé da folha.
 */
export function TreatmentTable({ items, compact = false }: { items: TreatmentItem[]; compact?: boolean }) {
  const anyDiscount = items.some((it) => it.discountPercent > 0);
  const cols = anyDiscount
    ? { n: '6%', name: '44%', qty: '8%', unit: '15%', disc: '10%', total: '17%' }
    : { n: '6%', name: '54%', qty: '8%', unit: '15%', disc: '0%', total: '17%' };
  const py = compact ? 4 : 5;
  const head = { fontSize: 7, fontFamily: 'Helvetica-Bold', color: color.muted, letterSpacing: 0.6 } as const;

  return (
    <View>
      <View
        minPresenceAhead={40}
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: color.accent,
          paddingBottom: 4,
          paddingHorizontal: 4,
        }}
      >
        <Text style={{ ...head, width: cols.n }}>#</Text>
        <Text style={{ ...head, width: cols.name }}>PROCEDIMENTO</Text>
        <Text style={{ ...head, width: cols.qty, textAlign: 'center' }}>QTD.</Text>
        <Text style={{ ...head, width: cols.unit, textAlign: 'right' }}>VALOR UNIT.</Text>
        {anyDiscount ? <Text style={{ ...head, width: cols.disc, textAlign: 'right' }}>DESC.</Text> : null}
        <Text style={{ ...head, width: cols.total, textAlign: 'right' }}>TOTAL</Text>
      </View>
      {items.map((it, i) => (
        <View
          key={i}
          wrap={false}
          style={{
            flexDirection: 'row',
            paddingVertical: py,
            paddingHorizontal: 4,
            backgroundColor: i % 2 === 1 ? color.zebra : undefined,
            borderBottomWidth: 0.5,
            borderBottomColor: color.line,
          }}
        >
          <Text style={{ width: cols.n, color: color.faint }}>{String(i + 1).padStart(2, '0')}</Text>
          <View style={{ width: cols.name, paddingRight: 8 }}>
            <Text style={{ color: color.ink }}>{it.name}</Text>
            {it.description ? (
              <Text style={{ fontSize: 8, color: color.muted, marginTop: 1 }}>{it.description}</Text>
            ) : null}
          </View>
          <Text style={{ width: cols.qty, textAlign: 'center' }}>{it.quantity}</Text>
          <Text style={{ width: cols.unit, textAlign: 'right' }}>{formatCurrency(it.unitPrice)}</Text>
          {anyDiscount ? (
            <Text style={{ width: cols.disc, textAlign: 'right', color: color.muted }}>
              {it.discountPercent > 0 ? `${formatPercent(it.discountPercent)}` : '—'}
            </Text>
          ) : null}
          <Text style={{ width: cols.total, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: color.ink }}>
            {formatCurrency(it.total)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function formatPercent(n: number): string {
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

/** Caixa de totais alinhada à direita. */
export function TotalsBox({
  subtotal,
  discountAmount,
  discountLabel,
  total,
}: {
  subtotal: number;
  discountAmount: number;
  discountLabel?: string;
  total: number;
}) {
  const row = { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 } as const;
  return (
    <View style={{ width: 210 }}>
      {discountAmount > 0.004 ? (
        <>
          <View style={row}>
            <Text style={{ color: color.muted }}>Subtotal</Text>
            <Text>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={row}>
            <Text style={{ color: color.muted }}>Desconto{discountLabel ? ` (${discountLabel})` : ''}</Text>
            {/* Traço "–" e não o sinal "−": a Helvetica embutida do PDF não tem
                o U+2212, e o desconto saía como se fosse valor positivo. */}
            <Text>– {formatCurrency(discountAmount)}</Text>
          </View>
        </>
      ) : null}
      <View
        style={{
          ...row,
          marginTop: 4,
          marginBottom: 0,
          backgroundColor: color.accentSoft,
          borderRadius: 5,
          paddingVertical: 7,
          paddingHorizontal: 9,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontFamily: 'Helvetica-Bold', color: color.accent, fontSize: 9 }}>VALOR TOTAL</Text>
        <Text style={{ fontFamily: 'Helvetica-Bold', color: color.accent, fontSize: 13 }}>
          {formatCurrency(total)}
        </Text>
      </View>
    </View>
  );
}

export function Section({
  title,
  children,
  keep = false,
}: {
  title: string;
  children: React.ReactNode;
  /** Não deixa a seção se partir entre páginas. Para blocos curtos. */
  keep?: boolean;
}) {
  return (
    <View wrap={!keep} style={{ marginTop: 14 }}>
      <Text minPresenceAhead={30} style={s.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Quem assina pela clínica: o profissional do tratamento, ou o responsável técnico. */
export function clinicSigner(clinic: ClinicInfo, professional?: Person): Person | undefined {
  if (professional?.name) return professional;
  if (clinic.technicalResponsible) {
    return { name: clinic.technicalResponsible, registration: clinic.technicalRegistration };
  }
  return undefined;
}
