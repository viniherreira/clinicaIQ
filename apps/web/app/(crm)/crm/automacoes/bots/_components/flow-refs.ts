/** O que o editor de robôs precisa da clínica para as listas de escolha. */
export interface FlowRefs {
  stages: { id: string; name: string }[];
  tags: { id: string; name: string; color: string }[];
  team: { id: string; name: string }[];
  fields: { id: string; name: string }[];
  /** Os outros robôs (para "Iniciar outro robô"). */
  bots: { id: string; name: string }[];
}
