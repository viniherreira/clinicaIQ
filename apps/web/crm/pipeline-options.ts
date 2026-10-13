import type { BoardPipeline } from './types';

/** O funil de uma etapa (para a ficha mostrar o funil em que o lead está). */
export function pipelineOfStage(pipelines: readonly BoardPipeline[], stageId: string): BoardPipeline | undefined {
  return pipelines.find((p) => p.columns.some((s) => s.id === stageId) || p.closed.won === stageId || p.closed.lost === stageId);
}

/**
 * Etapas abertas de todos os funis para listas de escolha (transmissão,
 * automação, robô). Com mais de um funil, o nome leva o funil na frente.
 */
export function stageOptions(pipelines: readonly BoardPipeline[]): { id: string; name: string }[] {
  const varios = pipelines.length > 1;
  return pipelines.flatMap((p) => p.columns.map((s) => ({ id: s.id, name: varios ? `${p.name} · ${s.name}` : s.name })));
}
