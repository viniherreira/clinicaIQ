'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/observability';
import {
  BRAND,
  SYMBOL_BODY,
  SYMBOL_D,
  SYMBOL_HEAD,
  SYMBOL_STAR,
  SYMBOL_STAR_STROKE,
  SYMBOL_VIEWBOX,
} from '@/components/logo-paths';

/**
 * Root error boundary — catches failures in the root layout itself, where the
 * app's CSS may not be available, so it uses inline styles and renders its own
 * <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { digest: error.digest, boundary: 'global' });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: BRAND.warmWhite,
          color: BRAND.navy,
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 380 }}>
          <svg
            viewBox={SYMBOL_VIEWBOX}
            width={54}
            height={48}
            aria-hidden="true"
            style={{ display: 'block', margin: '0 auto 16px' }}
          >
            <path fill={BRAND.teal} d={SYMBOL_D} />
            <path fill={BRAND.navy} d={SYMBOL_BODY} />
            <circle fill={BRAND.mint} cx={SYMBOL_HEAD.cx} cy={SYMBOL_HEAD.cy} r={SYMBOL_HEAD.r} />
            <path fill={BRAND.teal} stroke={BRAND.teal} strokeWidth={SYMBOL_STAR_STROKE} strokeLinejoin="round" d={SYMBOL_STAR} />
          </svg>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Algo deu errado</h1>
          <p style={{ fontSize: 14, color: '#6b6b68', margin: '0 0 20px', lineHeight: 1.5 }}>
            Tivemos um problema inesperado. Já registramos o ocorrido. Tente recarregar.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#0F766E',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
