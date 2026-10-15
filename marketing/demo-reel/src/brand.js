/*
 * Marca e peças de interface desenhadas à mão (vetor/DOM), compartilhadas por
 * todas as cenas. Nada de print: cada cartão, chip, celular e ícone é montado
 * aqui a partir do zero.
 */
(() => {
  const { h, s } = R;
  const B = (window.B = {});

  // ── Cores (manual de marca + decisões de contraste do app) ──────────────────
  B.C = {
    teal: '#14B8A6', // logo, ícones e superfícies sem texto
    teal700: '#0F766E', // texto e botão sobre claro
    teal800: '#115E59',
    teal400: '#2DD4BF', // destaque sobre escuro
    teal300: '#5EEAD4',
    teal100: '#CCFBF1',
    teal50: '#F0FDFA',
    navy: '#0F3B82', // títulos e fundos fortes
    navy900: '#0A2552',
    navy950: '#061833',
    ink: '#0B1F3F', // texto principal (marinho bem escuro)
    mint: '#A7E3C1', // destaque, sempre com texto marinho por cima
    mint100: '#E3F6EA',
    warm: '#FAFAF8', // fundo branco quente
    warm100: '#F3F2EE',
    warm200: '#E8E6E0',
    warm300: '#D6D3CB',
    muted: '#6B675F', // texto secundário quente
    muted2: '#8F8B82',
    white: '#FFFFFF',
    // Situações do dia do paciente (mesmas famílias de cor do app).
    scheduled: { bg: '#F1F5F9', fg: '#334155', dot: '#94A3B8' },
    confirmed: { bg: '#D1FAE5', fg: '#064E3B', dot: '#10B981' },
    arrived: { bg: '#EDE9FE', fg: '#4C1D95', dot: '#8B5CF6' },
    inProgress: { bg: '#DBEAFE', fg: '#1E3A8A', dot: '#2563EB' },
    attended: { bg: '#E0F2FE', fg: '#0C4A6E', dot: '#0EA5E9' },
    missed: { bg: '#FEE2E2', fg: '#7F1D1D', dot: '#EF4444' },
    amber: '#F59E0B',
    whatsapp: '#25D366', // verde de conversa (sem desenhar a logo de ninguém)
    waBubble: '#D9FDD3',
    waBg: '#EFEAE2',
  };
  B.GRADIENT = `linear-gradient(135deg, ${B.C.teal700} 0%, ${B.C.navy} 100%)`;
  B.FONT = '"Inter", system-ui, sans-serif';
  B.DISPLAY = '"Inter Display", "Inter", system-ui, sans-serif';

  // ── Ícones (lucide, o mesmo conjunto do app) ────────────────────────────────
  /** B.icon('calendar-days', {size: 48, color: '#fff', sw: 2}) → <svg>. */
  B.icon = (name, { size = 40, color = 'currentColor', sw = 2, fill = 'none', style = {} } = {}) => {
    const inner = window.LUCIDE && window.LUCIDE[name];
    if (!inner) console.warn('ícone não encontrado:', name);
    const el = s('svg', {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill,
      stroke: color,
      'stroke-width': sw,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      style: { display: 'block', flex: 'none', overflow: 'visible', ...style },
    });
    el.innerHTML = inner || '';
    return el;
  };

  // ── Logo ──────────────────────────────────────────────────────────────────
  const SYMBOL_D =
    'M6 239V75.5C6 47 39 8 88 8H277C434.5 8 565.1 141 561 295C557 444.8 450 557 289 568L238 560C339 547 440.7 452 440 333C439.2 203 330.5 122 219 122C139.5 122 54 160 6 239Z';
  const SYMBOL_BODY =
    'M5 300C5 301 5 269.9 44.5 278C101.9 288.4 122.7 334.7 157 380C181.4 412.1 229.7 420.1 252 405.5C293.9 378 307 350.1 364 345C385.5 343.1 410.2 355.2 398 387C378.6 437.5 283.5 540.5 153 540.5H77C37.2 540.5 5 508.3 5 468.5Z';
  const SYMBOL_STAR =
    'M575 7.5C589 56 591 58 635.5 72C591 86 589 88 575 136.5C561 88 559 86 514.5 72C559 58 561 56 575 7.5Z';
  B.PATHS = { SYMBOL_D, SYMBOL_BODY, SYMBOL_STAR, HEAD: { cx: 227, cy: 269.5, r: 67.5 }, STAR_C: { x: 575, y: 72, r: 64.5 } };

  /**
   * Símbolo da logo em partes animáveis.
   * variant: 'color' (claro) | 'white' (sobre escuro/degradê).
   * Devolve { svg, d, body, head, star } — cada parte é um <g> com
   * transform-box: fill-box e origem no centro, prontos para R.tf.
   */
  B.symbol = ({ size = 400, variant = 'color' } = {}) => {
    const white = variant === 'white';
    const cD = white ? '#fff' : B.C.teal;
    const cBody = white ? '#fff' : B.C.navy;
    const cHead = white ? '#fff' : B.C.mint;
    const cStar = white ? '#fff' : B.C.teal;
    const part = (child) =>
      s('g', { style: { transformBox: 'fill-box', transformOrigin: 'center', willChange: 'transform' } }, child);
    const dPath = s('path', { d: SYMBOL_D, fill: cD });
    const bodyPath = s('path', { d: SYMBOL_BODY, fill: cBody });
    const headCircle = s('circle', { cx: 227, cy: 269.5, r: 67.5, fill: cHead });
    const starPath = s('path', { d: SYMBOL_STAR, fill: cStar, stroke: cStar, 'stroke-width': 10, 'stroke-linejoin': 'round' });
    const d = part(dPath);
    const body = part(bodyPath);
    const head = part(headCircle);
    const star = part(starPath);
    const svg = s(
      'svg',
      { viewBox: '-10 -10 660 590', width: size, height: (size * 590) / 660, style: { display: 'block', overflow: 'visible' } },
      d,
      body,
      head,
      star,
    );
    return { svg, d, body, head, star, paths: { d: dPath, body: bodyPath, head: headCircle, star: starPath } };
  };

  // Nome "Dreamclin" (Outfit 700 em contorno, igual ao app), letra por letra.
  const DREAM = [
    // D (contorno + miolo)
    'M35.3 0H6.8V-70.6H35.1Q43.1-70.6 49.85-68.05Q56.6-65.5 61.65-60.75Q66.7-56 69.45-49.55Q72.2-43.1 72.2-35.3Q72.2-27.6 69.45-21.1Q66.7-14.6 61.7-9.9Q56.7-5.2 49.95-2.6Q43.2 0 35.3 0ZM34.9-56.9H22.5V-13.8H34.9Q41.3-13.8 46.1-16.35Q50.9-18.9 53.5-23.8Q56.1-28.7 56.1-35.4Q56.1-42.1 53.45-46.9Q50.8-51.7 46.05-54.3Q41.3-56.9 34.9-56.9Z',
    // r
    'M96.1 0H80.8V-48.6H96.1V-44.9Q100.6-49.6 108.6-49.6Q112.1-49.6 114.75-48.55Q117.4-47.5 119.4-45.3L110.3-33.8Q109.3-34.9 107.8-35.5Q106.3-36.1 104.4-36.1Q100.6-36.1 98.35-33.75Q96.1-31.4 96.1-26.7V0Z',
    // e
    'M146.1 1.1Q138.2 1.1 132.05-2.15Q125.9-5.4 122.4-11.2Q118.9-17 118.9-24.3Q118.9-31.6 122.35-37.35Q125.8-43.1 131.7-46.4Q137.6-49.7 145-49.7Q152.2-49.7 157.7-46.6Q163.2-43.5 166.35-38Q169.5-32.5 169.5-25.4Q169.5-24.1 169.35-22.65Q169.2-21.2 168.8-19.3L134-19.2Q134.3-18.1 134.9-17.1Q136.4-14 139.25-12.35Q142.1-10.7 146-10.7Q149.6-10.7 152.5-11.95Q155.4-13.2 157.6-15.7L166-7.3Q162.4-3.1 157.3-1Q152.2 1.1 146.1 1.1ZM134-29.7L155.2-29.8Q154.9-31.2 154.4-32.4Q153.2-35.1 150.85-36.55Q148.5-38 145.1-38Q141.5-38 138.85-36.35Q136.2-34.7 134.8-31.7Q134.3-30.8 134-29.7Z',
    // a
    'M197.2 1Q190.5 1 185.25-2.3Q180-5.6 176.95-11.3Q173.9-17 173.9-24.3Q173.9-31.6 176.95-37.3Q180-43 185.25-46.3Q190.5-49.6 197.2-49.6Q202.1-49.6 206.1-47.7Q208.6-46.5 210.6-44.6V-48.6H225.6V0H210.6V-3.9Q208.7-2.1 206.1-0.9Q202.1 1 197.2 1ZM200.3-12.8Q205.2-12.8 208.2-16.05Q211.2-19.3 211.2-24.3Q211.2-27.7 209.85-30.3Q208.5-32.9 206.05-34.35Q203.6-35.8 200.4-35.8Q197.2-35.8 194.75-34.35Q192.3-32.9 190.85-30.3Q189.4-27.7 189.4-24.3Q189.4-21 190.8-18.4Q192.2-15.8 194.7-14.3Q197.2-12.8 200.3-12.8Z',
    // m
    'M251.7 0H236.4V-48.6H251.7V-45Q253.2-46.4 255.1-47.4Q259.4-49.6 264.8-49.6Q269.9-49.6 274-47.3Q276.9-45.6 279-43Q281.2-45.5 284.3-47.2Q288.8-49.6 294.5-49.6Q300.1-49.6 304.45-47.25Q308.8-44.9 311.35-40.55Q313.9-36.2 313.9-30.1V0H298.6V-28.4Q298.6-32.1 296.35-34.15Q294.1-36.2 290.8-36.2Q288.5-36.2 286.7-35.25Q284.9-34.3 283.85-32.6Q282.8-30.9 282.8-28.4V0H267.5V-28.4Q267.5-32.1 265.25-34.15Q263-36.2 259.7-36.2Q257.4-36.2 255.6-35.25Q253.8-34.3 252.75-32.6Q251.7-30.9 251.7-28.4V0Z',
  ];
  const CLIN = [
    'M347.2 1.1Q339.7 1.1 333.6-2.2Q327.5-5.5 324-11.3Q320.5-17.1 320.5-24.3Q320.5-31.6 324.05-37.35Q327.6-43.1 333.7-46.4Q339.8-49.7 347.4-49.7Q353.1-49.7 357.85-47.75Q362.6-45.8 366.3-41.9L356.5-32.1Q354.8-34 352.55-34.9Q350.3-35.8 347.4-35.8Q344.1-35.8 341.55-34.35Q339-32.9 337.55-30.35Q336.1-27.8 336.1-24.4Q336.1-21 337.55-18.4Q339-15.8 341.6-14.3Q344.2-12.8 347.4-12.8Q350.4-12.8 352.75-13.85Q355.1-14.9 356.8-16.8L366.5-7Q362.7-3 357.9-0.95Q353.1 1.1 347.2 1.1Z',
    'M388.6 0H373.3V-72.6H388.6V0Z',
    'M414.7 0H399.4V-48.6H414.7V0ZM407.1-55.3Q403.5-55.3 401.15-57.75Q398.8-60.2 398.8-63.7Q398.8-67.3 401.15-69.7Q403.5-72.1 407.1-72.1Q410.7-72.1 413-69.7Q415.3-67.3 415.3-63.7Q415.3-60.2 413-57.75Q410.7-55.3 407.1-55.3Z',
    'M472.9 0H457.6V-27.7Q457.6-31.5 455.25-33.85Q452.9-36.2 449.3-36.2Q446.8-36.2 444.9-35.15Q443-34.1 441.9-32.15Q440.8-30.2 440.8-27.7V0H425.5V-48.6H440.8V-44.8Q442.4-46.2 444.4-47.3Q448.8-49.6 454.4-49.6Q459.8-49.6 463.95-47.05Q468.1-44.5 470.5-40.3Q472.9-36.1 472.9-31.1V0Z',
  ];
  /**
   * Nome "Dreamclin" com cada letra num <g> animável (9 letras).
   * width = largura em px. variant 'color' (Dream marinho + clin teal) | 'white'.
   */
  B.wordmark = ({ width = 600, variant = 'color' } = {}) => {
    const white = variant === 'white';
    const letters = [];
    const mk = (d, fill) => {
      const g = s('g', { style: { transformBox: 'fill-box', transformOrigin: '50% 100%', willChange: 'transform' } }, s('path', { d, fill }));
      letters.push(g);
      return g;
    };
    const vbW = 466.1 + 8;
    const vbH = 73.7 + 24;
    const svg = s(
      'svg',
      { viewBox: `2.8 -84.6 ${vbW} ${vbH}`, width, height: (width * vbH) / vbW, style: { display: 'block', overflow: 'visible' } },
      ...DREAM.map((d) => mk(d, white ? '#fff' : B.C.navy)),
      ...CLIN.map((d) => mk(d, white ? '#fff' : B.C.teal)),
    );
    return { svg, letters };
  };

  /** Estrela de 4 pontas da logo, sozinha (motivo de transição/brilho). */
  B.star = ({ size = 60, color = B.C.teal, glow = 0 } = {}) => {
    const el = s(
      'svg',
      {
        viewBox: '505 -2 140 148',
        width: size,
        height: (size * 148) / 140,
        style: { display: 'block', overflow: 'visible', filter: glow ? `drop-shadow(0 0 ${glow}px ${color})` : 'none' },
      },
      s('path', { d: SYMBOL_STAR, fill: color, stroke: color, 'stroke-width': 10, 'stroke-linejoin': 'round' }),
    );
    return el;
  };

  // ── Peças de interface ────────────────────────────────────────────────────
  /** Posiciona absoluto: B.abs(el, x, y, w?, h?). */
  B.abs = (el, x, y, w, h2) => {
    Object.assign(el.style, { position: 'absolute', left: `${x}px`, top: `${y}px` });
    if (w != null) el.style.width = `${w}px`;
    if (h2 != null) el.style.height = `${h2}px`;
    return el;
  };
  /** Cartão branco com sombra macia. */
  B.card = ({ w, h: hh, r = 36, pad = 0, bg = '#fff', shadow = 'lg', style = {} } = {}, ...children) => {
    const shadows = {
      none: 'none',
      sm: '0 2px 6px rgba(11,31,63,.06), 0 1px 2px rgba(11,31,63,.05)',
      md: '0 10px 30px -8px rgba(11,31,63,.18), 0 2px 6px rgba(11,31,63,.06)',
      lg: '0 30px 60px -20px rgba(11,31,63,.28), 0 10px 24px -10px rgba(11,31,63,.14), 0 0 0 1px rgba(11,31,63,.04)',
      xl: '0 50px 100px -30px rgba(6,24,51,.45), 0 18px 36px -18px rgba(6,24,51,.3), 0 0 0 1px rgba(11,31,63,.05)',
    };
    return h(
      'div',
      {
        style: {
          position: 'absolute',
          width: w != null ? `${w}px` : undefined,
          height: hh != null ? `${hh}px` : undefined,
          borderRadius: `${r}px`,
          background: bg,
          boxShadow: shadows[shadow] || shadow,
          padding: `${pad}px`,
          boxSizing: 'border-box',
          willChange: 'transform',
          ...style,
        },
      },
      ...children,
    );
  };
  /** Chip arredondado com ícone opcional. */
  B.chip = (text, { bg = B.C.teal100, fg = B.C.teal800, icon, size = 30, pad = 18, weight = 600, dot, style = {} } = {}) =>
    h(
      'div',
      {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: `${Math.round(size * 0.35)}px`,
          height: `${Math.round(size * 1.9)}px`,
          padding: `0 ${pad}px`,
          borderRadius: '999px',
          background: bg,
          color: fg,
          font: `${weight} ${size}px ${B.FONT}`,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
          willChange: 'transform',
          ...style,
        },
      },
      dot ? h('span', { style: { width: `${size * 0.42}px`, height: `${size * 0.42}px`, borderRadius: '50%', background: dot, flex: 'none' } }) : null,
      icon ? B.icon(icon, { size: Math.round(size * 1.05), color: fg, sw: 2.4 }) : null,
      h('span', { text }),
    );
  /** Avatar redondo com iniciais. */
  B.avatar = (initials, { size = 72, bg = B.C.mint, fg = B.C.navy } = {}) =>
    h(
      'div',
      {
        style: {
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          background: bg,
          color: fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          font: `700 ${Math.round(size * 0.38)}px ${B.FONT}`,
          letterSpacing: '-0.02em',
          flex: 'none',
        },
      },
      initials,
    );
  /** Texto posicionado: B.text('Olá', {size, weight, color, family, ls, lh}). */
  B.text = (text, { size = 40, weight = 600, color = B.C.ink, family = B.FONT, ls = '-0.02em', lh = 1.1, align = 'left', style = {} } = {}) =>
    h(
      'div',
      {
        style: {
          font: `${weight} ${size}px/${lh} ${family}`,
          color,
          letterSpacing: ls,
          textAlign: align,
          whiteSpace: 'pre-line',
          fontFeatureSettings: '"tnum" 1, "cv11" 1',
          ...style,
        },
      },
      text,
    );
  /** Título grande para revelar por palavra com R.split/R.reveal. */
  B.headline = (text, { size = 120, weight = 800, color = B.C.navy, lh = 1.0, ls = '-0.045em', align = 'center', width = 920, by = 'word' } = {}) => {
    const el = h('div', {
      style: {
        font: `${weight} ${size}px/${lh} ${B.DISPLAY}`,
        color,
        letterSpacing: ls,
        textAlign: align,
        width: `${width}px`,
        textWrap: 'balance',
      },
    });
    const parts = R.split(el, text, { by });
    return { el, parts };
  };

  /**
   * Celular desenhado (moldura, ilha, barra de status). Devolve { el, screen }.
   * w = largura total; o conteúdo vai em `screen` (posição relativa).
   */
  B.phone = ({ w = 620, screenBg = '#fff', dark = false, time = '9:41' } = {}) => {
    const hh = Math.round(w * 2.05);
    const bezel = Math.round(w * 0.035);
    const r = Math.round(w * 0.15);
    const screen = h('div', {
      style: {
        position: 'absolute',
        left: `${bezel}px`,
        top: `${bezel}px`,
        right: `${bezel}px`,
        bottom: `${bezel}px`,
        borderRadius: `${r - bezel}px`,
        background: screenBg,
        overflow: 'hidden',
      },
    });
    const fg = dark ? '#fff' : B.C.ink;
    const status = h(
      'div',
      {
        style: {
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: `${Math.round(w * 0.11)}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${Math.round(w * 0.085)}px`,
          font: `600 ${Math.round(w * 0.04)}px ${B.FONT}`,
          color: fg,
          zIndex: 5,
          boxSizing: 'border-box',
        },
      },
      h('span', { text: time }),
      h(
        'span',
        { style: { display: 'flex', gap: `${Math.round(w * 0.012)}px`, alignItems: 'center' } },
        B.icon('signal', { size: Math.round(w * 0.04), color: fg, sw: 2.6 }),
        B.icon('wifi', { size: Math.round(w * 0.04), color: fg, sw: 2.6 }),
        B.icon('battery-full', { size: Math.round(w * 0.05), color: fg, sw: 2 }),
      ),
    );
    const island = h('div', {
      style: {
        position: 'absolute',
        left: '50%',
        top: `${Math.round(w * 0.028)}px`,
        width: `${Math.round(w * 0.3)}px`,
        height: `${Math.round(w * 0.075)}px`,
        transform: 'translateX(-50%)',
        borderRadius: '999px',
        background: '#05070A',
        zIndex: 6,
      },
    });
    screen.appendChild(status);
    const el = h(
      'div',
      {
        style: {
          position: 'absolute',
          width: `${w}px`,
          height: `${hh}px`,
          borderRadius: `${r}px`,
          background: 'linear-gradient(160deg, #2A3342 0%, #0E131B 45%, #1C2430 100%)',
          boxShadow:
            '0 80px 120px -40px rgba(6,24,51,.55), 0 30px 60px -30px rgba(6,24,51,.45), inset 0 0 0 2px rgba(255,255,255,.08), inset 0 0 0 6px #0B0F15',
          willChange: 'transform',
        },
      },
      screen,
      island,
    );
    return { el, screen, w, h: hh, statusH: Math.round(w * 0.11) };
  };

  /** Toque na tela: bolinha + onda. Chame update(t) com o tempo local. */
  B.tap = ({ size = 90, color = 'rgba(15,59,130,.35)' } = {}) => {
    const dot = h('div', {
      style: {
        position: 'absolute',
        width: `${size}px`,
        height: `${size}px`,
        marginLeft: `${-size / 2}px`,
        marginTop: `${-size / 2}px`,
        borderRadius: '50%',
        background: color,
        border: '3px solid rgba(255,255,255,.9)',
        boxShadow: '0 8px 24px rgba(6,24,51,.25)',
        boxSizing: 'border-box',
        zIndex: 50,
      },
    });
    const ring = h('div', {
      style: {
        position: 'absolute',
        width: `${size}px`,
        height: `${size}px`,
        marginLeft: `${-size / 2}px`,
        marginTop: `${-size / 2}px`,
        borderRadius: '50%',
        border: `4px solid ${color}`,
        boxSizing: 'border-box',
        zIndex: 49,
      },
    });
    const el = h('div', { style: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 } }, ring, dot);
    /** lt = tempo local; at = instante do toque; x,y onde tocar. */
    const update = (lt, at, x, y) => {
      el.style.transform = `translate(${x}px, ${y}px)`;
      const appear = R.p(lt, at - 0.35, 0.3, R.ease.snappy);
      const press = R.kf(lt, [[at - 0.05, 1], [at + 0.05, 0.78, R.ease.outQuad], [at + 0.3, 1, R.ease.snappy]]);
      const leave = R.p(lt, at + 0.45, 0.3, R.ease.inCubic);
      R.tf(dot, { s: press * R.lerp(0.6, 1, appear), o: appear * (1 - leave) });
      const k = R.p(lt, at, 0.6, R.ease.outCubic);
      R.tf(ring, { s: 1 + k * 1.6, o: lt >= at ? (1 - k) * 0.9 : 0 });
    };
    return { el, update };
  };

  /**
   * Fundo vivo: manchas de luz (radial-gradient) que derivam devagar.
   * blobs: [{x, y, r, color, sx?, sy?, speed?}] em px do quadro.
   */
  B.mesh = ({ base = B.C.warm, blobs = [] } = {}) => {
    const el = h('div', { style: { position: 'absolute', inset: 0, background: base, overflow: 'hidden' } });
    const items = blobs.map((b) => {
      const d = h('div', {
        style: {
          position: 'absolute',
          left: `${b.x - b.r}px`,
          top: `${b.y - b.r}px`,
          width: `${b.r * 2}px`,
          height: `${b.r * 2}px`,
          borderRadius: '50%',
          background: `radial-gradient(circle at 50% 50%, ${b.color} 0%, transparent 68%)`,
          opacity: b.o ?? 1,
          willChange: 'transform',
        },
      });
      el.appendChild(d);
      return { d, b };
    });
    const update = (t) => {
      items.forEach(({ d, b }, i) => {
        const sp = b.speed ?? 0.12;
        const x = R.noise(t * sp, i * 3.1 + 1) * (b.sx ?? 90);
        const y = R.noise(t * sp, i * 5.7 + 2) * (b.sy ?? 120);
        R.tf(d, { x, y, s: 1 + R.noise(t * sp * 0.7, i + 9) * 0.08 });
      });
    };
    return { el, update };
  };

  /** Grade de pontos discreta (textura de fundo "de produto"). */
  B.dots = ({ color = 'rgba(15,59,130,.10)', gap = 36, size = 2.2 } = {}) =>
    h('div', {
      style: {
        position: 'absolute',
        inset: '-40px',
        backgroundImage: `radial-gradient(circle at ${size}px ${size}px, ${color} ${size}px, transparent 0)`,
        backgroundSize: `${gap}px ${gap}px`,
      },
    });

  /** Partículas de estrelinhas (brilho da marca). Devolve { el, update(t) }. */
  B.sparkles = ({ n = 14, area = [0, 0, 1080, 1920], color = B.C.teal300, min = 10, max = 26, seed = 1 } = {}) => {
    const el = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } });
    const items = [];
    for (let i = 0; i < n; i++) {
      const r1 = R.hash(i * 13.1 + seed * 7);
      const r2 = R.hash(i * 7.7 + seed * 3);
      const r3 = R.hash(i * 3.3 + seed * 11);
      const size = R.lerp(min, max, r3);
      const st = B.star({ size, color });
      const wrap = h('div', { style: { position: 'absolute', left: `${area[0] + r1 * area[2]}px`, top: `${area[1] + r2 * area[3]}px` } }, st);
      el.appendChild(wrap);
      items.push({ wrap, r1, r2, r3, i });
    }
    const update = (t, k = 1) => {
      items.forEach(({ wrap, r1, r2, r3, i }) => {
        const period = 2.2 + r1 * 2.4;
        const ph = ((t + r2 * period) % period) / period;
        const tw = Math.sin(ph * Math.PI);
        R.tf(wrap, { s: tw * k, r: ph * 90 * (r3 > 0.5 ? 1 : -1), o: tw * k, y: -ph * 30 });
      });
    };
    return { el, update };
  };

  // ── Transições entre cenas ────────────────────────────────────────────────
  /**
   * Revela uma cena com uma estrela da marca que cresce até cobrir a tela.
   * Aplique no root da cena que ENTRA: B.starWipe(root, k, cx, cy).
   * k = 0 (nada) → 1 (tela toda).
   */
  B.starWipe = (root, k, cx = 540, cy = 960, rot = 0) => {
    if (k >= 1) {
      root.style.clipPath = 'none';
      return;
    }
    const r = R.lerp(0, 2600, k);
    root.style.clipPath = `path('${R.starPath(cx, cy, r, R.lerp(0.18, 0.7, k), rot)}')`;
  };
  /** Revela por círculo. */
  B.circleWipe = (root, k, cx = 540, cy = 960) => {
    if (k >= 1) {
      root.style.clipPath = 'none';
      return;
    }
    root.style.clipPath = `circle(${(k * 2300).toFixed(1)}px at ${cx}px ${cy}px)`;
  };
  /** Revela de baixo para cima com borda arredondada (cortina). */
  B.riseWipe = (root, k) => {
    if (k >= 1) {
      root.style.clipPath = 'none';
      return;
    }
    const top = R.lerp(1920, 0, k);
    root.style.clipPath = `inset(${top.toFixed(1)}px 0 0 0 round ${R.lerp(120, 0, k).toFixed(1)}px ${R.lerp(120, 0, k).toFixed(1)}px 0 0)`;
  };
})();

