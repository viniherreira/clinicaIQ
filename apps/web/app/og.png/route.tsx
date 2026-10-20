/**
 * Imagem de compartilhamento do site (1200×630), a que aparece quando alguém
 * manda o link do DreamClin no WhatsApp, Instagram ou LinkedIn.
 *
 * É uma rota em `/og.png`, e não um `opengraph-image` na raiz do app, de
 * propósito: o arquivo na raiz valeria para todas as páginas, e o link de
 * orçamento que a clínica manda ao paciente sairia com a propaganda do
 * DreamClin. Só a página inicial aponta para cá (`app/page.tsx`).
 */
import { ImageResponse } from 'next/og';
import {
  BRAND,
  SYMBOL_BODY,
  SYMBOL_D,
  SYMBOL_HEAD,
  SYMBOL_STAR,
  SYMBOL_STAR_STROKE,
  SYMBOL_VIEWBOX,
  WORDMARK_CLIN,
  WORDMARK_DREAM,
  WORDMARK_VIEWBOX,
} from '@/components/logo-paths';
import { TRIAL_DAYS } from '@/lib/subscription';

export const dynamic = 'force-static';

const SIZE = { width: 1200, height: 630 };
const MODULES = ['Agenda', 'WhatsApp', 'Orçamentos', 'Prontuário', 'Financeiro'];

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          color: 'white',
          // Mesmo degradê do `bg-brand-gradient` do site.
          backgroundImage: 'linear-gradient(135deg, hsl(175 77% 26%), hsl(217 79% 28%))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <svg width={78} height={70} viewBox={SYMBOL_VIEWBOX}>
            <path fill="white" d={SYMBOL_D} />
            <path fill="white" d={SYMBOL_BODY} />
            <circle fill="rgba(255,255,255,0.45)" cx={SYMBOL_HEAD.cx} cy={SYMBOL_HEAD.cy} r={SYMBOL_HEAD.r} />
            <path fill="white" stroke="white" strokeWidth={SYMBOL_STAR_STROKE} strokeLinejoin="round" d={SYMBOL_STAR} />
          </svg>
          <svg width={300} height={47} viewBox={WORDMARK_VIEWBOX}>
            <path fill="white" d={WORDMARK_DREAM} />
            <path fill={BRAND.mint} d={WORDMARK_CLIN} />
          </svg>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 960 }}>
            Gestão inteligente para clínicas odontológicas e estéticas
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 28, color: 'rgba(255,255,255,0.88)' }}>
            {MODULES.map((m, i) => (
              <span key={m} style={{ display: 'flex', gap: 14 }}>
                {i > 0 && <span style={{ color: BRAND.mint }}>·</span>}
                {m}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              padding: '14px 28px',
              borderRadius: 999,
              background: 'white',
              color: BRAND.navy,
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            {TRIAL_DAYS} dias grátis, sem cartão
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>dreamclin.com</div>
        </div>
      </div>
    ),
    SIZE,
  );
}
