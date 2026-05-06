// ===== AUDIO ENGINE =====
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let actx;
function initAudio() { if (!actx) actx = new AudioCtx(); }
function tone(f, t, d, v) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.connect(g); g.connect(actx.destination);
  o.type = t; o.frequency.setValueAtTime(f, actx.currentTime);
  g.gain.setValueAtTime(v || 0.1, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + d);
  o.start(); o.stop(actx.currentTime + d);
}
function noiseBurst({ duration = 0.08, volume = 0.12, type = 'bandpass', frequency = 900, q = 0.8, attack = 0.004 } = {}) {
  if (!actx) return;
  const samples = Math.max(1, Math.floor(actx.sampleRate * duration));
  const buffer = actx.createBuffer(1, samples, actx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;

  const src = actx.createBufferSource();
  const filter = actx.createBiquadFilter();
  const gain = actx.createGain();
  src.buffer = buffer;
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, actx.currentTime);
  filter.Q.setValueAtTime(q, actx.currentTime);
  gain.gain.setValueAtTime(0.001, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, actx.currentTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + duration);
  src.connect(filter); filter.connect(gain); gain.connect(actx.destination);
  src.start(); src.stop(actx.currentTime + duration);
}
function punchThump(power = 1) {
  if (!actx) return;
  const now = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(105 * power, now);
  o.frequency.exponentialRampToValueAtTime(48, now + 0.11);
  g.gain.setValueAtTime(0.001, now);
  g.gain.exponentialRampToValueAtTime(0.18 * power, now + 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  o.connect(g); g.connect(actx.destination);
  o.start(now); o.stop(now + 0.16);
}
function sndHit() {
  punchThump(0.9 + Math.random() * 0.15);
  noiseBurst({ duration: 0.055, volume: 0.11, frequency: 950 + Math.random() * 350, q: 1.4 });
  noiseBurst({ duration: 0.026, volume: 0.06, type: 'highpass', frequency: 1800, q: 0.4 });
}
function sndCrit() {
  punchThump(1.35);
  noiseBurst({ duration: 0.075, volume: 0.18, frequency: 1250, q: 1.8 });
  noiseBurst({ duration: 0.038, volume: 0.13, type: 'highpass', frequency: 2400, q: 0.5 });
  tone(72, 'sine', 0.18, 0.08);
}
function sndRubber() { tone(500, 'sine', 0.15, 0.18); tone(250, 'triangle', 0.2, 0.12); tone(700, 'sine', 0.1, 0.08); }
function sndBoss() {
  punchThump(1.15);
  noiseBurst({ duration: 0.09, volume: 0.16, frequency: 620, q: 1.1 });
  tone(62, 'sawtooth', 0.18, 0.12);
}
function sndJump() { tone(450, 'sine', 0.08, 0.07); tone(650, 'sine', 0.06, 0.05); }
function sndKO() { tone(100, 'sawtooth', 0.6, 0.2); tone(60, 'square', 0.7, 0.18); }
function sndStep() { tone(120, 'square', 0.04, 0.04); }

// ===== CONSTANTS =====
const W = 900, H = 500, GROUND = 425, GRAVITY = 1900, JUMP_VEL = -640, MOVE_SPD = 290;
const HERO_HP = 115, BOSS_HP = 280;
const PUNCH_DMG = 9, KICK_DMG = 12, RUBBER_DMG = 21, GIANT_DMG = 34, BOSS_DMG = 27;
const HERO_CRIT_CHANCE = 0.16, BOSS_CRIT_CHANCE = 0.34, CRIT_MULT = 2.2;
const ATK_RANGE = 55, KICK_RANGE = 70, RUBBER_RANGE = 118, GIANT_RANGE = 310;
const RUBBER_CD = 1.3, GIANT_CD = 2.4;

// Animation phase durations (seconds)
const WINDUP_DUR = 0.17;  // anticipation pull-back
const STRIKE_DUR = 0.07;  // fast forward
const HOLD_DUR = 0.08;  // hit-stop freeze
const RECOVER_DUR = 0.32;  // return to stance
const HITSTUN_DUR = 0.24;  // receiver recoil
const HERO_ATK_CD = 0.42, BOSS_ATK_CD = 0.24;

function approach(value, target, maxDelta) {
  if (value < target) return Math.min(target, value + maxDelta);
  if (value > target) return Math.max(target, value - maxDelta);
  return target;
}

// ===== EFFECTS =====
const fx = {
  shakeTime: 0, shakeStr: 0, slowTime: 0, slowFactor: 1,
  hitStopTime: 0,
  zoomTime: 0, zoomAmt: 1, zoomCx: 0, zoomCy: 0,
  flashTime: 0, flashColor: 'white',
  particles: [], texts: [],
  shake(s, d) { this.shakeStr = s; this.shakeTime = d; },
  hitStop(d) { this.hitStopTime = Math.max(this.hitStopTime, d); },
  slow(f, d) { this.slowFactor = f; this.slowTime = d; },
  zoom(a, cx, cy, d) { if (camera) camera.focus(cx, cy, d, a - 1); },
  flash(c, d) { this.flashColor = c; this.flashTime = d; },
  burst(x, y, n, col, mn, mx) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = mn + Math.random() * (mx - mn);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .35 + Math.random() * .35, ml: .7, r: 2 + Math.random() * 4, color: col });
    }
  },
  text(x, y, t, c, s) { this.texts.push({ x, y, t, c, s: s || 20, life: 1.2, vy: -90 }); },
  update(dt) {
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    this.hitStopTime = Math.max(0, this.hitStopTime - dt);
    this.slowTime = Math.max(0, this.slowTime - dt); if (this.slowTime <= 0) this.slowFactor = 1;
    this.zoomTime = Math.max(0, this.zoomTime - dt); if (this.zoomTime <= 0) this.zoomAmt = 1;
    this.flashTime = Math.max(0, this.flashTime - dt);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const t of this.texts) { t.y += t.vy * dt; t.life -= dt; }
    this.texts = this.texts.filter(t => t.life > 0);
  },
  reset() {
    this.particles = []; this.texts = []; this.shakeTime = 0; this.slowTime = 0;
    this.hitStopTime = 0;
    this.zoomTime = 0; this.flashTime = 0; this.slowFactor = 1; this.zoomAmt = 1;
  }
};

