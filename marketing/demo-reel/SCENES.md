# Como fazer uma cena do reel

O vídeo é uma página HTML de 1080×1920 que se desenha para qualquer instante
`t`. O Playwright chama `R.render(t)` quadro a quadro (60 fps) e o ffmpeg junta.
**Tudo tem que ser função do tempo**: nada de `transition`/`animation` CSS,
`setTimeout`, `requestAnimationFrame`, `Math.random()` ou `Date`. O mesmo `t`
precisa dar sempre o mesmo quadro. Para aleatório use `R.hash(n)` / `R.noise(x, seed)`.

## Arquivos

- `src/engine.js` — motor (`R`): curvas, molas, keyframes, DOM, texto, números, SVG.
- `src/brand.js` — marca e peças desenhadas (`B`): cores, logo em partes, ícones, cartão, chip, avatar, celular, toque, fundo vivo, estrelinhas, transições.
- `src/timeline.js` — janela de cada cena (`start`, `end`, `pre`, `post`). **Não edite**.
- `src/scenes/<id>.js` — uma cena por arquivo. **Só edite o seu.**
- `src/scenes/logo.js` — cena de exemplo pronta (leia antes de começar).
- `tools/stills.mjs` — renderiza quadros soltos de uma cena para você conferir.

## Esqueleto

```js
(() => {
  const { h } = R; const E = R.ease; const C = B.C;
  R.scene({
    id: 'agenda',                       // igual à chave no TIMELINE
    build(root, S) {                     // monta o DOM uma vez
      // ... cria elementos, guarda em S (S.dur = duração da cena)
    },
    update(lt, t, S) {                   // lt = tempo local (0 = início da cena)
      // ... posiciona tudo para o instante lt
    },
  });
})();
```

A cena aparece de `start - pre` até `end + post` (o `lt` pode ser negativo no
`pre`). As cenas vizinhas se sobrepõem nas transições: quem vem depois fica por
cima. Para entrar com transição, aplique uma máscara no seu `root`, por exemplo
`B.starWipe(root, R.p(lt, -0.1, 0.6, E.swift), 540, 960)` (a estrela da marca
crescendo), `B.circleWipe` ou `B.riseWipe`. Para sair, você pode empurrar,
escalar ou desfocar o seu conteúdo nos últimos décimos.

## API mais usada

- `R.p(t, start, dur, ease)` → 0..1 com curva. Curvas: `E.snappy` (padrão, sai rápido e assenta), `E.swift` (câmera/transição), `E.smooth`, `E.outBack`, `E.outExpo`, `E.inCubic` (saídas)...
- `R.sp(t, start, R.springs.snappy|bouncy|gentle|wobbly|stiff)` → mola 0→1 (passa de 1 e volta).
- `R.kf(t, [[0, 0], [0.5, 120, E.snappy], [1.2, 80]])` → keyframes (número ou array).
- `R.window(t, a, b, inDur, outDur)` → entra em `a`, sai em `b`.
- `R.tf(el, {x, y, s, sx, sy, r, rx, ry, persp, o, blur})` → transform + opacidade + blur.
- `R.h(tag, props, ...filhos)` / `R.s(tag, attrs, ...filhos)` → DOM/SVG.
- `R.split(el, 'Texto', {by: 'word'|'char'})` + `R.reveal(parts, lt, {start, stagger, dur, y: 110, out: {start, y: -110}})` → texto que sobe de uma máscara.
- `R.type(el, texto, lt, start, cps)` → datilografia.
- `R.count(lt, start, dur, de, até)` + `R.brl(n)` / `R.int(n)` → contadores em reais.
- `R.draw(pathEl, k)` → desenha o traço de um path (0..1).
- `B.icon('calendar-days', {size, color, sw})` → ícone lucide (mesmo conjunto do app; nomes em kebab-case, ex.: `check`, `clock`, `user`, `message-circle`, `file-text`, `credit-card`, `banknote`, `qr-code`, `receipt`, `wallet`, `trending-up`, `shield-check`, `lock`, `bell`, `send`, `sparkles`, `stethoscope`, `chart-column`, `building-2`, `landmark`, `smartphone`, `circle-check`).
- `B.card({w, h, r, shadow: 'sm'|'md'|'lg'|'xl', bg}, ...filhos)` → cartão branco absoluto.
- `B.chip(texto, {bg, fg, icon, size, dot})`, `B.avatar('MC', {size, bg, fg})`, `B.text(texto, {size, weight, color})`, `B.headline(texto, {size, color, width})` → `{el, parts}`.
- `B.phone({w: 620})` → `{el, screen, w, h, statusH}` (celular desenhado; ponha o conteúdo em `screen`).
- `B.tap()` → `{el, update(lt, at, x, y)}` (dedo tocando: bolinha + onda).
- `B.mesh({base, blobs: [{x, y, r, color}]})` → fundo com manchas de luz que derivam; chame `mesh.update(t)`.
- `B.dots()` → grade de pontos de fundo. `B.sparkles({n, area, color})` → estrelinhas piscando (`update(t, k)`).
- `B.symbol({size, variant})` / `B.wordmark({width, variant})` → logo em partes animáveis. `B.star({size, color, glow})` → estrela da marca.
- `B.abs(el, x, y, w, h)` → posiciona absoluto.

## Marca

