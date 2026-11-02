// Renders one frame at time t. Pure function of (t, analysis, choreography),
// so seeking, scrubbing and recording all produce the same picture.
import { lastBefore, envAt } from './analysis.js';
import { drawFruit } from './fruit.js';
import { rng } from './choreography.js';

const PARTY_PALETTES = [
  { top: '#240046', bottom: '#5a189a', lights: ['#ff006e', '#ffbe0b', '#3a86ff', '#8338ec'] },
  { top: '#03045e', bottom: '#0077b6', lights: ['#90e0ef', '#ff70a6', '#ffd670', '#70d6ff'] },
  { top: '#3c096c', bottom: '#ff006e', lights: ['#ffbe0b', '#fb5607', '#ffffff', '#3a86ff'] },
  { top: '#0b090a', bottom: '#2b9348', lights: ['#aacc00', '#ff4d6d', '#ffd60a', '#80ffdb'] },
];
const CALM_PALETTES = [
  { top: '#3d2c8d', mid: '#c56183', bottom: '#ffb385', sun: '#ffe8a3', hill: '#2d6a4f' },
  { top: '#14213d', mid: '#5e548e', bottom: '#e0b1cb', sun: '#fff1e6', hill: '#1b4332' },
];

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, u) => a + (b - a) * u;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------- timing ----------
// Phase inside the current pulse interval. Because intervals come straight
// from the music, motion speeds up and slows down with it automatically.
export function pulseInfo(pulses, t, every = 1) {
  let i = lastBefore(pulses, t);
  if (every > 1 && i >= 0) i -= ((pulses[i].k % every) + every) % every;
  const p0 = i >= 0 ? pulses[i].time : 0;
  const nextI = i + every;
  let p1 = nextI < pulses.length ? pulses[Math.max(0, nextI)].time : p0 + 0.6;
  if (i < 0) p1 = pulses.length ? pulses[0].time : 0.6;
  const gap = p1 - p0;
  // long silences: finish the move then rest instead of moving in slow-mo
  const span = gap > 1.6 ? 0.7 : gap;
  const phase = clamp((t - p0) / Math.max(0.05, span), 0, 1);
  const strength = i >= 0 ? pulses[i].strength : 0;
  const hit = i >= 0 ? strength * Math.exp(-(t - p0) / 0.14) : 0;
  return { i, k: i >= 0 ? pulses[i].k : -1, p0, p1, phase, hit, strength };
}

function onsetHit(onsets, t, decay = 0.1, filter) {
  let i = lastBefore(onsets, t);
  while (i >= 0 && filter && !filter(onsets[i])) i--;
  if (i < 0) return 0;
  return onsets[i].strength * Math.exp(-(t - onsets[i].time) / decay);
}

