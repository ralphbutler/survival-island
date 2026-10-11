// Hand-placed props. Phase 1: the wooden starting deck.
import * as THREE from 'three';
import { heightAt, slopeAt, VOLCANO, OUTPOST } from './terrain.js';
import { platforms } from './world.js';

// Pick a gentle grassy spot on a ring around the island centre with a clear view of the volcano.
export function findSpawn() {
  let best = null;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 90) {
    for (const r of [70, 85, 100, 115]) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = heightAt(x, z), dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
      if (h < 2.5 || h > 9 || dv < 110) continue;
      if (Math.hypot(x - OUTPOST.x, z - OUTPOST.z) < OUTPOST.r + 8) continue;   // its flattened clearing would always win
      const score = -slopeAt(x, z) * 10 - Math.abs(dv - 140) * 0.05;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  return best;
}

export function buildDeck(scene, x, z, yaw) {
  const group = new THREE.Group();
  const W = 6, D = 6, PLANKS = 5;
  // Deck sits just above the highest ground under it.
  let maxG = -Infinity;
  for (const [ox, oz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], [0, 0]]) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    maxG = Math.max(maxG, heightAt(x + ox * c + oz * s, z - ox * s + oz * c));
  }
  const top = maxG + 0.9;

  const woods = [0x9b6b43, 0x8a5d38, 0xa87850, 0x93653f, 0x7f5533];
  for (let i = 0; i < PLANKS; i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(W / PLANKS - 0.06, 0.2, D),
      new THREE.MeshStandardMaterial({ color: woods[i % woods.length], roughness: 0.85, flatShading: true }),
    );
    plank.position.set(-W / 2 + (i + 0.5) * (W / PLANKS), top - 0.1, 0);
    plank.castShadow = plank.receiveShadow = true;
    group.add(plank);
  }
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6b4529, roughness: 0.9, flatShading: true });
  for (const [px, pz] of [[-W / 2 + 0.3, -D / 2 + 0.3], [W / 2 - 0.3, -D / 2 + 0.3], [-W / 2 + 0.3, D / 2 - 0.3], [W / 2 - 0.3, D / 2 - 0.3]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, top - maxG + 3, 6), postMat);
    post.position.set(px, top - 0.2 - (top - maxG + 3) / 2, pz);
    post.castShadow = true;
    group.add(post);
  }
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  scene.add(group);
  platforms.push({ x, z, hw: W / 2, hd: D / 2, yaw, top });
  return top;
}
