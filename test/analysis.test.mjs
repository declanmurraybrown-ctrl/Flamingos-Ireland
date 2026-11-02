// Run: node test/analysis.test.mjs
import { analyzeBuffer } from '../js/analysis.js';
import { synthDemo } from '../js/demo.js';
import { buildChoreography } from '../js/choreography.js';

const demo = synthDemo();
const buffer = { sampleRate: demo.sampleRate, numberOfChannels: 1, length: demo.data.length, getChannelData: () => demo.data };
const t0 = Date.now();
const a = analyzeBuffer(buffer);
const ms = Date.now() - t0;

const hits = [...demo.kicks, ...demo.snares, ...demo.plucks].sort((x, y) => x - y);
const tol = 0.05;
let found = 0, errs = [];
for (const h of hits) {
  let best = Infinity;
  for (const o of a.onsets) if (Math.abs(o.time - h) < Math.abs(best)) best = o.time - h;
  if (Math.abs(best) <= tol) { found++; errs.push(best); }
}
const recall = found / hits.length;
const all = [...hits, ...demo.hats];
const precision = a.onsets.filter((o) => all.some((h) => Math.abs(o.time - h) <= tol)).length / a.onsets.length;
const meanErr = errs.reduce((s, e) => s + e, 0) / (errs.length || 1);
const kickHit = demo.kicks.filter((k) => a.pulses.some((p) => Math.abs(p.time - k) <= tol)).length / demo.kicks.length;

console.log(`analysis ${ms}ms, onsets=${a.onsets.length}, pulses=${a.pulses.length}`);
console.log(`onset recall ${(recall * 100).toFixed(1)}%  precision ${(precision * 100).toFixed(1)}%  mean offset ${(meanErr * 1000).toFixed(1)}ms`);
console.log(`kicks landing on a pulse ${(kickHit * 100).toFixed(1)}%`);
console.log('sections', a.sections.map((s) => `${s.start.toFixed(1)}-${s.end.toFixed(1)} ${s.type} ${s.energy.toFixed(2)}`).join(' | '));

const ch = buildChoreography(a, { seed: 3 });
console.log('scenes', ch.scenes.map((s) => `${s.start.toFixed(1)}-${s.end.toFixed(1)} ${s.type}${s.formation ? ':' + s.formation : ''} bubbles=${s.bubbles.length}`).join(' | '));

let ok = true;
const check = (cond, msg) => { if (!cond) { ok = false; console.error('FAIL:', msg); } };
check(recall > 0.85, 'onset recall > 85%');
check(precision > 0.8, 'onset precision > 80%');
check(Math.abs(meanErr) < 0.02, 'mean onset offset < 20ms');
check(kickHit > 0.8, 'kicks drive the pulse');
const calm = a.sections.find((s) => s.type === 'calm');
check(calm && calm.start < 20 && calm.end > 20, 'calm section found around the quiet middle (13-27s)');
check(ch.scenes.some((s) => s.type === 'sincere' && s.bubbles.length >= 2), 'sincere scene with speech bubbles');
console.log(ok ? 'ALL OK' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