- Cores: teal `#14B8A6` (logo, ícones, superfícies **sem texto**), teal 700 `#0F766E` (texto/botão sobre claro), marinho `#0F3B82` (títulos, fundos fortes), menta `#A7E3C1` (destaque, sempre com texto marinho), branco quente `#FAFAF8` (fundo), texto principal `B.C.ink` `#0B1F3F`. Degradê da marca: `B.GRADIENT` (teal 700 → marinho). Sobre escuro: teal 400 `#2DD4BF` / teal 300 `#5EEAD4`.
- Fontes: `B.DISPLAY` ("Inter Display") para títulos (800, letter-spacing -0.04em), `B.FONT` ("Inter") para interface. Números com `font-feature-settings: "tnum"`.
- Situações da agenda (mesmas cores do app): `B.C.scheduled`, `confirmed`, `arrived`, `inProgress`, `attended` (cada uma tem `bg`, `fg`, `dot`). Rótulos: Agendado, Confirmado, Na sala de espera, Em atendimento, Atendido.
- Botões da confirmação no WhatsApp: **"Confirmar"** e **"Reagendar"** (o paciente toca; nunca "responda 1 ou 2"). Verde de conversa `B.C.whatsapp`, balão `B.C.waBubble`, fundo `B.C.waBg`. Não desenhe a logo do WhatsApp.
- Clínica fictícia: **Clínica Aurora**. Paciente principal: **Mariana Costa** (avatar "MC", menta). Outros pacientes: Carlos Lima, Pedro Alves, Juliana Reis, Ana Souza. Profissionais: **Dra. Paula**, **Dr. Rafael**, **Dra. Lia**. A consulta da Mariana é **terça, 14:30, Avaliação, com a Dra. Paula**.
- **Nenhum valor em dinheiro na tela** (nada de "R$", preços, totais, parcelas com valor). Onde um valor apareceria, use barras/esqueleto, ícones ou só o rótulo. Parcelas podem aparecer como "até 12x", "6x" (sem valor).

## Sincronia, trilho e passagens

- `TIMELINE.vo` traz cada fala da narração (início/fim, tempo global) e `TIMELINE.events` os momentos-chave. Sincronize o visual com eles (tempo local = global − início da cena).
- **Trilho do dia da paciente** (`src/rail.js`, camada global): de 6,5 s a 22,5 s ocupa o topo, **y 222–354**. Nessas cenas não ponha nada importante acima de y = 370; títulos cinéticos vão na faixa y 380–480 e o objeto principal de y 500 a 1560.
- **Peças de passagem** (`B.handoff`, em `src/brand.js`): a cena que sai termina com a peça exatamente na geometria indicada (sem transform, sobre o fundo combinado) e a que entra começa igual. Assim o corte é contínuo:
  - agenda → whatsapp (10,5 s): `B.handoff.patientCard({status: 'scheduled'})`, fundo branco quente `B.C.warm`.
  - whatsapp → care (17,0 s): `B.handoff.patientCard({status: 'confirmed'})`, fundo branco quente.
  - care → quote (22,5 s): `B.handoff.toothChips()`, fundo branco quente.
  - quote → payments (27,0 s): `B.handoff.acceptedPill()`, fundo branco quente no último quadro do quote; o payments começa com a pílula sobre o branco e abre o degradê.
  - payments → finance (35,0 s): `B.handoff.coin()` no centro, fundo branco quente.
  - hook → reveal (3,0 s): estrela da marca teal, centro (540, 960), 160 px de largura, fundo ardósia; o reveal abre com `B.starWipe` a partir dela.
  - reveal → agenda (6,5 s): tela branca quente com a grade de pontos `B.dots({gap: 28, color: 'rgba(15,59,130,.07)'})`.
  - finance → endcard (39,7–40,0 s): o finance termina com uma estrela teal no centro; o endcard (pre = 0,3 s, por cima) abre com `B.starWipe` a partir dela.

## Regras de qualidade

1. **Desenho próprio**, nada de print. Interface limpa estilo produto premium (Linear, Stripe, Apple): cantos 24–40 px, sombras macias, muito respiro, hierarquia clara.
2. **Legível no celular**: texto de destaque ≥ 64 px; texto de interface importante ≥ 30 px; nada menor que 24 px.
3. **Zona segura do Reels/TikTok**: conteúdo importante entre y = 220 e y = 1560, x = 60 a 960 (a direita tem botões do app e embaixo a legenda).
4. **Movimento com intenção**: tudo entra com mola ou curva (`E.snappy`), em cascata (stagger 40–90 ms), nada aparece "do nada" nem fica parado: uma deriva leve de câmera (escala 1→1.03) mantém vivo. Overshoot só onde faz sentido (chips, botões, ícones).
5. **Ritmo**: os acontecimentos principais caem nas batidas da música (120 BPM → a cada 0,5 s; compasso = 2 s). O `TIMELINE` traz `beats` para referência.
6. **Sem mexer em arquivo dos outros** (engine, brand, timeline, outras cenas). Se precisar de um helper, escreva dentro da sua cena.
7. **Confira os quadros** antes de terminar: `node tools/stills.mjs --scene <id> --every 0.25 --sheet` e abra a `sheet.png` e alguns quadros em tamanho real. O comando também lista erros do console — tem que sair sem erro.
