// Audio analysis: turns a decoded song into a timeline of real events.
// Nothing here assumes a fixed tempo or grid — every move in the video is
// anchored to onsets that were actually detected in the audio.

// ---------- small helpers ----------
function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export function quantile(arr, q) {
  if (!arr.length) return 0;
  const s = Array.from(arr).sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))));
  return s[idx];
}

function smooth(arr, radius) {
  // moving average via prefix sums
  const n = arr.length, out = new Float32Array(n), pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + arr[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius), b = Math.min(n, i + radius + 1);
    out[i] = (pre[b] - pre[a]) / (b - a);
  }
  return out;
}

function normalize(arr, q = 0.98) {
  const ref = quantile(arr, q) || 1;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = Math.min(1.5, arr[i] / ref);
  return out;
}

function movingMedian(arr, radius) {
  const n = arr.length, out = new Float32Array(n);
  const win = [];
  for (let i = 0; i < n; i++) {
    win.length = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(n - 1, i + radius); j++) win.push(arr[j]);
    win.sort((a, b) => a - b);
    out[i] = win[win.length >> 1];
  }
  return out;
}

// ---------- main entry ----------
// buffer: anything with { sampleRate, numberOfChannels, length, getChannelData(c) }
export function analyzeBuffer(buffer, { sensitivity = 1 } = {}) {
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / buffer.numberOfChannels;
  }

  const N = sr > 60000 ? 2048 : 1024;
  const hop = N >> 1;
  const frameDur = hop / sr;
  const frames = Math.max(1, Math.floor((len - N) / hop) + 1);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  const binHz = sr / N;
  const lowEnd = Math.ceil(180 / binHz), midEnd = Math.ceil(2200 / binHz), top = Math.min(N / 2, Math.ceil(12000 / binHz));

  const rms = new Float32Array(frames);
  const bandE = [new Float32Array(frames), new Float32Array(frames), new Float32Array(frames)];
  const flux = [new Float32Array(frames), new Float32Array(frames), new Float32Array(frames)];
  const re = new Float32Array(N), im = new Float32Array(N);
  let prev = new Float32Array(N / 2), cur = new Float32Array(N / 2);

  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    let e = 0;
    for (let i = 0; i < N; i++) {
      const s = mono[off + i] || 0;
      e += s * s;
      re[i] = s * win[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(e / N);
    fftInPlace(re, im);
    for (let k = 1; k < top; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const lm = Math.log1p(100 * mag); // log compression evens out loud/quiet parts
      cur[k] = lm;
      const b = k < lowEnd ? 0 : k < midEnd ? 1 : 2;
      bandE[b][f] += mag;
      if (f > 0) {
        const d = lm - prev[k];
        if (d > 0) flux[b][f] += d;
      }
    }
    const t = prev; prev = cur; cur = t;
  }

  // per-band novelty, normalised so each band has a comparable voice
  // A band only gets a say when something is actually sounding in it,
  // otherwise log-compressed leakage in a quiet band looks like hits.
  const gated = flux.map((fl, b) => {
    const ref = quantile(bandE[b], 0.9) || 1;
    const out = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      const lvl = Math.max(bandE[b][f], f > 0 ? bandE[b][f - 1] : 0) / ref;
      out[f] = fl[f] * Math.min(1, Math.max(0, (lvl - 0.03) / 0.15));
    }
    return out;
  });
  const nLow = normalize(gated[0], 0.95), nMid = normalize(gated[1], 0.95), nHigh = normalize(gated[2], 0.95);
  const novelty = new Float32Array(frames);
  for (let f = 0; f < frames; f++) novelty[f] = (1.2 * nLow[f] + nMid[f] + 0.7 * nHigh[f]) / 2.9;

  // ----- adaptive peak picking -> onsets (unquantised) -----
  const medR = Math.max(3, Math.round(0.25 / frameDur));
  const med = movingMedian(novelty, medR);
  // also stay relative to the loudest hit nearby, so ghost wobbles under a
  // sustained sound don't count as hits
  const maxR = Math.round(1 / frameDur);
  const localMax = new Float32Array(frames);
  {
    const dq = []; // sliding window max (monotonic deque)
    for (let f = 0; f < frames + maxR; f++) {
      if (f < frames) {
        while (dq.length && novelty[dq[dq.length - 1]] <= novelty[f]) dq.pop();
        dq.push(f);
      }
      const c = f - maxR;
      if (c >= 0) {
        while (dq[0] < c - maxR) dq.shift();
        localMax[c] = novelty[dq[0]];
      }
    }
  }
  const delta = 0.12 / sensitivity;
  const minGap = 0.05;
  const onsets = [];
  for (let f = 2; f < frames - 2; f++) {
    const v = novelty[f];
    if (v < med[f] * 1.15 + delta || v < localMax[f] * 0.3 / sensitivity) continue;
    let isMax = true;
    for (let j = Math.max(0, f - 3); j <= Math.min(frames - 1, f + 3); j++) {
      if (novelty[j] > v) { isMax = false; break; }
    }
    if (!isMax) continue;
    // flux at frame f measures change between window f-1 and f;
    // the attack sits around the start of the newer half-window.
    const time = (f * hop + N * 0.5) / sr;
    const bands = [nLow[f], nMid[f], nHigh[f]];
    const band = bands.indexOf(Math.max(...bands));
    const o = { time, raw: v - med[f], band, low: nLow[f], mid: nMid[f], high: nHigh[f] };
    const last = onsets[onsets.length - 1];
    if (last && time - last.time < minGap) {
      if (o.raw > last.raw) onsets[onsets.length - 1] = o;
    } else onsets.push(o);
  }
  const strRef = quantile(onsets.map((o) => o.raw), 0.95) || 1;
  onsets.forEach((o, i) => { o.strength = Math.min(1, o.raw / strRef); o.i = i; });

  // ----- frame-rate envelopes for continuous motion -----
  const env = {
    frameDur,
    rms: normalize(smooth(rms, 2), 0.98),
    low: normalize(smooth(bandE[0], 2), 0.98),
    mid: normalize(smooth(bandE[1], 2), 0.98),
    high: normalize(smooth(bandE[2], 2), 0.98),
  };

  const duration = len / sr;
  const pulses = pickPulses(onsets);
  const sections = findSections(onsets, env, duration);

  return { duration, sampleRate: sr, onsets, pulses, sections, env };
}

