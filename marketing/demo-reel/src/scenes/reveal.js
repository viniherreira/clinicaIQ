/*
 * Cena "reveal" (3,0–6,5 s): a estrela que cortou o caos abre a tela em branco
 * quente. "Respira." aparece, se desfaz em estrelinhas, e a logo se monta: o
 * traço do D, o corpo, a cabeça e a estrela, que brilha em "DreamClin". Depois
 * o nome, a promessa e um mergulho pelo miolo do D até a agenda.
 */
(() => {
  const { h, s } = R;
  const E = R.ease;
  const C = B.C;
  const TL = window.TIMELINE;
  const EV = TL.events;

  // Geometria da logo na tela.
  const SYM_W = 460;
  const SYM_X = 540 - SYM_W / 2;
  const SYM_Y = 500;
  const K = SYM_W / 660; // px por unidade do viewBox do símbolo (-10 -10 660 590)
  const symToScreen = (x, y) => [SYM_X + (x + 10) * K, SYM_Y + (y + 10) * K];
  const STAR_AT = symToScreen(575, 72);
  const DIVE_AT = symToScreen(345, 245); // miolo branco do D, entre a cabeça e o arco

  R.scene({
    id: 'reveal',
    build(root, S) {
      const L = (g) => g - S.start; // tempo global → local
      S.ev = {
        respira: L(EV.respira),
        dissolve: L(EV.respira) + 0.72,
        dDraw: L(EV.respira) + 0.8,
        glint: L(EV.logoGlint),
        word: L(EV.logoGlint) + 0.05,
        tag: L(EV.logoGlint) + 0.62,
        dive: L(EV.diveIntoD),
      };

      // Fundo: branco quente, manchas que somem antes do mergulho, grade de pontos.
      const base = h('div', { style: { position: 'absolute', inset: 0, background: C.warm } });
      root.appendChild(base);
      const mesh = B.mesh({
        base: 'transparent',
        blobs: [
          { x: 200, y: 420, r: 640, color: 'rgba(167,227,193,.42)' },
          { x: 930, y: 820, r: 560, color: 'rgba(20,184,166,.16)' },
          { x: 320, y: 1600, r: 700, color: 'rgba(15,59,130,.08)' },
          { x: 880, y: 1450, r: 460, color: 'rgba(167,227,193,.30)' },
        ],
      });
      root.appendChild(mesh.el);
      const dots = B.dots({ color: 'rgba(15,59,130,.07)', gap: 28 });
      root.appendChild(dots);

      const cam = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '540px 960px' } });
      root.appendChild(cam);

      // "Respira."
      const respira = h('div', {
        style: {
          position: 'absolute', left: 0, width: '1080px', top: '880px', textAlign: 'center',
          font: `800 128px/1 ${B.DISPLAY}`, letterSpacing: '-0.05em', color: C.navy,
        },
      });
      const chars = R.split(respira, 'Respira.', { by: 'char' });
      cam.appendChild(respira);

      // Sombra, símbolo, contorno do D.
      const shadow = h('div', {
        style: {
          position: 'absolute', left: `${540 - 210}px`, top: `${SYM_Y + 395}px`, width: '420px', height: '56px', borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(15,59,130,.20), transparent)',
        },
      });
      cam.appendChild(shadow);
      const sym = B.symbol({ size: SYM_W });
      const symWrap = h('div', { style: { position: 'absolute', left: `${SYM_X}px`, top: `${SYM_Y}px` } }, sym.svg);
      cam.appendChild(symWrap);
      const dStroke = s('path', { d: B.PATHS.SYMBOL_D, fill: 'none', stroke: C.teal, 'stroke-width': 14, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      sym.svg.insertBefore(dStroke, sym.d);
      dStroke.style.transformBox = 'fill-box';
      dStroke.style.transformOrigin = 'center';

      // Estrelinhas que nascem das letras e voam até a estrela da logo.
      const minis = chars.map((_, i) => {
        const st = h('div', { style: { position: 'absolute', left: 0, top: 0 } }, B.star({ size: 30 + (i % 3) * 8, color: i % 2 ? C.teal : C.teal400 }));
        cam.appendChild(st);
        return st;
      });
      const glint = h('div', { style: { position: 'absolute', left: `${STAR_AT[0] - 110}px`, top: `${STAR_AT[1] - 116}px` } }, B.star({ size: 220, color: '#ffffff', glow: 18 }));
      cam.appendChild(glint);
      const glintRing = h('div', {
        style: { position: 'absolute', left: `${STAR_AT[0] - 70}px`, top: `${STAR_AT[1] - 70}px`, width: '140px', height: '140px', borderRadius: '50%', border: `4px solid ${C.teal}`, boxSizing: 'border-box' },
      });
      cam.appendChild(glintRing);

      // Nome e promessa.
      const word = B.wordmark({ width: 760 });
      const wordWrap = h('div', { style: { position: 'absolute', left: `${540 - 380}px`, top: '1010px', overflow: 'hidden', padding: '34px 0 14px' } }, word.svg);
      cam.appendChild(wordWrap);
      const tag = h('div', {
        style: {
          position: 'absolute', left: 0, width: '1080px', top: '1240px', textAlign: 'center',
          font: `600 60px/1.15 ${B.DISPLAY}`, letterSpacing: '-0.03em', color: C.teal700,
        },
      });
      const tagParts = R.split(tag, 'Do agendamento ao pagamento.');
      cam.appendChild(tag);

      const sparkles = B.sparkles({ n: 9, area: [130, 430, 820, 560], color: C.teal, min: 14, max: 28, seed: 4 });
      cam.appendChild(sparkles.el);

      // Borda da íris (contorno teal que acompanha o recorte em estrela).
      const irisSvg = s('svg', { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: { position: 'absolute', inset: 0, overflow: 'visible' } });
      const irisEdge = s('path', { d: '', fill: 'none', stroke: C.teal, 'stroke-width': 10, 'stroke-linejoin': 'round' });
      irisSvg.appendChild(irisEdge);
      root.appendChild(irisSvg);

      Object.assign(S, { mesh, dots, cam, respira, chars, sym, dStroke, minis, glint, glintRing, word, tagParts, sparkles, shadow, irisEdge });
    },
    update(lt, t, S) {
      const { ev, mesh, dots, cam, chars, sym, dStroke, minis, glint, glintRing, word, tagParts, sparkles, shadow, irisEdge } = S;
      mesh.update(t);

      // 1) Íris em estrela a partir da estrela do gancho (r ≈ 69 px no centro).
      const k = R.lerp(0.0265, 1, R.p(lt, 0, 0.5, E.inCubic));
      B.starWipe(S.root, k, 540, 960, 0);
      if (k < 1) {
        irisEdge.setAttribute('d', R.starPath(540, 960, R.lerp(0, 2600, k), R.lerp(0.18, 0.7, k), 0));
        irisEdge.style.opacity = String(1 - R.p(lt, 0.15, 0.3));
      } else irisEdge.style.opacity = '0';

      // 2) Mergulho pelo miolo do D: a câmera aproxima até o branco tomar a tela.
      const dive = R.p(lt, ev.dive, S.dur - ev.dive, E.inExpo);
      const breathe = Math.sin(R.clamp((lt - ev.respira) / 0.8) * Math.PI) * 0.02;
      const drift = R.lerp(0.985, 1.02, R.p(lt, 0, ev.dive, E.inOutSine));
      const zoom = R.lerp(1, 30, dive);
      cam.style.transformOrigin = `${DIVE_AT[0]}px ${DIVE_AT[1]}px`;
      R.tf(cam, { s: (drift + breathe) * zoom, y: R.lerp(0, -20, R.p(lt, 0, ev.dive, E.inOutSine)) });
      // As manchas somem no mergulho: a agenda começa no branco liso com a grade.
      mesh.el.style.opacity = String(1 - dive);
      dots.style.opacity = String(R.lerp(0.75, 1, R.p(lt, 0, 1.0)));

      // 3) "Respira." por letra, depois vira estrelinhas.
      chars.forEach((c, i) => {
        const inK = R.p(lt, ev.respira + i * 0.035, 0.6, E.snappy);
        const outK = R.p(lt, ev.dissolve + i * 0.03, 0.28, E.inCubic);
        c.style.transform = `translate3d(0, ${((1 - inK) * 100).toFixed(1)}%, 0) scale(${(1 - outK * 0.7).toFixed(3)})`;
        c.style.opacity = String(R.clamp(inK * 2) * (1 - outK));
        c.style.filter = outK > 0.02 ? `blur(${(outK * 6).toFixed(2)}px)` : 'none';
      });
      // Estrelinhas: saem de cada letra e convergem para a estrela da logo.
      const charX = (i) => 540 + (i - (chars.length - 1) / 2) * 62;
      minis.forEach((m, i) => {
        const born = ev.dissolve + i * 0.03;
        const f = R.p(lt, born + 0.08, 0.75, E.inOutCubic);
        const appear = R.p(lt, born, 0.16, E.outCubic);
        const arrive = R.p(lt, born + 0.7, 0.15);
        const x0 = charX(i);
        const y0 = 940;
        // Arco: sobe e curva até a estrela.
        const cx = R.lerp(x0, STAR_AT[0], f) + Math.sin(f * Math.PI) * (i - 3.5) * 22;
        const cy = R.lerp(y0, STAR_AT[1], f) - Math.sin(f * Math.PI) * 140;
        R.tf(m, { x: cx - 20, y: cy - 20, s: appear * (1 - arrive) * (1 - f * 0.4), r: lt * 260 + i * 40, o: appear * (1 - arrive) });
      });

      // 4) O D: traço desenha no sentido horário e o preenchimento chega.
      const draw = R.p(lt, ev.dDraw, 0.55, E.inOutCubic);
      R.draw(dStroke, draw);
      const dFill = R.p(lt, ev.dDraw + 0.4, 0.3, E.outCubic);
      const dSpin = R.sp(lt, ev.dDraw, R.springs.gentle);
      const dT = `rotate(${((1 - dSpin) * -22).toFixed(2)}deg) scale(${R.lerp(0.92, 1, dSpin).toFixed(4)})`;
      dStroke.style.transform = dT;
      dStroke.style.opacity = String(lt < ev.dDraw ? 0 : 1 - R.p(lt, ev.dDraw + 0.6, 0.2));
      R.tf(sym.d, { o: dFill, r: (1 - dSpin) * -22, s: R.lerp(0.92, 1, dSpin) });

      // 5) Corpo sobe, cabeça brota.
      const body = R.sp(lt, ev.dDraw + 0.35, R.springs.snappy);
      R.tf(sym.body, { y: (1 - body) * 240, o: R.clamp(body * 2.5) });
      const head = R.sp(lt, ev.dDraw + 0.55, R.springs.bouncy);
      R.tf(sym.head, { s: head, o: R.clamp(head * 3) });
      shadow.style.opacity = String(R.p(lt, ev.dDraw + 0.3, 0.5) * (1 - dive));

      // 6) A estrela chega no canto e brilha em "DreamClin".
      const st = R.sp(lt, ev.glint - 0.32, R.springs.bouncy);
      R.tf(sym.star, { s: st, r: (1 - R.clamp(st)) * -135 + R.p(lt, ev.glint, 0.6, E.snappy) * 0, o: R.clamp(st * 2) });
      const gk = R.p(lt, ev.glint, 0.55, E.outCubic);
      R.tf(glint, { s: lt < ev.glint ? 0 : Math.sin(gk * Math.PI) * 0.75, r: gk * 90, o: lt < ev.glint ? 0 : 1 - gk });
      R.tf(glintRing, { s: R.lerp(0.3, 2.6, gk), o: lt < ev.glint ? 0 : (1 - gk) * 0.8 });

      // 7) Nome letra por letra e a promessa.
      word.letters.forEach((g, i) => {
        const kk = R.p(lt, ev.word + i * 0.035, 0.6, E.snappy);
        R.tf(g, { y: (1 - kk) * 100, o: R.clamp(kk * 1.8) });
      });
      R.reveal(tagParts, lt, { start: ev.tag, stagger: 0.07, dur: 0.6, y: 110 });

      sparkles.update(t, R.p(lt, ev.glint - 0.2, 0.5) * (1 - dive));
    },
  });
})();
