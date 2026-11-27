// 3D phone scene for the "Why Gadgets Bidding" section.
// A phone spins round from its back to face you as you scroll, with the 3D trust icons
// orbiting it. Its screen mirrors the live hero auction (price, clock, latest bids).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { heroAuction, naira } from '../data/heroAuction';

gsap.registerPlugin(ScrollTrigger);

type Bid = { who: string; amt: string };
type AuctionState = { price: number; clock: string; critical: boolean; count: number; bids: Bid[] };

const W = 0.76; // phone width / height / depth (world units)
const H = 1.56;
const D = 0.085;
const R = 0.12; // corner radius

const ICONS = ['shield', 'phonecheck', 'box', 'wallet', 'truck', 'gavel', 'tag', 'bell'];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Flat rounded-rect geometry with 0..1 UVs (ShapeGeometry's UVs are in shape units). */
function screenGeometry(w: number, h: number, r: number) {
  const g = new THREE.ShapeGeometry(roundedRect(w, h, r), 24);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return g;
}

function buildPhone(screenTex: THREE.Texture) {
  const phone = new THREE.Group();

  const bevel = 0.014;
  const body = new THREE.ExtrudeGeometry(roundedRect(W - bevel * 2, H - bevel * 2, R - bevel), {
    depth: D - bevel * 2,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 6,
    curveSegments: 32,
  });
  body.center();
  const frame = new THREE.MeshPhysicalMaterial({
    color: '#1d2433',
    metalness: 0.85,
    roughness: 0.32,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  });
  phone.add(new THREE.Mesh(body, frame));

  // Glass front (black bezel) and the live screen on top of it.
  const glass = new THREE.Mesh(
    screenGeometry(W - 0.018, H - 0.018, R - 0.009),
    new THREE.MeshPhysicalMaterial({ color: '#05070d', roughness: 0.08, metalness: 0, clearcoat: 1 })
  );
  glass.position.z = D / 2 + 0.0008;
  phone.add(glass);

  const screen = new THREE.Mesh(
    screenGeometry(W - 0.06, H - 0.06, R - 0.03),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })
  );
  screen.position.z = D / 2 + 0.0016;
  phone.add(screen);

  // Back: matte glass with a camera bump.
  const back = new THREE.Mesh(
    screenGeometry(W - 0.018, H - 0.018, R - 0.009),
    new THREE.MeshPhysicalMaterial({ color: '#2a3550', roughness: 0.55, metalness: 0.2, clearcoat: 0.4 })
  );
  back.rotation.y = Math.PI;
  back.position.z = -D / 2 - 0.0008;
  phone.add(back);

  const bumpGeo = new THREE.ExtrudeGeometry(roundedRect(0.3, 0.3, 0.07), {
    depth: 0.012,
    bevelEnabled: true,
    bevelSize: 0.006,
    bevelThickness: 0.006,
    bevelSegments: 4,
    curveSegments: 16,
  });
  const bump = new THREE.Mesh(bumpGeo, frame);
  bump.position.set(-W / 2 + 0.2, H / 2 - 0.2, -D / 2 - 0.02);
  phone.add(bump);

  const lensGlass = new THREE.MeshPhysicalMaterial({ color: '#0a0f1c', roughness: 0.05, metalness: 0.3, clearcoat: 1 });
  const ring = new THREE.MeshStandardMaterial({ color: '#8b93a7', metalness: 1, roughness: 0.25 });
  const lens = (x: number, y: number) => {
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 32), ring);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.022, 32), lensGlass);
    for (const m of [outer, inner]) {
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, -D / 2 - 0.032);
      phone.add(m);
    }
  };
  const bx = -W / 2 + 0.2;
  const by = H / 2 - 0.2;
  lens(bx - 0.065, by + 0.065);
  lens(bx - 0.065, by - 0.065);
  lens(bx + 0.065, by);

  // Side buttons
  const btn = new THREE.MeshStandardMaterial({ color: '#2b3346', metalness: 0.9, roughness: 0.3 });
  const side = (x: number, y: number, h: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, h, 0.03), btn);
    m.position.set(x, y, 0);
    phone.add(m);
  };
  side(W / 2 + 0.004, 0.32, 0.2);
  side(-W / 2 - 0.004, 0.42, 0.1);
  side(-W / 2 - 0.004, 0.26, 0.1);

  return phone;
}

