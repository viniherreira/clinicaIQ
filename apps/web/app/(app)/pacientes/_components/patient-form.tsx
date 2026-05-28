'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createPatient, updatePatient } from '../actions';
import type { PatientFormState } from '../actions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function maskCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, e) =>
    e ? `${a}.${b}.${c}-${e}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a,
  );
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, (_, a, b, c) => c ? `(${a}) ${b}-${c}` : b ? `(${a}) ${b}` : a ? `(${a}` : '');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, a, b, c) => c ? `(${a}) ${b}-${c}` : `(${a}) ${b}`);
}

function maskCep(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.replace(/(\d{5})(\d{0,3})/, (_, a, b) => b ? `${a}-${b}` : a);
}

function calcAge(birthDate: string) {
  if (!birthDate) return '';
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? `${age} anos` : '';
}

// ─── Field component ─────────────────────────────────────────────────────────

function Field({
  id, label, required, error, children,
}: {
  id: string; label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Input({ id, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { id: string; error?: string }) {
  return (
    <input
      id={id}
      aria-describedby={error ? `${id}-error` : undefined}
      aria-invalid={error ? true : undefined}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      {...props}
    />
  );
}

function Select({ id, error, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { id: string; error?: string }) {
  return (
    <select
      id={id}
      aria-describedby={error ? `${id}-error` : undefined}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      {...props}
    >
      {children}
    </select>
  );
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-lg"
        aria-expanded={open}
      >
        {title}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="border-t border-border p-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>}
    </div>
  );
}

// ─── PatientForm ──────────────────────────────────────────────────────────────

export type PatientFormData = {
  id?: string;
  name?: string;
  nickname?: string;
  cpf?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  birthDate?: string;
  gender?: string;
  maritalStatus?: string;
  profession?: string;
  referredBy?: string;
  notes?: string;
  zipCode?: string;
  street?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  lgpdConsentAt?: Date | null;
};

export function PatientForm({ patient }: { patient?: PatientFormData }) {
  const router = useRouter();
  const isEdit = Boolean(patient?.id);
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const [cpf, setCpf] = useState(patient?.cpf ?? '');
  const [phone, setPhone] = useState(patient?.phone ? maskPhone(patient.phone) : '');
  const [phone2, setPhone2] = useState(patient?.phone2 ? maskPhone(patient.phone2) : '');
  const [cep, setCep] = useState(patient?.zipCode ?? '');
  const [birthDate, setBirthDate] = useState(patient?.birthDate ?? '');

  const streetRef = useRef<HTMLInputElement>(null);
  const neighborhoodRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLSelectElement>(null);

  async function fetchCep(raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) return;
      if (streetRef.current) streetRef.current.value = data.logradouro ?? '';
      if (neighborhoodRef.current) neighborhoodRef.current.value = data.bairro ?? '';
      if (cityRef.current) cityRef.current.value = data.localidade ?? '';
      if (stateRef.current) stateRef.current.value = data.uf ?? '';
    } catch {}
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setServerError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        let result: PatientFormState;
        if (isEdit && patient?.id) {
          result = await updatePatient(patient.id, null, formData);
        } else {
          result = await createPatient(null, formData);
        }

        if (result.success) {
          window.location.href = `/pacientes/${result.patientId}`;
        } else {
          setErrors(result.errors);
          if (result.message) setServerError(result.message);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch {
        setServerError('Ocorreu um erro inesperado. Tente novamente.');
      }
    });
  }

  const err = (field: string) => errors[field]?.[0];

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {serverError && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      {/* Dados principais */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Dados principais</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="name" label="Nome completo" required error={err('name')}>
              <Input id="name" name="name" type="text" required autoFocus defaultValue={patient?.name} error={err('name')} placeholder="Nome completo do paciente" />
            </Field>
          </div>
          <Field id="cpf" label="CPF" error={err('cpf')}>
            <Input id="cpf" name="cpf" type="text" inputMode="numeric" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} error={err('cpf')} placeholder="000.000.000-00" />
          </Field>
          <Field id="birthDate" label="Data de nascimento" required error={err('birthDate')}>
            <div className="flex items-center gap-2">
              <Input id="birthDate" name="birthDate" type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} error={err('birthDate')} className="flex-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
              {birthDate && <span className="shrink-0 text-xs text-muted-foreground">{calcAge(birthDate)}</span>}
            </div>
          </Field>
          <Field id="phone" label="Telefone principal" required error={err('phone')}>
            <Input id="phone" name="phone" type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} error={err('phone')} placeholder="(11) 99999-9999" />
          </Field>
        </div>
      </div>

      {/* Contato */}
      <Section title="Contato">
        <Field id="phone2" label="Telefone secundário / WhatsApp" error={err('phone2')}>
          <Input id="phone2" name="phone2" type="tel" inputMode="tel" value={phone2} onChange={(e) => setPhone2(maskPhone(e.target.value))} error={err('phone2')} placeholder="(11) 99999-9999" />
        </Field>
        <Field id="email" label="E-mail" error={err('email')}>
          <Input id="email" name="email" type="email" defaultValue={patient?.email ?? ''} error={err('email')} placeholder="paciente@email.com" />
        </Field>
        <Field id="nickname" label="Como prefere ser chamado" error={err('nickname')}>
          <Input id="nickname" name="nickname" type="text" defaultValue={patient?.nickname ?? ''} error={err('nickname')} placeholder="Apelido ou nome preferido" />
        </Field>
      </Section>

      {/* Endereço */}
      <Section title="Endereço">
        <Field id="zipCode" label="CEP" error={err('zipCode')}>
          <Input
            id="zipCode" name="zipCode" type="text" inputMode="numeric"
            value={cep}
            onChange={(e) => setCep(maskCep(e.target.value))}
            onBlur={(e) => fetchCep(e.target.value)}
            error={err('zipCode')}
            placeholder="00000-000"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field id="street" label="Rua / Logradouro" error={err('street')}>
            <input ref={streetRef} id="street" name="street" type="text" defaultValue={patient?.street ?? ''} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" placeholder="Nome da rua" />
          </Field>
        </div>
        <Field id="addressNumber" label="Número" error={err('addressNumber')}>
          <Input id="addressNumber" name="addressNumber" type="text" defaultValue={patient?.addressNumber ?? ''} error={err('addressNumber')} placeholder="123" />
        </Field>
        <Field id="complement" label="Complemento" error={err('complement')}>
          <Input id="complement" name="complement" type="text" defaultValue={patient?.complement ?? ''} error={err('complement')} placeholder="Apto, bloco..." />
        </Field>
        <Field id="neighborhood" label="Bairro" error={err('neighborhood')}>
          <input ref={neighborhoodRef} id="neighborhood" name="neighborhood" type="text" defaultValue={patient?.neighborhood ?? ''} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" placeholder="Bairro" />
        </Field>
        <Field id="city" label="Cidade" error={err('city')}>
          <input ref={cityRef} id="city" name="city" type="text" defaultValue={patient?.city ?? ''} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" placeholder="Cidade" />
        </Field>
        <Field id="state" label="Estado" error={err('state')}>
          <select ref={stateRef} id="state" name="state" defaultValue={patient?.state ?? ''} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <option value="">Selecione</option>
            {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </Field>
      </Section>

      {/* Informações adicionais */}
      <Section title="Informações adicionais">
        <Field id="gender" label="Gênero" error={err('gender')}>
          <Select id="gender" name="gender" defaultValue={patient?.gender ?? ''} error={err('gender')}>
            <option value="">Selecione</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
            <option value="O">Outro</option>
            <option value="N">Prefiro não informar</option>
          </Select>
        </Field>
        <Field id="maritalStatus" label="Estado civil" error={err('maritalStatus')}>
          <Select id="maritalStatus" name="maritalStatus" defaultValue={patient?.maritalStatus ?? ''} error={err('maritalStatus')}>
            <option value="">Selecione</option>
            <option value="solteiro">Solteiro(a)</option>
            <option value="casado">Casado(a)</option>
            <option value="divorciado">Divorciado(a)</option>
            <option value="viuvo">Viúvo(a)</option>
            <option value="uniao">União estável</option>
          </Select>
        </Field>
        <Field id="profession" label="Profissão" error={err('profession')}>
          <Input id="profession" name="profession" type="text" defaultValue={patient?.profession ?? ''} error={err('profession')} placeholder="Profissão" />
        </Field>
        <Field id="referredBy" label="Indicado por" error={err('referredBy')}>
          <Input id="referredBy" name="referredBy" type="text" defaultValue={patient?.referredBy ?? ''} error={err('referredBy')} placeholder="Nome de quem indicou" />
        </Field>
        <div className="sm:col-span-2">
          <Field id="notes" label="Observações gerais" error={err('notes')}>
            <textarea
              id="notes" name="notes" rows={3}
              defaultValue={patient?.notes ?? ''}
              aria-describedby={err('notes') ? 'notes-error' : undefined}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring resize-none"
              placeholder="Informações adicionais sobre o paciente"
            />
          </Field>
        </div>
      </Section>

      {/* LGPD */}
      {!isEdit && (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-semibold">Consentimento LGPD</h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="lgpdConsent"
              value="1"
              required
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <span className="text-sm text-muted-foreground">
              O paciente autoriza o armazenamento e uso dos seus dados pessoais conforme a{' '}
              <strong className="text-foreground">Lei Geral de Proteção de Dados (LGPD)</strong>.
              A data e hora do aceite serão registradas automaticamente.
            </span>
          </label>
          {err('lgpdConsent') && (
            <p role="alert" className="mt-1 text-xs text-destructive">{err('lgpdConsent')}</p>
          )}
        </div>
      )}

      {isEdit && patient?.lgpdConsentAt && (
        <p className="text-xs text-muted-foreground px-1">
          Consentimento LGPD registrado em {new Date(patient.lgpdConsentAt).toLocaleString('pt-BR')}
        </p>
      )}

      {/* Ações */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="touch-target inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {isPending && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Cadastrar paciente'}
        </button>
      </div>
    </form>
  );
}
