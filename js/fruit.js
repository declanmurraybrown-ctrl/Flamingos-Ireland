// Fruit people, drawn from a handful of circles and lines. Deliberately
// simple: the personality comes from timing, not detail.

const INK = '#2b2d42';

export const FRUIT_STYLE = {
  apple: { color: '#e63946', shade: '#b52a35' },
  orange: { color: '#f8961e', shade: '#d77a0e' },
  banana: { color: '#ffd23f', shade: '#e0b22a' },
  pear: { color: '#b5d334', shade: '#8fae20' },
  strawberry: { color: '#ff4d6d', shade: '#d93355' },
  lemon: { color: '#fff275', shade: '#e3d24c' },
  plum: { color: '#8e44ad', shade: '#6c2f86' },
  pineapple: { color: '#f4a261', shade: '#cf8240' },
  watermelon: { color: '#43aa8b', shade: '#2d7d65' },
  cherry: { color: '#c1121f', shade: '#8f0d17' },
};

function leaf(ctx, x, y, r, ang) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.ellipse(r * 0.6, 0, r * 0.6, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#52b788';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function stem(ctx, x, y, h) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 2, y - h * 0.6, x + h * 0.3, y - h);
  ctx.strokeStyle = '#6b4226';
  ctx.lineWidth = Math.max(2, h * 0.25);
  ctx.stroke();
  ctx.strokeStyle = INK;
}

