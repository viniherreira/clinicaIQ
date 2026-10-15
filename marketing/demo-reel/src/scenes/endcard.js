/*
 * Cena "endcard" (39,7–45,0 s): a estrela do financeiro abre como íris e
 * revela o branco quente. A logo se monta rápido, entra "Sua clínica em dia.",
 * o botão "Comece grátis", o endereço e as garantias. O quadro fica parado
 * para leitura e serve de capa; a estrela da logo cintila no fim.
 */
(() => {
  const { h, s } = R;
  const E = R.ease;
  const C = B.C;
  const TL = window.TIMELINE;
  const EV = TL.events;

  const SYM_W = 380;
  const SYM_X = 540 - SYM_W / 2;
  const SYM_Y = 420;
  const K = SYM_W / 660;
  const STAR_AT = [SYM_X + (575 + 10) * K, SYM_Y + (72 + 10) * K];

  R.scene({
    id: 'endcard',
    build(root, S) {
      const L = (g) => g - S.start;
      const vo15a = TL.vo.find((v) => v.id === 'p15a');
      S.ev = {
        logo: 0.0,
        word: 0.32,
        tagline: L(vo15a.start) + 0.05,
        button: L(EV.ctaButton) - 0.35,
        tap: L(EV.ctaButton) + 0.38,
        url: L(EV.ctaUrl),
        fine: L(EV.ctaUrl) + 0.45,
        pulse: 4.0,
        twinkle: 4.7,
      };

      root.appendChild(h('div', { style: { position: 'absolute', inset: 0, background: C.warm } }));
      const mesh = B.mesh({
        base: 'transparent',
        blobs: [
          { x: 540, y: 760, r: 760, color: 'rgba(167,227,193,.40)' },
          { x: 150, y: 1500, r: 620, color: 'rgba(20,184,166,.14)' },
          { x: 980, y: 300, r: 520, color: 'rgba(20,184,166,.12)' },
        ],
      });
      root.appendChild(mesh.el);
      root.appendChild(B.dots({ color: 'rgba(15,59,130,.06)', gap: 28 }));
      // Estrela gigante girando devagar ao fundo.
      const giant = h('div', { style: { position: 'absolute', left: `${540 - 700}px`, top: `${900 - 740}px`, opacity: '0.05' } }, B.star({ size: 1400, color: C.teal }));
      root.appendChild(giant);

      const cam = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '540px 900px' } });
      root.appendChild(cam);

      const shadow = h('div', {
        style: {
          position: 'absolute', left: `${540 - 175}px`, top: `${SYM_Y + 325}px`, width: '350px', height: '46px', borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(15,59,130,.18), transparent)',
        },
      });
      cam.appendChild(shadow);
      const sym = B.symbol({ size: SYM_W });
      cam.appendChild(h('div', { style: { position: 'absolute', left: `${SYM_X}px`, top: `${SYM_Y}px` } }, sym.svg));
      const dStroke = s('path', { d: B.PATHS.SYMBOL_D, fill: 'none', stroke: C.teal, 'stroke-width': 14, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      sym.svg.insertBefore(dStroke, sym.d);
      dStroke.style.transformBox = 'fill-box';
      dStroke.style.transformOrigin = 'center';

      const glint = h('div', { style: { position: 'absolute', left: `${STAR_AT[0] - 90}px`, top: `${STAR_AT[1] - 95}px` } }, B.star({ size: 180, color: C.teal300, glow: 20 }));
      cam.appendChild(glint);

      const word = B.wordmark({ width: 640 });
      cam.appendChild(h('div', { style: { position: 'absolute', left: `${540 - 320}px`, top: '806px', overflow: 'hidden', padding: '30px 0 12px' } }, word.svg));

      // "Sua clínica em dia." com "em dia." em teal.
      const tagline = h('div', {
        style: {
          position: 'absolute', left: 0, width: '1080px', top: '1000px', textAlign: 'center',
          font: `900 100px/1.04 ${B.DISPLAY}`, letterSpacing: '-0.05em', color: C.navy,
        },
      });
      const tagParts = R.split(tagline, 'Sua clínica em dia.');
      tagParts.slice(2).forEach((p) => (p.style.color = C.teal700));
      cam.appendChild(tagline);

      // Botão "Comece grátis".
      const btn = h(
        'div',
        {
          style: {
            position: 'absolute', left: `${540 - 330}px`, top: '1160px', width: '660px', height: '136px', borderRadius: '68px',
            background: `linear-gradient(135deg, ${C.teal700} 0%, #0B5F59 100%)`, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '22px',
            font: `800 60px/1 ${B.DISPLAY}`, letterSpacing: '-0.035em',
            boxShadow: '0 30px 60px -22px rgba(15,118,110,.65), inset 0 2px 0 rgba(255,255,255,.18)',
            transformOrigin: '50% 50%', overflow: 'hidden',
          },
        },
        h('span', { text: 'Comece grátis' }),
        B.icon('arrow-right', { size: 58, color: '#fff', sw: 2.8 }),
      );
      const shine = h('div', {
        style: { position: 'absolute', top: 0, bottom: 0, width: '180px', left: '-220px', background: 'linear-gradient(100deg, transparent, rgba(255,255,255,.35), transparent)', transform: 'skewX(-18deg)' },
      });
      btn.appendChild(shine);
      cam.appendChild(btn);
      const tap = B.tap({ size: 96, color: 'rgba(167,227,193,.55)' });
      cam.appendChild(tap.el);

      // Endereço letra por letra.
      const url = h('div', {
        style: {
          position: 'absolute', left: 0, width: '1080px', top: '1338px', textAlign: 'center',
          font: `800 76px/1 ${B.DISPLAY}`, letterSpacing: '-0.04em', color: C.navy,
        },
      });
      const urlParts = R.split(url, 'dreamclin.com', { by: 'char' });
      urlParts.slice(5, 9).forEach((p) => (p.style.color = C.teal700));
      cam.appendChild(url);

      // Garantias.
      const fine = h(
        'div',
        {
          style: {
            position: 'absolute', left: 0, width: '1080px', top: '1446px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '18px',
            font: `600 36px/1 ${B.FONT}`, letterSpacing: '-0.015em', color: C.teal700,
          },
        },
        h('span', { text: 'Sem cartão de crédito' }),
        h('span', { style: { display: 'inline-block' } }, B.star({ size: 22, color: C.teal })),
        h('span', { text: 'Pronto em 5 minutos' }),
      );
      cam.appendChild(fine);

      const sparkles = B.sparkles({ n: 10, area: [110, 360, 860, 520], color: C.teal, min: 14, max: 26, seed: 9 });
      cam.appendChild(sparkles.el);

      // Borda da íris.
      const irisSvg = s('svg', { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: { position: 'absolute', inset: 0, overflow: 'visible' } });
      const irisEdge = s('path', { d: '', fill: 'none', stroke: C.teal400, 'stroke-width': 10, 'stroke-linejoin': 'round' });
      irisSvg.appendChild(irisEdge);
      root.appendChild(irisSvg);

      Object.assign(S, { mesh, giant, cam, shadow, sym, dStroke, glint, word, tagParts, btn, shine, tap, urlParts, fine, sparkles, irisEdge });
    },
    update(lt, t, S) {
      const { ev, mesh, giant, cam, shadow, sym, dStroke, glint, word, tagParts, btn, shine, tap, urlParts, fine, sparkles, irisEdge } = S;
      mesh.update(t);
      R.tf(giant, { r: lt * 6, s: 1 + Math.sin(lt * 0.8) * 0.02 });

      // Íris em estrela (começa em -0,3 com a estrela do financeiro, r ≈ 69 px).
      const k = R.lerp(0.0265, 1, R.p(lt, -S.pre, S.pre + 0.18, E.inCubic));
      B.starWipe(S.root, k, 540, 960, 0);
      if (k < 1) {
        irisEdge.setAttribute('d', R.starPath(540, 960, R.lerp(0, 2600, k), R.lerp(0.18, 0.7, k), 0));
        irisEdge.style.opacity = '1';
      } else irisEdge.style.opacity = '0';

      // Câmera assenta e respira.
      R.tf(cam, { s: R.lerp(1.06, 1, R.p(lt, -0.3, 1.4, E.snappy)) * (1 + R.p(lt, 1.2, 3.8, E.inOutSine) * 0.012) });

      // Logo acelerada.
      const draw = R.p(lt, ev.logo - 0.1, 0.42, E.inOutCubic);
      R.draw(dStroke, draw);
      dStroke.style.opacity = String(lt < ev.logo - 0.1 ? 0 : 1 - R.p(lt, ev.logo + 0.38, 0.18));
      const dFill = R.p(lt, ev.logo + 0.22, 0.25, E.outCubic);
      R.tf(sym.d, { o: dFill });
      const body = R.sp(lt, ev.logo + 0.12, R.springs.snappy);
      R.tf(sym.body, { y: (1 - body) * 220, o: R.clamp(body * 2.5) });
      const head = R.sp(lt, ev.logo + 0.26, R.springs.bouncy);
      R.tf(sym.head, { s: head, o: R.clamp(head * 3) });
      const st = R.sp(lt, ev.logo + 0.36, R.springs.bouncy);
      R.tf(sym.star, { s: st, r: (1 - R.clamp(st)) * -135, o: R.clamp(st * 2) });
      shadow.style.opacity = String(R.p(lt, ev.logo + 0.2, 0.4));
      // Brilho da estrela: na chegada e de novo no fim (cintila em 44,7).
      const g1 = R.p(lt, ev.logo + 0.42, 0.5, E.outCubic);
      const g2 = R.p(lt, ev.twinkle, 0.3, E.outCubic);
      const gs = lt < ev.twinkle ? (lt < ev.logo + 0.42 ? 0 : Math.sin(g1 * Math.PI) * 0.7) : Math.sin(g2 * Math.PI) * 0.75;
      R.tf(glint, { s: gs, r: (lt < ev.twinkle ? g1 : g2) * 90, o: gs > 0.01 ? 1 : 0 });

      // Nome.
      word.letters.forEach((g, i) => {
        const kk = R.p(lt, ev.word + i * 0.03, 0.55, E.snappy);
        R.tf(g, { y: (1 - kk) * 100, o: R.clamp(kk * 1.8) });
      });

      // "Sua clínica em dia." com a voz.
      R.reveal(tagParts, lt, { start: ev.tagline, stagger: 0.13, dur: 0.6, y: 110 });

      // Botão: sobe em mola, toque com onda, brilho e pulso no acorde final.
      const b = R.sp(lt, ev.button, R.springs.bouncy);
      const press = R.kf(lt, [[ev.tap - 0.05, 1], [ev.tap + 0.05, 0.95, E.outQuad], [ev.tap + 0.35, 1, E.snappy]]);
      const pulse = 1 + Math.sin(R.p(lt, ev.pulse, 0.5, E.linear) * Math.PI) * 0.045;
      R.tf(btn, { y: (1 - b) * 140, s: R.lerp(0.7, 1, R.clamp(b, 0, 1.2)) * press * pulse, o: R.clamp(b * 2.5) });
      const sh = R.p(lt, ev.tap + 0.1, 0.7, E.inOutCubic);
      shine.style.transform = `translateX(${(sh * 1120).toFixed(1)}px) skewX(-18deg)`;
      tap.update(lt, ev.tap, 760, 1228);

      // Endereço e garantias.
      R.reveal(urlParts, lt, { start: ev.url, stagger: 0.028, dur: 0.5, y: 110 });
      const f = R.p(lt, ev.fine, 0.6, E.snappy);
      R.tf(fine, { y: (1 - f) * 30, o: f });

      sparkles.update(t, R.p(lt, 0.4, 0.6));
    },
  });
})();
