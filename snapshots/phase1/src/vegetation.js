// Trees and rocks, built from primitives and drawn with instancing (one draw call per kind).
// Trees default to smooth, lumpy canopies; add ?trees=lowpoly to the URL for the original faceted ones.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { heightAt, slopeAt, VOLCANO, POND } from './terrain.js';
import { colliders, mulberry32 } from './world.js';

// Nudge vertices so shapes look hand-made; shared corners move together so faces stay closed.
function jitter(geo, amount, rand) {
  const pos = geo.attributes.position;
  const moved = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!moved.has(key)) moved.set(key, [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount]);
    const [dx, dy, dz] = moved.get(key);
    pos.setXYZ(i, pos.getX(i) + dx, pos.getY(i) + dy, pos.getZ(i) + dz);
  }
  return geo;
}

function colored(geo, hex) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.deleteAttribute('uv');   // every merged part must carry the same attributes
  const c = new THREE.Color(hex);
  const arr = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function roundTree(rand) {
  return mergeGeometries([
    colored(new THREE.CylinderGeometry(0.22, 0.38, 3.2, 6).translate(0, 1.6, 0), 0x7a5332),
    colored(jitter(new THREE.IcosahedronGeometry(2.1, 0), 0.6, rand).translate(0, 4.4, 0), 0x4f9a3c),
    colored(jitter(new THREE.IcosahedronGeometry(1.5, 0), 0.5, rand).translate(0.9, 5.3, 0.4), 0x5fae45),
  ]);
}

function pineTree(rand) {
  return mergeGeometries([
    colored(new THREE.CylinderGeometry(0.18, 0.3, 2.4, 6).translate(0, 1.2, 0), 0x6b4529),
    colored(jitter(new THREE.ConeGeometry(2.0, 3.2, 7), 0.3, rand).translate(0, 3.2, 0), 0x2f7a3e),
    colored(jitter(new THREE.ConeGeometry(1.5, 2.7, 7), 0.25, rand).translate(0, 4.8, 0), 0x358445),
    colored(jitter(new THREE.ConeGeometry(0.9, 2.1, 7), 0.2, rand).translate(0, 6.2, 0), 0x3b8f4b),
  ]);
}

// ---------- smooth trees ----------
const perlin = new ImprovedNoise();

// Weld a shape's vertices (drop uv/normal first so seams merge), push each vertex along its
// direction from `center` by low-frequency noise, then recompute smooth normals.
function smoothLumpy(geo, { lump, freq, seed, center = new THREE.Vector3() }) {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position, v = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    dir.copy(v).sub(center);
    const len = dir.length();
    if (len < 1e-6) continue;
    const n = perlin.noise(v.x * freq + seed, v.y * freq + seed * 1.7, v.z * freq - seed);
    v.addScaledVector(dir.divideScalar(len), n * lump);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Vertical colour gradient (shadowed underside -> sunlit top), applied after positioning.
function gradient(geo, bottomHex, topHex) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const lo = new THREE.Color(bottomHex), hi = new THREE.Color(topHex), c = new THREE.Color();
  const pos = geo.attributes.position, arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    c.copy(lo).lerp(hi, Math.pow((pos.getY(i) - min.y) / (max.y - min.y || 1), 0.8));
    arr.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function smoothTrunk(rTop, rBottom, h, hex) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, 10, 1, true).translate(0, h / 2, 0);
  return colored(geo, hex);
}

function smoothRoundTree() {
  const blobs = [[0, 4.5, 0, 2.0], [1.1, 4.9, 0.4, 1.45], [-0.9, 5.0, -0.5, 1.5], [0.2, 5.9, -0.2, 1.3], [-0.3, 4.1, 0.95, 1.2]];
  const canopy = mergeGeometries(blobs.map(([x, y, z, r], i) =>
    smoothLumpy(new THREE.IcosahedronGeometry(r, 3), { lump: r * 0.18, freq: 1.1 / r, seed: i * 3.3 })
      .scale(1, 0.88, 1).translate(x, y, z)));
  return mergeGeometries([smoothTrunk(0.2, 0.36, 3.6, 0x7a5332), gradient(canopy, 0x356e2b, 0x86c95f)]);
}

