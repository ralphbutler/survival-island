// Coconut toss: stand on the yellow mat to switch to an over-the-shoulder aiming view; click to throw.
// Coconuts fly on real ballistic arcs, bounce off the booth walls and floor, and a hit tips the target.
import * as THREE from 'three';
import { boxAt, groundAt } from './world.js';
import { sfx } from './audio.js';

const SPEED = 18, GRAVITY = 9.8, R = 0.13, MAX_COCONUTS = 12, MAT_RADIUS = 0.85, SUBSTEPS = 4;
const coconutGeo = new THREE.SphereGeometry(R, 14, 10);
const coconutMat = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.95 });

export class CoconutGame {
  constructor(scene, camera, dom, outpost, { onHit }) {
    Object.assign(this, { scene, camera, outpost, onHit });
    this.active = false;
    this.armed = true;          // must step off the mat before it can trigger again
    this.coconuts = [];
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.aimPos = new THREE.Vector3();
    this.aimLook = new THREE.Vector3();
    this.crosshair = document.getElementById('crosshair');

    dom.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (this.active) Object.assign(this.crosshair.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
    });
    dom.addEventListener('pointerdown', (e) => {
      if (this.active && e.button === 0 && this.ready) this.throw();
    });
  }

  get won() { return this.outpost.target.down; }

  // Called every frame in normal play: should the hero enter aim mode?
  shouldEnter(hero) {
    const d = Math.hypot(hero.pos.x - this.outpost.mat.x, hero.pos.z - this.outpost.mat.z);
    if (d > MAT_RADIUS + 0.6) this.armed = true;
    return this.armed && !this.won && d < MAT_RADIUS && hero.onGround && !hero.flying;
  }

  enter(hero) {
    this.active = true;
    this.armed = false;
    this.hero = hero;
    hero.placeAt(this.outpost.mat.x, this.outpost.mat.z, Math.PI / 2, hero.pos.y);   // face +x, into the booth
    hero.play('Idle');
    // Over the right shoulder, looking at the target.
    this.aimPos.copy(hero.pos).add(new THREE.Vector3(-3.4, 1.85, 1.5));
    this.aimLook.copy(this.outpost.target.center);
    this.crosshair.classList.remove('hidden');
    document.body.classList.add('aiming');
    this.readyAt = performance.now() + 700;   // ignore clicks during the camera swoop
  }

  exit() {
    this.active = false;
    this.hero.placeAt(this.outpost.mat.x - 1.8, this.outpost.mat.z, Math.PI / 2, this.hero.pos.y);   // step back off the mat
    this.crosshair.classList.add('hidden');
    document.body.classList.remove('aiming');
  }

  get ready() { return performance.now() > this.readyAt; }

  throw() {
    if (this.coconuts.length >= MAX_COCONUTS) {
      const old = this.coconuts.shift();
      this.scene.remove(old.mesh);
    }
    const hero = this.hero;
    hero.startEmote('Punch');   // reads as an overarm throw on this robot
    sfx.whoosh();

    // Aim point: where the mouse ray meets the target or booth, else a point 10 m out.
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObject(this.outpost.target.mesh, false);
    const aim = hits.length ? hits[0].point : this.raycaster.ray.at(10, new THREE.Vector3());
    aim.x += (Math.random() - 0.5) * 0.2;   // a little wobble keeps it a game
    aim.y += (Math.random() - 0.5) * 0.2;
    aim.z += (Math.random() - 0.5) * 0.2;

    // Launch from the right hand with the velocity that lands exactly on `aim`.
    const from = hero.pos.clone().add(new THREE.Vector3(0.2, 1.5, 0.35));
    const flat = Math.hypot(aim.x - from.x, aim.z - from.z);
    const t = Math.max(flat / SPEED, 0.05);
    const v = new THREE.Vector3((aim.x - from.x) / t, (aim.y - from.y + 0.5 * GRAVITY * t * t) / t, (aim.z - from.z) / t);

    const mesh = new THREE.Mesh(coconutGeo, coconutMat);
    mesh.castShadow = true;
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.coconuts.push({ mesh, v, life: 5, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0) });
  }

  update(dt) {
    this.outpost.target.update(dt);
    if (this.active && this.hero.emote === null && this.hero.current !== 'Idle') this.hero.play('Idle');

    for (let i = this.coconuts.length - 1; i >= 0; i--) {
      const c = this.coconuts[i];
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      for (let k = 0; k < SUBSTEPS; k++) this.step(c, dt / SUBSTEPS);

      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.coconuts.splice(i, 1);
      }
    }
  }

  // One physics sub-step (several per frame so a fast coconut can't skip through the thin target).
  step(c, h) {
    const target = this.outpost.target, p = c.mesh.position;
    c.v.y -= GRAVITY * h;
    p.addScaledVector(c.v, h);

    if (!target.down && p.distanceTo(target.center) < target.radius + R && Math.abs(p.x - target.center.x) < 0.2) {
      target.down = true;
      sfx.thunk();
      c.v.multiplyScalar(-0.3);
      this.onHit();
    }

    const b = boxAt(p.x, p.y, p.z);
    if (b) {   // push out through the nearest face and bounce
      const pen = [[p.x - b.minX, 'x', b.minX - R], [b.maxX - p.x, 'x', b.maxX + R], [p.z - b.minZ, 'z', b.minZ - R],
        [b.maxZ - p.z, 'z', b.maxZ + R], [p.y - b.bottom, 'y', b.bottom - R], [b.top - p.y, 'y', b.top + R]];
      const [, axis, to] = pen.reduce((a, q) => (q[0] < a[0] ? q : a));
      p[axis] = to;
      c.v[axis] *= -0.35;
      if (c.v.length() > 2) sfx.bonk();
    }

    const g = groundAt(p.x, p.z, p.y) + R;
    if (p.y < g) {
      p.y = g;
      if (Math.abs(c.v.y) > 2) sfx.bonk();
      c.v.y *= -0.35;
      c.v.x *= 0.7;
      c.v.z *= 0.7;
    }
  }
}
