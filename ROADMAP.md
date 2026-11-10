# ClinicaIQ — Roadmap

## Gestão da clínica (em produção)

- [x] Monorepo, schema, auth e onboarding da clínica
- [x] Pacientes: cadastro, ficha, prontuário (anamnese, evolução, odontograma, arquivos)
- [x] Agenda (dia/semana, arrastar e teclado, bloqueios)
- [x] Procedimentos
- [x] Orçamentos (PDF, contrato, recibo, link público)
- [x] WhatsApp pela API oficial da Meta, com o número de cada clínica (o QR code saiu em 10/11/2026)
- [x] Lembretes com modelo aprovado e botões Confirmar/Reagendar
- [ ] Aniversários, campanhas da agenda e orçamento pelo WhatsApp oficial (precisam de modelo aprovado; pausados desde a saída do QR)
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
- [x] **Etapa 2 — Conversas do WhatsApp**
  - Tela Conversas (Todas/Minhas/Sem resposta/Entrada), aba Conversa na ficha do lead
  - Coluna Entrada no funil (aceitar, recusar, ligar a lead ou paciente)
  - Respostas rápidas com `/`; mensagens cifradas; envio com fila e reenvio pela API oficial
- [x] **Etapa 2b — API oficial do WhatsApp**
  - Cadastro incorporado da Meta com coexistência, conexão de teste, modelos (sincronizar e criar), janela de 24h, mídia recebida aberta no CRM
  - [x] Tech Provider e App Review aprovados pela Meta (10/11/2026)
  - [ ] Testar o cadastro com uma clínica que não é testadora do app
  - [x] Enviar arquivos (foto, documento, áudio, vídeo) pelo CRM; apagar os dados de uma pessoa a pedido dela (LGPD)
- [x] **Etapa 3 — Transmissões** (modelo aprovado na API oficial; agendar, cancelar, números)
- [x] **Etapa 4 — Robô por botões e automações por etapa**
- [x] **Painel do CRM** e visual no jeito do Kommo (menu escuro, funil, Conversas com o lead à direita)
- [x] **Relógio do CRM** pelo pg_cron do Supabase (a cada minuto) e pelo uso do CRM
- [x] **Cortesia inclui o CRM**, ligado e aberto a toda a equipe com perfil de CRM
- ~~Etapa 5 — plano "só CRM"~~ (descartado: o CRM é adicional do sistema de agenda)

## Ideias para depois

- Campos personalizados e vários funis no CRM
- NPS / pesquisa de satisfação
- App mobile (PWA)
- Multi-unidades (uma conta, várias clínicas)
- Integração com convênios
- Fila de espera inteligente
