import { analyzeBuffer } from './analysis.js';
import { buildChoreography } from './choreography.js';
import { renderFrame } from './scene.js';
import { synthDemo, encodeWav } from './demo.js';

const $ = (id) => document.getElementById(id);
const canvas = $('video'), ctx = canvas.getContext('2d');
const tl = $('timeline'), tctx = tl.getContext('2d');
const W = canvas.width, H = canvas.height;
const audio = new Audio();
audio.preload = 'auto';

let buffer = null, analysis = null, chor = null, title = '';
let timelineImg = null;
let actx = null, srcNode = null, recorder = null;

const status = (s) => { $('status').textContent = s; };
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

for (const [id, out, f] of [['cast', 'castOut', (v) => v], ['sens', 'sensOut', (v) => Number(v).toFixed(1)], ['offset', 'offsetOut', (v) => v]]) {
  $(id).addEventListener('input', () => { $(out).textContent = f($(id).value); });
}

function ensureAudioGraph() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  srcNode = actx.createMediaElementSource(audio);
  srcNode.connect(actx.destination);
}

async function loadArrayBuffer(ab, name, blob) {
  status('Decoding…');
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const dctx = new Ctx();
  buffer = await dctx.decodeAudioData(ab.slice(0));
  dctx.close();
  title = name.replace(/\.[^.]+$/, '');
  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = URL.createObjectURL(blob);
  analyse();
}

function analyse() {
  status('Listening for hits…');
  // let the status paint before the (short) blocking analysis
  setTimeout(() => {
    const t0 = performance.now();
    analysis = analyzeBuffer(buffer, { sensitivity: Number($('sens').value) });
    rebuild();
    const calm = chor.scenes.filter((s) => s.type === 'sincere').length;
    status(`${analysis.onsets.length} onsets, ${analysis.pulses.length} pulses, ${chor.scenes.length} scenes (${calm} sincere), analysed in ${Math.round(performance.now() - t0)} ms.`);
    for (const b of ['play', 'record', 'rebuild']) $(b).disabled = false;
  }, 30);
}

function rebuild() {
  chor = buildChoreography(analysis, {
    seed: Number($('seed').value) || 1,
    castSize: Number($('cast').value),
    customLines: $('lines').value.split('\n'),
  });
  drawTimelineBase();
}

function drawTimelineBase() {
  const w = tl.width, h = tl.height, d = analysis.duration;
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const c = off.getContext('2d');
  c.fillStyle = '#22223b'; c.fillRect(0, 0, w, h);
  for (const s of chor.scenes) {
    c.fillStyle = s.type === 'sincere' ? '#c5618355' : '#5a189a55';
    c.fillRect((s.start / d) * w, 0, ((s.end - s.start) / d) * w, h);
    c.fillStyle = '#ffffff99';
    c.font = '11px sans-serif';
    c.fillText(s.type === 'sincere' ? '♡ sincere' : s.formation, (s.start / d) * w + 4, 12);
  }
  // loudness
  c.strokeStyle = '#9a8c98'; c.beginPath();
  const env = analysis.env.rms;
  for (let x = 0; x < w; x++) {
    const v = env[Math.floor((x / w) * env.length)] || 0;
    c.lineTo(x, h - 4 - v * (h * 0.45));
  }
  c.stroke();
  const bandCol = ['#ff006e', '#ffbe0b', '#3a86ff'];
  for (const o of analysis.onsets) {
    c.fillStyle = bandCol[o.band] + 'aa';
    const x = (o.time / d) * w;
    c.fillRect(x, h - 4 - o.strength * 30, 1, o.strength * 30);
  }
  c.fillStyle = '#fff';
  for (const p of analysis.pulses) c.fillRect((p.time / d) * w - 1, h - 3, 2, 3);
  for (const s of chor.scenes) for (const b of s.bubbles) {
    c.fillStyle = b.shout ? '#ffd60a' : '#ffffff';
    c.fillRect((b.start / d) * w, 18, Math.max(2, ((b.end - b.start) / d) * w), 4);
  }
  timelineImg = off;
}

