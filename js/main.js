import { analyzeBuffer } from './analysis.js';
import { buildChoreography } from './choreography.js';
import { renderFrame } from './scene.js';

const $ = (id) => document.getElementById(id);
const canvas = $('video'), ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

let file = null, buffer = null, analysis = null, chor = null, title = '';
let recorder = null;

function status(msg, isError = false) {
  $('status').textContent = msg;
  $('status').classList.toggle('error', isError);
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Show any unexpected failure on the page instead of failing silently.
window.addEventListener('error', (e) => status(`Something went wrong: ${e.message}`, true));
window.addEventListener('unhandledrejection', (e) => status(`Something went wrong: ${e.reason && e.reason.message ? e.reason.message : e.reason}`, true));

// Older Safari/Firefox lack roundRect, which the speech bubbles use.
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

// ---------- playback ----------
// The song plays from the decoded buffer through Web Audio rather than an
// <audio> element: hosted pages often block <audio> from loading uploads.
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
    // must happen inside a tap/click on phones
    if (this.actx.state === 'suspended') this.actx.resume();
    return this.actx;
  },
  time() {
    if (!this.playing) return this.offset;
    const lat = this.actx.outputLatency || this.actx.baseLatency || 0;
    return Math.max(0, this.actx.currentTime - this.startedAt + this.offset - lat);
  },
  play(from = this.offset) {
    if (!buffer) return;
    this.ensure();
    this.stopSource();
    if (from >= buffer.duration - 0.05) from = 0;
    const src = this.actx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.master);
    src.onended = () => {
      if (this.src !== src) return; // stopped on purpose
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
  stopSource() {
    const s = this.src;
    this.src = null;
    if (s) { try { s.stop(); } catch (e) { /* already stopped */ } s.disconnect(); }
  },
};
function setPlayLabel() { $('play').textContent = player.playing ? '❚❚ Pause' : '▶ Play'; }

function readFile(f) {
  if (f.arrayBuffer) return f.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('could not read the file'));
    r.readAsArrayBuffer(f);
  });
}

function decode(actx, ab) {
  // callback + promise form so older Safari works too
  return new Promise((resolve, reject) => {
    const p = actx.decodeAudioData(ab, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
}

// ---------- the two steps ----------
$('file').addEventListener('change', () => {
  file = $('file').files && $('file').files[0];
  $('generate').disabled = !file;
  if (file) status(`Ready: ${file.name}. Press Generate.`);
});

$('generate').addEventListener('click', async () => {
  if (!file) return;
  const actx = player.ensure(); // unlock sound while we still have the tap
  player.pause();
  player.offset = 0;
  $('generate').disabled = true;
  status(`Reading ${file.name}…`);
  try {
    const ab = await readFile(file);
    status('Decoding the audio…');
    try {
      buffer = await decode(actx, ab);
    } catch (err) {
      throw new Error(`couldn't read "${file.name}" as audio. Try an mp3 or wav file.`);
    }
    status('Listening for the beats…');
    await new Promise((r) => setTimeout(r, 30)); // let the message paint
    analysis = analyzeBuffer(buffer);
    chor = buildChoreography(analysis, { seed: Math.floor(Math.random() * 1e6) + 1 });
    title = file.name.replace(/\.[^.]+$/, '');
    $('stage').hidden = false;
    $('download').hidden = true;
    const calm = chor.scenes.filter((s) => s.type === 'sincere').length;
    status(`Generated: ${chor.scenes.length} scenes, ${calm} sincere moment${calm === 1 ? '' : 's'}. Press Generate again for a different version.`);
    player.play(0);
    $('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    status(`Sorry, ${err.message || err}`, true);
  } finally {
    $('generate').disabled = !file;
  }
});

$('play').addEventListener('click', () => {
  if (player.playing) player.pause(); else player.play();
});

// ---------- drawing loop ----------
let frozen = false;
function frame() {
  try {
    if (!frozen && analysis && chor && !$('stage').hidden) {
      const t = Math.min(analysis.duration, player.time());
      renderFrame(ctx, W, H, t, analysis, chor, { title });
      $('time').textContent = `${fmt(t)} / ${fmt(analysis.duration)}`;
    }
  } catch (err) {
    status(`Drawing failed: ${err.message}`, true);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- save as a video file ----------
$('save').addEventListener('click', () => {
  if (recorder) { recorder.stop(); player.pause(); return; }
  if (!buffer) return;
  const actx = player.ensure();
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  const mimeType = window.MediaRecorder && canvas.captureStream && types.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) { status('This browser can\'t save video. Try Chrome or Firefox on a computer.', true); return; }
  const dest = actx.createMediaStreamDestination();
  player.master.connect(dest);
  const stream = canvas.captureStream(30);
  stream.addTrack(dest.stream.getAudioTracks()[0]);
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000 });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    player.master.disconnect(dest);
    const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
    const a = $('download');
    a.href = URL.createObjectURL(blob);
    a.download = `${title || 'fruit-party'}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
    a.hidden = false;
    $('save').classList.remove('on');
    $('save').textContent = 'Save video';
    recorder = null;
    status('Your video is ready. Press Download video.');
  };
  recorder.start(1000);
  player.play(0);
  player.onEnd = () => recorder && recorder.stop();
  $('save').classList.add('on');
  $('save').textContent = '■ Stop';
  status('Recording the whole song in real time. Keep this page open and on screen until it ends.');
});

// for debugging: window.fruitParty.renderAt(12.3)
window.fruitParty = {
  get analysis() { return analysis; },
  get choreography() { return chor; },
  renderAt(t) { frozen = true; if (analysis) renderFrame(ctx, W, H, t, analysis, chor, { title }); },
  resume() { frozen = false; },
};
