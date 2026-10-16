/*
 * Trilho do dia da paciente: fica no topo (y 228–352) da agenda até o fim do
 * atendimento e acende cada etapa na hora em que a narração fala dela. Uma
 * estrela-cometa corre pela linha entre as etapas. As cenas deixam essa faixa
 * livre de 6,5 s a 22,5 s.
 */
(() => {
  const { h } = R;
  const E = R.ease;
  const C = B.C;
  const TL = window.TIMELINE;
  const EV = TL.events;
  const STEPS = [
    { label: 'Agendado', at: EV.marianaBooked, col: C.scheduled },
    { label: 'Confirmado', at: EV.confirmed, col: C.confirmed },
    { label: 'Sala de espera', at: EV.arrived, col: C.arrived },
    { label: 'Em atendimento', at: EV.inProgress, col: C.inProgress },
    { label: 'Atendido', at: EV.attended, col: C.attended },
  ];
  const SHOW = TL.agenda.start + 0.15;
  const HIDE = TL.care.end - 0.02; // some antes do corte: o 1º quadro do orçamento já vem sem trilho
  const X0 = 140;
  const X1 = 940;
  const Y = 262;

  R.overlay({
    z: 900,
    build(root, o) {
      const pill = h('div', {
        style: {
          position: 'absolute', left: '48px', top: '222px', width: '984px', height: '132px', borderRadius: '40px',
          background: 'rgba(255,255,255,.88)', boxShadow: '0 18px 40px -18px rgba(11,31,63,.28), 0 0 0 1px rgba(11,31,63,.05)',
          backdropFilter: 'blur(8px)',
        },
      });
      root.appendChild(pill);
      const track = h('div', { style: { position: 'absolute', left: `${X0}px`, top: `${Y - 3}px`, width: `${X1 - X0}px`, height: '6px', borderRadius: '3px', background: C.warm200 } });
      const fill = h('div', { style: { position: 'absolute', left: `${X0}px`, top: `${Y - 3}px`, width: '0px', height: '6px', borderRadius: '3px', background: `linear-gradient(90deg, ${C.teal700}, ${C.teal})` } });
      root.appendChild(track);
      root.appendChild(fill);
      const nodes = STEPS.map((s, i) => {
        const x = R.lerp(X0, X1, i / (STEPS.length - 1));
        const ring = h('div', { style: { position: 'absolute', left: `${x - 28}px`, top: `${Y - 28}px`, width: '56px', height: '56px', borderRadius: '50%', border: `3px solid ${s.col.dot}`, boxSizing: 'border-box', opacity: '0' } });
        const base = h('div', { style: { position: 'absolute', left: `${x - 17}px`, top: `${Y - 17}px`, width: '34px', height: '34px', borderRadius: '50%', background: '#fff', border: `4px solid ${C.warm300}`, boxSizing: 'border-box' } });
        const on = h(
          'div',
          { style: { position: 'absolute', left: `${x - 17}px`, top: `${Y - 17}px`, width: '34px', height: '34px', borderRadius: '50%', background: s.col.dot, display: 'flex', alignItems: 'center', justifyContent: 'center', transformOrigin: '50% 50%' } },
          B.icon('check', { size: 22, color: '#fff', sw: 3.4 }),
        );
        const label = h('div', {
          style: { position: 'absolute', left: `${x - 120}px`, width: '240px', top: `${Y + 30}px`, textAlign: 'center', font: `600 24px/1 ${B.FONT}`, letterSpacing: '-0.015em', color: C.muted2, whiteSpace: 'nowrap' },
          text: s.label,
        });
        root.appendChild(ring);
        root.appendChild(base);
        root.appendChild(on);
        root.appendChild(label);
        return { s, x, ring, base, on, label };
      });
      const comet = h('div', { style: { position: 'absolute', left: '0', top: '0' } }, B.star({ size: 34, color: C.teal, glow: 10 }));
      root.appendChild(comet);
      Object.assign(o, { pill, track, fill, nodes, comet });
    },
    update(t, o) {
      const vis = R.window(t, SHOW, HIDE, 0.5, 0.35, E.snappy, E.inCubic);
      o.root.style.display = vis > 0.001 ? 'block' : 'none';
      if (vis <= 0.001) return;
      o.root.style.opacity = vis.toFixed(3);
      o.root.style.transform = `translateY(${((1 - vis) * -40).toFixed(1)}px)`;
      // Progresso da linha: anda até a etapa atual.
      let fx = X0;
      o.nodes.forEach((n, i) => {
        const k = R.sp(t, n.s.at, R.springs.bouncy);
        R.tf(n.on, { s: R.clamp(k, 0, 1.3), o: R.clamp(k * 3) });
        const ringK = R.p(t, n.s.at, 0.8, E.outCubic);
        R.tf(n.ring, { s: R.lerp(0.6, 1.9, ringK), o: t >= n.s.at ? (1 - ringK) * 0.9 : 0 });
        n.label.style.color = t >= n.s.at ? C.ink : C.muted2;
        if (t >= n.s.at - 0.6 && i > 0) {
          const prev = o.nodes[i - 1].x;
          fx = Math.max(fx, R.lerp(prev, n.x, R.p(t, n.s.at - 0.6, 0.6, E.inOutCubic)));
        }
        if (t >= n.s.at) fx = Math.max(fx, n.x);
      });
      o.fill.style.width = `${(fx - X0).toFixed(1)}px`;
      // Cometa na ponta da linha, girando; só aparece em movimento.
      const moving = o.nodes.some((n, i) => i > 0 && t >= n.s.at - 0.6 && t < n.s.at + 0.15);
      const cometO = moving ? 1 : 0;
      R.tf(o.comet, { x: fx - 17, y: Y - 18, r: t * 240, o: cometO, s: moving ? 1 : 0.4 });
    },
  });
})();
