'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/observability';

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
          background: '#f7f7f5',
          color: '#1a1a19',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 380 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, hsl(152 82% 30%), hsl(158 75% 24%))',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            CIQ
          </div>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Algo deu errado</h1>
          <p style={{ fontSize: 14, color: '#6b6b68', margin: '0 0 20px', lineHeight: 1.5 }}>
            Tivemos um problema inesperado. Já registramos o ocorrido — tente recarregar.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: 'hsl(152 82% 26%)',
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
