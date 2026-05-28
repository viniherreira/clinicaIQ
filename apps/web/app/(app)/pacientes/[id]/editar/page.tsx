import { notFound } from 'next/navigation';
import { getPatient } from '../../actions';
import { PatientForm } from '../../_components/patient-form';

export const metadata = { title: 'Editar Paciente' };

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const formData = {
    id: patient.id,
    name: patient.name,
    nickname: patient.nickname ?? '',
    cpf: patient.cpf,
    phone: patient.phone,
    phone2: patient.phone2,
    email: patient.email ?? '',
    birthDate: patient.birthDate ? patient.birthDate.toISOString().split('T')[0] : '',
    gender: patient.gender ?? '',
    maritalStatus: patient.maritalStatus ?? '',
    profession: patient.profession ?? '',
    referredBy: patient.referredBy ?? '',
    notes: patient.notes ?? '',
    zipCode: patient.zipCode ?? '',
    street: patient.street ?? '',
    addressNumber: patient.addressNumber ?? '',
    complement: patient.complement ?? '',
    neighborhood: patient.neighborhood ?? '',
    city: patient.city ?? '',
    state: patient.state ?? '',
    lgpdConsentAt: patient.lgpdConsentAt,
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Editar paciente</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{patient.name}</p>
      </header>
      <PatientForm patient={formData} />
    </div>
  );
}
