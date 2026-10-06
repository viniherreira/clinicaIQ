import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import {
  color,
  DocFooter,
  DocHeader,
  documentLabel,
  formatCurrency,
  s,
  Signature,
  type ClinicInfo,
  type Person,
} from './theme';

/**
 * Recibo de pagamento.
 *
 * Feito para servir de comprovante de despesa de saúde no Imposto de Renda: a
 * Receita só aceita o recibo com nome e CPF de quem pagou, nome e CNPJ/CPF de
 * quem recebeu, o valor, a data e a descrição do serviço — e, para dentista, o
 * registro no conselho. Faltando qualquer um, o paciente volta pedindo outro.
 */
export interface ReceiptDocumentProps {
  clinic: ClinicInfo;
  /** Quem assina pela clínica: profissional do tratamento ou responsável técnico. */
  signer?: Person;
  receipt: {
    /** REC-XXXXXXXX */
    number: string;
    payer: { name: string; document?: string };
    amount: number;
    amountText: string;
    method?: string;
    /** dd/mm/aaaa */
    paidAt: string;
    /** "3 de outubro de 2026" */
    paidAtLong: string;
    /** "serviços odontológicos — Orçamento ORC-0001" */
    reference: string;
    /** Procedimentos do orçamento, quando houver. */
    services?: string[];
    generatedAt: string;
  };
}

export function ReceiptDocument({ clinic, signer, receipt }: ReceiptDocumentProps) {
  const quemRecebe = signer ?? (clinic.technicalResponsible
    ? { name: clinic.technicalResponsible, registration: clinic.technicalRegistration }
    : undefined);

  return (
    <Document title={`Recibo ${receipt.number} — ${receipt.payer.name}`} author={clinic.name} language="pt-BR">
      <Page size="A4" style={s.page}>
        <DocHeader
          clinic={clinic}
          kind="Recibo"
          code={receipt.number}
          meta={[{ label: 'Pagamento', value: receipt.paidAt }]}
        />

        <View
          style={{
            backgroundColor: color.accentSoft,
            borderRadius: 8,
            paddingVertical: 14,
            paddingHorizontal: 18,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 4,
          }}
        >
          <View>
            <Text style={{ ...s.label, color: color.accent }}>Valor recebido</Text>
            <Text style={{ fontSize: 9, color: color.accent, marginTop: 2 }}>{receipt.amountText}</Text>
          </View>
          <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: color.accent }}>
            {formatCurrency(receipt.amount)}
          </Text>
        </View>

        <Text style={{ ...s.paragraph, fontSize: 11, lineHeight: 1.7, marginTop: 22 }}>
          Recebi(emos) de <Text style={s.bold}>{receipt.payer.name}</Text>
          {receipt.payer.document ? (
            <>
              , inscrito(a) no {documentLabel(receipt.payer.document)} sob o nº{' '}
              <Text style={s.bold}>{receipt.payer.document}</Text>
            </>
          ) : null}
          , a importância de <Text style={s.bold}>{formatCurrency(receipt.amount)}</Text> ({receipt.amountText}),
          referente a <Text style={s.bold}>{receipt.reference}</Text>, paga em {receipt.paidAt}
          {receipt.method ? ` (forma de pagamento: ${receipt.method})` : ''}.
        </Text>

        {receipt.services && receipt.services.length > 0 ? (
          <View style={{ ...s.box, marginTop: 14 }}>
            <Text style={s.label}>Serviços</Text>
            {receipt.services.map((sv, i) => (
              <Text key={i} style={{ fontSize: 9, marginTop: 2, lineHeight: 1.35 }}>
                •  {sv}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={{ ...s.paragraph, fontSize: 10.5, marginTop: 16 }}>
          Para clareza e como prova de quitação do valor acima, firmo(amos) o presente recibo.
        </Text>

        <Text style={{ fontSize: 10.5, marginTop: 22 }}>
          {clinic.city ? `${clinic.city}, ` : ''}
          {receipt.paidAtLong}.
        </Text>

        <View wrap={false} style={{ marginTop: 26, alignItems: 'center' }}>
          <Signature
            width={300}
            title={quemRecebe?.name ?? clinic.name}
            lines={[
              quemRecebe?.registration,
              quemRecebe ? clinic.name : undefined,
              clinic.document ? `${documentLabel(clinic.document)} ${clinic.document}` : undefined,
            ]}
          />
        </View>

        <DocFooter clinic={clinic} issuedAt={receipt.generatedAt} />
      </Page>
    </Document>
  );
}
