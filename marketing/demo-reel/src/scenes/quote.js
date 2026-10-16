/*
 * Cena "quote" (global 22,5–27,0): as duas pílulas dos dentes que vieram da
 * ficha mergulham num documento que se monta em volta delas (Plano de
 * tratamento com a marca da Clínica Aurora) e viram linhas; a terceira linha
 * se digita sozinha. Em "Link ou PDF" dois cartões viram no pé do papel e o
 * rastreador acende Enviado → Visualizado (um olho pisca) → Aceito, quando o
 * carimbo teal bate no papel. No fim o documento encolhe e vira a pílula
 * "Orçamento aceito".
 *
 * Passagens: começa com B.handoff.toothChips() e termina com
 * B.handoff.acceptedPill(), as duas sem transform, sobre o branco quente.
 * Nenhum valor em dinheiro aparece: no lugar do preço, um check teal.
 */
(() => {
  const { h, s } = R;
  const E = R.ease;
  const C = B.C;
  const TL = window.TIMELINE;
  const T0 = TL.quote.start;
  const DUR = TL.quote.end - T0; // 4,5
  const EV = TL.events;
  const L = (g) => g - T0; // global → local
  const VO = Object.fromEntries(TL.vo.map((v) => [v.id, { start: L(v.start), end: L(v.end) }]));

  // ── Tempos locais (todos derivados do TIMELINE) ─────────────────────────────
  const T = {
    build: L(EV.quoteBuilds), // 0,10 o papel começa a se montar
    sent: L(EV.quoteSent), // 2,00 Link / PDF, "Enviado"
    viewed: L(EV.viewed), // 2,60 "Visualizado"
    accepted: L(EV.accepted), // 3,50 carimbo
  };
  T.paper = T.build - 0.07; // 0,03 a folha cresce em volta das pílulas
  T.fly = [T.build + 0.06, T.build + 0.14]; // 0,16 / 0,24 as pílulas voam para as linhas
  T.flyDur = 0.52;
  T.title1 = VO.p10.start; // 0,25 "Com a sua marca"
  T.band = T.build + 0.13; // 0,23 faixa da clínica
  T.head = T.build + 0.32; // 0,42 "Plano de tratamento"
  T.check = [T.fly[0] + T.flyDur + 0.12, T.fly[1] + T.flyDur + 0.12]; // 0,80 / 0,88
  T.row3 = T.build + 0.8; // 0,90 a terceira linha nasce
  T.type = T.row3 + 0.12; // 1,02 "Clareamento" se digita
  T.check3 = T.type + 11 / 24 + 0.1; // ~1,58
  T.cond = T.build + 1.04; // 1,14 condições
  T.sign = T.build + 1.2; // 1,30 linha do aceite
  T.title1Out = T.sent - 0.22; // 1,78
  T.title2 = T.sent + 0.02; // 2,02 "Link ou PDF"
  T.flip = [T.sent, T.sent + 0.08]; // cartões viram
  T.track = T.sent - 0.1; // 1,90 rastreador aparece
  T.lit = [T.sent + 0.1, T.viewed, T.accepted + 0.05]; // acende cada etapa
  T.blink = [T.viewed + 0.42, T.viewed + 0.78]; // o olho pisca
  T.fall = T.accepted - 0.22; // o carimbo desce
  T.exit = DUR - 0.5; // 4,00 o documento encolhe
  T.title2Out = T.exit - 0.2; // 3,80 o título sai antes
  T.clear = T.exit - 0.14; // 3,86 cartões e rastreador saem, sobra o papel
  T.settle = DUR - 0.06; // 4,44 tudo parado na geometria da passagem

  // ── Geometria ───────────────────────────────────────────────────────────────
  const DOC = { x: 150, y: 450, w: 780, h: 900, r: 24 };
  const PAD = 36;
  const ROW_Y = 300; // topo da primeira linha (local ao papel)
  const ROW_H = 104;
  const rowTop = (i) => ROW_Y + i * ROW_H;
  const CHIPS = B.handoff.TOOTH_CHIPS; // [{x:260,y:852,w:560,h:104}, {x:260,y:980,...}]
  const PILL = B.handoff.ACCEPTED_PILL; // {x:230, y:894, w:620, h:132}
  // A pílula pousa com o círculo do ícone exatamente sobre o da linha.
  const LAND = [0, 1].map((i) => ({ x: DOC.x + PAD - 18, y: DOC.y + rowTop(i) }));
  const START_BOX = { x: CHIPS[0].x, y: CHIPS[0].y, w: CHIPS[0].w, h: CHIPS[1].y + CHIPS[1].h - CHIPS[0].y, r: 52 };
  const CARD = { w: 272, h: 104, y: DOC.y + DOC.h - 50, gap: 24 }; // Link / PDF no pé do papel
  const CARD_X = [540 - CARD.w - CARD.gap / 2, 540 + CARD.gap / 2];
  const TRACK_Y = 1452;
  const STAMP = { w: 520, h: 156, cx: 560, cy: 1170 };
  const CAM_O = { x: 540, y: 960 };

  // ── Ajudantes ──────────────────────────────────────────────────────────────
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, k) => {
    const A = rgb(a);
    const Bc = rgb(b);
    return `rgb(${A.map((v, i) => Math.round(R.lerp(v, Bc[i], R.clamp(k)))).join(',')})`;
  };
  /**
   * R.tf, mas grava "none" na identidade e usa translate 2D quando não há giro
   * em 3D: translate3d vira camada própria no Chrome, que reaproveita a
   * rasterização antiga do texto (o mesmo t sairia diferente conforme o
   * histórico e o texto escalado ficaria mole).
   */
  const TO2D = /translate3d\(([^,]+),\s*([^,]+),\s*[^)]+\)/;
  const tfx = (el, p) => {
    R.tf(el, p);
    const id = !p.x && !p.y && (p.s ?? 1) === 1 && p.sx == null && p.sy == null && !p.r && !p.rx && !p.ry;
    if (id) el.style.transform = 'none';
    else if (!p.rx && !p.ry) el.style.transform = el.style.transform.replace(TO2D, 'translate($1, $2)');
  };
  /** R.reveal com translate 2D (mesmo motivo). */
  const reveal = (parts, lt, opts) => {
    R.reveal(parts, lt, opts);
    parts.forEach((p) => (p.style.transform = p.style.transform.replace(TO2D, 'translate($1, $2)')));
  };
  const abs = (el, x, y, w, hh) => B.abs(el, x, y, w, hh);
  const line = (txt, size, weight, color, extra = {}) =>
    h('div', { style: { font: `${weight} ${size}px/1.15 ${B.FONT}`, color, letterSpacing: '-0.02em', whiteSpace: 'nowrap', ...extra } }, txt);
  /** Bump 0→1→0 centrado em c, meia largura w (para piscar). */
  const bump = (t, c, w) => Math.max(0, 1 - Math.abs(t - c) / w);
  const SH_LG = [30, 60, -20, 0.28, 10, 24, -10, 0.14, 0.04];
  const SH_MD = [10, 30, -8, 0.18, 2, 6, 0, 0.06, 0];
  const shadow = (v) =>
    `0 ${v[0].toFixed(1)}px ${v[1].toFixed(1)}px ${v[2].toFixed(1)}px rgba(11,31,63,${v[3].toFixed(3)}), 0 ${v[4].toFixed(1)}px ${v[5].toFixed(1)}px ${v[6].toFixed(1)}px rgba(11,31,63,${v[7].toFixed(3)}), 0 0 0 1px rgba(11,31,63,${v[8].toFixed(3)})`;
  const MORPH = E.bezier(0.55, 0, 0.1, 1);
  /** Caixa do documento → pílula "Orçamento aceito" (saída). */
  const morphBox = (lt) => {
    const m = R.p(lt, T.exit, 0.34, MORPH);
    return {
      m,
      x: R.lerp(DOC.x, PILL.x, m),
      y: R.lerp(DOC.y, PILL.y, m),
      w: R.lerp(DOC.w, PILL.w, m),
      h: R.lerp(DOC.h, PILL.h, m),
      r: R.lerp(DOC.r, PILL.h / 2, R.p(lt, T.exit, 0.28, E.inOutCubic)),
    };
  };

  /** Olho desenhado à mão (traço como os ícones lucide), com pálpebra. */
  const makeEye = (size, color) => {
    const svg = s('svg', {
      viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: color, 'stroke-width': 2.4,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: { display: 'block', flex: 'none', overflow: 'visible' },
    });
    const g = s('g', {});
    const lidTop = s('path', { d: 'M2 12C4.6 7.3 8 5 12 5s7.4 2.3 10 7' });
    const lidBot = s('path', { d: 'M2 12c2.6 4.7 6 7 10 7s7.4-2.3 10-7' });
    const iris = s('circle', { cx: 12, cy: 12, r: 3.3 });
    const pupil = s('circle', { cx: 12, cy: 12, r: 1.3, fill: color, stroke: 'none' });
    g.append(lidTop, lidBot, iris, pupil);
    svg.appendChild(g);
    return { svg, g, lidTop, lidBot, iris, pupil };
  };

  R.scene({
    id: 'quote',
    build(root, S) {
      // ════════════════ Fundo ════════════════
      root.appendChild(h('div', { style: { position: 'absolute', inset: '0', background: C.warm } }));
      const mesh = B.mesh({
        base: 'transparent',
        blobs: [
          { x: 150, y: 520, r: 620, color: 'rgba(167,227,193,.38)' },
          { x: 980, y: 900, r: 560, color: 'rgba(20,184,166,.13)' },
          { x: 300, y: 1620, r: 680, color: 'rgba(15,59,130,.07)' },
          { x: 900, y: 1500, r: 420, color: 'rgba(167,227,193,.26)' },
        ],
      });
      root.appendChild(mesh.el);

      // ════════════════ Câmera e camadas (parallax) ════════════════
      const cam = h('div', { style: { position: 'absolute', inset: '0', transformOrigin: `${CAM_O.x}px ${CAM_O.y}px` } });
      root.appendChild(cam);
      const layer = () => {
        const el = h('div', { style: { position: 'absolute', inset: '0' } });
        cam.appendChild(el);
        return el;
      };
      const backLayer2 = layer();
      const backLayer1 = layer();
      const paperLayer = layer();
      const trackLayer = layer();
      const cardLayer = layer();

      // Folhas de trás (o "PDF" empilhado).
      const backs = [
        { layer: backLayer2, bg: '#F6F5F1', x: -20, y: 26, r: -2.6 },
        { layer: backLayer1, bg: '#FCFBF8', x: 24, y: 30, r: 3.2 },
      ].map((b) => {
        const el = B.card({ w: DOC.w, h: DOC.h, r: DOC.r, bg: b.bg, shadow: 'md', style: { left: `${DOC.x}px`, top: `${DOC.y}px`, transformOrigin: '50% 50%' } });
        b.layer.appendChild(el);
        return { el, ...b };
      });

      // Pílula da passagem (fica escondida até o documento encolher).
      const pill = B.handoff.acceptedPill();
      const PO = {};
      ['left', 'top', 'width', 'height', 'borderRadius', 'background', 'boxShadow'].forEach((k) => (PO[k] = pill.el.style[k]));
      pill.el.style.visibility = 'hidden';
      paperLayer.appendChild(pill.el);
      const pillIcon = pill.el.children[0];
      const pillText = pill.el.children[1];

      // ════════════════ O papel ════════════════
      const paper = h('div', {
        style: {
          position: 'absolute', overflow: 'hidden', background: '#fff', borderRadius: `${DOC.r}px`,
          boxShadow: shadow(SH_LG), willChange: 'transform',
        },
      });
      paperLayer.appendChild(paper);
      const content = h('div', {
        style: { position: 'absolute', width: `${DOC.w}px`, height: `${DOC.h}px`, transformOrigin: `${PILL.x + PILL.w / 2 - DOC.x}px ${PILL.y + PILL.h / 2 - DOC.y}px` },
      });
      paper.appendChild(content);

      // Faixa com a marca da clínica.
      const band = abs(h('div', { style: { background: C.teal50, borderBottom: `2px solid ${C.teal100}`, boxSizing: 'border-box' } }), 0, 0, DOC.w, 140);
      content.appendChild(band);
      const monoRing = abs(h('div', { style: { borderRadius: '50%', border: `3px solid ${C.teal}`, boxSizing: 'border-box' } }), PAD, 30, 80, 80);
      content.appendChild(monoRing);
      const mono = abs(
        h('div', {
          style: {
            borderRadius: '50%', background: C.teal700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            font: `800 32px ${B.DISPLAY}`, letterSpacing: '-0.03em', boxShadow: '0 8px 18px -8px rgba(15,118,110,.6)',
          },
        }, 'CA'),
        PAD, 30, 80, 80,
      );
      content.appendChild(mono);
      const clinicName = abs(line('', 38, 750, C.ink, { letterSpacing: '-0.03em', fontFamily: B.DISPLAY }), 136, 30);
      const clinicParts = R.split(clinicName, 'Clínica Aurora');
      content.appendChild(clinicName);
      const clinicSub = abs(line('Odontologia e Estética', 24, 500, C.teal800, { letterSpacing: '-0.01em' }), 136, 80);
      content.appendChild(clinicSub);
      const docTag = B.chip('Orçamento', { bg: '#fff', fg: C.teal800, icon: 'file-text', size: 24, pad: 16, style: { position: 'absolute', right: `${PAD}px`, top: '47px', boxShadow: `inset 0 0 0 2px ${C.teal100}` } });
      content.appendChild(docTag);

      // Título do documento e paciente.
      const docTitle = abs(line('', 46, 800, C.ink, { fontFamily: B.DISPLAY, letterSpacing: '-0.035em' }), PAD, 170);
      const docTitleParts = R.split(docTitle, 'Plano de tratamento');
      content.appendChild(docTitle);
      const patient = abs(
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap' } },
          B.icon('user', { size: 28, color: C.muted, sw: 2.2 }),
          line('Paciente:', 28, 500, C.muted),
          line('Mariana Costa', 28, 650, C.ink),
        ),
        PAD, 232,
      );
      content.appendChild(patient);

      // Linhas do plano: divisórias, ícone, texto e check (no lugar do preço).
      const dividers = [0, 1, 2, 3].map((i) => {
        const d = abs(h('div', { style: { background: C.warm200, borderRadius: '1px', transformOrigin: '0 50%' } }), PAD, rowTop(i) - 1, DOC.w - PAD * 2, 2);
        content.appendChild(d);
        return d;
      });
      const ROW_TEXT = ['Restauração · dente 16', 'Restauração · dente 26', 'Clareamento'];
      const rows = ROW_TEXT.map((label, i) => {
        const icon = abs(
          h('div', { style: { borderRadius: '50%', background: C.teal100, display: 'flex', alignItems: 'center', justifyContent: 'center', transformOrigin: '50% 50%' } },
            i < 2 ? B.tooth({ size: 40, color: C.teal700, sw: 2.2 }) : B.icon('sparkles', { size: 38, color: C.teal700, sw: 2.2 })),
          PAD, rowTop(i) + 16, 72, 72,
        );
        content.appendChild(icon);
        const textBox = abs(h('div', { style: { display: 'flex', alignItems: 'center' } }), PAD + 72 + 24, rowTop(i), 480, ROW_H);
        const txt = line('', 36, 650, C.ink, { letterSpacing: '-0.025em' });
        textBox.appendChild(txt);
        let parts = null;
        let caret = null;
        if (i < 2) parts = R.split(txt, label);
        else {
          caret = h('div', { style: { width: '3px', height: '40px', borderRadius: '2px', background: C.teal700, marginLeft: '4px', flex: 'none' } });
          textBox.appendChild(caret);
        }
        content.appendChild(textBox);
        const check = abs(
          h('div', { style: { borderRadius: '50%', background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', transformOrigin: '50% 50%', boxShadow: '0 8px 16px -8px rgba(20,184,166,.7)' } },
            B.icon('check', { size: 30, color: '#fff', sw: 3.4 })),
          DOC.w - PAD - 52, rowTop(i) + 26, 52, 52,
        );
        content.appendChild(check);
        return { icon, txt, parts, caret, check, checkPath: check.querySelector('path'), label };
      });

      // Condições (sem valor) e a linha do aceite.
      const condBox = abs(h('div', { style: { display: 'flex', gap: '14px' } }), PAD, rowTop(3) + 30);
      const conds = [
        B.chip('até 12x', { bg: C.warm100, fg: C.ink, icon: 'credit-card', size: 26, pad: 18, weight: 600 }),
        B.chip('Válido por 30 dias', { bg: C.warm100, fg: C.ink, icon: 'calendar', size: 26, pad: 18, weight: 600 }),
      ];
      conds.forEach((c) => condBox.appendChild(c));
      content.appendChild(condBox);
      const signLine = abs(h('div', { style: { background: C.warm300, borderRadius: '2px', transformOrigin: '50% 50%' } }), 200, 788, 380, 3);
      content.appendChild(signLine);
      const signLabel = abs(line('Aceite da paciente', 24, 500, C.muted2, { textAlign: 'center', width: '380px' }), 200, 800);
      content.appendChild(signLabel);

      // Leitura: uma faixa de luz teal desce pelo papel quando ela abre o link.
      const sweep = abs(h('div', { style: { pointerEvents: 'none' } }), 0, 0, DOC.w, 180);
      sweep.appendChild(abs(h('div', { style: { background: 'linear-gradient(180deg, rgba(20,184,166,0) 0%, rgba(20,184,166,.10) 70%, rgba(20,184,166,.16) 100%)' } }), 0, 0, DOC.w, 178));
      sweep.appendChild(abs(h('div', { style: { background: `linear-gradient(90deg, rgba(20,184,166,0), ${C.teal} 20%, ${C.teal} 80%, rgba(20,184,166,0))`, opacity: '.55' } }), 0, 177, DOC.w, 3));
      content.appendChild(sweep);

      // Pílulas da passagem (por cima do papel, mesma camada).
      const chips = B.handoff.toothChips();
      chips.forEach((c) => {
        c.orig = { background: c.el.style.background, boxShadow: c.el.style.boxShadow };
        c.text = c.el.children[1];
        paperLayer.appendChild(c.el);
      });

      // ════════════════ Carimbo ════════════════
      const stampWrap = abs(h('div', { style: { transformOrigin: '50% 50%' } }), STAMP.cx - STAMP.w / 2, STAMP.cy - STAMP.h / 2, STAMP.w, STAMP.h);
      // Falhas de tinta (pontos claros determinísticos).
      const specks = [];
      for (let i = 0; i < 46; i++) {
        const x = R.hash(i * 3.17 + 1) * STAMP.w;
        const y = R.hash(i * 7.31 + 2) * STAMP.h;
        const r = R.lerp(1.2, 3.6, R.hash(i * 1.93 + 3));
        specks.push(`radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, rgba(255,255,255,.9) ${r.toFixed(1)}px, transparent ${(r + 0.8).toFixed(1)}px)`);
      }
      for (let i = 0; i < 6; i++) {
        const x = R.hash(i * 5.7 + 9) * STAMP.w;
        const y = R.hash(i * 2.3 + 4) * STAMP.h;
        specks.push(`radial-gradient(ellipse 60px 26px at ${x.toFixed(1)}px ${y.toFixed(1)}px, rgba(255,255,255,.35), transparent)`);
      }
      const stamp = h(
        'div',
        {
          style: {
            position: 'absolute', inset: '0', borderRadius: '30px', border: `7px solid ${C.teal700}`, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '18px', color: C.teal700, mixBlendMode: 'multiply',
          },
        },
        h('div', { style: { position: 'absolute', inset: '7px', borderRadius: '20px', border: `2.5px solid ${C.teal700}`, opacity: '.7' } }),
        B.icon('circle-check', { size: 74, color: C.teal700, sw: 2.6 }),
        h('div', { style: { font: `800 88px/1 ${B.DISPLAY}`, letterSpacing: '0.035em', paddingTop: '6px' } }, 'ACEITO'),
        h('div', { style: { position: 'absolute', inset: '-7px', borderRadius: '30px', backgroundImage: specks.join(','), mixBlendMode: 'normal' } }),
      );
      stampWrap.appendChild(stamp);
      const stampShadow = abs(h('div', { style: { borderRadius: '40px', background: 'radial-gradient(closest-side, rgba(11,31,63,.28), transparent)', transformOrigin: '50% 50%' } }), STAMP.cx - STAMP.w / 2 - 20, STAMP.cy - STAMP.h / 2 + 30, STAMP.w + 40, STAMP.h);
      paperLayer.appendChild(stampShadow);
      paperLayer.appendChild(stampWrap);
      const shock = abs(h('div', { style: { borderRadius: '34px', border: `5px solid ${C.teal}`, boxSizing: 'border-box', transformOrigin: '50% 50%' } }), STAMP.cx - STAMP.w / 2, STAMP.cy - STAMP.h / 2, STAMP.w, STAMP.h);
      paperLayer.appendChild(shock);
      // Oito estrelinhas da marca.
      const stars = Array.from({ length: 8 }, (_, i) => {
        const sz = R.lerp(28, 48, R.hash(i * 4.1 + 2));
        const el = h('div', { style: { position: 'absolute', left: '0', top: '0', width: `${sz}px` } }, B.star({ size: sz, color: [C.teal, C.teal400, C.mint, C.teal700][i % 4] }));
        paperLayer.appendChild(el);
        const a = (i / 8) * Math.PI * 2 + 0.3 + (R.hash(i * 9.3) - 0.5) * 0.5;
        return { el, sz, a, d: R.lerp(200, 330, R.hash(i * 6.1 + 1)), spin: i % 2 ? 1 : -1 };
      });

      // ════════════════ Link / PDF (cartas) ════════════════
      const cards = [
        ['Link', 'link'],
        ['PDF', 'file-text'],
      ].map(([label, icon], i) => {
        const wrap = abs(h('div', {}), CARD_X[i], CARD.y, CARD.w, CARD.h);
        const back = B.card(
          { w: CARD.w, h: CARD.h, r: 32, bg: B.GRADIENT, shadow: 'lg', style: { left: '0', top: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden' } },
          B.star({ size: 46, color: '#fff' }),
        );
        const front = B.card(
          { w: CARD.w, h: CARD.h, r: 32, shadow: 'lg', style: { left: '0', top: '0', display: 'flex', alignItems: 'center', gap: '18px', padding: '0 26px 0 22px', backfaceVisibility: 'hidden' } },
          h('div', { style: { width: '62px', height: '62px', borderRadius: '20px', background: C.teal50, boxShadow: `inset 0 0 0 2px ${C.teal100}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' } },
            B.icon(icon, { size: 34, color: C.teal700, sw: 2.4 })),
          B.text(label, { size: 42, weight: 750, color: C.ink, ls: '-0.025em' }),
        );
        wrap.append(back, front);
        cardLayer.appendChild(wrap);
        return { wrap, back, front };
      });

      // ════════════════ Rastreador ════════════════
      const track = h('div', { style: { position: 'absolute', left: '0', top: `${TRACK_Y}px`, width: '1080px', height: '76px', display: 'flex', alignItems: 'center', justifyContent: 'center' } });
      trackLayer.appendChild(track);
      const STEPS = [
        { label: 'Enviado', icon: 'send', bg: C.teal700, fg: '#fff', ring: C.teal },
        { label: 'Visualizado', eye: true, bg: C.teal700, fg: '#fff', ring: C.teal },
        { label: 'Aceito', icon: 'check', bg: C.mint, fg: C.navy, ring: C.teal },
      ];
      const pillFont = `650 28px/1 ${B.FONT}`;
      const steps = [];
      const links = [];
      STEPS.forEach((st, i) => {
        if (i > 0) {
          const fill = h('div', { style: { position: 'absolute', left: '0', top: '0', height: '6px', width: '0px', borderRadius: '3px', background: C.teal } });
          const lk = h('div', { style: { position: 'relative', width: '40px', height: '6px', borderRadius: '3px', background: C.warm200, margin: '0 8px', flex: 'none', transformOrigin: '0 50%' } }, fill);
          track.appendChild(lk);
          links.push({ el: lk, fill });
        }
        const offIcon = st.eye ? makeEye(30, C.muted2).svg : B.icon(st.icon, { size: 30, color: C.muted2, sw: 2.4 });
        const base = h(
          'div',
          {
            style: {
              position: 'relative', height: '76px', borderRadius: '38px', background: '#fff', border: `2px solid ${C.warm200}`, boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', gap: '10px', padding: '0 26px 0 20px', font: pillFont, color: C.muted2, letterSpacing: '-0.015em',
              whiteSpace: 'nowrap', boxShadow: '0 12px 26px -16px rgba(11,31,63,.3)', flex: 'none', transformOrigin: '50% 50%',
            },
          },
          offIcon,
          h('span', { text: st.label }),
        );
        const eye = st.eye ? makeEye(30, st.fg) : null;
        const onIcon = st.eye ? eye.svg : B.icon(st.icon, { size: 30, color: st.fg, sw: 2.6 });
        const lit = h(
          'div',
          {
            style: {
              position: 'absolute', inset: '-2px', borderRadius: '38px', background: st.bg, color: st.fg, display: 'flex', alignItems: 'center',
              gap: '10px', padding: '0 28px 0 22px', font: pillFont, letterSpacing: '-0.015em', whiteSpace: 'nowrap', boxSizing: 'border-box', transformOrigin: '50% 50%',
            },
          },
          onIcon,
          h('span', { text: st.label }),
        );
        const ring = h('div', { style: { position: 'absolute', inset: '-2px', borderRadius: '38px', border: `3px solid ${st.ring}`, boxSizing: 'border-box', transformOrigin: '50% 50%' } });
        base.append(lit, ring);
        track.appendChild(base);
        steps.push({ base, lit, ring, onIcon, eye });
      });

      // ════════════════ Títulos ════════════════
      const titleLayer = h('div', { style: { position: 'absolute', inset: '0' } });
      root.appendChild(titleLayer);
      const titles = ['Com a sua marca', 'Link ou PDF'].map((t) => {
        const hl = B.headline(t, { size: 96, width: 980, color: C.navy });
        B.abs(hl.el, 50, 300);
        titleLayer.appendChild(hl.el);
        return hl;
      });
      titles[0].parts[3].style.color = C.teal700; // "marca"
      titles[1].parts[1].style.color = C.teal700; // "ou"

      // Sem will-change nas peças da cena: o Chrome manteria a escala de
      // rasterização antiga e o mesmo t poderia sair com texto diferente.
      // As peças de passagem ficam como o brand.js as cria.
      const keep = [pill.el, ...chips.map((c) => c.el)];
      root.querySelectorAll('*').forEach((el) => {
        if (el.style && el.style.willChange && !keep.some((k) => k.contains(el))) el.style.willChange = 'auto';
      });

      Object.assign(S, {
        mesh, cam, backs, backLayer1, backLayer2, paperLayer, trackLayer, cardLayer, pill, PO, pillIcon, pillText,
        paper, content, sweep, band, mono, monoRing, clinicParts, clinicSub, docTag, docTitleParts, patient, dividers, rows, conds, signLine, signLabel,
        chips, stampWrap, stamp, stampShadow, shock, stars, cards, track, steps, links, titleLayer, titles,
      });
    },

    update(lt, t, S) {
      const done = lt >= T.settle;
      if (S.iconDX == null) {
        // Centro do ícone em relação ao centro da pílula (o conteúdo é centralizado).
        // Medido uma vez, com a pílula ainda na geometria original.
        S.iconDX = S.pillText.offsetLeft - 18 - 26 - PILL.w / 2;
      }

      // ── Fundo e câmera ──────────────────────────────────────────────────────
      S.mesh.update(t);
      const meshO = R.p(lt, T.build, 0.9, E.smooth) * (1 - R.p(lt, T.exit - 0.1, 0.5, E.smooth));
      S.mesh.el.style.opacity = meshO.toFixed(4);
      const env = R.p(lt, 0.04, 0.9, E.smooth) * (1 - R.p(lt, T.exit - 0.05, 0.42, E.smooth));
      const th = lt * 1.15;
      const orb = { x: Math.sin(th) * 10 * env, y: Math.cos(th * 0.85) * 7 * env };
      const camS = 1 + 0.03 * env * R.p(lt, 0.1, 3.7, E.inOutSine);
      tfx(S.cam, { s: camS, rx: Math.cos(th * 0.9) * 1.6 * env, ry: Math.sin(th * 1.1) * 2.2 * env, persp: 2600 });
      // Tremida do papel na batida do carimbo (4 px).
      const shakeA = lt >= T.accepted ? 4 * (1 - R.p(lt, T.accepted, 0.32, E.outCubic)) : 0;
      const shx = shakeA ? R.noise(lt * 48, 3) * shakeA : 0;
      const shy = shakeA ? R.noise(lt * 48, 9) * shakeA : 0;
      tfx(S.backLayer2, { x: orb.x * 0.55 + shx * 0.5, y: orb.y * 0.55 + shy * 0.5 });
      tfx(S.backLayer1, { x: orb.x * 0.75 + shx * 0.7, y: orb.y * 0.75 + shy * 0.7 });
      const bump2 = R.kf(lt, [[T.sent - 0.04, 0], [T.sent + 0.1, -10, E.outCubic], [T.sent + 0.5, 0, E.smooth]]);
      tfx(S.paperLayer, { x: orb.x + shx, y: orb.y + shy + bump2 });
      tfx(S.trackLayer, { x: orb.x * 1.25, y: orb.y * 1.25 });
      tfx(S.cardLayer, { x: orb.x * 1.45, y: orb.y * 1.45 });
      tfx(S.titleLayer, { x: orb.x * 0.35, y: orb.y * 0.35 });

      // ── O papel se monta em volta das pílulas ──────────────────────────────
      const pk = R.p(lt, T.paper, 0.62, E.snappy);
      const box = {
        x: R.lerp(START_BOX.x, DOC.x, pk),
        y: R.lerp(START_BOX.y, DOC.y, pk),
        w: R.lerp(START_BOX.w, DOC.w, pk),
        h: R.lerp(START_BOX.h, DOC.h, pk),
        r: R.lerp(START_BOX.r, DOC.r, pk),
      };
      const paperOn = lt >= T.paper && !done;
      S.paper.style.display = paperOn ? 'block' : 'none';
      if (paperOn) {
        Object.assign(S.paper.style, { left: `${box.x.toFixed(2)}px`, top: `${box.y.toFixed(2)}px`, width: `${box.w.toFixed(2)}px`, height: `${box.h.toFixed(2)}px`, borderRadius: `${box.r.toFixed(2)}px` });
        S.paper.style.opacity = R.p(lt, T.paper, 0.1, E.outQuad).toFixed(4);
        S.content.style.left = `${(DOC.x - box.x).toFixed(2)}px`;
        S.content.style.top = `${(DOC.y - box.y).toFixed(2)}px`;
        const exiting = lt >= T.exit;
        S.paper.style.background = exiting ? 'transparent' : '#fff';
        S.paper.style.boxShadow = exiting ? 'none' : shadow(SH_LG);
        if (exiting) {
          // O conteúdo fica preso dentro da caixa que encolhe (a pílula atrás).
          const g = morphBox(lt);
          S.paper.style.clipPath = `inset(${(g.y - DOC.y).toFixed(2)}px ${(DOC.x + DOC.w - g.x - g.w).toFixed(2)}px ${(DOC.y + DOC.h - g.y - g.h).toFixed(2)}px ${(g.x - DOC.x).toFixed(2)}px round ${g.r.toFixed(2)}px)`;
        } else S.paper.style.clipPath = 'none';
        const sk = R.p(lt, T.exit, 0.32, E.inOutCubic);
        const ck = R.p(lt, T.exit + 0.06, 0.13, E.inQuad);
        tfx(S.content, { s: 1 - sk * 0.5, o: 1 - ck, blur: ck * 4 });
      }

      // Folhas de trás: deslizam de baixo do papel; recolhem na saída.
      S.backs.forEach((b, i) => {
        const k = R.p(lt, T.paper + 0.1 + i * 0.06, 0.7, E.snappy);
        const out = R.p(lt, T.clear + 0.04, 0.26, E.inCubic);
        const on = k > 0 && out < 1 && !done;
        b.el.style.display = on ? 'block' : 'none';
        if (!on) return;
        const m = k * (1 - out);
        tfx(b.el, { x: b.x * m, y: b.y * m, r: b.r * m, s: R.lerp(0.9, 1, k) - out * 0.12, o: R.clamp(k * 2) * (1 - out) });
      });

      // Conteúdo do papel em cascata.
      const bandK = R.sp(lt, T.band, R.springs.bouncy);
      tfx(S.mono, { s: R.clamp(bandK, 0, 1.3), r: (1 - R.clamp(bandK, 0, 1.2)) * -40 });
      const ringK = R.p(lt, T.title1 + 0.4, 0.7, E.outCubic);
      tfx(S.monoRing, { s: R.lerp(1, 1.9, ringK), o: lt >= T.title1 + 0.4 ? (1 - ringK) * 0.9 : 0 });
      reveal(S.clinicParts, lt, { start: T.band + 0.06, stagger: 0.06, dur: 0.6 });
      tfx(S.clinicSub, { y: (1 - R.p(lt, T.band + 0.16, 0.5)) * 18, o: R.p(lt, T.band + 0.16, 0.4) });
      const tagK = R.sp(lt, T.band + 0.2, R.springs.bouncy);
      tfx(S.docTag, { s: R.lerp(0.6, 1, R.clamp(tagK, 0, 1.2)), o: R.clamp(tagK * 3) });
      reveal(S.docTitleParts, lt, { start: T.head, stagger: 0.06, dur: 0.6 });
      tfx(S.patient, { y: (1 - R.p(lt, T.head + 0.1, 0.5)) * 20, o: R.p(lt, T.head + 0.1, 0.4) });
      S.dividers.forEach((d, i) => tfx(d, { sx: R.p(lt, T.head + 0.12 + i * 0.07, 0.55, E.snappy), sy: 1 }));

      // ── As pílulas dos dentes voam para dentro e viram linhas ──────────────
      S.chips.forEach((c, i) => {
        const g = CHIPS[i];
        const fl = R.p(lt, T.fly[i], T.flyDur, E.inOutCubic);
        const landed = fl >= 1;
        c.el.style.display = landed ? 'none' : 'flex';
        S.rows[i].icon.style.visibility = landed ? 'visible' : 'hidden';
        if (landed) return;
        const lift = R.p(lt, 0, 0.18, E.outCubic) * (1 - R.p(lt, T.fly[i] + T.flyDur * 0.5, T.flyDur * 0.5, E.inOutCubic));
        const arc = Math.sin(Math.PI * fl);
        const x = (LAND[i].x - g.x) * fl;
        const y = (LAND[i].y - g.y) * fl - arc * 46 - lift * 8;
        tfx(c.el, { x, y, s: 1 + lift * 0.035 + arc * 0.03, r: arc * (i ? 2.4 : -2.4) });
        // O cartão se dissolve no papel: some o fundo, some a sombra.
        const a = 1 - R.p(fl, 0.55, 0.45, E.inOutQuad);
        if (lt <= 0) {
          c.el.style.background = c.orig.background;
          c.el.style.boxShadow = c.orig.boxShadow;
        } else {
          c.el.style.background = `rgba(255,255,255,${a.toFixed(3)})`;
          c.el.style.boxShadow = `0 ${(10 + 16 * lift).toFixed(1)}px ${(30 + 22 * lift).toFixed(1)}px -8px rgba(11,31,63,${((0.18 + 0.1 * lift) * a).toFixed(3)}), 0 2px 6px rgba(11,31,63,${(0.06 * a).toFixed(3)})`;
        }
        // O texto antigo sobe e some; o novo sobe da máscara no mesmo lugar.
        const tk = R.p(lt, T.fly[i] + 0.1, 0.18, E.inCubic);
        tfx(c.text, { y: -tk * 18, o: 1 - tk, blur: tk * 5 });
      });
      S.rows.forEach((row, i) => {
        if (i < 2) reveal(row.parts, lt, { start: T.fly[i] + 0.3, stagger: 0.045, dur: 0.55 });
        const ck = R.sp(lt, i < 2 ? T.check[i] : T.check3, R.springs.bouncy);
        tfx(row.check, { s: R.clamp(ck, 0, 1.4), r: (1 - R.clamp(ck, 0, 1.2)) * -60 });
        R.draw(row.checkPath, R.p(lt, (i < 2 ? T.check[i] : T.check3) + 0.08, 0.28, E.outCubic));
      });
      // Terceira linha: ícone brota, o texto se digita com cursor.
      const r3 = S.rows[2];
      const ik = R.sp(lt, T.row3, R.springs.bouncy);
      r3.icon.style.visibility = 'visible';
      tfx(r3.icon, { s: R.clamp(ik, 0, 1.3), r: (1 - R.clamp(ik, 0, 1.2)) * 50 });
      R.type(r3.txt, r3.label, lt, T.type, 24);
      const typing = lt >= T.type - 0.08 && lt < T.check3 + 0.2;
      const blinkOn = lt < T.type + 11 / 24 || (lt * 4) % 1 < 0.6;
      r3.caret.style.opacity = typing && blinkOn ? '1' : '0';

      // Faixa de leitura em "Visualizado".
      const sw = R.p(lt, T.viewed - 0.05, 0.75, E.inOutCubic);
      S.sweep.style.display = sw > 0 && sw < 1 ? 'block' : 'none';
      tfx(S.sweep, { y: R.lerp(-60, DOC.h - 150, sw), o: Math.sin(Math.PI * sw) });

      // Condições e aceite.
      S.conds.forEach((c, i) => {
        const k = R.sp(lt, T.cond + i * 0.08, R.springs.bouncy);
        tfx(c, { s: R.lerp(0.6, 1, R.clamp(k, 0, 1.2)), y: (1 - R.clamp(k)) * 16, o: R.clamp(k * 3) });
      });
      tfx(S.signLine, { sx: R.p(lt, T.sign, 0.6, E.snappy), sy: 1 });
      tfx(S.signLabel, { y: (1 - R.p(lt, T.sign + 0.1, 0.5)) * 12, o: R.p(lt, T.sign + 0.1, 0.4) });

      // ── Títulos ─────────────────────────────────────────────────────────────
      reveal(S.titles[0].parts, lt, { start: T.title1, stagger: 0.07, dur: 0.6, out: { start: T.title1Out, stagger: 0.035, dur: 0.32 } });
      reveal(S.titles[1].parts, lt, { start: T.title2, stagger: 0.07, dur: 0.6, out: { start: T.title2Out, stagger: 0.035, dur: 0.26 } });
      S.titles[0].el.style.visibility = lt < T.title1Out + 0.5 ? 'visible' : 'hidden';
      S.titles[1].el.style.visibility = lt > T.title2 - 0.02 && lt < T.title2Out + 0.45 ? 'visible' : 'hidden';

      // ── Link / PDF viram como cartas ───────────────────────────────────────
      S.cards.forEach((c, i) => {
        const k = R.sp(lt, T.flip[i], { k: 190, c: 17 });
        const out = R.p(lt, T.clear + i * 0.04, 0.22, E.inCubic);
        const on = lt >= T.flip[i] && out < 1;
        c.wrap.style.display = on ? 'block' : 'none';
        if (!on) return;
        const ry = 180 * (1 - k) - out * 90;
        const front = Math.abs(ry) <= 90;
        c.front.style.visibility = front ? 'visible' : 'hidden';
        c.back.style.visibility = front ? 'hidden' : 'visible';
        tfx(c.front, { ry, persp: 900 });
        tfx(c.back, { ry: ry - 180, persp: 900 });
        const rise = R.p(lt, T.flip[i], 0.4, E.snappy);
        tfx(c.wrap, { y: (1 - rise) * 70 + out * 30, s: R.lerp(0.86, 1, rise), o: R.clamp(rise * 4) * (1 - out) });
      });

      // ── Rastreador: Enviado → Visualizado → Aceito ─────────────────────────
      const trackOn = lt >= T.track && lt < T.clear + 0.4;
      S.track.style.display = trackOn ? 'flex' : 'none';
      if (trackOn) {
        S.steps.forEach((st, i) => {
          const k = R.sp(lt, T.track + i * 0.07, R.springs.snappy);
          const out = R.p(lt, T.clear + 0.04 + i * 0.04, 0.2, E.inCubic);
          tfx(st.base, { y: (1 - R.clamp(k)) * 40 + out * 46, s: R.lerp(0.85, 1, R.clamp(k, 0, 1.1)) - out * 0.08, o: R.clamp(k * 3) * (1 - out) });
          const lk = R.sp(lt, T.lit[i], R.springs.bouncy);
          tfx(st.lit, { s: R.lerp(0.7, 1, R.clamp(lk, 0, 1.15)), o: R.clamp(lk * 4) });
          const rk = R.p(lt, T.lit[i], 0.6, E.outCubic);
          tfx(st.ring, { s: R.lerp(1, 1.35, rk), sy: R.lerp(1, 1.7, rk), o: lt >= T.lit[i] ? (1 - rk) * 0.85 : 0 });
          if (i === 0) tfx(st.onIcon, { x: (1 - R.p(lt, T.lit[0], 0.4, E.outBack)) * -12, y: (1 - R.p(lt, T.lit[0], 0.4, E.outBack)) * 8 });
          if (st.eye) {
            // O olho se desenha fechado, abre com mola e pisca duas vezes.
            const dk = R.p(lt, T.lit[i], 0.2, E.outCubic);
            R.draw(st.eye.lidTop, dk);
            R.draw(st.eye.lidBot, dk);
            const ir = R.sp(lt, T.lit[i] + 0.12, R.springs.bouncy);
            st.eye.iris.setAttribute('r', (3.3 * R.clamp(ir, 0, 1.3)).toFixed(3));
            st.eye.pupil.setAttribute('r', (1.3 * R.clamp(ir, 0, 1.3)).toFixed(3));
            const open = R.lerp(0.1, 1, R.clamp(R.sp(lt, T.lit[i] + 0.1, R.springs.bouncy), 0, 1.15));
            const closed = Math.max(bump(lt, T.blink[0], 0.07), bump(lt, T.blink[1], 0.07));
            st.eye.g.setAttribute('transform', `translate(0 12) scale(1 ${(open * (1 - 0.92 * closed)).toFixed(3)}) translate(0 -12)`);
          }
        });
        S.links.forEach((lk, i) => {
          const a = i === 0 ? T.lit[0] + 0.15 : T.lit[2] - 0.3;
          const b = i === 0 ? T.lit[1] : T.lit[2];
          lk.fill.style.width = `${(40 * R.p(lt, a, b - a, E.inOutCubic)).toFixed(2)}px`;
          const k = R.p(lt, T.track + 0.05 + i * 0.07, 0.4, E.snappy);
          const out = R.p(lt, T.clear + 0.06 + i * 0.04, 0.2, E.inCubic);
          tfx(lk.el, { sx: k, sy: 1, o: 1 - out });
        });
      }

      // ── Carimbo "Aceito" ───────────────────────────────────────────────────
      const fk = R.p(lt, T.fall, T.accepted - T.fall, E.inCubic);
      const stampOn = lt >= T.fall && lt < T.exit + 0.28 && !done;
      S.stampWrap.style.display = stampOn ? 'block' : 'none';
      S.stampShadow.style.display = stampOn && lt < T.accepted + 0.05 ? 'block' : 'none';
      if (stampOn) {
        const hit = lt >= T.accepted;
        const squash = hit ? R.kf(lt, [[T.accepted, 0.93], [T.accepted + 0.07, 1.025, E.outQuad], [T.accepted + 0.22, 1, E.smooth]]) : 1;
        let sc = R.lerp(2.3, 1, fk) * squash;
        let rot = R.lerp(-17, -6, fk);
        let x = orb.x * 0.8 * (1 - fk);
        let y = R.lerp(-90, 0, fk) + orb.y * 0.8 * (1 - fk);
        let o = R.clamp(fk * 2.4);
        // Saída: vira o ícone da pílula.
        if (lt >= T.exit) {
          const g = morphBox(lt);
          const bcx = g.x + g.w / 2;
          const bcy = g.y + g.h / 2;
          const ek = R.p(lt, T.exit, 0.27, E.inOutCubic);
          x = R.lerp(0, bcx + S.iconDX - STAMP.cx, ek) - Math.sin(Math.PI * ek) * 30;
          y = R.lerp(0, bcy - STAMP.cy, ek) - Math.sin(Math.PI * ek) * 60;
          sc = R.lerp(1, 0.1, ek);
          rot = R.lerp(-6, 0, ek);
          o = 1 - R.p(lt, T.exit + 0.19, 0.08);
        }
        tfx(S.stampWrap, { x, y, s: sc, r: rot, o });
        tfx(S.stampShadow, { x: x * 0.5, y: R.lerp(80, 0, fk), s: R.lerp(1.5, 1, fk), o: R.clamp(fk * 1.5) * 0.9 });
      }
      const shk = R.p(lt, T.accepted, 0.42, E.outCubic);
      S.shock.style.display = lt >= T.accepted && shk < 1 && !done ? 'block' : 'none';
      tfx(S.shock, { s: R.lerp(1, 1.18, shk), sy: R.lerp(1, 1.45, shk), r: -6, o: (1 - shk) * 0.75 });
      S.stars.forEach((st, i) => {
        const at = T.accepted + (i % 3) * 0.025;
        const k = R.p(lt, at, 0.62, E.outCubic);
        const on = lt >= at && k < 1 && !done;
        st.el.style.display = on ? 'block' : 'none';
        if (!on) return;
        const d = R.lerp(STAMP.w * 0.3, st.d, k);
        const cx = STAMP.cx + Math.cos(st.a) * d * 1.15;
        const cy = STAMP.cy + Math.sin(st.a) * d * 0.75;
        tfx(st.el, { x: cx - st.sz / 2, y: cy - st.sz / 2, s: Math.sin(Math.min(1, k * 1.3) * Math.PI) * 1.15, r: k * 200 * st.spin, o: 1 - R.p(k, 0.7, 0.3) });
      });

      // ── Saída: o documento encolhe e vira a pílula "Orçamento aceito" ───────
      const P = S.pill.el;
      if (done) {
        Object.assign(P.style, S.PO);
        P.style.visibility = 'visible';
        P.style.transform = '';
        P.style.opacity = '';
        [S.pillIcon, S.pillText].forEach((el) => {
          el.style.transform = '';
          el.style.opacity = '';
          el.style.clipPath = '';
          el.style.filter = '';
        });
      } else if (lt >= T.exit) {
        P.style.visibility = 'visible';
        const g = morphBox(lt);
        const m = g.m;
        Object.assign(P.style, { left: `${g.x.toFixed(2)}px`, top: `${g.y.toFixed(2)}px`, width: `${g.w.toFixed(2)}px`, height: `${g.h.toFixed(2)}px`, borderRadius: `${g.r.toFixed(2)}px` });
        const ck = R.p(lt, T.exit + 0.08, 0.24, E.smooth);
        P.style.background = mix('#FFFFFF', C.mint, ck);
        P.style.boxShadow = shadow(SH_LG.map((v, j) => R.lerp(v, SH_MD[j], m)));
        // Texto entra varrendo da esquerda; ícone brota onde o carimbo chega.
        const tk = R.p(lt, T.exit + 0.17, 0.25, E.snappy);
        S.pillText.style.clipPath = `inset(-10% ${((1 - tk) * 100).toFixed(2)}% -10% 0)`;
        tfx(S.pillText, { x: (1 - tk) * -14, o: R.clamp(tk * 3) });
        const ik2 = R.p(lt, T.exit + 0.25, 0.18, E.outBack);
        tfx(S.pillIcon, { s: ik2, r: (1 - ik2) * -90, o: R.clamp(ik2 * 3) });
      } else {
        P.style.visibility = 'hidden';
      }
    },
  });
})();
