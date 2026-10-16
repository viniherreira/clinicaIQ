/*
 * Cena "whatsapp" (global 10,5–17,0): o cartão da Mariana encolhe e voa para
 * dentro do celular, onde vira a mensagem de confirmação. Ela toca em
 * "Confirmar"; a câmera recua e o cartão da agenda vira "Confirmado" sozinho.
 *
 * Passagens: começa com B.handoff.patientCard({status: 'scheduled'}) e termina
 * com B.handoff.patientCard({status: 'confirmed'}), os dois sem transform,
 * sobre o branco quente.
 */
(() => {
  const { h } = R;
  const E = R.ease;
  const C = B.C;
  const TL = window.TIMELINE;
  const T0 = TL.whatsapp.start;
  const EV = TL.events;
  const L = (g) => g - T0; // global → local
  const VO = Object.fromEntries(TL.vo.map((v) => [v.id, { start: L(v.start), end: L(v.end) }]));

  // ── Tempos locais (todos derivados do TIMELINE) ─────────────────────────────
  const T = {
    msg: L(EV.msgArrives), // 0,70 — o balão cresce
    reminder: L(EV.reminder), // 1,90 — lembrete na véspera
    tap: L(EV.tapConfirm), // 3,90 — o dedo toca
    confirmed: L(EV.confirmed), // 4,00 — vira "Confirmado"
    knows: L(EV.agendaKnows), // 5,10 — a agenda já sabe
  };
  T.morphEnd = 0.46; // o cartão termina de virar balão
  T.title1 = T.msg + 0.1; // 11,3 "Confirmação automática"
  T.buttons = T.msg + 0.4; // 11,6 botões
  T.reminderOut = T.reminder + 0.82; // some ~13,4
  T.push = VO.p7.start - 0.1; // câmera se aproxima do botão
  T.pulse = T.knows + 0.02; // sinal viaja do celular até a agenda
  T.flip = T.knows + 0.3; // 15,9 o cartão vira
  T.title3 = T.knows + 0.4; // 16,0 "Recepção não digita nada"
  // Saída: tudo parado na geometria da passagem antes do último quadro.
  const DUR = TL.whatsapp.end - TL.whatsapp.start;
  T.exit = DUR - 0.5; // 6,0
  T.settle = DUR - 0.07; // 6,43

  // ── Geometria ───────────────────────────────────────────────────────────────
  const GREEN = '#2E9E6A'; // verde genérico de conversa (não é o da marca)
  const PW = 500;
  const PX = 290; // celular centralizado
  const PY = 540;
  const BZ = Math.round(PW * 0.035); // moldura (igual a B.phone)
  const BW = 404; // largura do balão cheio
  const TB = { w: 136, h: 76 }; // balão de "digitando"
  const BTN_H = 76;
  const CAM_O = { x: 540, y: 1290 }; // a câmera se aproxima dos botões
  const PG = B.handoff.PATIENT_CARD; // {x:100, y:850, w:880, h:220}
  const CARD_C = { x: PG.x + PG.w / 2, y: PG.y + PG.h / 2 };
  const PBACK = { cx: 300, cy: 948, s: 0.74 }; // celular depois do recuo
  const CBACK = { cx: 580, cy: 1362, s: 0.86 }; // cartão da agenda ao lado
  const LG_SHADOW = [
    [0, 30, 60, -20, 0.28],
    [0, 10, 24, -10, 0.14],
    [0, 0, 0, 1, 0.04],
  ];
  const BUBBLE_SHADOW = [
    [0, 1, 2, 0, 0.13],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 1, 0.03],
  ];
  const shadowAt = (k) =>
    LG_SHADOW.map((a, i) => {
      const b = BUBBLE_SHADOW[i];
      const v = a.map((x, j) => R.lerp(x, b[j], k));
      return `${v[0].toFixed(2)}px ${v[1].toFixed(2)}px ${v[2].toFixed(2)}px ${v[3].toFixed(2)}px rgba(11,31,63,${v[4].toFixed(3)})`;
    }).join(', ');

  const MESSAGE = [
    ['Olá,'], ['Mariana.'], ['Sua'], ['avaliação'], ['com'], ['a'], ['Dra. Paula'], ['é'],
    ['terça,', 1], ['às', 1], ['14:30.', 1], ['Podemos'], ['confirmar?'],
  ];

  // ── Ajudantes ──────────────────────────────────────────────────────────────
  const abs = (el, x, y, w, hh) => B.abs(el, x, y, w, hh);
  const center = (el) => {
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    return el;
  };
  /** Palavras em máscara (como R.split), com negrito por palavra. */
  function wordsInto(container, words) {
    const parts = [];
    words.forEach(([w, bold], i) => {
      const inner = h('span', { style: { display: 'inline-block', willChange: 'transform', fontWeight: bold ? '700' : 'inherit' } }, w);
      const wrap = h(
        'span',
        { style: { display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.2em', marginBottom: '-0.2em', paddingTop: '0.1em', marginTop: '-0.1em' } },
        inner,
      );
      container.appendChild(wrap);
      if (i < words.length - 1) container.appendChild(document.createTextNode(' '));
      parts.push(inner);
    });
    return parts;
  }
  /** Título cinético na faixa y 380–480. */
  function title(layer, text, { accent = [], size = 68 } = {}) {
    const hl = B.headline(text, { size, width: 960, color: C.navy, lh: 1.0 });
    abs(hl.el, 60, 384);
    hl.el.style.visibility = 'hidden';
    accent.forEach((i) => (hl.parts[i].style.color = C.teal700));
    layer.appendChild(hl.el);
    return hl;
  }
  /** Revela e esconde um título; fora da janela fica invisível (sem fiapos de acento). */
  function runTitle(hl, lt, start, outStart, { stagger = 0.06, outStagger = 0.035, outDur = 0.32 } = {}) {
    const n = hl.parts.length;
    const outEnd = outStart + (n - 1) * outStagger + outDur;
    const on = lt >= start && lt < outEnd;
    hl.el.style.visibility = on ? 'visible' : 'hidden';
    if (!on) return;
    R.reveal(hl.parts, lt, {
      start, stagger, dur: 0.75, y: 135, r: 4,
      out: { start: outStart, stagger: outStagger, dur: outDur, y: -150, ease: E.inCubic },
    });
  }
  /** Transform do celular (em torno do centro) aplicado num ponto local. */
  function phonePt(ps, lx, ly) {
    const dx = lx - PW / 2;
    const dy = ly - ps.ph / 2;
    const a = (ps.r * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: ps.cx + ps.x + ps.s * (dx * c - dy * s), y: ps.cy + ps.y + ps.s * (dx * s + dy * c) };
  }
  /** Câmera (escala em torno de CAM_O) aplicada num ponto. */
  const camPt = (cs, p) => ({ x: CAM_O.x + cs.s * (p.x - CAM_O.x), y: CAM_O.y + cs.s * (p.y - CAM_O.y) });

  R.scene({
    id: 'whatsapp',
    build(root, S) {
      root.style.background = C.warm;

      // ── Fundo: brilhos macios que só aparecem depois do primeiro quadro ──
      const glow = h('div', { style: { position: 'absolute', inset: 0, opacity: 0 } });
      const blobs = [
        { x: 560, y: 1080, r: 640, color: 'rgba(167,227,193,.42)' },
        { x: 170, y: 560, r: 520, color: 'rgba(20,184,166,.13)' },
        { x: 960, y: 1560, r: 560, color: 'rgba(15,59,130,.08)' },
      ].map((b) => {
        const d = h('div', {
          style: {
            position: 'absolute', left: `${b.x - b.r}px`, top: `${b.y - b.r}px`, width: `${b.r * 2}px`, height: `${b.r * 2}px`,
            borderRadius: '50%', background: `radial-gradient(circle, ${b.color} 0%, transparent 68%)`,
          },
        });
        glow.appendChild(d);
        return d;
      });
      root.appendChild(glow);

      // ── Câmera (celular, toque, lembrete, estrelas) ──
      const cam = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: `${CAM_O.x}px ${CAM_O.y}px` } });
      root.appendChild(cam);

      // Rótulo "WhatsApp" (só texto, sem logo).
      const waLabel = h(
        'div',
        { style: { position: 'absolute', left: 0, top: 0, display: 'flex', alignItems: 'center', gap: '12px', font: `600 28px/1 ${B.FONT}`, color: C.muted, letterSpacing: '-0.01em', whiteSpace: 'nowrap', opacity: 0 } },
        h('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: GREEN, flex: 'none' } }),
        h('span', { text: 'WhatsApp' }),
      );
      root.appendChild(waLabel);

      const phone = B.phone({ w: PW, dark: true, screenBg: C.waBg, time: '9:41' });
      abs(phone.el, PX, PY);
      phone.el.style.transformOrigin = '50% 50%';
      cam.appendChild(phone.el);
      const scr = phone.screen;
      const SW = PW - 2 * BZ;
      const SH = phone.h - 2 * BZ;
      // Barra de status legível (nada abaixo de 24 px).
      const status = scr.firstChild;
      status.style.fontSize = '24px';

      // Padrão sutil do fundo da conversa: rabiscos espalhados.
      const doodles = ['heart', 'star', 'smile', 'sun', 'music', 'coffee', 'camera', 'cloud', 'leaf', 'gift', 'flower-2', 'moon', 'umbrella', 'paw-print', 'cake', 'feather'];
      const pattern = h('div', { style: { position: 'absolute', inset: 0, opacity: 0.075 } });
      let n = 0;
      for (let row = 0; row < 12; row++) {
        for (let col = 0; col < 5; col++) {
          const jx = R.hash(n * 3.7 + 1) * 30 - 15;
          const jy = R.hash(n * 5.1 + 2) * 30 - 15;
          const ic = B.icon(doodles[Math.floor(R.hash(n * 9.3 + 4) * doodles.length)], { size: 34, color: '#5C4A32', sw: 1.8 });
          const w = h('div', { style: { position: 'absolute', left: `${col * 96 + (row % 2) * 48 + jx}px`, top: `${150 + row * 78 + jy}px`, transform: `rotate(${(R.hash(n * 2.9) * 60 - 30).toFixed(1)}deg)` } }, ic);
          pattern.appendChild(w);
          n++;
        }
      }
      scr.appendChild(pattern);

      // Cabeçalho da conversa.
      const statusText = h('div', { style: { font: `500 24px/1.1 ${B.FONT}`, color: 'rgba(255,255,255,.86)', marginTop: '4px', letterSpacing: '-0.01em' }, text: 'online' });
      const header = h(
        'div',
        { style: { position: 'absolute', left: 0, top: 0, width: `${SW}px`, height: '154px', background: GREEN, zIndex: 4, boxShadow: '0 2px 10px rgba(0,0,0,.08)' } },
        h(
          'div',
          { style: { position: 'absolute', left: '6px', right: '18px', top: '64px', height: '82px', display: 'flex', alignItems: 'center', gap: '10px' } },
          B.icon('chevron-left', { size: 40, color: '#fff', sw: 2.4 }),
          B.avatar('CA', { size: 64, bg: '#DDF3E7', fg: '#1E7A4F' }),
          h(
            'div',
            { style: { flex: '1', minWidth: 0, marginLeft: '4px' } },
            h('div', { style: { font: `650 29px/1.1 ${B.FONT}`, color: '#fff', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }, text: 'Clínica Aurora' }),
            statusText,
          ),
          B.icon('phone', { size: 30, color: '#fff', sw: 2.2 }),
          h('div', { style: { width: '14px' } }),
          B.icon('ellipsis-vertical', { size: 30, color: '#fff', sw: 2.4 }),
        ),
      );
      scr.appendChild(header);

      // Barra de digitar (embaixo).
      const CT = SH - 16 - 70;
      const composer = h(
        'div',
        { style: { position: 'absolute', left: '12px', top: `${CT}px`, width: `${SW - 24}px`, height: '70px', display: 'flex', gap: '10px' } },
        h(
          'div',
          { style: { flex: '1', height: '70px', borderRadius: '35px', background: '#fff', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 20px', boxShadow: '0 1px 2px rgba(11,31,63,.1)' } },
          B.icon('smile', { size: 30, color: C.muted2, sw: 2 }),
          h('div', { style: { flex: '1', font: `500 26px/1 ${B.FONT}`, color: C.muted2 }, text: 'Mensagem' }),
          B.icon('paperclip', { size: 28, color: C.muted2, sw: 2 }),
        ),
        center(h('div', { style: { width: '70px', height: '70px', borderRadius: '50%', background: GREEN, flex: 'none' } }, B.icon('mic', { size: 30, color: '#fff', sw: 2.2 }))),
      );
      scr.appendChild(composer);

      // Selo de data.
      const dayChip = center(h('div', { style: { position: 'absolute', left: '50%', height: '44px', padding: '0 18px', borderRadius: '14px', background: 'rgba(255,255,255,.94)', font: `600 24px/1 ${B.FONT}`, color: C.muted, transform: 'translateX(-50%)', boxShadow: '0 1px 2px rgba(11,31,63,.08)' }, text: 'Hoje' }));
      scr.appendChild(dayChip);

      // Balão recebido (cresce do canto): cauda + corpo + conteúdo de largura fixa.
      const tail = R.s('svg', { width: 14, height: 18, viewBox: '0 0 14 18', style: { position: 'absolute', left: '-11px', top: '0', display: 'block', overflow: 'visible' } }, R.s('path', { d: 'M14 0 H3 C0.5 0 -0.4 2.8 1.6 4.4 L14 15 Z', fill: '#fff' }));
      const msgText = h('div', { style: { font: `500 28px/1.32 ${B.FONT}`, color: C.ink, letterSpacing: '-0.012em' } });
      const words = wordsInto(msgText, MESSAGE);
      const msgTime = h('div', { style: { font: `500 24px/1 ${B.FONT}`, color: C.muted2, textAlign: 'right', marginTop: '6px' }, text: '9:41' });
      const content = h('div', { style: { position: 'absolute', left: 0, top: 0, width: `${BW}px`, padding: '16px 20px 12px 22px', boxSizing: 'border-box' } }, msgText, msgTime);
      const dots = [0, 1, 2].map(() => h('div', { style: { position: 'absolute', width: '14px', height: '14px', borderRadius: '50%', background: '#8E9AA3', marginLeft: '-7px', marginTop: '-7px' } }));
      const body = h(
        'div',
        { style: { position: 'absolute', left: 0, top: 0, width: `${TB.w}px`, height: `${TB.h}px`, background: '#fff', borderRadius: '6px 24px 24px 24px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(11,31,63,.13), 0 0 0 1px rgba(11,31,63,.03)' } },
        content,
        ...dots,
      );
      const bubble = h('div', { style: { position: 'absolute', left: '18px', top: '0', opacity: 0 } }, tail, body);
      scr.appendChild(bubble);

      // Botões em pílula.
      const ripple = h('div', { style: { position: 'absolute', width: '40px', height: '40px', marginLeft: '-20px', marginTop: '-20px', borderRadius: '50%', background: C.teal400, opacity: 0 } });
      const lab1 = center(h('div', { style: { position: 'absolute', inset: 0, font: `650 30px/1 ${B.FONT}`, color: '#fff', letterSpacing: '-0.015em' }, text: 'Confirmar' }));
      const check = B.icon('check', { size: 32, color: '#fff', sw: 3.2 });
      const lab2 = center(h('div', { style: { position: 'absolute', inset: 0, gap: '12px', font: `650 30px/1 ${B.FONT}`, color: '#fff', letterSpacing: '-0.015em', opacity: 0 } }, h('span', { text: 'Confirmado' }), check));
      const btnC = h('div', { style: { position: 'absolute', left: '18px', top: '0', width: `${BW}px`, height: `${BTN_H}px`, borderRadius: `${BTN_H / 2}px`, background: C.teal700, overflow: 'hidden', boxShadow: '0 10px 22px -10px rgba(15,118,110,.7)', opacity: 0, transformOrigin: '50% 50%' } }, ripple, lab1, lab2);
      const btnR = center(h('div', { style: { position: 'absolute', left: '18px', top: '0', width: `${BW}px`, height: `${BTN_H}px`, borderRadius: `${BTN_H / 2}px`, border: `3px solid ${C.teal700}`, background: 'rgba(255,255,255,.72)', font: `650 30px/1 ${B.FONT}`, color: C.teal700, letterSpacing: '-0.015em', opacity: 0, transformOrigin: '50% 50%' }, text: 'Reagendar' }));
      scr.appendChild(btnC);
      scr.appendChild(btnR);

      // Lembrete na véspera (chip menta com sininho).
      const bell = h('div', { style: { transformOrigin: '50% 12%', flex: 'none' } }, B.icon('bell', { size: 32, color: C.navy, sw: 2.4 }));
      const reminder = h(
        'div',
        {
          style: {
            position: 'absolute', left: '64px', top: '840px', height: '68px', padding: '0 28px 0 22px', borderRadius: '34px', background: C.mint,
            display: 'flex', alignItems: 'center', gap: '12px', font: `650 28px/1 ${B.FONT}`, color: C.navy, letterSpacing: '-0.015em', whiteSpace: 'nowrap',
            boxShadow: '0 18px 36px -14px rgba(11,31,63,.35), 0 2px 6px rgba(11,31,63,.08)', opacity: 0, transformOrigin: '0% 50%',
          },
        },
        bell,
        h('span', { text: 'Lembrete na véspera' }),
      );
      cam.appendChild(reminder);

      // Dedo + estrelas do "Confirmado".
      const tap = B.tap({ size: 92, color: 'rgba(15,59,130,.32)' });
      cam.appendChild(tap.el);
      const STAR_COLS = [C.teal, C.mint, C.teal300, C.teal, C.mint, C.teal300, C.teal, C.mint];
      const burst = STAR_COLS.map((col, i) => {
        const size = 22 + R.hash(i * 4.1 + 3) * 14;
        const w = h('div', { style: { position: 'absolute', left: `${-size / 2}px`, top: `${(-size * 148) / 140 / 2}px`, opacity: 0 } }, B.star({ size, color: col }));
        cam.appendChild(w);
        return w;
      });

      // ── Títulos (fora da câmera) ──
      const titles = h('div', { style: { position: 'absolute', inset: 0 } });
      root.appendChild(titles);
      const t1 = title(titles, 'Confirmação automática', { accent: [1] });
      const t2 = title(titles, 'Um toque. Confirmado.', { accent: [2] });
      const t3 = title(titles, 'Recepção não digita nada');
      // "nada" sublinhado em menta (marca-texto por trás das letras).
      const nada = t3.parts[3];
      nada.style.position = 'relative';
      const underline = h('span', { style: { position: 'absolute', left: '-0.04em', right: '-0.04em', bottom: '0.02em', height: '0.2em', borderRadius: '0.1em', background: C.mint, zIndex: '-1', transformOrigin: '0% 50%', transform: 'scaleX(0)' } });
      nada.appendChild(underline);

      // ── Agenda (cartão que vira "Confirmado") ──
      const agenda = h('div', { style: { position: 'absolute', inset: 0 } });
      root.appendChild(agenda);
      const pulseSvg = R.s('svg', { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: { position: 'absolute', left: 0, top: 0, overflow: 'visible' } });
      const pulsePath = R.s('path', { d: 'M0 0', fill: 'none', stroke: C.teal, 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0 });
      pulseSvg.appendChild(pulsePath);
      agenda.appendChild(pulseSvg);
      const agLabel = h(
        'div',
        { style: { position: 'absolute', left: 0, top: 0, display: 'flex', alignItems: 'center', gap: '10px', font: `600 28px/1 ${B.FONT}`, color: C.muted, letterSpacing: '-0.01em', whiteSpace: 'nowrap', opacity: 0 } },
        B.icon('calendar-days', { size: 30, color: C.teal700, sw: 2.2 }),
        h('span', { text: 'Agenda' }),
      );
      agenda.appendChild(agLabel);
      const cardB = B.handoff.patientCard({ status: 'confirmed' });
      cardB.el.style.visibility = 'hidden';
      agenda.appendChild(cardB.el);
      const badge = center(h('div', { style: { position: 'absolute', left: '-31px', top: '-31px', width: '62px', height: '62px', borderRadius: '50%', background: C.confirmed.dot, boxShadow: '0 10px 22px -8px rgba(16,185,129,.7), 0 0 0 5px #fff', opacity: 0 } }, B.icon('check', { size: 36, color: '#fff', sw: 3.4 })));
      agenda.appendChild(badge);
      const sparks = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const size = 20 + R.hash(i * 6.3 + 1) * 16;
        const w = h('div', { style: { position: 'absolute', left: `${-size / 2}px`, top: `${(-size * 148) / 140 / 2}px`, opacity: 0 } }, B.star({ size, color: i % 2 ? C.teal : C.teal300 }));
        agenda.appendChild(w);
        return w;
      });
      const head = h('div', { style: { position: 'absolute', left: '-17px', top: '-18px', opacity: 0 } }, B.star({ size: 34, color: C.teal, glow: 10 }));
      agenda.appendChild(head);

      // ── Passagem de entrada: o cartão Agendado e a "casca" que vira balão ──
      const morph = h('div', { style: { position: 'absolute', inset: 0 } });
      root.appendChild(morph);
      const shellDots = [0, 1, 2].map(() => h('div', { style: { position: 'absolute', borderRadius: '50%', background: '#8E9AA3' } }));
      const shell = h('div', { style: { position: 'absolute', background: '#fff', display: 'none', overflow: 'hidden' } }, ...shellDots);
      morph.appendChild(shell);
      const cardA = B.handoff.patientCard({ status: 'scheduled' });
      morph.appendChild(cardA.el);

      Object.assign(S, {
        glow, blobs, cam, waLabel, phone, statusText, dayChip, bubble, body, words, msgTime, dots, btnC, btnR, ripple, lab1, lab2, check,
        reminder, bell, tap, burst, t1, t2, t3, underline, agenda, pulsePath, agLabel, cardB, badge, sparks, head, shell, shellDots, cardA,
        CT, SH, cardAStyle: { background: cardA.el.style.background, boxShadow: cardA.el.style.boxShadow },
      });
    },

    update(lt, t, S) {
      if (!S.laid) layout(S);
      S.blobs.forEach((d, i) => R.tf(d, { x: R.noise(t * 0.15, i * 3.1 + 1) * 60, y: R.noise(t * 0.15, i * 5.7 + 2) * 80 }));
      S.glow.style.opacity = (R.p(lt, 0.05, 0.7, E.smooth) * (1 - R.p(lt, T.exit, 0.4, E.smooth))).toFixed(3);

      const cs = camState(lt);
      R.tf(S.cam, { s: cs.s });
      const ps = phoneState(lt, S);
      R.tf(S.phone.el, { x: ps.x, y: ps.y, r: ps.r, s: ps.s, o: ps.o });
      S.phone.el.style.visibility = ps.o > 0.001 && ps.x < 1000 ? 'visible' : 'hidden';

      updateMorph(lt, S, cs, ps);
      updateChat(lt, S);
      updateWaLabel(lt, S, cs, ps);
      updateReminder(lt, S);
      updateTap(lt, S, ps);

      runTitle(S.t1, lt, T.title1, T.confirmed - 0.02);
      runTitle(S.t2, lt, T.confirmed + 0.1, T.knows + 0.02);
      runTitle(S.t3, lt, T.title3, T.exit + 0.06, { stagger: 0.05, outStagger: 0.03, outDur: 0.29 });
      S.underline.style.transform = `scaleX(${R.p(lt, T.title3 + 0.38, 0.32, E.snappy).toFixed(4)})`;

      updateAgenda(lt, S, cs, ps);
    },
  });

  // ── Layout que depende de medida (fontes já carregadas) ─────────────────────
  function layout(S) {
    S.laid = true;
    S.H = Math.ceil(S.body.firstChild.offsetHeight); // altura do balão cheio
    // Conversa ancorada embaixo, como no app.
    S.R_TOP = S.CT - 22 - BTN_H;
    S.C_TOP = S.R_TOP - 12 - BTN_H;
    S.BT = S.C_TOP - 14 - S.H;
    S.btnC.style.top = `${S.C_TOP}px`;
    S.btnR.style.top = `${S.R_TOP}px`;
    S.bubble.style.top = `${S.BT}px`;
    S.dayChip.style.top = `${S.BT - 64}px`;
    // Chips do cartão da agenda (relativos ao cartão).
    const box = S.cardB.chips.confirmed.parentNode;
    const chip = S.cardB.chips.confirmed;
    S.chipC = { x: box.offsetLeft + chip.offsetLeft, y: box.offsetTop + chip.offsetTop, w: chip.offsetWidth, h: chip.offsetHeight };
    S.ready = true;
  }

  // ── Câmera e celular ────────────────────────────────────────────────────────
  function camState(lt) {
    const drift = R.lerp(1, 1.02, R.p(lt, 0, DUR, E.inOutSine));
    const push = R.p(lt, T.push, 0.8, E.smooth) * (1 - R.p(lt, T.knows, 0.5, E.swift));
    return { s: drift * (1 + 0.065 * push) };
  }
  function phoneState(lt, S) {
    const ph = S.phone.h;
    const kIn = R.sp(lt, 0, { k: 200, c: 22 });
    const rIn = R.sp(lt, 0, { k: 150, c: 16 });
    let x = (1 - kIn) * 1000;
    let y = (1 - kIn) * 60 + Math.sin(lt * 1.8) * 5 * R.p(lt, 0.4, 0.8);
    let r = (1 - rIn) * 6;
    // O lembrete encosta: o celular sente o toque.
    const bump = R.kf(lt, [[T.reminder + 0.14, 0], [T.reminder + 0.22, 1, E.outQuad], [T.reminder + 0.6, 0, E.smooth]]);
    x += bump * 8;
    r += bump * 0.8;
    // Recuo: desliza para a esquerda e encolhe.
    const kb = R.p(lt, T.knows, 0.5, E.swift);
    const nat = { cx: PX + PW / 2, cy: PY + ph / 2 };
    x = R.lerp(x, PBACK.cx - nat.cx, kb);
    y = R.lerp(y, PBACK.cy - nat.cy + Math.sin(lt * 1.8) * 4, kb);
    let s = R.lerp(1, PBACK.s, kb);
    // Saída para a esquerda.
    const ke = R.p(lt, T.exit - 0.05, 0.42, E.inCubic);
    x -= 560 * ke;
    s *= R.lerp(1, 0.86, ke);
    const o = 1 - R.p(lt, T.exit + 0.05, 0.3, E.inQuad);
    return { x, y, r, s, o, ph, cx: nat.cx, cy: nat.cy };
  }

  // ── 0–0,46 s: o cartão vira balão ───────────────────────────────────────────
  function updateMorph(lt, S, cs, ps) {
    const a = S.cardA.el;
    if (lt <= 0) {
      // Primeiro quadro: a peça de passagem intacta.
      a.style.display = '';
      a.style.transform = 'none';
      a.style.opacity = '';
      a.style.background = S.cardAStyle.background;
      a.style.boxShadow = S.cardAStyle.boxShadow;
      S.shell.style.display = 'none';
      return;
    }
    if (lt >= T.morphEnd) {
      a.style.display = 'none';
      S.shell.style.display = 'none';
      return;
    }
    const k = R.p(lt, 0, T.morphEnd, E.inOutCubic);
    const local = { x: BZ + 18 + TB.w / 2, y: BZ + S.BT + TB.h / 2 };
    const tg = camPt(cs, phonePt(ps, local.x, local.y));
    const sc = ps.s * cs.s;
    const cx = R.lerp(CARD_C.x, tg.x, k);
    const cy = R.lerp(CARD_C.y, tg.y, k) - Math.sin(Math.PI * k) * 46;
    const w = R.lerp(PG.w, TB.w * sc, k);
    const hh = R.lerp(PG.h, TB.h * sc, k);
    const rot = R.lerp(0, ps.r, k);
    const sh = S.shell;
    sh.style.display = 'block';
    sh.style.left = `${(cx - w / 2).toFixed(2)}px`;
    sh.style.top = `${(cy - hh / 2).toFixed(2)}px`;
    sh.style.width = `${w.toFixed(2)}px`;
    sh.style.height = `${hh.toFixed(2)}px`;
    const rr = (big, small) => `${R.lerp(big, small * sc, k).toFixed(2)}px`;
    sh.style.borderRadius = `${rr(44, 6)} ${rr(44, 24)} ${rr(44, 24)} ${rr(44, 24)}`;
    sh.style.boxShadow = shadowAt(k);
    sh.style.transform = `rotate(${rot.toFixed(3)}deg)`;
    // Pontinhos já quicando dentro da casca, iguais aos do balão.
    const dk = R.p(lt, 0.28, 0.16, E.outQuad);
    S.shellDots.forEach((d, i) => {
      const ds = 14 * sc * dk;
      const ox = w / 2 + (i - 1) * 24 * sc;
      const oy = hh / 2 + dotBounce(lt, i) * sc;
      Object.assign(d.style, { left: `${(ox - ds / 2).toFixed(2)}px`, top: `${(oy - ds / 2).toFixed(2)}px`, width: `${ds.toFixed(2)}px`, height: `${ds.toFixed(2)}px` });
    });
    // O conteúdo do cartão encolhe junto e some (crossfade com a casca).
    a.style.display = '';
    a.style.background = 'transparent';
    a.style.boxShadow = 'none';
    R.tf(a, { x: cx - CARD_C.x, y: cy - CARD_C.y, r: rot, s: hh / PG.h, o: 1 - R.p(lt, 0.02, 0.2, E.outQuad) });
  }
  const dotBounce = (lt, i) => -9 * Math.max(0, Math.sin((lt * 2.4 - i * 0.16) * Math.PI * 2));

  // ── Conversa: balão, botões, toque ─────────────────────────────────────────
  function updateChat(lt, S) {
    // Cabeçalho: "digitando…" enquanto a mensagem chega.
    const typing = lt >= 0.3 && lt < T.msg + 0.08;
    const label = typing ? 'digitando…' : 'online';
    if (S.statusText.textContent !== label) S.statusText.textContent = label;

    // Balão: aparece no lugar da casca e cresce a partir do canto.
    const show = lt >= T.morphEnd;
    S.bubble.style.opacity = show ? '1' : '0';
    const g = R.sp(lt, T.msg, { k: 230, c: 22 });
    S.body.style.width = `${R.lerp(TB.w, BW, g).toFixed(2)}px`;
    S.body.style.height = `${R.lerp(TB.h, S.H, g).toFixed(2)}px`;
    const dk = 1 - R.p(lt, T.msg, 0.14, E.outQuad);
    S.dots.forEach((d, i) => {
      d.style.left = `${TB.w / 2 + (i - 1) * 24}px`;
      d.style.top = `${TB.h / 2}px`;
      R.tf(d, { y: dotBounce(lt, i), s: dk, o: dk });
    });
    S.words.forEach((p, i) => {
      const k = R.p(lt, T.msg + 0.12 + i * 0.016, 0.55, E.snappy);
      p.style.transform = `translate3d(0, ${((1 - k) * 120).toFixed(2)}%, 0)`;
      p.style.opacity = k > 0 ? '1' : '0';
    });
    R.tf(S.msgTime, { o: R.p(lt, T.msg + 0.36, 0.3) });

    // Botões em cascata, com overshoot.
    const confirmedK = R.p(lt, T.confirmed + 0.05, 0.35, E.smooth);
    [S.btnC, S.btnR].forEach((b, i) => {
      const k = R.sp(lt, T.buttons + i * 0.08, R.springs.bouncy);
      let s = R.lerp(0.8, 1, k);
      let o = R.clamp(k * 2.5);
      if (i === 0) s *= pressScale(lt);
      if (i === 1) {
        o *= R.lerp(1, 0.4, confirmedK);
        s *= R.lerp(1, 0.97, confirmedK);
      }
      R.tf(b, { y: (1 - k) * 34, s, o });
    });
    // Onda teal a partir do toque e troca de rótulo.
    const rk = R.p(lt, T.tap, 0.55, E.outCubic);
    R.tf(S.ripple, { s: R.lerp(0.2, 13, rk), o: lt >= T.tap ? 0.55 * (1 - R.p(lt, T.tap + 0.12, 0.45, E.outQuad)) : 0 });
    S.ripple.style.left = `${BW / 2 + 34}px`;
    S.ripple.style.top = `${BTN_H / 2 + 6}px`;
    const out1 = R.p(lt, T.confirmed - 0.02, 0.2, E.inCubic);
    R.tf(S.lab1, { y: -out1 * 56, o: 1 - out1 });
    const in2 = R.sp(lt, T.confirmed + 0.04, R.springs.snappy);
    R.tf(S.lab2, { y: (1 - in2) * 56, o: R.clamp(in2 * 2) });
    if (!S.checkPath) S.checkPath = S.check.querySelector('path');
    R.draw(S.checkPath, R.p(lt, T.confirmed + 0.14, 0.3, E.outCubic));
  }
  function pressScale(lt) {
    if (lt < T.tap - 0.05) return 1;
    if (lt < T.confirmed) return R.lerp(1, 0.94, R.p(lt, T.tap - 0.05, 0.09, E.outQuad));
    return 0.94 + 0.06 * R.sp(lt, T.confirmed, R.springs.bouncy);
  }

  function updateWaLabel(lt, S, cs, ps) {
    const top = camPt(cs, phonePt(ps, PW / 2, 0));
    const o = Math.max(
      R.p(lt, 0.3, 0.4) * (1 - R.p(lt, T.push - 0.1, 0.3)),
      R.p(lt, T.knows + 0.2, 0.35) * (1 - R.p(lt, T.exit - 0.05, 0.25)),
    );
    const w = S.waLabel.offsetWidth;
    R.tf(S.waLabel, { x: top.x - w / 2, y: top.y - 50 + (1 - R.p(lt, 0.3, 0.5)) * 14, o: o * ps.o });
  }

  function updateReminder(lt, S) {
    const k = R.sp(lt, T.reminder, { k: 230, c: 19 });
    const ko = R.p(lt, T.reminderOut, 0.3, E.inCubic);
    const on = lt >= T.reminder && ko < 1;
    S.reminder.style.visibility = on ? 'visible' : 'hidden';
    if (!on) return;
    R.tf(S.reminder, { x: R.lerp(-520, 0, k) - 260 * ko, s: R.lerp(0.9, 1, k) * R.lerp(1, 0.9, ko), o: R.clamp(k * 3) * (1 - ko) });
    const b = lt - (T.reminder + 0.12);
    const swing = b > 0 ? 24 * Math.sin(b * Math.PI * 2 * 2.6) * Math.exp(-2.4 * b) : 0;
    R.tf(S.bell, { r: swing });
  }

  function updateTap(lt, S, ps) {
    const c = phonePt(ps, BZ + 18 + BW / 2 + 34, BZ + S.C_TOP + BTN_H / 2 + 6);
    const ap = R.p(lt, T.tap - 0.42, 0.4, E.snappy);
    S.tap.update(lt, T.tap, c.x + (1 - ap) * 80, c.y + (1 - ap) * 130);
    S.tap.el.style.visibility = lt > T.tap - 0.45 && lt < T.tap + 0.9 ? 'visible' : 'hidden';
    // Explosão de 8 estrelinhas a partir do botão.
    const bc = phonePt(ps, BZ + 18 + BW / 2, BZ + S.C_TOP + BTN_H / 2);
    S.burst.forEach((w, i) => {
      const k = R.p(lt, T.confirmed + 0.02 + R.hash(i * 1.3) * 0.05, 0.7, E.outCubic);
      const on = k > 0 && k < 1;
      w.style.visibility = on ? 'visible' : 'hidden';
      if (!on) return;
      const a = (i / 8) * Math.PI * 2 + 0.3 + R.hash(i * 2.2) * 0.35;
      const rx = R.lerp(190, 300 + R.hash(i * 7.7) * 40, k);
      const ry = R.lerp(30, 120 + R.hash(i * 8.8) * 30, k);
      const pop = Math.sin(Math.PI * Math.min(1, k * 1.15));
      R.tf(w, { x: bc.x + Math.cos(a) * rx, y: bc.y + Math.sin(a) * ry, s: pop, r: k * 140 * (i % 2 ? 1 : -1), o: R.clamp(pop * 1.6) });
    });
  }

  // ── 5,1 s em diante: a agenda já sabe ───────────────────────────────────────
  function updateAgenda(lt, S, cs, ps) {
    const c = S.cardB;
    const el = c.el;
    const visible = lt >= T.knows;
    el.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible) {
      S.agLabel.style.opacity = '0';
      S.badge.style.opacity = '0';
      S.pulsePath.setAttribute('opacity', '0');
      S.head.style.opacity = '0';
      S.sparks.forEach((w) => (w.style.visibility = 'hidden'));
      return;
    }
    // Entra pela direita, vira, depois vai para a geometria da passagem.
    const kc = R.sp(lt, T.knows, { k: 190, c: 21 });
    const km = R.p(lt, T.exit, T.settle - T.exit, E.swift);
    const cx = R.lerp(R.lerp(CBACK.cx + 780, CBACK.cx, kc), CARD_C.x, km);
    const cy = R.lerp(CBACK.cy + (1 - kc) * 40, CARD_C.y, km);
    const fk = R.p(lt, T.flip, 0.34, E.inOutCubic);
    const ang = 180 * fk;
    const flipped = ang >= 90;
    const s = R.lerp(CBACK.s, 1, km) * (1 + 0.06 * Math.sin(Math.PI * fk));
    const rz = (1 - kc) * -6;
    // Situação: Agendado até o meio do giro, depois Confirmado (estado original da peça).
    c.chips.scheduled.style.opacity = flipped ? '0' : '1';
    c.chips.confirmed.style.opacity = flipped ? '' : '0';
    if (lt >= T.settle) {
      el.style.transform = 'none';
    } else {
      R.tf(el, { persp: 1600, x: cx - CARD_C.x, y: cy - CARD_C.y, rx: flipped ? ang - 180 : ang, r: rz, s });
    }

    // Rótulo "Agenda" acima do cartão, à direita.
    const right = cx + (PG.w / 2) * s;
    const top = cy - (PG.h / 2) * s;
    const lw = S.agLabel.offsetWidth;
    R.tf(S.agLabel, { x: right - lw - 8, y: top - 50, o: R.p(lt, T.knows + 0.15, 0.3) * (1 - R.p(lt, T.exit - 0.05, 0.22)) });

    // Sinal: do botão "Confirmado" no celular até a situação no cartão.
    const a = camPt(cs, phonePt(ps, BZ + 18 + BW / 2, BZ + S.C_TOP + BTN_H / 2));
    const chipLocal = { x: S.chipC.x + 30, y: S.chipC.y + S.chipC.h / 2 };
    const b = { x: cx + (chipLocal.x - PG.w / 2) * s, y: cy + (chipLocal.y - PG.h / 2) * s };
    const ctl = { x: (a.x + b.x) / 2 + 60, y: Math.min(a.y, b.y) - 150 };
    const u = R.p(lt, T.pulse, T.flip - T.pulse, E.inOutCubic);
    const fade = 1 - R.p(lt, T.flip, 0.25, E.outQuad);
    const pp = S.pulsePath;
    pp.setAttribute('d', `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${ctl.x.toFixed(1)} ${ctl.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    const len = pp.getTotalLength();
    pp.style.strokeDasharray = `${len.toFixed(1)} ${len.toFixed(1)}`;
    pp.style.strokeDashoffset = (len * (1 - u)).toFixed(1);
    pp.setAttribute('opacity', (lt >= T.pulse ? 0.55 * fade : 0).toFixed(3));
    const q = (p0, p1, p2, v) => (1 - v) * (1 - v) * p0 + 2 * (1 - v) * v * p1 + v * v * p2;
    const hx = q(a.x, ctl.x, b.x, u);
    const hy = q(a.y, ctl.y, b.y, u);
    const headOn = lt >= T.pulse && lt < T.flip + 0.05;
    R.tf(S.head, { x: hx, y: hy, r: lt * 300, s: headOn ? 1 - 0.5 * R.p(lt, T.flip - 0.04, 0.08) : 0, o: headOn ? 1 : 0 });

    // Selo de check com faíscas: estoura na situação e é absorvido pelo ponto verde.
    const corner = { x: S.chipC.x + S.chipC.w - 8, y: S.chipC.y + 2 };
    const dot = { x: S.chipC.x + 20 + 6, y: S.chipC.y + S.chipC.h / 2 };
    const pop = R.sp(lt, T.flip + 0.22, R.springs.bouncy);
    const absorb = R.p(lt, T.exit - 0.02, 0.24, E.inCubic);
    const bl = { x: R.lerp(corner.x, dot.x, absorb), y: R.lerp(corner.y, dot.y, absorb) };
    const bx = cx + (bl.x - PG.w / 2) * s;
    const by = cy + (bl.y - PG.h / 2) * s;
    const bOn = lt >= T.flip + 0.22 && absorb < 1;
    R.tf(S.badge, { x: bx, y: by, s: bOn ? R.clamp(pop, 0, 1.4) * R.lerp(1, 0.2, absorb) * s : 0, r: (1 - R.clamp(pop)) * -40, o: bOn ? R.clamp(pop * 3) * (1 - absorb) : 0 });
    const cc = { x: cx + (corner.x - PG.w / 2) * s, y: cy + (corner.y - PG.h / 2) * s };
    S.sparks.forEach((w, i) => {
      const k = R.p(lt, T.flip + 0.22 + R.hash(i * 3.3) * 0.06, 0.6, E.outCubic);
      const on = k > 0 && k < 1;
      w.style.visibility = on ? 'visible' : 'hidden';
      if (!on) return;
      const ang2 = (i / 8) * Math.PI * 2 + R.hash(i * 5.5) * 0.4;
      const d = R.lerp(30, 120 + R.hash(i * 9.1) * 50, k);
      const p = Math.sin(Math.PI * Math.min(1, k * 1.1));
      R.tf(w, { x: cc.x + Math.cos(ang2) * d, y: cc.y + Math.sin(ang2) * d * 0.8, s: p, r: k * 160 * (i % 2 ? 1 : -1), o: R.clamp(p * 1.5) });
    });
  }
})();
