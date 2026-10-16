/*
 * Cena "finance" (global 35,0–40,0 · local 0–5). "Você fecha o dia sem
 * planilha, com os dados protegidos."
 *
 * 1) A moeda do pagamento é lançada e cai no card "Recebido hoje" de um painel
 *    2x2 que se monta em cascata: área com "↑ hoje", barras da semana, rosca de
 *    conversão e comissões da equipe. Nenhum valor em dinheiro.
 * 2) Em "sem planilha" o painel recua, a planilha do gancho volta pequena, um
 *    marcador teal a risca e ela se estilhaça em estrelinhas que ficam pairando.
 * 3) O interruptor "Modo escuro" dá um clique e uma varredura radial escurece
 *    tudo a partir dele.
 * 4) Em "dados protegidos" o painel escuro encolhe e vira o corpo de um cadeado:
 *    CPF e telefone embaralham e terminam mascarados, o arco fecha com clique,
 *    um escudo se desenha e entram os três selos.
 * 5) O escudo se contrai na estrela teal em (540, 960) e as estrelinhas
 *    convergem para ela: é dela que nasce a íris do endcard (39,7).
 *
 * Passagens: o primeiro quadro é B.handoff.coin() sem transform sobre o branco
 * quente; de 39,7 em diante fica só B.star de 160 px em (540, 960) sobre o
 * marinho. post = 0,2 s: o marinho continua por baixo da íris do endcard até
 * ela cobrir a tela (≈ 40,15), senão o fundo do palco apareceria em 40,0.
 */
