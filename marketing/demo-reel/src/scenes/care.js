/*
 * Cena "care" (global 17,0–22,5): o cartão confirmado da Mariana desliza e
 * vira uma linha da "Sala de espera". Ela chega (relógio girando, chip "Na
 * sala de espera"), a recepção acompanha a fila andar e, quando ela entra
 * ("Em atendimento"), um círculo menta cresce do chip e abre a ficha clínica:
 * histórico, abas e o odontograma desenhado dente a dente. O dedo marca o 16
 * e o 26 (Restauração); no fim os dois dentes se soltam e viram as pílulas
 * da passagem para o orçamento.
 *
 * Passagens: começa com B.handoff.patientCard({status: 'confirmed'}) e termina
 * com B.handoff.toothChips(), os dois sem transform, sobre o branco quente.
 */
(() => {
  const { h, s } = R;
  const E = R.ease;
  const C = B.C;
  const TL = window.TIMELINE;
  const T0 = TL.care.start;
  const EV = TL.events;
  const L = (g) => g - T0; // global → local
  const VO = Object.fromEntries(TL.vo.map((v) => [v.id, { start: L(v.start), end: L(v.end) }]));
  const DUR = TL.care.end - TL.care.start; // 5,5

  // ── Tempos locais (todos derivados do TIMELINE) ─────────────────────────────
  const T = {
    arrived: L(EV.arrived), // 0,40 — chegou (trilho: Sala de espera)
    inProgress: L(EV.inProgress), // 2,20 — Em atendimento
    ficha: L(EV.fichaOpens), // 2,60 — sublinha vai para Odontograma
    teeth: L(EV.teeth), // 3,40 — cascata dos dentes
    attended: L(EV.attended), // 4,90 — Atendido
  };
  T.call = T.arrived + 0.6; // 1,00 Carlos é chamado
  T.leave = T.call + 0.28; // 1,28 a linha dele sai
  T.reflow = T.call + 0.36; // 1,36 a fila sobe
  T.wipe = T.inProgress + 0.06; // 2,26 o círculo menta cresce do chip
  T.base = T.wipe + 0.16; // 2,42 cascata da ficha
  T.tap16 = T.teeth + 0.5; // 3,90 (20,9)
  T.tap26 = T.teeth + 0.9; // 4,30 (21,3)
  T.title1 = VO.p8.start + 0.08; // 0,28
  T.title1Out = T.inProgress - 0.14; // 2,06
  T.title2 = T.wipe + 0.24; // 2,50
  T.title2Out = T.teeth - 0.16; // 3,24
  T.title3 = T.teeth + 0.2; // 3,60 (20,6) "Dente a dente"
  T.exit = DUR - 0.5; // 5,00
  T.settle = DUR - 0.06; // 5,44 tudo parado na geometria da passagem

  // ── Geometria ───────────────────────────────────────────────────────────────
  const PG = B.handoff.PATIENT_CARD; // {x:100, y:850, w:880, h:220}
  const PANEL = { x: 70, y: 540, w: 940 };
  const ROW_H = 220;
  const ROW_GAP = 16;
  const HEAD_H = 170;
  const rowY = (i) => PANEL.y + HEAD_H + i * (ROW_H + ROW_GAP); // 710, 946, 1182
  const panelH = (n) => HEAD_H + n * ROW_H + (n - 1) * ROW_GAP + 30;
  const O_A = { x: 812, y: rowY(1) + ROW_H / 2 }; // câmera da sala mira o chip da Mariana

  const FICHA = { x: 90, y: 510, w: 900, h: 1040 };
  const O_F = { x: 540, y: 1030 };
  const PLANE_Y = 490; // topo do odontograma dentro da ficha
  const PLANE_H = 500;
  const MID = 450; // linha média (x no plano)
  const NUM_U = 30; // linha dos números FDI de cima
  const OCC_U = 200; // borda incisal superior no centro
  const GAP = 112; // espaço entre as arcadas (onde ficam as etiquetas)
  const OCC_L = OCC_U + GAP;
  const NUM_L = 476;
  const CURVE = 20; // a arcada sobe para os lados (sorriso)
  const HALF = 410;
  const MM = 5.4; // px por milímetro
  const ROOT_K = 0.82;
  const TAG_S = 0.68; // etiqueta = a própria pílula da passagem em escala
  const PILLS = B.handoff.TOOTH_CHIPS;

  const curveY = (x) => -CURVE * Math.pow((x - MID) / HALF, 2);
  const curveA = (x) => (Math.atan((-2 * CURVE * (x - MID)) / (HALF * HALF)) * 180) / Math.PI;

  // Dentes por posição (1 = central … 8 = terceiro molar): largura, coroa, raiz (mm).
  const UPPER = [
    ['inc', 8.6, 10.5, 13], ['inc', 6.6, 9, 13], ['can', 7.6, 10, 17], ['pm', 7.0, 8.5, 14],
    ['pm', 6.8, 8, 14], ['mol', 10.2, 7.5, 12.5], ['mol', 9.2, 7.2, 12], ['mol', 8.6, 6.8, 11],
  ];
  const LOWER = [
    ['inc', 5.4, 9, 12.5], ['inc', 5.9, 9.5, 14], ['can', 6.9, 11, 16], ['pm', 7.0, 8.5, 14],
    ['pm', 7.2, 8, 14.5], ['mol', 11, 7.5, 14], ['mol', 10.5, 7, 13], ['mol', 10, 7, 11],
  ];

  // ── Ajudantes ──────────────────────────────────────────────────────────────
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, k) => {
    const A = rgb(a);
    const Bc = rgb(b);
    return `rgb(${A.map((v, i) => Math.round(R.lerp(v, Bc[i], R.clamp(k)))).join(',')})`;
  };
  /** R.tf, mas grava "none" quando a transformação é a identidade. */
  const tfx = (el, p) => {
    R.tf(el, p);
    const id = !p.x && !p.y && (p.s ?? 1) === 1 && p.sx == null && p.sy == null && !p.r && !p.rx && !p.ry && !p.persp;
    if (id) el.style.transform = 'none';
  };
  const text = (t, size, weight, color, extra = {}) =>
    h('span', { style: { font: `${weight} ${size}px/1.1 ${B.FONT}`, color, letterSpacing: '-0.015em', whiteSpace: 'nowrap', fontFeatureSettings: '"tnum" 1', ...extra } }, t);

  /** Relógio pequeno com ponteiros que giram (desenhado à mão). */
  const makeClock = (size, color) => {
    const el = s('svg', { viewBox: '0 0 24 24', width: size, height: size, style: { display: 'block', flex: 'none', overflow: 'visible' } });
    const face = s('circle', { cx: 12, cy: 12, r: 10, fill: 'none', stroke: color, 'stroke-width': 2.2 });
    const hr = s('line', { x1: 12, y1: 12, x2: 12, y2: 7.8, stroke: color, 'stroke-width': 2.4, 'stroke-linecap': 'round' });
    const mn = s('line', { x1: 12, y1: 12, x2: 12, y2: 5.4, stroke: color, 'stroke-width': 2.1, 'stroke-linecap': 'round' });
    const hub = s('circle', { cx: 12, cy: 12, r: 1.5, fill: color });
    el.append(face, hr, mn, hub);
    return {
      el,
      set(minDeg, hrDeg) {
        mn.setAttribute('transform', `rotate(${minDeg.toFixed(2)} 12 12)`);
        hr.setAttribute('transform', `rotate(${hrDeg.toFixed(2)} 12 12)`);
      },
    };
  };

  const stChip = (key, label, size = 28, pad = 20) => B.chip(label, { bg: C[key].bg, fg: C[key].fg, dot: C[key].dot, size, pad });

  /**
   * Troca de chips empilhados: o anterior encolhe e some, o novo entra com
   * mola e um pouco de overshoot. list = [{el, at}] em ordem; o primeiro já
   * está na tela.
   */
  const chipSeq = (list, lt) => {
    list.forEach((c, i) => {
      const next = list[i + 1];
      const out = next ? R.p(lt, next.at, 0.07, E.linear) : 0;
      if (i === 0) {
        if (out <= 0) {
          c.el.style.transform = 'none';
          c.el.style.opacity = '1';
        } else R.tf(c.el, { s: 1 - 0.3 * out, o: 1 - out });
        return;
      }
      if (lt < c.at) {
        c.el.style.opacity = '0';
        return;
      }
      const k = R.sp(lt, c.at, R.springs.bouncy);
      R.tf(c.el, { s: R.lerp(0.62, 1, k) * (1 - 0.3 * out), o: R.clamp((lt - c.at - 0.02) / 0.05) * (1 - out) });
    });
  };

  // ── Dentes (vista vestibular, desenhados à mão) ─────────────────────────────
  /**
   * Contorno de um dente: y = 0 na borda incisal/oclusal; a raiz vai para -y
   * (sy = 1, arcada superior) ou para +y (sy = -1, inferior).
   */
  function toothShape(type, W, CH, RH, sy) {
    const P = (x, y) => `${x.toFixed(1)} ${(y * sy).toFixed(1)}`;
    const n = (type === 'mol' ? 0.4 : type === 'can' ? 0.34 : 0.36) * W;
    let crown; // do colo esquerdo, pela borda, até o colo direito
    if (type === 'inc') {
      crown = `C ${P(-0.47 * W, -0.8 * CH)} ${P(-0.53 * W, -0.42 * CH)} ${P(-0.5 * W, -0.14 * CH)} Q ${P(-0.49 * W, 0)} ${P(-0.36 * W, 0.01 * CH)} Q ${P(0, 0.05 * CH)} ${P(0.36 * W, 0.01 * CH)} Q ${P(0.49 * W, 0)} ${P(0.5 * W, -0.14 * CH)} C ${P(0.53 * W, -0.42 * CH)} ${P(0.47 * W, -0.8 * CH)} ${P(n, -CH)}`;
    } else if (type === 'can') {
      crown = `C ${P(-0.48 * W, -0.85 * CH)} ${P(-0.54 * W, -0.45 * CH)} ${P(-0.5 * W, -0.28 * CH)} Q ${P(-0.42 * W, -0.08 * CH)} ${P(-0.16 * W, 0.04 * CH)} Q ${P(0, 0.14 * CH)} ${P(0.16 * W, 0.04 * CH)} Q ${P(0.42 * W, -0.08 * CH)} ${P(0.5 * W, -0.28 * CH)} C ${P(0.54 * W, -0.45 * CH)} ${P(0.48 * W, -0.85 * CH)} ${P(n, -CH)}`;
    } else if (type === 'pm') {
      crown = `C ${P(-0.5 * W, -0.82 * CH)} ${P(-0.55 * W, -0.42 * CH)} ${P(-0.48 * W, -0.2 * CH)} Q ${P(-0.36 * W, 0)} ${P(-0.12 * W, 0.04 * CH)} Q ${P(0, 0.09 * CH)} ${P(0.12 * W, 0.04 * CH)} Q ${P(0.36 * W, 0)} ${P(0.48 * W, -0.2 * CH)} C ${P(0.55 * W, -0.42 * CH)} ${P(0.5 * W, -0.82 * CH)} ${P(n, -CH)}`;
    } else {
      crown = `C ${P(-0.5 * W, -0.86 * CH)} ${P(-0.55 * W, -0.5 * CH)} ${P(-0.5 * W, -0.2 * CH)} Q ${P(-0.47 * W, 0.06 * CH)} ${P(-0.26 * W, 0.06 * CH)} Q ${P(-0.06 * W, 0.06 * CH)} ${P(0, -0.05 * CH)} Q ${P(0.06 * W, 0.06 * CH)} ${P(0.26 * W, 0.06 * CH)} Q ${P(0.47 * W, 0.06 * CH)} ${P(0.5 * W, -0.2 * CH)} C ${P(0.55 * W, -0.5 * CH)} ${P(0.5 * W, -0.86 * CH)} ${P(n, -CH)}`;
    }
    const A = -(CH + RH);
    let root; // do colo direito, pelo ápice, até o colo esquerdo
    if (type === 'mol') {
      root = `C ${P(0.43 * W, -(CH + 0.4 * RH))} ${P(0.39 * W, -(CH + 0.85 * RH))} ${P(0.3 * W, A)} Q ${P(0.24 * W, A - 0.05 * RH)} ${P(0.17 * W, -(CH + 0.95 * RH))} C ${P(0.13 * W, -(CH + 0.7 * RH))} ${P(0.1 * W, -(CH + 0.36 * RH))} ${P(0, -(CH + 0.3 * RH))} C ${P(-0.1 * W, -(CH + 0.36 * RH))} ${P(-0.13 * W, -(CH + 0.7 * RH))} ${P(-0.17 * W, -(CH + 0.95 * RH))} Q ${P(-0.24 * W, A - 0.05 * RH)} ${P(-0.3 * W, A)} C ${P(-0.39 * W, -(CH + 0.85 * RH))} ${P(-0.43 * W, -(CH + 0.4 * RH))} ${P(-n, -CH)}`;
    } else {
      const tip = (type === 'can' ? 0.07 : 0.08) * W;
      root = `C ${P(n * 0.92, -(CH + 0.45 * RH))} ${P(0.2 * W, -(CH + 0.9 * RH))} ${P(tip, A)} Q ${P(0, A - 0.045 * RH)} ${P(-tip, A)} C ${P(-0.2 * W, -(CH + 0.9 * RH))} ${P(-n * 0.92, -(CH + 0.45 * RH))} ${P(-n, -CH)}`;
    }
    const cejLR = `Q ${P(0, -CH * 1.22)} ${P(n, -CH)}`;
    const cejRL = `Q ${P(0, -CH * 1.22)} ${P(-n, -CH)}`;
    const L0 = `M ${P(-n, -CH)}`;
    const R0 = `M ${P(n, -CH)}`;
    return {
      outline: `${L0} ${crown} ${root} Z`,
      crown: `${L0} ${crown} ${cejRL} Z`,
      root: `${R0} ${root} ${cejLR} Z`,
      cej: `${L0} ${cejLR}`,
    };
  }

  /** Monta o <g> de um dente (raiz, coroa, colo, contorno, brilho). */
  function toothGroup(t, glowId) {
    const sh = toothShape(t.type, t.W, t.CH, t.RH, t.upper ? 1 : -1);
    const glow = s('ellipse', { cx: 0, cy: (-t.H / 2) * (t.upper ? 1 : -1), rx: t.W * 1.25, ry: t.H * 0.75, fill: `url(#${glowId})`, opacity: 0 });
    const root = s('path', { d: sh.root, fill: '#F3F1EB', stroke: 'none' });
    const crown = s('path', { d: sh.crown, fill: '#FFFFFF', stroke: 'none' });
    const cej = s('path', { d: sh.cej, fill: 'none', stroke: C.navy, 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0.32 });
    const outline = s('path', { d: sh.outline, fill: 'none', stroke: C.navy, 'stroke-width': 4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    const inner = s('g', {}, glow, root, crown, cej, outline);
    return { inner, glow, root, crown, cej, outline };
  }

  R.scene({
    id: 'care',
    build(root, S) {
      root.style.background = C.warm;

      // ════════════════ 1) Sala de espera ════════════════
      const layerA = h('div', { style: { position: 'absolute', inset: 0 } });
      root.appendChild(layerA);
      const meshA = B.mesh({
        base: 'transparent',
        blobs: [
          { x: 160, y: 520, r: 560, color: 'rgba(167,227,193,.34)' },
          { x: 960, y: 1500, r: 620, color: 'rgba(20,184,166,.10)' },
          { x: 900, y: 600, r: 420, color: 'rgba(139,92,246,.06)' },
        ],
      });
      layerA.appendChild(meshA.el);
      const camA = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: `${O_A.x}px ${O_A.y}px` } });
      layerA.appendChild(camA);

      // Painel (cresce a partir do cartão).
      const panel = B.card({ w: PG.w, h: PG.h, r: 52, shadow: 'xl', style: { left: `${PG.x}px`, top: `${PG.y}px`, opacity: '0', overflow: 'hidden' } });
      camA.appendChild(panel);
      const tile = B.abs(
        h(
          'div',
          { style: { borderRadius: '26px', background: C.teal100, display: 'flex', alignItems: 'center', justifyContent: 'center', transformOrigin: '50% 50%' } },
          B.icon('armchair', { size: 48, color: C.teal700, sw: 2.1 }),
        ),
        40, 40, 90, 90,
      );
      const headTitle = h('div', { style: { position: 'absolute', left: '152px', top: '40px', font: `800 50px/1.05 ${B.DISPLAY}`, letterSpacing: '-0.035em', color: C.ink, whiteSpace: 'nowrap' } });
      const headParts = R.split(headTitle, 'Sala de espera');
      const headSub = h(
        'div',
        { style: { position: 'absolute', left: '152px', top: '100px', display: 'flex', alignItems: 'center', gap: '10px', font: `500 28px/1 ${B.FONT}`, color: C.muted, whiteSpace: 'nowrap' } },
        'Hoje · Clínica Aurora',
      );
      // Contador "N aguardando" com número que rola.
      const DIG = 36;
      const reelInner = h('span', { style: { display: 'block' } }, ...['2', '3', '2'].map((d) => h('span', { style: { display: 'block', height: `${DIG}px`, lineHeight: `${DIG}px` } }, d)));
      const reel = h('span', { style: { display: 'inline-block', height: `${DIG}px`, overflow: 'hidden' } }, reelInner);
      const liveDot = h('span', { style: { width: '14px', height: '14px', borderRadius: '50%', background: C.arrived.dot, flex: 'none' } });
      const liveRing = h('span', { style: { position: 'absolute', left: '22px', top: '50%', width: '14px', height: '14px', marginTop: '-7px', borderRadius: '50%', border: `3px solid ${C.arrived.dot}`, boxSizing: 'border-box' } });
      const count = h(
        'div',
        {
          style: {
            position: 'absolute', right: '40px', top: '58px', display: 'inline-flex', alignItems: 'center', gap: '12px', height: '56px', padding: '0 24px 0 22px',
            borderRadius: '999px', background: C.arrived.bg, color: C.arrived.fg, font: `600 28px/1 ${B.FONT}`, letterSpacing: '-0.01em', whiteSpace: 'nowrap', transformOrigin: '100% 50%',
            fontFeatureSettings: '"tnum" 1',
          },
        },
        liveRing,
        liveDot,
        h('span', { style: { display: 'inline-flex', alignItems: 'center' } }, reel, h('span', { text: ' aguardando' })),
      );
      const headLine = h('div', { style: { position: 'absolute', left: '40px', right: '40px', top: `${HEAD_H - 14}px`, height: '2px', background: C.warm100, transformOrigin: '0 50%' } });
      panel.append(tile, headTitle, headSub, count, headLine);

      // Linhas dos outros pacientes (atrás do cartão da Mariana).
      const makeRow = ({ initials, av, name, time }) => {
        const clock = makeClock(30, C.muted);
        const chipBox = h('div', { style: { position: 'relative', flex: 'none', width: '232px', display: 'flex', justifyContent: 'flex-end' } });
        const chA = stChip('arrived', 'Na sala de espera');
        const chP = stChip('inProgress', 'Em atendimento');
        Object.assign(chP.style, { position: 'absolute', right: '0', top: '0', opacity: '0' });
        chipBox.append(chA, chP);
        const el = B.card(
          {
            w: PG.w, h: ROW_H, r: 44, shadow: '0 2px 6px rgba(11,31,63,.04), inset 0 0 0 2px #EEECE6', bg: '#FFFFFF',
            style: { left: `${PG.x}px`, top: '0px', display: 'flex', alignItems: 'center', gap: '28px', padding: '0 40px', opacity: '0', transformOrigin: '50% 50%' },
          },
          B.avatar(initials, { size: 104, bg: av[0], fg: av[1] }),
          h(
            'div',
            { style: { flex: '1', minWidth: '0', whiteSpace: 'nowrap' } },
            B.text(name, { size: 44, weight: 700, color: C.ink, ls: '-0.025em', style: { whiteSpace: 'nowrap' } }),
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' } },
              clock.el,
              text('chegou às ', 30, 500, C.muted),
              text(time, 30, 700, C.ink, { marginLeft: '-2px' }),
            ),
          ),
          chipBox,
        );
        return { el, clock, chips: [chA, chP] };
      };
      const carlos = makeRow({ initials: 'CL', av: [C.teal100, C.teal800], name: 'Carlos Lima', time: '14:05' });
      const ana = makeRow({ initials: 'AS', av: [C.warm200, C.navy], name: 'Ana Souza', time: '14:12' });
      camA.append(carlos.el, ana.el);

      // O cartão da passagem vira a linha da Mariana.
      const card = B.handoff.patientCard({ status: 'confirmed' });
      camA.appendChild(card.el);
      const textCol = card.el.children[1];
      const oldSub = textCol.children[1];
      textCol.style.position = 'relative';
      const chipBox = card.el.children[2];
      const chArr = stChip('arrived', 'Na sala de espera');
      const chProg = stChip('inProgress', 'Em atendimento');
      for (const c of [chArr, chProg]) {
        Object.assign(c.style, { position: 'absolute', right: '0', top: '0', opacity: '0', transformOrigin: '50% 50%' });
        chipBox.appendChild(c);
      }
      card.chips.confirmed.style.transformOrigin = '50% 50%';
      const mClock = makeClock(30, C.arrived.dot);
      const newSub = h(
        'div',
        { style: { position: 'absolute', left: '0', top: '60.4px', display: 'flex', alignItems: 'center', gap: '10px', opacity: '0' } },
        mClock.el,
        text('chegou às ', 30, 500, C.muted),
        text('14:22', 30, 700, C.ink, { marginLeft: '-2px' }),
      );
      textCol.appendChild(newSub);
      // Onda que sai do chip quando a situação muda.
      const chipRing = h('div', { style: { position: 'absolute', left: '0', top: '0', width: '100px', height: '53px', borderRadius: '999px', border: `3px solid ${C.arrived.dot}`, boxSizing: 'border-box', opacity: '0' } });
      camA.appendChild(chipRing);

      // ════════════════ 2) Círculo menta → ficha clínica ════════════════
      const mint = h('div', { style: { position: 'absolute', inset: 0, background: C.mint, display: 'none' } });
      root.appendChild(mint);
      const layerF = h('div', { style: { position: 'absolute', inset: 0, background: C.warm, display: 'none' } });
      root.appendChild(layerF);
      // O chip "Em atendimento" fica por cima do círculo enquanto ele cresce.
      const chipClone = stChip('inProgress', 'Em atendimento');
      Object.assign(chipClone.style, { position: 'absolute', left: '0', top: '0', display: 'none', transformOrigin: '50% 50%', boxShadow: '0 12px 30px -10px rgba(30,58,138,.35)' });
      root.appendChild(chipClone);
      const meshF = B.mesh({
        base: 'transparent',
        blobs: [
          { x: 120, y: 700, r: 600, color: 'rgba(167,227,193,.40)' },
          { x: 980, y: 1380, r: 640, color: 'rgba(20,184,166,.12)' },
          { x: 900, y: 420, r: 420, color: 'rgba(15,59,130,.05)' },
        ],
      });
      layerF.appendChild(meshF.el);
      const camF = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: `${O_F.x}px ${O_F.y}px` } });
      layerF.appendChild(camF);
      const ficha = B.card({ w: FICHA.w, h: FICHA.h, r: 48, shadow: 'xl', style: { left: `${FICHA.x}px`, top: `${FICHA.y}px`, transformOrigin: '50% 40%' } });
      camF.appendChild(ficha);

      // Cabeçalho.
      const fAvatar = B.abs(B.avatar('MC', { size: 104, bg: C.mint, fg: C.navy }), 44, 40);
      fAvatar.style.transformOrigin = '50% 50%';
      const fName = h('div', { style: { position: 'absolute', left: '172px', top: '42px', font: `800 50px/1.05 ${B.DISPLAY}`, letterSpacing: '-0.035em', color: C.ink, whiteSpace: 'nowrap' } });
      const fNameParts = R.split(fName, 'Mariana Costa');
      const stBox = h('span', { style: { position: 'relative', display: 'inline-flex', flex: 'none' } });
      const fProg = stChip('inProgress', 'Em atendimento', 24, 16);
      const fDone = stChip('attended', 'Atendido', 24, 16);
      Object.assign(fDone.style, { position: 'absolute', left: '0', top: '0', opacity: '0' });
      fProg.style.transformOrigin = '0% 50%';
      fDone.style.transformOrigin = '30% 50%';
      stBox.append(fProg, fDone);
      const fSub = h(
        'div',
        { style: { position: 'absolute', left: '172px', top: '104px', display: 'flex', alignItems: 'center', gap: '14px', opacity: '0' } },
        text('Avaliação · Dra. Paula', 28, 500, C.muted),
        stBox,
      );
      const fFin = B.chip('Financeiro em dia', { bg: C.mint, fg: C.navy, icon: 'circle-check', size: 27, pad: 20, weight: 650 });
      Object.assign(fFin.style, { position: 'absolute', right: '44px', top: '44px', transformOrigin: '50% 50%', opacity: '0' });
      const fLine1 = h('div', { style: { position: 'absolute', left: '44px', right: '44px', top: '178px', height: '2px', background: C.warm100, transformOrigin: '0 50%' } });
      ficha.append(fAvatar, fName, fSub, fFin, fLine1);

      // Histórico (linha do tempo).
      const hLabel = h(
        'div',
        { style: { position: 'absolute', left: '44px', top: '200px', display: 'flex', alignItems: 'center', gap: '10px', font: `700 24px/1 ${B.FONT}`, letterSpacing: '0.08em', color: C.muted2, opacity: '0' } },
        B.icon('history', { size: 28, color: C.muted2, sw: 2.2 }),
        'HISTÓRICO',
      );
      ficha.appendChild(hLabel);
      const HX = [140, 450, 760];
      const HY = 268;
      const hSvg = s('svg', { width: 900, height: 60, viewBox: `0 ${HY - 30} 900 60`, style: { position: 'absolute', left: '0', top: `${HY - 30}px`, overflow: 'visible' } });
      const hBase = s('path', { d: `M ${HX[0]} ${HY} H ${HX[2]}`, stroke: C.warm200, 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' });
      const hProg = s('path', { d: `M ${HX[0]} ${HY} H ${HX[2]}`, stroke: C.teal, 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' });
      hSvg.append(hBase, hProg);
      ficha.appendChild(hSvg);
      const HIST = [
        ['12/03', 'Limpeza'],
        ['08/06', 'Raio-X'],
        ['Hoje', 'Avaliação'],
      ];
      const hItems = HIST.map(([d, p], i) => {
        const today = i === 2;
        const dot = h('div', {
          style: {
            position: 'absolute', left: `${HX[i] - (today ? 16 : 12)}px`, top: `${HY - (today ? 16 : 12)}px`, width: `${today ? 32 : 24}px`, height: `${today ? 32 : 24}px`, borderRadius: '50%',
            background: today ? C.mint : C.teal700, border: `${today ? 5 : 4}px solid ${today ? C.teal700 : '#fff'}`, boxShadow: today ? 'none' : `0 0 0 2px ${C.teal700}`, boxSizing: 'border-box', transformOrigin: '50% 50%',
          },
        });
        const ring = today ? h('div', { style: { position: 'absolute', left: `${HX[i] - 16}px`, top: `${HY - 16}px`, width: '32px', height: '32px', borderRadius: '50%', border: `3px solid ${C.teal}`, boxSizing: 'border-box', opacity: '0' } }) : null;
        const lab = h(
          'div',
          { style: { position: 'absolute', left: `${HX[i] - 120}px`, width: '240px', top: `${HY + 26}px`, textAlign: 'center', whiteSpace: 'nowrap' } },
          h('div', { style: { font: `700 30px/1.1 ${B.FONT}`, color: today ? C.teal700 : C.ink, letterSpacing: '-0.015em', fontFeatureSettings: '"tnum" 1' } }, d),
          h('div', { style: { font: `500 26px/1.1 ${B.FONT}`, color: C.muted, marginTop: '4px', letterSpacing: '-0.01em' } }, p),
        );
        if (ring) ficha.appendChild(ring);
        ficha.append(dot, lab);
        return { dot, ring, lab };
      });

      // Abas.
      const tabRow = h('div', { style: { position: 'absolute', left: '44px', top: '390px', display: 'flex', gap: '52px', whiteSpace: 'nowrap' } });
      const tabs = ['Ficha', 'Odontograma', 'Financeiro'].map((t) => h('span', { style: { font: `650 32px/1.2 ${B.FONT}`, letterSpacing: '-0.02em', color: C.muted2, display: 'inline-block' } }, t));
      tabRow.append(...tabs);
      const tabLine = h('div', { style: { position: 'absolute', left: '44px', right: '44px', top: '456px', height: '2px', background: C.warm100 } });
      const tabBar = h('div', { style: { position: 'absolute', left: '0', top: '452px', height: '6px', width: '10px', borderRadius: '3px', background: C.teal } });
      ficha.append(tabRow, tabLine, tabBar);

      // Odontograma: plano 2,5D com bandeja, linha média e 32 dentes.
      const plane = h('div', { style: { position: 'absolute', left: '0', top: `${PLANE_Y}px`, width: `${FICHA.w}px`, height: `${PLANE_H}px`, transformOrigin: '50% 70%', opacity: '0' } });
      const tray = h('div', { style: { position: 'absolute', left: '24px', right: '24px', top: '-12px', bottom: '-26px', borderRadius: '34px', background: '#FBFAF7', boxShadow: 'inset 0 0 0 2px #F0EEE8' } });
      plane.appendChild(tray);
      const svg = s('svg', { width: FICHA.w, height: PLANE_H, viewBox: `0 0 ${FICHA.w} ${PLANE_H}`, style: { position: 'absolute', left: '0', top: '0', overflow: 'visible' } });
      const defs = s('defs', {});
      defs.innerHTML =
        '<radialGradient id="careGlow"><stop offset="0" stop-color="#14B8A6" stop-opacity=".55"/><stop offset=".55" stop-color="#14B8A6" stop-opacity=".18"/><stop offset="1" stop-color="#14B8A6" stop-opacity="0"/></radialGradient>';
      svg.appendChild(defs);
      const midV = s('path', { d: `M ${MID} ${NUM_U + 24} V ${NUM_L - 24}`, stroke: C.warm300, 'stroke-width': 2.5, 'stroke-dasharray': '2 12', 'stroke-linecap': 'round', fill: 'none' });
      svg.appendChild(midV);
      plane.appendChild(svg);
      ficha.appendChild(plane);

      const teeth = [];
      for (const upper of [true, false]) {
        const DATA = upper ? UPPER : LOWER;
        for (const side of [-1, 1]) {
          let cur = MID + side * 0.7 * MM;
          DATA.forEach(([type, wmm, chmm, rhmm], j) => {
            const W = wmm * MM;
            const CH = chmm * MM;
            const RH = rhmm * MM * ROOT_K;
            const x = cur + side * (W / 2);
            cur += side * (W + 0.9 * MM);
            const occ = (upper ? OCC_U : OCC_L) + curveY(x);
            const q = upper ? (side < 0 ? 1 : 2) : side < 0 ? 4 : 3;
            const t = { type, W, CH, RH, H: CH + RH, x, occ, ang: curveA(x), upper, j, k: 2 * j + (side > 0 ? 1 : 0), fdi: `${q}${j + 1}` };
            const g = toothGroup(t, 'careGlow');
            const outer = s('g', { transform: `translate(${x.toFixed(2)} ${occ.toFixed(2)}) rotate(${t.ang.toFixed(3)})` }, g.inner);
            svg.appendChild(outer);
            const ny = upper ? NUM_U : NUM_L;
            const num = s('text', {
              x: x.toFixed(1), y: ny.toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'central',
              style: `font: 600 24px ${B.FONT}; font-feature-settings: "tnum" 1; letter-spacing: -0.01em`, fill: C.muted2, opacity: 0,
            }, t.fdi);
            svg.appendChild(num);
            Object.assign(t, g, { outer, num, ny });
            teeth.push(t);
          });
        }
      }
      const tooth = (fdi) => teeth.find((t) => t.fdi === fdi);
      const sel = [tooth('16'), tooth('26')];

      // ════════════════ 3) Camada de voo (etiquetas, dentes que voam, faísca) ════════════════
      const fly = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } });
      root.appendChild(fly);
      const pills = B.handoff.toothChips();
      pills.forEach((p) => {
        p.el.style.display = 'none';
        fly.appendChild(p.el);
      });
      const flySvg = s('svg', { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible', display: 'none', zIndex: '10' } });
      const flyDefs = s('defs', {});
      flyDefs.innerHTML =
        '<radialGradient id="careGlowF"><stop offset="0" stop-color="#14B8A6" stop-opacity=".55"/><stop offset=".55" stop-color="#14B8A6" stop-opacity=".18"/><stop offset="1" stop-color="#14B8A6" stop-opacity="0"/></radialGradient>';
      flySvg.appendChild(flyDefs);
      const flyers = sel.map((t) => {
        const g = toothGroup(t, 'careGlowF');
        g.crown.setAttribute('fill', C.teal);
        g.root.setAttribute('fill', C.teal400);
        g.outline.setAttribute('stroke', C.mint);
        g.cej.setAttribute('stroke', '#FFFFFF');
        g.cej.setAttribute('opacity', '0.55');
        g.glow.setAttribute('opacity', '0.9');
        const outer = s('g', {}, g.inner);
        flySvg.appendChild(outer);
        return { t, g, outer };
      });
      fly.appendChild(flySvg);
      // Faísca de "Atendido".
      const spark = h('div', { style: { position: 'absolute', left: '0', top: '0', width: '0', height: '0', display: 'none' } });
      const sparkRing = h('div', { style: { position: 'absolute', left: '-40px', top: '-40px', width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${C.attended.dot}`, boxSizing: 'border-box' } });
      spark.appendChild(sparkRing);
      const sparkStars = Array.from({ length: 8 }, (_, i) => {
        const st = h('div', { style: { position: 'absolute', left: '0', top: '0' } }, B.star({ size: i % 2 ? 22 : 32, color: [C.teal, C.attended.dot, C.teal400, C.mint][i % 4] }));
        spark.appendChild(st);
        return st;
      });
      const bigStar = h('div', { style: { position: 'absolute', left: '-22px', top: '-23px' } }, B.star({ size: 44, color: C.teal, glow: 8 }));
      spark.appendChild(bigStar);
      fly.appendChild(spark);

      // ════════════════ 4) Títulos ════════════════
      const titles = ['A recepção acompanha', 'Ficha clínica completa', 'Dente a dente'].map((t) => {
        const hl = B.headline(t, { size: 80, width: 980, color: C.navy });
        B.abs(hl.el, 50, 386);
        root.appendChild(hl.el);
        return hl;
      });

      // ════════════════ 5) Toques ════════════════
      const taps = [B.tap({ size: 84 }), B.tap({ size: 84 })];
      taps.forEach((tp) => root.appendChild(tp.el));

      Object.assign(S, {
        layerA, meshA, camA, panel, tile, headParts, headSub, count, reelInner, liveRing, headLine, carlos, ana, card, oldSub, newSub, chArr, chProg, mClock, chipRing,
        mint, layerF, chipClone, meshF, camF, ficha, fAvatar, fNameParts, fSub, fProg, fDone, stBox, fFin, fLine1, hLabel, hProg, hItems, tabs, tabBar, plane, midV, teeth, sel,
        fly, pills, flySvg, flyers, spark, sparkRing, sparkStars, bigStar, titles, taps,
      });
    },

    update(lt, t, S) {
      const A = S;
      const done = lt >= T.settle;

      // ── 1) Sala de espera ───────────────────────────────────────────────────
      const showA = lt < T.wipe + 0.5;
      A.layerA.style.display = showA ? 'block' : 'none';
      let chipC = { x: O_A.x, y: O_A.y };
      const sAat = (tt) => (1 + 0.022 * R.p(tt, 0.3, T.inProgress - 0.3, E.inOutSine)) * (1 + 0.1 * R.p(tt, T.inProgress + 0.02, 0.5, E.inCubic));
      if (showA) {
        A.meshA.update(t);
        A.meshA.el.style.opacity = R.p(lt, 0.05, 0.7, E.outCubic).toFixed(3);
        const sA = sAat(lt);
        tfx(A.camA, { s: sA });

        // Painel: cresce do cartão até a lista; encolhe quando o Carlos sai.
        const dock = R.p(lt, 0, 0.55, E.snappy);
        const shrink = R.sp(lt, T.reflow + 0.04, R.springs.snappy);
        const px = R.lerp(PG.x, PANEL.x, dock);
        const py = R.lerp(PG.y, PANEL.y, dock);
        const pw = R.lerp(PG.w, PANEL.w, dock);
        const ph = R.lerp(PG.h, panelH(3), dock) - (panelH(3) - panelH(2)) * shrink;
        Object.assign(A.panel.style, { left: `${px.toFixed(2)}px`, top: `${py.toFixed(2)}px`, width: `${pw.toFixed(2)}px`, height: `${ph.toFixed(2)}px` });
        A.panel.style.opacity = R.p(lt, 0, 0.14, E.outQuad).toFixed(3);
        // Cabeçalho do painel em cascata.
        const tk = R.sp(lt, 0.12, R.springs.bouncy);
        R.tf(A.tile, { s: R.clamp(tk, 0, 1.2), r: (1 - R.clamp(tk)) * -25, o: R.clamp(tk * 3) });
        R.reveal(A.headParts, lt, { start: 0.16, stagger: 0.06, dur: 0.55, y: 110 });
        const sk = R.p(lt, 0.26, 0.5, E.snappy);
        R.tf(A.headSub, { y: (1 - sk) * 18, o: sk });
        const ck = R.sp(lt, 0.22, R.springs.bouncy);
        R.tf(A.count, { s: R.lerp(0.6, 1, ck), o: R.clamp(ck * 3) });
        const idx = R.sp(lt, T.arrived + 0.06, R.springs.snappy) + R.sp(lt, T.leave + 0.1, R.springs.snappy);
        A.reelInner.style.transform = `translateY(${(-idx * 36).toFixed(2)}px)`;
        const pulse = (lt * 1.1) % 1;
        R.tf(A.liveRing, { s: 1 + pulse * 1.6, o: (1 - pulse) * 0.7 * R.clamp(ck) });
        A.headLine.style.transform = `scaleX(${R.p(lt, 0.2, 0.6, E.snappy).toFixed(4)})`;

        // Cartão da Mariana: desce e encaixa na 3ª linha; depois sobe para a 2ª.
        const dk = R.sp(lt, 0, R.springs.snappy);
        const up = R.sp(lt, T.reflow + 0.06, R.springs.snappy);
        const my = (rowY(2) - PG.y) * dk + (rowY(1) - rowY(2)) * up;
        const lift = 0.018 * Math.sin(Math.PI * R.p(lt, 0, 0.6, E.outQuad)) + 0.012 * Math.sin(Math.PI * R.p(lt, T.reflow, 0.5, E.outQuad));
        if (lt <= 0) A.card.el.style.transform = 'none';
        else tfx(A.card.el, { y: my, s: 1 + lift });

        // Linhas do Carlos e da Ana saem de trás do cartão.
        const rowAnim = (row, slot, delay, leaveAt, upAt, upTo) => {
          const k = R.sp(lt, delay, R.springs.snappy);
          let y = R.lerp(PG.y, rowY(slot), k);
          if (upAt != null) y += (rowY(upTo) - rowY(slot)) * R.sp(lt, upAt, R.springs.snappy);
          const o = R.clamp((lt - delay) / 0.16);
          let x = 0;
          let sc = R.lerp(0.94, 1, R.clamp(k));
          let oo = o;
          if (leaveAt != null) {
            const lk = R.p(lt, leaveAt, 0.3, E.inCubic);
            x = 0;
            y -= 26 * lk;
            sc *= 1 - 0.1 * lk;
            oo *= 1 - R.p(lt, leaveAt, 0.26, E.inQuad);
          }
          row.el.style.top = `${y.toFixed(2)}px`;
          R.tf(row.el, { x, s: sc, o: oo });
          row.el.style.display = oo <= 0.001 && lt > 0.3 ? 'none' : 'flex';
        };
        rowAnim(A.carlos, 0, 0.05, T.leave, null, null);
        rowAnim(A.ana, 1, 0.1, null, T.reflow, 0);
        A.carlos.clock.set(lt * 50 + 90, lt * 4 + 30);
        A.ana.clock.set(lt * 50 + 200, lt * 4 + 60);
        chipSeq([{ el: A.carlos.chips[0], at: -1 }, { el: A.carlos.chips[1], at: T.call }], lt);
        chipSeq([{ el: A.ana.chips[0], at: -1 }], lt);

        // Chegou: a linha de baixo troca e o relógio gira.
        // Troca com máscara: a linha antiga sobe e some pela borda de cima,
        // a nova sobe de baixo (como as palavras dos títulos).
        const outK = R.p(lt, T.arrived - 0.04, 0.18, E.inCubic);
        if (outK <= 0) {
          A.oldSub.style.transform = 'none';
          A.oldSub.style.clipPath = 'none';
          A.oldSub.style.opacity = '1';
        } else {
          const d = 44 * outK;
          A.oldSub.style.transform = `translateY(${(-d).toFixed(2)}px)`;
          A.oldSub.style.clipPath = `inset(${(d - 8).toFixed(2)}px -24px -8px -24px)`;
          A.oldSub.style.opacity = outK >= 1 ? '0' : '1';
        }
        const inK = R.p(lt, T.arrived + 0.08, 0.5, E.snappy);
        const dn = 44 * (1 - inK);
        A.newSub.style.transform = `translateY(${dn.toFixed(2)}px)`;
        A.newSub.style.clipPath = `inset(-8px -24px ${(dn - 8).toFixed(2)}px -24px)`;
        A.newSub.style.opacity = inK > 0 ? '1' : '0';
        const spin = 720 * R.p(lt, T.arrived, 1.3, E.outCubic) + lt * 40;
        A.mClock.set(spin, spin / 12 + 40);
        chipSeq(
          [
            { el: A.card.chips.confirmed, at: -1 },
            { el: A.chArr, at: T.arrived },
            { el: A.chProg, at: T.inProgress },
          ],
          lt,
        );
        // Centro do chip da Mariana na tela (para a onda e o círculo menta).
        const cw = (lt >= T.inProgress ? A.chProg : A.chArr).offsetWidth || 280;
        const local = { x: PG.x + PG.w - 40 - cw / 2, y: PG.y + my + PG.h / 2 };
        chipC = { x: O_A.x + (local.x - O_A.x) * sA, y: O_A.y + (local.y - O_A.y) * sA };
        const ringAt = lt >= T.inProgress ? T.inProgress : T.arrived;
        const rk = R.p(lt, ringAt + 0.04, 0.6, E.outCubic);
        A.chipRing.style.borderColor = lt >= T.inProgress ? C.inProgress.dot : C.arrived.dot;
        A.chipRing.style.width = `${cw}px`;
        A.chipRing.style.left = `${(local.x - cw / 2).toFixed(1)}px`;
        A.chipRing.style.top = `${(local.y - 26.5).toFixed(1)}px`;
        R.tf(A.chipRing, { sx: 1 + 0.16 * rk, sy: 1 + 0.7 * rk, o: lt >= ringAt + 0.04 ? (1 - rk) * 0.8 : 0 });
      }

      // ── 2) Círculo menta e ficha ────────────────────────────────────────────
      const sA2 = sAat(T.wipe);
      const cwP = A.chProg.offsetWidth || 280;
      const wipeC = {
        x: O_A.x + (PG.x + PG.w - 40 - cwP / 2 - O_A.x) * sA2,
        y: O_A.y + (rowY(1) + ROW_H / 2 - O_A.y) * sA2,
      };
      const rM = 1500 * R.p(lt, T.wipe, 0.4, E.inOutQuad);
      const rF = 1500 * R.p(lt, T.wipe + 0.05, 0.4, E.inOutQuad);
      const mintOn = lt >= T.wipe && rF < 1450;
      A.mint.style.display = mintOn ? 'block' : 'none';
      if (mintOn) A.mint.style.clipPath = `circle(${rM.toFixed(1)}px at ${wipeC.x.toFixed(1)}px ${wipeC.y.toFixed(1)}px)`;
      const cloneOn = lt >= T.wipe && lt < T.wipe + 0.34;
      A.chipClone.style.display = cloneOn ? 'inline-flex' : 'none';
      if (cloneOn) {
        const w = A.chipClone.offsetWidth || cwP;
        A.chipClone.style.left = `${(wipeC.x - w / 2).toFixed(1)}px`;
        A.chipClone.style.top = `${(wipeC.y - 26.5).toFixed(1)}px`;
        const ck = R.p(lt, T.wipe + 0.1, 0.24, E.inCubic);
        R.tf(A.chipClone, { s: sAat(lt) * (1 + 0.25 * ck), o: 1 - ck, blur: 4 * ck });
      }
      const fOn = lt >= T.wipe + 0.05;
      A.layerF.style.display = fOn ? 'block' : 'none';
      A.layerF.style.clipPath = rF < 1450 ? `circle(${rF.toFixed(1)}px at ${wipeC.x.toFixed(1)}px ${wipeC.y.toFixed(1)}px)` : 'none';

      const sFat = (tt) => R.lerp(1.06, 1, R.p(tt, T.wipe, 0.75, E.snappy)) * R.lerp(1, 1.03, R.p(tt, T.wipe + 0.3, T.exit - T.wipe - 0.3, E.inOutSine));
      const sF = sFat(lt);
      const mapF = (cx, cy, sc = sF) => [O_F.x + (FICHA.x + cx - O_F.x) * sc, O_F.y + (FICHA.y + cy - O_F.y) * sc];
      const pl = (x, y, sc) => mapF(x, PLANE_Y + y, sc);

      if (fOn) {
        A.meshF.update(t);
        A.meshF.el.style.opacity = (1 - R.p(lt, T.exit, 0.4, E.inCubic)).toFixed(3);
        tfx(A.camF, { s: sF });
        const b = T.base;
        // Saída da ficha.
        const ex = R.p(lt, T.exit, 0.34, E.inCubic);
        const exO = R.p(lt, T.exit + 0.02, 0.26, E.outQuad);
        R.tf(A.ficha, { s: 1 - 0.08 * ex, y: 30 * ex, o: 1 - exO, blur: 8 * exO });
        A.ficha.style.visibility = exO >= 1 ? 'hidden' : 'visible';

        // Cabeçalho.
        const av = R.sp(lt, b, R.springs.bouncy);
        R.tf(A.fAvatar, { s: R.clamp(av, 0, 1.2), o: R.clamp(av * 3) });
        R.reveal(A.fNameParts, lt, { start: b + 0.05, stagger: 0.06, dur: 0.55, y: 110 });
        const subK = R.p(lt, b + 0.12, 0.5, E.snappy);
        R.tf(A.fSub, { y: 16 * (1 - subK), o: subK });
        const fin = R.sp(lt, b + 0.2, R.springs.bouncy);
        R.tf(A.fFin, { s: R.lerp(0.4, 1, fin), o: R.clamp(fin * 3) });
        A.fLine1.style.transform = `scaleX(${R.p(lt, b + 0.08, 0.6, E.snappy).toFixed(4)})`;
        chipSeq([{ el: A.fProg, at: -1 }, { el: A.fDone, at: T.attended }], lt);

        // Histórico.
        const hl = R.p(lt, b + 0.14, 0.45, E.snappy);
        R.tf(A.hLabel, { x: -14 * (1 - hl), o: hl });
        R.draw(A.hProg, R.p(lt, b + 0.22, 0.75, E.inOutCubic));
        A.hItems.forEach((it, i) => {
          const at = b + 0.24 + i * 0.13;
          const dk = R.sp(lt, at, R.springs.bouncy);
          R.tf(it.dot, { s: R.clamp(dk, 0, 1.3), o: R.clamp(dk * 4) });
          const lk = R.p(lt, at + 0.05, 0.5, E.snappy);
          R.tf(it.lab, { y: 16 * (1 - lk), o: lk });
          if (it.ring) {
            const ph = ((lt - at) * 0.9) % 1;
            R.tf(it.ring, { s: 1 + ph * 1.5, o: lt > at + 0.2 ? (1 - ph) * 0.6 : 0 });
          }
        });

        // Abas: sublinha teal desliza de Ficha até Odontograma.
        A.tabs.forEach((tb, i) => {
          const k = R.p(lt, b + 0.06 + i * 0.05, 0.5, E.snappy);
          R.tf(tb, { y: 14 * (1 - k), o: k });
        });
        const tx = (i) => 44 + A.tabs[i].offsetLeft;
        const tw = (i) => A.tabs[i].offsetWidth;
        const lead = R.p(lt, T.ficha, 0.42, E.snappy);
        const trail = R.p(lt, T.ficha + 0.07, 0.42, E.snappy);
        const l0 = tx(0), r0 = tx(0) + tw(0), l1 = tx(1), r1 = tx(1) + tw(1);
        const left = R.lerp(l0, l1, trail);
        const right = R.lerp(r0, r1, lead);
        const barIn = R.p(lt, b + 0.1, 0.4, E.snappy);
        A.tabBar.style.left = `${left.toFixed(2)}px`;
        A.tabBar.style.width = `${Math.max(0, right - left).toFixed(2)}px`;
        A.tabBar.style.transformOrigin = `${left < 0 ? 0 : 0}px 50%`;
        A.tabBar.style.transform = `scaleX(${barIn.toFixed(4)})`;
        const sw = R.p(lt, T.ficha + 0.05, 0.3, E.outCubic);
        A.tabs[0].style.color = mix(C.ink, C.muted2, sw);
        A.tabs[1].style.color = mix(C.muted2, C.ink, sw);

        // Odontograma: bandeja inclinada em 2,5D que assenta quando os dentes chegam.
        const pk = R.p(lt, T.ficha + 0.22, 0.5, E.snappy);
        const tilt = 12 * (1 - R.p(lt, T.teeth, 0.6, E.snappy));
        R.tf(A.plane, { persp: 1400, rx: tilt, y: 30 * (1 - pk), s: R.lerp(0.96, 1, pk), o: pk });
        R.draw(A.midV, R.p(lt, T.ficha + 0.45, 0.5, E.inOutCubic));

        const selK = (tt) => R.p(lt, tt + 0.02, 0.22, E.outCubic);
        const liftK = (tt) => R.sp(lt, tt + 0.02, R.springs.bouncy);
        A.teeth.forEach((tt) => {
          // Dente a dente, do centro para as pontas, alternando os lados (15 ms cada).
          const st = T.teeth + tt.k * 0.015 + (tt.upper ? 0 : 0.06);
          const on = lt >= st;
          tt.outer.style.opacity = on ? '1' : '0';
          const nst = T.ficha + 0.32 + tt.j * 0.035 + (tt.upper ? 0 : 0.04);
          const nk = R.p(lt, nst, 0.4, E.snappy);
          tt.num.setAttribute('opacity', nk.toFixed(3));
          tt.num.setAttribute('transform', `translate(0 ${((1 - nk) * (tt.upper ? 12 : -12)).toFixed(2)})`);
          if (!on) return;
          R.draw(tt.outline, R.p(lt, st, 0.42, E.outCubic));
          R.draw(tt.cej, R.p(lt, st + 0.18, 0.25, E.outCubic));
          const fk = R.p(lt, st + 0.1, 0.28, E.outCubic);
          const ek = R.p(lt, st, 0.55, E.snappy);
          const si = A.sel.indexOf(tt);
          let k = 0;
          let lift = 0;
          if (si >= 0) {
            const at = si === 0 ? T.tap16 : T.tap26;
            k = selK(at);
            lift = 12 * liftK(at);
            // No voo, o dente da ficha some e quem voa é a cópia.
            tt.outer.style.opacity = lt >= T.exit ? '0' : '1';
            tt.num.setAttribute('fill', mix(C.muted2, C.teal700, k));
            tt.num.style.fontWeight = k > 0.5 ? '800' : '600';
          }
          tt.crown.setAttribute('fill', mix('#FFFFFF', C.teal, k));
          tt.root.setAttribute('fill', mix('#F3F1EB', C.teal400, k));
          tt.crown.setAttribute('fill-opacity', fk.toFixed(3));
          tt.root.setAttribute('fill-opacity', fk.toFixed(3));
          tt.outline.setAttribute('stroke', mix(C.navy, C.mint, k));
          tt.outline.setAttribute('stroke-width', (4 + 0.6 * k).toFixed(2));
          tt.cej.setAttribute('stroke', mix(C.navy, '#FFFFFF', k));
          tt.cej.setAttribute('opacity', R.lerp(0.32, 0.55, k).toFixed(3));
          tt.glow.setAttribute('opacity', (0.9 * k).toFixed(3));
          const dir = tt.upper ? 1 : -1;
          const dy = -dir * (14 * (1 - ek) + lift);
          const sc = R.lerp(0.86, 1, ek);
          const cy = (-tt.H / 2) * dir;
          tt.inner.setAttribute('transform', `translate(0 ${(dy + cy).toFixed(2)}) scale(${sc.toFixed(4)}) translate(0 ${(-cy).toFixed(2)})`);
        });

        // Toques no 16 e no 26.
        A.sel.forEach((tt, i) => {
          const at = i === 0 ? T.tap16 : T.tap26;
          const [x, y] = pl(tt.x, tt.occ - tt.CH * 0.55, sF);
          A.taps[i].update(lt, at, x, y);
          A.taps[i].el.style.display = lt > at - 0.4 && lt < at + 0.5 ? 'block' : 'none';
          A.taps[i].el.style.opacity = (1 - R.p(lt, at + 0.2, 0.22, E.inQuad)).toFixed(3);
        });
      } else {
        A.taps.forEach((tp) => (tp.el.style.display = 'none'));
      }

      // ── 3) Etiquetas (as próprias pílulas da passagem) e voo final ─────────
      const sFx = sFat(T.exit);
      const tagPos = (i, sc) => {
        const tt = A.sel[i];
        const gy = (OCC_U + OCC_L) / 2 + curveY(tt.x);
        let [x, y] = pl(tt.x, gy, sc);
        const half = (PILLS[i].w * TAG_S * sc) / 2;
        x = R.clamp(x, 112 + half, 950 - half);
        return [x, y];
      };
      let pillScale = [0, 0];
      let pillC = [[0, 0], [0, 0]];
      A.pills.forEach((p, i) => {
        const g = PILLS[i];
        const at = i === 0 ? T.tap16 : T.tap26;
        const visible = lt >= at + 0.06;
        p.el.style.display = visible ? 'flex' : 'none';
        if (!visible) return;
        if (done) {
          p.el.style.transform = 'none';
          p.el.style.opacity = '1';
          p.el.style.filter = 'none';
          pillScale[i] = 1;
          pillC[i] = [g.x + g.w / 2, g.y + g.h / 2];
          return;
        }
        const sc = lt >= T.exit ? sFx : sF;
        const [tx0, ty0] = tagPos(i, sc);
        // Entrada: sai do dente e assenta no vão entre as arcadas.
        const k = R.sp(lt, at + 0.06, R.springs.bouncy);
        const tt = A.sel[i];
        const [, toothY] = pl(tt.x, tt.occ, sc);
        let cx = tx0;
        let cy = R.lerp(toothY, ty0, R.clamp(R.p(lt, at + 0.06, 0.35, E.snappy)));
        let scale = TAG_S * sc * R.lerp(0.3, 1, k);
        // Voo até a geometria da passagem.
        const fk = R.p(lt, T.exit + 0.04 + i * 0.05, 0.36, E.inOutCubic);
        if (fk > 0) {
          const ex = g.x + g.w / 2;
          const ey = g.y + g.h / 2;
          cx = R.lerp(tx0, ex, fk);
          cy = R.lerp(ty0, ey, fk) - Math.sin(Math.PI * fk) * 50;
          scale = R.lerp(TAG_S * sFx, 1, fk);
        }
        pillScale[i] = scale;
        pillC[i] = [cx, cy];
        R.tf(p.el, { x: cx - (g.x + g.w / 2), y: cy - (g.y + g.h / 2), s: scale, o: R.clamp((lt - at - 0.06) / 0.06) });
        p.el.style.zIndex = String(2 + i);
      });

      // Dentes que se soltam e voam para dentro do círculo de cada pílula.
      const flying = lt >= T.exit && !done;
      A.flySvg.style.display = flying ? 'block' : 'none';
      if (flying) {
        A.flyers.forEach((f, i) => {
          const tt = f.t;
          const g = PILLS[i];
          const k = R.p(lt, T.exit + i * 0.04, 0.3, E.inOutCubic);
          const pop = Math.sin(Math.PI * R.clamp(k * 1.6));
          // Ponto de partida: o centro do dente levantado, na ficha.
          const d = tt.H / 2 + 12;
          const a = (tt.ang * Math.PI) / 180;
          const [sx, sy] = pl(tt.x + Math.sin(a) * d, tt.occ - Math.cos(a) * d, sFx);
          // Chegada: o centro do círculo do ícone, onde a pílula está agora.
          const iconOff = 18 + 36 - g.w / 2;
          const tx = pillC[i][0] + iconOff * pillScale[i];
          const ty = pillC[i][1];
          const x = R.lerp(sx, tx, k);
          const y = R.lerp(sy, ty, k) - Math.sin(Math.PI * k) * 90;
          const sc = R.lerp(sFx, 0.4 * pillScale[i], k) * (1 + 0.14 * pop);
          const rot = R.lerp(tt.ang, 0, k) + Math.sin(Math.PI * k) * (i ? 22 : -22);
          f.outer.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${sc.toFixed(4)}) translate(0 ${(tt.H / 2).toFixed(2)})`);
          f.outer.setAttribute('opacity', (1 - R.p(lt, T.exit + i * 0.04 + 0.2, 0.1)).toFixed(3));
        });
      }

      // Faísca de "Atendido" no chip da ficha.
      const spOn = lt >= T.attended && lt < T.attended + 0.42 && !done;
      A.spark.style.display = spOn ? 'block' : 'none';
      if (spOn) {
        const r = A.stBox.getBoundingClientRect();
        const st = R.stage.getBoundingClientRect();
        // Na ponta direita do chip "Atendido", sem cobrir o texto.
        const cx = r.left - st.left + Math.min(r.width, A.fDone.offsetWidth * sF) - 6;
        const cy = r.top - st.top + r.height / 2;
        A.spark.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
        const k = R.p(lt, T.attended, 0.4, E.outCubic);
        R.tf(A.sparkRing, { s: R.lerp(0.3, 1.9, k), o: (1 - k) * 0.8 });
        A.sparkStars.forEach((st2, i) => {
          const ang = (i / 8) * Math.PI * 2 + 0.3;
          const dist = R.lerp(8, i % 2 ? 70 : 96, k);
          const life = Math.sin(Math.PI * R.clamp(k * 1.05));
          R.tf(st2, { x: Math.cos(ang) * dist * 0.8 - 14, y: Math.sin(ang) * dist * 0.8 - 14, r: k * 180, s: life, o: life });
        });
        const bk = R.sp(lt, T.attended, R.springs.bouncy);
        R.tf(A.bigStar, { s: R.clamp(bk, 0, 1.3) * (1 - R.p(lt, T.attended + 0.2, 0.2, E.inCubic)), r: bk * 90, o: 1 - R.p(lt, T.attended + 0.24, 0.16) });
      }

      // ── 4) Títulos ──────────────────────────────────────────────────────────
      const [t1, t2, t3] = A.titles;
      R.reveal(t1.parts, lt, { start: T.title1, stagger: 0.07, dur: 0.6, y: 110, out: { start: T.title1Out, y: -110, dur: 0.32, stagger: 0.03, fade: true } });
      R.reveal(t2.parts, lt, { start: T.title2, stagger: 0.07, dur: 0.6, y: 110, out: { start: T.title2Out, y: -110, dur: 0.32, stagger: 0.03, fade: true } });
      R.reveal(t3.parts, lt, { start: T.title3, stagger: 0.08, dur: 0.6, y: 110, out: { start: T.exit - 0.06, y: -110, dur: 0.32, stagger: 0.03, fade: true } });
      t1.el.style.display = lt < T.title1Out + 0.5 ? 'block' : 'none';
      t2.el.style.display = lt > T.title2 - 0.05 && lt < T.title2Out + 0.5 ? 'block' : 'none';
      t3.el.style.display = lt > T.title3 - 0.05 && !done ? 'block' : 'none';
      if (done) {
        A.layerF.style.display = 'block';
        A.ficha.style.visibility = 'hidden';
        A.meshF.el.style.opacity = '0';
      }
    },
  });
})();
