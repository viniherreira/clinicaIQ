import type { WhatsAppProvider } from './types';
import { MockWhatsAppProvider } from './mock-provider';
import { MetaWhatsAppProvider } from './meta-provider';

/**
 * Resolves the active provider from the environment.
 *
 * `WHATSAPP_PROVIDER=meta` switches to the live Meta Cloud API, but only when
 * the credentials are present — otherwise we fall back to the mock so a missing
 * env var never crashes a send. Dev defaults to the mock provider.
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  const provider = (process.env.WHATSAPP_PROVIDER ?? 'mock').toLowerCase();

  if (provider === 'meta') {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (accessToken && phoneNumberId) {
      return new MetaWhatsAppProvider({ accessToken, phoneNumberId });
    }
    console.warn(
      '[whatsapp] WHATSAPP_PROVIDER=meta but credentials are missing — falling back to mock provider.',
    );
  }

  return new MockWhatsAppProvider();
}