function smoothPineTree() {
  const tiers = [[2.1, 3.4, 3.1], [1.6, 2.9, 4.7], [1.05, 2.3, 6.1]];
  const parts = tiers.map(([r, h, y], i) => {
    const cone = new THREE.ConeGeometry(r, h, 18, 4, true);
    return smoothLumpy(cone, { lump: r * 0.12, freq: 1.4 / r, seed: 10 + i * 2.1, center: new THREE.Vector3(0, -h / 2, 0) })
      .translate(0, y, 0);
  });
  return mergeGeometries([smoothTrunk(0.16, 0.28, 2.6, 0x6b4529), gradient(mergeGeometries(parts), 0x1f5a2e, 0x4f9f58)]);
}

export function buildVegetation(scene, { avoid = [] } = {}) {
  const rand = mulberry32(1234);
  const time = { value: 0 };

  const lowPoly = new URLSearchParams(location.search).get('trees') === 'lowpoly';
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: lowPoly, roughness: 0.9, side: lowPoly ? THREE.FrontSide : THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    // Gentle wind sway that grows with height above the trunk base, phase-shifted per tree.
    shader.uniforms.uTime = time;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        float phase = instanceMatrix[3].x * 0.15 + instanceMatrix[3].z * 0.11;
        float sway = sin(uTime * 1.3 + phase) * 0.05 * max(0.0, position.y - 1.5);
        transformed.x += sway;
        transformed.z += sway * 0.6;
      #endif
    `);
  };

  const okForTree = (x, z) => {
    const h = heightAt(x, z);
    if (h < 1.6 || slopeAt(x, z) > 0.55) return false;
    if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.radius * 0.8) return false;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 3) return false;
    return !avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r);
  };

  // Tree shapes get their own RNG so placements are identical whichever style is shown.
  const shapeRand = mulberry32(99);
  const kinds = lowPoly ? [roundTree(shapeRand), pineTree(shapeRand)] : [smoothRoundTree(), smoothPineTree()];
  const placements = [[], []];
  for (let tries = 0; tries < 6000 && placements[0].length + placements[1].length < 380; tries++) {
    const x = (rand() - 0.5) * 360, z = (rand() - 0.5) * 360;
    if (!okForTree(x, z)) continue;
    const kind = heightAt(x, z) > 7 || rand() < 0.3 ? 1 : 0;   // pines on higher ground
    placements[kind].push({ x, z, s: 0.8 + rand() * 0.6, rot: rand() * Math.PI * 2 });
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  kinds.forEach((geo, k) => {
    const list = placements[k];
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot);
      m.compose(new THREE.Vector3(p.x, heightAt(p.x, p.z) - 0.15, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tint.setHSL(0.27 + rand() * 0.06, 0.4, 0.5 + rand() * 0.15).multiplyScalar(2));
      colliders.push({ x: p.x, z: p.z, r: 0.45 * p.s, top: heightAt(p.x, p.z) + 6 * p.s });
    });
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // Rocks: jittered dodecahedrons, half buried.
  const rockGeo = colored(jitter(new THREE.DodecahedronGeometry(1, 0), 0.35, rand), 0x8a8580);
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  const rocks = [];
  for (let tries = 0; tries < 3000 && rocks.length < 160; tries++) {
    const x = (rand() - 0.5) * 380, z = (rand() - 0.5) * 380;
    const h = heightAt(x, z);
    if (h < 0.3 || avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue;
    const nearVolcano = Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.radius * 1.1;
    if (!nearVolcano && rand() < 0.5) continue;   // rocks cluster around the volcano
    rocks.push({ x, z, h, s: 0.4 + rand() * (nearVolcano ? 2.2 : 1.2) });
  }
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
  rocks.forEach((r, i) => {
    q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    m.compose(new THREE.Vector3(r.x, r.h - r.s * 0.3, r.z), q, new THREE.Vector3(r.s, r.s * 0.7, r.s));
    rockMesh.setMatrixAt(i, m);
    rockMesh.setColorAt(i, tint.setScalar(0.75 + rand() * 0.4));
    if (r.s > 1) colliders.push({ x: r.x, z: r.z, r: r.s * 0.8, top: r.h + r.s * 0.5 });
  });
  rockMesh.castShadow = rockMesh.receiveShadow = true;
  scene.add(rockMesh);

  return { update: (t) => { time.value = t; } };
}
