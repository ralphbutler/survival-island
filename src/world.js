// Walkable surfaces and obstacles shared by the hero (and later NPCs).
import { heightAt } from './terrain.js';

export const platforms = [];   // { x, z, hw, hd, yaw, top } -- rotated boxes you can stand on
export const colliders = [];   // { x, z, r, top } -- vertical cylinders (tree trunks, rocks)
export const boxes = [];       // { minX, maxX, minZ, maxZ, bottom, top, enabled } -- axis-aligned walls

// `y` is the height of whoever is asking: a platform only counts if its top is within reach
// (so standing inside the bunker doesn't put you on its roof). Omit y to count every platform.
export function groundAt(x, z, y = Infinity) {
  let g = heightAt(x, z);
  for (const p of platforms) {
    if (p.top > y + 1.0) continue;
    const dx = x - p.x, dz = z - p.z;
    const c = Math.cos(-p.yaw), s = Math.sin(-p.yaw);
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;   // undo the box's Object3D rotation.y
    if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hd) g = Math.max(g, p.top);
  }
  return g;
}

export function resolveCollisions(pos, radius) {
  for (const c of colliders) {
    if (pos.y > c.top) continue;
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const min = c.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
    }
  }
  for (const b of boxes) {
    if (!b.enabled || pos.y >= b.top || pos.y + 1.6 <= b.bottom) continue;
    const pushL = pos.x + radius - b.minX, pushR = b.maxX - (pos.x - radius);
    const pushB = pos.z + radius - b.minZ, pushF = b.maxZ - (pos.z - radius);
    if (pushL <= 0 || pushR <= 0 || pushB <= 0 || pushF <= 0) continue;
    const m = Math.min(pushL, pushR, pushB, pushF);   // leave by the shortest way out
    if (m === pushL) pos.x -= pushL; else if (m === pushR) pos.x += pushR;
    else if (m === pushB) pos.z -= pushB; else pos.z += pushF;
  }
}

// Is a point inside any enabled wall box? (for projectiles)
export function boxAt(x, y, z) {
  return boxes.find((b) => b.enabled && y >= b.bottom && y <= b.top && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
}

// Seeded RNG so props land in the same places every load.
export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