/** Draws the auction screen into a canvas; the texture is refreshed on every hero tick. */
function makeScreen(deviceImg: HTMLImageElement) {
  const cw = 700;
  const ch = Math.round((cw * (H - 0.06)) / (W - 0.06));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  };

  const draw = (s: AuctionState) => {
    const pad = 44;
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, cw, ch);

    // Status bar + island
    g.fillStyle = '#0B1220';
    g.font = '600 30px Manrope, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('9:41', pad + 10, 58);
    rr(cw / 2 - 110, 26, 220, 64, 32);
    g.fill();

    // Product image
    rr(pad, 130, cw - pad * 2, 520, 36);
    g.fillStyle = '#E8EEFF';
    g.fill();
    if (deviceImg.complete && deviceImg.naturalWidth) g.drawImage(deviceImg, cw / 2 - 220, 170, 440, 440);

    // Countdown chip
    g.font = '700 30px Manrope, sans-serif';
    const clockW = g.measureText(s.clock).width + 40;
    rr(pad + 24, 154, clockW, 52, 26);
    g.fillStyle = s.critical ? '#E5484D' : '#FF7A1A';
    g.fill();
    g.fillStyle = '#170A02';
    g.fillText(s.clock, pad + 44, 181);

    // Title + price
    g.fillStyle = '#5E6B8C';
    g.font = '500 24px "JetBrains Mono", monospace';
    g.fillText('LIVE · INSPECTED', pad, 700);
    g.fillStyle = '#0B1220';
    g.font = '500 40px Sora, sans-serif';
    g.fillText('iPhone 15 Pro · 256 GB', pad, 752);
    g.font = '600 76px Sora, sans-serif';
    g.fillText(naira(s.price), pad, 836);
    g.fillStyle = '#5E6B8C';
    g.font = '500 28px Manrope, sans-serif';
    g.fillText(`${s.count} bids`, pad, 892);

    // Latest bids
    g.font = '500 22px "JetBrains Mono", monospace';
    g.fillText('LIVE BIDS', pad, 960);
    s.bids.slice(0, 3).forEach((b, i) => {
      const y = 1020 + i * 78;
      g.beginPath();
      g.arc(pad + 26, y, 26, 0, Math.PI * 2);
      g.fillStyle = i === 0 ? '#3366FF' : '#EEF3FF';
      g.fill();
      g.fillStyle = i === 0 ? '#FFFFFF' : '#1F4FE6';
      g.font = '700 20px Manrope, sans-serif';
      g.textAlign = 'center';
      g.fillText(b.who.slice(0, 2).toUpperCase(), pad + 26, y + 1);
      g.textAlign = 'left';
      g.fillStyle = '#4A5878';
      g.font = '500 28px Manrope, sans-serif';
      g.fillText(b.who, pad + 70, y);
      g.fillStyle = '#0B1220';
      g.font = '700 28px Manrope, sans-serif';
      g.textAlign = 'right';
      g.fillText(b.amt, cw - pad, y);
      g.textAlign = 'left';
    });

    // Bid button
    rr(pad, ch - 190, cw - pad * 2, 96, 24);
    g.fillStyle = '#3366FF';
    g.fill();
    g.fillStyle = '#FFFFFF';
    g.font = '600 34px Manrope, sans-serif';
    g.textAlign = 'center';
    g.fillText(`Bid ${naira(s.price + heroAuction.step)}`, cw / 2, ch - 141);
    g.textAlign = 'left';

    // Home indicator
    rr(cw / 2 - 90, ch - 40, 180, 10, 5);
    g.fillStyle = '#0B1220';
    g.fill();

    tex.needsUpdate = true;
  };

  return { tex, draw };
}

function softShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(20,28,60,0.28)');
  grad.addColorStop(1, 'rgba(20,28,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.42),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Wraps each word of the statement so it can light up as you scroll. Highlight chips stay whole. */
function splitWords(p: HTMLElement) {
  const units: HTMLElement[] = [];
  Array.from(p.childNodes).forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const frag = document.createDocumentFragment();
      (n.textContent ?? '').split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) return frag.append(part);
        const s = document.createElement('span');
        s.textContent = part;
        units.push(s);
        frag.append(s);
      });
      n.replaceWith(frag);
    } else if (n instanceof HTMLElement) {
      units.push(n);
    }
  });
  return units;
}

