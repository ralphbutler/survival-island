// All sound is synthesized with the Web Audio API -- no audio files.
// The volcano is a positional source (louder as you approach, linear falloff like the original);
// waves, wind and birds are a non-positional bed.
import * as THREE from 'three';

function noiseBuffer(ctx, seconds, brown) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; } else data[i] = white;
  }
  return buf;
}

function loopedNoise(ctx, seconds, brown) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds, brown);
  src.loop = true;
  src.start();
  return src;
}

function volcanoNode(ctx) {
  const out = ctx.createGain();
  out.gain.value = VOLCANO_GAIN;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 150;
  loopedNoise(ctx, 6, true).connect(lp).connect(out);

  // Lava gurgles: short sine "bloops" that drop in pitch.
  const bubble = () => {
    const t = ctx.currentTime, f = 60 + Math.random() * 120;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.9, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.45, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.4);
    setTimeout(bubble, 120 + Math.random() * 650);
  };
  bubble();
  return out;
}

function ambienceNode(ctx) {
  const out = ctx.createGain();
  out.gain.value = 0.5;

  // Waves: band-passed noise swelling on a slow LFO.
  const waves = ctx.createGain();
  waves.gain.value = 0.25;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 420;
  bp.Q.value = 0.5;
  loopedNoise(ctx, 5, false).connect(bp).connect(waves).connect(out);
  const lfo = ctx.createOscillator(), depth = ctx.createGain();
  lfo.frequency.value = 0.11;
  depth.gain.value = 0.2;
  lfo.connect(depth).connect(waves.gain);
  lfo.start();

  // Wind: low rumble of brown noise.
  const wind = ctx.createBiquadFilter();
  wind.type = 'lowpass';
  wind.frequency.value = 500;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.25;
  loopedNoise(ctx, 7, true).connect(wind).connect(windGain).connect(out);

  // Birds: a few quick chirps every several seconds.
  const chirp = () => {
    const n = 2 + Math.floor(Math.random() * 3), base = 2400 + Math.random() * 1500;
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * 0.13;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.07);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.04, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.1);
    }
    setTimeout(chirp, 3000 + Math.random() * 6000);
  };
  setTimeout(chirp, 2000);
  return out;
}

// ---------- one-shot effects and music (no-ops until startAudio has run) ----------
let ctx = null, sfxOut = null, listener = null;
export const getListener = () => listener;

// Mixing: the volcano is quieter near the outpost (zone) and everything background dips while
// someone is talking (duck), so the voices stay easy to hear.
let volcanoOut = null, ambienceOut = null, duckTimer = 0;
const VOLCANO_GAIN = 1.4, AMBIENCE_GAIN = 0.5;
const level = { zone: 1, duck: 1 };
function applyLevels() {
  if (!ctx) return;
  volcanoOut.gain.setTargetAtTime(VOLCANO_GAIN * level.zone * level.duck, ctx.currentTime, 0.35);
  ambienceOut.gain.setTargetAtTime(AMBIENCE_GAIN * (0.6 + 0.4 * level.duck), ctx.currentTime, 0.35);
}
export function setVolcanoZone(factor) {
  if (Math.abs(factor - level.zone) < 0.02) return;
  level.zone = factor;
  applyLevels();
}
// Duck the background for `seconds` (a new line restarts the timer).
export function duckFor(seconds) {
  level.duck = 0.35;
  applyLevels();
  clearTimeout(duckTimer);
  duckTimer = setTimeout(() => { level.duck = 1; applyLevels(); }, seconds * 1000);
}

function tone(freq, t, dur, { type = 'sine', gain = 0.2, attack = 0.01, glideTo = null } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxOut);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noiseBurst(t, dur, { freq = 1000, toFreq = null, q = 1, gain = 0.3, type = 'bandpass' } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur + 0.1, false);
  const f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxOut);
  src.start(t);
}

