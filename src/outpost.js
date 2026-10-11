// The puzzle area: Site B bunker (sliding door, lit interior, matches on a desk), the carnival
// booth (target on a hinge, prize stand, yellow mat out front) and the unlit campfire.
// Everything is axis-aligned so walls can be simple box colliders.
import * as THREE from 'three';
import { heightAt, OUTPOST } from './terrain.js';
import { boxes, platforms, colliders } from './world.js';
import * as tex from './textures.js';

const std = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...opts });

export function buildOutpost(scene) {
  const C = { x: OUTPOST.x, z: OUTPOST.z };
  const y0 = heightAt(C.x, C.z);
  const group = new THREE.Group();
  scene.add(group);

  // A wall: visual box + collider. Coordinates are world x/z, heights relative to the clearing.
  function wall(minX, maxX, minZ, maxZ, bottom, top, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, top - bottom, maxZ - minZ), material);
    mesh.position.set((minX + maxX) / 2, y0 + (bottom + top) / 2, (minZ + maxZ) / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    const box = { minX, maxX, minZ, maxZ, bottom: y0 + bottom, top: y0 + top, enabled: true };
    if (collide) boxes.push(box);
    return { mesh, box };
  }

  // ---------- Site B bunker ----------
  const B = { x: C.x, z: C.z - 12 }, BW = 8, BD = 6, BH = 3.6, T = 0.3, DOOR_W = 1.8, DOOR_H = 2.6;
  const bx0 = B.x - BW / 2, bx1 = B.x + BW / 2, bz0 = B.z - BD / 2, bz1 = B.z + BD / 2;
  const concrete = std({ map: tex.concrete([2, 1]), roughness: 0.95 });
  wall(bx0, bx1, bz0, bz0 + T, 0, BH, concrete);                              // back
  wall(bx0, bx0 + T, bz0, bz1, 0, BH, concrete);                              // left
  wall(bx1 - T, bx1, bz0, bz1, 0, BH, concrete);                              // right
  wall(bx0, B.x - DOOR_W / 2, bz1 - T, bz1, 0, BH, concrete);                 // front, left of door
  wall(B.x + DOOR_W / 2, bx1, bz1 - T, bz1, 0, BH, concrete);                 // front, right of door
  wall(B.x - DOOR_W / 2, B.x + DOOR_W / 2, bz1 - T, bz1, DOOR_H, BH, concrete);   // lintel
  wall(bx0 - 0.25, bx1 + 0.25, bz0 - 0.25, bz1 + 0.25, BH, BH + 0.3, std({ color: 0x6f6c66 }));   // roof
  platforms.push({ x: B.x, z: B.z, hw: BW / 2 + 0.25, hd: BD / 2 + 0.25, yaw: 0, top: y0 + BH + 0.3 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(BW - 2 * T, BD - 2 * T).rotateX(-Math.PI / 2), std({ color: 0x5d5a55 }));
  floor.position.set(B.x, y0 + 0.02, B.z);
  floor.receiveShadow = true;
  group.add(floor);

  // Sign, door frame, satellite dish.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshStandardMaterial({ map: tex.siteSign(), transparent: true, roughness: 1 }));
  sign.position.set(B.x - 2.5, y0 + 2.2, bz1 + 0.01);
  group.add(sign);
  const steel = std({ color: 0x3d4248, metalness: 0.6, roughness: 0.45 });
  for (const [w, h, x, y] of [[0.15, DOOR_H, B.x - DOOR_W / 2 - 0.07, DOOR_H / 2], [0.15, DOOR_H, B.x + DOOR_W / 2 + 0.07, DOOR_H / 2], [DOOR_W + 0.3, 0.15, B.x, DOOR_H + 0.07]]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), steel);
    trim.position.set(x, y0 + y, bz1 + 0.04);
    group.add(trim);
  }
  const dish = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), steel);
  pole.position.y = 0.6;
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 10, 0, Math.PI * 2, 0, 0.55), std({ color: 0xd9d6cf, side: THREE.DoubleSide, roughness: 0.6 }));
  bowl.rotation.x = -2.2;
  bowl.position.y = 1.3;
  dish.add(pole, bowl);
  dish.position.set(B.x + 2.3, y0 + BH + 0.3, B.z - 1);
  dish.rotation.y = 0.6;
  dish.traverse((o) => { o.castShadow = true; });
  group.add(dish);

  // Sliding door (slides sideways into the right-hand wall).
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.12), steel);
  const doorClosedX = B.x;
  doorMesh.position.set(doorClosedX, y0 + DOOR_H / 2, bz1 - T / 2);
  doorMesh.castShadow = true;
  group.add(doorMesh);
  const doorBox = { minX: B.x - DOOR_W / 2, maxX: B.x + DOOR_W / 2, minZ: bz1 - T, maxZ: bz1, bottom: y0, top: y0 + DOOR_H, enabled: true };
  boxes.push(doorBox);
  const door = {
    front: new THREE.Vector3(B.x, y0, bz1 + 1.2),
    labelAnchor: new THREE.Vector3(B.x, y0 + DOOR_H + 0.5, bz1 + 0.3),
    progress: 0,
    opening: false,
    open() { this.opening = true; doorBox.enabled = false; },
    update(dt) {
      if (!this.opening || this.progress >= 1) return;
      this.progress = Math.min(1, this.progress + dt);
      const e = this.progress * this.progress * (3 - 2 * this.progress);
      doorMesh.position.x = doorClosedX + e * (DOOR_W + 0.05);
    },
  };

  // Interior: hanging lamp, glowing window, desk with the matches.
  const lampLight = new THREE.PointLight(0xffd9a0, 25, 10, 2);
  lampLight.position.set(B.x, y0 + BH - 0.6, B.z);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 16, 1, true), std({ color: 0xe8e4c9, side: THREE.DoubleSide }));
  shade.position.copy(lampLight.position).add(new THREE.Vector3(0, 0.15, 0));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  bulb.position.copy(lampLight.position);
  const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshBasicMaterial({ color: 0xbfe3ff }));
  windowPane.position.set(B.x + 1.5, y0 + 2.0, bz0 + T + 0.01);
  group.add(lampLight, shade, bulb, windowPane);

  const wood = std({ map: tex.planks([1, 1]) });
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), wood);
  const desk = new THREE.Group();
  deskTop.position.y = 0.78;
  desk.add(deskTop);
  for (const [lx, lz] of [[-0.7, -0.32], [0.7, -0.32], [-0.7, 0.32], [0.7, 0.32]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.78, 0.07), wood);
    leg.position.set(lx, 0.39, lz);
    desk.add(leg);
  }
  desk.position.set(B.x - 2, y0, B.z - 1.9);
  desk.traverse((o) => { o.castShadow = o.receiveShadow = true; });
  group.add(desk);
  colliders.push({ x: desk.position.x, z: desk.position.z, r: 0.75, top: y0 + 0.82 });

  const label = new THREE.MeshStandardMaterial({ map: tex.matchesLabel(), roughness: 0.8 });
  const blue = std({ color: 0x1f4fa8 });
  const matches = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.26), [blue, blue, label, blue, label, blue]);
  matches.position.set(desk.position.x, y0 + 0.89, desk.position.z + 0.1);
  matches.rotation.y = 0.2;
  matches.castShadow = true;
  group.add(matches);

  // ---------- carnival booth (open toward -x, throw toward +x) ----------
  const K = { x: C.x + 14, z: C.z }, KL = 6, KW = 3.4, KH = 2.8;
  const kx0 = K.x - KL / 2, kx1 = K.x + KL / 2, kz0 = K.z - KW / 2, kz1 = K.z + KW / 2;
  const boothWood = std({ map: tex.planks([2, 1], [140, 95, 58]) });
  wall(kx1 - 0.15, kx1, kz0, kz1, 0, KH, boothWood);              // back
  wall(kx0, kx1, kz0, kz0 + 0.15, 0, KH, boothWood);              // side
  wall(kx0, kx1, kz1 - 0.15, kz1, 0, KH, boothWood);              // side
  wall(kx0 - 0.1, kx1 + 0.1, kz0 - 0.1, kz1 + 0.1, KH, KH + 0.15, boothWood);   // roof
  platforms.push({ x: K.x, z: K.z, hw: KL / 2 + 0.1, hd: KW / 2 + 0.1, yaw: 0, top: y0 + KH + 0.15 });
  const boothFloor = new THREE.Mesh(new THREE.BoxGeometry(KL - 0.3, 0.05, KW - 0.3), std({ map: tex.planks([2, 1], [110, 75, 45]) }));
  boothFloor.position.set(K.x, y0 + 0.025, K.z);
  boothFloor.receiveShadow = true;
  group.add(boothFloor);

  const awning = new THREE.Mesh(new THREE.PlaneGeometry(1.4, KW + 0.4), std({ map: tex.stripes(), side: THREE.DoubleSide, roughness: 0.8 }));
  awning.rotation.set(-Math.PI / 2, 0, 0);
  awning.rotateY(-0.45);   // slope down and outward
  awning.position.set(kx0 - 0.6, y0 + KH - 0.25, K.z);
  awning.castShadow = true;
  group.add(awning);

  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), std({ map: tex.chevrons() }));
  stand.position.set(K.x + 1.9, y0 + 0.35, K.z);
  stand.castShadow = stand.receiveShadow = true;
  group.add(stand);

  // Target: a bullseye on a hinge at its base, so a hit tips it over backwards.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.15, 8), steel);
  post.position.set(kx1 - 0.35, y0 + 0.575, K.z);
  const hinge = new THREE.Group();
  hinge.position.set(kx1 - 0.35, y0 + 1.15, K.z);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), std({ map: tex.bullseye(), side: THREE.DoubleSide, roughness: 0.7 }));
  disc.rotation.y = -Math.PI / 2;   // face the thrower (-x)
  disc.position.y = 0.45;
  disc.castShadow = true;
  hinge.add(disc);
  group.add(post, hinge);
  const target = {
    center: new THREE.Vector3(kx1 - 0.35, y0 + 1.6, K.z),
    radius: 0.45,
    mesh: disc,
    down: false,
    fall: 0,
    update(dt) {
      if (!this.down || this.fall >= 1) return;
      this.fall = Math.min(1, this.fall + dt * 2.5);
      hinge.rotation.z = -(Math.PI / 2) * 0.92 * (1 - Math.pow(1 - this.fall, 3));
    },
  };

  const matMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), std({ map: tex.boltMat() }));
  matMesh.position.set(kx0 - 1.6, y0 + 0.02, K.z);
  matMesh.receiveShadow = true;
  group.add(matMesh);

  // ---------- campfire (unlit) ----------
  const F = { x: C.x - 4, z: C.z + 7 };
  const stoneMat = std({ color: 0x8a8580, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), stoneMat);
    s.position.set(F.x + Math.cos(a) * 1.0, y0 + 0.15, F.z + Math.sin(a) * 1.0);
    s.rotation.set(a, a * 2, 0);
    s.castShadow = s.receiveShadow = true;
    group.add(s);
  }
  const logMat = std({ color: 0x5b4636, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.0, 7), logMat);
    log.position.set(F.x + Math.cos(a) * 0.35, y0 + 0.85, F.z + Math.sin(a) * 0.35);
    log.lookAt(F.x, y0 + 2.4, F.z);
    log.rotateX(Math.PI / 2);
    log.castShadow = true;
    group.add(log);
  }
  colliders.push({ x: F.x, z: F.z, r: 1.1, top: y0 + 1.6 });

  return {
    center: new THREE.Vector3(C.x, y0, C.z),
    y0,
    door,
    target,
    matches,
    lampLight,
    standTop: new THREE.Vector3(stand.position.x, y0 + 1.15, K.z),
    mat: new THREE.Vector3(matMesh.position.x, y0, K.z),
    booth: { minX: kx0, maxX: kx1, minZ: kz0, maxZ: kz1 },
    campfire: new THREE.Vector3(F.x, y0, F.z),
    npcs: {
      Rory: new THREE.Vector3(C.x - 10, y0, C.z - 2),
      Raleigh: new THREE.Vector3(C.x + 7, y0, C.z + 10),
    },
    cellSpots: [
      new THREE.Vector3(bx1 + 1.5, y0, B.z),         // beside the bunker
      new THREE.Vector3(B.x - 1, y0, bz0 - 1.6),     // behind the bunker
      new THREE.Vector3(C.x + 9.5, y0, C.z - 5),     // in the gap between bunker and booth
    ],
  };
}