export function startScene(root: HTMLElement, canvas: HTMLCanvasElement) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return; // No WebGL: the flat phone image stays.
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight('#ffffff', 1.4);
  key.position.set(2, 3, 4);
  scene.add(key, new THREE.AmbientLight('#dfe6ff', 0.4));

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

  // Screen
  const deviceImg = new Image();
  deviceImg.src = '/img/devices/phone.svg';
  const screen = makeScreen(deviceImg);
  let state: AuctionState = {
    price: heroAuction.price,
    clock: '01:15',
    critical: false,
    count: heroAuction.count,
    bids: [
      { who: 'tk_gadgets', amt: naira(heroAuction.price) },
      { who: 'kemi.n', amt: naira(heroAuction.price - heroAuction.step) },
      { who: 'jide_o', amt: naira(heroAuction.price - heroAuction.step * 2) },
    ],
  };
  const redraw = () => screen.draw(state);
  document.fonts.ready.then(redraw);
  deviceImg.onload = redraw;
  redraw();
  window.addEventListener('gb:auction', (e) => {
    state = (e as CustomEvent<AuctionState>).detail;
    redraw();
  });

  const phone = buildPhone(screen.tex);
  const rig = new THREE.Group(); // scroll + pointer move the rig; idle float moves the phone
  rig.add(phone);
  scene.add(rig);

  const shadow = softShadow();
  shadow.position.y = -H / 2 - 0.22;
  scene.add(shadow);

  // Orbiting 3D icons
  const loader = new THREE.TextureLoader();
  const icons = ICONS.map((name, i) => {
    const tex = loader.load(`/img/icons-256/${name}.png`);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const size = 0.34 + (i % 3) * 0.06;
    sprite.scale.set(size, size, 1);
    scene.add(sprite);
    return {
      sprite,
      angle: (i / ICONS.length) * Math.PI * 2,
      y: ((i % 4) - 1.5) * 0.42,
      speed: 0.12 + (i % 3) * 0.04,
      phase: i * 1.3,
    };
  });

  // Statement words light up with the scroll.
  const text = root.querySelector<HTMLElement>('[data-scene-text]');
  const words = text ? splitWords(text) : [];

  let progress = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  const apply = () => {
    const n = words.length;
    words.forEach((w, i) => {
      const t = Math.min(1, Math.max(0, progress * 1.4 * n - i));
      w.style.opacity = String(0.18 + 0.82 * t);
    });
  };

  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px)', () => {
    ScrollTrigger.create({
      trigger: root,
      pin: root.querySelector('[data-scene-pin]'),
      start: 'top top',
      end: '+=140%',
      scrub: 0.6,
      onUpdate: (st) => {
        progress = st.progress;
        apply();
      },
    });
  });
  mm.add('(max-width: 899px)', () => {
    ScrollTrigger.create({
      trigger: root,
      start: 'top 80%',
      end: 'bottom 30%',
      scrub: 0.6,
      onUpdate: (st) => {
        progress = st.progress;
        apply();
      },
    });
  });
  apply();
  ScrollTrigger.refresh();

  const stage = canvas.parentElement!;
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  stage.addEventListener('pointerleave', () => {
    pointer.tx = 0;
    pointer.ty = 0;
  });

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = stage;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole phone and its orbit in frame on narrow stages.
    camera.position.set(0, 0.05, camera.aspect < 0.9 ? 5.6 : 4.3);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(stage);

  const clock = new THREE.Clock();
  let shown = 0; // smoothed progress
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || document.hidden) return;
    const t = clock.elapsedTime;

    shown += (progress - shown) * Math.min(1, dt * 6);
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 4);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 4);
    const p = ease(Math.min(1, shown * 1.25));

    // From its back, tipped over, to facing you.
    rig.rotation.y = lerp(-Math.PI * 1.15, 0.22, p) + pointer.x * 0.25;
    rig.rotation.x = lerp(0.55, -0.06, p) + pointer.y * 0.15;
    rig.rotation.z = lerp(-0.35, 0, p);
    rig.position.y = lerp(-0.2, 0, p);
    rig.scale.setScalar(lerp(0.82, 1, p));

    phone.position.y = Math.sin(t * 1.1) * 0.035;
    phone.rotation.z = Math.sin(t * 0.7) * 0.015;
    shadow.scale.setScalar(1 - Math.sin(t * 1.1) * 0.05);

    const radius = lerp(1.7, 1.15, p);
    icons.forEach((ic) => {
      const a = ic.angle + t * ic.speed + shown * Math.PI * 1.3;
      ic.sprite.position.set(
        Math.cos(a) * radius,
        ic.y + Math.sin(t * 0.9 + ic.phase) * 0.06,
        Math.sin(a) * radius * 0.7
      );
      // Fade the ones behind the phone a little for depth.
      ic.sprite.material.opacity = 0.55 + 0.45 * ((Math.sin(a) + 1) / 2);
    });

    renderer.render(scene, camera);
  });

  root.classList.add('is-3d');
}
