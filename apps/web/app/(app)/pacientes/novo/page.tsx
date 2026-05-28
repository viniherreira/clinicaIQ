import { PatientForm } from '../_components/patient-form';

export const metadata = { title: 'Novo Paciente' };

export default function NewPatientPage() {
  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Novo paciente</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Preencha os dados do paciente para cadastrá-lo</p>
      </header>
      <PatientForm />
    </div>
  );
}
