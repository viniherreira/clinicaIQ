import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: 'Helvetica', color: '#1A1A19' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E3',
  },
  clinicName: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  clinicInfo: { fontSize: 9, color: '#6B6B68', marginTop: 4 },
  label: { fontSize: 9, color: '#6B6B68', marginBottom: 2, textTransform: 'uppercase' },
  value: { fontSize: 11 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  amountBox: {
    marginTop: 18,
    marginBottom: 24,
    backgroundColor: '#EAF5EF',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: { fontSize: 10, color: '#0F6E56', textTransform: 'uppercase' },
  amount: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#0F6E56' },
  body: { fontSize: 12, lineHeight: 1.7, marginBottom: 22 },
  bold: { fontFamily: 'Helvetica-Bold' },
  metaRow: { flexDirection: 'row', gap: 40, marginBottom: 8 },
  metaCol: { flex: 1 },
  signature: { marginTop: 60, alignItems: 'center' },
  signatureLine: { borderTopWidth: 1, borderTopColor: '#1A1A19', width: 260, paddingTop: 6, textAlign: 'center', fontSize: 10 },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 48,
    right: 48,
    fontSize: 9,
    color: '#6B6B68',
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E3',
    paddingTop: 10,
  },
});

export interface ReceiptDocumentProps {
  clinic: { name: string; phone?: string; email?: string; document?: string };
  receipt: {
    number: string;
    patientName: string;
    amount: number;
    amountText: string;
    method?: string;
    paidAt: string;
    reference: string;
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function ReceiptDocument({ clinic, receipt }: ReceiptDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.clinicName}>{clinic.name}</Text>
            {clinic.document && <Text style={styles.clinicInfo}>CNPJ {clinic.document}</Text>}
            {clinic.phone && <Text style={styles.clinicInfo}>{clinic.phone}</Text>}
            {clinic.email && <Text style={styles.clinicInfo}>{clinic.email}</Text>}
          </View>
          <View>
            <Text style={styles.label}>Recibo nº</Text>
            <Text style={styles.value}>{receipt.number}</Text>
          </View>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Recibo de pagamento</Text>
        </View>

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Valor recebido</Text>
          <Text style={styles.amount}>{formatCurrency(receipt.amount)}</Text>
        </View>

        <Text style={styles.body}>
          Recebemos de <Text style={styles.bold}>{receipt.patientName}</Text> a importância de{' '}
          <Text style={styles.bold}>{receipt.amountText}</Text>, referente a{' '}
          <Text style={styles.bold}>{receipt.reference}</Text>
          {receipt.method ? `, na forma de ${receipt.method}` : ''}.
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.label}>Data do pagamento</Text>
            <Text style={styles.value}>{receipt.paidAt}</Text>
          </View>
          {receipt.method ? (
            <View style={styles.metaCol}>
              <Text style={styles.label}>Forma de pagamento</Text>
              <Text style={styles.value}>{receipt.method}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.signature}>
          <Text style={styles.signatureLine}>{clinic.name}</Text>
        </View>

        <Text style={styles.footer}>
          {clinic.name}
          {clinic.document ? ` • CNPJ ${clinic.document}` : ''}
          {clinic.phone ? ` • ${clinic.phone}` : ''}
        </Text>
      </Page>
    </Document>
  );
}
