# 🍓 Fruit Party: music video maker

You give it a song and it makes a music video. Simple fruit people dance,
party and enjoy life, and in the quiet parts two of them share a sincere
moment with speech bubbles.

**No AI runs during video generation and no tokens are used.** Every frame is
a few canvas circles and lines. The effort goes into **syncing to the music**,
including music that is not quantised and that changes tempo, meter and feel.

## Run it

```bash
npm start          # or: python3 -m http.server 8000
# open http://localhost:8000
```

1. **Upload audio:** pick a song (mp3, wav, m4a and so on).
2. **Generate:** the video starts playing. Press Generate again for a
   different cast, different moves and different lines.

**Save video** records the whole song with sound as a `.webm` file. Recording
runs in real time, so keep the page on screen until the song ends.

No build step and no dependencies. It's plain ES modules.

**Single file you can double-click:** `node tools/bundle.mjs` writes
`fruit-party.html`, a self-contained copy that runs straight from your
computer without a server. You can also send it to friends.

## How the sync works (no grid, no BPM)

| Step | File | What it does |
|---|---|---|
| Onsets | `js/analysis.js` | STFT, then log-compressed spectral flux in 3 bands (bass / mid / high). Quiet bands are gated out. Peaks are picked with an adaptive median and local-max threshold. |
| Pulse | `js/analysis.js` | Strong onsets are chosen **by local context** (median strength in ±2s), not by a global tempo. Rubato, accelerando, 7/8 and 5/4 are kept as they are. |
| Motion | `js/scene.js` | Each move eases from one real pulse to the next (`pulseInfo`), so dancers speed up and slow down with the music. Squash, stretch and flashes decay from the actual hit time. |
| Sections | `js/analysis.js` | Energy and onset density are tracked, then split at change points. Calm stretches become **sincere scenes**, and every cut is snapped to a strong hit. |
| Choreography | `js/choreography.js` | Formations (line, circle, conga, solo, pairs) change on phrase hits and moves change on strong hits. Shouts land on the biggest hits. In speech bubbles, words appear **on the onsets inside the phrase**, so the lines feel sung. |
| Render | `js/scene.js`, `js/fruit.js` | Each frame is a pure function of time, so seeking and recording always give the same picture. Confetti is seeded per hit. |

Settings: **Seed** reshuffles the cast, moves and lines. **Hit sensitivity**
changes how many onsets are detected. **A/V offset** adjusts for your audio
output latency. You can also paste your own lines, which are paired as call
and response in the sincere scenes.

## Tests

```bash
npm test
```

The test synthesises a track with a drifting 7/8 groove, a rubato calm
section, an accelerating 5/4 part and a slowing outro. It checks onset
recall, precision and timing, that kicks drive the pulse, that the calm part
becomes a sincere scene, and that bubbles are planned.

Debug hook in the browser console: `fruitParty.renderAt(12.3)` freezes the
video on that time, and `fruitParty.resume()` goes back to playback.
