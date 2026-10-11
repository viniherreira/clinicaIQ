import type { KeyboardCoordinateGetter } from '@dnd-kit/core';

/**
 * Para onde vai o card a cada tecla, quando arrastado pelo teclado.
 *
 * O padrão do dnd-kit anda 25 px por tecla — num quadro de colunas largas,
 * isso são dez toques para sair do lugar. Aqui cada seta é um passo que faz
 * sentido: ← → pulam para a etapa vizinha, ↑ ↓ passam por cima do card de
 * cima ou de baixo na mesma etapa.
 */
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (!KEYS.includes(event.code)) return undefined;
  event.preventDefault();

  const { active, over, droppableRects, droppableContainers, collisionRect } = context;
  if (!active || !collisionRect) return currentCoordinates;

  const lead = active.data.current?.lead as { id: string; stageId: string } | undefined;
  const stageAtual = (over?.data.current?.stageId as string | undefined) ?? lead?.stageId;

  const colunas = droppableContainers
    .getEnabled()
    .filter((c) => String(c.id).startsWith('col:'))
    .map((c) => ({ stageId: c.data.current?.stageId as string, rect: droppableRects.get(c.id) }))
    .filter((c): c is { stageId: string; rect: NonNullable<typeof c.rect> } => Boolean(c.rect))
    .sort((a, b) => a.rect.left - b.rect.left);
  const i = colunas.findIndex((c) => c.stageId === stageAtual);

  if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
    const alvo = colunas[i + (event.code === 'ArrowRight' ? 1 : -1)];
    if (!alvo) return currentCoordinates;
    // Topo da coluna de destino: o card entra em primeiro lugar.
    return { x: alvo.rect.left + 8, y: alvo.rect.top + 8 };
  }

  const cards = droppableContainers
    .getEnabled()
    .filter((c) => String(c.id).startsWith('card:') && c.data.current?.stageId === stageAtual && c.data.current?.leadId !== lead?.id)
    .map((c) => droppableRects.get(c.id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .sort((a, b) => a.top - b.top);

  const meio = collisionRect.top + collisionRect.height / 2;
  if (event.code === 'ArrowDown') {
    const prox = cards.find((r) => r.top + r.height / 2 > meio + 1);
    return prox ? { x: prox.left, y: prox.top + prox.height / 2 } : currentCoordinates;
  }
  const ant = [...cards].reverse().find((r) => r.top + r.height / 2 < meio - 1);
  return ant ? { x: ant.left, y: ant.top - collisionRect.height / 2 + 4 } : currentCoordinates;
};