// ===== CINEMATIC CAMERA =====
const camera = {
  x: W / 2,
  y: H / 2,
  zoom: 1,
  targetX: W / 2,
  targetY: H / 2,
  targetZoom: 1,
  focusX: W / 2,
  focusY: H / 2,
  focusTime: 0,
  focusDur: 0,
  zoomKick: 0,
  shakeX: 0,
  shakeY: 0,

  reset() {
    this.x = W / 2; this.y = H / 2; this.zoom = 1;
    this.targetX = W / 2; this.targetY = H / 2; this.targetZoom = 1;
    this.focusX = W / 2; this.focusY = H / 2;
    this.focusTime = 0; this.focusDur = 0; this.zoomKick = 0;
    this.shakeX = 0; this.shakeY = 0;
  },

  focus(x, y, duration, zoomBonus) {
    this.focusX = Math.clamp(x, 120, W - 120);
    this.focusY = Math.clamp(y, 170, GROUND - 40);
    this.focusTime = Math.max(this.focusTime, duration);
    this.focusDur = Math.max(this.focusDur, duration);
    this.zoomKick = Math.max(this.zoomKick, zoomBonus || 0);
  },

  hit(x, y, strength) {
    this.focus(x, y, 0.14 + strength * 0.22, 0.04 + strength * 0.12);
  },

  update(player, enemy, dt) {
    const dist = Math.max(180, Math.abs(player.x - enemy.x));
    const left = Math.min(player.x, enemy.x);
    const right = Math.max(player.x, enemy.x);
    const midX = (player.x + enemy.x) / 2;
    const highest = Math.min(player.y, enemy.y);
    const jumpLift = Math.clamp((GROUND - highest) * 0.22, 0, 42);

    let baseZoom = Math.clamp(600 / dist, 0.8, 1.2);
    const neededZoom = Math.clamp((W - 120) / Math.max(1, right - left + 150), 0.7, 1.2);
    baseZoom = Math.min(baseZoom, neededZoom);

    this.targetX = Math.clamp(midX, W / 2 / baseZoom, W - W / 2 / baseZoom);
    this.targetY = 250 - jumpLift;
    this.targetZoom = baseZoom;

    if (this.focusTime > 0) {
      const focusBlend = Math.clamp(this.focusTime / Math.max(0.001, this.focusDur), 0, 1);
      this.targetX = lerp(this.targetX, this.focusX, focusBlend * 0.75);
      this.targetY = lerp(this.targetY, this.focusY, focusBlend * 0.45);
      this.targetZoom += this.zoomKick * focusBlend;
      this.focusTime = Math.max(0, this.focusTime - dt);
      this.zoomKick *= Math.pow(0.08, dt);
      if (this.focusTime <= 0) {
        this.focusDur = 0;
        this.zoomKick = 0;
      }
    }

    const follow = Math.min(1, dt * 5.2);
    const zoomFollow = Math.min(1, dt * 6.4);
    this.x += (this.targetX - this.x) * follow;
    this.y += (this.targetY - this.y) * follow;
    this.zoom += (this.targetZoom - this.zoom) * zoomFollow;
    this.zoom = Math.clamp(this.zoom, 0.7, 1.5);

    if (fx.shakeTime > 0) {
      const fade = Math.clamp(fx.shakeTime * 7, 0, 1);
      this.shakeX = (Math.random() - 0.5) * fx.shakeStr * 2 * fade;
      this.shakeY = (Math.random() - 0.5) * fx.shakeStr * 2 * fade;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  },

  apply(ctx) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x + this.shakeX, -this.y + this.shakeY);
  },

  cssTransform() {
    return `translate(${W / 2}px, ${H / 2}px) scale(${this.zoom}) translate(${-this.x + this.shakeX}px, ${-this.y + this.shakeY}px)`;
  }
};

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function createLimb(x1, y1, x2, y2, color, width, glow) {
  return svgEl('line', {
    x1, y1, x2, y2,
    stroke: color,
    'stroke-width': width,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    filter: glow ? 'url(#heroLineGlow)' : ''
  });
}