export const sfx = {
  chime() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [880, 1318.5, 1760].forEach((f, i) => tone(f, t + i * 0.08, 0.5, { gain: 0.12 }));
  },
  bigChime() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.1, 0.9, { type: 'triangle', gain: 0.12 }));
  },
  whoosh() {
    if (!ctx) return;
    noiseBurst(ctx.currentTime, 0.28, { freq: 300, toFreq: 1600, q: 0.8, gain: 0.25 });
  },
  thunk() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(160, t, 0.25, { glideTo: 60, gain: 0.5 });
    noiseBurst(t, 0.08, { freq: 900, q: 0.7, gain: 0.3 });
  },
  bonk() {   // coconut on wood or ground
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(320 + Math.random() * 120, t, 0.12, { glideTo: 180, gain: 0.18, type: 'triangle' });
  },
  denied() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(220, t, 0.18, { type: 'square', gain: 0.06 });
    tone(165, t + 0.2, 0.3, { type: 'square', gain: 0.06 });
  },
  door() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noiseBurst(t, 1.1, { freq: 200, toFreq: 1200, q: 2, gain: 0.25 });
    tone(90, t, 1.1, { type: 'sawtooth', gain: 0.05, glideTo: 140 });
    tone(60, t + 1.0, 0.3, { glideTo: 40, gain: 0.4 });   // clunk at the end
  },
  ignite() {
    if (!ctx) return;
    noiseBurst(ctx.currentTime, 1.2, { freq: 150, toFreq: 2500, q: 0.6, gain: 0.5, type: 'lowpass' });
  },
};

// Ode to Joy on a little synth (Beethoven, public domain), with a simple bass line.
export function playOdeToJoy() {
  if (!ctx) return;
  const N = { G3: 196, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, C3: 130.81, G2: 98 };
  const phrase = (ending) => [
    ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1],
    ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ...ending,
  ];
  const melody = [...phrase([['E4', 1.5], ['D4', 0.5], ['D4', 2]]), ...phrase([['D4', 1.5], ['C4', 0.5], ['C4', 2]])];
  const beat = 0.42;
  let t = ctx.currentTime + 0.1;
  for (const [note, beats] of melody) {
    tone(N[note], t, beats * beat * 0.95, { type: 'triangle', gain: 0.16, attack: 0.02 });
    tone(N[note] * 2, t, beats * beat * 0.6, { type: 'sine', gain: 0.03 });
    t += beats * beat;
  }
  const bass = ['C3', 'G2', 'C3', 'G2', 'C3', 'G2', 'C3', 'C3'];
  bass.forEach((n, i) => tone(N[n], ctx.currentTime + 0.1 + i * 4 * beat, 4 * beat * 0.9, { type: 'sine', gain: 0.12, attack: 0.05 }));
}

// Crackling fire: soft roar plus random pops. Returns a node for a PositionalAudio.
export function crackleNode() {
  const out = ctx.createGain();
  out.gain.value = 0.9;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  const roar = ctx.createGain();
  roar.gain.value = 0.35;
  loopedNoise(ctx, 4, true).connect(lp).connect(roar).connect(out);
  const pop = () => {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.03, false);
    const hp = ctx.createBiquadFilter(), g = ctx.createGain();
    hp.type = 'highpass';
    hp.frequency.value = 1500 + Math.random() * 3000;
    g.gain.value = 0.2 + Math.random() * 0.5;
    src.connect(hp).connect(g).connect(out);
    src.start(t);
    setTimeout(pop, 30 + Math.random() * (Math.random() < 0.2 ? 600 : 160));
  };
  pop();
  return out;
}

export function positional(nodeOrNull, anchor, { ref = 6, max = 80, model = 'inverse' } = {}) {
  const pa = new THREE.PositionalAudio(listener);
  if (nodeOrNull) pa.setNodeSource(nodeOrNull);
  pa.setDistanceModel(model);
  pa.setRefDistance(ref);
  pa.setMaxDistance(max);
  anchor.add(pa);
  return pa;
}

// Must be called from a user gesture (browsers block audio until then).
export function startAudio(camera, volcanoAnchor) {
  listener = new THREE.AudioListener();
  camera.add(listener);
  ctx = listener.context;
  ctx.resume();
  sfxOut = ctx.createGain();
  sfxOut.connect(listener.getInput());

  const volcano = new THREE.PositionalAudio(listener);
  volcanoOut = volcanoNode(ctx);
  volcano.setNodeSource(volcanoOut);
  volcano.setDistanceModel('linear');
  volcano.setRefDistance(15);
  volcano.setMaxDistance(260);
  volcano.setRolloffFactor(1);
  volcanoAnchor.add(volcano);

  const ambience = new THREE.Audio(listener);
  ambienceOut = ambienceNode(ctx);
  ambience.setNodeSource(ambienceOut);

  let muted = false;
  return {
    toggleMute() {
      muted = !muted;
      listener.setMasterVolume(muted ? 0 : 1);
      return muted;
    },
  };
}
