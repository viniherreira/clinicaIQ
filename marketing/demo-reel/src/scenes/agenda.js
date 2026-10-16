/*
 * Cena "agenda" (global 6,5–10,5; local 0–4).
 *
 * A grade de pontos que sobrou do mergulho na logo vira a agenda: algumas
 * linhas de pontos se ligam e viram os horários (13:00–17:00), um tablet se
 * desenha em volta, e três profissionais aparecem lado a lado com os horários
 * do dia. Um cursor arrasta o bloco novo da Mariana para as 14:00 da
 * Dra. Paula, por cima de um horário ocupado: contorno âmbar, tremida e
 * "Conflito de horário". O bloco escorrega para as 14:30, encaixa e vira
 * "Agendado". No fim ele sai da grade, vem para a câmera e vira o cartão da
 * passagem (B.handoff.patientCard, status "scheduled") sobre o branco quente.
 *
 * Passagens: começa com o branco quente + B.dots({gap: 28, color: 'rgba(15,59,130,.07)'})
 * sem transform (como o reveal termina); termina só com o cartão, sem transform.
 */
(() => {
  const { h, s } = R;
  const E = R.ease;
  const C = B.C;
  const TL = window.TIMELINE;
  const T0 = TL.agenda.start;
  const DUR = TL.agenda.end - T0; // 4,0
  const EV = TL.events;
  const L = (g) => g - T0; // global → local
  const VO = Object.fromEntries(TL.vo.map((v) => [v.id, { start: L(v.start), end: L(v.end) }]));

  // ── Tempos locais (todos derivados do TIMELINE) ─────────────────────────────
  const T = {
    booked: L(EV.marianaBooked), // 1,20 — "Mariana": o cursor pega o bloco
    conflict: L(EV.conflict), // 2,00 — "Conflito?"
    solved: L(EV.conflictSolved), // 3,10 — "na hora": escorrega para 14:30
  };
  T.title1 = VO.p5a.start + 0.35; // 0,60 "Profissionais lado a lado"
  T.title1Out = T.conflict - 0.48; // 1,52 (sai antes de "Conflito?")
  T.spawn = T.booked - 0.2; // 1,00 o bloco novo nasce
  T.cursorIn = T.spawn - 0.12; // 0,88
  T.grab = T.booked - 0.03; // 1,17 clique
  T.drag0 = T.booked + 0.02; // 1,22
  T.drag1 = T.conflict - 0.1; // 1,90 chega nas 14:00
  T.title2 = VO.p5b.start + 0.03; // 1,98 "Conflito?"
  T.avisado = VO.p5b.start + 0.85; // 2,80 "Avisado."
  T.tipIn = T.conflict + 0.06;
  T.tipOut = T.solved - 0.08;
  T.chip = T.solved + 0.16; // "Agendado"
  T.release = T.solved + 0.18; // o cursor solta
  T.spark = T.solved + 0.16;
  T.exit = DUR - 0.55; // 3,45 tablet sai, bloco se solta
  T.m0 = DUR - 0.45; // 3,55 começa o morph
  T.m1 = DUR - 0.06; // 3,94 cartão parado na geometria da passagem

  // ── Geometria ───────────────────────────────────────────────────────────────
  // A grade de pontos de B.dots: inset -40 px, ponto centrado em 2,2 px do ladrilho.
  const GAP = 28;
  const dotC = (i) => -40 + 2.2 + GAP * i;
  const ROW0 = 29; // linha de pontos que vira as 13:00 (y 774,2)
  const SLOT = GAP * 3; // meia hora = 3 linhas de pontos (84 px)
  const lineY = (k) => dotC(ROW0) + SLOT * k; // k = meias horas desde 13:00
  const GX0 = 188;
  const GX1 = 962;
  const COLW = (GX1 - GX0) / 3; // 258
  const colX = (c) => GX0 + COLW * c;
  const slotRect = (c, k, n = 1) => ({ x: colX(c) + 5, y: lineY(k) + 4, w: COLW - 10, h: SLOT * n - 8 });
  const mid = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const TAB = { x: 80, y: 500, w: 920, h: 1030, r: 48, sw: 6 };
  const HR = slotRect(0, 3); // 14:30 da Dra. Paula (livre)
  const HW = HR.w;
  const HH = HR.h;
  const P_SPAWN = mid(slotRect(2, 5)); // nasce sobre a coluna livre da Dra. Lia
  const P_BUSY = mid(slotRect(0, 2)); // 14:00 da Dra. Paula (Carlos)
  const P_HOVER = { x: P_BUSY.x + 32, y: P_BUSY.y - 3 }; // por cima do Carlos; a barra dele aparece à esquerda
  const P_FREE = mid(HR);
  const Q_DRAG = { x: 650, y: 1000 }; // controle da curva do arrasto
  // Origens altas: a borda de cima do tablet não sobe para a faixa do título.
  const CAM_O = { x: 540, y: 600 };
  const PUSH_O = { x: 330, y: 700 };
  const PC = B.handoff.PATIENT_CARD; // {x:100, y:850, w:880, h:220}
  const AMBER = '#F2B84B';
  const AMBER_RGB = '242,184,75';
  const TEAL_RGB = '20,184,166';
  const HOURS = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];

  const LABELS = {
    retorno: { name: 'Retorno', bg: '#E7F8F5', bar: C.teal, fg: C.teal800 },
    limpeza: { name: 'Limpeza', bg: '#EAF7EF', bar: '#7FCFA0', fg: '#1D5C3A' },
    avaliacao: { name: 'Avaliação', bg: '#EAF2FE', bar: '#6AA8F7', fg: '#1E3A8A' },
    clareamento: { name: 'Clareamento', bg: '#F2EEFE', bar: '#A78BFA', fg: '#4C1D95' },
  };
  const PROS = [
    { name: 'Dra. Paula', ini: 'P', bg: C.teal700, fg: '#fff' },
    { name: 'Dr. Rafael', ini: 'R', bg: C.mint, fg: C.navy },
    { name: 'Dra. Lia', ini: 'L', bg: '#BFDBFE', fg: '#1E3A8A' },
  ];
  const APPTS = [
    { c: 0, k: 2, n: 1, who: 'Carlos Lima', lab: 'retorno' },
    { c: 1, k: 0, n: 2, who: 'Pedro Alves', lab: 'limpeza' },
    { c: 2, k: 1, n: 2, who: 'Juliana Reis', lab: 'avaliacao' },
    { c: 0, k: 5, n: 2, who: 'Ana Souza', lab: 'clareamento' },
    { c: 1, k: 6, n: 2, blocked: true },
  ];

  // Sombras como camadas numéricas, para interpolar.
  const REST = [[0, 4, 10, -4, 0.14], [0, 1, 3, 0, 0.08], [0, 0, 0, 1, 0.04]];
  const LIFT = [[0, 28, 46, -16, 0.34], [0, 10, 18, -10, 0.18], [0, 0, 0, 1, 0.04]];
  const LG = [[0, 30, 60, -20, 0.28], [0, 10, 24, -10, 0.14], [0, 0, 0, 1, 0.04]]; // = B.card shadow 'lg'
  const lerpLayers = (A, Bl, k) => A.map((l, i) => l.map((v, j) => R.lerp(v, Bl[i][j], k)));
  const shadowStr = (layers) =>
    layers.map(([x, y, b, sp, a]) => `${x.toFixed(2)}px ${y.toFixed(2)}px ${b.toFixed(2)}px ${sp.toFixed(2)}px rgba(11,31,63,${a.toFixed(3)})`).join(', ');
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, k) => {
    const A = hex(a);
    const Bc = hex(b);
    return `rgb(${A.map((v, i) => Math.round(R.lerp(v, Bc[i], R.clamp(k)))).join(',')})`;
  };
  const abs = (el, x, y, w, hh) => B.abs(el, x, y, w, hh);
  const bez = (u) => {
    const a = (1 - u) * (1 - u);
    const b = 2 * u * (1 - u);
    const c = u * u;
    return { x: a * P_SPAWN.x + b * Q_DRAG.x + c * P_HOVER.x, y: a * P_SPAWN.y + b * Q_DRAG.y + c * P_HOVER.y };
  };
  const MORPH = E.bezier(0.55, 0, 0.12, 1);

  // ── Câmera: deriva leve + push-in no conflito ──────────────────────────────
  function cam(lt) {
    const d = R.p(lt, 0, DUR, E.inOutSine);
    const sD = R.lerp(1, 1.03, d);
    const yD = R.lerp(0, 4, d);
    const push = R.kf(lt, [[T.conflict, 0], [T.conflict + 0.2, 1, E.outCubic], [T.conflict + 0.85, 0, E.smooth]]);
    const sP = 1 + 0.06 * push;
    return { sD, yD, sP, s: sD * sP };
  }
  /** Ponto do mundo (dentro das duas câmeras) → tela. */
  function toScreen(c, x, y) {
    const x1 = PUSH_O.x + (x - PUSH_O.x) * c.sP;
    const y1 = PUSH_O.y + (y - PUSH_O.y) * c.sP;
    return { x: CAM_O.x + (x1 - CAM_O.x) * c.sD, y: CAM_O.y + (y1 - CAM_O.y) * c.sD + c.yD };
  }

  // ── Bloco da Mariana: posição no mundo ──────────────────────────────────────
  function heroWorld(lt) {
    if (lt < T.drag0) return { x: P_SPAWN.x, y: P_SPAWN.y, lift: 1.04, r: -3, lifted: 1 };
    if (lt < T.solved) {
      const uOf = (tt) => R.p(tt, T.drag0, T.drag1 - T.drag0, E.inOutCubic);
      const u = uOf(lt);
      const p = bez(u);
      const vx = (bez(uOf(lt + 1 / 60)).x - p.x) * 60; // px/s
      let r = R.lerp(-3, 0, u) + R.clamp(vx * 0.0028, -7, 7);
      // Tremida: 3 vezes, 8 px.
      const sk = R.inv(T.conflict, T.conflict + 0.4, lt);
      const shake = lt >= T.conflict && sk < 1 ? Math.sin(sk * Math.PI * 6) * 8 * (1 - sk * 0.45) : 0;
      if (lt >= T.conflict && sk < 1) r += Math.sin(sk * Math.PI * 6) * 0.6;
      return { x: p.x + shake, y: p.y, lift: 1.04, r, lifted: 1 };
    }
    const k = R.sp(lt, T.solved, { k: 300, c: 21 });
    const x = R.lerp(P_HOVER.x, P_FREE.x, k);
    const y = R.lerp(P_HOVER.y, P_FREE.y, k);
    let lift = R.lerp(1.04, 1, k);
    let lifted = R.clamp(1 - k, 0, 1);
    // Saída: se solta da grade e vem para a câmera.
    const ex = R.p(lt, T.exit, T.m0 - T.exit + 0.02, E.outCubic);
    lift *= R.lerp(1, 1.08, ex);
    lifted = Math.max(lifted, ex * 1.15);
    return { x, y: y - 8 * ex, lift, r: 0, lifted };
  }
  function heroScreen(lt) {
    const c = cam(lt);
    const w = heroWorld(lt);
    const p = toScreen(c, w.x, w.y);
    return { cx: p.x, cy: p.y, s: c.s * w.lift, r: w.r, lifted: w.lifted, c, w };
  }

  // ── Peças ──────────────────────────────────────────────────────────────────
  function apptBlock(a) {
    const r = slotRect(a.c, a.k, a.n);
    if (a.blocked) {
      return h(
        'div',
        {
          style: {
            position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, borderRadius: '16px',
            background: 'repeating-linear-gradient(135deg, #F2F0EB 0 11px, #E6E3DC 11px 22px)', boxShadow: 'inset 0 0 0 2px #E1DED6',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transformOrigin: '50% 0%', willChange: 'transform',
          },
        },
        B.icon('lock', { size: 28, color: C.muted, sw: 2.3 }),
        B.text('Bloqueado', { size: 27, weight: 650, color: C.muted, ls: '-0.015em', style: { whiteSpace: 'nowrap' } }),
      );
    }
    const lab = LABELS[a.lab];
    const tall = a.n > 1;
    const range = `${HOURS[a.k]} – ${HOURS[a.k + a.n]}`;
    const ring = h('div', { style: { position: 'absolute', inset: '0', borderRadius: '16px', boxShadow: 'none' } });
    const el = h(
      'div',
      {
        style: {
          position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, borderRadius: '16px',
          background: lab.bg, overflow: 'hidden', boxSizing: 'border-box', padding: tall ? '18px 10px 0 26px' : '0 10px 0 26px',
          display: 'flex', flexDirection: 'column', justifyContent: tall ? 'flex-start' : 'center', gap: '6px',
          transformOrigin: '50% 0%', willChange: 'transform', boxShadow: '0 1px 2px rgba(11,31,63,.05)',
        },
      },
      h('div', { style: { position: 'absolute', left: '0', top: '0', bottom: '0', width: '8px', background: lab.bar } }),
      B.text(a.who, { size: 28, weight: 700, color: C.ink, ls: '-0.025em', style: { whiteSpace: 'nowrap' } }),
      B.text(lab.name, { size: 24, weight: 600, color: lab.fg, ls: '-0.01em', style: { whiteSpace: 'nowrap' } }),
      tall ? B.text(range, { size: 24, weight: 500, color: C.muted, ls: '-0.01em', style: { whiteSpace: 'nowrap', marginTop: '6px' } }) : null,
      ring,
    );
    el._ring = ring;
    return el;
  }

  /** Conteúdo do bloco da Mariana (sem nome), reaproveitado no morph. */
  function heroBody() {
    const lab = LABELS.avaliacao;
    const clip = h('div', { style: { position: 'absolute', inset: '0', borderRadius: '16px', overflow: 'hidden' } }, h('div', { style: { position: 'absolute', left: '0', top: '0', bottom: '0', width: '8px', background: lab.bar } }));
    const sub = B.text(lab.name, { size: 24, weight: 600, color: lab.fg, ls: '-0.01em', style: { whiteSpace: 'nowrap' } });
    return { clip, sub };
  }

  function cursorEl() {
    const svg = s(
      'svg',
      { width: 62, height: 62, viewBox: '0 0 24 24', style: { display: 'block', overflow: 'visible' } },
      s('path', { d: 'M4.6 2.6 L4.6 19.4 L8.9 15.4 L11.9 21.8 L15 20.4 L12 14.1 L18.1 14.1 Z', fill: C.ink, stroke: '#fff', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }),
    );
    // Ponta do cursor em (4,6; 2,6) de 24 → px.
    const tip = { x: (4.6 * 62) / 24, y: (2.6 * 62) / 24 };
    const el = h('div', { style: { position: 'absolute', left: '0', top: '0', transformOrigin: `${tip.x}px ${tip.y}px`, filter: 'drop-shadow(0 8px 10px rgba(6,24,51,.30))', visibility: 'hidden', willChange: 'transform' } }, svg);
    return { el, tip };
  }

  R.scene({
    id: 'agenda',
    build(root, S) {
      root.style.background = C.warm;

      // ── Mundo: duas câmeras (deriva e push-in) ──
      const camD = h('div', { style: { position: 'absolute', inset: '0', transformOrigin: `${CAM_O.x}px ${CAM_O.y}px`, willChange: 'transform' } });
      const camP = h('div', { style: { position: 'absolute', inset: '0', transformOrigin: `${PUSH_O.x}px ${PUSH_O.y}px`, willChange: 'transform' } });
      root.appendChild(camD);
      camD.appendChild(camP);
      const dots = B.dots({ gap: 28, color: 'rgba(15,59,130,.07)' });
      camP.appendChild(dots);
      const tab = h('div', { style: { position: 'absolute', inset: '0', transformOrigin: '540px 1015px', willChange: 'transform' } });
      camP.appendChild(tab);

      // Tablet: superfície, contorno desenhado (duas metades a partir do topo), câmera.
      const fill = h('div', {
        style: {
          position: 'absolute', left: `${TAB.x + 3}px`, top: `${TAB.y + 3}px`, width: `${TAB.w - 6}px`, height: `${TAB.h - 6}px`, borderRadius: `${TAB.r - 3}px`,
          background: '#fff', opacity: 0,
          boxShadow: '0 60px 110px -50px rgba(20,184,166,.55), 0 24px 50px -30px rgba(15,118,110,.35), 0 10px 24px -16px rgba(11,31,63,.16)',
        },
      });
      tab.appendChild(fill);
      const fx0 = TAB.x + 3;
      const fx1 = TAB.x + TAB.w - 3;
      const fy0 = TAB.y + 3;
      const fy1 = TAB.y + TAB.h - 3;
      const rr = TAB.r - 3;
      const half = (dir) => {
        const xe = dir > 0 ? fx1 : fx0;
        const sweep = dir > 0 ? 1 : 0;
        return (
          `M 540 ${fy0} H ${xe - dir * rr} A ${rr} ${rr} 0 0 ${sweep} ${xe} ${fy0 + rr} V ${fy1 - rr} ` +
          `A ${rr} ${rr} 0 0 ${sweep} ${xe - dir * rr} ${fy1} H 540`
        );
      };
      const frameSvg = s('svg', { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible' } });
      const frames = [1, -1].map((dir) => {
        const p = s('path', { d: half(dir), fill: 'none', stroke: C.navy, 'stroke-width': TAB.sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
        frameSvg.appendChild(p);
        return p;
      });
      tab.appendChild(frameSvg);
      const lens = h('div', { style: { position: 'absolute', left: '534px', top: '516px', width: '12px', height: '12px', borderRadius: '50%', background: C.navy, opacity: 0 } });
      tab.appendChild(lens);

      // Linhas de horário: pontos que acendem + traço que liga + cabeça luminosa.
      const rows = HOURS.map((label, k) => {
        const y = lineY(k);
        const full = k % 2 === 0;
        const line = h('div', {
          style: {
            position: 'absolute', left: `${GX0}px`, top: `${y - 1}px`, width: `${GX1 - GX0}px`, height: '2px', borderRadius: '1px',
            background: full ? 'rgba(11,31,63,.13)' : 'rgba(11,31,63,.065)', transformOrigin: '0 50%', transform: 'scaleX(0)',
          },
        });
        tab.appendChild(line);
        const lit = [];
        for (let i = 0; i < 40; i++) {
          const x = dotC(i);
          if (x < GX0 + 4 || x > GX1 - 4) continue;
          const d = h('div', { style: { position: 'absolute', left: `${x - 3}px`, top: `${y - 3}px`, width: '6px', height: '6px', borderRadius: '50%', background: C.teal, opacity: 0 } });
          tab.appendChild(d);
          lit.push({ d, x });
        }
        const head = h('div', { style: { position: 'absolute', left: '-6px', top: `${y - 6}px`, width: '12px', height: '12px', borderRadius: '50%', background: C.teal300, boxShadow: '0 0 14px 4px rgba(20,184,166,.55)', opacity: 0 } });
        tab.appendChild(head);
        const lab = h('div', {
          style: {
            position: 'absolute', left: `${GX0 - 96}px`, width: '82px', top: `${y - 13}px`, textAlign: 'right',
            font: `${full ? 600 : 500} ${full ? 26 : 24}px/1 ${B.FONT}`, color: full ? C.muted : C.muted2, letterSpacing: '-0.01em',
            fontFeatureSettings: '"tnum" 1', opacity: 0, whiteSpace: 'nowrap',
          },
          text: label,
        });
        tab.appendChild(lab);
        return { line, lit, head, lab, y };
      });
      // Separadores das colunas.
      const seps = [1, 2].map((c) => {
        const d = h('div', { style: { position: 'absolute', left: `${colX(c) - 1}px`, top: `${lineY(0)}px`, width: '2px', height: `${lineY(8) - lineY(0)}px`, background: 'rgba(11,31,63,.06)', transformOrigin: '50% 0', transform: 'scaleY(0)' } });
        tab.appendChild(d);
        return d;
      });

      // Topo: Dia | Semana | Mês e a unidade.
      const segWrap = h('div', { style: { position: 'absolute', left: '112px', top: '548px', height: '60px', padding: '5px', borderRadius: '30px', background: C.warm100, display: 'flex', boxSizing: 'border-box', boxShadow: 'inset 0 0 0 1px rgba(11,31,63,.05)', transformOrigin: '0% 50%', opacity: 0 } });
      const segHl = h('div', { style: { position: 'absolute', top: '5px', height: '50px', left: '5px', width: '100px', borderRadius: '25px', background: C.teal700, boxShadow: '0 8px 16px -8px rgba(15,118,110,.7)' } });
      segWrap.appendChild(segHl);
      const segs = ['Dia', 'Semana', 'Mês'].map((tx) => {
        const el = h('div', { style: { position: 'relative', height: '50px', padding: '0 28px', display: 'flex', alignItems: 'center', font: `600 28px/1 ${B.FONT}`, letterSpacing: '-0.015em', color: C.muted, whiteSpace: 'nowrap' } }, tx);
        segWrap.appendChild(el);
        return el;
      });
      tab.appendChild(segWrap);
      const unit = h(
        'div',
        {
          style: {
            position: 'absolute', right: '120px', top: '548px', height: '60px', padding: '0 20px 0 18px', borderRadius: '30px', background: '#fff',
            boxShadow: 'inset 0 0 0 2px #E8E6E0, 0 4px 10px -6px rgba(11,31,63,.15)', display: 'flex', alignItems: 'center', gap: '10px',
            font: `600 27px/1 ${B.FONT}`, color: C.ink, whiteSpace: 'nowrap', letterSpacing: '-0.015em', transformOrigin: '100% 50%', opacity: 0,
          },
        },
        B.icon('map-pin', { size: 28, color: C.teal700, sw: 2.3 }),
        h('span', { text: 'Unidade Centro' }),
        B.icon('chevron-down', { size: 26, color: C.muted, sw: 2.4 }),
      );
      tab.appendChild(unit);

      // Profissionais lado a lado.
      const pros = PROS.map((p, c) => {
        const av = B.avatar(p.ini, { size: 60, bg: p.bg, fg: p.fg });
        av.style.willChange = 'transform';
        const nm = B.text(p.name, { size: 30, weight: 700, color: C.ink, ls: '-0.025em', style: { whiteSpace: 'nowrap', willChange: 'transform' } });
        const nmWrap = h('div', { style: { overflow: 'hidden', padding: '4px 4px 6px 0', margin: '-4px 0 -6px 0' } }, nm);
        const row = h('div', { style: { position: 'absolute', left: `${colX(c) + 8}px`, top: '644px', display: 'flex', alignItems: 'center', gap: '14px' } }, av, nmWrap);
        tab.appendChild(row);
        return { av, nm };
      });

      // Horários já marcados.
      const blocks = APPTS.map((a) => {
        const el = apptBlock(a);
        tab.appendChild(el);
        return el;
      });

      // Etiqueta do conflito (no mundo, acima das 14:00).
      const tip = h(
        'div',
        {
          style: {
            position: 'absolute', left: '190px', top: `${Math.round(P_HOVER.y + (HH * 1.04) / 2 + 18)}px`, height: '98px', padding: '0 26px 0 20px',
            display: 'flex', alignItems: 'center', gap: '14px', borderRadius: '22px', background: '#FEF3C7',
            boxShadow: `inset 0 0 0 2px ${AMBER}, 0 18px 34px -16px rgba(146,64,14,.45)`, font: `700 30px/1 ${B.FONT}`, color: '#7C2D12',
            letterSpacing: '-0.015em', whiteSpace: 'nowrap', transformOrigin: '60px 0%', visibility: 'hidden', willChange: 'transform',
          },
        },
        B.icon('triangle-alert', { size: 36, color: '#D97706', sw: 2.3 }),
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          h('span', { text: 'Conflito de horário' }),
          h('span', { style: { font: `500 24px/1 ${B.FONT}`, color: '#92400E', letterSpacing: '-0.01em', fontFeatureSettings: '"tnum" 1' }, text: '14:00 · Carlos Lima' }),
        ),
      );
      // Etiqueta embaixo do bloco (14:30 livre), com a seta para cima: não cobre ninguém.
      tip.appendChild(h('div', { style: { position: 'absolute', left: '52px', top: '-9px', width: '18px', height: '18px', background: '#FEF3C7', transform: 'rotate(45deg)', boxShadow: `inset 2px 2px 0 0 ${AMBER}` } }));
      tab.appendChild(tip);

      // ── Títulos (fora da câmera, faixa y 380–480) ──
      const mkTitle = (text) => {
        const hl = B.headline(text, { size: 68, width: 960, color: C.navy, lh: 1.0 });
        abs(hl.el, 60, 386);
        hl.el.style.visibility = 'hidden';
        root.appendChild(hl.el);
        return hl;
      };
      const t1 = mkTitle('Profissionais lado a lado');
      const t2 = mkTitle('Conflito? Avisado.');
      t2.parts[1].style.color = C.teal700;

      // ── Bloco da Mariana (em coordenadas de tela) ──
      const shell = h('div', { style: { position: 'absolute', left: '0', top: '0', display: 'none', boxSizing: 'border-box' } });
      const ghost = heroBody();
      const ghostWrap = h('div', { style: { position: 'absolute', left: '0', top: '0', width: `${HW}px`, height: `${HH}px`, transformOrigin: '0 0' } }, ghost.clip);
      const ghostSub = h('div', { style: { position: 'absolute', left: '26px', top: '0' } }, ghost.sub);
      ghostWrap.appendChild(ghostSub);
      shell.appendChild(ghostWrap);
      const shellRing = h('div', { style: { position: 'absolute', inset: '0', borderRadius: 'inherit' } });
      shell.appendChild(shellRing);
      root.appendChild(shell);

      const hb = heroBody();
      const heroName = B.text('Mariana Costa', { size: 28, weight: 700, color: C.ink, ls: '-0.025em', style: { whiteSpace: 'nowrap' } });
      const heroContent = h('div', { style: { position: 'absolute', inset: '0', padding: '0 10px 0 26px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px', boxSizing: 'border-box' } }, heroName, hb.sub);
      const heroRing = h('div', { style: { position: 'absolute', inset: '0', borderRadius: '16px' } });
      const aura = h('div', { style: { position: 'absolute', inset: '-8px', borderRadius: '24px', border: `3px solid ${C.teal}`, boxSizing: 'border-box', opacity: 0 } });
      const hero = h(
        'div',
        { style: { position: 'absolute', left: '0', top: '0', width: `${HW}px`, height: `${HH}px`, borderRadius: '16px', background: LABELS.avaliacao.bg, transformOrigin: '50% 50%', visibility: 'hidden', willChange: 'transform' } },
        hb.clip,
        heroContent,
        heroRing,
        aura,
      );
      root.appendChild(hero);

      // ── Cartão da passagem ──
      const card = B.handoff.patientCard({ status: 'scheduled' });
      card.el.style.visibility = 'hidden';
      root.appendChild(card.el);
      const cardKids = {
        avatar: card.el.children[0],
        name: card.el.children[1].children[0],
        row: card.el.children[1].children[1],
        chip: card.chips.scheduled,
      };

      // ── Faísca de estrela no encaixe ──
      const sparkBig = h('div', { style: { position: 'absolute', left: '0', top: '0', visibility: 'hidden' } }, B.star({ size: 54, color: C.teal, glow: 10 }));
      root.appendChild(sparkBig);
      const sparks = [0, 1, 2, 3, 4, 5].map((i) => {
        const size = 18 + R.hash(i * 4.7 + 2) * 14;
        const w = h('div', { style: { position: 'absolute', left: '0', top: '0', visibility: 'hidden' } }, B.star({ size, color: i % 2 ? C.teal : C.teal300 }));
        w._size = size;
        root.appendChild(w);
        return w;
      });

      const cursor = cursorEl();
      root.appendChild(cursor.el);

      Object.assign(S, {
        camD, camP, dots, tab, fill, frames, lens, rows, seps, segWrap, segHl, segs, unit, pros, blocks, tip, t1, t2,
        shell, ghostWrap, ghostSub, shellRing, hero, heroName, heroContent, heroRing, aura, card, cardKids, sparkBig, sparks, cursor,
        cardStyle: { background: card.el.style.background, boxShadow: card.el.style.boxShadow },
      });
    },

    update(lt, t, S) {
      if (!S.laid) layout(S);
      const c = cam(lt);
      R.tf(S.camD, { y: c.yD, s: c.sD });
      R.tf(S.camP, { s: c.sP });

      updateGrid(lt, S);
      updateHeader(lt, S);
      updateBlocks(lt, S);
      updateTip(lt, S);
      updateTitles(lt, S);
      const hs = updateHero(lt, S);
      updateCursor(lt, S, hs);
      updateSpark(lt, S);
      updateMorph(lt, S);
      updateExit(lt, S);
    },
  });

  // ── Medidas (fontes já carregadas) ──────────────────────────────────────────
  function layout(S) {
    S.laid = true;
    const st = R.stage.getBoundingClientRect();
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left - st.left, y: b.top - st.top, w: b.width, h: b.height };
    };
    S.segR = S.segs.map((el) => ({ x: el.offsetLeft, w: el.offsetWidth }));
    const k = S.cardKids;
    S.cardR = { avatar: rect(k.avatar), name: rect(k.name), row: rect(k.row), chip: rect(k.chip) };
    S.heroNameOff = { x: S.heroName.offsetLeft, y: S.heroName.offsetTop };
    S.heroSubOff = { x: S.heroName.offsetLeft, y: S.heroName.nextSibling.offsetTop };
    S.ghostSub.style.top = `${S.heroSubOff.y}px`;
    // "Conflito?" começa centrado e abre espaço para "Avisado.".
    const w0 = S.t2.parts[0].parentNode;
    const w1 = S.t2.parts[1].parentNode;
    S.t2Shift = (w1.offsetLeft + w1.offsetWidth - (w0.offsetLeft + w0.offsetWidth)) / 2;
  }

  // ── 0–0,6 s: os pontos viram linhas e o tablet se desenha ───────────────────
  function updateGrid(lt, S) {
    const LD = 0.3;
    S.rows.forEach((r, k) => {
      const t0 = 0.02 + k * 0.038;
      const p = R.p(lt, t0, LD, E.inOutCubic);
      r.line.style.transform = `scaleX(${p.toFixed(4)})`;
      const X = GX0 + (GX1 - GX0) * p;
      const headO = lt < t0 ? 0 : p < 1 ? R.clamp(p * 6) : 1 - R.p(lt, t0 + LD, 0.12);
      R.tf(r.head, { x: X, o: headO, s: R.lerp(0.6, 1, R.clamp(p * 4)) });
      r.lit.forEach(({ d, x }) => {
        const dd = X - x;
        if (lt < t0 || dd < -2) {
          d.style.opacity = '0';
          return;
        }
        const bell = Math.sin(Math.PI * R.clamp(dd / 90)) * (1 - R.p(lt, t0 + LD - 0.02, 0.14));
        R.tf(d, { s: 0.7 + 1.1 * bell, o: bell * 0.95 });
      });
      R.tf(r.lab, { x: (1 - R.p(lt, t0 + 0.04, 0.4)) * -14, o: R.p(lt, t0 + 0.04, 0.3, E.outCubic) });
    });
    S.seps.forEach((d, i) => {
      d.style.transform = `scaleY(${R.p(lt, 0.36 + i * 0.06, 0.45, E.snappy).toFixed(4)})`;
    });
    // Contorno do tablet, a partir do topo, nos dois sentidos.
    const fk = R.p(lt, 0.04, 0.5, E.inOutCubic);
    S.frames.forEach((p) => {
      R.draw(p, fk);
      p.style.opacity = fk > 0.002 ? '1' : '0';
    });
    S.fill.style.opacity = R.p(lt, 0.2, 0.42, E.smooth).toFixed(3);
    S.lens.style.opacity = (R.p(lt, 0.4, 0.3) * 0.3).toFixed(3);
  }

  // ── Topo do tablet e profissionais ─────────────────────────────────────────
  function updateHeader(lt, S) {
    const sk = R.sp(lt, 0.22, R.springs.bouncy);
    R.tf(S.segWrap, { s: R.lerp(0.85, 1, sk), o: R.clamp(sk * 2.5) });
    const uk = R.sp(lt, 0.3, R.springs.bouncy);
    R.tf(S.unit, { s: R.lerp(0.85, 1, uk), o: R.clamp(uk * 2.5) });
    // Destaque desliza de Semana para Dia (com leve esticada no meio).
    if (S.segR) {
      const a = S.segR[1];
      const b = S.segR[0];
      const k = R.p(lt, 0.4, 0.42, E.snappy);
      const stretch = Math.sin(Math.PI * R.p(lt, 0.4, 0.28, E.outQuad)) * 26;
      const x = R.lerp(a.x, b.x, k);
      const w = R.lerp(a.w, b.w, k) + stretch;
      S.segHl.style.left = `${x.toFixed(2)}px`;
      S.segHl.style.width = `${w.toFixed(2)}px`;
      S.segs.forEach((el, i) => {
        const r = S.segR[i];
        const ov = Math.max(0, Math.min(r.x + r.w, x + w) - Math.max(r.x, x)) / r.w;
        el.style.color = mix(C.muted, '#FFFFFF', R.clamp(ov * 1.25 - 0.15));
      });
    }
    S.pros.forEach((p, i) => {
      const t0 = 0.34 + i * 0.07;
      const ak = R.sp(lt, t0, R.springs.bouncy);
      R.tf(p.av, { s: R.clamp(ak, 0, 1.3), o: R.clamp(ak * 3) });
      const nk = R.p(lt, t0 + 0.05, 0.5, E.snappy);
      R.tf(p.nm, { x: (1 - nk) * -40, o: R.clamp(nk * 2) });
    });
  }

  // ── 0,5–1,1 s: horários caem e assentam ─────────────────────────────────────
  function updateBlocks(lt, S) {
    S.blocks.forEach((el, i) => {
      const t0 = 0.5 + i * 0.07;
      const k = R.sp(lt, t0, { k: 240, c: 17 });
      R.tf(el, { y: (1 - k) * -96, s: R.lerp(0.94, 1, R.clamp(k)), o: R.clamp(R.p(lt, t0, 0.12) * 1.2) });
    });
    // Carlos (14:00 da Dra. Paula) acende em âmbar enquanto há conflito.
    const ca = R.p(lt, T.conflict, 0.12) * (1 - R.p(lt, T.solved, 0.25));
    const pulse = 0.75 + 0.25 * Math.sin((lt - T.conflict) * Math.PI * 4);
    S.blocks[0]._ring.style.boxShadow = ca > 0.001 ? `inset 0 0 0 3px rgba(${AMBER_RGB},${(ca * pulse).toFixed(3)})` : 'none';
  }

  // ── Etiqueta "Conflito de horário" ─────────────────────────────────────────
  function updateTip(lt, S) {
    const on = lt >= T.tipIn && lt < T.tipOut + 0.2;
    S.tip.style.visibility = on ? 'visible' : 'hidden';
    if (!on) return;
    const k = R.sp(lt, T.tipIn, R.springs.bouncy);
    const out = R.p(lt, T.tipOut, 0.18, E.inCubic);
    R.tf(S.tip, { s: R.lerp(0.55, 1, k) * R.lerp(1, 0.8, out), y: (1 - R.clamp(k)) * -14 - out * 8, o: R.clamp(k * 3) * (1 - out) });
  }

  // ── Títulos cinéticos ──────────────────────────────────────────────────────
  function updateTitles(lt, S) {
    const run = (hl, start, outStart, opts = {}) => {
      const n = hl.parts.length;
      const outEnd = outStart + (n - 1) * 0.035 + 0.32;
      const on = lt >= start && lt < outEnd;
      hl.el.style.visibility = on ? 'visible' : 'hidden';
      if (!on) return false;
      R.reveal(hl.parts, lt, { start, stagger: 0.06, dur: 0.6, y: 110, out: { start: outStart, stagger: 0.035, dur: 0.32, y: -110 }, ...opts });
      return true;
    };
    run(S.t1, T.title1, T.title1Out);
    const on = lt >= T.title2 && lt < T.exit + 0.4;
    S.t2.el.style.visibility = on ? 'visible' : 'hidden';
    if (!on) return;
    const [a, b] = S.t2.parts;
    R.reveal([a], lt, { start: T.title2, dur: 0.55, y: 110, out: { start: T.exit - 0.04, dur: 0.32, y: -110 } });
    R.reveal([b], lt, { start: T.avisado, dur: 0.55, y: 110, out: { start: T.exit - 0.005, dur: 0.32, y: -110 } });
    const slide = R.p(lt, T.avisado - 0.06, 0.5, E.snappy);
    a.parentNode.style.transform = `translateX(${((1 - slide) * (S.t2Shift || 0)).toFixed(2)}px)`;
  }

  // ── Bloco da Mariana ──────────────────────────────────────────────────────
  function updateHero(lt, S) {
    const hs = heroScreen(lt);
    const show = lt >= T.spawn && lt < T.m0;
    S.hero.style.visibility = show ? 'visible' : 'hidden';
    if (!show) return hs;
    const pop = R.sp(lt, T.spawn, R.springs.bouncy);
    const sc = hs.s * R.lerp(0.35, 1, pop);
    R.tf(S.hero, { x: hs.cx - HW / 2, y: hs.cy - HH / 2, s: sc, r: hs.r, o: R.clamp(pop * 3) });
    // Sombra (levantado ↔ encaixado) e contornos (teal selecionado, âmbar no conflito).
    S.hero.style.boxShadow = shadowStr(lerpLayers(REST, LIFT, R.clamp(hs.lifted, 0, 1.3)));
    const amber = R.p(lt, T.conflict, 0.08) * (1 - R.p(lt, T.solved, 0.18));
    const glowK = amber * (0.7 + 0.3 * Math.sin((lt - T.conflict) * Math.PI * 4));
    const teal = 1 - amber;
    S.heroRing.style.boxShadow = [
      `0 0 0 ${(10 * glowK).toFixed(2)}px rgba(${AMBER_RGB},${(0.22 * glowK).toFixed(3)})`,
      `inset 0 0 0 4px rgba(${AMBER_RGB},${amber.toFixed(3)})`,
      `inset 0 0 0 3px rgba(${TEAL_RGB},${teal.toFixed(3)})`,
    ].join(', ');
    // Aura no nascimento.
    const ak = R.p(lt, T.spawn + 0.04, 0.5, E.outCubic);
    R.tf(S.aura, { s: R.lerp(0.96, 1.22, ak), o: lt < T.spawn + 0.04 ? 0 : (1 - ak) * 0.9 });
    return hs;
  }

  // ── Cursor desenhado ───────────────────────────────────────────────────────
  function updateCursor(lt, S, hs) {
    const el = S.cursor.el;
    const tip = S.cursor.tip;
    const on = lt >= T.cursorIn && lt < T.release + 0.24;
    el.style.visibility = on ? 'visible' : 'hidden';
    if (!on) return;
    // Ponto de pegada: um pouco à direita do centro do bloco.
    const grab = { x: hs.cx + 58 * hs.s, y: hs.cy + 6 * hs.s };
    const start = { x: 1010, y: 1640 };
    const kin = R.p(lt, T.cursorIn, T.grab - T.cursorIn, E.snappy);
    let x = R.lerp(start.x, grab.x, kin);
    let y = R.lerp(start.y, grab.y, kin) + Math.sin(kin * Math.PI) * 30;
    // Solta e vai embora.
    const away = R.p(lt, T.release + 0.02, 0.2, E.inCubic);
    x += away * 110;
    y += away * 150;
    const press = R.kf(lt, [[T.grab - 0.02, 1], [T.grab + 0.06, 0.84, E.outQuad], [T.release, 0.84], [T.release + 0.1, 1, E.outBack]]);
    R.tf(el, { x: x - tip.x, y: y - tip.y, s: press, r: -4 + kin * 4, o: R.clamp(kin * 3) * (1 - away) });
  }

  // ── Faísca no encaixe ──────────────────────────────────────────────────────
  function updateSpark(lt, S) {
    const on = lt >= T.spark && lt < T.spark + 0.5;
    S.sparkBig.style.visibility = on ? 'visible' : 'hidden';
    S.sparks.forEach((w) => (w.style.visibility = on ? 'visible' : 'hidden'));
    if (!on) return;
    const c = cam(lt);
    const corner = toScreen(c, P_FREE.x + HW / 2 + 8, P_FREE.y - HH / 2 - 8);
    const k = R.p(lt, T.spark, 0.42, E.outCubic);
    R.tf(S.sparkBig, { x: corner.x - 27, y: corner.y - 28, s: Math.sin(Math.PI * k) * 1.1, r: k * 120, o: 1 - R.p(lt, T.spark + 0.28, 0.14) });
    S.sparks.forEach((w, i) => {
      const a = (i / S.sparks.length) * Math.PI * 2 + 0.4;
      const kk = R.p(lt, T.spark + 0.02, 0.46, E.outCubic);
      const d = 26 + kk * (70 + R.hash(i * 3.1) * 30);
      R.tf(w, { x: corner.x + Math.cos(a) * d - w._size / 2, y: corner.y + Math.sin(a) * d - w._size / 2, s: (1 - kk) * 1.1, r: kk * 180, o: 1 - kk });
    });
  }

  // ── Morph até o cartão da passagem ─────────────────────────────────────────
  function updateMorph(lt, S) {
    const card = S.card.el;
    const K = S.cardKids;
    const CR = S.cardR;
    const resetKids = () => {
      for (const el of [K.avatar, K.name, K.row, K.chip]) {
        el.style.transform = '';
        el.style.transformOrigin = '';
        el.style.opacity = '';
      }
    };
    // Último trecho: o cartão intacto, sem transform, como o WhatsApp começa.
    if (lt >= T.m1) {
      card.style.visibility = 'visible';
      card.style.transform = 'none';
      card.style.opacity = '';
      card.style.background = S.cardStyle.background;
      card.style.boxShadow = S.cardStyle.boxShadow;
      resetKids();
      S.shell.style.display = 'none';
      return;
    }
    if (lt < T.chip) {
      card.style.visibility = 'hidden';
      S.shell.style.display = 'none';
      return;
    }
    // O cartão aparece "vazio": só os filhos, cada um no seu lugar animado.
    card.style.visibility = 'visible';
    card.style.transform = 'none';
    card.style.background = 'transparent';
    card.style.boxShadow = 'none';
    const place = (el, fin, x, y, sc, o) => {
      el.style.transformOrigin = '0 0';
      el.style.transform = `translate3d(${(x - fin.x).toFixed(2)}px, ${(y - fin.y).toFixed(2)}px, 0) scale(${sc.toFixed(4)})`;
      el.style.opacity = R.clamp(o).toFixed(3);
    };
    // Chip "Agendado" ao lado do bloco (antes do morph).
    // Preso à borda direita do bloco (acompanha a mola e a soltura).
    const chipAt = (tt) => {
      const hs = heroScreen(tt);
      const sc = hs.c.s;
      return { x: hs.cx + (HW / 2) * hs.s + 14 * sc, y: hs.cy - (CR.chip.h * sc) / 2, s: sc };
    };
    if (lt < T.m0) {
      const pop = R.sp(lt, T.chip, R.springs.bouncy);
      const p = chipAt(lt);
      const sc = p.s * R.lerp(0.5, 1, pop);
      // Cresce a partir da borda esquerda, centrado na vertical.
      place(K.chip, CR.chip, p.x, p.y + (CR.chip.h * (p.s - sc)) / 2, sc, pop * 3);
      K.avatar.style.opacity = '0';
      K.name.style.opacity = '0';
      K.row.style.opacity = '0';
      S.shell.style.display = 'none';
      return;
    }
    // ── Morph: a casca cresce do bloco até o cartão ──
    const k = MORPH(R.inv(T.m0, T.m1, lt));
    const st = heroScreen(T.m0);
    const w0 = HW * st.s;
    const h0 = HH * st.s;
    const cx = R.lerp(st.cx, PC.x + PC.w / 2, k);
    const cy = R.lerp(st.cy, PC.y + PC.h / 2, k) - Math.sin(Math.PI * k) * 24;
    const ks = 1 - (1 - k) * (1 - k); // o tamanho chega antes da posição
    const w = R.lerp(w0, PC.w, ks);
    const hh = R.lerp(h0, PC.h, ks);
    const x0 = cx - w / 2;
    const y0 = cy - hh / 2;
    const sh = S.shell;
    sh.style.display = 'block';
    sh.style.left = `${x0.toFixed(2)}px`;
    sh.style.top = `${y0.toFixed(2)}px`;
    sh.style.width = `${w.toFixed(2)}px`;
    sh.style.height = `${hh.toFixed(2)}px`;
    sh.style.borderRadius = `${R.lerp(16 * st.s, 44, k).toFixed(2)}px`;
    sh.style.background = mix(LABELS.avaliacao.bg, '#FFFFFF', R.p(k, 0, 0.6, E.outQuad));
    sh.style.boxShadow = shadowStr(lerpLayers(lerpLayers(REST, LIFT, R.clamp(st.lifted, 0, 1.3)), LG, k));
    S.shellRing.style.boxShadow = `inset 0 0 0 3px rgba(${TEAL_RGB},${(1 - R.p(k, 0, 0.5)).toFixed(3)})`;
    // Barra lateral e "Avaliação" do bloco crescem e somem logo.
    const gs = R.lerp(st.s, hh / HH, 0.5);
    S.ghostWrap.style.transform = `scale(${gs.toFixed(4)})`;
    S.ghostWrap.style.opacity = (1 - R.p(k, 0, 0.16, E.outQuad)).toFixed(3);
    // Nome: elemento compartilhado — do nome do bloco para o nome do cartão.
    const fx = (w - 0) / PC.w;
    const fy = hh / PC.h;
    const nameOff0 = { x: S.heroNameOff.x * st.s, y: S.heroNameOff.y * st.s };
    const nameOff1 = { x: CR.name.x - PC.x, y: CR.name.y - PC.y };
    const kn = R.clamp(k * 1.06);
    place(K.name, CR.name, x0 + R.lerp(nameOff0.x, nameOff1.x, kn), y0 + R.lerp(nameOff0.y, nameOff1.y, kn), R.lerp((28 * st.s) / 44, 1, kn), 1);
    // Avatar brota; linha do horário sobe.
    const ak = R.p(k, 0.38, 0.62, (v) => E.outBack(v, 2.2));
    const ac = { x: CR.avatar.x - PC.x + CR.avatar.w / 2, y: CR.avatar.y - PC.y + CR.avatar.h / 2 };
    const asc = Math.min(fx, fy) * R.lerp(0.3, 1, ak);
    place(K.avatar, CR.avatar, x0 + ac.x * fx - (CR.avatar.w * asc) / 2, y0 + ac.y * fy - (CR.avatar.h * asc) / 2, asc, R.p(k, 0.36, 0.3));
    const rk = R.p(k, 0.5, 0.5, E.outCubic);
    const rowOff = { x: CR.row.x - PC.x, y: CR.row.y - PC.y };
    place(K.row, CR.row, x0 + rowOff.x * fx, y0 + rowOff.y * fy + (1 - rk) * 16, R.lerp(0.85, 1, rk) * Math.min(1, fy * 1.0 + 0.0), rk);
    // Chip: do lado do bloco para o canto do cartão.
    const c0 = chipAt(T.m0);
    place(K.chip, CR.chip, R.lerp(c0.x, CR.chip.x, k), R.lerp(c0.y, CR.chip.y, k) - Math.sin(Math.PI * k) * 18, R.lerp(c0.s, 1, k), 1);
  }

  // ── Saída: tablet, grade e título vão para trás ─────────────────────────────
  function updateExit(lt, S) {
    const k = R.p(lt, T.exit, 0.42, E.inCubic);
    if (k > 0) R.tf(S.tab, { s: R.lerp(1, 0.9, k), y: k * 30, o: 1 - R.p(lt, T.exit + 0.04, 0.34, E.inQuad), blur: k * 12 });
    else R.tf(S.tab, { o: 1, blur: 0 });
    S.dots.style.opacity = (1 - R.p(lt, T.exit, 0.34, E.inOutQuad)).toFixed(3);
  }
})();
