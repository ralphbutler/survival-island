// Gentle wandering for animals: pause (idle/grazing), pick a spot inside the pen, turn, walk there.
// A follower (foal, chick) drifts after its leader instead of picking random spots.
import { heightAt } from './terrain.js';
import { crossfade } from './characters.js';
import { turnToward } from './hero.js';

export const rectBounds = (minX, maxX, minZ, maxZ) => ({
  contains: (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ,
  random: (rand) => [minX + rand() * (maxX - minX), minZ + rand() * (maxZ - minZ)],
  clamp: (p) => { p.x = Math.min(maxX, Math.max(minX, p.x)); p.z = Math.min(maxZ, Math.max(minZ, p.z)); },
});

export const circleBounds = (cx, cz, r) => ({
  contains: (x, z) => Math.hypot(x - cx, z - cz) <= r,
  random: (rand) => { const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r; return [cx + Math.cos(a) * d, cz + Math.sin(a) * d]; },
  clamp: (p) => {
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d > r) { p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
  },
});

export class Wanderer {
  // char: { root, actions?, current? }  animate(char, walking, dt): optional custom animation (code-built animals)
  constructor(char, { bounds, speed = 0.8, walk = 'Walk', idles = ['Idle'], radius = 0.6, leader = null,
    followDist = 2.0, idleTime = [2, 6], animate = null, rand = Math.random }) {
    Object.assign(this, { char, bounds, speed, walk, idles, radius, leader, followDist, idleTime, animate, rand });
    this.pos = char.root.position;
    this.heading = rand() * Math.PI * 2;
    this.target = null;
    this.timer = rand() * 3;
    this.walking = false;
    const [x, z] = bounds.random(rand);
    this.pos.set(x, heightAt(x, z), z);
    this.rest();
  }

  rest() {
    this.walking = false;
    this.target = null;
    this.timer = this.idleTime[0] + this.rand() * (this.idleTime[1] - this.idleTime[0]);
    if (!this.animate) crossfade(this.char, this.idles[Math.floor(this.rand() * this.idles.length)], 0.5);
  }

  pickTarget() {
    if (this.leader) {   // somewhere near the leader
      const a = this.rand() * Math.PI * 2, d = this.followDist * (0.5 + this.rand() * 0.5);
      const t = { x: this.leader.pos.x + Math.cos(a) * d, z: this.leader.pos.z + Math.sin(a) * d };
      this.bounds.clamp(t);
      return t;
    }
    const [x, z] = this.bounds.random(this.rand);
    return { x, z };
  }

  update(dt, others) {
    if (!this.walking) {
      this.timer -= dt;
      const strayed = this.leader && Math.hypot(this.leader.pos.x - this.pos.x, this.leader.pos.z - this.pos.z) > this.followDist * 1.6;
      if (this.timer <= 0 || strayed) {
        this.target = this.pickTarget();
        this.walking = true;
        if (!this.animate) crossfade(this.char, this.walk, 0.4);
      }
    } else {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, dist = Math.hypot(dx, dz);
      if (dist < 0.3) this.rest();
      else {
        const want = Math.atan2(dx, dz);
        this.heading = turnToward(this.heading, want, dt * 2.5);
        const facing = Math.abs(Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading)));
        if (facing < 0.7) {   // turn mostly in place, then walk
          this.pos.x += Math.sin(this.heading) * this.speed * dt;
          this.pos.z += Math.cos(this.heading) * this.speed * dt;
        }
      }
    }

    // Keep personal space, stay in the pen, stand on the ground.
    for (const o of others) {
      if (o === this) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d = Math.hypot(dx, dz), min = this.radius + o.radius;
      if (d < min && d > 1e-4) { this.pos.x += (dx / d) * (min - d) * 0.5; this.pos.z += (dz / d) * (min - d) * 0.5; }
    }
    this.bounds.clamp(this.pos);
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.char.root.rotation.y = this.heading;
    this.animate?.(this.char, this.walking, dt);
  }
}
