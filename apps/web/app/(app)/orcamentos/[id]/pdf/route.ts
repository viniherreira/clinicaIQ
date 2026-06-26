import { NextResponse } from 'next/server';
import { renderQuotePdf } from '@clinicaiq/pdf';
import { getQuotePdfData } from '../../actions';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getQuotePdfData(id);
  if (!data) return new NextResponse('Orçamento não encontrado', { status: 404 });

  const buffer = await renderQuotePdf(data);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="orcamento-${String(data.quote.number).padStart(4, '0')}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
