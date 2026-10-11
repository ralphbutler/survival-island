// Third-person orbit camera. Left-drag orbits; right-drag orbits and tells the hero to face
// the camera direction (as in the original); wheel zooms. Never dips under terrain or sea.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class FollowCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.32;
    this.dist = 9;
    this.target = new THREE.Vector3();
    this.rightDrag = false;
    this.dragging = false;
    this.snapNext = true;

    dom.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.rightDrag = e.button === 2;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw -= e.movementX * 0.005;
      this.pitch = clamp(this.pitch + e.movementY * 0.004, -0.15, 1.35);
    });
    const release = () => { this.dragging = false; this.rightDrag = false; };
    dom.addEventListener('pointerup', release);
    dom.addEventListener('pointercancel', release);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist = clamp(this.dist * Math.exp(e.deltaY * 0.001), 3, 70);
    }, { passive: false });
  }

  // Place the camera directly behind something facing `heading`.
  behind(heading) {
    this.yaw = heading + Math.PI;
    this.snapNext = true;
  }

  update(dt, heroPos) {
    const desired = new THREE.Vector3(heroPos.x, heroPos.y + 1.4, heroPos.z);
    if (this.snapNext) { this.target.copy(desired); this.snapNext = false; }
    else this.target.lerp(desired, 1 - Math.exp(-dt * 12));

    const cp = Math.cos(this.pitch);
    const p = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp)
      .multiplyScalar(this.dist).add(this.target);
    p.y = Math.max(p.y, Math.max(heightAt(p.x, p.z), 0) + 0.6);
    this.camera.position.copy(p);
    this.camera.lookAt(this.target);
  }
}
