'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/observability';
import { TOOTH_PATH } from '@/components/logo';

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
          <svg
            viewBox="0 0 64 64"
            width={48}
            height={48}
            aria-hidden="true"
            style={{ display: 'block', margin: '0 auto 16px' }}
          >
            <circle cx="32" cy="32" r="32" fill="#1669C7" />
            <path d={TOOTH_PATH} fill="#fff" fillRule="evenodd" />
          </svg>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Algo deu errado</h1>
          <p style={{ fontSize: 14, color: '#6b6b68', margin: '0 0 20px', lineHeight: 1.5 }}>
            Tivemos um problema inesperado. Já registramos o ocorrido — tente recarregar.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#1669C7',
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
