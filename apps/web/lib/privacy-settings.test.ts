import { describe, expect, it } from 'vitest';
import { readPrivacySettings, recordAllowed, NEW_CLINIC_PRIVACY } from './privacy-settings';

describe('readPrivacySettings', () => {
  it('clínica de antes da opção continua como estava: a recepção vê', () => {
    expect(readPrivacySettings(null).receptionSeesRecord).toBe(true);
    expect(readPrivacySettings({ onlineBooking: { enabled: true } }).receptionSeesRecord).toBe(true);
  });

  it('respeita a escolha gravada', () => {
    expect(readPrivacySettings({ privacy: { receptionSeesRecord: false } }).receptionSeesRecord).toBe(false);
    expect(readPrivacySettings({ privacy: { receptionSeesRecord: true } }).receptionSeesRecord).toBe(true);
  });

  it('valor estranho não abre o prontuário de quem já tinha fechado', () => {
    expect(readPrivacySettings({ privacy: { receptionSeesRecord: 'sim' } }).receptionSeesRecord).toBe(false);
  });

  it('clínica nova começa com a recepção sem prontuário', () => {
    expect(readPrivacySettings({ privacy: NEW_CLINIC_PRIVACY }).receptionSeesRecord).toBe(false);
  });
});

describe('recordAllowed', () => {
  const fechado = { privacy: { receptionSeesRecord: false } };
  it('a escolha da clínica vale só para a recepção', () => {
    expect(recordAllowed('RECEPTIONIST', fechado)).toBe(false);
    expect(recordAllowed('RECEPTIONIST', null)).toBe(true);
    for (const role of ['OWNER', 'ADMIN', 'PROFESSIONAL']) expect(recordAllowed(role, fechado)).toBe(true);
  });

  it('papel desconhecido segue a matriz de sempre', () => {
    expect(recordAllowed('SUPERUSUARIO', null)).toBe(true); // cai no menor privilégio, que é Profissional
  });
});
