/* Provisório: cena "endcard" ainda não feita. */
(() => {
  R.scene({
    id: 'endcard',
    build(root, S) {
      root.appendChild(R.h('div', { style: { position: 'absolute', inset: 0, background: '#E8E6E0', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 90px Inter', color: '#8F8B82' } }, 'endcard'));
    },
    update() {},
  });
})();
