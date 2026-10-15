/*
 * Camadas por cima de todas as cenas: grão de filme (tira o degrau dos
 * degradês no H.264 e dá textura) e um HUD de depuração (?hud=1).
 */
(() => {
  const { h } = R;
  // Textura de ruído gerada uma vez; muda de posição a cada quadro.
  function noiseTile(size = 256, seed = 7) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    let x = seed;
    for (let i = 0; i < img.data.length; i += 4) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      const v = (x >> 16) & 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }
  R.overlay({
    z: 1000,
    build(root, o) {
      o.grain = h('div', {
        style: {
          position: 'absolute',
          inset: '-256px',
          backgroundImage: `url(${noiseTile()})`,
          backgroundSize: '256px 256px',
          opacity: 0.055,
          mixBlendMode: 'overlay',
        },
      });
      root.appendChild(o.grain);
      if (new URLSearchParams(location.search).get('hud')) {
        o.hud = h('div', {
          style: { position: 'absolute', left: '16px', top: '16px', font: '600 26px Inter', color: '#f0f', background: 'rgba(0,0,0,.6)', padding: '6px 12px', zIndex: 5 },
        });
        root.appendChild(o.hud);
      }
    },
    update(t, o) {
      const f = Math.round(t * R.FPS);
      const ox = Math.floor(R.hash(f * 1.7) * 256);
      const oy = Math.floor(R.hash(f * 2.3 + 5) * 256);
      o.grain.style.transform = `translate(${ox}px, ${oy}px)`;
      if (o.hud) {
        const on = R.scenes.filter((s) => s._on).map((s) => s.id).join(' + ');
        o.hud.textContent = `${t.toFixed(2)}s  f${f}  ${on}`;
      }
    },
  });
})();
