/*
 * Cena "hook" (global 0,0–3,0; local = global) — o gancho.
 *
 * Fundo ardósia apagado, paleta sem cor (branco 70 %, cinza-azulado) e um só
 * acento coral. Os desenhos têm traço "fervendo" (tremem ~1 px a 12 qps).
 *  - 0,0–1,2: cadeira odontológica vazia sob a luminária; o horário
 *    "14:00 · Carlos Lima" já vem descendo e trava sobre ela em 0,2; em
 *    stampFaltou o carimbo coral "FALTOU" bate (-8°), a câmera treme e sobe
 *    poeira. Título "Faltou / de novo." palavra a palavra.
 *  - whipPlanilha: chicote lateral (desfoque de movimento) para uma planilha
 *    que rola rápido demais; células piscam, o cursor se perde e o total
 *    pisca "???" em coral. O título vira "Não / fecha.".
 *  - starCut: a estrela da marca entra girando pelo canto superior direito e
 *    corta a tela na diagonal; tudo se parte em cacos ao longo do corte,
 *    sugados para dentro dela. Fica só a estrela, no centro, pulsando.
 *
 * Passagem para o reveal: o último quadro tem só o fundo ardósia e
 * B.star({size: 160}) teal centrada em (540, 960), sem transform. Esta cena
 * fica visível mais 0,55 s por baixo do reveal (post) para que, em volta da
 * íris em estrela dele, continue a ardósia (e não o fundo branco do palco).
 */
