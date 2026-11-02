// Turns the analysis into a scene plan. All timing comes from detected
// onsets/pulses — scene cuts, move changes, shouts and speech bubble words.
import { DIALOGUES, SHOUTS, OUTRO } from './lines.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FRUITS = ['apple', 'orange', 'banana', 'pear', 'strawberry', 'lemon', 'plum', 'pineapple', 'watermelon', 'cherry'];
export const MOVES = ['bounce', 'sway', 'pump', 'twist', 'wave', 'hop', 'clap'];
const FORMATIONS = ['line', 'circle', 'conga', 'solo', 'pairs'];

function shuffle(arr, R) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Choose strongest onsets inside [a,b) at least `gap` apart.
function strongPoints(list, a, b, gap, minStrength = 0) {
  const inside = list.filter((p) => p.time > a + 0.01 && p.time < b - 0.01 && p.strength >= minStrength);
  inside.sort((x, y) => y.strength - x.strength);
  const out = [];
  for (const p of inside) if (out.every((q) => Math.abs(q.time - p.time) >= gap)) out.push(p);
  return out.sort((x, y) => x.time - y.time);
}

function nearestOnset(onsets, t, within = 0.6) {
  let best = null, bd = within;
  for (const o of onsets) {
    const d = Math.abs(o.time - t);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export function buildChoreography(a, { seed = 1, castSize = 6, customLines = [] } = {}) {
  const R = rng(seed * 9973 + 17);
  const fruits = shuffle(FRUITS, R).slice(0, Math.max(2, Math.min(castSize, FRUITS.length)));
  const cast = fruits.map((type, i) => ({
    id: i,
    type,
    scale: 0.85 + R() * 0.3,
    lazy: R() < 0.3, // some fruit only dance on every other pulse
    delay: R() * 0.03, // tiny human lag so the line isn't robotic
    hue: R(),
  }));

  // dialogue pool (custom lines from the user are paired up in order)
  let dialogues = shuffle(DIALOGUES, R);
  const custom = customLines.map((s) => s.trim()).filter(Boolean);
  if (custom.length) {
    const pairs = [];
    for (let i = 0; i < custom.length; i += 2) pairs.push([custom[i], custom[i + 1] || '...']);
    dialogues = [...pairs, ...dialogues];
  }
  const shouts = shuffle(SHOUTS, R);
  let dIdx = 0, sIdx = 0, palette = 0, pairRot = 0;

  const scenes = [];
  for (const sec of a.sections) {
    if (sec.type === 'calm') {
      const pair = [cast[pairRot % cast.length].id, cast[(pairRot + 1) % cast.length].id];
      pairRot += 2;
      const sc = { type: 'sincere', start: sec.start, end: sec.end, pair, bubbles: [], palette: palette++ };
      planBubbles(sc, a, dialogues, () => dIdx++, R);
      scenes.push(sc);
      continue;
    }
    // busy section: split into formations at its strongest phrase hits
    const phraseHits = strongPoints(a.pulses, sec.start, sec.end, 6, 0.5);
    const cuts = [sec.start, ...phraseHits.filter((p) => p.time - sec.start > 5 && sec.end - p.time > 5).map((p) => p.time), sec.end];
    const cleaned = [cuts[0]];
    for (let i = 1; i < cuts.length; i++) if (cuts[i] - cleaned[cleaned.length - 1] >= 5 || i === cuts.length - 1) cleaned.push(cuts[i]);
    for (let i = 0; i < cleaned.length - 1; i++) {
      const start = cleaned[i], end = cleaned[i + 1];
      if (end - start < 0.3) continue;
      const formation = FORMATIONS[Math.floor(R() * FORMATIONS.length)];
      const sc = {
        type: 'party', start, end, formation,
        soloist: cast[Math.floor(R() * cast.length)].id,
        palette: palette++, bubbles: [], moveChanges: [],
      };
      // dance moves switch on strong hits, never on a timer
      const changes = [{ time: start }, ...strongPoints(a.pulses, start, end, 2.2, 0.55)];
      for (const c of changes) {
        const base = MOVES[Math.floor(R() * MOVES.length)];
        sc.moveChanges.push({
          time: c.time,
          moves: cast.map(() => (R() < 0.6 ? base : MOVES[Math.floor(R() * MOVES.length)])),
        });
      }
      // shouts on the very biggest hits
      for (const p of strongPoints(a.pulses, start + 0.5, end - 1, 5, 0.9)) {
        if (R() < 0.55) {
          sc.bubbles.push({
            start: p.time, end: Math.min(end, p.time + 1.4), speaker: cast[Math.floor(R() * cast.length)].id,
            text: shouts[sIdx++ % shouts.length], shout: true, wordTimes: [p.time],
          });
        }
      }
      scenes.push(sc);
    }
  }
  if (scenes.length) scenes[0].intro = true;

  // closing words on the last strong onset
  const last = scenes[scenes.length - 1];
  if (last && a.duration > 10) {
    const p = strongPoints(a.onsets, a.duration - 6, a.duration - 0.8, 1, 0.3).pop();
    if (p) {
      last.bubbles = last.bubbles.filter((b) => b.end < p.time);
      last.bubbles.push({ start: p.time, end: a.duration, speaker: cast[0].id, text: OUTRO[Math.floor(R() * OUTRO.length)], wordTimes: [p.time], outro: true });
    }
  }
  return { cast, scenes, duration: a.duration };
}

function planBubbles(sc, a, dialogues, nextIdx, R) {
  const len = sc.end - sc.start;
  // always an even number, so every question gets its answer
  const count = Math.max(2, Math.min(8, Math.floor((len - 0.8) / 3.2))) & ~1;
  const slot = (len - 0.8) / count;
  let speaker = 0, line = null, half = 0;
  const starts = [];
  for (let i = 0; i < count; i++) {
    const target = sc.start + 0.6 + i * slot;
    const o = nearestOnset(a.onsets, target, Math.min(0.8, slot / 3));
    starts.push(o ? o.time : target);
  }
  for (let i = 0; i < count; i++) {
    if (half === 0) line = dialogues[nextIdx() % dialogues.length];
    const text = line[half];
    const start = starts[i];
    const end = i + 1 < count ? starts[i + 1] - 0.15 : sc.end - 0.2;
    // words appear on the onsets that fall inside the bubble (like being sung),
    // falling back to an even spread if the music is sparse
    const words = text.split(/\s+/);
    const revealEnd = start + Math.min(2.2, (end - start) * 0.6);
    const os = a.onsets.filter((o) => o.time >= start && o.time <= revealEnd).map((o) => o.time);
    const wordTimes = words.map((_, w) => {
      const even = start + ((revealEnd - start) * w) / words.length;
      if (os.length >= words.length) return os[Math.floor((w * os.length) / words.length)];
      return even;
    });
    sc.bubbles.push({ start, end, speaker: sc.pair[speaker], text, wordTimes });
    speaker ^= 1;
    half ^= 1;
  }
}
