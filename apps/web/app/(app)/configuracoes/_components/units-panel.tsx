'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, MapPin, Pencil, Phone, Plus } from 'lucide-react';
import { saveUnit, type UnitRow } from '../unit-actions';

type Hours = { open: boolean; start: string; end: string }[];

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const inputCls =
  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const timeCls =
  'rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const novaUnidade = (): UnitRow => ({
  id: '',
  name: '',
  phone: null,
  email: null,
  zipCode: null,
  street: null,
  addressNumber: null,
  complement: null,
  neighborhood: null,
  city: null,
  state: null,
  address: null,
  businessHours: null,
  active: true,
  main: false,
  upcoming: 0,
});

/**
 * Unidades (filiais), como no Clínica nas Nuvens: a mesma conta, os mesmos
 * pacientes; cada unidade com endereço, telefone, horário e agenda próprios.
 */
export function UnitsPanel({ units, clinicHours }: { units: UnitRow[]; clinicHours: Hours }) {
  const router = useRouter();
  const [editando, setEditando] = useState<UnitRow | null>(null);
  const [aviso, setAviso] = useState('');
  const ativas = units.filter((u) => u.active).length;

  return (
    <section aria-labelledby="units-heading" className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="max-w-xl">
          <h2 id="units-heading" className="text-base font-semibold">Unidades</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Tem mais de uma clínica? Cadastre cada uma como unidade. Pacientes, orçamentos, financeiro e CRM são os mesmos; cada unidade tem
            endereço, horário e agenda próprios. {ativas > 1 ? 'Troque a unidade no topo da tela.' : 'Com duas ou mais, aparece a escolha da unidade no topo da tela.'}
          </p>
        </div>
        {!editando && (
          <button type="button" onClick={() => setEditando(novaUnidade())} className="btn-primary btn-md">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nova unidade
          </button>
        )}
      </div>

      {editando && (
        <UnitForm
          key={editando.id || 'nova'}
          unit={editando}
          clinicHours={clinicHours}
          onCancel={() => setEditando(null)}
          onSaved={(msg) => {
            setEditando(null);
            setAviso(msg);
            router.refresh();
          }}
        />
      )}

      <ul className="divide-y divide-border">
        {units.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
              <Building2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {u.name}
                {u.main && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Principal</span>}
                {!u.active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Desativada</span>}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {u.address ?? 'Sem endereço'}
                </span>
                {u.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {u.phone}
                  </span>
                )}
                <span>{u.businessHours ? 'Horário próprio' : 'Horário da clínica'}</span>
                <span>
                  {u.upcoming} {u.upcoming === 1 ? 'agendamento marcado' : 'agendamentos marcados'}
                </span>
              </p>
            </div>
            <button type="button" onClick={() => setEditando(u)} className="btn-outline btn-sm">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar<span className="sr-only"> {u.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="px-5 pb-4 text-sm text-muted-foreground empty:hidden">
        {aviso}
      </p>
    </section>
  );
}

function UnitForm({
  unit,
  clinicHours,
  onCancel,
  onSaved,
}: {
  unit: UnitRow;
  clinicHours: Hours;
  onCancel: () => void;
  onSaved: (msg: string) => void;
}) {
  const id = useId();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  const [proprio, setProprio] = useState(Boolean(unit.businessHours));
  const [horas, setHoras] = useState<Hours>(unit.businessHours ?? clinicHours);
  const [ativa, setAtiva] = useState(unit.active);
  const f = (k: keyof UnitRow) => (unit[k] as string | null) ?? '';

  return (
    <form
      aria-label={unit.id ? `Editar a unidade ${unit.name}` : 'Nova unidade'}
      className="space-y-4 border-b border-border bg-surface-alt/40 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const v = (k: string) => String(fd.get(k) ?? '');
        setErro('');
        start(async () => {
          const r = await saveUnit({
            id: unit.id || undefined,
            name: v('name'),
            phone: v('phone'),
            email: v('email'),
            zipCode: v('zipCode'),
            street: v('street'),
            addressNumber: v('addressNumber'),
            complement: v('complement'),
            neighborhood: v('neighborhood'),
            city: v('city'),
            state: v('state'),
            businessHours: proprio ? horas : null,
            active: ativa,
          });
          if (r.ok) onSaved(unit.id ? 'Unidade salva.' : 'Unidade criada.');
          else setErro(r.message);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            Nome da unidade <span className="text-destructive">*</span>
          </label>
          <input id={`${id}-name`} name="name" defaultValue={f('name')} required maxLength={60} placeholder="Ex.: Centro" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-phone`} className="text-sm font-medium">Telefone</label>
          <input id={`${id}-phone`} name="phone" defaultValue={f('phone')} placeholder="(11) 99999-9999" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-email`} className="text-sm font-medium">E-mail</label>
          <input id={`${id}-email`} name="email" type="email" defaultValue={f('email')} className={inputCls} />
        </div>
      </div>

      <fieldset className="space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Endereço</legend>
        <p className="text-xs text-muted-foreground">Vai nas mensagens de confirmação e no agendamento online desta unidade.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-cep`} className="text-sm font-medium">CEP</label>
            <input id={`${id}-cep`} name="zipCode" defaultValue={f('zipCode')} placeholder="00000-000" inputMode="numeric" className={inputCls} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={`${id}-street`} className="text-sm font-medium">Rua</label>
            <input id={`${id}-street`} name="street" defaultValue={f('street')} className={inputCls} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-number`} className="text-sm font-medium">Número</label>
            <input id={`${id}-number`} name="addressNumber" defaultValue={f('addressNumber')} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-complement`} className="text-sm font-medium">Complemento</label>
            <input id={`${id}-complement`} name="complement" defaultValue={f('complement')} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-neighborhood`} className="text-sm font-medium">Bairro</label>
            <input id={`${id}-neighborhood`} name="neighborhood" defaultValue={f('neighborhood')} className={inputCls} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={`${id}-city`} className="text-sm font-medium">Cidade</label>
            <input id={`${id}-city`} name="city" defaultValue={f('city')} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-state`} className="text-sm font-medium">UF</label>
            <input id={`${id}-state`} name="state" defaultValue={f('state')} maxLength={2} placeholder="SP" className={`${inputCls} uppercase`} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Horário de funcionamento</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={proprio} onChange={(e) => setProprio(e.target.checked)} className="h-4 w-4 accent-primary" />
          Esta unidade tem horário próprio
        </label>
        <p className="text-xs text-muted-foreground">
          {proprio
            ? 'Vale para quem não tem horário de atendimento cadastrado e para o agendamento online desta unidade.'
            : 'Usa o horário de funcionamento da clínica (Agenda → Horário de funcionamento).'}
        </p>
        {proprio && (
          <div className="divide-y divide-border">
            {ORDEM.map((dow) => {
              const d = horas[dow];
              const muda = (patch: Partial<Hours[number]>) => setHoras(horas.map((x, i) => (i === dow ? { ...x, ...patch } : x)));
              return (
                <div key={dow} className="flex flex-wrap items-center gap-3 py-2">
                  <label className="flex w-28 items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={d.open} onChange={(e) => muda({ open: e.target.checked })} className="h-4 w-4 accent-primary" />
                    {DIAS[dow]}
                  </label>
                  {d.open ? (
                    <span className="flex items-center gap-1.5">
                      <input type="time" value={d.start} onChange={(e) => muda({ start: e.target.value })} aria-label={`${DIAS[dow]} — abre`} className={timeCls} />
                      <span className="text-xs text-muted-foreground">às</span>
                      <input type="time" value={d.end} onChange={(e) => muda({ end: e.target.value })} aria-label={`${DIAS[dow]} — fecha`} className={timeCls} />
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Fechado</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </fieldset>

      {!unit.main && unit.id && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="h-4 w-4 accent-primary" />
          Unidade ativa
          <span className="text-xs text-muted-foreground">(desativada some da agenda e do agendamento online; o histórico fica)</span>
        </label>
      )}

      {erro && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary btn-md">
          {pending ? 'Salvando…' : unit.id ? 'Salvar unidade' : 'Criar unidade'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost btn-md">
          Cancelar
        </button>
      </div>
    </form>
  );
}
