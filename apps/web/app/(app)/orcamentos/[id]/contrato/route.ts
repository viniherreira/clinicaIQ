import { NextResponse } from 'next/server';
import { renderContractPdf } from '@clinicaiq/pdf';
import { getContractPdfData } from '../../actions';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getContractPdfData(id);
  if (!data) return new NextResponse('Orçamento não encontrado', { status: 404 });

  const buffer = await renderContractPdf(data);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="contrato-${data.contract.code.toLowerCase()}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
