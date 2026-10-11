// The hero: a CC0 rigged robot (RobotExpressive by Quaternius) with blended animations,
// camera-relative movement, jumping, flying, and simple terrain/obstacle collision.
import { loadRobot, makeRobot, crossfade } from './characters.js';
import { groundAt, resolveCollisions } from './world.js';
import { down, pressed } from './input.js';

const WALK = 4.2, RUN = 9, FLY = 16, FLY_FAST = 32, CLIMB = 10, CLIMB_FAST = 20;
const GRAVITY = -26, JUMP_V = 9.5, RADIUS = 0.45;
const STEP_UP = 0.45, MAX_SLOPE = 1.1, DEEP_WATER = -0.9, MAX_ALTITUDE = 160;

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const turnToward = (from, to, maxStep) => {
  const diff = wrapAngle(to - from);
  return from + Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
};

export async function loadHero(scene) {
  const { root, pivot, mixer, actions } = makeRobot(await loadRobot(), scene);
  return new Hero(root, pivot, mixer, actions);
}

class Hero {
  constructor(root, pivot, mixer, actions) {
    Object.assign(this, { root, pivot, mixer, actions });
    this.pos = root.position;
    this.vy = 0;
    this.onGround = true;
    this.flying = false;
    this.heading = 0;
    this.moving = false;
    this.running = false;
    this.current = null;
    this.emote = null;
    this.message = null;   // one-shot text for the HUD toast
    this.play('Idle');
    mixer.addEventListener('finished', (e) => {
      if (e.action === this.actions[this.emote]) this.emote = null;
    });
  }

  play(name, fade = 0.25) {
    crossfade(this, name, fade);
  }

  startEmote(name) {
    if (this.flying || !this.onGround) return;
    this.emote = name;
    this.current = null;   // force the crossfade even if we were already in this clip
    this.play(name, 0.2);
  }

  // fromY: height to search down from; default counts every platform (spawn on the deck).
  // Pass the current height to stay at ground level (e.g. not land on a roof overhead).
  placeAt(x, z, heading, fromY = Infinity) {
    this.pos.set(x, groundAt(x, z, fromY), z);
    this.heading = heading;
    this.root.rotation.y = heading;
  }

  canMoveTo(x, z, dist) {
    if (this.flying) return true;
    const g = groundAt(x, z, this.pos.y);
    if (g < DEEP_WATER) return false;                       // no swimming
    if (g > this.pos.y + STEP_UP) return false;            // ledge or wall
    if (this.onGround && dist > 1e-4 && (g - this.pos.y) / dist > MAX_SLOPE) return false;   // too steep
    return true;
  }

  update(dt, camYaw, faceCamera) {
    const ix = (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0);
    const iz = (down('KeyW') || down('ArrowUp') ? 1 : 0) - (down('KeyS') || down('ArrowDown') ? 1 : 0);
    this.running = down('ShiftLeft') || down('ShiftRight');

    if (pressed('KeyF')) {
      if (this.flying && groundAt(this.pos.x, this.pos.z, this.pos.y) < DEEP_WATER) this.message = "Can't land on water";
      else { this.flying = !this.flying; this.vy = 0; this.emote = null; }
    }
    if (pressed('KeyG')) this.startEmote('Wave');
    if (pressed('KeyV')) this.startEmote('Dance');

    // Camera-relative direction: camera forward is (-sin yaw, -cos yaw) on the ground plane.
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let mx = fx * iz - fz * ix, mz = fz * iz + fx * ix;
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.01;
    if (this.moving) {
      mx /= len; mz /= len;
      this.emote = null;
      this.heading = turnToward(this.heading, Math.atan2(mx, mz), dt * 10);
    } else if (faceCamera) {
      this.heading = turnToward(this.heading, Math.atan2(fx, fz), dt * 12);
    }

    // Horizontal move, sliding along an axis when the direct step is blocked.
    if (this.moving) {
      const speed = this.flying ? (this.running ? FLY_FAST : FLY) : (this.running ? RUN : WALK);
      const step = speed * dt, nx = this.pos.x + mx * step, nz = this.pos.z + mz * step;
      if (this.canMoveTo(nx, nz, step)) { this.pos.x = nx; this.pos.z = nz; }
      else if (this.canMoveTo(nx, this.pos.z, Math.abs(mx * step))) this.pos.x = nx;
      else if (this.canMoveTo(this.pos.x, nz, Math.abs(mz * step))) this.pos.z = nz;
      resolveCollisions(this.pos, RADIUS);
    }

    // Vertical.
    const g = groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.flying) {
      const climb = (down('KeyE') || down('Space') ? 1 : 0) - (down('KeyC') ? 1 : 0);
      this.pos.y = Math.min(Math.max(this.pos.y + climb * (this.running ? CLIMB_FAST : CLIMB) * dt, g + 0.2), MAX_ALTITUDE);
      this.onGround = false;
    } else {
      if (this.onGround && pressed('Space')) {
        this.vy = JUMP_V;
        this.onGround = false;
        this.emote = null;
        this.current = null;
        this.play(this.moving ? 'WalkJump' : 'Jump', 0.1);
      }
      this.vy += GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= g) { this.pos.y = g; this.vy = 0; this.onGround = true; }
      else if (this.onGround && this.vy <= 0 && this.pos.y - g < 0.35) { this.pos.y = g; this.vy = 0; }   // stick to downhill slopes
      else this.onGround = false;
    }

    this.root.rotation.y = this.heading;
    const lean = this.flying && this.moving ? (this.running ? 0.75 : 0.45) : 0;
    this.pivot.rotation.x += (lean - this.pivot.rotation.x) * Math.min(1, dt * 6);

    if (this.emote) return;
    if (this.flying) this.play('Idle');
    else if (this.onGround) this.play(this.moving ? (this.running ? 'Running' : 'Walking') : 'Idle');
  }

  get mode() {
    if (this.flying) return 'Flying';
    if (!this.moving) return 'Standing';
    return this.running ? 'Running' : 'Walking';
  }
}