// ---------- dance moves ----------
// Each returns pose offsets from (pulse phase, pulse count, hit, energy).
const MOVE_FNS = {
  bounce: (q, en) => ({
    dy: -(10 + 26 * en) * Math.sin(Math.PI * q.phase),
    sx: 1 + 0.14 * q.hit, sy: 1 - 0.14 * q.hit,
    armL: 0.6 + 0.4 * Math.sin(Math.PI * q.phase), armR: 0.6 + 0.4 * Math.sin(Math.PI * q.phase),
    kneeL: 0.3 * q.hit, kneeR: 0.3 * q.hit,
  }),
  sway: (q, en) => {
    const side = q.k % 2 ? 1 : -1;
    const x = lerp(side, -side, ease(q.phase));
    return { dx: x * (14 + 16 * en), rot: x * 0.18, armL: 1.2 + x * 0.6, armR: 1.2 - x * 0.6, kneeL: x > 0 ? 0.2 : 0, kneeR: x < 0 ? 0.2 : 0, sy: 1 - 0.08 * q.hit };
  },
  pump: (q, en) => {
    const up = q.k % 2 ? 'R' : 'L';
    const a = 2.9 - 1.1 * ease(q.phase);
    return {
      dy: -(6 + 14 * en) * Math.sin(Math.PI * q.phase),
      armL: up === 'L' ? a : 0.5, armR: up === 'R' ? a : 0.5,
      sy: 1 - 0.12 * q.hit, sx: 1 + 0.08 * q.hit,
      kneeL: up === 'L' ? 0.4 * q.hit : 0, kneeR: up === 'R' ? 0.4 * q.hit : 0,
    };
  },
  twist: (q) => {
    const side = q.k % 2 ? 1 : -1;
    const x = lerp(side, -side, ease(q.phase));
    return { rot: x * 0.3, armL: 1.6 + x * 0.5, armR: 1.6 + x * 0.5, kneeL: Math.max(0, x) * 0.5, kneeR: Math.max(0, -x) * 0.5, spread: 6, dy: -4 * Math.abs(x) };
  },
  wave: (q, en) => {
    const x = Math.sin(Math.PI * (q.k + ease(q.phase)));
    return { armL: 2.6 + 0.35 * x, armR: 2.6 - 0.35 * x, rot: x * 0.08, dy: -(4 + 10 * en) * Math.abs(x), sy: 1 - 0.1 * q.hit };
  },
  hop: (q, en) => {
    const h = (20 + 60 * en) * (0.4 + q.strength) * 4 * q.phase * (1 - q.phase);
    return { dy: -h, armL: 2.4 * Math.sin(Math.PI * q.phase) + 0.3, armR: 2.4 * Math.sin(Math.PI * q.phase) + 0.3, kneeL: 0.7 * Math.sin(Math.PI * q.phase), kneeR: 0.7 * Math.sin(Math.PI * q.phase), sx: 1 + 0.18 * q.hit, sy: 1 - 0.18 * q.hit };
  },
  clap: (q) => {
    const c = Math.exp(-q.phase * 6); // hands meet exactly on the pulse
    return { armL: lerp(1.1, -0.55, c), armR: lerp(1.1, -0.55, c), dy: -6 * Math.sin(Math.PI * q.phase), sy: 1 - 0.06 * q.hit };
  },
};

// ---------- positions ----------
function formationPos(scene, ci, n, t, W, H, a) {
  const ground = H * 0.86;
  const local = a.pulses.filter((p) => p.time >= scene.start && p.time < t).length;
  const q = pulseInfo(a.pulses, t);
  const steps = local + (q.p0 >= scene.start ? ease(q.phase) : 0);
  switch (scene.formation) {
    case 'circle': {
      const ang = (ci / n) * Math.PI * 2 + steps * (Math.PI / n / 2);
      const depth = (Math.sin(ang) + 1) / 2;
      return { x: W / 2 + Math.cos(ang) * W * 0.3, y: ground - 70 + depth * 80, s: 1.0 + depth * 0.35, z: depth };
    }
    case 'conga': {
      const span = W + 300;
      const x = (((steps * 34 - ci * 150) % span) + span) % span - 150;
      return { x, y: ground - 10, s: 1.15, z: ci / n, walk: true };
    }
    case 'solo': {
      if (ci === scene.soloist) return { x: W / 2, y: ground + 10, s: 1.6, z: 2, solo: true };
      const others = [...Array(n).keys()].filter((k) => k !== scene.soloist);
      const r = others.indexOf(ci);
      return { x: W * (0.12 + (0.76 * r) / Math.max(1, others.length - 1)), y: ground - 85, s: 0.8, z: 0, backup: true };
    }
    case 'pairs': {
      const pairIdx = Math.floor(ci / 2), side = ci % 2 ? 1 : -1;
      const nPairs = Math.ceil(n / 2);
      const cx = W * ((pairIdx + 0.5) / nPairs);
      const close = 1 - 0.35 * Math.sin(Math.PI * ease(q.phase)) * (q.k % 2);
      return { x: cx + side * 75 * close, y: ground - (pairIdx % 2) * 30, s: 1.1, z: pairIdx % 2 ? 0 : 1, facing: -side };
    }
    default: { // line
      return { x: W * ((ci + 0.5) / n), y: ground - (ci % 2) * 26, s: 1.15 - (ci % 2) * 0.1, z: ci % 2 ? 0 : 1 };
    }
  }
}

