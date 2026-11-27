// Page-wide scroll motion (GSAP + ScrollTrigger). Things tilt and slide into place in 3D
// as you scroll, tied to the scroll position. Without JS (or with reduced motion) the CSS
// in motion.css takes over.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

type From = gsap.TweenVars;

// Where each [data-reveal] variant starts from.
const FROM: Record<string, From> = {
  up: { y: 70, rotationX: -22, transformOrigin: '50% 0%' },
  left: { x: -110, rotationY: 24, transformOrigin: '0% 50%' },
  right: { x: 110, rotationY: -24, transformOrigin: '100% 50%' },
  zoom: { y: 80, scale: 0.86, rotationX: 24, transformOrigin: '50% 100%' },
  rise: { y: 180, rotationX: 28, transformOrigin: '50% 100%' },
  // ProductShowcase: the browser window opens like a laptop lid, the phone swings round.
  lid: { rotationX: -62, y: 40, transformOrigin: '50% 100%' },
  phone3d: { y: 220, rotationY: -55, rotationX: 18, transformOrigin: '50% 100%' },
};

function splitHeadline(h1: HTMLElement) {
  const words: HTMLElement[] = [];
  const walk = (node: Node) => {
    Array.from(node.childNodes).forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        (n.textContent ?? '').split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(part);
          const mask = document.createElement('span');
          mask.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:0.08em;margin-bottom:-0.08em';
          const w = document.createElement('span');
          w.style.display = 'inline-block';
          w.textContent = part;
          mask.append(w);
          words.push(w);
          frag.append(mask);
        });
        n.replaceWith(frag);
      } else if (n instanceof HTMLElement && n.tagName !== 'BR') {
        walk(n);
      }
    });
  };
  walk(h1);
  return words;
}

export function startMotion() {
  const reveals = gsap.utils.toArray<HTMLElement>('[data-reveal]');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveals.forEach((el) => el.classList.add('in'));
    return;
  }

  // Hand the reveals over from CSS to GSAP in this same task, so nothing flashes.
  document.documentElement.classList.add('gsap');

  reveals.forEach((el) => {
    const variant = el.dataset.reveal || 'up';
    const i = Number(getComputedStyle(el).getPropertyValue('--i')) || 0;
    gsap.fromTo(
      el,
      { opacity: 0, transformPerspective: 1100, ...(FROM[variant] ?? FROM.up) },
      {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        rotationX: 0,
        rotationY: 0,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: `top ${96 - i * 5}%`,
          end: `top ${58 - i * 5}%`,
          scrub: 0.8,
          onEnter: () => el.classList.add('in'), // child effects (checks, timeline)
        },
      }
    );
  });

  // ---------- Hero ----------
  const h1 = document.querySelector<HTMLElement>('header h1');
  if (h1) {
    h1.classList.remove('gb-rise');
    const words = splitHeadline(h1);
    gsap.set(words, { transformPerspective: 600, transformOrigin: '50% 100%' });
    gsap.from(words, {
      yPercent: 110,
      rotationX: -70,
      duration: 0.9,
      ease: 'power3.out',
      stagger: 0.05,
      delay: 0.1,
    });
  }

  const heroCard = document.querySelector<HTMLElement>('[data-hero-auction]');
  if (heroCard) {
    const photo = heroCard.querySelector('img');
    const layers = heroCard.querySelectorAll<HTMLElement>(':scope > div');

    // Hand the transform over from the CSS load-in once it finishes.
    heroCard.addEventListener(
      'animationend',
      () => {
        heroCard.classList.remove('gb-float-in');
        gsap.set(heroCard, { transformPerspective: 1200 });
        // Pointer tilt: the photo and the floating cards sit at different depths.
        const rx = gsap.quickTo(heroCard, 'rotationX', { duration: 0.6, ease: 'power3.out' });
        const ry = gsap.quickTo(heroCard, 'rotationY', { duration: 0.6, ease: 'power3.out' });
        const moves = Array.from(layers).map((l) => ({
          x: gsap.quickTo(l, 'x', { duration: 0.6, ease: 'power3.out' }),
          y: gsap.quickTo(l, 'y', { duration: 0.6, ease: 'power3.out' }),
        }));
        const move = (px: number, py: number) => {
          rx(-py * 6);
          ry(px * 8);
          moves.forEach((m) => {
            m.x(px * 14);
            m.y(py * 10);
          });
        };
        if (window.matchMedia('(pointer: fine)').matches) {
          heroCard.addEventListener('pointermove', (e) => {
            const r = heroCard.getBoundingClientRect();
            move((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5);
          });
          heroCard.addEventListener('pointerleave', () => move(0, 0));
        }
      },
      { once: true }
    );

    // Scroll away: the photo zooms and drifts, the cards lift off it.
    const tl = gsap.timeline({
      scrollTrigger: { trigger: heroCard, start: 'top top+=80', end: 'bottom top', scrub: 0.6 },
    });
    if (photo) tl.to(photo, { scale: 1.15, yPercent: 8, ease: 'none' }, 0);
    layers.forEach((l, i) => tl.to(l, { yPercent: i === 0 ? -40 : -25, ease: 'none' }, 0));
  }

  // ---------- Guarantees: icons bob gently ----------
  gsap.utils.toArray<HTMLElement>('section[aria-label="Guarantees"] img').forEach((img, i) => {
    gsap.to(img, { y: -6, rotation: i % 2 ? 4 : -4, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: i * 0.3 });
  });

  // ---------- How it works: 3D icons spin round into place ----------
  gsap.utils.toArray<HTMLElement>('#how img').forEach((img) => {
    gsap.fromTo(
      img,
      { rotationY: -180, scale: 0.5, transformPerspective: 500, immediateRender: true },
      {
        rotationY: 0,
        scale: 1,
        ease: 'back.out(1.6)',
        scrollTrigger: { trigger: img, start: 'top 92%', end: 'top 60%', scrub: 0.8 },
      }
    );
  });

  // ---------- Get the app: phones fan out in depth ----------
  const back = document.querySelector<HTMLElement>('.get-app .stage .back');
  const front = document.querySelector<HTMLElement>('.get-app .stage .front');
  if (back && front) {
    const st = { trigger: '.get-app', start: 'top 80%', end: 'bottom 60%', scrub: 0.8 };
    gsap.fromTo(back, { rotationY: 0, rotation: 0, x: 60, transformPerspective: 1000 }, { rotationY: 18, rotation: -6, x: 0, ease: 'none', scrollTrigger: st });
    gsap.fromTo(front, { rotationY: 0, rotation: 0, x: -60, transformPerspective: 1000 }, { rotationY: -14, rotation: 4, x: 0, ease: 'none', scrollTrigger: { ...st } });
  }

  // Fonts and images change heights; re-measure once everything is in.
  window.addEventListener('load', () => ScrollTrigger.refresh());
}
