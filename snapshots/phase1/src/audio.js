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
  out.gain.value = 1.4;
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

// Must be called from a user gesture (browsers block audio until then).
export function startAudio(camera, volcanoAnchor) {
  const listener = new THREE.AudioListener();
  camera.add(listener);
  const ctx = listener.context;
  ctx.resume();

  const volcano = new THREE.PositionalAudio(listener);
  volcano.setNodeSource(volcanoNode(ctx));
  volcano.setDistanceModel('linear');
  volcano.setRefDistance(15);
  volcano.setMaxDistance(260);
  volcano.setRolloffFactor(1);
  volcanoAnchor.add(volcano);

  const ambience = new THREE.Audio(listener);
  ambience.setNodeSource(ambienceNode(ctx));

  let muted = false;
  return {
    toggleMute() {
      muted = !muted;
      listener.setMasterVolume(muted ? 0 : 1);
      return muted;
    },
  };
}