// Draws body shape centred at (0,0) with radius R. Returns the "face centre" y.
function body(ctx, type, R, st) {
  ctx.fillStyle = st.color;
  ctx.strokeStyle = INK;
  const lw = ctx.lineWidth;
  switch (type) {
    case 'banana': {
      ctx.beginPath();
      ctx.moveTo(-R * 0.35, -R * 1.25);
      ctx.quadraticCurveTo(R * 0.95, -R * 0.4, -R * 0.1, R * 1.05);
      ctx.quadraticCurveTo(R * 1.55, R * 0.1, R * 0.15, -R * 1.25);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6b4226';
      ctx.beginPath(); ctx.arc(-R * 0.1, -R * 1.25, R * 0.12, 0, Math.PI * 2); ctx.fill();
      return { fx: R * 0.42, fy: -R * 0.05, fr: R * 0.75 };
    }
    case 'pear': {
      ctx.beginPath();
      ctx.arc(0, -R * 0.55, R * 0.6, 0, Math.PI * 2);
      ctx.arc(0, R * 0.2, R * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath(); ctx.arc(0, -R * 0.55, R * 0.6, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, R * 0.2, R * 0.95, -Math.PI * 0.2, Math.PI * 1.2); ctx.stroke();
      stem(ctx, 0, -R * 1.12, R * 0.35);
      leaf(ctx, R * 0.05, -R * 1.2, R * 0.4, -0.5);
      return { fx: 0, fy: R * 0.1, fr: R };
    }
    case 'strawberry': {
      ctx.beginPath();
      ctx.moveTo(0, R * 1.1);
      ctx.bezierCurveTo(-R * 1.3, R * 0.2, -R * 1.1, -R * 0.95, 0, -R * 0.85);
      ctx.bezierCurveTo(R * 1.1, -R * 0.95, R * 1.3, R * 0.2, 0, R * 1.1);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe66d';
      for (const [sx, sy] of [[-0.55, -0.35], [0.55, -0.35], [-0.6, 0.25], [0.6, 0.25], [-0.25, 0.75], [0.25, 0.75], [0, 0.45]]) {
        ctx.beginPath(); ctx.ellipse(sx * R, sy * R, R * 0.05, R * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#52b788';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i / 4) * Math.PI;
        ctx.lineTo(Math.cos(a) * R * 0.6, -R * 0.85 + Math.sin(a) * R * 0.35);
        ctx.lineTo(Math.cos(a + 0.35) * R * 0.2, -R * 0.85);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      return { fx: 0, fy: -R * 0.1, fr: R * 0.85 };
    }
    case 'lemon': {
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 1.1, R * 0.85, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(s * R * 1.12, 0, R * 0.16, R * 0.12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      leaf(ctx, 0, -R * 0.82, R * 0.45, -0.3);
      return { fx: 0, fy: 0, fr: R };
    }
    case 'pineapple': {
      ctx.fillStyle = '#52b788';
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(i * R * 0.18, -R * 1.0);
        ctx.lineTo(i * R * 0.32, -R * 1.65 + Math.abs(i) * R * 0.18);
        ctx.lineTo(i * R * 0.18 + R * 0.14, -R * 1.0);
      }
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = st.color;
      ctx.beginPath(); ctx.ellipse(0, 0, R * 0.85, R * 1.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = st.shade; ctx.lineWidth = lw * 0.7;
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath(); ctx.moveTo(i * R * 0.4 - R, -R * 1.2); ctx.lineTo(i * R * 0.4 + R, R * 1.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * R * 0.4 + R, -R * 1.2); ctx.lineTo(i * R * 0.4 - R, R * 1.2); ctx.stroke();
      }
      ctx.restore();
      ctx.lineWidth = lw; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.ellipse(0, 0, R * 0.85, R * 1.12, 0, 0, Math.PI * 2); ctx.stroke();
      return { fx: 0, fy: 0, fr: R * 0.85 };
    }
    case 'watermelon': {
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = st.shade; ctx.lineWidth = R * 0.16;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.ellipse(i * R * 0.45, 0, R * 0.12, R * 1.2, 0, -Math.PI / 2, Math.PI / 2, i < 0); ctx.stroke();
      }
      ctx.restore();
      ctx.lineWidth = lw; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      stem(ctx, 0, -R, R * 0.25);
      return { fx: 0, fy: 0, fr: R };
    }
    case 'cherry': {
      ctx.strokeStyle = '#6b4226'; ctx.lineWidth = R * 0.1;
      ctx.beginPath(); ctx.moveTo(0, -R * 0.85); ctx.quadraticCurveTo(R * 0.1, -R * 1.6, R * 0.7, -R * 1.9); ctx.stroke();
      ctx.lineWidth = lw; ctx.strokeStyle = INK;
      leaf(ctx, R * 0.6, -R * 1.85, R * 0.45, 0.4);
      ctx.fillStyle = st.color;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      return { fx: 0, fy: 0.05 * R, fr: R * 0.92 };
    }
    case 'orange': {
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = st.shade;
      for (const [a, d] of [[0.5, 0.75], [2.2, 0.7], [3.6, 0.8], [5.3, 0.65], [1.3, 0.55]]) {
        ctx.beginPath(); ctx.arc(Math.cos(a) * R * d, Math.sin(a) * R * d, R * 0.035, 0, Math.PI * 2); ctx.fill();
      }
      leaf(ctx, 0, -R * 0.95, R * 0.4, -0.4);
      return { fx: 0, fy: 0, fr: R };
    }
    case 'plum': {
      ctx.beginPath(); ctx.ellipse(0, 0, R * 0.95, R, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = st.shade; ctx.beginPath(); ctx.moveTo(-R * 0.1, -R * 0.95); ctx.quadraticCurveTo(-R * 0.35, 0, -R * 0.05, R * 0.95); ctx.stroke();
      ctx.strokeStyle = INK;
      stem(ctx, 0, -R, R * 0.3);
      return { fx: R * 0.08, fy: 0, fr: R * 0.9 };
    }
    default: { // apple
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.75);
      ctx.bezierCurveTo(-R * 0.6, -R * 1.15, -R * 1.25, -R * 0.55, -R * 1.0, R * 0.35);
      ctx.bezierCurveTo(-R * 0.8, R * 1.05, -R * 0.2, R * 1.05, 0, R * 0.9);
      ctx.bezierCurveTo(R * 0.2, R * 1.05, R * 0.8, R * 1.05, R * 1.0, R * 0.35);
      ctx.bezierCurveTo(R * 1.25, -R * 0.55, R * 0.6, -R * 1.15, 0, -R * 0.75);
      ctx.fill(); ctx.stroke();
      stem(ctx, 0, -R * 0.75, R * 0.4);
      leaf(ctx, R * 0.08, -R * 0.95, R * 0.42, -0.6);
      return { fx: 0, fy: R * 0.05, fr: R };
    }
  }
}

function limb(ctx, x0, y0, x1, y1, bend) {
  const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, my, x1, y1);
  ctx.stroke();
}

// pose: { x, y (ground), s, dx, dy, rot, sx, sy, armL, armR, kneeL, kneeR,
//         spread, look, mouth, blink, blush, facing, alpha }
export function drawFruit(ctx, type, p) {
  const st = FRUIT_STYLE[type] || FRUIT_STYLE.apple;
  const s = p.s;
  const R = 40 * s;
  const legLen = 34 * s, armLen = 34 * s;
  ctx.save();
  ctx.globalAlpha = p.alpha ?? 1;
  ctx.translate(p.x + (p.dx || 0), p.y);

  // shadow stays on the floor while the body jumps
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  const lift = Math.max(0, -(p.dy || 0));
  ctx.beginPath();
  ctx.ellipse(0, 4 * s, R * (1.1 - Math.min(0.5, lift / 200)), R * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, p.dy || 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;

  // legs (from hips to feet)
  const hipY = -legLen;
  const spread = (p.spread || 0) * s;
  ctx.lineWidth = 5 * s;
  for (const side of [-1, 1]) {
    const knee = side < 0 ? p.kneeL || 0 : p.kneeR || 0;
    const fx = side * (R * 0.4 + spread);
    const fy = -knee * 22 * s;
    limb(ctx, side * R * 0.32, hipY, fx, fy, side * knee * 14 * s);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(fx + side * 5 * s, fy, 9 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // body (rotates & squashes around the hips)
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(p.rot || 0);
  ctx.scale(p.sx || 1, p.sy || 1);
  ctx.translate(0, -R * 0.9);
  ctx.lineWidth = 3.5 * s;
  if ((p.facing || 1) < 0) ctx.scale(-1, 1);
  const face = body(ctx, type, R, st);
  if ((p.facing || 1) < 0) ctx.scale(-1, 1);
  const fx = (p.facing || 1) < 0 ? -face.fx : face.fx;

  // shine
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(fx - face.fr * 0.45, face.fy - face.fr * 0.5, face.fr * 0.18, face.fr * 0.1, -0.6, 0, Math.PI * 2);
  ctx.fill();

  // face
  const fr = face.fr;
  const look = (p.look || 0) * fr * 0.07;
  for (const side of [-1, 1]) {
    const ex = fx + side * fr * 0.3, ey = face.fy - fr * 0.12;
    if (p.blink) {
      ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.moveTo(ex - fr * 0.13, ey); ctx.quadraticCurveTo(ex, ey + fr * 0.08, ex + fr * 0.13, ey); ctx.stroke();
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, ey, fr * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2 * s; ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(ex + look, ey + fr * 0.02, fr * 0.08, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (p.blush) {
    ctx.fillStyle = `rgba(255,105,140,${0.45 * p.blush})`;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(fx + side * fr * 0.52, face.fy + fr * 0.15, fr * 0.13, fr * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  const my = face.fy + fr * 0.28;
  const open = Math.max(0, Math.min(1, p.mouth || 0));
  ctx.lineWidth = 3 * s;
  if (open < 0.12) {
    ctx.beginPath(); ctx.arc(fx, my - fr * 0.08, fr * 0.18, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  } else {
    ctx.fillStyle = '#7a1f2b';
    ctx.beginPath(); ctx.ellipse(fx, my, fr * (0.13 + 0.05 * open), fr * (0.05 + 0.17 * open), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff8fa3';
    ctx.beginPath(); ctx.ellipse(fx, my + fr * 0.1 * open, fr * 0.08, fr * 0.05 * open, 0, 0, Math.PI * 2); ctx.fill();
  }

  // arms (angle 0 = hanging down, PI/2 = sideways, PI = straight up, negative = across body)
  ctx.lineWidth = 5 * s;
  for (const side of [-1, 1]) {
    const a = side < 0 ? p.armL || 0 : p.armR || 0;
    const shx = side * fr * 0.88, shy = face.fy + fr * 0.15;
    const hx = shx + side * Math.sin(a) * armLen, hy = shy + Math.cos(a) * armLen;
    limb(ctx, shx, shy, hx, hy, -side * 6 * s);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hx, hy, 7 * s, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5 * s; ctx.stroke(); ctx.lineWidth = 5 * s;
  }
  ctx.restore();

  // where a speech bubble should point
  const headY = hipY - R * 2 * (p.sy || 1) + (p.dy || 0);
  ctx.restore();
  return { headX: p.x + (p.dx || 0), headY: p.y + headY - 30 * s };
}
