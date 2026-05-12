/*
 * KLS Celebrate — a tiny canvas confetti for level-complete moments.
 *
 * Why custom instead of importing canvas-confetti?
 *   1. Zero-CDN ethos — Google Fonts is the project's only external dep.
 *   2. ~110 lines reads as well as a pinned dependency and stays in repo.
 *   3. Particle colors come from the design-system palette automatically.
 *   4. prefers-reduced-motion fallback is a 6-line branch, not a config arg.
 *
 * API:
 *   window.KLS.celebrate.fire({ count?, duration?, origin? })
 *     count    — number of particles (default 80)
 *     duration — total time in ms (default 1800)
 *     origin   — { x:0..1, y:0..1 } in viewport coords (default 0.5, 0.55)
 */
(function () {
  const COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#5FD9A8', '#FFAE5C', '#E5544E'];

  let active = false;

  function reducedMotion() {
    return window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function fire(opts) {
    opts = opts || {};
    const count    = opts.count    || 80;
    const duration = opts.duration || 1800;
    const origin   = opts.origin   || { x: 0.5, y: 0.55 };

    // Reduced-motion fallback: a brief sunshine flash, no particles.
    if (reducedMotion()) {
      const flash = document.createElement('div');
      flash.style.cssText =
        'position:fixed;inset:0;background:#FFD93D;opacity:0;'
        + 'pointer-events:none;z-index:9999;transition:opacity 200ms ease-out;';
      document.body.appendChild(flash);
      requestAnimationFrame(() => { flash.style.opacity = '0.35'; });
      setTimeout(() => { flash.style.opacity = '0'; }, 220);
      setTimeout(() => flash.remove(), 600);
      return;
    }

    if (active) return; // debounce overlapping calls
    active = true;

    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:9999;'
      + 'width:100vw;height:100vh;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    function size() {
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    const onResize = () => size();
    window.addEventListener('resize', onResize);

    const w  = window.innerWidth;
    const h  = window.innerHeight;
    const cx = w * origin.x;
    const cy = h * origin.y;

    const particles = [];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      const speed = 8 + Math.random() * 10;
      particles.push({
        x: cx + (Math.random() - 0.5) * 60,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 8,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.35,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: Math.random() < 0.5 ? 'rect' : 'circle',
      });
    }

    const gravity = 0.35;
    const drag    = 0.99;
    const start   = performance.now();

    function frame(now) {
      const t = now - start;
      const progress = t / duration;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= drag;
        p.vy = p.vy * drag + gravity;
        p.rot += p.vrot;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - progress * 1.1);
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (t < duration) {
        requestAnimationFrame(frame);
      } else {
        window.removeEventListener('resize', onResize);
        canvas.remove();
        active = false;
      }
    }
    requestAnimationFrame(frame);
  }

  window.KLS = window.KLS || {};
  window.KLS.celebrate = { fire };
})();
