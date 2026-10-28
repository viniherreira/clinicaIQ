export function PatientStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        active
          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
          : 'bg-surface-alt text-muted-foreground'
      }`}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  );
}
