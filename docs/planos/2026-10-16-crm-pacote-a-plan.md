# Plano — CRM pacote A (dados e lista)

Spec: `docs/specs/2026-10-16-crm-pacote-a-dados-lista-design.md`.
Um commit por etapa; cada etapa termina com typecheck, lint e os testes dela.

1. **Campos personalizados — base.** Schema (`LeadField`, `Lead.fields`, `FIELD_CHANGED`), `crm/custom-fields.ts` + testes, cadastro (`crm/fields-admin.ts`), aba **Campos** nas Configurações do CRM, `db push` local.
2. **Campos nas telas.** Seção Campos no `LeadPanel` (salvar com histórico), card do funil (`showOnCard`), Novo lead, filtros (`campo_<id>` em `crm/filters.ts` e `leadWhere`), robô `saveTo: 'field:<id>'`.
3. **Lista.** Colunas (cookie `crm-colunas`), ordenar pelo cabeçalho, páginas de 100 com total.
4. **Ações em massa.** `crm/bulk.ts` (testes de banco), action, seleção na lista e barra de ações.
5. **Exportar.** `crm/csv.ts` + testes, rota `crm/leads/exportar`, auditoria.
6. **Importar.** `read-excel-file`, `crm/import-map.ts` + testes, `crm/import.ts` (testes de banco), tela em passos.
7. **Conversas.** Painel do lead a partir de `lg` e gaveta nas menores, tags no topo, Entrada com "Criar lead/Recusar", tags na lista e filtro por tag.
8. **Fechamento.** SQL de produção (`docs/producao/2026-10-16-crm-campos.sql`) rodado antes do merge, E2E + axe, GUIA-DO-PROJETO.md, fotos.
