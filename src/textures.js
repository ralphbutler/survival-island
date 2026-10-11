// Textures painted on canvases at load time -- no image files.
import * as THREE from 'three';
import { mulberry32 } from './world.js';

function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  return tex;
}

export function concrete(repeat = [2, 1]) {
  const rand = mulberry32(7);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#8f8b84';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {   // speckle
      const v = 110 + rand() * 60;
      g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`;
      g.fillRect(rand() * w, rand() * h, 2, 2);
    }
    for (let i = 0; i < 10; i++) {     // water stains running down
      const x = rand() * w;
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(60,50,40,0.25)');
      grad.addColorStop(1, 'rgba(60,50,40,0)');
      g.fillStyle = grad;
      g.fillRect(x, 0, 6 + rand() * 18, h * (0.3 + rand() * 0.6));
    }
  }, { repeat });
}

export function planks(repeat = [1, 1], base = [122, 82, 50]) {
  const rand = mulberry32(11);
  return canvasTexture(256, 256, (g, w, h) => {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const k = 0.85 + rand() * 0.3;
      g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
      g.fillRect(0, (i * h) / n, w, h / n);
      g.strokeStyle = 'rgba(40,25,15,0.25)';   // grain
      for (let j = 0; j < 7; j++) {
        const y = (i * h) / n + rand() * (h / n);
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + rand() * 4 - 2, w * 0.7, y + rand() * 4 - 2, w, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(30,18,10,0.6)';      // gap between planks
      g.fillRect(0, ((i + 1) * h) / n - 2, w, 2);
    }
  }, { repeat });
}

export function stripes() {
  return canvasTexture(256, 64, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#f4efe6' : '#d23a2c';
      g.fillRect((i * w) / 8, 0, w / 8, h);
    }
  });
}

export function bullseye() {
  return canvasTexture(256, 256, (g, w, h) => {
    const rings = ['#f4efe6', '#1d1d1d', '#2d6bd6', '#d23a2c', '#f2c531'];
    rings.forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(w / 2, h / 2, (w / 2) * (1 - i / rings.length), 0, Math.PI * 2);
      g.fill();
    });
  });
}

export function chevrons() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#f4efe6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d23a2c';
    for (let i = -1; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, i * 40);
      g.lineTo(w / 2, i * 40 + 30);
      g.lineTo(w, i * 40);
      g.lineTo(w, i * 40 + 18);
      g.lineTo(w / 2, i * 40 + 48);
      g.lineTo(0, i * 40 + 18);
      g.fill();
    }
  });
}

export function siteSign() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = 'bold 64px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(235,228,214,0.9)';
    g.fillText('SITE', w / 2, 70);
    g.fillStyle = '#b8261d';
    g.beginPath();
    g.arc(w / 2, 160, 70, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(235,228,214,0.9)';
    g.stroke();
    g.fillStyle = 'rgba(235,228,214,0.95)';
    g.font = 'bold 96px Impact, "Arial Black", sans-serif';
    g.fillText('B', w / 2, 194);
  });
}

export function matchesLabel() {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#1f4fa8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2c531';
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#ffffff';
    g.font = 'bold 50px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillText('MATCHES', w / 2, 82);
  });
}

export function boltMat() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#f2c531';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3a3a3a';
    g.lineWidth = 10;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#3a3a3a';
    g.beginPath();
    g.moveTo(150, 30); g.lineTo(70, 140); g.lineTo(125, 140); g.lineTo(100, 226); g.lineTo(190, 110); g.lineTo(135, 110);
    g.closePath();
    g.fill();
  });
}
