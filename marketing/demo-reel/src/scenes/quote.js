/* Provisório: cena "quote" ainda não feita. */
(() => {
  R.scene({
    id: 'quote',
    build(root, S) {
      root.appendChild(R.h('div', { style: { position: 'absolute', inset: 0, background: '#E8E6E0', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 90px Inter', color: '#8F8B82' } }, 'quote'));
    },
    update() {},
  });
})();