// ── Peças de passagem entre cenas (match cuts) ───────────────────────────────
// Cada uma aparece IDÊNTICA no último quadro de uma cena e no primeiro da
// seguinte, na posição fixa indicada. A cena que sai termina com a peça
// exatamente ali (sem transform); a que entra começa com ela ali e a anima.
(() => {
  const { h } = R;
  const C = B.C;

  /** Ícone de dente (molar), desenhado à mão, traço como os ícones lucide. */
  B.tooth = ({ size = 40, color = C.teal700, sw = 2, fill = 'none' } = {}) => {
    const el = R.s('svg', {
      viewBox: '0 0 24 24', width: size, height: size, fill, stroke: color, 'stroke-width': sw,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: { display: 'block', flex: 'none', overflow: 'visible' },
    });
    el.innerHTML =
      '<path d="M7 3C4.8 3 3 4.8 3 7.3c0 2 .7 3.2 1.3 4.6.6 1.5.7 3 1 4.8.3 2.2.8 4.3 2.2 4.3 1.6 0 1.6-3.2 2.2-5 .3-.8.7-1.3 1.3-1.3s1 .5 1.3 1.3c.6 1.8.6 5 2.2 5 1.4 0 1.9-2.1 2.2-4.3.3-1.8.4-3.3 1-4.8.6-1.4 1.3-2.6 1.3-4.6C21 4.8 19.2 3 17 3c-1.9 0-2.9 1-5 1S8.9 3 7 3z"/>';
    return el;
  };

  B.handoff = {};

  /** Cartão da Mariana: agenda → WhatsApp (Agendado) e WhatsApp → atendimento (Confirmado). */
  B.handoff.PATIENT_CARD = { x: 100, y: 850, w: 880, h: 220 };
  B.handoff.patientCard = ({ status = 'scheduled' } = {}) => {
    const g = B.handoff.PATIENT_CARD;
    const st = { scheduled: ['Agendado', C.scheduled], confirmed: ['Confirmado', C.confirmed] };
    const chipBox = h('div', { style: { position: 'relative', flex: 'none', width: '232px', display: 'flex', justifyContent: 'flex-end' } });
    const chips = {};
    for (const [k, [label, col]] of Object.entries(st)) {
      const c = B.chip(label, { bg: col.bg, fg: col.fg, dot: col.dot, size: 28, pad: 20 });
      if (k !== status) Object.assign(c.style, { position: 'absolute', right: '0', top: '0', opacity: '0' });
      chips[k] = c;
      chipBox.appendChild(c);
    }
    const el = B.card(
      { w: g.w, h: g.h, r: 44, shadow: 'lg', style: { left: `${g.x}px`, top: `${g.y}px`, display: 'flex', alignItems: 'center', gap: '28px', padding: '0 40px' } },
      B.avatar('MC', { size: 104, bg: C.mint, fg: C.navy }),
      h(
        'div',
        { style: { flex: '1', minWidth: '0', whiteSpace: 'nowrap' } },
        B.text('Mariana Costa', { size: 44, weight: 700, color: C.ink, ls: '-0.025em', style: { whiteSpace: 'nowrap' } }),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' } },
          B.icon('clock', { size: 30, color: C.muted, sw: 2.2 }),
          B.text('Ter · 14:30 · Avaliação', { size: 30, weight: 500, color: C.muted, ls: '-0.01em', style: { whiteSpace: 'nowrap' } }),
        ),
      ),
      chipBox,
    );
    el.style.transformOrigin = '50% 50%';
    return { el, chips, geom: g };
  };

  /** Dois dentes tratados: atendimento → orçamento. Pílulas empilhadas no centro. */
  B.handoff.TOOTH_CHIPS = [
    { x: 260, y: 852, w: 560, h: 104 },
    { x: 260, y: 980, w: 560, h: 104 },
  ];
  B.handoff.toothChips = () =>
    B.handoff.TOOTH_CHIPS.map((g, i) => {
      const el = B.card(
        { w: g.w, h: g.h, r: 52, shadow: 'md', style: { left: `${g.x}px`, top: `${g.y}px`, display: 'flex', alignItems: 'center', gap: '22px', padding: '0 28px 0 18px' } },
        h('div', { style: { width: '72px', height: '72px', borderRadius: '50%', background: C.teal100, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' } }, B.tooth({ size: 40, color: C.teal700, sw: 2.2 })),
        B.text(i === 0 ? '16 · Restauração' : '26 · Restauração', { size: 38, weight: 650, color: C.ink, ls: '-0.02em' }),
      );
      el.style.transformOrigin = '50% 50%';
      return { el, geom: g };
    });

  /** Pílula "Orçamento aceito": orçamento → pagamento. */
  B.handoff.ACCEPTED_PILL = { x: 230, y: 894, w: 620, h: 132 };
  B.handoff.acceptedPill = () => {
    const g = B.handoff.ACCEPTED_PILL;
    const el = B.card(
      { w: g.w, h: g.h, r: 66, bg: C.mint, shadow: 'md', style: { left: `${g.x}px`, top: `${g.y}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '18px' } },
      B.icon('circle-check', { size: 52, color: C.navy, sw: 2.4 }),
      B.text('Orçamento aceito', { size: 46, weight: 750, color: C.navy, ls: '-0.025em' }),
    );
    el.style.transformOrigin = '50% 50%';
    return { el, geom: g };
  };

  /** Moeda da marca: pagamento → financeiro. Centro em (540, 960), 200 px. */
  B.handoff.COIN = { cx: 540, cy: 960, size: 200 };
  B.handoff.coin = () => {
    const g = B.handoff.COIN;
    const star = B.star({ size: 92, color: '#fff' });
    const el = h(
      'div',
      {
        style: {
          position: 'absolute', left: `${g.cx - g.size / 2}px`, top: `${g.cy - g.size / 2}px`, width: `${g.size}px`, height: `${g.size}px`,
          borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, ${C.teal300} 0%, ${C.teal} 38%, ${C.teal700} 100%)`,
          boxShadow: '0 30px 60px -20px rgba(15,118,110,.55), inset 0 0 0 8px rgba(255,255,255,.22), inset 0 -10px 20px rgba(6,24,51,.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transformOrigin: '50% 50%', willChange: 'transform',
        },
      },
      star,
    );
    return { el, geom: g };
  };
})();