function drawTimeline(t) {
  if (!timelineImg) return;
  tctx.drawImage(timelineImg, 0, 0);
  const x = (t / analysis.duration) * tl.width;
  tctx.fillStyle = '#fff';
  tctx.fillRect(x - 1, 0, 2, tl.height);
}

let frozen = false;
function frame() {
  if (frozen) { requestAnimationFrame(frame); return; }
  if (analysis && chor) {
    const t = Math.max(0, Math.min(analysis.duration, audio.currentTime + Number($('offset').value) / 1000));
    renderFrame(ctx, W, H, t, analysis, chor, { title });
    drawTimeline(t);
    $('time').textContent = `${fmt(audio.currentTime)} / ${fmt(analysis.duration)}`;
  } else {
    ctx.fillStyle = '#1b1b2f'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.font = '32px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🍎 🍌 🍓  load a song to start the party  🍐 🍋 🍊', W / 2, H / 2);
    ctx.textAlign = 'start';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- controls ----------
$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { await loadArrayBuffer(await f.arrayBuffer(), f.name, f); } catch (err) { status('Could not decode that file: ' + err.message); }
});

$('demo').addEventListener('click', async () => {
  const d = synthDemo();
  const wav = encodeWav(d.data, d.sampleRate);
  await loadArrayBuffer(wav, 'Demo — Rubato Orchard', new Blob([wav], { type: 'audio/wav' }));
});

$('play').addEventListener('click', async () => {
  ensureAudioGraph();
  if (actx.state === 'suspended') await actx.resume();
  if (audio.paused) { await audio.play(); $('play').textContent = '❚❚ Pause'; } else { audio.pause(); $('play').textContent = '▶ Play'; }
});
audio.addEventListener('ended', () => { $('play').textContent = '▶ Play'; });

tl.addEventListener('click', (e) => {
  if (!analysis) return;
  const r = tl.getBoundingClientRect();
  audio.currentTime = ((e.clientX - r.left) / r.width) * analysis.duration;
});

$('rebuild').addEventListener('click', () => {
  if (!buffer) return;
  analyse();
});
$('seed').addEventListener('change', () => analysis && rebuild());
$('cast').addEventListener('change', () => analysis && rebuild());
$('lines').addEventListener('change', () => analysis && rebuild());
$('sens').addEventListener('change', () => buffer && analyse());

$('record').addEventListener('click', async () => {
  if (recorder) { recorder.stop(); audio.pause(); return; }
  ensureAudioGraph();
  if (actx.state === 'suspended') await actx.resume();
  const dest = actx.createMediaStreamDestination();
  srcNode.connect(dest);
  const stream = canvas.captureStream(30);
  stream.addTrack(dest.stream.getAudioTracks()[0]);
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  const mimeType = types.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  if (!mimeType) { status('This browser cannot record video (MediaRecorder unsupported).'); return; }
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    srcNode.disconnect(dest);
    const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
    const a = $('download');
    a.href = URL.createObjectURL(blob);
    a.download = `${title || 'fruit-party'}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
    a.hidden = false;
    $('record').classList.remove('on');
    $('record').textContent = '● Record .webm';
    $('play').textContent = '▶ Play';
    recorder = null;
    status('Video ready, use the download button.');
  };
  audio.currentTime = 0;
  recorder.start(1000);
  await audio.play();
  $('play').textContent = '❚❚ Pause';
  $('record').classList.add('on');
  $('record').textContent = '■ Stop recording';
  status('Recording in real time. Keep this tab visible until the song ends.');
  audio.addEventListener('ended', () => recorder && recorder.stop(), { once: true });
});

// handy for debugging / scripted frame export: window.fruitParty.renderAt(12.3)
window.fruitParty = {
  get analysis() { return analysis; },
  get choreography() { return chor; },
  renderAt(t) { frozen = true; if (analysis) renderFrame(ctx, W, H, t, analysis, chor, { title }); },
  resume() { frozen = false; },
};
