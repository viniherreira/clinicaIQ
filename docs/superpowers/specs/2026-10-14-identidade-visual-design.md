# Identidade visual nova do DreamClin

Data: 2026-10-14
Status: aprovado pelo Thiago (botões em teal escuro, títulos em marinho, PDF com destaque marinho)

O manual de marca troca o azul-saúde e o dente por um "D" teal com uma pessoa
estilizada e uma estrela. Paleta do manual: teal #14B8A6, azul-marinho #0F3B82,
verde-menta #A7E3C1 e branco quente #FAFAF8. Fonte: Inter.

## Decisões

- **O teal do manual não vai em texto nem em botão.** Sobre branco ele dá 2,49:1,
  abaixo do mínimo do WCAG AA (4,5:1). Fica na logo, nos ícones e em superfícies
  sem texto. Logotipo é isento de contraste no WCAG (1.4.3 e 1.4.11).
- **Botão e texto primário no claro: teal 700 #0F766E** (5,47:1 com branco), hover
  #115E59 (7,58:1).
- **Títulos e texto em marinho.** O texto do app é um marinho bem escuro tirado do
  #0F3B82; o marinho da marca fica nos títulos da landing (10,21:1 sobre #FAFAF8).
- **Fundo em branco quente** #FAFAF8, com cinzas neutros quentes no lugar dos
  cinzas azulados.
- **Menta** substitui o laranja de destaque (`--accent`), sempre com texto marinho
  por cima (7,32:1). Menta não vai como texto sobre branco.
- **Tema escuro:** teal 400 #2DD4BF para link e botão, com texto quase preto
  esverdeado no botão (9,18:1).
- **CRM azul-marinho** (`.dark.crm-navy`): o marinho passa a sair do #0F3B82 (matiz
  217) em vez do azul-petróleo de antes. Link em teal 300 #5EEAD4 (10,15:1 sobre o
  card), botão teal 400 com texto escuro.
- **Alto contraste:** teal #005F59 no claro (7,55:1) e #5EEAD4 sobre preto no
  escuro (14,2:1).
- **Degradê da marca:** do teal 700 ao marinho, texto branco acima de 5,4:1 nos
  dois lados.
- **Fonte:** Inter pelo `next/font/google`, no app, no site e no login do Clerk.
- **PDF:** o documento é da clínica e continua sem marca DreamClin; só o destaque
  muda para o marinho #0F3B82.
- **Logo redesenhada em SVG, aprovada pelo Thiago.** Os arquivos do manual eram
  recortes de 399×231 px, pequenos demais para os ícones. O símbolo foi ajustado
  ponto a ponto contra o recorte vertical, o de maior resolução: o D e o corpo
  coincidem 99%, a cabeça 98% e a estrela 95%. O nome "Dreamclin" é a Outfit
  700 (licença OFL) em contorno; das fontes testadas, é a que mais coincide com
  a logo do manual. O desenho fica em `components/logo-paths.ts`.
- **Logo no app:** colorida no tema claro; branca (a versão clara do manual) no
  escuro, no CRM e sobre o degradê.
- **Ícones:** quadrado teal com o símbolo branco. No favicon o símbolo ocupa 68%
  da largura, para ler em 16 px; nos ícones de app, 55%, como no manual.
  Arquivos para uso fora do app em `public/brand/`.
- **E-mails:** não há template no código. Os do Clerk e do Asaas se configuram nos
  painéis deles.

## Conferência

- `lib/theme-contrast.test.ts` lê os tokens do `globals.css` e confere os pares
  usados (texto, botão, link) em cada tema: claro, escuro, alto contraste e CRM.
- `components/logo-paths.test.ts` confere que o favicon e os arquivos de
  `public/brand/` usam o mesmo desenho do código.
- axe (WCAG 2.1 AA) sem violações na landing, no painel do login, nos menus da
  gestão e do CRM e nos termos, nos temas claro e escuro (e, nos menus e nos
  termos, também no alto contraste e no CRM marinho). Feito com o servidor de
  desenvolvimento sem banco nem Clerk, então a seção de planos e as telas com
  dados ficam para os testes E2E.
