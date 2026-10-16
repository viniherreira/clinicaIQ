/*
 * Cena "payments" (global 27,0–35,0): no drop da música, uma íris em estrela
 * abre a partir da pílula "Orçamento aceito" e revela o degradê da marca. As
 * seis formas de pagamento entram cada uma na palavra falada, se compactam
 * numa fileira, e o alternador "À vista | Parcelado" se desdobra no plano de
 * entrada + parcelas. A entrada é paga, o anel enche 25% e dele sai a moeda,
 * que pousa no centro do branco quente (passagem para o financeiro).
 *
 * Passagens: começa com B.handoff.acceptedPill() sobre o branco quente (sem
 * transform) e termina com B.handoff.coin() em (540, 960), sem transform,
 * sobre o branco quente. Nenhum valor em dinheiro aparece na tela.
 */
(() => {
  const { h, s } = R;
  const E = R.ease;
  const C = B.C;
  const TL = window.TIMELINE;
  const T0 = TL.payments.start;
  const DUR = TL.payments.end - T0;
  const EV = TL.events;
  const L = (g) => g - T0; // global → local
  const VO = Object.fromEntries(TL.vo.map((v) => [v.id, { start: L(v.start), end: L(v.end) }]));

  // ── Tempos locais (todos derivados do TIMELINE) ─────────────────────────────
  const T = {
    title: VO.p12.start + 0.1, // 0,20 "Paga como preferir"
    slots: VO.p12.start + 0.42, // 0,52 os lugares dos cards aparecem
    compact: L(EV.payTransfer) + 0.47, // 5,42 (32,42) cards viram fileira
    aVista: L(EV.aVista), // 6,10
    parcelado: L(EV.parcelado), // 6,80
    entrada: L(EV.entradaPaga), // 7,30
    exit: DUR - 0.4, // 7,60 a moeda sai do anel
    settle: DUR - 0.07, // 7,93 tudo parado na geometria da passagem
  };
  T.unfold = T.parcelado + 0.1;
  T.roll = T.parcelado + 0.2;
  T.titleOut = T.exit - 0.08;

  const METHODS = [
    { id: 'pix', label: 'Pix', at: L(EV.payPix) },
    { id: 'credit', label: 'Crédito', at: L(EV.payCredit), tag: '12x' },
    { id: 'debit', label: 'Débito', at: L(EV.payDebit) },
    { id: 'boleto', label: 'Boleto', at: L(EV.payBoleto), tag: '24x' },
    { id: 'cash', label: 'Dinheiro', at: L(EV.payCash) },
    { id: 'transfer', label: 'Transferência', at: L(EV.payTransfer) },
  ];
  METHODS.forEach((m) => (m.pop = m.at - 0.06)); // o pico do pop cai logo depois da palavra

  // ── Geometria ───────────────────────────────────────────────────────────────
  const PILL = B.handoff.ACCEPTED_PILL; // {x:230, y:894, w:620, h:132}
  const PILL_C = { x: PILL.x + PILL.w / 2, y: PILL.y + PILL.h / 2 }; // (540, 960)
  const HEAD = { cy: 268, s: 0.66 }; // pílula vira cabeçalho compacto
  const CW = 416;
  const CH = 240;
  const GX = [110, 554];
  const GY = [540, 812, 1084];
  const IT = 104; // ladrilho do ícone dentro do card
  const TS = 120; // ladrilho compacto
  const TG = 20;
  const TX0 = 540 - (6 * TS + 5 * TG) / 2;
  const TY = 530;
  const TOG = { x: 220, y: 706, w: 640, h: 108 };
  const TOG_STAGE = { dy: 220, s: 1.14 }; // onde o alternador aparece antes do clique
  const TH = TOG.h - 16; // seletor
  const TWh = (TOG.w - 16) / 2;
  const FC = { x: 110, y: 852, w: 860, h: 456 }; // card "Entrada + parcelas"
  const COL = 526; // coluna da esquerda do card
  const RING = { cx: 708, cy: 246, r: 104, sw: 18 }; // local ao FC
  const CNT = { win: 176, item: 120 }; // roda do contador de parcelas
  const COIN = B.handoff.COIN; // {cx:540, cy:960, size:200}
  const CAM_O = { x: 540, y: 900 };

  // ── Ajudantes ──────────────────────────────────────────────────────────────
  const abs = (el, x, y, w, hh) => B.abs(el, x, y, w, hh);
  const rr = (x, y, w, hh, r) =>
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + hh - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + hh}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + hh - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  const P = (d, { col = C.teal700, w = 3, fill = 'none', cap = 'round' } = {}) =>
    s('path', { d, fill, stroke: fill === 'none' ? col : 'none', 'stroke-width': w, 'stroke-linecap': cap, 'stroke-linejoin': 'round' });
  const G = (...kids) => s('g', { style: { transformBox: 'fill-box', transformOrigin: 'center' } }, ...kids);
  const svgBox = (size) => s('svg', { viewBox: '0 0 48 48', width: size, height: size, style: { display: 'block', overflow: 'visible' } });
  /** Pulso periódico 0..1 (pico no início do período), para ícones vivos. */
  const pulse = (t, period, phase = 0) => {
    const f = (((t - phase) % period) + period) % period;
    return Math.exp(-f * 5);
  };
  /** Mesmo cálculo de câmera usado em update (para achar o anel na tela). */
  const camAt = (lt) => ({
    s: R.lerp(1, 1.025, R.p(lt, 0, DUR, E.inOutSine)),
    x: R.noise(lt * 0.35, 3) * 5,
    y: R.noise(lt * 0.3, 7) * 6 - R.p(lt, 0, DUR, E.inOutSine) * 8,
  });
  const camPt = (lt, px, py) => {
    const c = camAt(lt);
    return [CAM_O.x + c.x + (px - CAM_O.x) * c.s, CAM_O.y + c.y + (py - CAM_O.y) * c.s];
  };

  /** Explosão de estrelinhas a partir de um ponto. */
  function burst(layer, n, { min = 14, max = 28, colors = ['#fff', C.mint], seed = 1, r0 = 40, r1 = 180 } = {}) {
    const items = [];
    for (let i = 0; i < n; i++) {
      const sz = R.lerp(min, max, R.hash(i * 3.7 + seed));
      const wrap = h('div', { style: { position: 'absolute', left: '0', top: '0', width: `${sz}px` } }, B.star({ size: sz, color: colors[i % colors.length] }));
      wrap.style.opacity = '0';
      layer.appendChild(wrap);
      const a = (i / n) * Math.PI * 2 + (R.hash(i * 9.1 + seed) - 0.5) * 0.7;
      const d = R.lerp(r0, r1, R.hash(i * 5.3 + seed * 2));
      items.push({ wrap, a, d, sz, spin: R.hash(i + seed * 4) > 0.5 ? 1 : -1 });
    }
    return {
      update(lt, t0, cx, cy, dur = 0.7) {
        items.forEach((it, i) => {
          const st = t0 + (i % 3) * 0.03;
          const k = R.p(lt, st, dur, E.outCubic);
          const on = lt >= st && k < 1;
          if (!on) {
            it.wrap.style.opacity = '0';
            return;
          }
          const dd = R.lerp(it.d * 0.35, it.d, k);
          const sc = Math.sin(Math.min(1, k * 1.25) * Math.PI) * 1.1;
          R.tf(it.wrap, { x: cx + Math.cos(it.a) * dd - it.sz / 2, y: cy + Math.sin(it.a) * dd - it.sz / 2, s: sc, r: it.spin * k * 140, o: 1 - R.p(k, 0.55, 0.45, E.linear) });
        });
      },
    };
  }

  // ── Ícones desenhados à mão (traço teal, 48×48) ─────────────────────────────
  // Cada um devolve { svg, update(lt, at) }: at = quando o card entra.
  const ICONS = {
    // QR genérico: três quadrados de canto + módulos (nunca o símbolo do Pix).
    pix() {
      const svg = svgBox(66);
      const finders = [
        [4, 4],
        [30, 4],
        [4, 30],
      ].map(([x, y]) => {
        const o = P(rr(x, y, 14, 14, 3.6), { w: 3 });
        const inner = G(P(rr(x + 4.6, y + 4.6, 4.8, 4.8, 1.2), { fill: C.teal700 }));
        svg.append(o, inner);
        return { o, inner };
      });
      const MOD = [
        [22.3, 4.6], [22.3, 11.4], [22.3, 18.2], [4.6, 22.3], [11.4, 22.3], [18.2, 22.3],
        [30.6, 30.6], [37.4, 30.6], [41.2, 37.4], [30.6, 41.2], [37.4, 41.2], [22.3, 30.6],
        [22.3, 41.2], [30.6, 22.3], [41.2, 22.3], [34.2, 35.9],
      ];
      const mods = MOD.map(([x, y], i) => {
        const g = G(P(rr(x, y, 4.4, 4.4, 1.1), { fill: i % 3 === 0 ? C.teal700 : C.teal }));
        svg.appendChild(g);
        return g;
      });
      return {
        svg,
        update(lt, at) {
          finders.forEach((f, i) => {
            R.draw(f.o, R.p(lt, at + 0.04 + i * 0.06, 0.42, E.inOutCubic));
            const k = R.sp(lt, at + 0.26 + i * 0.05, R.springs.bouncy);
            R.tf(f.inner, { s: k, o: R.clamp(k * 3) });
          });
          mods.forEach((m, i) => {
            const st = at + 0.3 + R.hash(i * 4.1) * 0.3;
            const k = R.sp(lt, st, R.springs.bouncy);
            const tw = pulse(lt + R.hash(i * 2.3) * 1.2, 1.2) * R.p(lt, at + 0.9, 0.3);
            R.tf(m, { s: k * (1 - tw * 0.35), o: R.clamp(k * 3) });
          });
        },
      };
    },
    // Cartão de crédito: chip e ondas de aproximação.
    credit() {
      const svg = svgBox(66);
      const card = P(rr(3, 10, 42, 29, 5.5));
      const chip = G(P(rr(8.5, 17, 10, 8, 2), { fill: C.teal }));
      const num = P('M9 32.5H21', { w: 3, col: C.teal });
      const arcs = [3.6, 7.2, 10.8].map((r) => {
        const a0 = (-52 * Math.PI) / 180;
        const a1 = (52 * Math.PI) / 180;
        const cx = 29;
        const cy = 24.5;
        return P(`M${(cx + Math.cos(a0) * r).toFixed(2)} ${(cy + Math.sin(a0) * r).toFixed(2)}A${r} ${r} 0 0 1 ${(cx + Math.cos(a1) * r).toFixed(2)} ${(cy + Math.sin(a1) * r).toFixed(2)}`, { w: 2.8 });
      });
      svg.append(card, chip, num, ...arcs);
      return {
        svg,
        update(lt, at) {
          R.draw(card, R.p(lt, at + 0.04, 0.45, E.inOutCubic));
          const k = R.sp(lt, at + 0.22, R.springs.bouncy);
          R.tf(chip, { s: k, o: R.clamp(k * 3) });
          R.draw(num, R.p(lt, at + 0.3, 0.3));
          arcs.forEach((a, i) => {
            const inK = R.p(lt, at + 0.32 + i * 0.07, 0.3);
            const live = R.p(lt, at + 0.75, 0.3);
            const pu = pulse(lt, 1.0, i * 0.12 + at);
            a.style.opacity = (inK * R.lerp(1, 0.35 + pu * 0.65, live)).toFixed(3);
            R.draw(a, inK);
          });
        },
      };
    },
    // Cartão de débito com seta.
    debit() {
      const svg = svgBox(66);
      const card = P(rr(3, 6, 36, 25, 5));
      const stripe = P('M3 13.5H39', { w: 3.4, cap: 'butt' });
      const line = P('M8.5 23.5H17', { w: 3, col: C.teal });
      const arrow = G(P('M24 40.5H43', { w: 3.2 }), P('M37.5 35L43 40.5L37.5 46', { w: 3.2 }));
      svg.append(card, stripe, line, arrow);
      return {
        svg,
        update(lt, at) {
          R.draw(card, R.p(lt, at + 0.04, 0.45, E.inOutCubic));
          R.draw(stripe, R.p(lt, at + 0.22, 0.3));
          R.draw(line, R.p(lt, at + 0.3, 0.3));
          const k = R.p(lt, at + 0.32, 0.45, E.snappy);
          const nudge = Math.sin(Math.max(0, lt - at - 0.8) * Math.PI * 2) * 2.2 * R.p(lt, at + 0.8, 0.3);
          R.tf(arrow, { x: (1 - k) * -14 + nudge, o: k });
        },
      };
    },
    // Boleto: código de barras se desenhando, com a linha de leitura.
    boleto() {
      const svg = svgBox(66);
      const BARS = [[5.5, 2.2], [9.4, 3.6], [13.6, 1.6], [16.8, 1.6], [20.6, 3.8], [25, 1.6], [28.4, 2.6], [32.4, 3.8], [36.8, 1.6], [40, 2.4], [43, 1.6]];
      const bars = BARS.map(([x, w]) => P(`M${x} 7V34`, { w, cap: 'butt' }));
      const dig1 = P('M5.5 41H28', { w: 2.8, col: C.teal });
      const dig2 = P('M33 41H43', { w: 2.8, col: C.teal });
      const scan = s('rect', { x: 1, y: 19.5, width: 46, height: 2.4, rx: 1.2, fill: C.teal400, style: { filter: 'drop-shadow(0 0 2px rgba(45,212,191,.9))' } });
      svg.append(...bars, dig1, dig2, scan);
      return {
        svg,
        update(lt, at) {
          bars.forEach((b, i) => R.draw(b, R.p(lt, at + 0.06 + i * 0.035, 0.26, E.outCubic)));
          R.draw(dig1, R.p(lt, at + 0.4, 0.3));
          R.draw(dig2, R.p(lt, at + 0.48, 0.25));
          const on = R.p(lt, at + 0.3, 0.2);
          const ph = (((lt - at) % 1.0) + 1.0) % 1.0;
          const yy = Math.sin(ph * Math.PI * 2) * 12;
          scan.setAttribute('transform', `translate(0 ${yy.toFixed(2)})`);
          scan.style.opacity = (on * 0.9).toFixed(3);
        },
      };
    },
    // Cédula (duas, uma atrás da outra).
    cash() {
      const svg = svgBox(66);
      const back = G(P(rr(9, 7, 36, 22, 4.5), { col: C.teal, w: 2.8 }));
      const front = G(
        s('path', { d: rr(3, 16, 37, 23, 4.5), fill: C.teal50, stroke: 'none' }),
        P(rr(3, 16, 37, 23, 4.5)),
        P('M21.5 22.2a5.3 5.3 0 1 1 0 10.6a5.3 5.3 0 1 1 0-10.6Z', { w: 2.8 }),
        s('circle', { cx: 9, cy: 22, r: 1.7, fill: C.teal700 }),
        s('circle', { cx: 34, cy: 33, r: 1.7, fill: C.teal700 }),
      );
      svg.append(back, front);
      return {
        svg,
        update(lt, at) {
          const k = R.sp(lt, at + 0.05, R.springs.snappy);
          const kb = R.sp(lt, at + 0.2, R.springs.bouncy);
          const bob = Math.sin(Math.max(0, lt - at - 0.7) * Math.PI * 2) * 1.4 * R.p(lt, at + 0.7, 0.3);
          R.tf(front, { y: (1 - k) * 18 + bob, o: R.clamp(k * 3), r: (1 - k) * -10 });
          R.tf(back, { x: (1 - kb) * -8, y: (1 - kb) * 8 - bob * 0.6, o: R.clamp(kb * 3) });
        },
      };
    },
    // Transferência: duas setas trocando de lado.
    transfer() {
      const svg = svgBox(66);
      const topL = P('M7 15.5H40');
      const topH = P('M33.5 9L40 15.5L33.5 22');
      const botL = P('M41 32.5H8', { col: C.teal });
      const botH = P('M14.5 26L8 32.5L14.5 39', { col: C.teal });
      const gTop = G(topL, topH);
      const gBot = G(botL, botH);
      svg.append(gTop, gBot);
      return {
        svg,
        update(lt, at) {
          const a = R.p(lt, at + 0.05, 0.4, E.snappy);
          const b = R.p(lt, at + 0.15, 0.4, E.snappy);
          R.draw(topL, a);
          R.draw(topH, R.p(lt, at + 0.28, 0.2));
          R.draw(botL, b);
          R.draw(botH, R.p(lt, at + 0.38, 0.2));
          const sw = Math.sin(Math.max(0, lt - at - 0.6) * Math.PI * 2) * 2.4 * R.p(lt, at + 0.6, 0.3);
          R.tf(gTop, { x: (1 - a) * -10 + sw });
          R.tf(gBot, { x: (1 - b) * 10 - sw });
        },
      };
    },
  };

  R.scene({
    id: 'payments',
    build(root, S) {
      // Camada 0: branco quente (o fundo do último quadro do orçamento).
      root.appendChild(h('div', { style: { position: 'absolute', inset: 0, background: C.warm } }));

      // Camada 1: degradê da marca, aberto pela íris em estrela.
      const grad = h('div', { style: { position: 'absolute', inset: 0, overflow: 'hidden' } });
      root.appendChild(grad);
      grad.appendChild(h('div', { style: { position: 'absolute', inset: 0, background: B.GRADIENT } }));
      const mesh = B.mesh({
        base: 'transparent',
        blobs: [
          { x: 140, y: 260, r: 700, color: 'rgba(45,212,191,.30)' },
          { x: 960, y: 1700, r: 760, color: 'rgba(6,24,51,.45)' },
          { x: 900, y: 700, r: 520, color: 'rgba(94,234,212,.12)' },
          { x: 200, y: 1500, r: 560, color: 'rgba(167,227,193,.10)' },
        ],
      });
      grad.appendChild(mesh.el);
      // Estrelas grandes translúcidas, girando devagar.
      const BIG = [
        { x: 860, y: 360, size: 820, o: 0.055, rate: 7 },
        { x: 150, y: 1320, size: 700, o: 0.05, rate: -6 },
        { x: 980, y: 1560, size: 420, o: 0.06, rate: 10 },
        { x: 90, y: 560, size: 300, o: 0.06, rate: -11 },
      ];
      const bigStars = BIG.map((b) => {
        const el = h('div', { style: { position: 'absolute', left: `${b.x - b.size / 2}px`, top: `${b.y - b.size / 2}px`, width: `${b.size}px`, opacity: String(b.o) } }, B.star({ size: b.size, color: '#fff' }));
        grad.appendChild(el);
        return { el, b };
      });
      const sparkles = B.sparkles({ n: 9, area: [80, 1340, 900, 300], color: C.teal300, min: 14, max: 28, seed: 9 });
      grad.appendChild(sparkles.el);
      const sparklesTop = B.sparkles({ n: 4, area: [60, 120, 960, 70], color: C.mint, min: 12, max: 20, seed: 5 });
      grad.appendChild(sparklesTop.el);

      // Câmera (deriva leve) com o conteúdo.
      const cam = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: `${CAM_O.x}px ${CAM_O.y}px` } });
      grad.appendChild(cam);

      // Título cinético.
      const title = B.headline('Paga como preferir', { size: 92, width: 960, color: '#fff', lh: 1.0 });
      abs(title.el, 60, 364);
      title.parts[2].style.color = C.mint;
      cam.appendChild(title.el);

      // Lugares dos cards (esqueleto tracejado) e os cards.
      const grid = h('div', { style: { position: 'absolute', inset: 0 } });
      cam.appendChild(grid);
      const cards = METHODS.map((m, i) => {
        const gx = GX[i % 2];
        const gy = GY[Math.floor(i / 2)];
        const slot = abs(
          h(
            'div',
            { style: { borderRadius: '32px', border: '3px dashed rgba(255,255,255,.26)', boxSizing: 'border-box' } },
            abs(h('div', { style: { borderRadius: '28px', background: 'rgba(255,255,255,.07)' } }), 27, 27, IT, IT),
            abs(h('div', { style: { borderRadius: '12px', background: 'rgba(255,255,255,.07)' } }), 29, CH - 76, 190, 32),
          ),
          gx,
          gy,
          CW,
          CH,
        );
        grid.appendChild(slot);
        const ping = abs(h('div', { style: { borderRadius: '36px', border: '4px solid rgba(255,255,255,.75)', boxSizing: 'border-box', opacity: '0' } }), gx, gy, CW, CH);
        grid.appendChild(ping);

        const icon = ICONS[m.id]();
        const tile = abs(
          h('div', { style: { borderRadius: '28px', background: C.teal50, boxShadow: 'inset 0 0 0 2px rgba(20,184,166,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, icon.svg),
          30,
          30,
          IT,
          IT,
        );
        const label = abs(B.text(m.label, { size: 48, weight: 700, color: C.navy, ls: '-0.03em', lh: 1, style: { whiteSpace: 'nowrap' } }), 32, CH - 34 - 48);
        // Selo "aceito": bolinha teal com check no canto de baixo.
        const ok = abs(
          h('div', { style: { borderRadius: '50%', background: C.teal700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px -6px rgba(15,118,110,.7)' } }, B.icon('check', { size: 28, color: '#fff', sw: 3.4 })),
          CW - 30 - 48,
          CH - 30 - 48,
          48,
          48,
        );
        const shine = h('div', {
          style: {
            position: 'absolute', top: '-30%', left: '0', width: '46%', height: '160%',
            background: 'linear-gradient(100deg, rgba(167,227,193,0) 0%, rgba(167,227,193,.55) 48%, rgba(255,255,255,.0) 100%)',
            opacity: '0',
          },
        });
        const clip = h('div', { style: { position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden' } }, tile, label, ok, shine);
        const card = B.card({ w: CW, h: CH, r: 32, shadow: 'lg' }, clip);
        card.style.transformOrigin = '50% 50%';
        card.style.opacity = '0';
        let tag = null;
        if (m.tag) {
          const ate = h('span', { style: { display: 'inline-block', overflow: 'hidden', whiteSpace: 'nowrap' } }, 'até ');
          const num = h('span', { style: { display: 'inline-block' } }, m.tag);
          const chip = h(
            'div',
            {
              style: {
                position: 'absolute', display: 'flex', alignItems: 'center', height: '58px', padding: '0 20px', borderRadius: '999px',
                background: C.mint, color: C.navy, font: `750 30px/1 ${B.FONT}`, letterSpacing: '-0.015em', whiteSpace: 'nowrap',
                boxShadow: '0 8px 20px -8px rgba(6,24,51,.45), 0 0 0 3px #fff', transformOrigin: '70% 50%', fontFeatureSettings: '"tnum" 1',
                opacity: '0',
              },
            },
            ate,
            num,
          );
          card.appendChild(chip);
          tag = { chip, ate, ateW: 0 };
        }
        grid.appendChild(card);
        return { m, i, gx, gy, slot, ping, icon, tile, label, ok, shine, card, tag };
      });
      const stickBursts = cards.filter((c) => c.tag).map((c, j) => burst(grid, 6, { min: 12, max: 22, seed: 20 + j, r0: 30, r1: 110, colors: [C.mint, '#fff'] }));

      // Alternador "À vista | Parcelado".
      const toggle = abs(h('div', { style: { transformOrigin: '50% 50%' } }), TOG.x, TOG.y, TOG.w, TOG.h);
      const track = h('div', { style: { position: 'absolute', inset: 0, borderRadius: '999px', background: 'rgba(255,255,255,.13)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.24)' } });
      const thumb = abs(h('div', { style: { borderRadius: '999px', background: '#fff', boxShadow: '0 10px 24px -10px rgba(6,24,51,.55)' } }), 8, 8, TWh, TH);
      const mkLab = (text, x, color) => {
        const el = abs(h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 40px/1 ${B.FONT}`, letterSpacing: '-0.02em', whiteSpace: 'nowrap', color } }), x, 8, TWh, TH);
        const inner = h('span', { style: { whiteSpace: 'nowrap' } });
        el.appendChild(inner);
        const parts = R.split(inner, text, { padY: 0.32 });
        return { el, parts };
      };
      // Rótulos duas vezes: brancos por baixo do seletor e marinho por cima,
      // recortados no formato do seletor (a cor troca exatamente na borda dele).
      const mkLayer = (color) => {
        const layer = abs(h('div', {}), 0, 0, TOG.w, TOG.h);
        const a = mkLab('À vista', 8, color);
        const b = mkLab('Parcelado', 8 + TWh, color);
        layer.append(a.el, b.el);
        return { layer, parts: [a.parts, b.parts] };
      };
      const labUnder = mkLayer('rgba(255,255,255,.9)');
      const labOver = mkLayer(C.navy);
      toggle.append(track, labUnder.layer, thumb, labOver.layer);
      const tap = B.tap({ size: 84, color: 'rgba(255,255,255,.55)' });

      // Card "Entrada + parcelas" (se desdobra do alternador).
      const fc = B.card({ w: FC.w, h: FC.h, r: 40, shadow: 'xl', style: { left: `${FC.x}px`, top: `${FC.y}px`, transformOrigin: '50% 0%' } });
      const fcHead = abs(h('div', { style: { font: `750 44px/1.05 ${B.DISPLAY}`, color: C.navy, letterSpacing: '-0.03em', whiteSpace: 'nowrap' } }), 44, 42);
      const fcHeadParts = R.split(fcHead, 'Entrada + parcelas');
      fc.appendChild(fcHead);
      // Bloco "Entrada".
      const BLK = { x: 44, y: 128, w: COL, h: 140 };
      const block = abs(h('div', { style: { borderRadius: '30px', background: C.warm100, transformOrigin: '0% 50%' } }), BLK.x, BLK.y, BLK.w, BLK.h);
      const bIcon = abs(
        h('div', { style: { borderRadius: '50%', background: C.teal100, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, B.icon('wallet', { size: 34, color: C.teal700, sw: 2.3 })),
        22,
        38,
        64,
        64,
      );
      const bLabel = abs(B.text('Entrada', { size: 36, weight: 700, color: C.ink, ls: '-0.02em', lh: 1 }), 104, 36);
      const bBar = abs(h('div', { style: { borderRadius: '10px', background: C.warm300, overflow: 'hidden' } }), 104, 88, 122, 16);
      const bBarFill = h('div', { style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '0px', borderRadius: '10px', background: `linear-gradient(90deg, ${C.teal700}, ${C.teal})` } });
      bBar.appendChild(bBarFill);
      block.append(bIcon, bLabel, bBar);
      fc.appendChild(block);
      // "Entrada paga ✓" gruda dentro do bloco, à direita.
      const paid = h(
        'div',
        {
          style: {
            position: 'absolute', right: '16px', top: `${(BLK.h - 58) / 2}px`, display: 'flex', alignItems: 'center', gap: '10px', height: '58px',
            padding: '0 18px 0 22px', borderRadius: '999px', background: C.mint, color: C.navy, font: `750 30px/1 ${B.FONT}`, letterSpacing: '-0.015em',
            whiteSpace: 'nowrap', boxShadow: '0 10px 22px -10px rgba(6,24,51,.5), 0 0 0 3px #fff', transformOrigin: '60% 50%', opacity: '0',
          },
        },
        h('span', { text: 'Entrada paga' }),
        B.icon('check', { size: 30, color: C.navy, sw: 3.2 }),
      );
      block.appendChild(paid);
      // Parcelas: rótulo e fileira de pílulas que se divide conforme o contador.
      const pLabel = abs(B.text('Parcelas', { size: 30, weight: 600, color: C.muted, ls: '-0.015em', lh: 1 }), 44, 304);
      fc.appendChild(pLabel);
      const row = abs(h('div', { style: { display: 'flex' } }), 44, 350, COL, 58);
      const segs = Array.from({ length: 12 }, () => {
        const d = h('div', {
          style: {
            height: '58px', borderRadius: '18px', minWidth: '0', flex: '0 1 0px',
            background: `linear-gradient(180deg, ${C.teal50}, ${C.teal100})`,
            boxShadow: 'inset 0 0 0 2px rgba(20,184,166,.32)',
          },
        });
        row.appendChild(d);
        return d;
      });
      fc.appendChild(row);
      // Anel de progresso com o contador de parcelas.
      const ringSvg = s('svg', { width: 280, height: 280, viewBox: '0 0 280 280', style: { position: 'absolute', left: `${RING.cx - 140}px`, top: `${RING.cy - 140}px`, overflow: 'visible', transformOrigin: '50% 50%' } });
      const ringTrack = s('circle', { cx: 140, cy: 140, r: RING.r, fill: 'none', stroke: C.warm200, 'stroke-width': RING.sw, transform: 'rotate(-90 140 140)' });
      const ringProg = s('circle', { cx: 140, cy: 140, r: RING.r, fill: 'none', stroke: C.teal, 'stroke-width': RING.sw, 'stroke-linecap': 'round', transform: 'rotate(-90 140 140)' });
      ringSvg.append(ringTrack, ringProg);
      fc.appendChild(ringSvg);
      const counter = abs(
        h('div', { style: { overflow: 'hidden', WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 30%, #000 70%, transparent 100%)', maskImage: 'linear-gradient(180deg, transparent 0%, #000 30%, #000 70%, transparent 100%)' } }),
        RING.cx - 100,
        RING.cy - CNT.win / 2,
        200,
        CNT.win,
      );
      const strip = h('div', { style: { position: 'absolute', left: 0, top: 0, width: '200px' } });
      for (let n = 1; n <= 12; n++) {
        strip.appendChild(
          h(
            'div',
            { style: { height: `${CNT.item}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `800 96px/1 ${B.DISPLAY}`, letterSpacing: '-0.05em', color: C.navy, fontFeatureSettings: '"tnum" 1' } },
            h('span', { text: String(n) }),
            h('span', { style: { color: C.teal700, fontSize: '72px', marginLeft: '4px' }, text: 'x' }),
          ),
        );
      }
      counter.appendChild(strip);
      fc.appendChild(counter);
      const ringStar = h('div', { style: { position: 'absolute', left: '0', top: '0', width: '44px', opacity: '0' } }, B.star({ size: 44, color: C.teal, glow: 10 }));
      fc.appendChild(ringStar);
      const ringBurst = burst(fc, 8, { min: 12, max: 24, seed: 41, r0: 20, r1: 120, colors: [C.teal, C.mint, C.teal400] });
      cam.appendChild(fc);
      cam.appendChild(toggle); // o alternador fica por cima do card que se desdobra
      cam.appendChild(tap.el);

      // Camada 2: a pílula "Orçamento aceito" (passagem do orçamento).
      const dropBurst = burst(root, 14, { min: 18, max: 40, seed: 3, r0: 340, r1: 720, colors: ['#fff', C.mint, C.teal300] });
      // Borda da íris (por baixo da pílula).
      const irisSvg = s('svg', { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: { position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' } });
      const irisEdge = s('path', { d: '', fill: 'none', stroke: C.mint, 'stroke-width': 12, 'stroke-linejoin': 'round' });
      irisSvg.appendChild(irisEdge);
      root.appendChild(irisSvg);
      const pill = B.handoff.acceptedPill();
      root.appendChild(pill.el);

      // Camada 3: painel branco quente que sobe e a moeda (passagem para o financeiro).
      const panel = h('div', { style: { position: 'absolute', left: 0, top: 0, width: '1080px', height: '1920px', background: C.warm, boxShadow: '0 -40px 80px -20px rgba(6,24,51,.35)', display: 'none' } });
      root.appendChild(panel);
      const coin = B.handoff.coin();
      coin.el.style.opacity = '0';
      root.appendChild(coin.el);

      Object.assign(S, { grad, mesh, bigStars, sparkles, sparklesTop, cam, title, cards, stickBursts, toggle, track, thumb, labUnder, labOver, tap, fc, fcHeadParts, block, bBarFill, paid, pLabel, row, segs, ringSvg, ringTrack, ringProg, counter, strip, ringStar, ringBurst, dropBurst, pill, irisEdge, panel, coin });
    },

    update(lt, t, S) {
      const { grad, mesh, bigStars, sparkles, sparklesTop, cam, title, cards, stickBursts, toggle, thumb, labUnder, labOver, tap, fc, fcHeadParts, block, bBarFill, paid, pLabel, row, segs, ringSvg, ringTrack, ringProg, counter, strip, ringStar, ringBurst, dropBurst, pill, irisEdge, panel, coin } = S;
      const done = lt >= T.settle;

      // ── 1) Íris em estrela a partir da pílula ────────────────────────────────
      const ik = R.p(lt, 0, 0.52, E.bezier(0.55, 0, 0.85, 0.45));
      const rot = R.lerp(-0.5, 0, R.p(lt, 0, 0.52, E.outCubic));
      grad.style.visibility = done ? 'hidden' : 'visible';
      B.starWipe(grad, ik, PILL_C.x, PILL_C.y, rot);
      if (ik > 0.004 && ik < 1) {
        irisEdge.setAttribute('d', R.starPath(PILL_C.x, PILL_C.y, R.lerp(0, 2600, ik), R.lerp(0.18, 0.7, ik), rot));
        irisEdge.style.opacity = String(1 - R.p(lt, 0.22, 0.26));
      } else irisEdge.style.opacity = '0';
      dropBurst.update(lt, 0.03, PILL_C.x, PILL_C.y, 0.8);

      // Fundo vivo: manchas, estrelas grandes com um respiro em cada batida.
      mesh.update(t);
      const beat = pulse(lt, 0.5, 0) * R.p(lt, 0.4, 0.3);
      bigStars.forEach(({ el, b }, i) => {
        R.tf(el, { r: b.rate * lt + i * 17, s: 1 + beat * 0.025 + R.noise(lt * 0.3, i + 2) * 0.02, x: R.noise(lt * 0.2, i + 5) * 20, y: R.noise(lt * 0.2, i + 8) * 24 });
      });
      sparkles.update(t, R.p(lt, 0.4, 0.6) * (1 - R.p(lt, T.exit, 0.2)) * 0.9);
      sparklesTop.update(t + 1.3, R.p(lt, 0.6, 0.6) * (1 - R.p(lt, T.exit, 0.2)) * 0.7);

      // ── 2) Câmera ───────────────────────────────────────────────────────────
      const c = camAt(lt);
      R.tf(cam, { s: c.s, x: c.x, y: c.y });

      // ── 3) Pílula sobe e vira cabeçalho ─────────────────────────────────────
      if (lt <= 0) {
        pill.el.style.transform = 'none';
        pill.el.style.opacity = '1';
      } else {
        const bump = Math.sin(R.p(lt, 0, 0.18, E.linear) * Math.PI) * 0.05;
        const pk = R.p(lt, 0.14, 0.72, E.snappy);
        const out = R.p(lt, T.titleOut + 0.04, 0.3, E.inCubic);
        R.tf(pill.el, { y: R.lerp(0, HEAD.cy - PILL_C.y, pk) - out * 50, s: R.lerp(1, HEAD.s, pk) * (1 + bump) * (1 - out * 0.15), o: 1 - out });
      }

      // ── 4) Título ───────────────────────────────────────────────────────────
      R.reveal(title.parts, lt, { start: T.title, stagger: 0.07, dur: 0.7, y: 110, r: 5, out: { start: T.titleOut, y: -110, stagger: 0.04, dur: 0.32 } });

      // ── 5) Cards: entram na palavra, depois viram fileira ──────────────────
      const MORPH = E.bezier(0.6, 0, 0.2, 1);
      cards.forEach((cd, i) => {
        const { m, gx, gy, slot, ping, icon, tile, label, ok, shine, card, tag } = cd;
        // Lugar tracejado.
        const sk = R.p(lt, T.slots + i * 0.055, 0.45, E.snappy);
        const sOut = R.p(lt, m.pop + 0.08, 0.2, E.outQuad);
        R.tf(slot, { s: R.lerp(0.9, 1, sk), o: sk * (1 - sOut) });

        // Pop 0,6 → 1,08 → 1.
        const on = lt >= m.pop;
        card.style.opacity = on ? String(R.clamp((lt - m.pop) / 0.06)) : '0';
        const pop = R.kf(lt, [
          [m.pop, 0.6],
          [m.pop + 0.2, 1.08, E.outCubic],
          [m.pop + 0.5, 1, E.inOutQuad],
        ]);
        const rz = R.kf(lt, [
          [m.pop, (i % 2 ? 1 : -1) * 6],
          [m.pop + 0.45, 0, E.snappy],
        ]);
        // Brilho varrendo e o anel que sai do card.
        const sh = R.p(lt, m.pop + 0.12, 0.6, E.inOutCubic);
        shine.style.opacity = lt > m.pop + 0.12 && sh < 1 ? '1' : '0';
        shine.style.transform = `translateX(${R.lerp(-220, CW + 60, sh).toFixed(1)}px) skewX(-16deg)`;
        const pk = R.p(lt, m.pop + 0.14, 0.55, E.outCubic);
        R.tf(ping, { s: R.lerp(1, 1.14, pk), o: lt > m.pop + 0.14 ? (1 - pk) * 0.85 : 0 });
        if (lt > T.compact) ping.style.opacity = '0';

        // Compacta: cada card encolhe no lugar e desliza para a fileira. A
        // coluna da esquerda ocupa a metade esquerda da fileira e a da direita
        // a outra metade, então os caminhos nunca se cruzam.
        const col = i % 2;
        const rowI = Math.floor(i / 2);
        const slotI = col * 3 + rowI;
        const st = T.compact + rowI * 0.05 + col * 0.02;
        const mk = R.p(lt, st, 0.36, E.snappy); // tamanho
        const mv = R.p(lt, st + 0.06, 0.52, MORPH); // posição
        const tcx = TX0 + slotI * (TS + TG) + TS / 2;
        const tcy = TY + TS / 2;
        const float = Math.sin((lt - T.compact) * Math.PI + slotI * 0.9) * 4 * R.p(lt, T.compact + 0.8, 0.4);
        const cw = R.lerp(CW, TS, mk);
        const ch = R.lerp(CH, TS, mk);
        const ccx = R.lerp(gx + CW / 2, tcx, mv);
        const ccy = R.lerp(gy + CH / 2, tcy, mv) - Math.sin(mv * Math.PI) * 30;
        card.style.left = `${(ccx - cw / 2).toFixed(2)}px`;
        card.style.top = `${(ccy - ch / 2 + float).toFixed(2)}px`;
        card.style.width = `${cw.toFixed(2)}px`;
        card.style.height = `${ch.toFixed(2)}px`;
        card.style.borderRadius = `${R.lerp(32, 32, mk).toFixed(1)}px`;
        R.tf(card, { s: pop, r: rz });
        const ti = R.lerp(30, (TS - IT) / 2, mk);
        tile.style.left = `${ti.toFixed(2)}px`;
        tile.style.top = `${ti.toFixed(2)}px`;
        const lo = R.p(mk, 0, 0.3, E.linear);
        R.tf(label, { y: lo * 14, o: 1 - lo });
        const okK = R.sp(lt, m.at + 0.24, R.springs.bouncy);
        R.tf(ok, { s: okK * (1 - lo), o: R.clamp(okK * 3) * (1 - lo), r: (1 - R.clamp(okK)) * -60 });
        icon.update(lt, m.pop);

        // Etiqueta "até 12x" / "até 24x": gruda 0,3 s depois da palavra.
        if (tag) {
          const at = m.at + 0.3;
          if (!tag.ateW) tag.ateW = tag.ate.scrollWidth || 62;
          const k = R.sp(lt, at, R.springs.bouncy);
          tag.chip.style.opacity = lt >= at ? String(R.clamp((lt - at) / 0.06)) : '0';
          tag.chip.style.right = `${R.lerp(22, -20, mk).toFixed(2)}px`;
          tag.chip.style.top = `${R.lerp(26, -20, mk).toFixed(2)}px`;
          tag.chip.style.padding = `0 ${R.lerp(20, 14, mk).toFixed(1)}px`;
          tag.ate.style.width = `${(tag.ateW * (1 - mk)).toFixed(2)}px`;
          tag.ate.style.opacity = String(1 - R.p(mk, 0, 0.5, E.linear));
          R.tf(tag.chip, { s: R.lerp(1.9, 1, k) * R.lerp(1, 0.84, mk), r: R.lerp(-16, -5, k) * (1 - mk) + mk * -6 });
        }
      });
      // Brilho das etiquetas.
      cards.filter((cd) => cd.tag).forEach((cd, j) => {
        stickBursts[j].update(lt, cd.m.at + 0.33, cd.gx + CW - 100, cd.gy + 54, 0.6);
      });

      // ── 6) Alternador À vista | Parcelado ───────────────────────────────────
      const tgIn = R.sp(lt, T.aVista - 0.08, R.springs.snappy);
      const fcUnf = R.sp(lt, T.unfold, { k: 190, c: 19 });
      const tgVis = lt >= T.aVista - 0.08;
      toggle.style.visibility = tgVis ? 'visible' : 'hidden';
      // Antes do clique o alternador fica maior, no meio do espaço livre; no
      // "parcelado" ele sobe para o lugar e o card se desdobra embaixo dele.
      const rise = R.p(lt, T.parcelado + 0.04, 0.42, E.snappy);
      const tgY = (1 - rise) * TOG_STAGE.dy;
      const tgS = R.lerp(TOG_STAGE.s, 1, rise);
      const press = R.kf(lt, [[T.parcelado - 0.02, 1], [T.parcelado + 0.06, 0.97, E.outQuad], [T.parcelado + 0.3, 1, E.snappy]]);
      R.tf(toggle, { s: R.lerp(0.84, 1, tgIn) * press * tgS, o: R.clamp(tgIn * 2.5), y: (1 - tgIn) * 26 + tgY });
      for (const lay of [labUnder, labOver]) {
        R.reveal(lay.parts[0], lt, { start: T.aVista, stagger: 0.05, dur: 0.5, y: 110 });
        R.reveal(lay.parts[1], lt, { start: T.aVista + 0.08, stagger: 0.05, dur: 0.5, y: 110 });
      }
      const thIn = R.sp(lt, T.aVista + 0.06, R.springs.bouncy);
      const slide = R.p(lt, T.parcelado + 0.02, 0.36, E.snappy);
      const stretch = Math.sin(R.p(lt, T.parcelado + 0.02, 0.3, E.linear) * Math.PI) * 64;
      const thL = R.lerp(8, 8 + TWh, slide) - stretch * 0.5;
      const thW = TWh + stretch;
      thumb.style.left = `${thL.toFixed(2)}px`;
      thumb.style.width = `${thW.toFixed(2)}px`;
      const thS = R.lerp(0.6, 1, thIn);
      R.tf(thumb, { s: thS, o: R.clamp(thIn * 3) });
      // Recorte dos rótulos marinho = retângulo do seletor (com a escala da entrada).
      const cl = thL + (thW * (1 - thS)) / 2;
      const cw2 = thW * thS;
      const ci = 8 + (TH * (1 - thS)) / 2;
      labOver.layer.style.clipPath = `inset(${ci.toFixed(2)}px ${(TOG.w - cl - cw2).toFixed(2)}px ${ci.toFixed(2)}px ${cl.toFixed(2)}px round ${((TH / 2) * thS).toFixed(1)}px)`;
      labOver.layer.style.opacity = String(R.clamp(thIn * 3));
      tap.update(lt, T.parcelado, TOG.x + TOG.w / 2 + (TWh / 2) * tgS, TOG.y + TOG.h / 2 + tgY + 6);
      tap.el.style.opacity = String(1 - R.p(lt, T.parcelado + 0.16, 0.16, E.linear));

      // ── 7) Card "Entrada + parcelas" se desdobra ────────────────────────────
      fc.style.visibility = lt >= T.unfold ? 'visible' : 'hidden';
      R.tf(fc, { persp: 1700, rx: (1 - fcUnf) * -94, o: R.clamp(fcUnf * 7), y: (1 - R.clamp(fcUnf)) * -14 });
      R.reveal(fcHeadParts, lt, { start: T.unfold + 0.04, stagger: 0.05, dur: 0.5, y: 110 });
      const bk = R.sp(lt, T.unfold + 0.08, R.springs.snappy);
      R.tf(block, { x: (1 - bk) * -40, o: R.clamp(bk * 2.5) });
      const plk = R.p(lt, T.unfold + 0.12, 0.4, E.snappy);
      R.tf(pLabel, { y: (1 - plk) * 20, o: plk });
      R.tf(row, { o: R.p(lt, T.unfold + 0.12, 0.2) });
      // Contador: rola 1x → 12x e para em 6x.
      const idx = R.kf(lt, [
        [T.roll, 0],
        [T.roll + 0.24, 11, E.inOutQuad],
        [T.roll + 0.58, 5, E.snappy],
      ]);
      const vel = Math.abs(
        R.kf(lt + 0.01, [[T.roll, 0], [T.roll + 0.24, 11, E.inOutQuad], [T.roll + 0.58, 5, E.snappy]]) -
          R.kf(lt - 0.01, [[T.roll, 0], [T.roll + 0.24, 11, E.inOutQuad], [T.roll + 0.58, 5, E.snappy]]),
      ) / 0.02;
      strip.style.transform = `translate3d(0, ${((CNT.win - CNT.item) / 2 - idx * CNT.item).toFixed(2)}px, 0)`;
      strip.style.filter = vel > 4 ? `blur(${Math.min(2.4, vel * 0.04).toFixed(2)}px)` : 'none';
      const ck = R.sp(lt, T.unfold + 0.06, R.springs.bouncy);
      const cOut = R.p(lt, T.exit - 0.04, 0.16, E.inCubic);
      R.tf(counter, { s: R.lerp(0.6, 1, ck) * (1 - cOut * 0.5), o: R.clamp(ck * 3) * (1 - cOut) });
      const cnt = idx + 1;
      segs.forEach((d, i) => {
        const w = R.clamp(cnt - i, 0, 1);
        d.style.flex = `${w.toFixed(4)} 1 0px`;
        d.style.marginRight = i < 11 ? `${(10 * R.clamp(cnt - i - 1, 0, 1)).toFixed(2)}px` : '0px';
        d.style.opacity = String(R.clamp(w * 1.6));
      });
      // Anel: o trilho se desenha; na entrada paga enche 25%.
      const LC = 2 * Math.PI * RING.r;
      const tr = R.p(lt, T.unfold + 0.04, 0.5, E.inOutCubic);
      ringTrack.setAttribute('stroke-dasharray', `${(LC * tr).toFixed(2)} ${LC.toFixed(2)}`);
      const prog = 0.25 * R.p(lt, T.entrada + 0.04, 0.42, E.snappy);
      ringProg.setAttribute('stroke-dasharray', `${(LC * prog).toFixed(2)} ${LC.toFixed(2)}`);
      ringProg.style.opacity = prog > 0.002 ? '1' : '0';
      const ringOut = R.p(lt, T.exit, 0.2, E.outCubic);
      R.tf(ringSvg, { s: 1 + ringOut * 0.28, o: 1 - ringOut });
      // Estrela na ponta do anel.
      const ang = -Math.PI / 2 + prog * Math.PI * 2;
      const headX = RING.cx + Math.cos(ang) * RING.r;
      const headY = RING.cy + Math.sin(ang) * RING.r;
      const gl = R.p(lt, T.entrada + 0.06, 0.5, E.outCubic);
      R.tf(ringStar, { x: headX - 22, y: headY - 23, s: lt < T.entrada + 0.06 ? 0 : Math.sin(Math.min(1, gl * 1.15) * Math.PI) * 1.25 + 0.0, r: gl * 120, o: lt < T.entrada + 0.06 ? 0 : 1 - R.p(gl, 0.7, 0.3, E.linear) });
      ringBurst.update(lt, T.entrada + 0.3, RING.cx + Math.cos(-Math.PI / 2 + 0.5 * Math.PI) * RING.r, RING.cy, 0.6);
      // Entrada paga.
      const pd = R.sp(lt, T.entrada, R.springs.bouncy);
      paid.style.opacity = lt >= T.entrada ? String(R.clamp((lt - T.entrada) / 0.06)) : '0';
      R.tf(paid, { s: R.lerp(1.8, 1, pd), r: R.lerp(-14, -4, pd) });
      bBarFill.style.width = `${(122 * R.p(lt, T.entrada + 0.04, 0.4, E.snappy)).toFixed(1)}px`;

      // ── 8) Saída: a moeda sai do anel, o branco quente sobe ───────────────
      const pk = R.p(lt, T.exit, 0.32, E.inOutCubic);
      panel.style.display = lt >= T.exit ? 'block' : 'none';
      if (done) {
        panel.style.transform = 'none';
        panel.style.borderRadius = '0px';
      } else {
        panel.style.transform = `translate3d(0, ${(1920 * (1 - pk)).toFixed(2)}px, 0)`;
        const rad = R.lerp(140, 0, pk).toFixed(1);
        panel.style.borderRadius = `${rad}px ${rad}px 0 0`;
      }
      const born = T.exit - 0.02;
      if (lt < born) {
        coin.el.style.opacity = '0';
      } else if (done) {
        coin.el.style.opacity = '1';
        coin.el.style.transform = 'none';
      } else {
        // Centro do anel na tela (dentro do card, que está dentro da câmera).
        const [rx, ry] = camPt(lt, FC.x + RING.cx, FC.y + RING.cy);
        const em = R.sp(lt, born, R.springs.bouncy);
        const f = R.p(lt, T.exit + 0.06, T.settle - T.exit - 0.06, E.inOutCubic);
        const x = R.lerp(rx, COIN.cx, f);
        const y = R.lerp(ry, COIN.cy, f) - Math.sin(f * Math.PI) * 70;
        const sc = R.lerp(R.lerp(0.4, 1, em) * 1.06, 1, f);
        coin.el.style.opacity = String(R.clamp((lt - born) / 0.05));
        R.tf(coin.el, { x: x - COIN.cx, y: y - COIN.cy, s: sc, r: (1 - f) * -40 });
      }
    },
  });
})();
