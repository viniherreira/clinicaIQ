import { NextResponse } from 'next/server';
import { renderContractPdf, renderQuotePdf, renderReceiptPdf } from '@clinicaiq/pdf';
import { getSampleDocument } from '../../actions';

export const runtime = 'nodejs';

/** Pré-visualização dos documentos com os dados da clínica e um paciente fictício. */
export async function GET(_req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const sample = await getSampleDocument(tipo);
  if (!sample) return new NextResponse('Documento não encontrado', { status: 404 });

  const bytes =
    sample.kind === 'orcamento'
      ? await renderQuotePdf(sample.props)
      : sample.kind === 'contrato'
        ? await renderContractPdf(sample.props)
        : await renderReceiptPdf(sample.props);

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="exemplo-${sample.kind}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
