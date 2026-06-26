import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { QuoteDocument, type QuoteDocumentProps } from './quote-template';

export { QuoteDocument };
export type { QuoteDocumentProps };

/** Renders a quote to PDF bytes. Keeps the @react-pdf dependency inside this
 *  package so the web app only depends on @clinicaiq/pdf. Returns Uint8Array so
 *  no Node `Buffer` typings are required here. */
export async function renderQuotePdf(props: QuoteDocumentProps): Promise<Uint8Array> {
  // `renderToBuffer` is typed for a root <Document>; QuoteDocument renders one,
  // so the cast is safe.
  return renderToBuffer(createElement(QuoteDocument, props) as never);
}