// The "pulse" is what bodies dance to. It's a subset of onsets chosen by
// local context (no global BPM), so rubato, tempo changes and odd meters
// all come through as-is.
function pickPulses(onsets) {
  if (!onsets.length) return [];
  const cands = [];
  for (let i = 0; i < onsets.length; i++) {
    const o = onsets[i];
    const near = [];
    for (let j = i - 1; j >= 0 && o.time - onsets[j].time < 2; j--) near.push(onsets[j].strength);
    for (let j = i + 1; j < onsets.length && onsets[j].time - o.time < 2; j++) near.push(onsets[j].strength);
    const ref = near.length ? quantile(near, 0.5) : 0;
    const bassy = o.band === 0 || o.low > 0.6;
    if (o.strength >= ref * 0.95 || (bassy && o.strength >= ref * 0.6)) cands.push(o);
  }
  const out = [];
  const minGap = 0.2;
  for (const o of cands) {
    const last = out[out.length - 1];
    if (last && o.time - last.time < minGap) {
      if (o.strength > last.strength) out[out.length - 1] = o;
    } else out.push(o);
  }
  return out.map((o, k) => ({ time: o.time, strength: o.strength, band: o.band, onset: o.i, k }));
}

// Sections: where the song lifts or settles. Calm stretches become the
// sincere fruit-to-fruit moments; busy stretches become the party.
function findSections(onsets, env, duration) {
  const step = 0.5; // seconds
  const nS = Math.max(1, Math.ceil(duration / step));
  const act = new Float32Array(nS), dens = new Float32Array(nS);
  const fd = env.frameDur;
  for (let s = 0; s < nS; s++) {
    const a = Math.floor((s * step) / fd), b = Math.min(env.rms.length, Math.floor(((s + 1) * step) / fd));
    let m = 0;
    for (let f = a; f < b; f++) m += env.rms[f];
    act[s] = b > a ? m / (b - a) : 0;
  }
  for (const o of onsets) {
    const s = Math.min(nS - 1, Math.floor(o.time / step));
    dens[s] += 0.3 + o.strength;
  }
  const actS = normalize(smooth(act, 3), 0.95), densS = normalize(smooth(dens, 4), 0.95);
  const score = new Float32Array(nS);
  for (let s = 0; s < nS; s++) score[s] = 0.6 * actS[s] + 0.4 * densS[s];

  // change-point novelty: mean of next window vs previous window
  const W = 8; // 4 seconds each side
  const nov = new Float32Array(nS);
  for (let s = W; s < nS - W; s++) {
    let a = 0, b = 0;
    for (let j = 1; j <= W; j++) { a += score[s - j]; b += score[s + j - 1]; }
    nov[s] = Math.abs(b - a) / W;
  }
  const minLen = 6; // seconds
  const cands = [];
  const novThr = Math.max(0.08, quantile(nov, 0.85));
  for (let s = 1; s < nS - 1; s++) {
    if (nov[s] >= novThr && nov[s] >= nov[s - 1] && nov[s] >= nov[s + 1]) cands.push({ t: s * step, v: nov[s] });
  }
  cands.sort((a, b) => b.v - a.v);
  const bounds = [];
  for (const c of cands) {
    if (c.t < minLen || duration - c.t < minLen) continue;
    if (bounds.every((b) => Math.abs(b - c.t) >= minLen)) bounds.push(c.t);
  }
  // long uniform songs still get phrase changes every ~20s
  bounds.sort((a, b) => a - b);
  const all = [0, ...bounds, duration];
  const filled = [0];
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1], b = all[i];
    const pieces = Math.max(1, Math.round((b - a) / 20));
    for (let p = 1; p < pieces; p++) filled.push(a + ((b - a) * p) / pieces);
    filled.push(b);
  }

  // snap each boundary to the strongest nearby onset, so cuts land on hits
  for (let i = 1; i < filled.length - 1; i++) {
    let best = null;
    for (const o of onsets) {
      if (Math.abs(o.time - filled[i]) > 0.75) continue;
      if (!best || o.strength > best.strength) best = o;
    }
    if (best) filled[i] = best.time;
  }

  const sections = [];
  for (let i = 0; i < filled.length - 1; i++) {
    const start = filled[i], end = filled[i + 1];
    if (end - start < 0.5) continue;
    let m = 0, c = 0;
    for (let s = Math.floor(start / step); s < Math.min(nS, Math.ceil(end / step)); s++) { m += score[s]; c++; }
    sections.push({ start, end, energy: c ? m / c : 0 });
  }
  const energies = sections.map((s) => s.energy);
  const med = quantile(energies, 0.5);
  const low = quantile(energies, 0.3);
  for (const s of sections) {
    s.type = s.energy <= low && s.energy < med * 0.85 && s.end - s.start >= 5 ? 'calm' : 'busy';
  }
  // Every video deserves at least one sincere moment.
  if (!sections.some((s) => s.type === 'calm') && duration > 40) {
    const mid = sections.filter((s) => s.start > duration * 0.2 && s.end < duration * 0.9 && s.end - s.start >= 6);
    const pool = mid.length ? mid : sections.filter((s) => s.end - s.start >= 6);
    if (pool.length) pool.reduce((a, b) => (b.energy < a.energy ? b : a)).type = 'calm';
  }
  return sections;
}

export async function decodeAndAnalyze(arrayBuffer, opts) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  ctx.close();
  return { buffer, analysis: analyzeBuffer(buffer, opts) };
}

// Binary search: index of last item with time <= t (or -1)
export function lastBefore(list, t) {
  let lo = 0, hi = list.length - 1, ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (list[m].time <= t) { ans = m; lo = m + 1; } else hi = m - 1;
  }
  return ans;
}

export function envAt(env, key, t) {
  const arr = env[key];
  const f = t / env.frameDur;
  const i = Math.floor(f);
  if (i < 0) return arr[0] || 0;
  if (i >= arr.length - 1) return arr[arr.length - 1] || 0;
  const u = f - i;
  return arr[i] * (1 - u) + arr[i + 1] * u;
}
