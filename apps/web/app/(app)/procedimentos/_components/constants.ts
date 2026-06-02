// 12 cores pré-definidas para o color picker de procedimentos.
export const PROCEDURE_COLORS = [
  '#EF4444', // vermelho
  '#F97316', // laranja
  '#F59E0B', // âmbar
  '#EAB308', // amarelo
  '#84CC16', // lima
  '#10B981', // esmeralda
  '#06B6D4', // ciano
  '#3B82F6', // azul
  '#6366F1', // índigo
  '#8B5CF6', // violeta
  '#EC4899', // rosa
  '#64748B', // ardósia
] as const;

// Atalhos rápidos de duração (minutos).
export const DURATION_SHORTCUTS = [15, 30, 45, 60, 90, 120] as const;

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}
