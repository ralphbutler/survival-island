// The farm (scenery, not part of the puzzle): Quaternius CC0 barn, coop, fence, corn and donkeys,
// a farmer and son working the corn, and chickens built and animated entirely in code.
import * as THREE from 'three';
import { heightAt, FARM } from './terrain.js';
import { boxes, colliders, mulberry32 } from './world.js';
import { loadGLTF, makeCharacter } from './characters.js';
import { instanceModel } from './vegetation.js';
import { Wanderer, rectBounds, circleBounds } from './wander.js';

const URL = {
  barn: 'assets/converted/farm/Barn.glb',
  coop: 'assets/converted/farm/ChickenCoop.glb',
  fence: 'assets/converted/farm/Fence.glb',
  corn4: 'assets/converted/crops/Corn_4.glb',
  corn3: 'assets/converted/crops/Corn_3.glb',
  donkey: 'assets/animals/Donkey.gltf',
  farmer: 'assets/converted/people/Man_ClothedDarkSkin2.glb',
  son: 'assets/converted/people/Man_ClothedLightSkin2.glb',
};

// Place a static model with its base on the ground; add a wall box around it.
function placeStatic(scene, gltf, x, z, rotY = 0, collide = true) {
  const obj = gltf.scene.clone();
  obj.rotation.y = rotY;
  obj.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  obj.position.set(x - (b.min.x + b.max.x) / 2, heightAt(x, z) - b.min.y, z - (b.min.z + b.max.z) / 2);
  scene.add(obj);
  obj.updateMatrixWorld(true);
  const wb = new THREE.Box3().setFromObject(obj);
  if (collide) boxes.push({ minX: wb.min.x, maxX: wb.max.x, minZ: wb.min.z, maxZ: wb.max.z, bottom: wb.min.y, top: wb.max.y, enabled: true });
  return { obj, box: wb };
}

// ---------- chickens: a few primitives + code animation (no rig, no clips) ----------
const chickenParts = (() => {
  const white = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.9 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd2302a, roughness: 0.8 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xf0a030, roughness: 0.7 });
  const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  return { white, red, orange, black };
})();

function makeChicken(scene, tint) {
  const { white, red, orange, black } = chickenParts;
  const root = new THREE.Group();
  const bodyMat = tint ? white.clone() : white;
  if (tint) bodyMat.color.set(tint);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), bodyMat);
  body.scale.set(0.9, 0.85, 1.25);
  body.position.y = 0.26;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), bodyMat);
  tail.position.set(0, 0.36, -0.18);
  tail.rotation.x = -0.9;
  const neck = new THREE.Group();   // pivot for pecking
  neck.position.set(0, 0.34, 0.13);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), bodyMat);
  head.position.set(0, 0.08, 0.04);
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.08), red);
  comb.position.set(0, 0.15, 0.04);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 6), orange);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.07, 0.12);
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), black);
    e.position.set(0.055 * s, 0.1, 0.08);
    return e;
  });
  neck.add(head, comb, beak, ...eyes);
  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5).translate(0, -0.08, 0), orange);
    leg.position.set(0.06 * s, 0.17, 0.02);
    return leg;
  });
  root.add(body, tail, neck, ...legs);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(root);
  return { root, neck, legs, body, phase: Math.random() * 10, peck: 0 };
}

// Walking: quick leg swing and a bob. Standing: every so often, peck at the ground.
function animateChicken(c, walking, dt) {
  c.phase += dt * (walking ? 14 : 1);
  if (walking) {
    c.legs[0].rotation.x = Math.sin(c.phase) * 0.6;
    c.legs[1].rotation.x = -Math.sin(c.phase) * 0.6;
    c.body.position.y = 0.26 + Math.abs(Math.sin(c.phase)) * 0.02;
    c.neck.rotation.x = Math.sin(c.phase * 2) * 0.15;
    c.peck = 0;
  } else {
    c.legs[0].rotation.x = c.legs[1].rotation.x = 0;
    if (c.peck <= 0 && Math.random() < dt * 0.8) c.peck = 1;   // start a peck now and then
    if (c.peck > 0) {
      c.peck = Math.max(0, c.peck - dt * 2.2);
      c.neck.rotation.x = Math.sin((1 - c.peck) * Math.PI) * 1.2;
    } else c.neck.rotation.x *= 0.9;
  }
}

