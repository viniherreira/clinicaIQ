import { describe, expect, it } from 'vitest';
import {
  bundleSavingsCents,
  modulesOf,
  parseProduct,
  parseTier,
  productAvailable,
  productOf,
  productPriceCents,
  PRODUCTS,
  signUpHref,
} from './products';

const profissional = {
  monthlyPriceCents: 23_900,
  crmPackagePriceCents: 12_000,
  crmOnlyPriceCents: 21_900,
  crmIncludedSeats: 3,
  crmSeatPriceCents: 3_900,
};

describe('produtos', () => {
  it('cada produto liga os módulos certos, e o caminho de volta dá o mesmo produto', () => {
    expect(modulesOf('AGENDA')).toEqual({ clinicEnabled: true, crmEnabled: false });
    expect(modulesOf('CRM')).toEqual({ clinicEnabled: false, crmEnabled: true });
    expect(modulesOf('COMPLETO')).toEqual({ clinicEnabled: true, crmEnabled: true });
    for (const p of PRODUCTS) expect(productOf(modulesOf(p))).toBe(p);
  });

  it('preços da tabela: Agenda 239, CRM 219, Completo 359 (economiza 99)', () => {
    expect(productPriceCents(profissional, 'AGENDA')).toBe(23_900);
    expect(productPriceCents(profissional, 'CRM')).toBe(21_900);
    expect(productPriceCents(profissional, 'COMPLETO')).toBe(35_900);
    expect(bundleSavingsCents(profissional)).toBe(9_900);
  });

  it('sem preço do CRM sozinho, o CRM não é vendido nesse tamanho', () => {
    expect(productAvailable({ ...profissional, crmOnlyPriceCents: 0 }, 'CRM')).toBe(false);
    expect(productAvailable(profissional, 'CRM')).toBe(true);
  });

  it('lê o endereço do site sem se importar com caixa e acento', () => {
    expect(parseProduct('completo')).toBe('COMPLETO');
    expect(parseProduct('CRM')).toBe('CRM');
    expect(parseProduct('outro')).toBeNull();
    expect(parseTier('clínica')).toBe('CLINICA');
    expect(parseTier(undefined)).toBeNull();
    expect(signUpHref('CRM', 'ESSENCIAL')).toBe('/sign-up?plano=crm&tamanho=essencial');
  });
});
