import { analyzeBuffer } from './analysis.js';
import { buildChoreography } from './choreography.js';
import { renderFrame } from './scene.js';
import { synthDemo, encodeWav } from './demo.js';

const $ = (id) => document.getElementById(id);
const canvas = $('video'), ctx = canvas.getContext('2d');
const tl = $('timeline'), tctx = tl.getContext('2d');
const W = canvas.width, H = canvas.height;
let buffer = null, analysis = null, chor = null, title = '';
let timelineImg = null;
let recorder = null;

const status = (s) => { $('status').textContent = s; };
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

for (const [id, out, f] of [['cast', 'castOut', (v) => v], ['sens', 'sensOut', (v) => Number(v).toFixed(1)], ['offset', 'offsetOut', (v) => v]]) {
  $(id).addEventListener('input', () => { $(out).textContent = f($(id).value); });
}

// ---------- playback ----------
// The song plays from the decoded buffer through Web Audio, not an <audio>
// element. Hosted/sandboxed pages often forbid <audio> from loading blob:
// URLs of uploaded files, which silently broke playback there. The clock is
// also more precise: we know exactly when the buffer started.
const Ctx = window.AudioContext || window.webkitAudioContext;
const player = {
  actx: null, master: null, src: null,
  playing: false, startedAt: 0, offset: 0, onEnd: null,
  ensure() {
    if (!this.actx) {
      this.actx = new Ctx();
      this.master = this.actx.createGain();
      this.master.connect(this.actx.destination);
    }
    return this.actx;
  },
  // what the listener is hearing right now (minus output latency)
  time() {
    if (!this.playing) return this.offset;
    const lat = this.actx.outputLatency || this.actx.baseLatency || 0;
    return Math.max(0, this.actx.currentTime - this.startedAt + this.offset - lat);
  },
  async play(from = this.offset) {
    if (!buffer) return;
    this.ensure();
    if (this.actx.state === 'suspended') await this.actx.resume();
    this.stopSource();
    if (from >= buffer.duration - 0.05) from = 0;
    const src = this.actx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.master);
    src.onended = () => {
      if (this.src !== src) return; // stopped on purpose (pause/seek)
      this.playing = false;
      this.offset = buffer.duration;
      this.src = null;
      setPlayLabel();
      if (this.onEnd) { const f = this.onEnd; this.onEnd = null; f(); }
    };
    this.src = src;
    this.offset = from;
    this.startedAt = this.actx.currentTime;
    src.start(0, from);
    this.playing = true;
    setPlayLabel();
  },
  pause() {
    if (!this.playing) return;
    this.offset = this.time();
    this.stopSource();
    this.playing = false;
    setPlayLabel();
  },
  seek(t) {
    if (this.playing) this.play(t); else this.offset = t;
  },
  stopSource() {
    const s = this.src;
    this.src = null;
    if (s) { try { s.stop(); } catch (e) { /* already stopped */ } s.disconnect(); }
  },
};
function setPlayLabel() { $('play').textContent = player.playing ? '❚❚ Pause' : '▶ Play'; }

function decode(ab) {
  // promise + callback form, for older Safari
  const dctx = new Ctx();
  return new Promise((resolve, reject) => {
    const p = dctx.decodeAudioData(ab, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  }).finally(() => dctx.close && dctx.close());
}

async function loadArrayBuffer(ab, name) {
  status(`Decoding “${name}”…`);
  player.pause();
  player.offset = 0;
  try {
    buffer = await decode(ab);
  } catch (err) {
    status(`Couldn't read “${name}” as audio. Try an mp3 or wav file. (${err && err.message ? err.message : err})`);
    return;
  }
  title = name.replace(/\.[^.]+$/, '');
  analyse();
}

async function loadFile(f) {
  if (!f) return;
  try {
    const ab = f.arrayBuffer ? await f.arrayBuffer() : await new Response(f).arrayBuffer();
    await loadArrayBuffer(ab, f.name || 'song');
  } catch (err) {
    status(`Couldn't open that file: ${err.message || err}`);
  }
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
    const now = player.time();
    const t = Math.max(0, Math.min(analysis.duration, now + Number($('offset').value) / 1000));
    renderFrame(ctx, W, H, t, analysis, chor, { title });
    drawTimeline(t);
    $('time').textContent = `${fmt(now)} / ${fmt(analysis.duration)}`;
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
  const f = e.target.files && e.target.files[0];
  e.target.value = ''; // so picking the same file again still triggers
  await loadFile(f);
});

// drag a song anywhere onto the page
document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  await loadFile(e.dataTransfer.files && e.dataTransfer.files[0]);
});

$('demo').addEventListener('click', async () => {
  player.ensure(); // unlock audio on this click
  const d = synthDemo();
  await loadArrayBuffer(encodeWav(d.data, d.sampleRate), 'Demo — Rubato Orchard');
});

$('play').addEventListener('click', async () => {
  if (player.playing) player.pause(); else await player.play();
});

tl.addEventListener('click', (e) => {
  if (!analysis) return;
  const r = tl.getBoundingClientRect();
  player.seek(((e.clientX - r.left) / r.width) * analysis.duration);
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
  if (recorder) { recorder.stop(); player.pause(); return; }
  const actx = player.ensure();
  if (actx.state === 'suspended') await actx.resume();
  const dest = actx.createMediaStreamDestination();
  player.master.connect(dest);
  const stream = canvas.captureStream(30);
  stream.addTrack(dest.stream.getAudioTracks()[0]);
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  const mimeType = types.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  if (!mimeType) { status('This browser cannot record video (MediaRecorder unsupported).'); return; }
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    player.master.disconnect(dest);
    const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
    const a = $('download');
    a.href = URL.createObjectURL(blob);
    a.download = `${title || 'fruit-party'}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
    a.hidden = false;
    $('record').classList.remove('on');
    $('record').textContent = '● Record .webm';
    setPlayLabel();
    recorder = null;
    status('Video ready, use the download button.');
  };
  recorder.start(1000);
  await player.play(0);
  player.onEnd = () => recorder && recorder.stop();
  $('record').classList.add('on');
  $('record').textContent = '■ Stop recording';
  status('Recording in real time. Keep this tab visible until the song ends.');
});

// handy for debugging / scripted frame export: window.fruitParty.renderAt(12.3)
window.fruitParty = {
  get analysis() { return analysis; },
  get choreography() { return chor; },
  renderAt(t) { frozen = true; if (analysis) renderFrame(ctx, W, H, t, analysis, chor, { title }); },
  resume() { frozen = false; },
};
