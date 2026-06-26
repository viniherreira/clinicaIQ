import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: '#1A1A19',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E3',
  },
  clinicName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
  },
  clinicInfo: {
    fontSize: 9,
    color: '#6B6B68',
    marginTop: 4,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 20,
  },
  patientSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 9,
    color: '#6B6B68',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 11,
    marginBottom: 8,
  },
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F4',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E3',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0EE',
  },
  colProcedure: { flex: 3 },
  colQty: { flex: 1, textAlign: 'center' },
  colUnit: { flex: 2, textAlign: 'right' },
  colDiscount: { flex: 1, textAlign: 'center' },
  colTotal: { flex: 2, textAlign: 'right' },
  headerText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#6B6B68',
    textTransform: 'uppercase',
  },
  totalsSection: {
    alignItems: 'flex-end',
    marginTop: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
    gap: 20,
  },
  totalLabel: {
    fontSize: 11,
    color: '#6B6B68',
    width: 100,
    textAlign: 'right',
  },
  totalValue: {
    fontSize: 11,
    width: 100,
    textAlign: 'right',
  },
  grandTotal: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    fontSize: 9,
    color: '#6B6B68',
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E3',
    paddingTop: 10,
  },
  validity: {
    marginTop: 20,
    fontSize: 10,
    color: '#6B6B68',
  },
});

export interface QuoteItem {
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  total: number;
}

export interface QuoteDocumentProps {
  clinic: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  patient: {
    name: string;
    phone?: string;
    email?: string;
  };
  quote: {
    id: string;
    number?: number;
    items: QuoteItem[];
    subtotal: number;
    discountLabel?: string;
    total: number;
    validUntil: string;
    createdAt: string;
    notes?: string;
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function QuoteDocument({ clinic, patient, quote }: QuoteDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.clinicName}>{clinic.name}</Text>
            {clinic.address && <Text style={styles.clinicInfo}>{clinic.address}</Text>}
            {clinic.phone && <Text style={styles.clinicInfo}>{clinic.phone}</Text>}
          </View>
          <View>
            <Text style={styles.label}>Orçamento</Text>
            <Text style={styles.value}>
              {quote.number ? `ORC-${String(quote.number).padStart(4, '0')}` : `#${quote.id.slice(-8).toUpperCase()}`}
            </Text>
            <Text style={styles.label}>Data</Text>
            <Text style={styles.value}>{quote.createdAt}</Text>
          </View>
        </View>

        <Text style={styles.title}>Orçamento</Text>

        <View style={styles.patientSection}>
          <Text style={styles.label}>Paciente</Text>
          <Text style={styles.value}>{patient.name}</Text>
          {patient.phone && (
            <>
              <Text style={styles.label}>Telefone</Text>
              <Text style={styles.value}>{patient.phone}</Text>
            </>
          )}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, styles.colProcedure]}>Procedimento</Text>
            <Text style={[styles.headerText, styles.colQty]}>Qtd</Text>
            <Text style={[styles.headerText, styles.colUnit]}>Valor Unit.</Text>
            <Text style={[styles.headerText, styles.colDiscount]}>Desc.</Text>
            <Text style={[styles.headerText, styles.colTotal]}>Total</Text>
          </View>
          {quote.items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.colProcedure}>
                <Text>{item.name}</Text>
                {item.description && (
                  <Text style={{ fontSize: 9, color: '#6B6B68', marginTop: 2 }}>
                    {item.description}
                  </Text>
                )}
              </View>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colUnit}>{formatCurrency(item.unitPrice)}</Text>
              <Text style={styles.colDiscount}>
                {item.discountPercent > 0 ? `${item.discountPercent}%` : '-'}
              </Text>
              <Text style={styles.colTotal}>{formatCurrency(item.total)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCurrency(quote.subtotal)}</Text>
          </View>
          {quote.subtotal - quote.total > 0.001 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Desconto{quote.discountLabel ? ` (${quote.discountLabel})` : ''}
              </Text>
              <Text style={styles.totalValue}>
                -{formatCurrency(quote.subtotal - quote.total)}
              </Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, styles.grandTotal]}>Total</Text>
            <Text style={[styles.totalValue, styles.grandTotal]}>
              {formatCurrency(quote.total)}
            </Text>
          </View>
        </View>

        {quote.notes ? (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>Observações</Text>
            <Text style={{ fontSize: 10, color: '#3A3A38', lineHeight: 1.4 }}>{quote.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.validity}>
          Orçamento válido até {quote.validUntil}. Valores sujeitos a alteração após esta data.
        </Text>

        <Text style={styles.footer}>
          {clinic.name}
          {clinic.address ? ` • ${clinic.address}` : ''}
          {clinic.phone ? ` • ${clinic.phone}` : ''}
        </Text>
      </Page>
    </Document>
  );
}
