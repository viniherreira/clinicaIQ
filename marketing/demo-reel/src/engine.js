/*
 * Motor de motion do reel do DreamClin.
 *
 * Tudo é função do tempo: `R.render(t)` posiciona cada elemento para o
 * instante t (segundos). Nada de transição/animação CSS, setTimeout ou
 * requestAnimationFrame — o renderizador do Playwright pede um quadro por vez
 * e o resultado tem que ser idêntico sempre que o mesmo t for pedido.
 */
(() => {
  const R = (window.R = {});
  R.W = 1080;
  R.H = 1920;
  R.FPS = 60;

  // ── Matemática ────────────────────────────────────────────────────────────
  R.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  R.lerp = (a, b, t) => a + (b - a) * t;
  /** Progresso linear 0..1 de x entre a e b. */
  R.inv = (a, b, x) => (b === a ? (x >= b ? 1 : 0) : R.clamp((x - a) / (b - a)));
  R.map = (x, a, b, c, d, ease = (v) => v) => R.lerp(c, d, ease(R.inv(a, b, x)));
  /** Ruído determinístico 1D suave (para tremidas e respiros). */
  R.hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  R.noise = (x, seed = 0) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return R.lerp(R.hash(i + seed * 57.3), R.hash(i + 1 + seed * 57.3), u) * 2 - 1;
  };

  // ── Curvas ────────────────────────────────────────────────────────────────
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(t) - x;
        if (Math.abs(e) < 1e-6) break;
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      // Bissecção de segurança.
      let lo = 0, hi = 1;
      if (Math.abs(sx(t) - x) > 1e-4) {
        t = x;
        for (let i = 0; i < 30; i++) {
          const v = sx(t);
          if (v < x) lo = t; else hi = t;
          t = (lo + hi) / 2;
        }
      }
      return sy(t);
    };
  }
  const E = (R.ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    inQuart: (t) => t * t * t * t,
    inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inQuint: (t) => t ** 5,
    inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    inOutExpo: (t) =>
      t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
    inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
    outCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    bezier,
  });
  /** "Apple": sai rápido e assenta macio. */
  E.snappy = bezier(0.16, 1, 0.3, 1);
  /** Entrada e saída fortes, para movimentos de câmera e transições. */
  E.swift = bezier(0.83, 0, 0.17, 1);
  /** Ease-in-out suave. */
  E.smooth = bezier(0.65, 0, 0.35, 1);
  /** Saída levemente antecipada (puxa e solta). */
  E.anticipate = bezier(0.6, -0.28, 0.4, 1.3);

  /**
   * Mola amortecida analítica: 0 → 1 (pode passar de 1 e voltar).
   * k = rigidez, c = amortecimento, m = massa. Valores tipo Framer Motion.
   */
  R.spring = (t, { k = 170, c = 26, m = 1, v0 = 0 } = {}) => {
    if (t <= 0) return 0;
    const w0 = Math.sqrt(k / m);
    const zeta = c / (2 * Math.sqrt(k * m));
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      const A = 1;
      const B = (zeta * w0 * A - v0) / wd;
      return 1 - Math.exp(-zeta * w0 * t) * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
    }
    if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + (w0 - v0) * t);
    const r1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
    const r2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
    const c2 = (v0 - r1) / (r2 - r1);
    const c1 = 1 - c2;
    return 1 - (c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t));
  };
  /** Presets de mola. */
  R.springs = {
    gentle: { k: 120, c: 20 },
    snappy: { k: 260, c: 24 },
    bouncy: { k: 220, c: 14 },
    wobbly: { k: 180, c: 10 },
    stiff: { k: 400, c: 38 },
  };

  /** Progresso com curva: 0 antes de start, 1 depois de start+dur. */
  R.p = (t, start, dur, ease = E.snappy) => ease(R.inv(start, start + dur, t));
  /** Mola a partir de start. */
  R.sp = (t, start, preset = R.springs.snappy) => (t < start ? 0 : R.spring(t - start, preset));
  /**
   * Keyframes: [[tempo, valor, curvaDoTrechoQueChegaAqui?], ...].
   * Valor pode ser número ou array de números.
   */
  R.kf = (t, frames) => {
    if (t <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i++) {
      const [t1, v1, ease = E.smooth] = frames[i];
      const [t0, v0] = frames[i - 1];
      if (t <= t1) {
        const k = ease(R.inv(t0, t1, t));
        if (Array.isArray(v0)) return v0.map((a, j) => R.lerp(a, v1[j], k));
        return R.lerp(v0, v1, k);
      }
    }
    return frames[frames.length - 1][1];
  };
  /** Entrada e saída numa janela: sobe em inDur depois de a, desce em outDur antes de b. */
  R.window = (t, a, b, inDur = 0.4, outDur = 0.3, easeIn = E.snappy, easeOut = E.inCubic) =>
    Math.min(R.p(t, a, inDur, easeIn), 1 - R.p(t, b - outDur, outDur, easeOut));

  // ── DOM ───────────────────────────────────────────────────────────────────
  const SVGNS = 'http://www.w3.org/2000/svg';
  function applyProps(node, props, isSvg) {
    if (!props) return;
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'class') node.setAttribute('class', v);
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (isSvg) node.setAttribute(k, v);
      else if (k in node && typeof v !== 'string') node[k] = v;
      else node.setAttribute(k, v);
    }
  }
  function append(node, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
  }
  /** Elemento HTML: R.h('div', {class, style}, ...filhos). */
  R.h = (tag, props, ...children) => {
    const n = document.createElement(tag);
    applyProps(n, props, false);
    append(n, children);
    return n;
  };
  /** Elemento SVG: R.s('path', {d, fill}, ...filhos). */
  R.s = (tag, props, ...children) => {
    const n = document.createElementNS(SVGNS, tag);
    applyProps(n, props, true);
    append(n, children);
    return n;
  };
  /** HTML cru para nó (útil para ícones). */
  R.frag = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  };

  /**
   * Transforma e estiliza: R.tf(el, {x, y, s, sx, sy, r, rx, ry, o, blur, z}).
   * x/y em px, r em graus, o = opacidade, blur em px.
   */
  R.tf = (el, { x = 0, y = 0, z = 0, s = 1, sx, sy, r = 0, rx = 0, ry = 0, o, blur, persp } = {}) => {
    const scx = sx ?? s;
    const scy = sy ?? s;
    let t = '';
    if (persp) t += `perspective(${persp}px) `;
    t += `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px)`;
    if (rx) t += ` rotateX(${rx.toFixed(3)}deg)`;
    if (ry) t += ` rotateY(${ry.toFixed(3)}deg)`;
    if (r) t += ` rotate(${r.toFixed(3)}deg)`;
    if (scx !== 1 || scy !== 1) t += ` scale(${scx.toFixed(4)}, ${scy.toFixed(4)})`;
    el.style.transform = t;
    if (o !== undefined) el.style.opacity = R.clamp(o).toFixed(4);
    if (blur !== undefined) el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
  };
  R.show = (el, on) => {
    el.style.visibility = on ? 'visible' : 'hidden';
  };

  // ── Texto ─────────────────────────────────────────────────────────────────
  /**
   * Quebra o texto em palavras (ou letras) dentro de máscaras, para revelar
   * subindo. Devolve os spans internos, na ordem.
   * opts.by: 'word' | 'char'; opts.mask: corta o que sai da linha.
   */
  R.split = (container, text, { by = 'word', mask = true, padY = 0.18 } = {}) => {
    container.textContent = '';
    const parts = [];
    const words = text.split(' ');
    words.forEach((word, wi) => {
      const wrap = R.h('span', {
        class: 'sp-wrap',
        style: {
          display: 'inline-block',
          overflow: mask ? 'hidden' : 'visible',
          verticalAlign: 'top',
          paddingBottom: `${padY}em`,
          marginBottom: `-${padY}em`,
          paddingTop: `${padY * 0.5}em`,
          marginTop: `-${padY * 0.5}em`,
        },
      });
      if (by === 'char') {
        for (const ch of Array.from(word)) {
          const sp = R.h('span', { style: { display: 'inline-block', willChange: 'transform' } }, ch);
          wrap.appendChild(sp);
          parts.push(sp);
        }
      } else {
        const sp = R.h('span', { style: { display: 'inline-block', willChange: 'transform' } }, word);
        wrap.appendChild(sp);
        parts.push(sp);
      }
      container.appendChild(wrap);
      if (wi < words.length - 1) container.appendChild(document.createTextNode(' '));
    });
    return parts;
  };
  /**
   * Revela partes com atraso escalonado. from: {y, r, s, blur} em unidades de
   * px (y também aceita '%' como número * altura do glifo via em).
   */
  R.reveal = (parts, t, { start = 0, stagger = 0.04, dur = 0.7, ease = E.snappy, y = 110, r = 0, s = 1, blur = 0, fade = false, out = null } = {}) => {
    // y é em % da altura do próprio span (110 = some inteiro abaixo da máscara).
    parts.forEach((p, i) => {
      const k = R.p(t, start + i * stagger, dur, ease);
      let o = fade ? R.clamp(k * 1.4) : 1;
      let yy = (1 - k) * y;
      let blurNow = (1 - k) * blur;
      if (out) {
        const ko = R.p(t, out.start + i * (out.stagger ?? stagger * 0.5), out.dur ?? 0.45, out.ease ?? E.inCubic);
        yy += (out.y ?? -110) * ko;
        if (out.fade) o *= 1 - ko;
        if (out.blur) blurNow += out.blur * ko;
      }
      p.style.transform = `translate3d(0, ${yy.toFixed(2)}%, 0) rotate(${((1 - k) * r).toFixed(2)}deg) scale(${R.lerp(s, 1, k).toFixed(4)})`;
      p.style.opacity = o.toFixed(3);
      if (blur || (out && out.blur)) p.style.filter = blurNow > 0.05 ? `blur(${blurNow.toFixed(2)}px)` : 'none';
    });
  };
  /** Datilografia: mostra n caracteres conforme o tempo. */
  R.type = (el, text, t, start, cps = 28) => {
    const n = Math.max(0, Math.min(text.length, Math.floor((t - start) * cps)));
    const s = text.slice(0, n);
    if (el.textContent !== s) el.textContent = s;
    return n >= text.length;
  };

  // ── Números ───────────────────────────────────────────────────────────────
  const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const intFmt = new Intl.NumberFormat('pt-BR');
  R.brl = (n) => brlFmt.format(n).replace(/ /g, ' ');
  R.int = (n) => intFmt.format(Math.round(n));
  /** Contador: valor entre from e to conforme o tempo. */
  R.count = (t, start, dur, from, to, ease = E.outExpo) => R.lerp(from, to, R.p(t, start, dur, ease));

  // ── SVG ───────────────────────────────────────────────────────────────────
  const lenCache = new WeakMap();
  /** Desenha um caminho (stroke) de 0 a 1. */
  R.draw = (path, k, { reverse = false } = {}) => {
    let L = lenCache.get(path);
    if (L == null) {
      L = path.getTotalLength();
      lenCache.set(path, L);
      path.style.strokeDasharray = `${L} ${L}`;
    }
    const off = L * (1 - R.clamp(k));
    path.style.strokeDashoffset = (reverse ? -off : off).toFixed(2);
  };
  /** Polígono da estrela de 4 pontas (motivo da marca) como string de path. */
  R.starPath = (cx, cy, r, inner = 0.18, rot = 0) => {
    // Pontas curvas, como na logo: curvas quadráticas que puxam para o centro.
    const pts = [];
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2 - Math.PI / 2;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
    for (let i = 0; i < 4; i++) {
      const b = pts[(i + 1) % 4];
      const am = rot + ((i + 0.5) * Math.PI) / 2 - Math.PI / 2;
      const c = [cx + Math.cos(am) * r * inner, cy + Math.sin(am) * r * inner];
      d += ` Q ${c[0].toFixed(2)} ${c[1].toFixed(2)} ${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
    }
    return d + ' Z';
  };

  // ── Cenas ─────────────────────────────────────────────────────────────────
  R.scenes = [];
  R.TL = window.TIMELINE || {};
  R.stage = null;
  R.overlays = [];
  /**
   * Registra uma cena. A janela [start, end] vem de TIMELINE[id] (timeline.js).
   * def: { id, z?, pre?, post?, build(root, def), update(lt, t, def) }.
   * lt = tempo local (0 no start da cena); a cena fica visível de
   * start - pre até end + post, para transições sobrepostas.
   */
  R.scene = (def) => {
    R.scenes.push(def);
    return def;
  };
  /** Camada global por cima de tudo (grão, vinheta...). update(t). */
  R.overlay = (def) => {
    R.overlays.push(def);
    return def;
  };
  R.init = async () => {
    R.stage = document.getElementById('stage');
    const tl = window.TIMELINE || {};
    R.TL = tl;
    const only = new URLSearchParams(location.search).get('scene');
    for (const s of R.scenes) {
      const w = tl[s.id];
      if (!w) {
        console.warn('cena sem janela no TIMELINE:', s.id);
        s.start = 0;
        s.end = 0;
      } else {
        s.start = w.start;
        s.end = w.end;
        s.pre = s.pre ?? w.pre ?? 0;
        s.post = s.post ?? w.post ?? 0;
      }
      s.dur = s.end - s.start;
      s.root = R.h('div', { class: 'scene', id: `scene-${s.id}`, style: { zIndex: String(s.z ?? 10 + R.scenes.indexOf(s)) } });
      R.stage.appendChild(s.root);
      s.build(s.root, s);
      if (only && only !== s.id) s.disabled = true;
    }
    for (const o of R.overlays) {
      o.root = R.h('div', { class: 'overlay', style: { zIndex: String(o.z ?? 1000) } });
      R.stage.appendChild(o.root);
      o.build && o.build(o.root, o);
    }
    await document.fonts.ready;
    // Garante que fontes usadas só em cenas escondidas também estejam prontas.
    const loads = ['400', '500', '600', '700', '800', '900'].flatMap((w) => [
      document.fonts.load(`${w} 40px "Inter"`),
      document.fonts.load(`${w} 40px "Inter Display"`),
    ]);
    loads.push(document.fonts.load('700 40px "Outfit"'), document.fonts.load('800 40px "Outfit"'));
    await Promise.all(loads).catch(() => {});
    R.ready = true;
  };
  R.render = (t) => {
    R.t = t;
    for (const s of R.scenes) {
      const on = !s.disabled && t >= s.start - s.pre && t < s.end + s.post;
      if (on !== s._on) {
        s.root.style.display = on ? 'block' : 'none';
        s._on = on;
      }
      if (on) s.update(t - s.start, t, s);
    }
    for (const o of R.overlays) o.update && o.update(t, o);
  };
  /** Duração total do vídeo. */
  R.duration = () => (window.TIMELINE && window.TIMELINE.__total) || Math.max(...R.scenes.map((s) => s.end + (s.post || 0)));
})();
