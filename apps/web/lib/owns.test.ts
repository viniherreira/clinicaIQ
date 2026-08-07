import { beforeEach, describe, expect, it, vi } from 'vitest';

// `owns.ts` importa 'server-only', que não resolve fora do bundler do Next.
vi.mock('server-only', () => ({}));

/**
 * Cada modelo devolve quantos dos ids pedidos pertencem ao tenant.
 * As linhas "existentes" são declaradas por teste como pares id→tenant.
 */
const rows: Record<string, Record<string, string>> = {
  patient: {},
  professional: {},
  procedure: {},
  quote: {},
  procedureCategory: {},
};

const chamadas: string[] = [];

function counter(model: string) {
  return vi.fn(async ({ where }: { where: { id: { in: string[] }; tenantId: string } }) => {
    chamadas.push(model);
    return where.id.in.filter((id) => rows[model][id] === where.tenantId).length;
  });
}

vi.mock('@clinicaiq/db', () => ({
  prisma: {
    patient: { count: counter('patient') },
    professional: { count: counter('professional') },
    procedure: { count: counter('procedure') },
    quote: { count: counter('quote') },
    procedureCategory: { count: counter('procedureCategory') },
  },
}));

const { refOutsideTenant, refErrorMessage } = await import('./owns');

const CLINICA_A = 'tenant_a';
const CLINICA_B = 'tenant_b';

beforeEach(() => {
  for (const model of Object.keys(rows)) rows[model] = {};
  chamadas.length = 0;
});

describe('refOutsideTenant', () => {
  it('aceita ids da própria clínica', async () => {
    rows.patient.p1 = CLINICA_A;
    rows.professional.prof1 = CLINICA_A;
    rows.procedure.proc1 = CLINICA_A;

    expect(
      await refOutsideTenant(CLINICA_A, {
        patientId: 'p1',
        professionalId: 'prof1',
        procedureId: 'proc1',
      }),
    ).toBeNull();
  });

  it('recusa paciente de outra clínica', async () => {
    // O ataque que isso trava: o agendamento nasceria com tenantId da clínica A
    // e patientId da B, e a agenda da A passaria a mostrar o nome do paciente da
    // B — o include segue a FK, e a extensão do Prisma só filtra o nível de cima.
    rows.patient.vitima = CLINICA_B;

    expect(await refOutsideTenant(CLINICA_A, { patientId: 'vitima' })).toBe('paciente');
  });

  it('recusa profissional de outra clínica', async () => {
    rows.professional.outro = CLINICA_B;
    expect(await refOutsideTenant(CLINICA_A, { professionalId: 'outro' })).toBe('profissional');
  });

  it('recusa id que não existe em lugar nenhum', async () => {
    expect(await refOutsideTenant(CLINICA_A, { procedureId: 'inventado' })).toBe('procedimento');
  });

  it('recusa a lista inteira quando um único item é de fora', async () => {
    rows.professional.meu1 = CLINICA_A;
    rows.professional.meu2 = CLINICA_A;
    rows.professional.alheio = CLINICA_B;

    expect(
      await refOutsideTenant(CLINICA_A, { professionalIds: ['meu1', 'meu2', 'alheio'] }),
    ).toBe('profissional');
  });

  it('valida os procedimentos dos itens do orçamento', async () => {
    rows.patient.p1 = CLINICA_A;
    rows.procedure.ok = CLINICA_A;
    rows.procedure.alheio = CLINICA_B;

    expect(
      await refOutsideTenant(CLINICA_A, { patientId: 'p1', procedureIds: ['ok', 'alheio'] }),
    ).toBe('procedimento');
  });

  it('ignora campos vazios, nulos e em branco', async () => {
    expect(
      await refOutsideTenant(CLINICA_A, {
        patientId: null,
        professionalId: '',
        procedureId: '   ',
        procedureIds: [undefined, null, ''],
        quoteId: undefined,
        categoryId: null,
      }),
    ).toBeNull();
    expect(chamadas).toHaveLength(0); // nada enviado, nenhuma consulta
  });

  it('não consulta modelos que a action não enviou', async () => {
    rows.patient.p1 = CLINICA_A;
    await refOutsideTenant(CLINICA_A, { patientId: 'p1' });
    expect(chamadas).toEqual(['patient']);
  });

  it('não conta duas vezes o mesmo id repetido', async () => {
    rows.procedure.proc1 = CLINICA_A;
    expect(
      await refOutsideTenant(CLINICA_A, { procedureIds: ['proc1', 'proc1', 'proc1'] }),
    ).toBeNull();
  });

  it('valida orçamento e categoria', async () => {
    rows.quote.q1 = CLINICA_B;
    expect(await refOutsideTenant(CLINICA_A, { quoteId: 'q1' })).toBe('orçamento');

    rows.procedureCategory.c1 = CLINICA_B;
    expect(await refOutsideTenant(CLINICA_A, { categoryId: 'c1' })).toBe('categoria');
  });
});

describe('refErrorMessage', () => {
  it('não revela se o id existe em outra clínica', async () => {
    rows.patient.existe_na_b = CLINICA_B;

    const alheio = await refOutsideTenant(CLINICA_A, { patientId: 'existe_na_b' });
    const inexistente = await refOutsideTenant(CLINICA_A, { patientId: 'nao_existe' });

    expect(alheio).toBe(inexistente);
    expect(refErrorMessage(alheio!)).toBe(refErrorMessage(inexistente!));
  });
});
