import { can } from './permissions';

/**
 * Quem vê o prontuário clínico (anamnese, evoluções, odontograma e imagens).
 *
 * Dono, administrador e profissional sempre veem: é com o prontuário que se
 * atende. A recepção depende da clínica (Configurações › Privacidade). Algumas
 * recepções precisam dele no dia a dia; em outras, ver a anamnese de todo mundo
 * é acesso a dado de saúde sem necessidade (LGPD art. 6º, III, e art. 11).
 *
 * Clínica que já existia antes da opção continua como estava (a recepção vê):
 * trancar de surpresa no meio do atendimento faria o dono dar o próprio login
 * para a recepção. Clínica nova começa fechada (`NEW_CLINIC_PRIVACY`).
 *
 * Módulo puro, como `permissions.ts`: a regra se testa sem banco.
 */

export interface PrivacySettings {
  receptionSeesRecord: boolean;
}

/** O que a clínica nova grava ao nascer. */
export const NEW_CLINIC_PRIVACY: PrivacySettings = { receptionSeesRecord: false };

export function readPrivacySettings(settings: unknown): PrivacySettings {
  const raw = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).privacy : undefined;
  if (!raw || typeof raw !== 'object' || !('receptionSeesRecord' in raw)) return { receptionSeesRecord: true };
  return { receptionSeesRecord: (raw as Record<string, unknown>).receptionSeesRecord === true };
}

/** Este papel vê o prontuário nesta clínica? */
export function recordAllowed(role: string | null | undefined, settings: unknown): boolean {
  if (!can(role, 'prontuario')) return false;
  if (role === 'RECEPTIONIST') return readPrivacySettings(settings).receptionSeesRecord;
  return true;
}
