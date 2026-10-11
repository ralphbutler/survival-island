// Trees and rocks drawn with instancing (one draw call per kind/part). Palms (Quaternius CC0) on the
// coast and low ground, code-built pines inland (smooth; ?trees=lowpoly for the faceted originals).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { heightAt, slopeAt, VOLCANO, POND } from './terrain.js';
import { colliders, mulberry32 } from './world.js';
import { loadGLTF } from './characters.js';

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

function smoothPineTree() {
  const tiers = [[2.1, 3.4, 3.1], [1.6, 2.9, 4.7], [1.05, 2.3, 6.1]];
  const parts = tiers.map(([r, h, y], i) => {
    const cone = new THREE.ConeGeometry(r, h, 18, 4, true);
    return smoothLumpy(cone, { lump: r * 0.12, freq: 1.4 / r, seed: 10 + i * 2.1, center: new THREE.Vector3(0, -h / 2, 0) })
      .translate(0, y, 0);
  });
  return mergeGeometries([smoothTrunk(0.16, 0.28, 2.6, 0x6b4529), gradient(mergeGeometries(parts), 0x1f5a2e, 0x4f9f58)]);
}

// Gentle wind sway that grows with height above the trunk base, phase-shifted per tree.
function addSway(material, time) {
  material.onBeforeCompile = (shader) => {
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
  return material;
}

// Turn a loaded model into one InstancedMesh per part (palm trunk, fronds, coconuts...),
// normalised so it stands on its base at `height` metres.
export function instanceModel(scene, model, list, height, time) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const k = height / (box.max.y - box.min.y);
  const base = new THREE.Matrix4().makeScale(k, k, k)
    .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  model.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(base, o.matrixWorld));
    const mesh = new THREE.InstancedMesh(geo, addSway(o.material.clone(), time), list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot);
      m.compose(new THREE.Vector3(p.x, heightAt(p.x, p.z) - 0.1, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  });
}

export async function buildVegetation(scene, { avoid = [] } = {}) {
  const rand = mulberry32(1234);
  const time = { value: 0 };
  const lowPoly = new URLSearchParams(location.search).get('trees') === 'lowpoly';

  const okForTree = (x, z) => {
    const h = heightAt(x, z);
    if (h < 1.6 || slopeAt(x, z) > 0.55) return false;
    if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.radius * 0.8) return false;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 3) return false;
    return !avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r);
  };

  // Island zones: palms on low ground and near the coast, pines inland and uphill.
  const pines = [], palms = [];
  for (let tries = 0; tries < 6000 && pines.length + palms.length < 380; tries++) {
    const x = (rand() - 0.5) * 360, z = (rand() - 0.5) * 360;
    if (!okForTree(x, z)) continue;
    const coastal = heightAt(x, z) < 4.5 || Math.hypot(x, z) > 118;
    (coastal ? palms : pines).push({ x, z, s: 0.8 + rand() * 0.6, rot: rand() * Math.PI * 2 });
  }

  // Pines: built in code (smooth by default, ?trees=lowpoly for the faceted originals).
  const pineMat = addSway(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: lowPoly, roughness: 0.9, side: lowPoly ? THREE.FrontSide : THREE.DoubleSide }), time);
  const pineGeo = lowPoly ? pineTree(mulberry32(99)) : smoothPineTree();
  const pineMesh = new THREE.InstancedMesh(pineGeo, pineMat, pines.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  pines.forEach((p, i) => {
    q.setFromAxisAngle(up, p.rot);
    m.compose(new THREE.Vector3(p.x, heightAt(p.x, p.z) - 0.15, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    pineMesh.setMatrixAt(i, m);
    pineMesh.setColorAt(i, tint.setHSL(0.27 + rand() * 0.06, 0.4, 0.5 + rand() * 0.15).multiplyScalar(2));
    colliders.push({ x: p.x, z: p.z, r: 0.4 * p.s, top: heightAt(p.x, p.z) + 6 * p.s });
  });
  pineMesh.castShadow = pineMesh.receiveShadow = true;
  scene.add(pineMesh);

  // Palms: Quaternius CC0 models, half with coconuts and half without.
  const [nutty, bare] = await Promise.all([
    loadGLTF('assets/converted/crops/PalmTree_4.glb'),
    loadGLTF('assets/converted/crops/PalmTree_Harvested.glb'),
  ]);
  instanceModel(scene, nutty.scene, palms.filter((_, i) => i % 2 === 0), 7, time);
  instanceModel(scene, bare.scene, palms.filter((_, i) => i % 2 === 1), 7, time);
  for (const p of palms) colliders.push({ x: p.x, z: p.z, r: 0.35 * p.s, top: heightAt(p.x, p.z) + 7 * p.s });

  // A few fallen coconuts under some of the coconut palms.
  const nuts = [];
  palms.filter((_, i) => i % 2 === 0 && rand() < 0.4).forEach((p) => {
    for (let n = 1 + Math.floor(rand() * 3); n > 0; n--) {
      const a = rand() * Math.PI * 2, r = 0.8 + rand() * 1.4;
      nuts.push([p.x + Math.cos(a) * r, p.z + Math.sin(a) * r]);
    }
  });
  const nutMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.95 }), nuts.length);
  nuts.forEach(([x, z], i) => { m.makeTranslation(x, heightAt(x, z) + 0.1, z); nutMesh.setMatrixAt(i, m); });
  nutMesh.castShadow = true;
  scene.add(nutMesh);

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