function createFighterSVG(f) {
  const root = svgEl('svg', {
    class: `fighterSvg ${f.isHero ? 'hero' : 'enemy'}`,
    viewBox: '0 0 150 150',
    'aria-hidden': 'true'
  });

  const defs = svgEl('defs');
  const heroGlow = svgEl('filter', { id: 'heroLineGlow', x: '-80%', y: '-80%', width: '260%', height: '260%' });
  heroGlow.append(svgEl('feGaussianBlur', { stdDeviation: '1.35', result: 'blur' }));
  const heroMerge = svgEl('feMerge');
  heroMerge.append(svgEl('feMergeNode', { in: 'blur' }), svgEl('feMergeNode', { in: 'SourceGraphic' }));
  heroGlow.append(heroMerge);
  const shadowAura = svgEl('filter', { id: 'shadowEyeGlow', x: '-120%', y: '-120%', width: '340%', height: '340%' });
  shadowAura.append(svgEl('feGaussianBlur', { stdDeviation: '1.9', result: 'blur' }));
  const shadowMerge = svgEl('feMerge');
  shadowMerge.append(svgEl('feMergeNode', { in: 'blur' }), svgEl('feMergeNode', { in: 'SourceGraphic' }));
  shadowAura.append(shadowMerge);
  defs.append(heroGlow, shadowAura);
  root.append(defs);

  const aura = svgEl('g', { opacity: f.isHero ? '0.32' : '0.42' });
  if (f.isHero) {
    aura.append(
      svgEl('path', { d: 'M58 42 C46 72 50 110 66 134', fill: 'none', stroke: '#e9fbff', 'stroke-width': 1.3, 'stroke-linecap': 'round', filter: 'url(#heroLineGlow)' }),
      svgEl('path', { d: 'M92 42 C103 72 99 111 84 134', fill: 'none', stroke: '#e9fbff', 'stroke-width': 1.3, 'stroke-linecap': 'round', filter: 'url(#heroLineGlow)' })
    );
  } else {
    aura.append(
      svgEl('path', { d: 'M57 36 C46 70 43 112 55 141', fill: 'none', stroke: '#570006', 'stroke-width': 1.1, 'stroke-linecap': 'round', opacity: '0.55' }),
      svgEl('path', { d: 'M93 36 C104 70 107 112 95 141', fill: 'none', stroke: '#570006', 'stroke-width': 1.1, 'stroke-linecap': 'round', opacity: '0.55' })
    );
  }
  root.append(aura);

  const skeleton = svgEl('g');
  const color = f.isHero ? '#f0b07e' : '#070008';
  const alt = f.isHero ? '#d99668' : '#111017';
  const heroCloth = '#f8fbff';
  const heroClothShade = '#dfe7f7';
  const joint = f.isHero ? '#f7c197' : '#1a151f';
  const limbW = f.isHero ? 5 : 6;
  const backW = f.isHero ? 4.4 : 5.3;

  const backLeg = svgEl('g');
  const backThigh = createLimb(75, 94, 75, 119, f.isHero ? heroClothShade : alt, backW + (f.isHero ? 0.4 : 0), f.isHero);
  const backForeLeg = svgEl('g');
  const backShin = createLimb(75, 119, 75, 143, f.isHero ? heroClothShade : alt, backW + (f.isHero ? 0.4 : 0), f.isHero);
  const backFoot = svgEl('path', { d: 'M69 143 L82 143', stroke: f.isHero ? alt : alt, 'stroke-width': backW * 0.72, 'stroke-linecap': 'round' });
  backForeLeg.append(backShin, backFoot);
  backLeg.append(backThigh, backForeLeg);

  const frontLeg = svgEl('g');
  const frontThigh = createLimb(75, 94, 75, 119, f.isHero ? heroCloth : color, limbW + (f.isHero ? 0.5 : 0), f.isHero);
  const frontForeLeg = svgEl('g');
  const frontShin = createLimb(75, 119, 75, 144, f.isHero ? heroCloth : color, limbW + (f.isHero ? 0.5 : 0), f.isHero);
  const frontFoot = svgEl('path', { d: 'M69 144 L83 144', stroke: color, 'stroke-width': limbW * 0.72, 'stroke-linecap': 'round', filter: f.isHero ? 'url(#heroLineGlow)' : '' });
  frontForeLeg.append(frontShin, frontFoot);
  frontLeg.append(frontThigh, frontForeLeg);

  const heroPants = f.isHero ? svgEl('g') : null;
  let backPant = null, frontPant = null, backPantCuff = null, frontPantCuff = null;
  if (f.isHero) {
    backPant = svgEl('path', { fill: '#eef5ff', stroke: '#dfe7f7', 'stroke-width': 1.2, 'stroke-linejoin': 'round', filter: 'url(#heroLineGlow)' });
    frontPant = svgEl('path', { fill: '#f8fbff', stroke: '#dfe7f7', 'stroke-width': 1.2, 'stroke-linejoin': 'round', filter: 'url(#heroLineGlow)' });
    backPantCuff = svgEl('path', { fill: 'none', stroke: '#ffffff', 'stroke-width': 4.2, 'stroke-linecap': 'round', filter: 'url(#heroLineGlow)' });
    frontPantCuff = svgEl('path', { fill: 'none', stroke: '#ffffff', 'stroke-width': 4.2, 'stroke-linecap': 'round', filter: 'url(#heroLineGlow)' });
    heroPants.append(
      backPant,
      frontPant,
      backPantCuff,
      frontPantCuff
    );
  }

  const backArm = svgEl('g');
  const backUpper = createLimb(75, 60, 75, 82, alt, backW, f.isHero);
  const backFore = svgEl('g');
  const backForeLine = createLimb(75, 82, 75, 103, alt, backW, f.isHero);
  const backFist = svgEl('circle', { cx: 75, cy: 103, r: f.isHero ? 3.4 : 4.2, fill: alt, filter: f.isHero ? 'url(#heroLineGlow)' : '' });
  backFore.append(backForeLine, backFist);
  backArm.append(backUpper, backFore);

  const frontArm = svgEl('g');
  const frontUpper = createLimb(75, 60, 75, 82, color, limbW, f.isHero);
  const frontFore = svgEl('g');
  const frontForeLine = createLimb(75, 82, 75, 104, color, limbW, f.isHero);
  const fist = svgEl('circle', { cx: 75, cy: 104, r: f.isHero ? 4.2 : 5, fill: f.isHero ? '#ffffff' : '#090008', filter: f.isHero ? 'url(#heroLineGlow)' : '' });
  frontFore.append(frontForeLine, fist);
  frontArm.append(frontUpper, frontFore);

  const body = svgEl('g');
  if (f.isHero) {
    body.append(
      svgEl('path', { d: 'M60 61 Q75 52 90 61 L86 88 Q80 99 70 99 Q63 91 60 82 Z', fill: '#f0b07e', stroke: '#6f3b25', 'stroke-width': 1.1, 'stroke-linejoin': 'round' }),
      svgEl('path', { d: 'M59 84 C68 90 82 90 91 84 L93 94 C84 102 66 102 57 94 Z', fill: '#7650b6', stroke: '#51337e', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }),
      svgEl('path', { d: 'M67 65 L72 82 M78 65 L75 82 M70 71 L81 71', fill: 'none', stroke: '#8a4c2b', 'stroke-width': 1, 'stroke-linecap': 'round', opacity: '0.7' }),
      svgEl('path', { d: 'M65 61 C69 64 81 64 85 61', fill: 'none', stroke: '#6f3b25', 'stroke-width': 1, 'stroke-linecap': 'round', opacity: '0.55' }),
      svgEl('path', { d: 'M87 91 C99 95 108 101 118 112 C106 108 96 111 86 101 Z', fill: '#7650b6', stroke: '#51337e', 'stroke-width': 1, 'stroke-linejoin': 'round', opacity: '0.95' })
    );
  } else {
    body.append(
      svgEl('path', { d: 'M57 50 C52 68 51 93 48 113 C45 127 39 134 35 141 C44 148 61 150 75 149 C89 150 106 148 115 141 C111 133 105 127 102 113 C99 92 98 68 93 50 C85 45 65 45 57 50 Z', fill: '#020203', stroke: '#09040a', 'stroke-width': 1.3, 'stroke-linejoin': 'round' }),
      svgEl('path', { d: 'M57 58 L43 83 L55 82 M93 58 L108 83 L95 82', fill: '#020203', stroke: '#020203', 'stroke-width': 4.8, 'stroke-linejoin': 'round' }),
      svgEl('path', { d: 'M63 54 C59 76 59 113 56 138 M88 54 C92 76 92 113 94 138', fill: 'none', stroke: '#090006', 'stroke-width': 1.1, opacity: '0.7' })
    );
  }

  const head = svgEl('g');
  if (f.isHero) {
    head.append(
      svgEl('path', { d: 'M51 39 C43 31 49 20 60 23 L57 13 C64 17 69 10 75 17 L78 6 C83 14 95 14 91 25 L101 17 C101 27 108 34 99 43 L104 34 C96 48 95 55 86 54 C78 58 66 56 60 53 L58 44 C55 51 48 48 51 39 Z', fill: '#ffffff', stroke: '#eafdff', 'stroke-width': 1.3, filter: 'url(#heroLineGlow)' }),
      svgEl('path', { d: 'M55 34 C48 29 53 22 61 25 C59 17 68 15 72 22 C78 13 88 18 85 28 C94 28 97 36 90 41', fill: 'none', stroke: '#d0d2da', 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
      svgEl('path', { d: 'M61 43 C56 44 56 37 62 37 M71 29 C77 27 79 35 72 36 M84 41 C91 39 92 47 85 47', fill: 'none', stroke: '#9f9aa0', 'stroke-width': 1.3, 'stroke-linecap': 'round' }),
      svgEl('path', { d: 'M62 40 Q64 29 75 27 Q87 29 89 40 Q88 53 75 56 Q64 53 62 40 Z', fill: '#f0b07e', stroke: '#6f3b25', 'stroke-width': 1.2 }),
      svgEl('path', { d: 'M57 37 C62 25 68 33 71 21 L74 12 C76 26 82 21 85 32 L93 24 C90 34 96 39 89 44 C82 38 68 38 60 45 L60 36 C56 43 52 41 57 37 Z', fill: '#ffffff', stroke: '#eafdff', 'stroke-width': 1.2, filter: 'url(#heroLineGlow)' }),
      svgEl('ellipse', { cx: 70, cy: 41, rx: 2.7, ry: 3.4, fill: '#1b1e28' }),
      svgEl('ellipse', { cx: 82, cy: 40.5, rx: 2.7, ry: 3.4, fill: '#1b1e28' }),
      svgEl('circle', { cx: 69.2, cy: 39.7, r: 0.8, fill: '#ffffff' }),
      svgEl('circle', { cx: 81.2, cy: 39.2, r: 0.8, fill: '#ffffff' }),
      svgEl('path', { d: 'M67 47 C72 53 81 53 86 46 C82 50 72 50 67 47 Z', fill: '#2a1510', stroke: '#2a1510', 'stroke-width': 0.8 }),
      svgEl('path', { d: 'M72 50 C76 51 80 50 83 48', fill: 'none', stroke: '#ffffff', 'stroke-width': 1, 'stroke-linecap': 'round' }),
      svgEl('path', { d: 'M63 36 L68 34 M83 34 L88 36', fill: 'none', stroke: '#6f3b25', 'stroke-width': 1.1, 'stroke-linecap': 'round' })
    );
  } else {
    head.append(
      svgEl('path', { d: 'M58 47 C59 32 65 24 75 24 C85 24 91 32 92 47 L92 58 L58 58 Z', fill: '#020203', stroke: '#080409', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }),
      svgEl('path', { d: 'M71 25 L68 1 L73 25 M79 25 L84 1 L80 25', fill: 'none', stroke: '#020203', 'stroke-width': 3.8, 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter' }),
      svgEl('path', { d: 'M69 42 L73 41 M80 41 L84 42', fill: 'none', stroke: '#ff3333', 'stroke-width': 2.1, 'stroke-linecap': 'round', filter: 'url(#shadowEyeGlow)' }),
      svgEl('circle', { cx: 71, cy: 41.5, r: 1.3, fill: '#ffd6d6' }),
      svgEl('circle', { cx: 82, cy: 41.5, r: 1.3, fill: '#ffd6d6' })
    );
  }

  if (f.isHero) skeleton.append(backLeg, backArm, frontLeg, body, heroPants, frontArm, head);
  else skeleton.append(backLeg, backArm, frontLeg, frontArm, body, head);
  root.append(skeleton);

  const parts = {
    root, skeleton, aura, body, head, heroPants, backPant, frontPant, backPantCuff, frontPantCuff,
    backLeg, frontLeg, backArm, frontArm,
    backThigh, backShin, backForeLeg, backFoot,
    frontThigh, frontShin, frontForeLeg, frontFoot,
    backUpper, backFore, backForeLine, backFist,
    frontUpper, frontFore, frontForeLine, fist
  };
  cameraLayer.append(root);
  return parts;
}

function setRot(el, angle, cx, cy) {
  el.setAttribute('transform', `rotate(${angle.toFixed(2)} ${cx} ${cy})`);
}

function setLineX2(line, x2) {
  line.setAttribute('x2', x2.toFixed(2));
}

function pointFromAngle(x, y, len, angleDeg) {
  const a = angleDeg * Math.PI / 180;
  return { x: x + Math.sin(a) * len, y: y + Math.cos(a) * len };
}

function setLinePoints(line, a, b) {
  line.setAttribute('x1', a.x.toFixed(2));
  line.setAttribute('y1', a.y.toFixed(2));
  line.setAttribute('x2', b.x.toFixed(2));
  line.setAttribute('y2', b.y.toFixed(2));
}

function setFootPath(path, x, y, forward, wide) {
  const heel = x - forward * wide * 0.42;
  const toe = x + forward * wide * 0.58;
  const strapX = x + forward * wide * 0.12;
  path.setAttribute('d', `M${heel.toFixed(2)} ${y.toFixed(2)} L${toe.toFixed(2)} ${y.toFixed(2)} M${strapX.toFixed(2)} ${(y - 2).toFixed(2)} L${(strapX + forward * 4).toFixed(2)} ${(y + 1).toFixed(2)}`);
}

function setCirclePos(circle, x, y, r) {
  circle.setAttribute('cx', x.toFixed(2));
  circle.setAttribute('cy', y.toFixed(2));
  if (r !== undefined) circle.setAttribute('r', r);
}

function setJointLimb(upperLine, lowerLine, start, upperLen, lowerLen, upperAngle, lowerRelAngle) {
  const elbow = pointFromAngle(start.x, start.y, upperLen, upperAngle);
  const end = pointFromAngle(elbow.x, elbow.y, lowerLen, upperAngle + lowerRelAngle);
  setLinePoints(upperLine, start, elbow);
  setLinePoints(lowerLine, elbow, end);
  return { joint: elbow, end };
}

function setPantLeg(pant, cuff, hip, knee, ankle, hipW, kneeW, cuffW) {
  const cuffY = ankle.y - 5;
  pant.setAttribute('d',
    `M${(hip.x - hipW).toFixed(2)} ${hip.y.toFixed(2)} ` +
    `L${(hip.x + hipW).toFixed(2)} ${hip.y.toFixed(2)} ` +
    `Q${(knee.x + kneeW).toFixed(2)} ${knee.y.toFixed(2)} ${(ankle.x + cuffW).toFixed(2)} ${cuffY.toFixed(2)} ` +
    `L${(ankle.x - cuffW).toFixed(2)} ${cuffY.toFixed(2)} ` +
    `Q${(knee.x - kneeW).toFixed(2)} ${knee.y.toFixed(2)} ${(hip.x - hipW).toFixed(2)} ${hip.y.toFixed(2)} Z`);
  cuff.setAttribute('d',
    `M${(ankle.x - cuffW - 1).toFixed(2)} ${cuffY.toFixed(2)} ` +
    `L${(ankle.x + cuffW + 1).toFixed(2)} ${cuffY.toFixed(2)}`);
}

function clearPoseTransforms(v) {
  v.frontArm.removeAttribute('transform');
  v.frontFore.removeAttribute('transform');
  v.backArm.removeAttribute('transform');
  v.backFore.removeAttribute('transform');
  v.frontLeg.removeAttribute('transform');
  v.frontForeLeg.removeAttribute('transform');
  v.backLeg.removeAttribute('transform');
  v.backForeLeg.removeAttribute('transform');
}

function updateFighterSVG(f) {
  if (!f.visual) return;
  const v = f.visual;
  clearPoseTransforms(v);
  const t = f.animT || 0;
  const breathe = Math.sin(f.bounceT * (f.isHero ? 2.4 : 1.5));
  const walk = Math.sin(f.walkCycle * (f.isHero ? 1.15 : 0.85));
  const hit = f.animState === 'hitstun';
  const punch = f.attackMove !== 'kick' && (f.animState === 'windup' || f.animState === 'strike' || f.animState === 'hold' || f.animState === 'recover');
  const kick = f.attackMove === 'kick' && (f.animState === 'windup' || f.animState === 'strike' || f.animState === 'hold' || f.animState === 'recover');
  const special = (f.atkType === 'rubber' || f.atkType === 'giant') && (f.animState === 'strike' || f.animState === 'hold');

  let torso = f.isHero ? 10 + breathe * 1.1 : 2 + breathe * 0.18;
  let bodyX = f.isHero ? 1.5 + breathe * 0.7 : 0;
  let bodyDrop = f.isHero ? Math.abs(breathe) * 1.6 : Math.abs(breathe) * 0.25;
  let frontArm = f.isHero ? 58 + breathe * 2.2 : 12 + breathe * 0.25;
  let frontFore = f.isHero ? 58 - breathe * 1.5 : 104;
  let backArm = f.isHero ? -34 - breathe * 1.4 : -12;
  let backFore = f.isHero ? 100 + breathe * 1.2 : 76;
  let frontLeg = f.isHero ? 17 : 31;
  let frontShin = f.isHero ? -6 : -31;
  let backLeg = f.isHero ? -19 : -36;
  let backShin = f.isHero ? 6 : 36;
  let frontHipX = f.isHero ? 82 : 83;
  let backHipX = f.isHero ? 68 : 68;
  let hipY = 94 + Math.abs(breathe) * (f.isHero ? 1.3 : 0.55);
  let frontUpperLen = f.isHero ? 24 : 25;
  let frontForeLen = f.isHero ? 23 : 25;
  let backUpperLen = f.isHero ? 22 : 24;
  let backForeLen = f.isHero ? 22 : 24;

  if (Math.abs(f.vx) > 20 && f.grounded && !f.attacking) {
    frontLeg = (f.isHero ? 17 : 31) + 8 * walk;
    frontShin = f.isHero ? -6 + 3 * Math.abs(walk) : -frontLeg;
    backLeg = (f.isHero ? -19 : -36) - 8 * walk;
    backShin = f.isHero ? 6 - 3 * Math.abs(walk) : -backLeg;
    frontArm = (f.isHero ? 58 : 12) - 6 * walk;
    backArm = (f.isHero ? -34 : -12) + 5 * walk;
    bodyX += walk * 1.4;
  }
  if (!f.grounded) {
    torso = f.isHero ? 15 : 12;
    bodyX = 0;
    frontLeg = -24; frontShin = 48; backLeg = -42; backShin = 62;
    frontArm = 28; frontFore = 82; backArm = -48; backFore = 100;
  }
  if (punch) {
    const wind = f.animState === 'windup' ? easeOut(t) : 1;
    const strike = f.animState === 'strike' || f.animState === 'hold' ? easeOut(t) : 0;
    const recover = f.animState === 'recover' ? easeInOut(t) : 0;
    torso = lerp(18, 2, strike);
    bodyX = lerp(-1, 7, strike);
    frontArm = lerp(34, 90, strike);
    frontFore = lerp(88, 0, strike);
    backArm = lerp(-48, -66, strike);
    backFore = lerp(112, 118, strike);
    frontLeg = lerp(24, 17, strike);
    frontShin = -frontLeg;
    backLeg = lerp(-32, -46, strike);
    backShin = lerp(32, 46, strike);
    if (f.animState === 'windup') {
      torso = lerp(torso, 18, wind);
      bodyX = lerp(bodyX, -2, wind);
      frontArm = lerp(f.isHero ? 58 : 12, 30, wind);
      frontFore = lerp(f.isHero ? 58 : 104, 92, wind);
    }
    if (f.animState === 'recover') {
      torso = lerp(2, f.isHero ? 10 : 2, recover);
      bodyX = lerp(7, f.isHero ? 1.5 : 0, recover);
      frontArm = lerp(90, f.isHero ? 58 : 12, recover);
      frontFore = lerp(0, f.isHero ? 58 : 104, recover);
      frontLeg = lerp(17, f.isHero ? 17 : 31, recover);
      frontShin = -frontLeg;
      backLeg = lerp(-46, f.isHero ? -19 : -36, recover);
      backShin = f.isHero ? lerp(46, 6, recover) : -backLeg;
    }
  }
  if (kick) {
    const wind = f.animState === 'windup' ? easeOut(t) : 1;
    const strike = f.animState === 'strike' || f.animState === 'hold' ? easeOut(t) : 0;
    const recover = f.animState === 'recover' ? easeInOut(t) : 0;
    torso = lerp(18, -4, strike);
    bodyX = lerp(-1, -5, strike);
    frontLeg = lerp(-42, 84, strike);
    frontShin = lerp(82, 0, strike);
    backLeg = -33;
    backShin = 33;
    frontArm = 42;
    frontFore = 80;
    if (f.animState === 'windup') {
      frontLeg = lerp(f.isHero ? 17 : 31, -42, wind);
      frontShin = lerp(f.isHero ? -6 : -31, 82, wind);
      torso = lerp(torso, 18, wind);
    }
    if (f.animState === 'recover') {
      frontLeg = lerp(84, f.isHero ? 17 : 31, recover);
      frontShin = lerp(0, f.isHero ? -6 : -31, recover);
      torso = lerp(-4, f.isHero ? 10 : 2, recover);
      bodyX = lerp(-5, f.isHero ? 1.5 : 0, recover);
    }
  }
  if (hit) {
    torso = -18;
    bodyX = -7;
    frontArm = 12; frontFore = 92; backArm = -10; backFore = 92;
    frontLeg = 26; frontShin = -26; backLeg = -28; backShin = 28;
  }
  if (f.defeated) {
    torso = 58;
    frontArm = 72; backArm = 55; frontLeg = 44; backLeg = 28;
    frontShin = 74; backShin = 62;
  } else if (f.victory) {
    torso = -4 + breathe * 2;
    frontArm = -96 + breathe * 4;
    frontFore = 30;
    backArm = -54;
    frontLeg = 17;
    frontShin = -6;
    backLeg = -19;
    backShin = 6;
  }

  if (special) {
    frontForeLen = f.atkType === 'giant' ? 245 : 76;
    frontUpperLen = f.atkType === 'giant' ? 72 : 31;
    frontArm = 91;
    frontFore = -2;
    torso = f.atkType === 'giant' ? -18 : -1;
    bodyX = f.atkType === 'giant' ? 26 : 6;
    backLeg = f.atkType === 'giant' ? -62 : -48;
    backShin = f.atkType === 'giant' ? 58 : 48;
  }

  const frontHip = { x: frontHipX, y: hipY + bodyDrop };
  const backHip = { x: backHipX, y: hipY + bodyDrop };
  const frontLegPose = setJointLimb(v.frontThigh, v.frontShin, frontHip, 24, 25, frontLeg, frontShin);
  const backLegPose = setJointLimb(v.backThigh, v.backShin, backHip, 24, 25, backLeg, backShin);
  const groundShift = 144 - Math.max(frontLegPose.end.y, backLegPose.end.y);
  setFootPath(v.frontFoot, frontLegPose.end.x, frontLegPose.end.y, 1, f.isHero ? 15 : 17);
  setFootPath(v.backFoot, backLegPose.end.x, backLegPose.end.y, 1, f.isHero ? 14 : 16);
  if (v.heroPants) {
    setPantLeg(v.backPant, v.backPantCuff, backHip, backLegPose.joint, backLegPose.end, 7.5, 6, 5.2);
    setPantLeg(v.frontPant, v.frontPantCuff, frontHip, frontLegPose.joint, frontLegPose.end, 8, 6.4, 5.5);
  }

  const frontShoulder = { x: f.isHero ? 87 + bodyX : 91 + bodyX, y: 61 + bodyDrop };
  const backShoulder = { x: f.isHero ? 63 + bodyX : 59 + bodyX, y: 62 + bodyDrop };
  const frontArmPose = setJointLimb(v.frontUpper, v.frontForeLine, frontShoulder, frontUpperLen, frontForeLen, frontArm, frontFore);
  const backArmPose = setJointLimb(v.backUpper, v.backForeLine, backShoulder, backUpperLen, backForeLen, backArm, backFore);
  setCirclePos(v.fist, frontArmPose.end.x, frontArmPose.end.y, special ? (f.atkType === 'giant' ? 48 : 6) : (f.isHero ? 4.2 : 5));
  setCirclePos(v.backFist, backArmPose.end.x, backArmPose.end.y, f.isHero ? 3.4 : 4.2);
  v.fist.setAttribute('fill', special && f.atkType === 'giant' ? '#ffd9ce' : (f.isHero ? '#ffffff' : '#080008'));
  v.fist.setAttribute('filter', special && f.atkType === 'giant' ? 'url(#heroGlow)' : (f.isHero ? 'url(#heroGlow)' : 'url(#shadowAura)'));

  const x = f.x - 75;
  const y = f.y - 144;
  const fallRot = f.defeated ? ` rotate(${f.facing * -84}deg)` : '';
  v.root.style.transform = `translate(${x}px, ${y}px) scale(${f.facing}, 1)${fallRot}`;
  v.root.style.opacity = f.defeated ? '0.58' : '1';
  v.skeleton.setAttribute('transform', `translate(0 ${groundShift.toFixed(2)})`);
  const auraBoost = f.victory ? 0.22 : 0;
  v.aura.setAttribute('opacity', f.defeated ? '0.05' : (f.isHero ? `${0.22 + Math.abs(breathe) * 0.08 + auraBoost}` : `${0.24 + Math.abs(breathe) * 0.04 + auraBoost}`));
  v.body.setAttribute('transform', `translate(${bodyX.toFixed(2)} ${bodyDrop.toFixed(2)}) rotate(${torso.toFixed(2)} 75 94)`);
  if (v.heroPants) v.heroPants.setAttribute('transform', '');
  v.head.setAttribute('transform', `translate(${(bodyX * 0.72).toFixed(2)} ${(bodyDrop - Math.abs(breathe) * 0.7).toFixed(2)}) rotate(${(hit ? -16 : torso * 0.26).toFixed(2)} 75 60)`);
}

// ===== FIGHTER =====
class Fighter {
  constructor(x, facing, opts) {
    this.x = x; this.y = GROUND; this.vx = 0; this.vy = 0;
    this.desiredVx = 0;
    this.facing = facing; this.grounded = true;
    this.maxHp = opts.hp; this.hp = opts.hp; this.isHero = opts.isHero || false;

    // Animation state machine
    this.animState = 'idle';  // idle|walk|windup|strike|hold|recover|hitstun|jump
    this.animT = 0;           // progress 0→1 within current phase
    this.animDur = 0;         // duration of current phase

    // Attack tracking
    this.atkType = '';
    this.attackMove = 'punch';
    this.atkCd = 0;
    this.rubberCd = 0;
    this.specialMaxCd = RUBBER_CD;
    this.rubberStretch = 0;
    this.hitDealt = false;    // so we only register hit once per attack

    // Hit reception
    this.hit = false;
    this.hitTimer = 0;

    // Combo
    this.combo = 0; this.comboTimer = 0;

    // Animation helpers
    this.walkCycle = 0;
    this.bounceT = 0;
    this.landSqt = 0;        // landing squat amount 0-1
    this.prevGrounded = true;
    this.lastStepT = 0;

    this.alive = true;
    this.defeated = false;
    this.victory = false;
    this.visual = createFighterSVG(this);
  }

  setAnim(state, dur) {
    this.animState = state;
    this.animDur = dur;
    this.animT = 0;
  }

  get attacking() {
    return this.animState === 'windup' || this.animState === 'strike' || this.animState === 'hold';
  }

  update(dt) {
    // Gravity
    if (!this.grounded) this.vy += GRAVITY * dt;

    // Weighted acceleration and friction. Direction changes should feel loaded,
    // not like the character is sliding on a menu cursor.
    if (this.grounded) {
      const accel = (this.isHero ? 9.5 : 6.8) * MOVE_SPD;
      const brake = (this.isHero ? 12 : 9) * MOVE_SPD;
      const turning = this.desiredVx !== 0 && Math.sign(this.desiredVx) !== Math.sign(this.vx) && Math.abs(this.vx) > 12;
      const maxDelta = (this.desiredVx === 0 ? brake : accel * (turning ? 0.55 : 1)) * dt;
      this.vx = approach(this.vx, this.desiredVx, maxDelta);
    } else {
      this.vx = approach(this.vx, this.desiredVx * 0.85, (this.isHero ? 2.6 : 1.7) * MOVE_SPD * dt);
    }

    // Move
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Ground check
    const wasAir = !this.grounded;
    if (this.y >= GROUND) {
      this.y = GROUND; this.vy = 0;
      if (!this.grounded) {
        // Landing: squash
        this.landSqt = 1;
        if (this.isHero) fx.shake(3, 0.1);
      }
      this.grounded = true;
    }
    this.prevGrounded = this.grounded;

    // Clamp x
    this.x = Math.max(35, Math.min(W - 35, this.x));

    // Landing squat decay
    if (this.landSqt > 0) this.landSqt = Math.max(0, this.landSqt - dt * 8);

    // Cooldowns
    if (this.atkCd > 0) this.atkCd -= dt;
    if (this.rubberCd > 0) this.rubberCd -= dt;
    if (this.hitTimer > 0) { this.hitTimer -= dt; if (this.hitTimer <= 0) this.hit = false; }
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }
    if (this.rubberStretch > 0) this.rubberStretch = Math.max(0, this.rubberStretch - dt * 3.5);

    // Walk cycle + step sound
    if (Math.abs(this.vx) > 20 && this.grounded) {
      const spd = this.isHero ? 9 : 6;
      this.walkCycle += dt * spd;
      // Slight bob
      this.bounceT += dt * (this.isHero ? 5 : 2.5);
      this.lastStepT += dt;
      if (this.lastStepT > 0.28) { this.lastStepT = 0; /* sndStep(); */ }
    } else {
      this.bounceT += dt * (this.isHero ? 2 : 1);
    }

    // Animation state progression
    if (this.animState === 'windup' || this.animState === 'strike' ||
      this.animState === 'hold' || this.animState === 'recover' ||
      this.animState === 'hitstun') {
      this.animT = Math.min(1, this.animT + dt / this.animDur);
      if (this.animT >= 1) {
        // Advance phase
        if (this.animState === 'windup') {
          this.setAnim('strike', this.isHero ? STRIKE_DUR : STRIKE_DUR * 1.18);
          this.hitDealt = false;
        } else if (this.animState === 'strike') {
          this.setAnim('hold', HOLD_DUR);
        } else if (this.animState === 'hold') {
          this.setAnim('recover', this.isHero ? RECOVER_DUR : RECOVER_DUR * 1.08);
          if (!this.hitDealt) this.atkCd = this.isHero ? HERO_ATK_CD : BOSS_ATK_CD; // missed, still CD
        } else if (this.animState === 'recover') {
          this.setAnim('idle', 0);
          this.atkType = '';
        } else if (this.animState === 'hitstun') {
          this.setAnim('idle', 0);
        }
      }
    } else {
      // Set passive state
      if (!this.grounded) this.animState = 'jump';
      else if (Math.abs(this.vx) > 20) this.animState = 'walk';
      else this.animState = 'idle';
    }
  }

  jump() {
    if (this.grounded && !this.attacking) {
      // Squash before jump — happens instantly via landSqt
      this.landSqt = 0.5;
      this.vy = JUMP_VEL;
      this.grounded = false;
      sndJump();
    }
  }

  attack(type) {
    if (this.atkCd > 0 || this.attacking) return;
    if ((type === 'rubber' || type === 'giant') && this.rubberCd > 0) return;
    if (this.animState === 'hitstun') return;

    this.atkType = type;
    this.attackMove = type === 'normal' && this.isHero && this.combo % 3 === 2 ? 'kick' : 'punch';
    if (!this.isHero && type === 'normal') this.attackMove = Math.random() < 0.28 ? 'kick' : 'punch';
    this.hitDealt = false;
    // Windup anticipation — hero faster, boss slower
    const windupDur = type === 'rubber' || type === 'giant'
      ? (this.isHero ? WINDUP_DUR * (type === 'giant' ? 1.15 : 0.8) : WINDUP_DUR)
      : (this.isHero ? WINDUP_DUR : WINDUP_DUR * 1.12);
    this.setAnim('windup', windupDur);

    if (type === 'rubber' || type === 'giant') {
      this.attackMove = 'punch';
      this.specialMaxCd = type === 'giant' ? GIANT_CD : RUBBER_CD;
      this.rubberCd = this.specialMaxCd;
      this.rubberStretch = type === 'giant' ? 4.2 : 1;
      sndRubber();
    }
  }

  tryHit(other) {
    if (gameState !== 'playing') return;
    // Only during strike/hold phase and only once
    if (this.animState !== 'strike' && this.animState !== 'hold') return;
    if (this.hitDealt) return;

    const dx = other.x - this.x, dist = Math.abs(dx);
    const range = this.atkType === 'giant'
      ? GIANT_RANGE
      : (this.atkType === 'rubber' ? RUBBER_RANGE : (this.attackMove === 'kick' ? KICK_RANGE : ATK_RANGE));

    if (dist < range && ((this.facing === 1 && dx >= 0) || (this.facing === -1 && dx <= 0))) {
      if (other.hit) return;

      const isCrit = Math.random() < (this.isHero ? HERO_CRIT_CHANCE : BOSS_CRIT_CHANCE);
      let dmg = this.atkType === 'giant'
        ? GIANT_DMG
        : (this.atkType === 'rubber'
          ? RUBBER_DMG
          : (this.attackMove === 'kick' ? KICK_DMG : (this.isHero ? PUNCH_DMG : BOSS_DMG)));
      if (isCrit) dmg = Math.floor(dmg * CRIT_MULT);

      other.hp = Math.max(0, other.hp - dmg);
      other.hit = true; other.hitTimer = 0.25;

      // Knockback
      const kbX = this.facing * (this.atkType === 'giant' ? 820 : (isCrit ? 420 : (this.attackMove === 'kick' ? 270 : 200)));
      const kbY = this.atkType === 'giant' ? -310 : (isCrit ? -200 : (this.attackMove === 'kick' ? -130 : -100));
      other.vx = kbX; other.vy = kbY; other.grounded = false;

      // Hit reaction animation
      other.setAnim('hitstun', HITSTUN_DUR * (isCrit ? 1.5 : 1) * (other.isHero ? 1.08 : 0.72));

      this.hitDealt = true;
      this.combo++; this.comboTimer = 2;

      // Advance to hold (hit-stop) — state machine will auto-advance to recover
      this.setAnim('hold', HOLD_DUR);
      this.atkCd = this.isHero ? HERO_ATK_CD : BOSS_ATK_CD;
      fx.hitStop(0.08);

      const ix = (this.x + other.x) / 2, iy = this.y - 40;
      const cameraPower = this.atkType === 'giant' ? 1 : (this.atkType === 'rubber' ? 0.72 : (isCrit ? 0.58 : 0.22));
      camera.hit(ix + this.facing * (this.atkType === 'giant' ? 30 : 12), iy, cameraPower);

      if (this.atkType === 'rubber' || this.atkType === 'giant') {
        pulseBgm(0.78, 360);
        const giant = this.atkType === 'giant';
        fx.shake(giant ? 22 : 14, giant ? 0.42 : 0.3);
        fx.slow(giant ? 0.12 : 0.18, giant ? 0.42 : 0.32);
        fx.zoom(giant ? 1.28 : 1.18, ix, iy, giant ? 0.55 : 0.45);
        fx.flash(giant ? 'rgba(255,80,40,0.32)' : 'rgba(255,255,255,0.35)', giant ? 0.18 : 0.15);
        fx.burst(ix, iy, giant ? 46 : 30, giant ? '#ff5533' : '#fff', 150, giant ? 470 : 350);
        fx.burst(ix, iy, giant ? 24 : 15, '#ffe066', 100, giant ? 330 : 250);
        fx.text(ix, iy - 25, giant ? 'GIANT PUNCH!' : 'RUBBER SMASH!', giant ? '#ff6666' : '#ffe066', giant ? 30 : 26);
        fx.text(ix, iy + 5, '-' + dmg, '#fff', 22); sndCrit();
      } else if (isCrit) {
        pulseBgm(0.8, 300);
        fx.shake(10, 0.22); fx.slow(0.2, 0.24); fx.zoom(1.12, ix, iy, 0.35);
        const fc = this.isHero ? 'rgba(255,255,255,0.25)' : 'rgba(255,30,30,0.3)';
        fx.flash(fc, 0.12);
        const pc = this.isHero ? '#ddeeff' : '#ff4444';
        fx.burst(ix, iy, 22, pc, 120, 280); fx.burst(ix, iy, 10, '#ffaa00', 80, 200);
        fx.text(ix, iy - 20, 'CRITICAL!', this.isHero ? '#ffe066' : '#ff4444', 24);
        fx.text(ix, iy + 5, '-' + dmg, '#ffdd00', 20);
        this.isHero ? sndCrit() : sndBoss();
      } else {
        fx.shake(5, 0.12);
        const pc2 = this.isHero ? '#ddeeff' : '#ff6666';
        fx.burst(ix, iy, 8, pc2, 80, 180);
        fx.text(ix, iy - 10, '-' + dmg, pc2, 17);
        this.isHero ? sndHit() : sndBoss();
      }

      if (this.combo > 1) fx.text(this.x, this.y - 95, this.combo + ' COMBO!', '#ffda44', 15);
      if (other.hp <= 0) triggerKO(this, other, ix, iy);
    }
  }

  draw(ctx) {
    updateFighterSVG(this);
  }
}

// ===== BOSS AI =====
class BossAI {
  constructor() { this.thinkT = 0; this.jumpCd = 0; }
  update(boss, player, dt) {
    this.thinkT -= dt; this.jumpCd -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = 0.12 + Math.random() * 0.08;

    const dx = player.x - boss.x, dist = Math.abs(dx);
    boss.facing = dx > 0 ? 1 : -1;

    if (boss.animState === 'hitstun') {
      boss.desiredVx = 0;
      return; // don't act while stunned
    }

    if (dist > ATK_RANGE + 36) {
      boss.desiredVx = boss.facing * MOVE_SPD * 0.62;
      if (Math.random() < 0.035 && this.jumpCd <= 0 && boss.grounded) {
        boss.jump(); this.jumpCd = 1.8;
      }
    } else if (dist <= ATK_RANGE + 28) {
      // Boss doesn't instantly stop — friction will handle decel
      boss.desiredVx = 0;
      if (boss.atkCd <= 0) boss.attack('normal');
    }

    if (player.attacking && dist < 125 && Math.random() < 0.14 && boss.grounded && this.jumpCd <= 0) {
      boss.jump(); this.jumpCd = 1.5;
    }
    if (dist < 38) boss.desiredVx = -boss.facing * MOVE_SPD * 0.38;
  }
}

// ===== GAME SETUP =====
const canvas = document.getElementById('gc');
const ctx = canvas.getContext('2d');
const cameraLayer = document.getElementById('cameraLayer');
const bgm = document.getElementById('bgm');
const hp1El = document.getElementById('hp1');
const hp2El = document.getElementById('hp2');
const overlay = document.getElementById('overlay');
const oTitle = document.getElementById('oTitle');
const oDesc = document.getElementById('oDesc');
const oBtn = document.getElementById('oBtn');
const rBar = document.getElementById('rBar');

let player, enemy, ai, keys = {}, running = false, lastTime = 0;
let gameState = 'menu', koTimer = 0, koWinner = null, koLoser = null, koOverlayShown = false;

if (bgm) {
  bgm.volume = 0;
  const startBgm = () => {
    bgm.play().then(() => {
      const fade = setInterval(() => {
        bgm.volume = Math.min(0.5, bgm.volume + 0.01);
        if (bgm.volume >= 0.5) clearInterval(fade);
      }, 100);
    }).catch(() => {});
  };
  window.addEventListener('click', startBgm, { once: true });
  window.addEventListener('keydown', startBgm, { once: true });
  window.addEventListener('touchstart', startBgm, { once: true });
}

function pulseBgm(rate, duration) {
  if (!bgm) return;
  bgm.playbackRate = rate;
  clearTimeout(pulseBgm.timer);
  pulseBgm.timer = setTimeout(() => { bgm.playbackRate = 1; }, duration);
}

const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent)
  || ('ontouchstart' in window && window.innerWidth < 1024);
if (isMobile) { const mc = document.getElementById('mobileCtrl'); if (mc) mc.classList.remove('hidden'); }

function startGame() {
  initAudio();
  cameraLayer.innerHTML = '';
  player = new Fighter(200, 1, { hp: HERO_HP, isHero: true });
  enemy = new Fighter(700, -1, { hp: BOSS_HP, isHero: false });
  ai = new BossAI();
  keys = {}; running = true; fx.reset(); camera.reset();
  gameState = 'playing';
  koTimer = 0; koWinner = null; koLoser = null; koOverlayShown = false;
  overlay.classList.remove('koOverlay', 'ready');
  overlay.classList.add('hidden');
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function endGame(winner) {
  gameState = 'gameOver';
  running = false;
  overlay.classList.remove('hidden');
  overlay.classList.add('ready');
  oTitle.textContent = winner === 'hero' ? '🏆 LUFFY WINS!' : '💀 IMU WINS!';
  oTitle.style.textShadow = winner === 'hero'
    ? '0 0 30px rgba(200,230,255,0.6)'
    : '0 0 30px rgba(255,0,0,0.6)';
  oDesc.textContent = 'Press button to play again';
  oBtn.textContent = 'REMATCH';
}

function triggerKO(winner, loser, ix, iy) {
  if (gameState !== 'playing') return;
  gameState = 'ko';
  koTimer = 0;
  koWinner = winner;
  koLoser = loser;
  winner.victory = true;
  loser.defeated = true;
  loser.alive = false;
  loser.desiredVx = 0;
  winner.desiredVx = 0;
  loser.vx = winner.facing * 160;
  loser.vy = -80;
  loser.grounded = false;
  loser.setAnim('hitstun', 0.55);

  fx.hitStop(0.14);
  fx.slow(0.2, 0.48);
  fx.shake(24, 0.42);
  fx.flash(winner.isHero ? 'rgba(255,255,255,0.62)' : 'rgba(255,0,0,0.45)', 0.2);
  camera.hit(ix + winner.facing * 26, iy, 1.15);
  pulseBgm(0.72, 520);
  sndKO();
}

function showKOOverlay(finalReady) {
  const winnerName = koWinner && koWinner.isHero ? 'LUFFY WINS' : 'IMU WINS';
  overlay.classList.remove('hidden');
  overlay.classList.add('koOverlay');
  overlay.classList.toggle('ready', finalReady);
  oTitle.textContent = 'K.O.';
  oTitle.style.textShadow = '0 0 10px #000, 0 0 24px rgba(255,0,0,0.9), 5px 5px 0 #050008';
  oDesc.textContent = finalReady ? `${winnerName}\nPRESS R TO RESTART` : winnerName;
  oBtn.textContent = 'REMATCH';
}

document.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === 'r' && gameState === 'gameOver') {
    e.preventDefault();
    startGame();
    return;
  }
  if (['w', 'a', 'd', ' ', 'g', 'h'].includes(e.key.toLowerCase())) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

window.mBtn = function (a, s) {
  if (a === 'left') keys['a'] = s;
  if (a === 'right') keys['d'] = s;
  if (a === 'jump') keys['w'] = s;
  if (a === 'attack') keys[' '] = s;
  if (a === 'special') keys['g'] = s;
  if (a === 'giant') keys['h'] = s;
};

// ===== INPUT =====
function handleInput() {
  if (gameState !== 'playing') return;
  if (player.animState === 'hitstun') {
    player.desiredVx = 0;
    return; // can't act while in hitstun
  }

  let moveX = 0;
  if (keys['a']) moveX = -MOVE_SPD;
  if (keys['d']) moveX = MOVE_SPD;

  player.desiredVx = moveX;

  if (keys['w']) { player.jump(); keys['w'] = false; }
  if (keys[' ']) { player.attack('normal'); keys[' '] = false; }
  if (keys['g']) { player.attack('rubber'); keys['g'] = false; }
  if (keys['h']) { player.attack('giant'); keys['h'] = false; }

  if (enemy.x !== player.x) player.facing = enemy.x > player.x ? 1 : -1;
}

// ===== BACKGROUND =====
function drawBg() {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#08081a');
  grd.addColorStop(0.5, '#120a20');
  grd.addColorStop(1, '#0a0810');
  ctx.fillStyle = grd; ctx.fillRect(-260, -160, W + 520, H + 320);
  ctx.fillStyle = '#0e0a18'; ctx.fillRect(-260, GROUND + 8, W + 520, H - GROUND + 180);
  const gg = ctx.createLinearGradient(0, 0, W, 0);
  gg.addColorStop(0, 'rgba(80,40,140,0)');
  gg.addColorStop(0.5, 'rgba(80,40,140,0.2)');
  gg.addColorStop(1, 'rgba(80,40,140,0)');
  ctx.strokeStyle = gg; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-260, GROUND + 8); ctx.lineTo(W + 260, GROUND + 8); ctx.stroke();
  ctx.strokeStyle = 'rgba(60,30,100,0.03)'; ctx.lineWidth = 1;
  for (let i = -250; i < W + 260; i += 50) {
    ctx.beginPath(); ctx.moveTo(i, GROUND + 8); ctx.lineTo(i, H); ctx.stroke();
  }
}

// ===== PARTICLES / FX =====
function drawFx() {
  for (const p of fx.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.ml);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.life / p.ml), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const t of fx.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 2);
    ctx.fillStyle = t.c;
    ctx.font = 'bold ' + t.s + 'px Segoe UI';
    ctx.shadowColor = t.c; ctx.shadowBlur = 8;
    ctx.fillText(t.t, t.x, t.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawScreenFlash() {
  if (fx.flashTime <= 0) return;
  ctx.globalAlpha = Math.min(1, fx.flashTime * 4);
  ctx.fillStyle = fx.flashColor;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

function updateUI() {
  hp1El.style.width = Math.max(0, (player.hp / player.maxHp) * 100) + '%';
  hp2El.style.width = Math.max(0, (enemy.hp / enemy.maxHp) * 100) + '%';
  const pct = player.rubberCd > 0 ? Math.max(0, 1 - player.rubberCd / player.specialMaxCd) : 1;
  rBar.style.width = (pct * 100) + '%';
  rBar.style.background = pct >= 1
    ? 'linear-gradient(90deg,#ffe066,#ffaa00)'
    : 'linear-gradient(90deg,#444,#666)';
}

// ===== MAIN LOOP =====
function loop(now) {
  if (!running) return;
  let rawDt = (now - lastTime) / 1000;
  lastTime = now;
  rawDt = Math.min(rawDt, 0.05);
  const worldDt = rawDt * (fx.slowTime > 0 ? fx.slowFactor : 1);
  const dt = fx.hitStopTime > 0 ? 0 : worldDt;

  if (gameState === 'playing') {
    handleInput();
    ai.update(enemy, player, dt);
    player.update(dt);
    enemy.update(dt);
    player.tryHit(enemy);
    enemy.tryHit(player);
  } else if (gameState === 'ko') {
    koTimer += rawDt;
    player.desiredVx = 0;
    enemy.desiredVx = 0;
    player.update(dt);
    enemy.update(dt);

    if (koTimer >= 0.2 && !koOverlayShown) {
      koOverlayShown = true;
      showKOOverlay(false);
    }
    if (koTimer >= 2.45) {
      endGame(koWinner && koWinner.isHero ? 'hero' : 'boss');
      showKOOverlay(true);
    }
  }

  fx.update(rawDt);
  camera.update(player, enemy, rawDt);
  cameraLayer.style.transform = camera.cssTransform();

  ctx.save();
  camera.apply(ctx);
  drawBg();
  drawFx();
  ctx.restore();
  player.draw(ctx);
  enemy.draw(ctx);
  drawScreenFlash();
  updateUI();

  if (running) requestAnimationFrame(loop);
}

// Math.clamp polyfill (used in characters.js too)
Math.clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

window.startGame = startGame;
