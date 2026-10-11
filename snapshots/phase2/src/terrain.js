// Procedural island: one height function drives the mesh, the hero, the camera and prop placement.
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

export const ISLAND_RADIUS = 170;
export const VOLCANO = { x: -70, z: -45, radius: 50, height: 52, craterR: 9, craterDepth: 9 };
export const POND = { x: 58, z: -12, r: 16 };
export const LAGOON = { x: -35, z: 140, r: 38 };
export const OUTPOST = { x: -8, z: 68, r: 24 };   // levelled clearing for the puzzle area (phase 2)

const TERRAIN_SIZE = 440;
const TERRAIN_SEGMENTS = 220;   // 2 m cells

const perlin = new ImprovedNoise();   // fixed permutation -> same island every load
export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function fbm(x, z, octaves = 4) {
  let amp = 1, freq = 1 / 70, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * perlin.noise(x * freq, z * freq, 0.5 + i * 7.1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function naturalHeight(x, z) {
  const d = Math.hypot(x, z);
  const ang = Math.atan2(z, x);
  const coast = ISLAND_RADIUS * (1 + 0.18 * perlin.noise(Math.cos(ang) * 1.6 + 3, Math.sin(ang) * 1.6 + 3, 2.2));
  const land = 1 - smoothstep(coast * 0.7, coast * 1.02, d);   // 1 inland, 0 out at sea

  let h = -9 + land * 11.5;                       // seabed rising to a low plateau
  h += land * land * (fbm(x, z) * 7 + 1.5);       // rolling hills

  // Volcano: cone that reaches full height at the rim, then a crater inside it.
  const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  const cone = Math.min(1, Math.max(0, (VOLCANO.radius - dv) / (VOLCANO.radius - VOLCANO.craterR)));
  h += VOLCANO.height * Math.pow(cone, 1.5) * (1 + 0.06 * perlin.noise(x * 0.15, z * 0.15, 9));
  h -= VOLCANO.craterDepth * (1 - smoothstep(VOLCANO.craterR * 0.5, VOLCANO.craterR, dv));

  // Lagoon bitten out of the coast, and an inland pond (both below sea level so the sea fills them).
  const dl = Math.hypot(x - LAGOON.x, z - LAGOON.z);
  h -= 10 * (1 - smoothstep(LAGOON.r * 0.35, LAGOON.r, dl));
  const dp = Math.hypot(x - POND.x, z - POND.z);
  h = THREE.MathUtils.lerp(-1.6, h, smoothstep(POND.r * 0.55, POND.r, dp));

  return h;
}

// The outpost clearing is flattened to the natural height at its centre, blending out at the edge.
const OUTPOST_LEVEL = Math.max(2, naturalHeight(OUTPOST.x, OUTPOST.z));
export function heightAt(x, z) {
  const h = naturalHeight(x, z);
  const d = Math.hypot(x - OUTPOST.x, z - OUTPOST.z);
  return d >= OUTPOST.r ? h : THREE.MathUtils.lerp(OUTPOST_LEVEL, h, smoothstep(OUTPOST.r * 0.7, OUTPOST.r, d));
}

export function slopeAt(x, z) {
  const e = 1;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);   // rise over run
}

const C = (hex) => new THREE.Color(hex);
const SAND = C(0xe3d29b), WET_SAND = C(0xb9a674), GRASS_A = C(0x6cb24f), GRASS_B = C(0x4e9440),
  ROCK = C(0x7d7468), ASH = C(0x3d3532), SCORCH = C(0x5a4a40);

export function buildTerrain() {
  let geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));

  // Non-indexed so every triangle gets its own flat color: the low-poly look.
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const colors = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const ny = n.getY(i);
    const dv = Math.hypot(cx - VOLCANO.x, cz - VOLCANO.z);

    if (cy < -0.2) col.copy(WET_SAND);
    else if (cy < 1.3) col.copy(SAND);
    else if (dv < VOLCANO.radius * 0.95) {
      const up = smoothstep(VOLCANO.radius * 0.95, VOLCANO.craterR, dv);
      col.copy(SCORCH).lerp(ASH, up);
      if (dv > VOLCANO.radius * 0.75) col.lerp(GRASS_B, smoothstep(VOLCANO.radius * 0.75, VOLCANO.radius * 0.95, dv));
    } else if (ny < 0.8) col.copy(ROCK);
    else col.copy(GRASS_A).lerp(GRASS_B, 0.5 + 0.5 * perlin.noise(cx * 0.05, cz * 0.05, 4.4));

    const jitter = 0.94 + Math.random() * 0.1;   // a little per-face variation
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = col.r * jitter;
      colors[(i + k) * 3 + 1] = col.g * jitter;
      colors[(i + k) * 3 + 2] = col.b * jitter;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

// Faceted animated sea near the island, plus a flat outer sea out to the horizon.
export function buildWater() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f9bc4, roughness: 0.25, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.82 });
  const near = new THREE.Mesh(new THREE.PlaneGeometry(560, 560, 140, 140).rotateX(-Math.PI / 2), mat);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 1, 1).rotateX(-Math.PI / 2), mat);
  far.position.y = -0.15;
  near.renderOrder = far.renderOrder = 1;
  group.add(far, near);

  const pos = near.geometry.attributes.position;
  const base = Float32Array.from(pos.array);
  const update = (t) => {
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      const edge = smoothstep(280, 230, Math.max(Math.abs(x), Math.abs(z)));   // flatten toward the seam
      pos.setY(i, edge * (0.22 * Math.sin(x * 0.09 + t * 1.1) * Math.cos(z * 0.07 + t * 0.8) + 0.12 * Math.sin((x + z) * 0.21 + t * 1.7)));
    }
    pos.needsUpdate = true;   // flat shading derives normals in the shader, so no normal recompute
  };
  return { group, update };
}
