function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[gateway] missing required env var ${name}`);
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 8080),
  /** Shared secret the Next.js app sends as `Authorization: Bearer …`. */
  GATEWAY_TOKEN: required('WHATSAPP_GATEWAY_TOKEN'),
  ENCRYPTION_MASTER_KEY: required('ENCRYPTION_MASTER_KEY'),
  /** How long a pairing QR stays valid before the clinic must ask for a new one. */
  QR_TTL_MS: Number(process.env.WHATSAPP_QR_TTL_MS ?? 60_000),
};