(() => {
  const { h, s } = R;
  const E = R.ease;
  const C = B.C;
  const TL = window.TIMELINE;
  const T0 = TL.finance.start;
  const EV = TL.events;
  const L = (g) => g - T0; // global → local
  const VO = Object.fromEntries(TL.vo.map((v) => [v.id, { start: L(v.start), end: L(v.end) }]));

  // ── Tempos locais (todos derivados do TIMELINE) ─────────────────────────────
  const T = {};
  T.sem = L(EV.semPlanilha); // 1,50 "sem planilha"
  T.dados = L(EV.dadosProtegidos); // 2,80 "dados protegidos"
  T.iris = L(EV.starIris); // 4,70 a íris do endcard nasce da estrela
  T.land = 0.5; // a moeda pousa no card
  T.click = T.dados - 0.3; // 2,50 (37,5) clique no "Modo escuro"
  T.recede = T.sem - 0.42; // o painel recua para a planilha
  T.shatter = T.sem + 0.36; // 1,86 a planilha estilhaça
  T.back = T.click - 0.4; // 2,10 o painel volta
  T.morph = T.dados + 0.04; // o painel vira o corpo do cadeado
  T.fields = T.dados + 0.26; // 3,06 CPF e telefone
  T.shut = VO.p14.end - 0.16; // 3,60 (38,6) o arco fecha
  T.shield = T.shut + 0.02;
  T.seals = [T.iris - 0.85, T.iris - 0.6, T.iris - 0.35]; // 3,85 · 4,10 · 4,35
  T.contract = T.iris - 0.36; // 4,34 o escudo se contrai
  T.starIn = T.iris - 0.22; // 4,48 a estrela cresce

  // ── Geometria ───────────────────────────────────────────────────────────────
  const COIN = B.handoff.COIN; // {cx: 540, cy: 960, size: 200}
  const CW = 424;
  const CH = 500;
  const CARDS = [
    { x: 100, y: 450 },
    { x: 556, y: 450 },
    { x: 100, y: 982 },
    { x: 556, y: 982 },
  ];
  const CARD_IN = [0.04, 0.3, 0.38, 0.46];
  const GRID = { x: 100, y: 450, w: 880, h: 1032, r: 40 };
  const SLOT = { x: 34, y: 34, d: 76 }; // encaixe da moeda (local ao card 1)
  const SLOT_L = [SLOT.x + SLOT.d / 2, SLOT.y + SLOT.d / 2];
  const TOG = { right: 100, top: 232, h: 72 };
  const SW = { x: 1080 - TOG.right - 11 - 44, y: TOG.top + TOG.h / 2 }; // centro do interruptor
  const BODY = { x: 310, y: 770, w: 460, h: 330, r: 48 }; // corpo do cadeado
  const LOCK_O = { x: 540, y: 860 }; // centro visual do cadeado + escudo
  const SH = { cx: 540, cy: 1010, w: 470, h: 330 }; // planilha pequena
  const SH_COLS = [46, 106, 106, 106, 106];
  const SH_ROWS = [42, 48, 48, 48, 48, 48, 48];
  const FS = 160; // estrela final
  const FSH = (FS * 148) / 140;
  const SEAL_Y = [1326, 1404, 1482];

  const SWEEP_EASE = E.bezier(0.38, 0.12, 0.22, 1); // sai do interruptor já andando

  // ── Temas (claro / escuro do app) ──────────────────────────────────────────
  const TH = {
    light: {
      key: 'l',
      card: '#FFFFFF',
      shadow: '0 30px 60px -24px rgba(11,31,63,.24), 0 10px 24px -12px rgba(11,31,63,.12), 0 0 0 1px rgba(11,31,63,.04)',
      ink: C.ink,
      title: C.navy,
      muted: C.muted,
      tile: C.teal50,
      tileIcon: C.teal700,
      track: C.warm200,
      accent: C.teal,
      accentStrong: C.teal700,
      pill: '#FFFFFF',
      pillShadow: '0 12px 28px -14px rgba(11,31,63,.28), 0 0 0 1px rgba(11,31,63,.05)',
      switchOff: C.warm300,
      dotRing: '#FFFFFF',
      slot: 'rgba(20,184,166,.45)',
      stars: [C.teal, C.teal700, C.teal],
    },
    dark: {
      key: 'd',
      card: '#0C2958',
      shadow: '0 30px 60px -24px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.07), 0 0 0 1px rgba(255,255,255,.06)',
      ink: '#FFFFFF',
      title: '#FFFFFF',
      muted: 'rgba(206,222,245,.74)',
      tile: 'rgba(45,212,191,.14)',
      tileIcon: C.teal300,
      track: 'rgba(255,255,255,.10)',
      accent: C.teal400,
      accentStrong: C.teal300,
      pill: 'rgba(255,255,255,.07)',
      pillShadow: '0 0 0 1px rgba(255,255,255,.09)',
      switchOff: 'rgba(255,255,255,.18)',
      dotRing: '#0C2958',
      slot: 'rgba(45,212,191,.45)',
      stars: [C.teal400, C.teal300, C.teal400],
    },
  };

  // ── Ajudantes ──────────────────────────────────────────────────────────────
  const abs = (el, x, y, w, hh) => B.abs(el, x, y, w, hh);
  /** Impulso amortecido (0 → oscila → 0), para quicar. */
  const thud = (t, at, w = 22, z = 7) => (t < at ? 0 : Math.sin((t - at) * w) * Math.exp(-(t - at) * z));
  // Câmera: deriva leve (escala 1 → 1,035 e um passeio de poucos px).
  const camS = (lt) => 1 + 0.035 * E.inOutSine(R.clamp(lt / T.iris));
  const camXY = (lt) => {
    const k = R.p(lt, 0, 0.8, E.smooth);
    return [R.noise(lt * 0.35, 11) * 5 * k, R.noise(lt * 0.4, 7) * 6 * k];
  };
  const camPt = (lt, x, y) => {
    const sc = camS(lt);
    const [cx, cy] = camXY(lt);
    return [540 + (x - 540) * sc + cx, 960 + (y - 960) * sc + cy];
  };
  const applyCam = (el, lt) => {
    const [cx, cy] = camXY(lt);
    R.tf(el, { x: cx, y: cy, s: camS(lt) });
  };
  /** Curva suave por pontos (Catmull-Rom → Bézier). */
  const smoothPath = (pts) => {
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  /** Estrela da marca num invólucro centrável. */
  const starEl = (size, color, glow = 0) => {
    const hh = (size * 148) / 140;
    const el = h('div', { style: { position: 'absolute', left: '0', top: '0', width: `${size}px`, height: `${hh}px`, transformOrigin: '50% 50%', willChange: 'transform' } }, B.star({ size, color, glow }));
    return { el, w: size, h: hh };
  };
  /** Moeda pequena (mesma pintura da B.handoff.coin), para o encaixe do card. */
  const miniCoin = (d) =>
    h(
      'div',
      {
        style: {
          position: 'absolute', left: '0', top: '0', width: `${d}px`, height: `${d}px`, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, ${C.teal300} 0%, ${C.teal} 38%, ${C.teal700} 100%)`,
          boxShadow: `0 12px 22px -10px rgba(15,118,110,.6), inset 0 0 0 ${(d * 0.04).toFixed(1)}px rgba(255,255,255,.22), inset 0 -${(d * 0.05).toFixed(1)}px ${(d * 0.1).toFixed(1)}px rgba(6,24,51,.18)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', transformOrigin: '50% 50%', willChange: 'transform',
        },
      },
      B.star({ size: Math.round(d * 0.46), color: '#fff' }),
    );

  // ── Dados desenhados (sem números de dinheiro) ─────────────────────────────
  const SPARK = [0.16, 0.3, 0.24, 0.42, 0.36, 0.55, 0.6, 0.86];
  const CHART_H = 300;
  const SPARK_PTS = SPARK.map((v, i) => [-6 + i * (390 / 7), 262 - v * 210]);
  const BARS = [0.62, 0.74, 0.56, 0.48, 0.12, 0.8, 1.0];
  const DAYS = ['Q', 'Q', 'S', 'S', 'D', 'S', 'T']; // a última é hoje (terça)
  const BAR_W = 34;
  const BAR_GAP = (360 - 7 * BAR_W) / 6;
  const BAR_H = 168;
  const DONUT = { r: 78, sw: 24, k: 0.72 };
  const TEAM = [
    { ini: 'DP', name: 'Dra. Paula', v: 0.84, bg: C.mint, fg: C.navy },
    { ini: 'DR', name: 'Dr. Rafael', v: 0.66, bg: C.teal100, fg: C.teal800 },
    { ini: 'DL', name: 'Dra. Lia', v: 0.5, bg: '#DBEAFE', fg: '#1E3A8A' },
  ];

  // ── Painel 2x2 (montado duas vezes: claro e escuro, animados juntos) ─────────
  function buildPanel(th) {
    const P = { th };
    const wrap = h('div', { style: { position: 'absolute', inset: '0', transformOrigin: '540px 960px' } });
    P.wrap = wrap;

    // Cabeçalho: clínica + interruptor, e o título.
    const head = h('div', { style: { position: 'absolute', inset: '0' } });
    wrap.appendChild(head);
    P.head = head;
    const eyebrow = abs(
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '14px', height: `${TOG.h}px`, font: `600 30px/1 ${B.FONT}`, letterSpacing: '-0.015em', color: th.muted, whiteSpace: 'nowrap' } },
        B.star({ size: 26, color: th.accent }),
        h('span', { text: 'Clínica Aurora · hoje' }),
      ),
      100,
      TOG.top,
    );
    head.appendChild(eyebrow);
    P.eyebrow = eyebrow;

    const swOn = h('div', { style: { position: 'absolute', inset: '0', borderRadius: '25px', background: C.teal, opacity: '0' } });
    const knob = h('div', { style: { position: 'absolute', left: '5px', top: '5px', width: '40px', height: '40px', borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(6,24,51,.30)' } });
    const sw = h('div', { style: { position: 'relative', width: '88px', height: '50px', borderRadius: '25px', background: th.switchOff, flex: 'none', transformOrigin: '50% 50%' } }, swOn, knob);
    const toggle = h(
      'div',
      {
        style: {
          position: 'absolute', right: `${TOG.right}px`, top: `${TOG.top}px`, height: `${TOG.h}px`, borderRadius: `${TOG.h / 2}px`,
          background: th.pill, boxShadow: th.pillShadow, display: 'flex', alignItems: 'center', gap: '14px', padding: '0 11px 0 22px',
          transformOrigin: '100% 50%', willChange: 'transform',
        },
      },
      B.icon('moon', { size: 30, color: th.accentStrong, sw: 2.3 }),
      h('span', { text: 'Modo escuro', style: { font: `600 28px/1 ${B.FONT}`, letterSpacing: '-0.015em', color: th.ink, whiteSpace: 'nowrap', marginRight: '4px' } }),
      sw,
    );
    head.appendChild(toggle);
    Object.assign(P, { toggle, sw, swOn, knob });

    const title = h('div', { style: { position: 'absolute', left: '96px', top: '326px', font: `800 84px/1 ${B.DISPLAY}`, letterSpacing: '-0.045em', color: th.title, whiteSpace: 'nowrap' } });
    P.titleParts = R.split(title, 'Fechamento do dia');
    head.appendChild(title);

    // Cards.
    const tile = (icon) =>
      abs(
        h('div', { style: { borderRadius: '24px', background: th.tile, display: 'flex', alignItems: 'center', justifyContent: 'center', transformOrigin: '50% 50%' } }, B.icon(icon, { size: 40, color: th.tileIcon, sw: 2.2 })),
        SLOT.x,
        SLOT.y,
        SLOT.d,
        SLOT.d,
      );
    const cTitle = (text) =>
      abs(h('div', { style: { width: '360px', font: `700 34px/1.12 ${B.FONT}`, letterSpacing: '-0.025em', color: th.ink, whiteSpace: 'pre-line' } }, text), 34, 132);
    P.cards = CARDS.map((g) => {
      const el = B.card({ w: CW, h: CH, r: 40, bg: th.card, shadow: th.shadow, style: { left: `${g.x}px`, top: `${g.y}px`, transformOrigin: '50% 100%' } });
      wrap.appendChild(el);
      return el;
    });
    const [c1, c2, c3, c4] = P.cards;
    P.tiles = [];

    // Card 1 — Recebido hoje: encaixe da moeda, área e chip de tendência.
    const slot = abs(h('div', { style: { borderRadius: '50%', background: th.tile, boxShadow: `inset 0 0 0 3px ${th.slot}` } }), SLOT.x, SLOT.y, SLOT.d, SLOT.d);
    c1.appendChild(slot);
    const coinIn = miniCoin(SLOT.d);
    abs(coinIn, SLOT.x, SLOT.y);
    coinIn.style.opacity = '0';
    c1.appendChild(coinIn);
    const ripple = abs(h('div', { style: { borderRadius: '50%', border: `4px solid ${th.accent}`, boxSizing: 'border-box', opacity: '0' } }), SLOT.x, SLOT.y, SLOT.d, SLOT.d);
    c1.appendChild(ripple);
    const sparks = Array.from({ length: 6 }, (_, i) => {
      const st = starEl(16 + (i % 2) * 8, th.accent);
      c1.appendChild(st.el);
      return st;
    });
    c1.appendChild(cTitle('Recebido hoje'));
    const chip = B.chip('hoje', { bg: C.mint, fg: C.navy, icon: 'arrow-up', size: 30, pad: 18, weight: 700 });
    Object.assign(chip.style, { position: 'absolute', right: '30px', top: `${SLOT.y + SLOT.d / 2 - 28.5}px`, transformOrigin: '100% 50%' });
    c1.appendChild(chip);
    const chartBox = abs(h('div', { style: { overflow: 'hidden', borderRadius: '0 0 40px 40px' } }), 0, CH - CHART_H, CW, CHART_H);
    c1.appendChild(chartBox);
    const gid = `fin-area-${th.key}`;
    const cid = `fin-clip-${th.key}`;
    const clipRect = s('rect', { x: -10, y: 0, width: 0, height: CHART_H });
    const lineD = smoothPath(SPARK_PTS);
    const last = SPARK_PTS[SPARK_PTS.length - 1];
    const area = s('path', { d: `${lineD} L ${last[0]} ${CHART_H} L -6 ${CHART_H} Z`, fill: `url(#${gid})`, 'clip-path': `url(#${cid})` });
    const line = s('path', { d: lineD, fill: 'none', stroke: th.accent, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const pulse = s('circle', { cx: last[0], cy: last[1], r: 10, fill: 'none', stroke: th.accent, 'stroke-width': 3, opacity: 0 });
    const endDot = s('circle', { cx: last[0], cy: last[1], r: 10, fill: th.accent, stroke: th.dotRing, 'stroke-width': 4, style: { transformBox: 'fill-box', transformOrigin: 'center' } });
    const nowLine = s('line', { x1: last[0], x2: last[0], y1: last[1] + 16, y2: CHART_H, stroke: th.accent, 'stroke-width': 3, 'stroke-dasharray': '3 9', 'stroke-linecap': 'round', opacity: 0 });
    const guides = [0.33, 0.66].map((f) => s('line', { x1: 0, x2: CW, y1: 262 - f * 210, y2: 262 - f * 210, stroke: th.track, 'stroke-width': 2, 'stroke-dasharray': '2 10', 'stroke-linecap': 'round', opacity: 0 }));
    chartBox.appendChild(
      s(
        'svg',
        { width: CW, height: CHART_H, viewBox: `0 0 ${CW} ${CHART_H}`, style: { display: 'block', overflow: 'visible' } },
        s(
          'defs',
          null,
          s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0%', 'stop-color': th.accent, 'stop-opacity': 0.34 }), s('stop', { offset: '100%', 'stop-color': th.accent, 'stop-opacity': 0 })),
          s('clipPath', { id: cid }, clipRect),
        ),
        ...guides,
        area,
        nowLine,
        line,
        pulse,
        endDot,
      ),
    );
    Object.assign(P, { slot, coinIn, ripple, sparks, chip, clipRect, area, nowLine, line, pulse, endDot, guides });

    // Card 2 — Atendimentos da semana: 7 barras, hoje em menta.
    const t2 = tile('calendar-check');
    c2.appendChild(t2);
    P.tiles.push(null, t2);
    c2.appendChild(cTitle('Atendimentos\nda semana'));
    const barBox = abs(h('div'), 32, 258, 360, BAR_H);
    c2.appendChild(barBox);
    P.bars = BARS.map((v, i) => {
      const x = i * (BAR_W + BAR_GAP);
      const today = i === BARS.length - 1;
      barBox.appendChild(abs(h('div', { style: { borderRadius: '12px', background: th.track, opacity: '0.55' } }), x, 0, BAR_W, BAR_H));
      const bar = abs(h('div', { style: { borderRadius: '12px', background: today ? C.mint : th.accent, transformOrigin: '50% 100%', transform: 'scaleY(0)' } }), x, BAR_H * (1 - v), BAR_W, BAR_H * v);
      barBox.appendChild(bar);
      const lab = abs(
        h('div', { text: DAYS[i], style: { width: `${BAR_W + 20}px`, textAlign: 'center', font: `${today ? 800 : 600} 24px/1 ${B.FONT}`, color: today ? th.ink : th.muted, opacity: '0' } }),
        32 + x - 10,
        258 + BAR_H + 16,
      );
      c2.appendChild(lab);
      return { bar, lab, v, today };
    });

    // Card 3 — Conversão de orçamentos: rosca se fechando (sem percentual).
    const t3 = tile('file-check');
    c3.appendChild(t3);
    P.tiles.push(t3);
    c3.appendChild(cTitle('Conversão de\norçamentos'));
    const DC = 100;
    const donutTrack = s('circle', { cx: DC, cy: DC, r: DONUT.r, fill: 'none', stroke: th.track, 'stroke-width': DONUT.sw });
    const donutProg = s('circle', { cx: DC, cy: DC, r: DONUT.r, fill: 'none', stroke: th.accent, 'stroke-width': DONUT.sw, 'stroke-linecap': 'round', transform: `rotate(-90 ${DC} ${DC})`, 'stroke-dasharray': '0 999' });
    const donut = abs(h('div', { style: { transformOrigin: '50% 50%' } }, s('svg', { width: 200, height: 200, viewBox: '0 0 200 200', style: { display: 'block', overflow: 'visible' } }, donutTrack, donutProg)), CW / 2 - 100, 262, 200, 200);
    c3.appendChild(donut);
    const donutIcon = abs(h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', transformOrigin: '50% 50%' } }, B.icon('check', { size: 56, color: th.accentStrong, sw: 3 })), CW / 2 - 40, 262 + 60, 80, 80);
    c3.appendChild(donutIcon);
    Object.assign(P, { donut, donutTrack, donutProg, donutIcon });

    // Card 4 — Comissões: três profissionais, barras enchendo.
    const t4 = tile('users');
    c4.appendChild(t4);
    P.tiles.push(t4);
    c4.appendChild(cTitle('Comissões'));
    P.team = TEAM.map((m, i) => {
      const y = 200 + i * 92;
      const av = abs(B.avatar(m.ini, { size: 60, bg: m.bg, fg: m.fg }), 34, y);
      av.style.transformOrigin = '50% 50%';
      c4.appendChild(av);
      const name = abs(h('div', { text: m.name, style: { font: `600 28px/1 ${B.FONT}`, letterSpacing: '-0.02em', color: th.ink, whiteSpace: 'nowrap' } }), 112, y + 2);
      c4.appendChild(name);
      c4.appendChild(abs(h('div', { style: { borderRadius: '6px', background: th.track } }), 112, y + 42, 278, 12));
      const fill = abs(h('div', { style: { borderRadius: '6px', background: th.accent, width: '0px' } }), 112, y + 42, 0, 12);
      c4.appendChild(fill);
      return { av, name, fill, v: m.v };
    });
    return P;
  }

  /** Progresso do painel virando o corpo do cadeado (0 → 1). */
  const morphK = (lt) => R.p(lt, T.morph, 0.38, E.inOutCubic);

  /** Anima um painel (claro ou escuro) para o instante lt. */
  function updatePanel(P, lt) {
    // Recuo para a planilha e volta.
    const rec = R.p(lt, T.recede, 0.26, E.inOutCubic) * (1 - R.p(lt, T.back, 0.34, E.snappy));
    // Em "dados protegidos" o painel encolhe para dentro do corpo do cadeado.
    const m = morphK(lt);
    const bodyCy = BODY.y + BODY.h / 2;
    const gridCy = GRID.y + GRID.h / 2;
    R.tf(P.wrap, { s: (1 - 0.06 * rec) * R.lerp(1, BODY.w / GRID.w, m), y: (bodyCy - gridCy) * m, o: 1 - 0.84 * rec, blur: 12 * rec });

    // Cabeçalho.
    const ek = R.p(lt, 0.12, 0.5, E.snappy);
    R.tf(P.eyebrow, { y: (1 - ek) * 24, o: ek });
    R.reveal(P.titleParts, lt, { start: 0.16, stagger: 0.07, dur: 0.6, y: 110 });
    const tg = R.sp(lt, 0.42, R.springs.bouncy);
    const press = R.kf(lt, [[T.click - 0.05, 1], [T.click + 0.04, 0.93, E.outQuad], [T.click + 0.32, 1, E.snappy]]);
    R.tf(P.toggle, { x: (1 - R.clamp(tg)) * 40, s: R.lerp(0.8, 1, tg) * press, o: R.clamp(tg * 2.5) });
    const on = R.sp(lt, T.click + 0.02, R.springs.snappy);
    P.knob.style.transform = `translateX(${(38 * on).toFixed(2)}px)`;
    P.swOn.style.opacity = R.clamp(on).toFixed(3);
    const hk = R.p(lt, T.dados - 0.04, 0.22, E.inCubic);
    R.tf(P.head, { y: -70 * hk, o: 1 - hk });

    // Cards em cascata (o 1 primeiro, onde a moeda cai).
    P.cards.forEach((el, i) => {
      const k = R.p(lt, CARD_IN[i], 0.55, E.snappy);
      let sy = 1;
      let dy = 0;
      if (i === 0) {
        const b = thud(lt, T.land, 20, 6.5);
        sy = 1 - 0.045 * b;
        dy = 12 * b;
      }
      const merge = R.inv(0.12, 0.55, m);
      const sc = R.lerp(0.92, 1, k);
      R.tf(el, { y: (1 - k) * 110 + dy, sx: sc, sy: sc * sy, o: R.clamp(k * 2) * (1 - merge) });
    });
    P.tiles.forEach((t, i) => {
      if (!t) return;
      const k = R.sp(lt, CARD_IN[i] + 0.14, R.springs.bouncy);
      R.tf(t, { s: R.clamp(k, 0, 1.3), r: (1 - R.clamp(k)) * -30 });
    });

    // Card 1: a moeda pousa, o encaixe ondula, faíscas, área e chip.
    const landed = lt >= T.land;
    P.coinIn.style.opacity = landed ? '1' : '0';
    R.tf(P.coinIn, { s: landed ? 1 + 0.12 * thud(lt, T.land, 24, 8) : 1 });
    P.slot.style.opacity = landed ? '0' : String(R.p(lt, 0.1, 0.3));
    const rk = R.p(lt, T.land, 0.55, E.outCubic);
    R.tf(P.ripple, { s: 1 + rk * 1.5, o: landed ? (1 - rk) * 0.9 : 0 });
    P.sparks.forEach((st, i) => {
      const a = -Math.PI * 0.95 + (i / 5) * Math.PI * 1.25;
      const k = R.p(lt, T.land, 0.5, E.outCubic);
      const dist = 52 + k * 64;
      const x = SLOT_L[0] + Math.cos(a) * dist - st.w / 2;
      const y = SLOT_L[1] + Math.sin(a) * dist - st.h / 2;
      R.tf(st.el, { x, y, s: landed ? Math.sin(Math.min(1, k * 1.2) * Math.PI) * 1.1 : 0, r: k * 120, o: landed ? 1 - R.p(k, 0.7, 0.3, E.linear) : 0 });
    });
    const lk = R.p(lt, T.land + 0.05, 0.55, E.inOutCubic);
    R.draw(P.line, lk);
    P.line.style.opacity = lk > 0.001 ? '1' : '0';
    P.clipRect.setAttribute('width', (lk * 410).toFixed(1));
    P.guides.forEach((g, i) => g.setAttribute('opacity', (R.p(lt, T.land + i * 0.08, 0.4) * 0.9).toFixed(3)));
    const ed = R.sp(lt, T.land + 0.55, R.springs.bouncy);
    P.endDot.style.transform = `scale(${R.clamp(ed, 0, 1.4).toFixed(4)})`;
    P.endDot.style.opacity = ed > 0.01 ? '1' : '0';
    P.nowLine.setAttribute('opacity', (R.p(lt, T.land + 0.5, 0.3) * 0.7).toFixed(3));
    const pph = lt < T.land + 0.6 ? -1 : ((lt - T.land - 0.6) % 1.0) / 1.0;
    P.pulse.setAttribute('r', pph < 0 ? 10 : (10 + pph * 22).toFixed(2));
    P.pulse.setAttribute('opacity', pph < 0 ? 0 : ((1 - pph) * 0.8).toFixed(3));
    const ck = R.sp(lt, T.land + 0.36, R.springs.bouncy);
    R.tf(P.chip, { s: R.clamp(ck, 0, 1.4), o: R.clamp(ck * 3) });

    // Card 2: barras crescendo; a de hoje por último, com mola.
    P.bars.forEach((b, i) => {
      const at = 0.62 + i * 0.05 + (b.today ? 0.05 : 0);
      const k = R.sp(lt, at, b.today ? R.springs.bouncy : R.springs.snappy);
      b.bar.style.transform = `scaleY(${Math.max(0, k).toFixed(4)})`;
      b.lab.style.opacity = R.p(lt, at, 0.3).toFixed(3);
    });

    // Card 3: rosca fecha até ~3/4 e o check brota.
    const LC = 2 * Math.PI * DONUT.r;
    const dk = DONUT.k * R.p(lt, 0.7, 0.62, E.snappy);
    P.donutProg.setAttribute('stroke-dasharray', `${(LC * dk).toFixed(2)} ${LC.toFixed(2)}`);
    P.donutProg.style.opacity = dk > 0.002 ? '1' : '0';
    const dr = R.p(lt, 0.6, 0.6, E.snappy);
    R.tf(P.donut, { r: (1 - dr) * -60, s: R.lerp(0.8, 1, dr) });
    const di = R.sp(lt, 1.1, R.springs.bouncy);
    R.tf(P.donutIcon, { s: R.clamp(di, 0, 1.4), o: R.clamp(di * 3) });

    // Card 4: avatares, nomes e barras de comissão.
    P.team.forEach((m, i) => {
      const at = 0.74 + i * 0.07;
      const a = R.sp(lt, at, R.springs.bouncy);
      R.tf(m.av, { s: R.clamp(a, 0, 1.3) });
      const nk = R.p(lt, at + 0.03, 0.45, E.snappy);
      R.tf(m.name, { x: (1 - nk) * -18, o: nk });
      m.fill.style.width = `${(278 * m.v * R.p(lt, at + 0.1, 0.6, E.snappy)).toFixed(1)}px`;
    });
  }

  R.scene({
    id: 'finance',
    post: 0.2, // o marinho fica por baixo da íris do endcard até ela cobrir a tela
    build(root, S) {
      // ═════ Camada clara ═════
      const light = h('div', { style: { position: 'absolute', inset: '0' } });
      root.appendChild(light);
      light.appendChild(h('div', { style: { position: 'absolute', inset: '0', background: C.warm } }));
      const meshL = B.mesh({
        base: 'transparent',
        blobs: [
          { x: 180, y: 380, r: 620, color: 'rgba(167,227,193,.36)' },
          { x: 960, y: 1180, r: 600, color: 'rgba(20,184,166,.12)' },
          { x: 300, y: 1700, r: 640, color: 'rgba(15,59,130,.06)' },
        ],
      });
      light.appendChild(meshL.el);
      const dotsL = B.dots({ color: 'rgba(15,59,130,.06)', gap: 28 });
      light.appendChild(dotsL);
      const starsLHost = h('div', { style: { position: 'absolute', inset: '0' } });
      light.appendChild(starsLHost);
      const camL = h('div', { style: { position: 'absolute', inset: '0', transformOrigin: '540px 960px' } });
      light.appendChild(camL);
      const PL = buildPanel(TH.light);
      camL.appendChild(PL.wrap);

      // Planilha do gancho (cada célula é um caco para estilhaçar).
      const sheetWrap = h('div', { style: { position: 'absolute', left: `${SH.cx - SH.w / 2}px`, top: `${SH.cy - SH.h / 2}px`, width: `${SH.w}px`, height: `${SH.h}px`, transformOrigin: '50% 50%', willChange: 'transform' } });
      const sheetShadow = h('div', { style: { position: 'absolute', inset: '0', borderRadius: '18px', background: '#fff', boxShadow: '0 40px 70px -30px rgba(11,31,63,.35), 0 12px 24px -14px rgba(11,31,63,.18)' } });
      sheetWrap.appendChild(sheetShadow);
      const sheetSvg = s('svg', { width: SH.w, height: SH.h, viewBox: `0 0 ${SH.w} ${SH.h}`, style: { position: 'absolute', left: '0', top: '0', overflow: 'visible' } });
      sheetWrap.appendChild(sheetSvg);
      const shards = [];
      let yy = 0;
      SH_ROWS.forEach((rh, ri) => {
        let xx = 0;
        SH_COLS.forEach((cw, ci) => {
          const header = ri === 0;
          const rowNum = ci === 0;
          const fill = header ? '#ECEAE5' : rowNum ? '#F2F0EC' : '#FFFFFF';
          const g = s('g');
          g.appendChild(s('rect', { x: xx, y: yy, width: cw, height: rh, fill, stroke: '#D6D3CB', 'stroke-width': 1.6 }));
          if (header && !rowNum) {
            g.appendChild(s('text', { x: xx + cw / 2, y: yy + rh / 2 + 9, 'text-anchor': 'middle', 'font-family': 'Inter', 'font-weight': 600, 'font-size': 24, fill: '#9C988F' }, 'ABCD'[ci - 1]));
          } else if (rowNum && !header) {
            g.appendChild(s('text', { x: xx + cw / 2, y: yy + rh / 2 + 9, 'text-anchor': 'middle', 'font-family': 'Inter', 'font-weight': 600, 'font-size': 24, fill: '#A8A49B' }, String(ri)));
          } else if (!header && !rowNum) {
            const wv = 26 + R.hash(ri * 7.1 + ci * 3.3) * (cw - 46);
            const tone = R.hash(ri * 2.3 + ci * 9.7) > 0.8 ? '#C9C5BC' : '#DEDBD3';
            g.appendChild(s('rect', { x: xx + 14, y: yy + rh / 2 - 6, width: wv.toFixed(1), height: 12, rx: 6, fill: tone }));
          }
          sheetSvg.appendChild(g);
          const cx = xx + cw / 2;
          const cy = yy + rh / 2;
          const dx = cx - SH.w / 2 + (R.hash(ri * 5.5 + ci * 1.7) - 0.5) * 60;
          const dy = cy - SH.h / 2 + (R.hash(ri * 3.1 + ci * 8.3) - 0.5) * 60;
          const n = Math.hypot(dx, dy) || 1;
          shards.push({ g, cx, cy, ux: dx / n, uy: dy / n, dist: 150 + R.hash(ri * 9.9 + ci * 4.1) * 240, rot: (R.hash(ri * 6.6 + ci * 2.2) - 0.5) * 220, delay: R.hash(ri * 1.9 + ci * 7.7) * 0.05 });
          xx += cw;
        });
        yy += rh;
      });
      const marker = s('path', { d: `M -30 236 C 110 214, 300 168, 504 92`, fill: 'none', stroke: C.teal, 'stroke-width': 34, 'stroke-linecap': 'round', opacity: 0.94 });
      sheetSvg.appendChild(marker);
      light.appendChild(sheetWrap);
      const shatterRing = h('div', { style: { position: 'absolute', left: `${SH.cx - 160}px`, top: `${SH.cy - 160}px`, width: '320px', height: '320px', borderRadius: '50%', border: `4px solid ${C.teal}`, boxSizing: 'border-box', opacity: '0' } });
      light.appendChild(shatterRing);

      // "Sem planilha." enorme.
      const semEl = h('div', { style: { position: 'absolute', left: '0', width: '1080px', top: '556px', textAlign: 'center', font: `900 140px/1 ${B.DISPLAY}`, letterSpacing: '-0.055em', color: C.navy, whiteSpace: 'nowrap' } });
      const semParts = R.split(semEl, 'Sem planilha.', { by: 'char' });
      light.appendChild(semEl);

      // ═════ Camada escura (varredura radial a partir do interruptor) ═════
      const dark = h('div', { style: { position: 'absolute', inset: '0', display: 'none' } });
      root.appendChild(dark);
      dark.appendChild(h('div', { style: { position: 'absolute', inset: '0', background: `radial-gradient(ellipse 1000px 1300px at 540px 860px, ${C.navy} 0%, ${C.navy900} 45%, ${C.navy950} 100%)` } }));
      const meshD = B.mesh({
        base: 'transparent',
        blobs: [
          { x: 540, y: 880, r: 620, color: 'rgba(20,184,166,.16)' },
          { x: 120, y: 300, r: 520, color: 'rgba(45,212,191,.08)' },
          { x: 980, y: 1600, r: 600, color: 'rgba(15,59,130,.55)' },
        ],
      });
      dark.appendChild(meshD.el);
      dark.appendChild(B.dots({ color: 'rgba(255,255,255,.045)', gap: 28 }));
      const starsDHost = h('div', { style: { position: 'absolute', inset: '0' } });
      dark.appendChild(starsDHost);
      const camD = h('div', { style: { position: 'absolute', inset: '0', transformOrigin: '540px 960px' } });
      dark.appendChild(camD);
      const PD = buildPanel(TH.dark);
      camD.appendChild(PD.wrap);

      // Cadeado + escudo (grupo que se contrai na estrela no fim).
      const lockGroup = h('div', { style: { position: 'absolute', inset: '0', transformOrigin: `${LOCK_O.x}px ${LOCK_O.y}px`, willChange: 'transform' } });
      camD.appendChild(lockGroup);
      const halo = h('div', { style: { position: 'absolute', left: `${540 - 520}px`, top: `${LOCK_O.y - 520}px`, width: '1040px', height: '1040px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(45,212,191,.26), rgba(45,212,191,0))', opacity: '0' } });
      lockGroup.appendChild(halo);

      // Escudo: duas metades que se desenham do topo até a ponta.
      const SHIELD_R = 'M 540 404 L 846 474 Q 870 480 870 504 L 870 920 C 870 1110 720 1240 540 1300';
      const SHIELD_L = 'M 540 404 L 234 474 Q 210 480 210 504 L 210 920 C 210 1110 360 1240 540 1300';
      const SHIELD_FILL = 'M 540 404 L 846 474 Q 870 480 870 504 L 870 920 C 870 1110 720 1240 540 1300 C 360 1240 210 1110 210 920 L 210 504 Q 210 480 234 474 Z';
      const shieldFill = s('path', { d: SHIELD_FILL, fill: 'rgba(45,212,191,.07)', opacity: 0 });
      const shieldR = s('path', { d: SHIELD_R, fill: 'none', stroke: C.teal400, 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      const shieldLft = s('path', { d: SHIELD_L, fill: 'none', stroke: C.teal400, 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      const shieldSvg = s('svg', { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible', filter: 'drop-shadow(0 0 14px rgba(45,212,191,.55))' } }, shieldFill, shieldR, shieldLft);
      lockGroup.appendChild(shieldSvg);

      // Núcleo do cadeado (arco + corpo), quica no clique.
      const core = h('div', { style: { position: 'absolute', inset: '0' } });
      lockGroup.appendChild(core);
      const shackle = s('path', { d: `M 422 ${BODY.y + 72} V 678 A 118 118 0 0 1 658 678 V ${BODY.y + 22}`, fill: 'none', stroke: 'url(#fin-shackle)', 'stroke-width': 42, 'stroke-linecap': 'round' });
      const ticks = [-0.9, -0.45, 0].map((a) =>
        s('line', { x1: 0, y1: 0, x2: 30, y2: 0, stroke: C.teal300, 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0, transform: `translate(706 742) rotate(${((a * 180) / Math.PI).toFixed(1)})` }),
      );
      const clickRing = s('circle', { cx: 658, cy: BODY.y, r: 30, fill: 'none', stroke: C.teal300, 'stroke-width': 5, opacity: 0 });
      const shackleG = s('g', null, shackle);
      const shackleSvg = s(
        'svg',
        { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible' } },
        s('defs', null, s('linearGradient', { id: 'fin-shackle', x1: 0, y1: 0, x2: 1, y2: 1 }, s('stop', { offset: '0%', 'stop-color': C.teal300 }), s('stop', { offset: '100%', 'stop-color': C.teal }))),
        shackleG,
      );
      core.appendChild(shackleSvg);
      const fxSvg = s('svg', { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible' } }, clickRing, ...ticks);

      // Corpo: nasce como o painel inteiro e encolhe.
      const body = h('div', { style: { position: 'absolute', borderRadius: `${GRID.r}px`, background: TH.dark.card, boxShadow: '0 40px 80px -30px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.10), 0 0 0 1px rgba(255,255,255,.07)', overflow: 'hidden', display: 'none' } });
      const bodySheen = h('div', { style: { position: 'absolute', inset: '0', background: 'linear-gradient(180deg, #17489A 0%, #0C2958 70%, #0A2552 100%)', opacity: '0' } });
      body.appendChild(bodySheen);
      core.appendChild(body);
      core.appendChild(fxSvg);

      // Campos CPF e Telefone (no corpo, à frente).
      const GLYPHS = '0123456789#%&*+=?@<>/ABCDEFHKXZ';
      const field = (label, mask, top) => {
        const wrap = abs(h('div', { style: { opacity: '0' } }), 34, top, BODY.w - 68, 120);
        const lab = h('div', { text: label, style: { font: `600 26px/1 ${B.FONT}`, letterSpacing: '-0.01em', color: 'rgba(206,222,245,.76)', height: '26px' } });
        const box = h('div', { style: { marginTop: '12px', height: '82px', borderRadius: '22px', background: 'rgba(3,14,34,.45)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.10)', display: 'flex', alignItems: 'center', padding: '0 22px 0 24px', boxSizing: 'border-box' } });
        const val = h('div', { style: { display: 'flex', alignItems: 'center', height: '40px', font: `700 36px/1 ${B.FONT}`, color: '#fff', fontFeatureSettings: '"tnum" 1' } });
        const chars = Array.from(mask).map((ch) => {
          const w = { '•': 21, ' ': 10, '.': 12, '-': 20, '(': 15, ')': 15 }[ch] ?? 21;
          const sp = h('span', { style: { display: 'inline-block', width: `${w}px`, textAlign: 'center', overflow: 'visible', whiteSpace: 'pre' } });
          val.appendChild(sp);
          return { sp, ch, last: '' };
        });
        const eye = h('div', { style: { marginLeft: 'auto', display: 'flex', transformOrigin: '50% 50%' } }, B.icon('eye-off', { size: 32, color: C.teal300, sw: 2.3 }));
        box.append(val, eye);
        wrap.append(lab, box);
        body.appendChild(wrap);
        return { wrap, box, chars, eye };
      };
      const fields = [field('CPF', '•••.•••.•••-••', 34), field('Telefone', '(••) •••••-••••', 176)];

      // "Dados protegidos." no topo.
      const dadosEl = h('div', { style: { position: 'absolute', left: '0', width: '1080px', top: '232px', textAlign: 'center', font: `900 88px/1 ${B.DISPLAY}`, letterSpacing: '-0.05em', color: '#fff', whiteSpace: 'nowrap' } });
      const dadosParts = R.split(dadosEl, 'Dados protegidos.');
      dadosParts[1].style.color = C.teal300;
      camD.appendChild(dadosEl);

      // Selos menta com texto marinho.
      const seals = [
        ['lock', 'LGPD por padrão'],
        ['key-round', 'CPF e telefone criptografados'],
        ['accessibility', 'WCAG 2.1 AA'],
      ].map(([icon, text], i) => {
        const ic = h('div', { style: { display: 'flex', transformOrigin: '50% 50%' } }, B.icon(icon, { size: 34, color: C.navy, sw: 2.4 }));
        const pill = h(
          'div',
          {
            style: {
              display: 'inline-flex', alignItems: 'center', gap: '14px', height: '64px', padding: '0 30px 0 24px', borderRadius: '32px',
              background: C.mint, color: C.navy, font: `700 32px/1 ${B.FONT}`, letterSpacing: '-0.02em', whiteSpace: 'nowrap', willChange: 'transform',
            },
          },
          ic,
          h('span', { text }),
        );
        const mask = h('div', { style: { position: 'absolute', left: '0', top: `${SEAL_Y[i]}px`, width: '1080px', height: '64px', display: 'flex', justifyContent: 'center', overflow: 'hidden' } }, pill);
        camD.appendChild(mask);
        return { mask, pill, ic };
      });

      // ═════ Estrelinhas (cópia clara e escura, mesma posição) ═════
      const NS = 44;
      const STARS = Array.from({ length: NS }, (_, i) => {
        const a = (i / NS) * Math.PI * 2 + (R.hash(i * 3.7 + 1) - 0.5) * 0.3;
        const rf = 0.74 + 0.3 * R.hash(i * 5.1 + 2);
        return {
          i,
          tx: R.clamp(540 + Math.cos(a) * 520 * rf, 34, 1046),
          ty: R.clamp(960 + Math.sin(a) * 860 * rf, 150, 1790),
          sx: SH.cx + (R.hash(i * 7.3 + 3) - 0.5) * SH.w * 0.85,
          sy: SH.cy + (R.hash(i * 9.1 + 4) - 0.5) * SH.h * 0.85,
          size: 12 + R.hash(i * 2.9 + 5) * 20,
          born: T.shatter + R.hash(i * 4.4 + 6) * 0.07,
          conv: T.contract - 0.14 + R.hash(i * 6.6 + 7) * 0.16,
          spin: R.hash(i * 8.8 + 8) > 0.5 ? 1 : -1,
        };
      });
      const starLayer = (th, parent) => {
        const layer = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
        parent.appendChild(layer);
        return STARS.map((st) => {
          const e = starEl(st.size, th.stars[st.i % 3]);
          layer.appendChild(e.el);
          return e;
        });
      };
      const starsL = starLayer(TH.light, starsLHost);
      const starsD = starLayer(TH.dark, starsDHost);

      // ═════ Por cima de tudo ═════
      const top = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
      root.appendChild(top);
      const edgeCircle = s('circle', { cx: 0, cy: 0, r: 0, fill: 'none', stroke: C.teal400, 'stroke-width': 6, opacity: 0 });
      top.appendChild(s('svg', { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible', filter: 'drop-shadow(0 0 10px rgba(45,212,191,.7))' } }, edgeCircle));
      const tap = B.tap({ size: 84 });
      top.appendChild(tap.el);
      const coin = B.handoff.coin();
      top.appendChild(coin.el);
      const finalHalo = h('div', { style: { position: 'absolute', left: `${540 - 260}px`, top: `${960 - 260}px`, width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(45,212,191,.42), rgba(45,212,191,0))', opacity: '0' } });
      top.appendChild(finalHalo);
      const finalRing = h('div', { style: { position: 'absolute', left: `${540 - 90}px`, top: `${960 - 90}px`, width: '180px', height: '180px', borderRadius: '50%', border: `5px solid ${C.teal300}`, boxSizing: 'border-box', opacity: '0' } });
      top.appendChild(finalRing);
      const finalStar = h('div', { style: { position: 'absolute', left: `${540 - FS / 2}px`, top: `${(960 - FSH / 2).toFixed(2)}px`, width: `${FS}px`, height: `${FSH.toFixed(2)}px`, transformOrigin: '50% 50%', opacity: '0', willChange: 'transform' } }, B.star({ size: FS, color: C.teal }));
      top.appendChild(finalStar);

      Object.assign(S, {
        light, meshL, dotsL, camL, PL, sheetWrap, sheetShadow, shards, marker, shatterRing, semParts,
        dark, meshD, camD, PD, lockGroup, halo, shieldFill, shieldR, shieldLft, core, shackleG, shackle, ticks, clickRing, body, bodySheen, fields, GLYPHS,
        dadosParts, seals, STARS, starsL, starsD, edgeCircle, tap, coin, finalHalo, finalRing, finalStar,
      });
    },

    update(lt, t, S) {
      const { light, meshL, dotsL, camL, PL, sheetWrap, sheetShadow, shards, marker, shatterRing, semParts } = S;
      const { dark, meshD, camD, PD, lockGroup, halo, shieldFill, shieldR, shieldLft, core, shackleG, shackle, ticks, clickRing, body, bodySheen, fields, GLYPHS } = S;
      const { dadosParts, seals, STARS, starsL, starsD, edgeCircle, tap, coin, finalHalo, finalRing, finalStar } = S;

      // ── Varredura do modo escuro (decide que camadas desenhar) ──────────────
      const sweep = R.p(lt, T.click + 0.02, 0.36, SWEEP_EASE);
      const [ox, oy] = camPt(lt, SW.x, SW.y);
      const lightOn = sweep < 1;
      const darkOn = sweep > 0;
      light.style.display = lightOn ? 'block' : 'none';
      dark.style.display = darkOn ? 'block' : 'none';
      if (darkOn) dark.style.clipPath = sweep >= 1 ? 'none' : `circle(${(sweep * 1980).toFixed(1)}px at ${ox.toFixed(1)}px ${oy.toFixed(1)}px)`;
      edgeCircle.setAttribute('cx', ox.toFixed(1));
      edgeCircle.setAttribute('cy', oy.toFixed(1));
      edgeCircle.setAttribute('r', (sweep * 1980).toFixed(1));
      edgeCircle.setAttribute('opacity', sweep > 0 && sweep < 1 ? (0.95 * (1 - sweep * 0.55)).toFixed(3) : 0);

      // ── Estrelinhas: nascem dos cacos, pairam, convergem para a estrela ────
      const starState = (st) => {
        const f = R.p(lt, st.born, 0.9, E.outExpo);
        const app = R.p(lt, st.born, 0.32, E.outBack);
        const dx = st.tx - st.sx;
        const dy = st.ty - st.sy;
        const len = Math.hypot(dx, dy) || 1;
        const bend = Math.sin(f * Math.PI) * 70 * st.spin;
        let x = R.lerp(st.sx, st.tx, f) + (-dy / len) * bend;
        let y = R.lerp(st.sy, st.ty, f) + (dx / len) * bend;
        const fl = R.p(lt, st.born + 0.3, 0.8);
        x += R.noise(lt * 0.6, st.i * 1.3) * 14 * fl;
        y += R.noise(lt * 0.5, st.i * 2.1 + 40) * 18 * fl;
        let sc = app * (0.8 + 0.2 * Math.sin(lt * 3.4 + st.i * 1.7));
        let o = lt < st.born ? 0 : R.clamp(app * 1.6) * (0.75 + 0.25 * Math.sin(lt * 2.6 + st.i));
        const g = R.p(lt, st.conv, T.iris - 0.02 - st.conv, E.inCubic);
        if (g > 0) {
          const ddx = x - 540;
          const ddy = y - 960;
          const rr = Math.hypot(ddx, ddy) * (1 - g);
          const aa = Math.atan2(ddy, ddx) + g * 1.1 * st.spin;
          x = 540 + Math.cos(aa) * rr;
          y = 960 + Math.sin(aa) * rr;
          sc *= 1 - 0.55 * g;
          o = g >= 1 ? 0 : o * (1 - R.inv(0.8, 1, g)) + R.inv(0.4, 0.8, g) * (1 - R.inv(0.8, 1, g)) * 0.25;
        }
        return { x, y, sc, o, r: lt * 50 * st.spin + st.i * 17 };
      };
      STARS.forEach((st, i) => {
        const v = starState(st);
        const put = (e) => R.tf(e.el, { x: v.x - e.w / 2, y: v.y - e.h / 2, s: v.sc, r: v.r, o: v.o });
        if (lightOn) put(starsL[i]);
        if (darkOn) put(starsD[i]);
      });

      // ── Camada clara ────────────────────────────────────────────────────────
      if (lightOn) {
        meshL.update(t);
        const bgK = R.p(lt, 0.04, 0.6);
        meshL.el.style.opacity = bgK.toFixed(3);
        dotsL.style.opacity = bgK.toFixed(3);
        applyCam(camL, lt);
        updatePanel(PL, lt);

        // A moeda: antecipa, é lançada em arco com um giro e cai no encaixe.
        if (lt <= 0) {
          coin.el.style.transform = 'none';
          coin.el.style.opacity = '1';
        } else if (lt >= T.land) {
          coin.el.style.opacity = '0';
        } else {
          const antic = R.kf(lt, [[0, 0], [0.07, 1, E.outQuad], [0.14, 0, E.inOutQuad]]);
          const u = R.inv(0.07, T.land, lt);
          // Alvo: centro do encaixe no card 1 (que ainda está entrando), via câmera.
          const k1 = R.p(lt, CARD_IN[0], 0.55, E.snappy);
          const sc1 = R.lerp(0.92, 1, k1);
          const oxC = CARDS[0].x + CW / 2;
          const oyC = CARDS[0].y + CH;
          const lx = oxC + (CARDS[0].x + SLOT_L[0] - oxC) * sc1;
          const ly = oyC + (CARDS[0].y + SLOT_L[1] - oyC) * sc1 + (1 - k1) * 110;
          const [txp, typ] = camPt(lt, lx, ly);
          const x = R.lerp(COIN.cx, txp, u);
          const y = R.lerp(COIN.cy, typ, u) - 4 * 200 * u * (1 - u);
          const sc = R.lerp(1, (SLOT.d / COIN.size) * camS(lt) * sc1, E.inOutCubic(u));
          coin.el.style.opacity = '1';
          R.tf(coin.el, {
            x: x - COIN.cx,
            y: y - COIN.cy + antic * 10,
            sx: sc * (1 + 0.05 * antic),
            sy: sc * (1 - 0.09 * antic),
            ry: -42 * Math.sin(u * Math.PI * 2),
            rx: 18 * Math.sin(u * Math.PI),
            r: -180 * E.inOutCubic(u),
            persp: 900,
          });
        }

        // Planilha: volta pequena, é riscada e estilhaça.
        const shK = R.sp(lt, T.sem - 0.26, R.springs.bouncy);
        const broken = lt >= T.shatter;
        sheetWrap.style.display = lt > T.sem - 0.27 && lt < T.shatter + 0.7 ? 'block' : 'none';
        R.tf(sheetWrap, { y: (1 - shK) * 200, s: R.lerp(0.45, 1, shK) * (broken ? 1 : 1 + 0.03 * R.p(lt, T.shatter - 0.08, 0.08, E.inQuad)), r: R.lerp(-22, -5, shK), o: R.clamp(shK * 3) });
        sheetShadow.style.opacity = broken ? String(1 - R.p(lt, T.shatter, 0.06, E.linear)) : '1';
        shards.forEach((sd) => {
          const k = R.p(lt, T.shatter + sd.delay, 0.55, E.outCubic);
          if (k <= 0) {
            sd.g.removeAttribute('transform');
            sd.g.removeAttribute('opacity');
            return;
          }
          const dx = sd.ux * sd.dist * k;
          const dy = sd.uy * sd.dist * k + 80 * k * k;
          const sc = 1 - 0.85 * k;
          sd.g.setAttribute('transform', `translate(${(sd.cx + dx).toFixed(2)} ${(sd.cy + dy).toFixed(2)}) rotate(${(sd.rot * k).toFixed(2)}) scale(${sc.toFixed(3)}) translate(${(-sd.cx).toFixed(2)} ${(-sd.cy).toFixed(2)})`);
          sd.g.setAttribute('opacity', (1 - R.p(lt, T.shatter + sd.delay + 0.03, 0.2, E.linear)).toFixed(3));
        });
        const mk = R.p(lt, T.sem + 0.08, 0.24, E.inOutCubic);
        R.draw(marker, mk);
        marker.setAttribute('opacity', mk <= 0 ? 0 : (0.94 * (1 - R.p(lt, T.shatter, 0.1, E.linear))).toFixed(3));
        const rk = R.p(lt, T.shatter, 0.5, E.outCubic);
        R.tf(shatterRing, { s: R.lerp(0.3, 2.2, rk), o: broken ? (1 - rk) * 0.55 : 0 });

        // "Sem planilha." letra por letra, sai subindo quando o painel volta.
        R.reveal(semParts, lt, { start: T.sem - 0.04, stagger: 0.026, dur: 0.55, y: 110, out: { start: T.back - 0.15, stagger: 0.008, dur: 0.26, y: -150, fade: true, ease: E.inOutCubic } });
      } else {
        coin.el.style.opacity = '0';
      }

      // ── Toque no interruptor ───────────────────────────────────────────────
      tap.update(lt, T.click, ox, oy);
      tap.el.style.opacity = (1 - R.p(lt, T.click + 0.25, 0.15)).toFixed(3);

      // ── Camada escura ──────────────────────────────────────────────────────
      if (darkOn) {
        meshD.update(t);
        applyCam(camD, lt);
        updatePanel(PD, lt);

        // O painel funde num bloco e encolhe até o corpo do cadeado.
        const bodyOn = lt >= T.dados;
        body.style.display = bodyOn ? 'block' : 'none';
        const mm = morphK(lt);
        const bx = R.lerp(GRID.x, BODY.x, mm);
        const by = R.lerp(GRID.y, BODY.y, mm);
        const bw = R.lerp(GRID.w, BODY.w, mm);
        const bh = R.lerp(GRID.h, BODY.h, mm);
        Object.assign(body.style, {
          left: `${bx.toFixed(2)}px`, top: `${by.toFixed(2)}px`, width: `${bw.toFixed(2)}px`, height: `${bh.toFixed(2)}px`,
          borderRadius: `${R.lerp(GRID.r, BODY.r, mm).toFixed(2)}px`, opacity: R.inv(0.04, 0.42, mm).toFixed(3),
        });
        bodySheen.style.opacity = R.inv(0.3, 1, mm).toFixed(3);

        // Clique do arco: mola dura, o núcleo quica.
        const close = R.sp(lt, T.shut - 0.05, { k: 700, c: 26 });
        const hit = T.shut + 0.02;
        const bump = thud(lt, hit, 26, 9);
        R.tf(core, { y: 8 * bump });
        const dk = R.p(lt, T.shut - 0.34, 0.26, E.inOutCubic);
        R.draw(shackle, dk);
        shackle.style.opacity = dk > 0.001 ? '1' : '0';
        shackleG.setAttribute('transform', `translate(0 ${(-64 * (1 - close)).toFixed(2)})`);
        const ck = R.p(lt, hit, 0.4, E.outCubic);
        clickRing.setAttribute('r', (24 + ck * 70).toFixed(2));
        clickRing.setAttribute('opacity', lt < hit ? 0 : ((1 - ck) * 0.9).toFixed(3));
        ticks.forEach((ln, i) => {
          const k = R.p(lt, hit + i * 0.02, 0.32, E.outCubic);
          const a = [-0.9, -0.45, 0][i];
          const d = 6 + k * 26;
          ln.setAttribute('transform', `translate(${(706 + Math.cos(a) * d).toFixed(2)} ${(742 + Math.sin(a) * d).toFixed(2)}) rotate(${((a * 180) / Math.PI).toFixed(1)})`);
          ln.setAttribute('opacity', lt < hit ? 0 : Math.sin(Math.min(1, k * 1.3) * Math.PI).toFixed(3));
        });

        // CPF e telefone: entram, embaralham e terminam mascarados.
        fields.forEach((fd, fi) => {
          const at = T.fields + fi * 0.1;
          const k = R.p(lt, at, 0.4, E.snappy);
          R.tf(fd.wrap, { y: (1 - k) * 26, o: k });
          const frame = Math.floor(lt * 30);
          fd.chars.forEach((c, i) => {
            const res = at + 0.14 + i * 0.019;
            let txt;
            if (lt >= res) txt = c.ch;
            else {
              txt = GLYPHS[Math.floor(R.hash(i * 31.7 + frame * 7.3 + fi * 101) * GLYPHS.length)];
            }
            if (txt !== c.last) {
              c.sp.textContent = txt;
              c.sp.style.color = lt >= res ? '#FFFFFF' : C.teal300;
              c.last = txt;
            }
          });
          const endAt = at + 0.14 + fd.chars.length * 0.019;
          const ek = R.sp(lt, endAt, R.springs.bouncy);
          R.tf(fd.eye, { s: R.clamp(ek, 0, 1.4), o: R.clamp(ek * 3) });
          const glow = R.p(lt, endAt, 0.3);
          fd.box.style.boxShadow = `inset 0 0 0 2px rgba(${Math.round(R.lerp(255, 45, glow))},${Math.round(R.lerp(255, 212, glow))},${Math.round(R.lerp(255, 191, glow))},${R.lerp(0.1, 0.5, glow).toFixed(3)})`;
        });

        // Escudo se desenha em volta; halo acende.
        const sk = R.p(lt, T.shield, 0.46, E.inOutCubic);
        R.draw(shieldR, sk);
        R.draw(shieldLft, sk);
        shieldR.style.opacity = sk > 0.001 ? '1' : '0';
        shieldLft.style.opacity = sk > 0.001 ? '1' : '0';
        shieldFill.setAttribute('opacity', R.p(lt, T.shield + 0.3, 0.3).toFixed(3));
        halo.style.opacity = (R.p(lt, T.dados + 0.2, 0.5) * 0.6 + R.p(lt, hit, 0.3) * 0.4 * (1 - R.p(lt, hit + 0.3, 0.5)) + R.p(lt, T.shield, 0.5) * 0.3).toFixed(3);

        // No fim, o cadeado e o escudo se contraem na estrela do centro.
        const c = R.p(lt, T.contract, 0.32, E.inOutCubic);
        R.tf(lockGroup, { y: (960 - LOCK_O.y) * c, s: R.lerp(1, 0.05, c), r: 24 * c, o: 1 - R.p(lt, T.contract + 0.18, 0.12, E.linear) });

        // "Dados protegidos." por palavra.
        R.reveal(dadosParts, lt, { start: T.dados + 0.12, stagger: 0.12, dur: 0.6, y: 110, out: { start: T.contract - 0.02, stagger: 0.05, dur: 0.28, y: -150, fade: true, ease: E.inOutCubic } });

        // Selos sobem da máscara, um por tempo; o ícone brota.
        seals.forEach((sl, i) => {
          const k = R.p(lt, T.seals[i], 0.5, E.snappy);
          sl.pill.style.transform = `translate3d(0, ${((1 - k) * 110).toFixed(2)}%, 0)`;
          const ik = R.sp(lt, T.seals[i] + 0.1, R.springs.bouncy);
          R.tf(sl.ic, { s: R.clamp(ik, 0, 1.4), r: (1 - R.clamp(ik)) * -40 });
        });
      }

      // ── Estrela final (a íris do endcard nasce dela em 39,7) ───────────────
      if (lt >= T.iris) {
        finalStar.style.transform = 'none';
        finalStar.style.opacity = '1';
      } else {
        const g = R.p(lt, T.starIn, T.iris - T.starIn, E.outBack);
        const rr = 1 - R.p(lt, T.starIn, T.iris - T.starIn, E.snappy);
        finalStar.style.opacity = lt >= T.starIn ? '1' : '0';
        R.tf(finalStar, { s: Math.max(0, g), r: rr * -120 });
      }
      finalHalo.style.opacity = (R.p(lt, T.starIn, 0.3) * (0.85 + 0.15 * Math.sin(lt * 4))).toFixed(3);
      const fr = R.p(lt, T.iris - 0.08, 0.4, E.outCubic);
      R.tf(finalRing, { s: R.lerp(0.8, 2.6, fr), o: lt < T.iris - 0.08 ? 0 : (1 - fr) * 0.7 });
    },
  });
})();
