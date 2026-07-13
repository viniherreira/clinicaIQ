import { NextResponse } from 'next/server';
import { renderReceiptPdf } from '@clinicaiq/pdf';
import { getReceiptData } from '../../actions';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getReceiptData(id);
  if (!data) return new NextResponse('Pagamento não encontrado', { status: 404 });

  const buffer = await renderReceiptPdf(data);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${data.receipt.number}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
