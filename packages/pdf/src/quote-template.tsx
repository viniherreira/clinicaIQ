import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import {
  clinicSigner,
  color,
  DocFooter,
  DocHeader,
  documentLabel,
  Field,
  s,
  Section,
  Signature,
  TotalsBox,
  TreatmentTable,
  type ClinicInfo,
  type Person,
  type TreatmentItem,
} from './theme';

export type QuoteItem = TreatmentItem;

export interface QuoteDocumentProps {
  clinic: ClinicInfo;
  patient: {
    name: string;
    /** CPF já formatado. */
    document?: string;
    phone?: string;
    email?: string;
    controlNumber?: number;
  };
  /** Quem vai executar o tratamento. */
  professional?: Person;
  quote: {
    /** ORC-0001 */
    code: string;
    issuedAt: string;
    validUntil: string;
    items: QuoteItem[];
    subtotal: number;
    discountAmount: number;
    discountLabel?: string;
    total: number;
    /** Frase pronta, de `describePayment`. */
    payment: string;
    notes?: string;
    /** Condições gerais (da clínica ou o texto padrão). */
    terms: string;
    /** "03/10/2026 às 14:32" — carimbo do rodapé. */
    generatedAt: string;
  };
}

export function QuoteDocument({ clinic, patient, professional, quote }: QuoteDocumentProps) {
  const signer = clinicSigner(clinic, professional);

  return (
    <Document title={`Orçamento ${quote.code} — ${patient.name}`} author={clinic.name} language="pt-BR">
      <Page size="A4" style={s.page}>
        <DocHeader
          clinic={clinic}
          kind="Orçamento"
          code={quote.code}
          meta={[
            { label: 'Emissão', value: quote.issuedAt },
            { label: 'Válido até', value: quote.validUntil },
          ]}
        />

        {/* Quem é o paciente e quem atende */}
        <View style={{ ...s.box, flexDirection: 'row', flexWrap: 'wrap' }}>
          <Field label="Paciente" value={patient.name} flex={2.2} />
          <Field
            label={patient.document ? documentLabel(patient.document) : 'CPF'}
            value={patient.document}
          />
          <Field label="Telefone" value={patient.phone} />
          {patient.controlNumber ? <Field label="Prontuário" value={`Nº ${patient.controlNumber}`} flex={0.8} /> : null}
          {professional?.name ? (
            <View style={{ width: '100%', flexDirection: 'row' }}>
              <Field
                label="Profissional responsável"
                value={[professional.name, professional.registration].filter(Boolean).join(' — ')}
              />
            </View>
          ) : null}
        </View>

        <Section title="Plano de tratamento">
          <TreatmentTable items={quote.items} />
        </Section>

        {/* Condições de pagamento à esquerda, totais à direita */}
        <View wrap={false} style={{ flexDirection: 'row', marginTop: 14, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: 18 }}>
            <Text style={s.sectionTitle}>Condições de pagamento</Text>
            <Text style={{ color: color.ink }}>{quote.payment}</Text>
          </View>
          <TotalsBox
            subtotal={quote.subtotal}
            discountAmount={quote.discountAmount}
            discountLabel={quote.discountLabel}
            total={quote.total}
          />
        </View>

        {quote.notes ? (
          <Section title="Observações">
            <Text style={s.paragraph}>{quote.notes}</Text>
          </Section>
        ) : null}

        <Section title="Condições gerais">
          <Text style={{ ...s.paragraph, fontSize: 8.5, color: color.muted }}>{quote.terms}</Text>
        </Section>

        {/* Aceite: fica inteiro numa página, nunca com a assinatura sozinha na seguinte */}
        <View wrap={false} style={{ marginTop: 18 }}>
          <Text style={s.sectionTitle}>Aceite</Text>
          <Text style={{ ...s.paragraph, fontSize: 9 }}>
            Declaro que recebi as explicações sobre o plano de tratamento proposto, suas etapas, alternativas e
            cuidados, que tive a oportunidade de esclarecer minhas dúvidas e que aceito este orçamento nas
            condições acima.
          </Text>
          <Text style={{ fontSize: 9, marginTop: 14 }}>
            {clinic.city ? `${clinic.city}, ` : 'Local: ____________________, '}______ de ____________________ de
            ________.
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 4, marginHorizontal: -12 }}>
            <Signature
              title={patient.name}
              lines={['Paciente ou responsável legal', patient.document && `CPF ${patient.document}`]}
            />
            <Signature
              title={signer?.name ?? clinic.name}
              lines={[signer?.registration, signer ? clinic.name : undefined]}
            />
          </View>
        </View>

        <DocFooter clinic={clinic} issuedAt={quote.generatedAt} />
      </Page>
    </Document>
  );
}
