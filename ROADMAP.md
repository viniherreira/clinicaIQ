# ClinicaIQ — Roadmap

## Gestão da clínica (em produção)

- [x] Monorepo, schema, auth e onboarding da clínica
- [x] Pacientes: cadastro, ficha, prontuário (anamnese, evolução, odontograma, arquivos)
- [x] Agenda (dia/semana, arrastar e teclado, bloqueios)
- [x] Procedimentos
- [x] Orçamentos (PDF, contrato, recibo, link público)
- [x] WhatsApp por QR code (gateway próprio, outbox com reenvio)
- [x] Lembretes, aniversários e campanhas com consentimento separado
- [x] Retorno (recall de quem chamar de volta)
- [x] Financeiro e relatórios numa tela só
- [x] Equipe, perfis de acesso e auditoria
- [x] Planos e cobrança (Asaas), cortesia
- [x] Regressão E2E com login (agenda e orçamentos)

## CRM de captação

Funcionalidades e organização de tela inspiradas no Kommo; identidade do ClinicaIQ.

- [x] **Etapa 1 — leads, funil, tags e tarefas** (branch `feat/crm-etapa1`)
  - Seletor Clínica | CRM; funil editável no estilo Kommo; ficha do lead em duas metades
  - Tarefas com aviso "sem tarefa"; vários negócios por paciente
  - Conversão em paciente e "Agendar avaliação" direto na agenda
  - O card anda sozinho com a agenda e os orçamentos
- [x] **CRM como adicional pago** — R$ 39 por usuário/mês, 14 dias grátis, uma cobrança só (antes de publicar)
  - [ ] Publicar etapa 1 + adicional em produção (cópia de segurança, SQL revisado, banco antes do merge, clínica piloto)
- [ ] **Etapa 2 — API oficial do WhatsApp e caixa de entrada**
  - Cadastro incorporado da Meta (exige o ClinicaIQ como Tech Provider verificado — iniciar o processo cedo)
  - Conversas na ficha do lead; coluna "Entrada" para leads que chegam sozinhos
  - Anonimização do lead a pedido do titular
- [ ] **Etapa 3 — Transmissões** com templates aprovados pela Meta (substitui Campanhas para quem tem CRM)
- [ ] **Etapa 4 — Chatbot por botões** e automações por etapa
- ~~Etapa 5 — plano "só CRM"~~ (descartado: o CRM é adicional do sistema de agenda)

## Ideias para depois

- Campos personalizados e vários funis no CRM
- NPS / pesquisa de satisfação
- App mobile (PWA)
- Multi-unidades (uma conta, várias clínicas)
- Integração com convênios
- Fila de espera inteligente