(() => {
  const { h, s } = R;
  const E = R.ease;
  const C = B.C;
  const TL = window.TIMELINE;
  const T0 = TL.hook.start;
  const L = (g) => g - T0; // global → local
  const EV = TL.events;
  const VO = Object.fromEntries(TL.vo.map((v) => [v.id, { start: L(v.start), end: L(v.end) }]));

  // ── Tempos locais (todos do TIMELINE) ───────────────────────────────────────
  const T = {
    stamp: L(EV.stampFaltou), // 0,55 carimbo bate
    whip: L(EV.whipPlanilha), // 1,20 chicote
    cut: L(EV.starCut), // 2,45 a estrela entra
  };
  T.lock = 0.2; // o horário trava sobre a cadeira
  T.title1 = T.stamp - 0.1; // 0,45 "Faltou de novo."
  T.sheetScroll = T.whip + 0.2; // a planilha chega, mostra o começo e dispara a rolar
  T.swap = VO.p2.start + 0.55; // 1,85 "Não fecha."
  T.total = T.swap - 0.1; // o total pisca "???"
  T.freeze = T.cut + 0.13; // 2,58 a tela vira cacos
  T.suck = T.freeze + 0.02; // cacos começam a ser sugados
  T.settle = 2.95; // daqui em diante: só a estrela, parada, na geometria da passagem

  // ── Paleta só desta cena ────────────────────────────────────────────────────
  const SLATE = '#1A2232';
  const SLATE2 = '#253247';
  const GREY = '#8EA0BF';
  const CORAL = '#E0705F';
  const FILL = '#29344A'; // preenchimento das peças desenhadas (tapa o que fica atrás)
  const W = (a) => `rgba(255,255,255,${a})`;
  const G = (a) => `rgba(142,160,191,${a})`;
  const CO = (a) => `rgba(224,112,95,${a})`;

  // ── Geometria ──────────────────────────────────────────────────────────────
  const CX = 540;
  const CY = 960;
  // Corte: diagonal do canto superior direito ao inferior esquerdo, pelo centro.
  const DIAG = Math.hypot(1080, 1920);
  const DU = [-1080 / DIAG, 1920 / DIAG]; // ao longo do corte
  const DV = [1920 / DIAG, 1080 / DIAG]; // normal ao corte
  const uv = (u, v) => [CX + u * DU[0] + v * DV[0], CY + u * DU[1] + v * DV[1]];
  const toUV = (x, y) => [(x - CX) * DU[0] + (y - CY) * DU[1], (x - CX) * DV[0] + (y - CY) * DV[1]];
  const U_IN = -1400; // de onde a estrela entra (fora da tela, canto sup. direito)

  // Estrela da passagem: B.star 160 px; centro do desenho dentro do svg.
  const STAR_W = 160;
  const STAR_H = (STAR_W * 148) / 140;
  const STAR_OX = ((575 - 505) / 140) * STAR_W; // 80
  const STAR_OY = ((72 + 2) / 148) * STAR_H; // 84,57

  const TITLE = { x: 84, y: 300, size: 122 };
  const CARD = { x: 210, y: 806, w: 660, h: 160 };
  const STAMP = { cx: 694, cy: 960, w: 420, h: 144, rot: -8 };
  const SHEET = { x: 70, y: 612, w: 940, h: 948, r: 32 };
  const COLS = [
    { w: 70 },
    { w: 300, label: 'Paciente' },
    { w: 132, label: 'Dia' },
    { w: 238, label: 'Recebido' },
    { w: 200, label: 'Situação' },
  ];
  const ROW_H = 92;
  const FBAR_H = 84;
  const HEAD_H = 66;
  const TABS_H = 72;
  const BODY_H = SHEET.h - FBAR_H - HEAD_H - TABS_H; // 726

  // Linhas da planilha: nada de valor em dinheiro — "Recebido" é barra, "?" ou erro.
  const ROWS = [
    ['Carlos Lima', '14/03', 'faltou', '?'],
    ['Pedro Alves', '14/03', 'ok', 0.62],
    ['Juliana Reis', '15/03', 'remarcou', 0.4],
    ['Ana Souza', '15/03', '??', '#REF!'],
    ['Bruno Martins', '16/03', 'faltou', '?'],
    ['Rita Campos', '16/03', 'ligar', 0.78],
    ['Lucas Prado', '17/03', 'ok', 0.5],
    ['Fernanda Rocha', '17/03', 'faltou', '—'],
    ['João Nunes', '18/03', 'conferir', '?'],
    ['Tânia Melo', '18/03', 'ok?', 0.3],
    ['Carlos Lima', '20/03', 'faltou', '#REF!'],
    ['Sérgio Dias', '20/03', 'ok', 0.66],
    ['Bia Freitas', '21/03', 'remarcou?', '?'],
    ['Igor Ramos', '21/03', 'ligar', 0.45],
    ['Marcos Silva', '22/03', 'faltou', '—'],
    ['Sofia Lopes', '22/03', 'ok', 0.56],
    ['Vera Antunes', '23/03', '??', '#N/D'],
    ['Caio Mendes', '23/03', 'faltou', '?'],
    ['Lara Pinto', '24/03', 'conferir', 0.7],
    ['Otávio Reis', '24/03', 'ok', 0.36],
  ];
  const TOTAL_I = ROWS.length; // índice da linha do total
  const SCROLL_END = (ROWS.length + 1) * ROW_H - BODY_H + 34; // o total inteiro à vista, com folga

  // ── Utilidades ─────────────────────────────────────────────────────────────
  const bell = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
  /** Lombada seno² que vale 0 fora de [a, b]. */
  const hump = (t, a, b) => {
    const k = R.inv(a, b, t);
    return k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k) ** 2;
  };
  /** Tremida que decai a partir de t0 (px). */
  const quake = (t, t0, amp, decay, seed) => {
    if (t < t0) return [0, 0];
    const a = amp * Math.exp(-(t - t0) / decay);
    return [a * R.noise((t - t0) * 44, seed), a * R.noise((t - t0) * 44, seed + 17.3)];
  };
  const abs = (style) => ({ position: 'absolute', ...style });
  const ROLL = E.bezier(0.7, 0, 0.18, 1);

  // ── Cadeira e luminária em traço branco trêmulo ─────────────────────────────
  function chairArt() {
    const svg = s('svg', { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: abs({ left: 0, top: 0, overflow: 'visible' }) });
    svg.innerHTML = `
      <defs>
        <linearGradient id="hook-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#DDE6F5" stop-opacity="0.16"/>
          <stop offset="0.55" stop-color="#DDE6F5" stop-opacity="0.06"/>
          <stop offset="1" stop-color="#DDE6F5" stop-opacity="0"/>
        </linearGradient>
        <radialGradient id="hook-lens" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#F4F8FF" stop-opacity="0.55"/>
          <stop offset="1" stop-color="#F4F8FF" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="hook-pool" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#DDE6F5" stop-opacity="0.10"/>
          <stop offset="1" stop-color="#DDE6F5" stop-opacity="0"/>
        </radialGradient>
      </defs>`;
    // Luz: cone e poça no chão (macios, não fervem).
    const cone = s('path', { d: 'M 334 745 L 488 701 L 840 1290 L 236 1290 Z', fill: 'url(#hook-cone)' });
    const pool = s('ellipse', { cx: 560, cy: 1300, rx: 330, ry: 120, fill: 'url(#hook-pool)' });
    svg.appendChild(pool);
    svg.appendChild(cone);
    const coneEdges = [
      s('path', { d: 'M 334 745 L 236 1290', fill: 'none', stroke: W(0.16), 'stroke-width': 2.5, 'stroke-dasharray': '2 14', 'stroke-linecap': 'round' }),
      s('path', { d: 'M 488 701 L 840 1290', fill: 'none', stroke: W(0.16), 'stroke-width': 2.5, 'stroke-dasharray': '2 14', 'stroke-linecap': 'round' }),
    ];
    coneEdges.forEach((e) => svg.appendChild(e));

    const boil = s('g', { filter: 'url(#hook-boil)' });
    svg.appendChild(boil);
    const ink = (d, { w = 5, c = W(0.74), fill = 'none', ghost = true, parent = boil, attrs = {} } = {}) => {
      if (ghost) {
        // Segundo traço, deslocado: o "lápis inseguro" que passa duas vezes.
        parent.appendChild(s('path', { d, fill: 'none', stroke: W(0.2), 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: 'translate(2.6 -1.8)' }));
      }
      const p = s('path', { d, fill, stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...attrs });
      parent.appendChild(p);
      return p;
    };

    // Chão (desenha a partir do centro).
    const floorL = ink('M 560 1504 L 120 1504', { w: 3, c: G(0.4), ghost: false });
    const floorR = ink('M 560 1504 L 1000 1504', { w: 3, c: G(0.4), ghost: false });

    // Haste da luminária, presa no teto, e o braço até a cabeça.
    ink('M 664 -40 L 664 548', { w: 5 });
    ink('M 646 548 L 682 548 C 686 548 688 551 688 555 L 688 580 C 688 584 686 586 682 586 L 646 586 C 642 586 640 584 640 580 L 640 555 C 640 551 642 548 646 548 Z', { w: 4.5, fill: FILL });
    ink('M 664 586 C 664 628 640 646 596 650 L 404 652', { w: 5 });

    // Cadeira (cabeça à esquerda), um pouco abaixo.
    const chair = s('g', { transform: 'translate(0 40)' });
    boil.appendChild(chair);
    const cIn = (d, o = {}) => ink(d, { parent: chair, ...o });
    // Base e coluna.
    cIn('M 404 1460 C 404 1440 422 1428 448 1428 L 698 1428 C 724 1428 742 1440 742 1460 Z', { fill: FILL });
    cIn('M 534 1290 L 540 1428 M 612 1290 L 606 1428', { w: 5 });
    cIn('M 538 1360 L 608 1360 M 539 1394 L 607 1394', { w: 3, c: G(0.6), ghost: false });
    cIn('M 516 1290 L 630 1290 L 630 1310 L 516 1310 Z', { w: 4, fill: FILL });
    // Estofado inteiro: encosto → assento → apoio das pernas.
    cIn(
      'M 292 1032 C 330 1068 420 1150 468 1192 C 500 1218 560 1226 640 1218 C 690 1212 720 1208 748 1222 L 890 1316 ' +
        'C 916 1334 912 1374 880 1374 L 860 1374 C 820 1350 760 1300 720 1286 C 680 1280 600 1290 520 1286 ' +
        'C 470 1282 440 1268 410 1240 L 250 1096 C 228 1076 240 1040 262 1030 C 272 1026 284 1026 292 1032 Z',
      { w: 5.5, fill: FILL },
    );
    // Vincos do estofado.
    cIn('M 446 1176 C 430 1200 418 1222 412 1238', { w: 3, c: G(0.55), ghost: false });
    cIn('M 744 1222 C 734 1244 726 1266 722 1284', { w: 3, c: G(0.55), ghost: false });
    cIn('M 300 1060 C 360 1112 420 1168 452 1196', { w: 2.5, c: G(0.32), ghost: false });
    // Encosto de cabeça e haste.
    cIn('M 232 1045 L 255 1066 M 246 1031 L 269 1051', { w: 3.5, c: W(0.6), ghost: false });
    const hr = s('g', { transform: 'rotate(42 190 994)' });
    chair.appendChild(hr);
    ink('M 152 966 L 228 966 C 245 966 256 980 256 994 C 256 1008 245 1022 228 1022 L 152 1022 C 135 1022 124 1008 124 994 C 124 980 135 966 152 966 Z', {
      parent: hr,
      w: 5.5,
      fill: FILL,
    });
    // Braço da cadeira.
    cIn('M 478 1128 L 650 1128 C 657 1128 662 1134 662 1140 C 662 1146 657 1152 650 1152 L 478 1152 C 471 1152 466 1146 466 1140 C 466 1134 471 1128 478 1128 Z', {
      w: 4.5,
      fill: FILL,
    });
    cIn('M 618 1152 C 620 1172 614 1194 608 1214', { w: 4.5 });

    // Cabeça da luminária (por cima de tudo).
    const lamp = s('g', { transform: 'rotate(-16 405 704)' });
    boil.appendChild(lamp);
    ink('M 338 671 L 472 671 C 490 671 505 686 505 704 C 505 722 490 737 472 737 L 338 737 C 320 737 305 722 305 704 C 305 686 320 671 338 671 Z', {
      parent: lamp,
      w: 5.5,
      fill: FILL,
    });
    const lens = ink('M 340 712 L 470 712 C 478 712 484 718 484 724 C 484 730 478 736 470 736 L 340 736 C 332 736 326 730 326 724 C 326 718 332 712 340 712 Z', {
      parent: lamp,
      w: 3,
      c: W(0.55),
      fill: W(0.14),
      ghost: false,
    });
    ink('M 380 671 L 380 652 L 430 652 L 430 671', { parent: lamp, w: 4.5 });
    // A lente acesa (brilho macio por cima do traço).
    const lensGlow = s('ellipse', { cx: 405, cy: 728, rx: 120, ry: 30, fill: 'url(#hook-lens)', transform: 'rotate(-16 405 704)' });
    svg.appendChild(lensGlow);

    return { svg, cone, pool, coneEdges, floorL, floorR, lens, lensGlow };
  }

  // ── Cartão de horário (vidro escuro, sem cor) ───────────────────────────────
  function apptCard() {
    const el = h(
      'div',
      {
        style: abs({
          left: `${CARD.x}px`,
          top: `${CARD.y}px`,
          width: `${CARD.w}px`,
          height: `${CARD.h}px`,
          borderRadius: '36px',
          background: 'linear-gradient(180deg, #36445E 0%, #2B3850 100%)',
          boxShadow:
            '0 60px 90px -36px rgba(3,6,12,.75), 0 18px 34px -16px rgba(3,6,12,.5), inset 0 1.5px 0 rgba(255,255,255,.12), inset 0 0 0 1.5px rgba(255,255,255,.06)',
          display: 'flex',
          alignItems: 'center',
          gap: '26px',
          padding: '0 40px 0 44px',
          boxSizing: 'border-box',
          transformOrigin: '50% 100%',
          willChange: 'transform',
        }),
      },
      h('div', { style: abs({ left: '18px', top: '34px', bottom: '34px', width: '7px', borderRadius: '4px', background: GREY }) }),
    );
    const avatar = B.avatar('CL', { size: 92, bg: G(0.26), fg: W(0.86) });
    const name = h(
      'div',
      { style: { font: `700 46px/1 ${B.FONT}`, letterSpacing: '-0.025em', whiteSpace: 'nowrap', fontFeatureSettings: '"tnum" 1' } },
      h('span', { style: { color: W(0.95) } }, '14:00'),
      h('span', { style: { color: GREY, margin: '0 14px' } }, '·'),
      h('span', { style: { color: W(0.8), fontWeight: 650 } }, 'Carlos Lima'),
    );
    const sub = h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' } },
      B.icon('clock', { size: 30, color: GREY, sw: 2.2 }),
      B.text('Avaliação · Dra. Paula', { size: 31, weight: 500, color: GREY, ls: '-0.01em', style: { whiteSpace: 'nowrap' } }),
    );
    const col = h('div', { style: { minWidth: 0 } }, name, sub);
    el.appendChild(avatar);
    el.appendChild(col);
    const flash = h('div', { style: abs({ inset: 0, borderRadius: '36px', background: '#fff', opacity: '0' }) });
    el.appendChild(flash);
    return { el, col, avatar, flash };
  }

  // ── Carimbo "FALTOU" ────────────────────────────────────────────────────────
  function stampArt() {
    const w = STAMP.w;
    const hh = STAMP.h;
    const svg = s('svg', {
      width: w,
      height: hh,
      viewBox: `0 0 ${w} ${hh}`,
      style: abs({ left: `${STAMP.cx - w / 2}px`, top: `${STAMP.cy - hh / 2}px`, overflow: 'visible', transformOrigin: '50% 50%' }),
    });
    svg.innerHTML = `
      <g filter="url(#hook-ink)">
        <rect x="6" y="6" width="${w - 12}" height="${hh - 12}" rx="24" fill="rgba(224,112,95,.10)" stroke="${CORAL}" stroke-width="8"/>
        <rect x="19" y="19" width="${w - 38}" height="${hh - 38}" rx="14" fill="none" stroke="${CORAL}" stroke-width="3"/>
        <text x="${w / 2}" y="${hh / 2 + 29}" text-anchor="middle" fill="${CORAL}"
          style="font: 900 82px 'Inter Display', 'Inter', sans-serif; letter-spacing: 0.07em;">FALTOU</text>
      </g>`;
    return svg;
  }

  // ── Planilha ────────────────────────────────────────────────────────────────
  function sheetArt() {
    const panel = h('div', {
      style: abs({
        left: `${SHEET.x}px`,
        top: `${SHEET.y}px`,
        width: `${SHEET.w}px`,
        height: `${SHEET.h}px`,
        borderRadius: `${SHEET.r}px`,
        background: 'linear-gradient(180deg, #27324A 0%, #212B3F 100%)',
        boxShadow: '0 80px 140px -50px rgba(2,4,10,.85), 0 24px 50px -24px rgba(2,4,10,.6), inset 0 0 0 1.5px rgba(255,255,255,.08), inset 0 1.5px 0 rgba(255,255,255,.1)',
        overflow: 'hidden',
        transformOrigin: '50% 40%',
        willChange: 'transform',
      }),
    });
    const font = (size, weight, color, extra = {}) => ({ font: `${weight} ${size}px/1 ${B.FONT}`, color, letterSpacing: '-0.01em', whiteSpace: 'nowrap', ...extra });

    // Barra de fórmula.
    const caret = h('span', { style: { display: 'inline-block', width: '3px', height: '34px', background: W(0.8), marginLeft: '4px', verticalAlign: '-6px' } });
    const fbar = h(
      'div',
      {
        style: abs({
          left: 0, top: 0, right: 0, height: `${FBAR_H}px`, display: 'flex', alignItems: 'center', gap: '22px', padding: '0 26px',
          borderBottom: `1.5px solid ${G(0.18)}`, background: 'rgba(255,255,255,.025)',
        }),
      },
      h('div', { style: { ...font(27, 600, GREY), padding: '9px 16px', borderRadius: '12px', border: `1.5px solid ${G(0.3)}` } }, 'C22'),
      h('div', { style: font(30, 600, G(0.85), { fontStyle: 'italic' }) }, 'fx'),
      h('div', { style: font(31, 500, W(0.74), { fontFeatureSettings: '"tnum" 1' }) }, '=SOMA(C2:C21)', caret),
    );
    panel.appendChild(fbar);

    // Cabeçalho das colunas.
    const head = h('div', {
      style: abs({ left: 0, top: `${FBAR_H}px`, right: 0, height: `${HEAD_H}px`, display: 'flex', borderBottom: `2px solid ${G(0.28)}`, background: 'rgba(142,160,191,.06)' }),
    });
    COLS.forEach((c) =>
      head.appendChild(
        h('div', { style: { width: `${c.w}px`, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 22px', boxSizing: 'border-box', ...font(27, 650, GREY) } }, c.label || ''),
      ),
    );
    panel.appendChild(head);

    // Corpo: linhas rolando.
    const body = h('div', { style: abs({ left: 0, top: `${FBAR_H + HEAD_H}px`, right: 0, height: `${BODY_H}px`, overflow: 'hidden' }) });
    const rows = h('div', { style: abs({ left: 0, top: 0, right: 0, willChange: 'transform' }) });
    body.appendChild(rows);
    const flick = []; // células que trocam de texto
    const cellBox = (c, content, extra = {}) =>
      h('div', { style: { width: `${c.w}px`, flex: 'none', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 22px', boxSizing: 'border-box', ...extra } }, content);
    let totalCell = null;
    let totalTxt = null;
    for (let i = 0; i < ROWS.length + 3; i++) {
      const row = h('div', { style: { position: 'relative', height: `${ROW_H}px`, display: 'flex', borderBottom: `1.5px solid ${G(0.15)}`, boxSizing: 'border-box' } });
      row.appendChild(cellBox(COLS[0], h('span', { style: font(25, 500, G(0.6), { width: '100%', textAlign: 'center', fontFeatureSettings: '"tnum" 1' }) }, String(i + 2))));
      if (i < ROWS.length) {
        const [nm, day, st, rec] = ROWS[i];
        row.appendChild(cellBox(COLS[1], h('span', { style: font(31, 550, W(0.82)) }, nm)));
        row.appendChild(cellBox(COLS[2], h('span', { style: font(30, 500, G(0.95), { fontFeatureSettings: '"tnum" 1' }) }, day)));
        const stEl = h('span', { style: font(30, 500, st.startsWith('falt') ? W(0.5) : W(0.66), { fontStyle: st.includes('?') ? 'italic' : 'normal' }) }, st);
        let recEl;
        if (typeof rec === 'number') recEl = h('div', { style: { width: `${Math.round(40 + rec * 140)}px`, height: '16px', borderRadius: '8px', background: G(0.34) } });
        else recEl = h('span', { style: font(30, 600, rec.startsWith('#') ? G(0.75) : W(0.48), { fontFeatureSettings: '"tnum" 1' }) }, rec);
        row.appendChild(cellBox(COLS[3], recEl));
        row.appendChild(cellBox(COLS[4], stEl));
        if (i === 3) flick.push({ el: recEl, a: '#REF!', b: '?', seed: 1 });
        if (i === 8) flick.push({ el: stEl, a: 'conferir', b: '??', seed: 2 });
        if (i === 12) flick.push({ el: stEl, a: 'remarcou?', b: 'faltou?', seed: 3 });
        if (i === 16) flick.push({ el: recEl, a: '#N/D', b: '#REF!', seed: 4 });
      } else if (i === TOTAL_I) {
        row.style.background = 'rgba(142,160,191,.09)';
        row.style.borderTop = `2.5px solid ${G(0.45)}`;
        row.appendChild(cellBox({ w: COLS[1].w + COLS[2].w }, h('span', { style: font(31, 800, W(0.92), { letterSpacing: '0.06em' }) }, 'TOTAL')));
        totalTxt = h('span', { style: font(46, 800, CORAL, { letterSpacing: '0.05em' }) }, '???');
        totalCell = cellBox(COLS[3], [B.icon('triangle-alert', { size: 36, color: CORAL, sw: 2.4 }), totalTxt], { position: 'relative', gap: '12px' });
        totalCell.appendChild(h('div', { style: abs({ inset: '5px 6px', borderRadius: '12px', border: `3.5px solid ${CORAL}`, background: CO(0.08), boxShadow: `0 0 28px ${CO(0.4)}` }) }));
        row.appendChild(totalCell);
        row.appendChild(cellBox(COLS[4], null));
      } else {
        COLS.slice(1).forEach((c) => row.appendChild(cellBox(c, null)));
      }
      rows.appendChild(row);
    }
    // Seleção que pula de célula em célula e um lampejo.
    const sel = h('div', { style: abs({ left: 0, top: 0, borderRadius: '6px', border: `3px solid ${GREY}`, background: G(0.14), boxSizing: 'border-box' }) });
    const flash = h('div', { style: abs({ left: 0, top: 0, borderRadius: '4px', background: W(0.1) }) });
    rows.appendChild(flash);
    rows.appendChild(sel);
    // Linhas verticais da grade (fixas).
    let gx = 0;
    COLS.slice(0, -1).forEach((c) => {
      gx += c.w;
      body.appendChild(h('div', { style: abs({ left: `${gx}px`, top: 0, bottom: 0, width: '1.5px', background: G(0.15) }) }));
    });
    panel.appendChild(body);

    // Abas.
    const tabs = h('div', {
      style: abs({ left: 0, right: 0, bottom: 0, height: `${TABS_H}px`, display: 'flex', alignItems: 'center', gap: '10px', padding: '0 22px', borderTop: `1.5px solid ${G(0.2)}`, background: 'rgba(0,0,0,.08)' }),
    });
    ['Março', 'Março (2)', 'Março FINAL', 'FINAL v2'].forEach((t, i, arr) => {
      const on = i === arr.length - 1;
      tabs.appendChild(h('div', { style: { ...font(26, on ? 650 : 500, on ? W(0.88) : G(0.8)), padding: '10px 18px', borderRadius: '12px', background: on ? G(0.2) : 'transparent' } }, t));
    });
    panel.appendChild(tabs);

    return { panel, rows, sel, flash, flick, totalCell, totalTxt, caret };
  }

  /** Cursor do mouse desenhado à mão (seta). */
  function cursorArt(o = 1) {
    const svg = s('svg', { width: 52, height: 64, viewBox: '-3 -3 40 50', style: abs({ left: 0, top: 0, overflow: 'visible', opacity: String(o) }) });
    svg.innerHTML = `<path d="M0 0 L0 36 L9 27.5 L15.5 42 L22 39 L15.5 25 L27 25 Z" fill="rgba(255,255,255,.94)" stroke="${SLATE}" stroke-width="2.6" stroke-linejoin="round"/>`;
    return svg;
  }

  /**
   * Cópia "achatada" para os cacos: sem will-change e sem transform 3D, para
   * que cada cópia não vire dezenas de camadas no compositor (o que faz o
   * Chromium pular ladrilhos e deixar buracos brancos no quadro).
   */
  function flatten(node) {
    for (const el of [node, ...node.querySelectorAll('*')]) {
      if (!el.style) continue;
      el.style.willChange = 'auto';
      const tr = el.style.transform;
      if (tr && tr !== 'none') {
        el.style.transform = tr
          .replace(/perspective\([^)]*\)\s*/g, '')
          .replace(/rotate[XY]\([^)]*\)\s*/g, '')
          .replace(/translate3d\(([^,]+),\s*([^,]+),\s*[^)]+\)/g, 'translate($1, $2)');
      }
    }
    return node;
  }

  /** Cacos: grade irregular nas coordenadas do corte, picada perto dele. */
  function shardPolys() {
    const uB = [-1500, -980, -700, -430, -170, 90, 350, 620, 900, 1500];
    const vB = [-1300, -620, -330, -130, 0, 130, 330, 620, 1300];
    const P = uB.map((u, i) =>
      vB.map((v, j) => {
        const edgeU = i === 0 || i === uB.length - 1;
        const edgeV = j === 0 || j === vB.length - 1;
        const cw = 120;
        const ju = edgeU ? 0 : (R.hash(i * 7.31 + j * 3.17) - 0.5) * cw;
        const jv = edgeV || v === 0 ? 0 : (R.hash(i * 2.93 + j * 9.41 + 4) - 0.5) * Math.min(90, Math.abs(v) * 0.45);
        return [u + ju, v + jv];
      }),
    );
    const polys = [];
    for (let i = 0; i < uB.length - 1; i++) {
      for (let j = 0; j < vB.length - 1; j++) {
        const q = [P[i][j], P[i + 1][j], P[i + 1][j + 1], P[i][j + 1]];
        const nearCut = vB[j] === 0 || vB[j + 1] === 0;
        if (nearCut || R.hash(i * 5.7 + j * 1.3) > 0.55) {
          // Picado em dois triângulos (diagonal alternada).
          if ((i + j) % 2) {
            polys.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
          } else {
            polys.push([q[0], q[1], q[3]], [q[1], q[2], q[3]]);
          }
        } else polys.push(q);
      }
    }
    // Para a tela: só os que tocam o quadro (com folga da câmera).
    const out = [];
    for (const poly of polys) {
      const pts = poly.map(([u, v]) => uv(u, v));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      if (Math.max(...xs) < -60 || Math.min(...xs) > 1140 || Math.max(...ys) < -60 || Math.min(...ys) > 1980) continue;
      const cx = xs.reduce((a, b) => a + b, 0) / pts.length;
      const cy = ys.reduce((a, b) => a + b, 0) / pts.length;
      const [, cv] = toUV(cx, cy);
      out.push({ pts, cx, cy, side: cv < 0 ? -1 : 1, v: Math.abs(cv) });
    }
    return out;
  }

  R.scene({
    id: 'hook',
    post: 0.55, // fica por baixo do reveal enquanto a íris dele abre (ardósia em volta)
    build(root, S) {
      S.T = T;
      // Filtros: traço fervendo, tinta do carimbo, desfoque de movimento.
      const defs = s('svg', { width: 0, height: 0, style: abs({ left: 0, top: 0 }) });
      defs.innerHTML = `
        <defs>
          <filter id="hook-boil" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="1" result="n"/>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
          <filter id="hook-ink" x="-6%" y="-10%" width="112%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7" result="w"/>
            <feDisplacementMap in="SourceGraphic" in2="w" scale="4" xChannelSelector="R" yChannelSelector="G" result="d"/>
            <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="3" result="g"/>
            <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -5.5 3.75" result="m"/>
            <feComposite in="d" in2="m" operator="in"/>
          </filter>
          <filter id="hook-mbx" x="-40%" y="-4%" width="180%" height="108%" color-interpolation-filters="sRGB">
            <feGaussianBlur stdDeviation="0 0"/>
          </filter>
          <filter id="hook-mby" x="-2%" y="-20%" width="104%" height="140%" color-interpolation-filters="sRGB">
            <feGaussianBlur stdDeviation="0 0"/>
          </filter>
        </defs>`;
      root.appendChild(defs);
      S.turbs = [...defs.querySelectorAll('#hook-boil feTurbulence')];
      S.mbx = defs.querySelector('#hook-mbx feGaussianBlur');
      S.mby = defs.querySelector('#hook-mby feGaussianBlur');

      // Fundo ardósia (fixo) + luzes.
      root.appendChild(h('div', { style: abs({ inset: 0, background: `linear-gradient(172deg, ${SLATE} 0%, #1F2839 48%, ${SLATE2} 100%)` }) }));
      S.ambient = h('div', { style: abs({ inset: 0, background: 'radial-gradient(ellipse 60% 38% at 52% 56%, rgba(142,160,191,.16) 0%, rgba(142,160,191,0) 70%)' }) });
      root.appendChild(S.ambient);
      S.tealGlow = h('div', { style: abs({ inset: 0, background: 'radial-gradient(circle at 50% 50%, rgba(20,184,166,.20) 0%, rgba(20,184,166,.06) 26%, rgba(20,184,166,0) 50%)', opacity: '0' }) });
      root.appendChild(S.tealGlow);

      // Câmera.
      const cam = h('div', { style: abs({ inset: 0, transformOrigin: `${CX}px ${CY}px`, willChange: 'transform' }) });
      root.appendChild(cam);
      S.cam = cam;

      // 1) Cadeira, horário, carimbo, poeira.
      const chairLayer = h('div', { style: abs({ inset: 0, willChange: 'transform' }) });
      cam.appendChild(chairLayer);
      S.chairLayer = chairLayer;
      chairLayer.appendChild(h('div', { style: abs({ left: '230px', top: '1478px', width: '660px', height: '64px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(3,6,12,.5), rgba(3,6,12,0))' }) }));
      S.art = chairArt();
      chairLayer.appendChild(S.art.svg);
      // Poeirinha na luz.
      S.motes = Array.from({ length: 14 }, (_, i) => {
        const d = h('div', { style: abs({ left: 0, top: 0, width: '5px', height: '5px', borderRadius: '50%', background: W(0.6) }) });
        chairLayer.appendChild(d);
        return { d, a: R.hash(i * 3.7 + 1), b: R.hash(i * 5.3 + 2), c: R.hash(i * 1.9 + 3) };
      });
      // Sombra do cartão no assento.
      S.cardShadow = h('div', { style: abs({ left: `${CARD.x + 40}px`, top: `${CARD.y + CARD.h + 6}px`, width: `${CARD.w - 80}px`, height: '50px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(3,6,12,.55), rgba(3,6,12,0))', transformOrigin: '50% 50%' }) });
      chairLayer.appendChild(S.cardShadow);
      const cardGroup = h('div', { style: abs({ inset: 0, transformOrigin: `${CARD.x + CARD.w / 2}px ${CARD.y + CARD.h}px`, willChange: 'transform' }) });
      chairLayer.appendChild(cardGroup);
      S.cardGroup = cardGroup;
      S.card = apptCard();
      cardGroup.appendChild(S.card.el);
      // Brilho da trava (um risco de luz que corre na borda de cima).
      S.lockGlint = h('div', { style: abs({ left: `${CARD.x + 40}px`, top: `${CARD.y - 1}px`, width: '160px', height: '3px', borderRadius: '2px', background: `linear-gradient(90deg, ${W(0)}, ${W(0.85)}, ${W(0)})`, opacity: '0' }) });
      cardGroup.appendChild(S.lockGlint);
      // Carimbo: sombra (enquanto desce), tinta, onda.
      S.stampShadow = h('div', {
        style: abs({ left: `${STAMP.cx - STAMP.w / 2}px`, top: `${STAMP.cy - STAMP.h / 2}px`, width: `${STAMP.w}px`, height: `${STAMP.h}px`, borderRadius: '26px', background: 'rgba(3,6,12,.55)', opacity: '0' }),
      });
      cardGroup.appendChild(S.stampShadow);
      S.stamp = stampArt();
      cardGroup.appendChild(S.stamp);
      S.stampRing = h('div', {
        style: abs({ left: `${STAMP.cx - STAMP.w / 2}px`, top: `${STAMP.cy - STAMP.h / 2}px`, width: `${STAMP.w}px`, height: `${STAMP.h}px`, borderRadius: '28px', border: `4px solid ${CORAL}`, boxSizing: 'border-box', opacity: '0' }),
      });
      cardGroup.appendChild(S.stampRing);
      // Poeira do carimbo: sai do contorno, para fora.
      const rad = (STAMP.rot * Math.PI) / 180;
      S.dust = Array.from({ length: 38 }, (_, i) => {
        const r1 = R.hash(i * 12.9 + 1);
        const r2 = R.hash(i * 7.3 + 2);
        const r3 = R.hash(i * 3.1 + 3);
        const r4 = R.hash(i * 9.7 + 4);
        // Ponto no perímetro do retângulo do carimbo.
        const per = 2 * (STAMP.w + STAMP.h);
        let q = r1 * per;
        let lx;
        let ly;
        let nx;
        let ny;
        if (q < STAMP.w) [lx, ly, nx, ny] = [q - STAMP.w / 2, -STAMP.h / 2, 0, -1];
        else if ((q -= STAMP.w) < STAMP.h) [lx, ly, nx, ny] = [STAMP.w / 2, q - STAMP.h / 2, 1, 0];
        else if ((q -= STAMP.h) < STAMP.w) [lx, ly, nx, ny] = [STAMP.w / 2 - q, STAMP.h / 2, 0, 1];
        else [lx, ly, nx, ny] = [-STAMP.w / 2, STAMP.h / 2 - (q - STAMP.w), -1, 0];
        const jx = nx + (r2 - 0.5) * 1.1;
        const jy = ny + (r3 - 0.5) * 1.1;
        const len = Math.hypot(jx, jy) || 1;
        const rot = (x, y) => [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];
        const [ox, oy] = rot(lx, ly);
        const [dx, dy] = rot(jx / len, jy / len);
        const coral = r4 > 0.55;
        const size = R.lerp(4, coral ? 11 : 8, R.hash(i * 4.4 + 5));
        const d = h('div', { style: abs({ left: 0, top: 0, width: `${size}px`, height: `${size}px`, borderRadius: r4 > 0.85 ? '2px' : '50%', background: coral ? CO(0.85) : W(0.6) }) });
        chairLayer.appendChild(d);
        return { d, x: STAMP.cx + ox, y: STAMP.cy + oy, dx, dy, v: R.lerp(420, 1250, r2 * 0.6 + r3 * 0.4), life: R.lerp(0.32, 0.6, r1), size, spin: (r4 - 0.5) * 720 };
      });

      // 2) Caos: planilha + título (é isto que vira cacos).
      const chaos = h('div', { style: abs({ inset: 0 }) });
      cam.appendChild(chaos);
      S.chaos = chaos;
      const sheetLayer = h('div', { style: abs({ inset: 0, willChange: 'transform' }) });
      chaos.appendChild(sheetLayer);
      S.sheetLayer = sheetLayer;
      // A "sala" da planilha é um pouco mais clara: quando os cacos saem, fica a ardósia do fundo.
      sheetLayer.appendChild(h('div', { style: abs({ inset: '-80px', background: `linear-gradient(172deg, #212A3C 0%, #253046 50%, #2B374F 100%)` }) }));
      S.sheet = sheetArt();
      sheetLayer.appendChild(S.sheet.panel);
      S.cursorTrail = [0.36, 0.2, 0.1].map((o) => {
        const c = cursorArt(o);
        sheetLayer.appendChild(c);
        return c;
      });
      S.cursor = cursorArt(1);
      sheetLayer.appendChild(S.cursor);

      const titleLayer = h('div', { style: abs({ inset: 0, willChange: 'transform' }) });
      chaos.appendChild(titleLayer);
      S.titleLayer = titleLayer;
      const titleBlock = (lines) => {
        const el = h('div', {
          style: abs({
            left: `${TITLE.x}px`, top: `${TITLE.y}px`, width: '940px',
            font: `900 ${TITLE.size}px/1.0 ${B.DISPLAY}`, letterSpacing: '-0.045em', color: W(0.96),
            textShadow: '0 12px 40px rgba(3,6,12,.45)',
          }),
        });
        const parts = [];
        lines.forEach((ln) => {
          const d = h('div', { style: { whiteSpace: 'nowrap', height: `${Math.round(TITLE.size * 1.02)}px` } });
          el.appendChild(d);
          // Sem folga na máscara: as linhas ficam coladas e uma não pode vazar na outra na troca.
          parts.push(...R.split(d, ln, { padY: 0.02 }));
        });
        titleLayer.appendChild(el);
        return { el, parts };
      };
      S.t1 = titleBlock(['Faltou', 'de novo.']);
      S.t2 = titleBlock(['Não', 'fecha.']);

      // Riscos de velocidade do chicote.
      S.streaks = Array.from({ length: 9 }, (_, i) => {
        const d = h('div', { style: abs({ left: 0, top: `${Math.round(R.lerp(380, 1560, R.hash(i * 6.1 + 2)))}px`, width: `${Math.round(R.lerp(260, 640, R.hash(i * 2.7 + 9)))}px`, height: `${i % 3 ? 3 : 5}px`, borderRadius: '3px', background: `linear-gradient(90deg, ${W(0)}, ${W(0.5)}, ${W(0)})`, opacity: '0' }) });
        cam.appendChild(d);
        return { d, a: R.hash(i * 3.3 + 7), b: R.hash(i * 8.9 + 1) };
      });

      // 3) Cacos (cópias congeladas do caos no instante do corte).
      const shardsLayer = h('div', { style: abs({ inset: 0, display: 'none' }) });
      cam.appendChild(shardsLayer);
      S.shardsLayer = shardsLayer;
      S.shards = [];

      // Vinheta.
      S.vignette = h('div', { style: abs({ inset: 0, background: 'radial-gradient(ellipse 78% 62% at 50% 50%, rgba(5,8,14,0) 45%, rgba(5,8,14,.62) 100%)' }) });
      root.appendChild(S.vignette);

      // 4) Efeitos fora da câmera: corte de luz, faíscas, a estrela.
      const fx = h('div', { style: abs({ inset: 0 }) });
      root.appendChild(fx);
      const mkSvg = (extra = {}) => s('svg', { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: abs({ left: 0, top: 0, overflow: 'visible', ...extra }) });
      S.slashGlowSvg = mkSvg({ filter: 'blur(12px)' });
      S.slashGlow = s('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: C.teal, 'stroke-width': 30, 'stroke-linecap': 'round', opacity: 0 });
      S.slashGlowSvg.appendChild(S.slashGlow);
      fx.appendChild(S.slashGlowSvg);
      const coreSvg = mkSvg();
      coreSvg.innerHTML = `<defs><linearGradient id="hook-trail" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${C.teal300}" stop-opacity="0"/>
          <stop offset="0.75" stop-color="${C.teal300}" stop-opacity="0.9"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="1"/></linearGradient></defs>`;
      S.trailGrad = coreSvg.querySelector('#hook-trail');
      S.slashCut = s('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: '#ffffff', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0 });
      S.trail = s('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: 'url(#hook-trail)', 'stroke-width': 10, 'stroke-linecap': 'round', opacity: 0 });
      coreSvg.appendChild(S.slashCut);
      coreSvg.appendChild(S.trail);
      fx.appendChild(coreSvg);
      S.sparks = Array.from({ length: 22 }, (_, i) => {
        const k = (i + 0.5) / 22;
        const d = h('div', { style: abs({ left: 0, top: 0, width: '10px', height: '10px', borderRadius: '50%', background: i % 3 ? C.teal300 : '#fff', boxShadow: `0 0 10px ${C.teal}`, opacity: '0' }) });
        fx.appendChild(d);
        return { d, k, side: R.hash(i * 4.1) > 0.5 ? 1 : -1, v: R.lerp(160, 520, R.hash(i * 7.7 + 3)), size: R.lerp(0.5, 1.3, R.hash(i * 2.2 + 8)) };
      });
      S.cornerGlint = h('div', { style: abs({ left: '930px', top: '-150px', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(94,234,212,.7), rgba(94,234,212,0))', opacity: '0' }) });
      fx.appendChild(S.cornerGlint);
      S.starGlow = h('div', { style: abs({ left: `${CX - 300}px`, top: `${CY - 300}px`, width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(45,212,191,.55), rgba(20,184,166,.18) 45%, rgba(20,184,166,0))', opacity: '0' }) });
      fx.appendChild(S.starGlow);
      S.pulseRing = h('div', { style: abs({ left: `${CX - 110}px`, top: `${CY - 110}px`, width: '220px', height: '220px', borderRadius: '50%', border: `3px solid ${C.teal300}`, boxSizing: 'border-box', opacity: '0' }) });
      fx.appendChild(S.pulseRing);
      S.star = h('div', { style: abs({ left: `${CX - STAR_OX}px`, top: `${CY - STAR_OY}px`, transformOrigin: `${STAR_OX}px ${STAR_OY}px`, opacity: '0' }) }, B.star({ size: STAR_W, color: C.teal }));
      fx.appendChild(S.star);
      // Depois do fim (por baixo do reveal): aro teal que acompanha a íris dele.
      const rimSvg = mkSvg();
      S.rim = s('path', { d: '', fill: C.teal, opacity: 0 });
      rimSvg.appendChild(S.rim);
      fx.appendChild(rimSvg);

      // Cacos: congela o caos no instante do corte e copia para cada pedaço.
      S.update(T.freeze - 1e-4, T.freeze - 1e-4, S);
      const polys = shardPolys();
      const maxV = Math.max(...polys.map((p) => p.v));
      const maxD = Math.max(...polys.map((p) => Math.hypot(p.cx - CX, p.cy - CY)));
      polys.forEach((p, i) => {
        // Cada caco é uma camada do tamanho do próprio contorno (camadas de tela
        // inteira, dezenas delas, estouram a memória do compositor).
        const xs = p.pts.map((q) => q[0]);
        const ys = p.pts.map((q) => q[1]);
        const bx = Math.floor(Math.max(-90, Math.min(...xs)));
        const by = Math.floor(Math.max(-90, Math.min(...ys)));
        const bw = Math.ceil(Math.min(1170, Math.max(...xs))) - bx;
        const bh = Math.ceil(Math.min(2010, Math.max(...ys))) - by;
        const wrap = h('div', {
          style: abs({
            left: `${bx}px`, top: `${by}px`, width: `${bw}px`, height: `${bh}px`, overflow: 'hidden',
            clipPath: `polygon(${p.pts.map(([x, y]) => `${(x - bx).toFixed(1)}px ${(y - by).toFixed(1)}px`).join(', ')})`,
            transformOrigin: `${(p.cx - bx).toFixed(1)}px ${(p.cy - by).toFixed(1)}px`,
          }),
        });
        const inner = h('div', { style: abs({ left: `${-bx}px`, top: `${-by}px`, width: '1080px', height: '1920px' }) });
        inner.appendChild(flatten(chaos.cloneNode(true)));
        wrap.appendChild(inner);
        const edge = s('svg', { width: bw, height: bh, viewBox: `${bx} ${by} ${bw} ${bh}`, style: abs({ left: 0, top: 0, overflow: 'visible' }) });
        const ang = Math.round(R.hash(i * 6.67 + 3) * 360);
        const shade = h('div', { style: abs({ inset: 0, background: `linear-gradient(${ang}deg, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 45%, rgba(3,6,12,.35) 100%)`, opacity: '0' }) });
        wrap.appendChild(shade);
        const poly = s('polygon', { points: p.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), fill: 'none', stroke: C.teal300, 'stroke-width': 4, 'stroke-linejoin': 'round', opacity: 0 });
        edge.appendChild(poly);
        wrap.appendChild(edge);
        shardsLayer.appendChild(wrap);
        const rank = 0.65 * (p.v / maxV) + 0.35 * (Math.hypot(p.cx - CX, p.cy - CY) / maxD);
        const r1 = R.hash(i * 3.91 + 0.5);
        const r2 = R.hash(i * 8.17 + 1.5);
        const r3 = R.hash(i * 5.53 + 2.5);
        S.shards.push({
          ...p,
          wrap,
          poly,
          shade,
          rank,
          t0: T.suck + 0.1 * rank + 0.02 * r1,
          dur: 0.17 + 0.05 * r2,
          rot: (r1 - 0.5) * 360,
          rx: (r2 - 0.5) * 110,
          ry: (r3 - 0.5) * 110,
          swirl: (r3 - 0.5) * 260 + 120 * p.side,
          crack: (r2 - 0.5) * 6,
        });
      });
    },

    update(lt, t, S) {
      const post = lt >= S.dur; // por baixo da íris do reveal
      const live = !post && lt < T.freeze; // conteúdo vivo (antes dos cacos)

      // ── Traço fervendo: 12 desenhos por segundo ────────────────────────────
      const step = Math.floor(lt * 12);
      const seed = String(1 + (((step % 5) + 5) % 5) * 3);
      for (const tb of S.turbs) if (tb.getAttribute('seed') !== seed) tb.setAttribute('seed', seed);

      // ── Câmera: aproxima sem parar e treme nos impactos ────────────────────
      const push = R.lerp(1, 1.06, R.clamp(lt / S.dur));
      let qx = 0;
      let qy = 0;
      for (const [t0, amp, dec, sd] of [
        [T.lock, 3, 0.07, 1],
        [T.stamp, 8, 0.11, 2],
        [T.whip - 0.03, 5, 0.07, 3],
        [T.cut + 0.08, 4, 0.06, 4],
        [T.freeze, 7, 0.09, 5],
      ]) {
        const [a, b] = quake(lt, t0, amp, dec, sd);
        qx += a;
        qy += b;
      }
      R.tf(S.cam, { x: qx, y: qy, s: push, r: R.noise(lt * 0.9, 8) * 0.25 });
      S.ambient.style.opacity = String(R.lerp(1, 0.55, R.p(lt, T.whip - 0.1, 0.4)) * (1 - R.p(lt, T.cut, 0.3)));

      // ── 1) Cadeira, horário e carimbo ──────────────────────────────────────
      // Chicote: tudo corre para a esquerda, a planilha vem da direita, colada.
      const panX = (tt) => -1240 * E.anticipate(R.inv(T.whip - 0.17, T.whip + 0.2, tt));
      const pan = panX(lt);
      const vel = (panX(lt + 0.004) - panX(lt - 0.004)) / 0.008; // px/s
      const mb = Math.min(70, Math.abs(vel) * 0.0068);
      S.mbx.setAttribute('stdDeviation', `${mb.toFixed(2)} 0`);
      const mbF = mb > 0.4 ? 'url(#hook-mbx)' : 'none';
      const chairOn = live && lt < T.whip + 0.22;
      S.chairLayer.style.display = chairOn ? 'block' : 'none';
      if (chairOn) {
        S.chairLayer.style.transform = `translate3d(${pan.toFixed(1)}px,0,0)`;
        S.chairLayer.style.filter = mbF;
        // Chão e bordas da luz se desenham do quadro 0.
        const fl = R.p(lt, -0.15, 0.6, E.outCubic);
        R.draw(S.art.floorL, fl);
        R.draw(S.art.floorR, fl);
        const lampOn = 0.82 + 0.18 * R.p(lt, -0.1, 0.4) - 0.1 * (Math.floor(lt * 12) % 7 === 3 ? 1 : 0);
        S.art.cone.style.opacity = lampOn.toFixed(3);
        S.art.lensGlow.style.opacity = lampOn.toFixed(3);
        S.art.pool.style.opacity = lampOn.toFixed(3);
        S.art.coneEdges.forEach((e) => (e.style.opacity = (0.4 + 0.6 * R.p(lt, -0.1, 0.5)).toFixed(3)));
        // Poeirinha flutuando no cone.
        S.motes.forEach((m, i) => {
          const yy = 780 + m.b * 460 - ((lt * (14 + m.c * 22)) % 60);
          const spread = (yy - 720) / 570; // 0 no topo do cone → 1 embaixo
          const xx = R.lerp(400, 560, m.a) + (m.a - 0.5) * spread * 420 + R.noise(lt * 0.8 + i, i) * 14;
          const tw = 0.25 + 0.75 * Math.abs(Math.sin(lt * (1.3 + m.c) + i));
          R.tf(m.d, { x: xx, y: yy, s: 0.5 + m.c * 0.7, o: tw * 0.45 });
        });

        // Horário: já vem descendo no quadro 0 e trava em T.lock.
        let cy = 0;
        let rr = 0;
        let sx = 1;
        let sy = 1;
        if (lt < T.lock) {
          const k = R.clamp(lt / T.lock);
          cy = -250 * (1 - k) * (1 - 0.35 * k);
          rr = -2.4 * (1 - k);
        } else {
          const tt = lt - T.lock;
          cy = 13 * Math.exp(-tt * 13) * Math.sin(tt * 40);
          const sq = 0.05 * Math.exp(-tt * 12) * Math.cos(tt * 36);
          sy = 1 - sq;
          sx = 1 + sq * 0.5;
        }
        if (lt >= T.stamp) {
          const tt = lt - T.stamp;
          cy += 15 * Math.exp(-tt * 11) * Math.sin(tt * 34);
          rr += -1.4 * Math.exp(-tt * 9) * Math.sin(tt * 26);
        }
        R.tf(S.cardGroup, { y: cy, r: rr, sx, sy });
        const land = R.clamp(1 - Math.abs(cy) / 250);
        R.tf(S.cardShadow, { sx: R.lerp(0.55, 1, land), sy: R.lerp(0.55, 1, land), o: R.lerp(0.15, 1, land) });
        const g = R.p(lt, T.lock, 0.3, E.outCubic);
        R.tf(S.lockGlint, { x: g * (CARD.w - 240), o: lt < T.lock ? 0 : Math.sin(g * Math.PI) });
        // Depois do carimbo o horário apaga um pouco: o foco é o "FALTOU".
        S.card.col.style.opacity = String(R.lerp(1, 0.62, R.p(lt, T.stamp, 0.3)));
        S.card.avatar.style.opacity = String(R.lerp(1, 0.6, R.p(lt, T.stamp, 0.3)));
        S.card.flash.style.opacity = lt < T.stamp ? '0' : (0.16 * Math.exp(-(lt - T.stamp) * 14)).toFixed(3);

        // Carimbo: desce do alto, girando, e bate em T.stamp.
        const sa = T.stamp - 0.1;
        if (lt < sa) {
          S.stamp.style.opacity = '0';
          S.stampShadow.style.opacity = '0';
          S.stampRing.style.opacity = '0';
        } else {
          const k = R.p(lt, sa, 0.1, E.inQuad);
          let sc = R.lerp(2.1, 1, k);
          if (lt >= T.stamp) {
            const tt = lt - T.stamp;
            sc = 1 - 0.07 * Math.exp(-tt * 12) * Math.sin(tt * 42);
          }
          R.tf(S.stamp, { s: sc, r: STAMP.rot - 7 * (1 - k), o: R.clamp(k * 3) });
          const lift = 1 - k;
          R.tf(S.stampShadow, { x: lift * 40, y: lift * 70, s: R.lerp(1, 1.5, lift), r: STAMP.rot - 7 * lift, o: lt < T.stamp ? k * 0.55 : 0, blur: R.lerp(6, 34, lift) });
          const rk = R.p(lt, T.stamp, 0.38, E.outCubic);
          R.tf(S.stampRing, { s: R.lerp(1, 1.45, rk), r: STAMP.rot, o: lt < T.stamp ? 0 : (1 - rk) * 0.75 });
        }
        // Poeira.
        S.dust.forEach((p) => {
          const tt = lt - T.stamp;
          if (tt < 0 || tt > p.life) {
            p.d.style.opacity = '0';
            return;
          }
          const drag = 9;
          const dist = (p.v / drag) * (1 - Math.exp(-drag * tt));
          const x = p.x + p.dx * dist;
          const y = p.y + p.dy * dist + 260 * tt * tt;
          const life = tt / p.life;
          R.tf(p.d, { x: x - p.size / 2, y: y - p.size / 2, s: 1 - life * 0.5, r: p.spin * tt, o: (1 - life) * R.clamp(tt * 40) });
        });
      }

      // ── 2) Planilha ────────────────────────────────────────────────────────
      const sheetOn = live && lt >= T.whip - 0.12;
      S.sheetLayer.style.display = sheetOn ? 'block' : 'none';
      if (sheetOn) {
        S.sheetLayer.style.transform = `translate3d(${(pan + 1240).toFixed(1)}px,0,0)`;
        S.sheetLayer.style.filter = mbF;
        // Inclinação 3D só na chegada: assenta plana antes do corte (os cacos são 2D).
        const settle = R.p(lt, T.whip, 1.3, E.outCubic);
        const flat = R.p(lt, T.whip, 1.05, E.outCubic);
        R.tf(S.sheet.panel, {
          persp: 2600,
          rx: flat >= 1 ? 0 : R.lerp(12, 0, flat),
          ry: flat >= 1 ? 0 : R.lerp(-6, 0, flat),
          r: R.lerp(-4, -1.6, settle) + R.noise(lt * 1.2, 3) * 0.4,
          y: R.lerp(40, 0, settle),
          s: R.lerp(1.04, 1, settle),
        });
        // Rola para cima rápido demais, passa do fim e volta.
        const scrollAt = (tt) => SCROLL_END * R.sp(tt, T.sheetScroll, { k: 90, c: 11 });
        const sc = scrollAt(lt);
        const vs = Math.abs(scrollAt(lt + 0.004) - scrollAt(lt - 0.004)) / 0.008;
        const blurY = Math.min(30, vs * 0.0042);
        S.mby.setAttribute('stdDeviation', `0 ${blurY.toFixed(2)}`);
        S.sheet.rows.style.transform = `translate3d(0, ${(-sc).toFixed(1)}px, 0)`;
        S.sheet.rows.style.filter = blurY > 0.4 ? 'url(#hook-mby)' : 'none';
        // Seleção pulando e lampejos (12 qps).
        const first = Math.max(0, Math.floor(sc / ROW_H));
        const pick = (salt, n) => Math.floor(R.hash(step * 1.37 + salt) * n);
        const colX = (ci) => COLS.slice(0, ci).reduce((a, c) => a + c.w, 0);
        const selOn = lt > T.whip + 0.08 && R.hash(step * 0.71 + 9) > 0.18;
        const sr = Math.min(TOTAL_I - 1, first + pick(1, 8));
        const sci = 1 + pick(2, 4);
        Object.assign(S.sheet.sel.style, { left: `${colX(sci)}px`, top: `${sr * ROW_H}px`, width: `${COLS[sci].w}px`, height: `${ROW_H}px`, opacity: selOn ? '1' : '0' });
        const fr = Math.min(TOTAL_I, first + pick(3, 8));
        const fci = 1 + pick(4, 4);
        Object.assign(S.sheet.flash.style, { left: `${colX(fci)}px`, top: `${fr * ROW_H}px`, width: `${COLS[fci].w}px`, height: `${ROW_H}px`, opacity: R.hash(step * 2.3 + 1) > 0.45 ? '1' : '0' });
        S.sheet.flick.forEach((f) => {
          const txt = R.hash(step * 0.93 + f.seed * 11) > 0.5 ? f.a : f.b;
          if (f.el.textContent !== txt) f.el.textContent = txt;
        });
        S.sheet.caret.style.opacity = Math.floor(lt * 4) % 2 ? '0' : '1';
        // Total "???" piscando em coral.
        const blinkOn = lt >= T.total && Math.floor((lt - T.total) * 7) % 2 === 0;
        S.sheet.totalCell.style.opacity = lt < T.total ? '0.4' : blinkOn ? '1' : '0.5';
        // Cursor perdido: anda em círculos, dá trancos e se perde.
        const cur = (tt) => {
          const lost = R.p(tt, T.swap, 0.6, E.inOutCubic);
          const jump = Math.floor(tt * 4);
          const jx = (R.hash(jump * 3.1 + 2) - 0.5) * 260 * R.p(tt, T.whip + 0.4, 0.3);
          const jy = (R.hash(jump * 5.9 + 6) - 0.5) * 220 * R.p(tt, T.whip + 0.4, 0.3);
          return [
            600 + 260 * R.noise(tt * 2.4, 31) + 120 * R.noise(tt * 6.5, 37) + jx + lost * 120 * Math.cos(tt * 9),
            1150 + 240 * R.noise(tt * 2.1, 41) + 110 * R.noise(tt * 6.1, 43) + jy + lost * 120 * Math.sin(tt * 9),
          ];
        };
        const cIn = R.p(lt, T.whip + 0.12, 0.25);
        const [cx, cy] = cur(lt);
        S.cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
        S.cursor.style.opacity = cIn.toFixed(3);
        S.cursorTrail.forEach((c, i) => {
          const [tx, ty] = cur(lt - 0.03 * (i + 1));
          c.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
          c.style.opacity = (cIn * [0.26, 0.13, 0.06][i]).toFixed(3);
        });
      }

      // ── Título: "Faltou / de novo." → "Não / fecha." ───────────────────────
      S.titleLayer.style.display = live ? 'block' : 'none';
      if (live) {
        // Entra palavra a palavra; na troca as linhas rolam juntas (a velha sobe, a nova chega por baixo).
        const roll = (line) => R.p(lt, T.swap + line * 0.06, 0.32, ROLL);
        S.t1.parts.forEach((p, i) => {
          const kin = R.p(lt, T.title1 + i * 0.1, 0.55, E.snappy);
          const ko = roll(i === 0 ? 0 : 1);
          const y = (1 - kin) * 130 - 130 * ko;
          p.style.transform = `translate3d(0, ${y.toFixed(2)}%, 0) rotate(${((1 - kin) * 5).toFixed(2)}deg)`;
          p.style.opacity = (1 - 0.7 * ko).toFixed(3);
        });
        S.t2.parts.forEach((p, i) => {
          p.style.transform = `translate3d(0, ${((1 - roll(i)) * 130).toFixed(2)}%, 0)`;
        });
        const jolt = -26 * bell(lt, T.whip, 0.06) + 10 * bell(lt, T.whip + 0.1, 0.06);
        R.tf(S.titleLayer, { x: jolt });
      }

      // Riscos de velocidade no chicote.
      S.streaks.forEach((st, i) => {
        const k = R.inv(T.whip - 0.12 + st.a * 0.06, T.whip + 0.14 + st.a * 0.06, lt);
        const on = k > 0 && k < 1 && live;
        st.d.style.opacity = on ? (Math.sin(k * Math.PI) * (0.35 + 0.5 * st.b)).toFixed(3) : '0';
        if (on) st.d.style.transform = `translate3d(${R.lerp(1180, -700, k).toFixed(1)}px,0,0)`;
      });

      S.chaos.style.display = live ? 'block' : 'none';

      // ── 3) Cacos sugados pela estrela ──────────────────────────────────────
      const shardsOn = !post && lt >= T.freeze && S.shards.length > 0;
      S.shardsLayer.style.display = shardsOn ? 'block' : 'none';
      if (shardsOn) {
        const split = E.outCubic(R.p(lt, T.freeze, 0.12)) * 30;
        S.shards.forEach((sh) => {
          const k = R.p(lt, sh.t0, sh.dur, E.inCubic);
          if (k >= 1) {
            sh.wrap.style.display = 'none';
            return;
          }
          sh.wrap.style.display = 'block';
          const ox = DV[0] * split * sh.side;
          const oy = DV[1] * split * sh.side;
          const tx = CX - sh.cx;
          const ty = CY - sh.cy;
          const dist = Math.hypot(tx, ty) || 1;
          const sw = Math.sin(Math.PI * k) * sh.swirl;
          const x = ox * (1 - k) + tx * k + (-ty / dist) * sw;
          const y = oy * (1 - k) + ty * k + (tx / dist) * sw;
          const crack = R.p(lt, T.freeze, 0.1) * sh.crack;
          R.tf(sh.wrap, {
            persp: 1800,
            x,
            y,
            r: crack + sh.rot * k,
            rx: sh.rx * k,
            ry: sh.ry * k,
            s: R.lerp(1, 0.06, E.inQuad(k)),
            o: 1 - R.inv(0.72, 1, k),
          });
          // Rachaduras correm a partir do corte; a borda acende quando o caco voa.
          const crackK = R.p(lt, T.freeze + sh.rank * 0.07, 0.05);
          sh.poly.setAttribute('opacity', R.clamp(0.22 * crackK + 0.7 * k).toFixed(3));
          sh.shade.style.opacity = R.clamp(0.25 * crackK + 1.3 * k).toFixed(3);
        });
      }

      // ── 4) A estrela corta a tela ──────────────────────────────────────────
      S.cornerGlint.style.opacity = String(post ? 0 : hump(lt, T.cut - 0.12, T.cut + 0.08) * 0.9);
      const fly = R.p(lt, T.cut, 0.21, E.outCubic);
      const su = R.lerp(U_IN, 0, fly);
      const [stx, sty] = uv(su, 0);
      if (post || lt < T.cut) {
        S.star.style.opacity = '0';
      } else {
        const spin = -720 * (1 - R.p(lt, T.cut, T.settle - T.cut, E.outCubic));
        let sc = R.lerp(0.62, 1, fly) * (1 + 0.16 * hump(lt, T.freeze + 0.02, T.freeze + 0.16) + 0.2 * hump(lt, T.freeze + 0.18, T.settle));
        if (lt >= T.settle) sc = 1;
        if (lt >= T.settle) {
          // Geometria exata da passagem: B.star 160 px, centro (540, 960), sem transform.
          S.star.style.transform = 'none';
          S.star.style.opacity = '1';
        } else R.tf(S.star, { x: stx - CX, y: sty - CY, r: spin, s: sc, o: 1 });
      }
      // Rastro de luz: do canto até a estrela; o corte corre na frente até o outro canto.
      const head = R.lerp(U_IN, -U_IN, R.p(lt, T.cut + 0.01, 0.12, E.outQuart));
      const [ax, ay] = uv(U_IN, 0);
      const [hx, hy] = uv(head, 0);
      const cutVis = post ? 0 : R.window(lt, T.cut, T.freeze + 0.16, 0.02, 0.14);
      const flare = 1 + 1.6 * bell(lt, T.freeze, 0.03);
      for (const ln of [S.slashCut, S.slashGlow]) {
        ln.setAttribute('x1', ax.toFixed(1));
        ln.setAttribute('y1', ay.toFixed(1));
        ln.setAttribute('x2', hx.toFixed(1));
        ln.setAttribute('y2', hy.toFixed(1));
      }
      S.slashCut.setAttribute('opacity', (cutVis * 0.95).toFixed(3));
      S.slashCut.setAttribute('stroke-width', (3 * flare).toFixed(2));
      S.slashGlow.setAttribute('opacity', (cutVis * 0.75).toFixed(3));
      S.slashGlow.setAttribute('stroke-width', (26 * flare).toFixed(2));
      S.trail.setAttribute('x1', ax.toFixed(1));
      S.trail.setAttribute('y1', ay.toFixed(1));
      S.trail.setAttribute('x2', stx.toFixed(1));
      S.trail.setAttribute('y2', sty.toFixed(1));
      S.trailGrad.setAttribute('x1', ax.toFixed(1));
      S.trailGrad.setAttribute('y1', ay.toFixed(1));
      S.trailGrad.setAttribute('x2', stx.toFixed(1));
      S.trailGrad.setAttribute('y2', sty.toFixed(1));
      S.trail.setAttribute('opacity', (post ? 0 : R.window(lt, T.cut, T.freeze + 0.1, 0.02, 0.16)).toFixed(3));
      // Faíscas que se soltam do caminho da estrela.
      S.sparks.forEach((sp) => {
        const u = R.lerp(U_IN * 0.9, -40, sp.k);
        const fk = (u - U_IN) / -U_IN; // fração do voo
        const born = T.cut + 0.21 * (1 - Math.cbrt(1 - R.clamp(fk)));
        const tt = lt - born;
        if (post || tt < 0 || tt > 0.32) {
          sp.d.style.opacity = '0';
          return;
        }
        const [bx, by] = uv(u, 0);
        const d = (sp.v / 8) * (1 - Math.exp(-8 * tt));
        const k = tt / 0.32;
        R.tf(sp.d, { x: bx + DV[0] * d * sp.side - 5 + DU[0] * d * 0.3, y: by + DV[1] * d * sp.side - 5 + DU[1] * d * 0.3, s: sp.size * (1 - k), o: 1 - k });
      });
      // Brilho e pulso da estrela; tudo some antes do último quadro.
      const glow = post ? 0 : R.p(lt, T.cut, 0.12) * (1 - R.p(lt, T.settle - 0.12, 0.12, E.inOutSine));
      S.starGlow.style.opacity = (glow * (0.75 + 0.35 * hump(lt, T.freeze + 0.18, T.settle))).toFixed(3);
      R.tf(S.starGlow, { x: lt >= T.settle ? 0 : (stx - CX) * 0.9, y: lt >= T.settle ? 0 : (sty - CY) * 0.9, s: 0.8 + 0.3 * hump(lt, T.freeze, T.settle) });
      S.tealGlow.style.opacity = (post ? 0 : R.p(lt, T.cut + 0.05, 0.15) * (1 - R.p(lt, T.settle - 0.15, 0.15))).toFixed(3);
      const pr = R.p(lt, T.settle - 0.13, 0.14, E.outCubic);
      R.tf(S.pulseRing, { s: R.lerp(0.55, 2.1, pr), o: post || lt < T.settle - 0.13 ? 0 : (1 - pr) * 0.7 });

      // ── Depois do fim: aro teal em volta da íris do reveal ─────────────────
      if (post) {
        const lr = lt - S.dur;
        const k = R.lerp(0.0265, 1, R.p(lr, 0, 0.5, E.inCubic)); // mesma conta da íris do reveal
        const r = R.lerp(0, 2600, k);
        S.rim.setAttribute('d', R.starPath(CX, CY, r + R.lerp(11, 30, k), R.lerp(0.18, 0.7, k), 0));
        S.rim.setAttribute('opacity', (1 - R.p(lr, 0.12, 0.3)).toFixed(3));
      } else S.rim.setAttribute('opacity', '0');
    },
  });
})();
