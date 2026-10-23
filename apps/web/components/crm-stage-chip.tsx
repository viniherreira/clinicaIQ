import { colorClasses } from '@/crm/colors';

/**
 * A etapa do funil como selo, na cor da coluna do quadro: na lista e nas
 * conversas, bate o olho e já sabe onde o lead está. O nome vai escrito: a cor
 * só ajuda, nunca é a única pista.
 */
export function StageChip({ name, color, small = false }: { name: string; color: string; small?: boolean }) {
  return (
    <span
      className={`inline-flex max-w-full shrink-0 items-center gap-1.5 truncate rounded-full font-medium ${colorClasses(color).chip} ${
        small ? 'px-1.5 py-px text-[11px]' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${colorClasses(color).dot}`} aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  );
}
