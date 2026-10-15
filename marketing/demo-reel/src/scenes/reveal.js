/*
 * Cena "reveal": a marca se monta peça por peça sobre o branco quente.
 * Corpo sobe, cabeça brota, o "D" abraça a pessoa, a estrela acende e o nome
 * entra letra por letra. Depois a frase de posicionamento.
 */
(() => {
  const { h } = R;
  const E = R.ease;
  const C = B.C;
  const TAGLINE = ['Gestão inteligente', 'para sua clínica'];

  R.scene({
    id: 'reveal',
    build(root, S) {
      const mesh = B.mesh({
        base: C.warm,
        blobs: [
          { x: 180, y: 380, r: 620, color: 'rgba(20,184,166,.20)' },
          { x: 960, y: 760, r: 560, color: 'rgba(167,227,193,.45)' },
          { x: 300, y: 1620, r: 680, color: 'rgba(15,59,130,.10)' },
          { x: 900, y: 1500, r: 420, color: 'rgba(20,184,166,.14)' },
        ],
      });
      root.appendChild(mesh.el);
      const dots = B.dots({ color: 'rgba(15,59,130,.07)', gap: 40 });
      root.appendChild(dots);

      const cam = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '540px 900px' } });
      root.appendChild(cam);

      // Sombra macia sob o símbolo.
      const shadow = h('div', {
        style: {
          position: 'absolute', left: '340px', top: '905px', width: '400px', height: '60px', borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(15,59,130,.22), transparent)',
        },
      });
      cam.appendChild(shadow);

      const sym = B.symbol({ size: 440 });
      const symWrap = h('div', { style: { position: 'absolute', left: `${540 - 220}px`, top: '500px' } }, sym.svg);
      cam.appendChild(symWrap);

      // Contorno do D desenhado antes do preenchimento.
      const dStroke = R.s('path', { d: B.PATHS.SYMBOL_D, fill: 'none', stroke: C.teal, 'stroke-width': 7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      sym.svg.insertBefore(dStroke, sym.d);

      // Brilho da estrela.
      const flare = B.star({ size: 220, color: C.teal, glow: 26 });
      const flareWrap = h('div', { style: { position: 'absolute', left: `${540 - 110}px`, top: '700px', mixBlendMode: 'normal' } }, flare);
      cam.appendChild(flareWrap);
      const ring = h('div', {
        style: { position: 'absolute', left: '440px', top: '720px', width: '200px', height: '200px', borderRadius: '50%', border: `5px solid ${C.teal}`, boxSizing: 'border-box' },
      });
      cam.appendChild(ring);

      const word = B.wordmark({ width: 780 });
      const wordWrap = h('div', { style: { position: 'absolute', left: `${540 - 390}px`, top: '1000px', overflow: 'hidden', padding: '30px 0 10px' } }, word.svg);
      cam.appendChild(wordWrap);

      const lines = TAGLINE.map((txt, i) => {
        const el = h('div', {
          style: {
            position: 'absolute', left: '0', width: '1080px', top: `${1255 + i * 84}px`, textAlign: 'center',
            font: `600 66px/1.15 ${B.DISPLAY}`, letterSpacing: '-0.03em', color: i === 0 ? C.teal700 : C.ink,
          },
        });
        const parts = R.split(el, txt);
        cam.appendChild(el);
        return parts;
      });

      const sparkles = B.sparkles({ n: 9, area: [140, 420, 800, 560], color: C.teal, min: 14, max: 28, seed: 4 });
      cam.appendChild(sparkles.el);

      Object.assign(S, { mesh, cam, sym, dStroke, flareWrap, ring, word, lines, sparkles, shadow });
    },
    update(lt, t, S) {
      const { mesh, cam, sym, dStroke, flareWrap, ring, word, lines, sparkles, shadow } = S;
      mesh.update(t);

      // Câmera: leve aproximação contínua.
      R.tf(cam, { s: R.lerp(0.97, 1.03, R.p(lt, 0, S.dur, E.inOutSine)), y: R.lerp(10, -10, R.p(lt, 0, S.dur, E.inOutSine)) });

      // 1) Faísca inicial no centro do símbolo, que estoura num anel.
      const fIn = R.sp(lt, 0.0, R.springs.snappy);
      const fOut = R.p(lt, 0.42, 0.25, E.inCubic);
      R.tf(flareWrap, { s: fIn * (1 - fOut) * 1.0, r: R.lerp(-90, 45, R.p(lt, 0, 0.7, E.outCubic)), o: 1 - fOut });
            const rk = R.p(lt, 0.4, 0.7, E.outCubic);
      R.tf(ring, { s: R.lerp(0.2, 3.2, rk), o: lt < 0.4 ? 0 : (1 - rk) * 0.8 });

      // 2) Corpo sobe com mola.
      const body = R.sp(lt, 0.42, R.springs.snappy);
      R.tf(sym.body, { y: (1 - body) * 260, o: R.clamp(body * 2) });

      // 3) Cabeça brota.
      const head = R.sp(lt, 0.55, R.springs.bouncy);
      R.tf(sym.head, { s: head, o: R.clamp(head * 3) });

      // 4) O "D": traço desenha e o preenchimento chega, girando para abraçar.
      const draw = R.p(lt, 0.45, 0.65, E.inOutCubic);
      R.draw(dStroke, draw);
      dStroke.style.opacity = String(1 - R.p(lt, 1.0, 0.25));
      const dFill = R.p(lt, 0.8, 0.35, E.outCubic);
      const dSpin = R.sp(lt, 0.45, R.springs.gentle);
      R.tf(sym.d, { o: dFill, r: (1 - dSpin) * -28, s: R.lerp(0.9, 1, dSpin) });
      dStroke.style.transformBox = 'fill-box';
      dStroke.style.transformOrigin = 'center';
      dStroke.style.transform = `rotate(${((1 - dSpin) * -28).toFixed(2)}deg) scale(${R.lerp(0.9, 1, dSpin).toFixed(4)})`;

      // 5) Estrela acende girando.
      const st = R.sp(lt, 0.95, R.springs.bouncy);
      R.tf(sym.star, { s: st, r: (1 - R.clamp(st)) * -180, o: R.clamp(st * 2) });

      shadow.style.opacity = String(R.p(lt, 0.5, 0.6) * 0.9);

      // 6) Nome letra por letra.
      word.letters.forEach((g, i) => {
        const k = R.p(lt, 1.05 + i * 0.04, 0.75, E.snappy);
        R.tf(g, { y: (1 - k) * 95, o: R.clamp(k * 1.6) });
      });

      // 7) Frase.
      lines.forEach((parts, i) => R.reveal(parts, lt, { start: 1.55 + i * 0.16, stagger: 0.06, dur: 0.7, y: 110 }));

      sparkles.update(t, R.p(lt, 1.0, 0.6) * (1 - R.p(lt, S.dur - 0.4, 0.4)));
    },
  });
})();
