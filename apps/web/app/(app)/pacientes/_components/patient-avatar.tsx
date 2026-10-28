// Texto 800 sobre fundo 100 (claro) e 200 sobre 900 (escuro): passa de 4,5:1.
const COLORS = [
  'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200',
];

function colorIndex(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % COLORS.length;
}

export function PatientAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  const sizeClass =
    size === 'sm'
      ? 'h-7 w-7 text-xs'
      : size === 'lg'
        ? 'h-12 w-12 text-base'
        : size === 'xl'
          ? 'h-16 w-16 text-xl sm:h-20 sm:w-20 sm:text-2xl'
          : 'h-9 w-9 text-sm';

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${sizeClass} ${COLORS[colorIndex(name)]}`}
    >
      {initials}
    </span>
  );
}
