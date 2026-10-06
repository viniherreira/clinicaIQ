import { describe, expect, it } from 'vitest';
import { renderContractPdf, renderQuotePdf, renderReceiptPdf } from '@clinicaiq/pdf';
import { describePayment } from './payment-terms';
import { valorPorExtenso } from './extenso';

/**
 * Renderiza os três documentos de ponta a ponta. Um erro de layout no
 * react-pdf não aparece no typecheck — aparece como tela de erro na hora em
 * que a clínica clica em "PDF" com o paciente na frente.
 */

const isPdf = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';

const clinicaCompleta = {
  name: 'Clínica Exemplo',
  document: '12.345.678/0001-95',
  address: 'Rua A, 1 · Centro · São Paulo/SP',
  city: 'São Paulo',
  cityState: 'São Paulo/SP',
  phone: '(11) 99999-0000',
  technicalResponsible: 'Dra. Exemplo',
  technicalRegistration: 'CRO-SP 1',
};

const itens = [
  { name: 'Restauração', description: 'Dente 16', quantity: 2, unitPrice: 300, discountPercent: 10, total: 540 },
  { name: 'Limpeza', quantity: 1, unitPrice: 200, discountPercent: 0, total: 200 },
];

describe('geração de documentos', () => {
  it('orçamento completo', async () => {
    const bytes = await renderQuotePdf({
      clinic: clinicaCompleta,
      patient: { name: 'Paciente', document: '123.456.789-09', controlNumber: 7 },
      professional: { name: 'Dr. X', registration: 'CRO-SP 2' },
      quote: {
        code: 'ORC-0001',
        issuedAt: '03/10/2026',
        validUntil: '02/11/2026',
        items: itens,
        subtotal: 740,
        discountAmount: 40,
        discountLabel: '5%',
        total: 700,
        payment: describePayment({ total: 700, downPayment: 100, installments: 3, method: 'PIX' }),
        notes: 'Observação',
        terms: 'Condições gerais.',
        generatedAt: '03/10/2026 às 10:00',
      },
    });
    expect(isPdf(bytes)).toBe(true);
  });

  it('contrato sem nenhum dado opcional, paciente menor e com cláusulas extras', async () => {
    const bytes = await renderContractPdf({
      clinic: { name: 'Clínica Sem Cadastro' },
      patient: { name: 'Menor de Idade', isMinor: true },
      contract: {
        code: 'CTR-0002',
        quoteCode: 'ORC-0002',
        title: 'Contrato de prestação de serviços',
        items: itens,
        subtotal: 740,
        discountAmount: 0,
        total: 740,
        totalText: valorPorExtenso(740),
        payment: describePayment({ total: 740, downPayment: 0, installments: 1, method: null }),
        extraTerms: 'Primeira cláusula extra.\n\nSegunda cláusula extra.',
        dateLong: '3 de outubro de 2026',
        issuedAt: '03/10/2026',
        generatedAt: '03/10/2026 às 10:00',
      },
    });
    expect(isPdf(bytes)).toBe(true);
  });

  it('recibo sem orçamento vinculado', async () => {
    const bytes = await renderReceiptPdf({
      clinic: clinicaCompleta,
      receipt: {
        number: 'REC-ABC',
        payer: { name: 'Paciente' },
        amount: 150,
        amountText: valorPorExtenso(150),
        paidAt: '03/10/2026',
        paidAtLong: '3 de outubro de 2026',
        reference: 'tratamento odontológico',
        generatedAt: '03/10/2026 às 10:00',
      },
    });
    expect(isPdf(bytes)).toBe(true);
  });
});
