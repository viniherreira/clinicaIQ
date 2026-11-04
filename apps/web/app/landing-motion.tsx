'use client';

import { useEffect } from 'react';

/**
 * O movimento da página de vendas: as entradas por seção e a linha da
 * constelação, que liga as estrelas onde elas de fato ficaram na tela. Não
 * desenha nada: sem JavaScript, o conteúdo aparece igual, só sem movimento.
 */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.lp');
    const con = document.getElementById('lp-con');
    const linha = document.getElementById('lp-con-path');
    if (!root) return;

    const desenhar = () => {
      if (!con || !linha) return;
      const caixa = con.getBoundingClientRect();
      const pontos = Array.from(con.querySelectorAll('.pt')).map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left + r.width / 2 - caixa.left, r.top + r.height / 2 - caixa.top] as const;
      });
      const [inicio, ...resto] = pontos;
      if (!inicio) return;
      let d = `M${inicio[0]} ${inicio[1]}`;
      let antes = inicio;
      for (const p of resto) {
        const meioX = (antes[0] + p[0]) / 2;
        d += Math.abs(antes[0] - p[0]) < 40 ? ` L${p[0]} ${p[1]}` : ` C${meioX} ${antes[1]} ${meioX} ${p[1]} ${p[0]} ${p[1]}`;
        antes = p;
      }
      linha.setAttribute('d', d);
    };

    desenhar();
    window.addEventListener('resize', desenhar);
    void document.fonts?.ready.then(desenhar);

    // Só esconde para a entrada o que ainda está abaixo da dobra.
    root.classList.add('lp-anim');
    const observador = new IntersectionObserver(
      (itens) => {
        for (const item of itens) {
          if (item.isIntersecting) {
            item.target.classList.add('in');
            observador.unobserve(item.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    root.querySelectorAll('[data-r]').forEach((el) => observador.observe(el));
    if (con) observador.observe(con);

    return () => {
      window.removeEventListener('resize', desenhar);
      observador.disconnect();
    };
  }, []);

  return null;
}