export async function buildFarm(scene) {
  const rand = mulberry32(42);
  const F = { x: FARM.x, z: FARM.z };
  const g = Object.fromEntries(await Promise.all(Object.entries(URL).map(async ([k, u]) => [k, await loadGLTF(u)])));

  placeStatic(scene, g.barn, F.x - 12, F.z - 9, 0);
  const coop = placeStatic(scene, g.coop, F.x + 9, F.z - 12, 0);

  // Donkey pen: fence segments tiled round a rectangle, with thin wall boxes on each side.
  const P = { x: F.x + 8, z: F.z + 6, w: 12, d: 10 };
  const fenceBox = new THREE.Box3().setFromObject(g.fence.scene);
  const segLen = fenceBox.max.x - fenceBox.min.x;
  const fenceTop = heightAt(P.x, P.z) + (fenceBox.max.y - fenceBox.min.y);
  const sides = [
    { x0: P.x - P.w / 2, z0: P.z - P.d / 2, dx: 1, dz: 0, len: P.w },   // north
    { x0: P.x - P.w / 2, z0: P.z + P.d / 2, dx: 1, dz: 0, len: P.w },   // south
    { x0: P.x - P.w / 2, z0: P.z - P.d / 2, dx: 0, dz: 1, len: P.d },   // west
    { x0: P.x + P.w / 2, z0: P.z - P.d / 2, dx: 0, dz: 1, len: P.d },   // east
  ];
  for (const s of sides) {
    const n = Math.round(s.len / segLen), step = s.len / n;
    for (let i = 0; i < n; i++) {
      const cx = s.x0 + s.dx * (i + 0.5) * step, cz = s.z0 + s.dz * (i + 0.5) * step;
      const seg = g.fence.scene.clone();
      seg.scale.set(step / segLen, 1, 1);
      seg.rotation.y = s.dz ? Math.PI / 2 : 0;
      seg.position.set(cx, heightAt(cx, cz) - fenceBox.min.y, cz);
      seg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(seg);
    }
    const t = 0.15;
    boxes.push({
      minX: Math.min(s.x0, s.x0 + s.dx * s.len) - t, maxX: Math.max(s.x0, s.x0 + s.dx * s.len) + t,
      minZ: Math.min(s.z0, s.z0 + s.dz * s.len) - t, maxZ: Math.max(s.z0, s.z0 + s.dz * s.len) + t,
      bottom: heightAt(P.x, P.z), top: fenceTop, enabled: true,
    });
  }

  // Cornfield: jittered rows, mostly full-grown with some shorter plants mixed in.
  const C = { x: F.x - 11, z: F.z + 9, w: 12, d: 10 };
  const tall = [], short = [];
  for (let z = C.z - C.d / 2; z <= C.z + C.d / 2; z += 1.3) {
    for (let x = C.x - C.w / 2; x <= C.x + C.w / 2; x += 0.9) {
      const p = { x: x + (rand() - 0.5) * 0.3, z: z + (rand() - 0.5) * 0.3, s: 0.85 + rand() * 0.3, rot: rand() * Math.PI * 2 };
      (rand() < 0.8 ? tall : short).push(p);
    }
  }
  const time = { value: 0 };
  instanceModel(scene, g.corn4.scene, tall, 2.0, time);
  instanceModel(scene, g.corn3.scene, short, 1.3, time);

  // Farmer and son at the edge of the corn, working.
  const people = [
    { gltf: g.farmer, height: 1.8, x: C.x + C.w / 2 + 1.2, z: C.z - 1, face: -Math.PI / 2 },
    { gltf: g.son, height: 1.3, x: C.x + C.w / 2 + 1.0, z: C.z + 1.2, face: -Math.PI / 2 - 0.5 },
  ].map((p) => {
    const ch = makeCharacter(p.gltf, scene, { height: p.height, firstClip: 'Working' });
    ch.root.position.set(p.x, heightAt(p.x, p.z), p.z);
    ch.root.rotation.y = p.face;
    ch.mixer.update(rand() * 2);   // out of step with each other
    colliders.push({ x: p.x, z: p.z, r: 0.4, top: heightAt(p.x, p.z) + p.height });
    return ch;
  });

  // Donkeys: a mother and two foals that trail her around the pen.
  const pen = rectBounds(P.x - P.w / 2 + 1.2, P.x + P.w / 2 - 1.2, P.z - P.d / 2 + 1.2, P.z + P.d / 2 - 1.2);
  const idles = ['Idle', 'Idle_2', 'Idle_Headlow', 'Eating'];
  const mom = makeCharacter(g.donkey, scene, { height: 1.4 });
  const animals = [new Wanderer(mom, { bounds: pen, speed: 0.8, idles, radius: 0.9, rand })];
  for (let i = 0; i < 2; i++) {
    const foal = makeCharacter(g.donkey, scene, { height: 0.85 });
    animals.push(new Wanderer(foal, { bounds: pen, speed: 1.0, idles, radius: 0.5, leader: animals[0], followDist: 1.8, idleTime: [1, 4], rand }));
  }

  // Chickens scratching about in front of the coop.
  const yard = circleBounds(F.x + 9, (coop.box.max.z) + 3.5, 3.5);
  const chickens = [null, null, 0xc8834a, null, 0x8a5a3a, null].map((tint) =>
    new Wanderer(makeChicken(scene, tint), { bounds: yard, speed: 0.6, radius: 0.25, idleTime: [1, 5], animate: animateChicken, rand }));

  return {
    update(dt, t) {
      time.value = t;
      for (const p of people) p.mixer.update(dt);
      for (const a of animals) { a.char.mixer.update(dt); a.update(dt, animals); }
      for (const c of chickens) c.update(dt, chickens);
    },
  };
}
