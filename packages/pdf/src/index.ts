import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { QuoteDocument, type QuoteDocumentProps } from './quote-template';
import { ReceiptDocument, type ReceiptDocumentProps } from './receipt-template';
import { ContractDocument, type ContractDocumentProps } from './contract-template';

export { QuoteDocument, ReceiptDocument, ContractDocument };
export type { QuoteDocumentProps, ReceiptDocumentProps, ContractDocumentProps };
export type { ClinicInfo, Person, TreatmentItem } from './theme';

// `renderToBuffer` is typed for a root <Document>; every template renders one,
// so the casts below are safe. Returns Uint8Array so no Node `Buffer` typings
// are required here, and the @react-pdf dependency stays inside this package.

/** Renders a quote to PDF bytes. */
export async function renderQuotePdf(props: QuoteDocumentProps): Promise<Uint8Array> {
  return renderToBuffer(createElement(QuoteDocument, props) as never);
}

/** Renders a payment receipt to PDF bytes. */
export async function renderReceiptPdf(props: ReceiptDocumentProps): Promise<Uint8Array> {
  return renderToBuffer(createElement(ReceiptDocument, props) as never);
}

/** Renders a service contract (built from a quote) to PDF bytes. */
export async function renderContractPdf(props: ContractDocumentProps): Promise<Uint8Array> {
  return renderToBuffer(createElement(ContractDocument, props) as never);
}
