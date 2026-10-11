// NPC speech: subtitles always; voice clips (voices/<id>.wav, made by tools/make_voices.py with
// Gemini TTS) play as positional audio from the speaker when present. Lines live in voices/lines.json,
// the single source for both the game and the voice generator.
import * as THREE from 'three';
import { getListener, positional, duckFor } from './audio.js';

export async function loadLines() {
  const res = await fetch('voices/lines.json');
  return (await res.json()).lines;
}

export class Dialogue {
  constructor(lines, subtitleEl) {
    this.lines = lines;
    this.el = subtitleEl;
    this.loader = new THREE.AudioLoader();
    this.buffers = new Map();   // id -> AudioBuffer | null (null = no file, subtitles only)
    this.speakers = new Map();  // Object3D -> PositionalAudio
    this.busyUntil = 0;
    this.hideTimer = 0;
  }

  get busy() { return performance.now() < this.busyUntil; }

  buffer(id) {
    if (this.buffers.has(id)) return Promise.resolve(this.buffers.get(id));
    return this.loader.loadAsync(`voices/${id}.wav`)
      .catch(() => null)
      .then((buf) => { this.buffers.set(id, buf); return buf; });
  }

  async say(id, speakerObject) {
    const line = this.lines[id];
    if (!line) { console.warn('no line', id); return; }
    const words = line.text.split(/\s+/).length;
    this.busyUntil = performance.now() + (1 + words * 0.36) * 1000;   // provisional, until we know the clip length

    let seconds = 1 + words * 0.36;
    const buf = getListener() ? await this.buffer(id) : null;
    if (buf) {
      if (!this.speakers.has(speakerObject)) this.speakers.set(speakerObject, positional(null, speakerObject, { ref: 7, max: 120 }));
      const voice = this.speakers.get(speakerObject);
      if (voice.isPlaying) voice.stop();
      voice.setBuffer(buf);
      voice.play();
      seconds = buf.duration + 0.4;
    }
    this.busyUntil = performance.now() + seconds * 1000;
    if (buf) duckFor(seconds);   // lower the volcano and wind while the line plays
    this.el.innerHTML = `<b>${line.speaker}:</b> ${line.text}`;
    this.el.classList.remove('hidden');
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.el.classList.add('hidden'), seconds * 1000 + 600);
  }
}
