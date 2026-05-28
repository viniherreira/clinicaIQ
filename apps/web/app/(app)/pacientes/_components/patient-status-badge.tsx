export function PatientStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
      }`}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  );
}