function sceneAt(scenes, t) {
  let lo = 0, hi = scenes.length - 1, ans = 0;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (scenes[m].start <= t) { ans = m; lo = m + 1; } else hi = m - 1;
  }
  return ans;
}

function blinkAt(t, id) {
  const r = Math.sin(id * 12.9898 + Math.floor(t * 0.7 + id * 0.31) * 78.233) * 43758.5453;
  const when = r - Math.floor(r);
  const local = (t * 0.7 + id * 0.31) % 1;
  return Math.abs(local - when) < 0.05;
}

// ---------- backgrounds ----------
function drawParty(ctx, W, H, t, a, scene) {
  const pal = PARTY_PALETTES[scene.palette % PARTY_PALETTES.length];
  const bass = onsetHit(a.onsets, t, 0.18, (o) => o.band === 0 || o.low > 0.7);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.top);
  g.addColorStop(1, pal.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgba(255,255,255,${0.12 * bass})`;
  ctx.fillRect(0, 0, W, H);

  // spotlights swing from side to side, landing on each pulse
  const q = pulseInfo(a.pulses, t);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const side = (q.k + i) % 2 ? 1 : -1;
    const ang = lerp(side, -side, ease(q.phase)) * 0.45 + (i - 1.5) * 0.12;
    const ox = W * (0.15 + i * 0.233);
    ctx.save();
    ctx.translate(ox, -20);
    ctx.rotate(ang);
    const lg = ctx.createLinearGradient(0, 0, 0, H);
    const c = pal.lights[i % pal.lights.length];
    lg.addColorStop(0, c + 'aa');
    lg.addColorStop(1, c + '00');
    ctx.fillStyle = lg;
    ctx.globalAlpha = 0.35 + 0.4 * q.hit;
    ctx.beginPath();
    ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.lineTo(110, H * 1.1); ctx.lineTo(-110, H * 1.1);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // equaliser skyline driven by the band envelopes
  const bands = [envAt(a.env, 'low', t), envAt(a.env, 'mid', t), envAt(a.env, 'high', t)];
  const bars = 24;
  for (let i = 0; i < bars; i++) {
    const b = bands[Math.floor((i / bars) * 3)];
    const wob = 0.7 + 0.3 * Math.sin(i * 1.7 + t * 3);
    const h = H * 0.25 * clamp(b * wob, 0, 1.2);
    ctx.fillStyle = pal.lights[i % pal.lights.length] + '33';
    ctx.fillRect((W / bars) * i + 4, H * 0.84 - h, W / bars - 8, h);
  }

  // dance floor: tiles light up on bass hits, pattern shifts each pulse
  const rows = 2, cols = 12;
  const fy = H * 0.84;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = (c + r + q.k) % 3 === 0;
      const col = pal.lights[(c + r * 2 + q.k) % pal.lights.length];
      ctx.fillStyle = col;
      ctx.globalAlpha = lit ? 0.35 + 0.6 * bass : 0.12;
      ctx.fillRect((W / cols) * c, fy + ((H - fy) / rows) * r, W / cols - 2, (H - fy) / rows - 2);
    }
  }
  ctx.globalAlpha = 1;
}

function drawConfetti(ctx, W, H, t, a, pal) {
  // stateless particles seeded per strong pulse — identical on every replay
  const i0 = lastBefore(a.pulses, t);
  for (let i = i0; i >= 0 && t - a.pulses[i].time < 2.5; i--) {
    const p = a.pulses[i];
    if (p.strength < 0.85) continue;
    const R = rng(p.k * 7919 + 1);
    const dt = t - p.time;
    for (let n = 0; n < 26; n++) {
      const x0 = W * R(), vx = (R() - 0.5) * 160, vy = -200 - 300 * R();
      const x = x0 + vx * dt, y = H * 0.9 + vy * dt + 380 * dt * dt;
      if (y > H) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(dt * (4 + 6 * R()));
      ctx.fillStyle = pal.lights[n % pal.lights.length];
      ctx.globalAlpha = clamp(1.6 - dt * 0.6, 0, 1);
      ctx.fillRect(-5, -3, 10, 6);
      ctx.restore();
    }
  }
}

function drawCalm(ctx, W, H, t, a, scene) {
  const pal = CALM_PALETTES[scene.palette % CALM_PALETTES.length];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.top);
  g.addColorStop(0.6, pal.mid);
  g.addColorStop(1, pal.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // stars twinkle with the high end
  const hi = envAt(a.env, 'high', t);
  const R = rng(99);
  for (let i = 0; i < 60; i++) {
    const x = R() * W, y = R() * H * 0.5, ph = R() * 6.28;
    ctx.fillStyle = `rgba(255,255,255,${clamp(0.25 + 0.5 * Math.sin(t * 1.3 + ph) * 0.5 + hi * 0.6, 0, 1)})`;
    ctx.fillRect(x, y, 2, 2);
  }
  // sun breathes with loudness
  const lv = envAt(a.env, 'rms', t);
  ctx.fillStyle = pal.sun;
  ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.arc(W * 0.5, H * 0.66, 110 + 18 * lv, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.hill;
  ctx.beginPath(); ctx.ellipse(W * 0.5, H * 1.08, W * 0.75, H * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  // fireflies drift and flare on onsets
  const flare = onsetHit(a.onsets, t, 0.4);
  const F = rng(5);
  for (let i = 0; i < 18; i++) {
    const bx = F() * W, by = H * (0.3 + 0.5 * F()), sp = 0.2 + F() * 0.3, ph = F() * 6.28;
    const x = bx + Math.sin(t * sp + ph) * 40, y = by + Math.cos(t * sp * 1.3 + ph) * 25;
    ctx.fillStyle = `rgba(255,240,150,${0.35 + 0.6 * flare * ((i % 3) / 2)})`;
    ctx.beginPath(); ctx.arc(x, y, 3 + 2 * flare, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- speech bubbles ----------
function wrap(ctx, words, maxW) {
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawBubble(ctx, W, H, t, b, anchor) {
  const age = t - b.start;
  const pop = age < 0.25 ? 1 + 0.25 * Math.sin((age / 0.25) * Math.PI) * (1 - age / 0.25) : 1;
  const fade = clamp((b.end - t) / 0.25, 0, 1) * clamp(age / 0.08, 0, 1);
  const allWords = b.text.split(/\s+/);
  const shown = allWords.filter((_, i) => (b.wordTimes[i] ?? b.start) <= t);
  if (!shown.length) return;
  ctx.save();
  ctx.font = b.shout ? 'bold 34px "Trebuchet MS", "Comic Sans MS", sans-serif' : '600 27px "Trebuchet MS", "Comic Sans MS", sans-serif';
  const full = wrap(ctx, allWords, b.shout ? 300 : 340); // size the bubble for the full sentence
  const lineH = b.shout ? 40 : 34;
  const bw = Math.max(...full.map((l) => ctx.measureText(l).width)) + 44;
  const bh = full.length * lineH + 26;
  let x = clamp(anchor.headX - bw / 2, 16, W - bw - 16);
  let y = clamp(anchor.headY - bh - 26, 12, H - bh - 40);
  ctx.globalAlpha = fade;
  ctx.translate(x + bw / 2, y + bh);
  ctx.scale(pop, pop);
  if (b.shout) ctx.rotate(Math.sin(b.start * 13) * 0.08);
  ctx.translate(-(x + bw / 2), -(y + bh));
  ctx.fillStyle = b.shout ? '#fff3b0' : '#ffffff';
  ctx.strokeStyle = '#2b2d42';
  ctx.lineWidth = b.shout ? 5 : 3.5;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, 22);
  ctx.fill(); ctx.stroke();
  // tail toward the speaker
  const tx = clamp(anchor.headX, x + 30, x + bw - 30);
  ctx.beginPath();
  ctx.moveTo(tx - 14, y + bh - 2);
  ctx.lineTo(anchor.headX, Math.min(anchor.headY, y + bh + 24));
  ctx.lineTo(tx + 14, y + bh - 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tx - 14, y + bh); ctx.lineTo(anchor.headX, Math.min(anchor.headY, y + bh + 24)); ctx.lineTo(tx + 14, y + bh);
  ctx.stroke();
  // reveal words in place (layout uses the full sentence so nothing jumps)
  ctx.fillStyle = '#2b2d42';
  ctx.textBaseline = 'top';
  let wi = 0;
  full.forEach((line, li) => {
    const ws = line.split(' ');
    let cx = x + (bw - ctx.measureText(line).width) / 2;
    for (const w of ws) {
      if (wi < shown.length) {
        const wAge = t - (b.wordTimes[wi] ?? b.start);
        ctx.globalAlpha = fade * clamp(wAge / 0.08, 0, 1);
        ctx.fillText(w, cx, y + 14 + li * lineH - 4 * clamp(1 - wAge / 0.12, 0, 1));
      }
      cx += ctx.measureText(w + ' ').width;
      wi++;
    }
  });
  ctx.restore();
}

// ---------- main render ----------
export function renderFrame(ctx, W, H, t, a, ch, opts = {}) {
  const scenes = ch.scenes;
  if (!scenes.length) return;
  const si = sceneAt(scenes, t);
  const scene = scenes[si];
  const prev = scenes[si - 1];
  const n = ch.cast.length;
  const en = clamp(envAt(a.env, 'rms', t), 0, 1.2);
  const mid = envAt(a.env, 'mid', t);
  const anchors = {};

  if (scene.type === 'party') {
    drawParty(ctx, W, H, t, a, scene);
    const mc = scene.moveChanges[Math.max(0, lastBefore(scene.moveChanges, t))];
    const placed = ch.cast.map((c, ci) => {
      let pos = formationPos(scene, ci, n, t, W, H, a);
      // glide between formations, but only when the previous scene was a party too
      if (prev && prev.type === 'party') {
        const u = ease((t - scene.start) / 0.7);
        if (u < 1) {
          const from = formationPos(prev, ci, n, scene.start, W, H, a);
          pos = { ...pos, x: lerp(from.x, pos.x, u), y: lerp(from.y, pos.y, u), s: lerp(from.s, pos.s, u) };
        }
      }
      if (scene.intro) {
        const enter = clamp((t - scene.start) / 2.2, 0, 1);
        const fromX = ci % 2 ? W + 120 : -120;
        pos = { ...pos, x: lerp(fromX, pos.x, ease(enter)), walk: enter < 1 || pos.walk };
      }
      return { c, ci, pos };
    });
    placed.sort((p, q) => p.pos.z - q.pos.z || p.pos.y - q.pos.y);
    for (const { c, ci, pos } of placed) {
      const q = pulseInfo(a.pulses, t - c.delay, c.lazy && en < 0.7 ? 2 : 1);
      let move = mc.moves[ci];
      if (pos.backup) move = 'clap';
      if (pos.solo && move === 'clap') move = 'hop';
      const m = MOVE_FNS[move](q, en);
      if (pos.walk) { // stepping legs on the pulse while walking
        const st = q.k % 2 ? 1 : 0;
        m.kneeL = st ? Math.sin(Math.PI * q.phase) * 0.6 : 0;
        m.kneeR = st ? 0 : Math.sin(Math.PI * q.phase) * 0.6;
      }
      const pose = {
        x: pos.x, y: pos.y, s: pos.s * c.scale,
        ...m,
        facing: pos.facing || 1,
        look: pos.facing || Math.sin(q.k * 1.3 + ci) * 0.8,
        mouth: clamp(mid * 1.1 - 0.35 + 0.5 * q.hit, 0, 1) * (pos.backup ? 0.6 : 1),
        blink: blinkAt(t, ci),
      };
      anchors[c.id] = drawFruit(ctx, c.type, pose);
    }
    drawConfetti(ctx, W, H, t, a, PARTY_PALETTES[scene.palette % PARTY_PALETTES.length]);
  } else {
    drawCalm(ctx, W, H, t, a, scene);
    const [ia, ib] = scene.pair;
    const talking = scene.bubbles.find((b) => t >= b.start && t <= b.end);
    const q = pulseInfo(a.pulses, t);
    const sway = lerp(q.k % 2 ? 1 : -1, q.k % 2 ? -1 : 1, ease(q.phase));
    const local = clamp((t - scene.start) / (scene.end - scene.start), 0, 1);
    const closeIn = ease(local * 1.6) * 40; // they drift closer as the scene goes on
    [ia, ib].forEach((id, side) => {
      const c = ch.cast[id];
      const dir = side ? -1 : 1; // face each other
      const speaking = talking && talking.speaker === id;
      const word = speaking ? onsetHit(talking.wordTimes.map((tt) => ({ time: tt, strength: 1 })), t, 0.12) : 0;
      const nod = !speaking && talking ? 0.5 * q.hit : 0;
      const pose = {
        x: W * (side ? 0.64 : 0.36) - dir * closeIn, y: H * 0.9, s: 1.7 * c.scale,
        rot: sway * 0.06 * dir + nod * 0.1 * dir,
        dy: -4 * Math.abs(sway) - nod * 6,
        sy: 1 - 0.04 * q.hit,
        armL: speaking ? 0.6 + 0.6 * word : 0.35, armR: speaking ? 0.6 + 0.6 * word : 0.35,
        look: dir, facing: dir,
        mouth: speaking ? clamp(word * 0.9 + mid * 0.25, 0, 1) : 0,
        blink: blinkAt(t, id),
        blush: 0.4 + 0.6 * local,
      };
      anchors[c.id] = drawFruit(ctx, c.type, pose);
    });
    // a heart floats up between them near the end
    if (local > 0.82) {
      const u = (local - 0.82) / 0.18;
      ctx.save();
      ctx.globalAlpha = Math.sin(Math.PI * u);
      ctx.fillStyle = '#ff4d6d';
      ctx.translate(W / 2, H * 0.55 - u * 120);
      ctx.scale(1.5 + 0.3 * q.hit, 1.5 + 0.3 * q.hit);
      ctx.beginPath();
      ctx.moveTo(0, 10); ctx.bezierCurveTo(-26, -8, -12, -26, 0, -12); ctx.bezierCurveTo(12, -26, 26, -8, 0, 10);
      ctx.fill();
      ctx.restore();
    }
  }

  for (const b of scene.bubbles) {
    if (t >= b.start && t <= b.end && anchors[b.speaker]) drawBubble(ctx, W, H, t, b, anchors[b.speaker]);
  }

  // cut flash: every scene change lands on a hit
  const since = t - scene.start;
  if (si > 0 && since < 0.3) {
    ctx.fillStyle = `rgba(255,255,255,${0.55 * Math.exp(-since / 0.08)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // title card + fade out
  if (opts.title && t < 3.5) {
    ctx.save();
    ctx.globalAlpha = clamp(Math.min(t / 0.4, (3.5 - t) / 0.6), 0, 1);
    ctx.font = 'bold 44px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 8;
    ctx.strokeText(opts.title, 40, 70);
    ctx.fillText(opts.title, 40, 70);
    ctx.restore();
  }
  const tail = a.duration - t;
  if (tail < 1.5) {
    ctx.fillStyle = `rgba(0,0,0,${clamp(1 - tail / 1.5, 0, 1)})`;
    ctx.fillRect(0, 0, W, H);
  }
}
