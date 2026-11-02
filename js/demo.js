// A tiny procedural demo track that deliberately refuses to sit on a grid:
// drifting tempo, rubato, odd meters and a calm middle. Handy for trying the
// generator without a file, and used by the tests as ground truth.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function synthDemo(sampleRate = 44100, seed = 7) {
  const R = rng(seed);
  const dur = 50;
  const n = Math.floor(dur * sampleRate);
  const out = new Float32Array(n);
  const kicks = [], snares = [], plucks = [], hats = [];

  const add = (t, fn, len) => {
    const s0 = Math.floor(t * sampleRate), sl = Math.floor(len * sampleRate);
    const fade = Math.min(sl, Math.floor(0.03 * sampleRate)); // no clicks at the tail
    for (let i = 0; i < sl && s0 + i < n; i++) out[s0 + i] += fn(i / sampleRate) * Math.min(1, (sl - i) / fade);
  };
  const kick = (t, amp = 0.9) => {
    kicks.push(t);
    let ph = 0;
    add(t, (x) => {
      const f = 45 + 110 * Math.exp(-x * 30);
      ph += (2 * Math.PI * f) / sampleRate;
      return amp * Math.sin(ph) * Math.exp(-x * 7);
    }, 0.9);
  };
  const snare = (t, amp = 0.45) => {
    snares.push(t);
    add(t, (x) => amp * ((R() * 2 - 1) * Math.exp(-x * 18) + 0.4 * Math.sin(2 * Math.PI * 190 * x) * Math.exp(-x * 25)), 0.25);
  };
  const hat = (t, amp = 0.12) => hats.push(t) && add(t, (x) => amp * (R() * 2 - 1) * Math.exp(-x * 70), 0.06);
  const pluck = (t, freq, amp = 0.35) => {
    plucks.push(t);
    add(t, (x) => amp * Math.exp(-x * 3) * (Math.sin(2 * Math.PI * freq * x) + 0.3 * Math.sin(4 * Math.PI * freq * x)), 1.6);
  };
  const pad = (t0, t1, freqs, amp = 0.05) => {
    add(t0, (x) => {
      const env = Math.min(1, x / 1.5) * Math.min(1, (t1 - t0 - x) / 1.5);
      let s = 0;
      for (const f of freqs) s += Math.sin(2 * Math.PI * f * x + Math.sin(x * 0.7));
      return amp * env * s;
    }, t1 - t0);
  };

  // Part A (0-13s): 7/8 groove, tempo drifting from 112 to 134 bpm
  let t = 0.4, beat = 0, bpm = 112;
  while (t < 13) {
    const pos = beat % 7;
    if (pos === 0 || pos === 3 || pos === 5) kick(t);
    if (pos === 2 || pos === 6) snare(t);
    hat(t + (60 / bpm) * 0.5 * (0.55 + 0.1 * R()));
    hat(t);
    bpm += 22 / 50;
    t += (60 / bpm) * (0.97 + 0.06 * R()); // human wobble
    beat++;
  }
  // Part B (13.5-27s): calm, rubato plucks over a pad
  pad(13.2, 27.5, [220, 277.2, 329.6]);
  const melody = [440, 494, 554, 494, 440, 370, 330, 370, 440, 554, 659, 554, 494];
  let tb = 14;
  for (const f of melody) {
    pluck(tb, f);
    tb += 0.7 + 0.9 * R(); // free time
    if (tb > 26.5) break;
  }
  // Part C (27.5-42s): 5/4 with accelerando 100 -> 150 bpm
  t = 27.6; beat = 0; bpm = 100;
  while (t < 42) {
    const pos = beat % 5;
    if (pos === 0 || pos === 2) kick(t);
    if (pos === 1 || pos === 3 || pos === 4) snare(t, pos === 4 ? 0.3 : 0.45);
    hat(t); hat(t + (60 / bpm) / 3); hat(t + (2 * 60 / bpm) / 3, 0.08);
    bpm += 1.1;
    t += 60 / bpm;
    beat++;
  }
  // Part D (42-49s): ritardando outro
  bpm = 140;
  while (t < 48.5) {
    kick(t, 0.7);
    if (beat % 2) snare(t, 0.3);
    bpm *= 0.93;
    t += 60 / bpm;
    beat++;
  }
  pluck(t + 0.2, 220, 0.4);

  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * 0.9;
  return { sampleRate, data: out, kicks, snares, plucks, hats, duration: dur };
}

export function encodeWav(data, sampleRate) {
  const buf = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}
