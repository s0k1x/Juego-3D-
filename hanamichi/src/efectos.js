// Efectos 3D baratos: trazadoras, chispas, fogonazos y explosiones.
// Todo usa reservas fijas y una sola malla por tipo (sin crear objetos durante la partida).
import * as THREE from 'three';
import { COLORES, rampa } from './render.js';

const MAX_TRAZOS = 48, MAX_CHISPAS = 160;

export class Efectos {
  constructor(escena) {
    // Trazadoras: un único LineSegments.
    const g = new THREE.BufferGeometry();
    this.posT = new Float32Array(MAX_TRAZOS * 6);
    this.colT = new Float32Array(MAX_TRAZOS * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.posT, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.colT, 3).setUsage(THREE.DynamicDrawUsage));
    this.trazos = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.trazos.frustumCulled = false;
    escena.add(this.trazos);
    this.datosT = Array.from({ length: MAX_TRAZOS }, () => ({ vida: 0, a: new THREE.Vector3(), b: new THREE.Vector3(), color: new THREE.Color() }));

    // Chispas: Points.
    const gp = new THREE.BufferGeometry();
    this.posC = new Float32Array(MAX_CHISPAS * 3);
    this.colC = new Float32Array(MAX_CHISPAS * 3);
    gp.setAttribute('position', new THREE.BufferAttribute(this.posC, 3).setUsage(THREE.DynamicDrawUsage));
    gp.setAttribute('color', new THREE.BufferAttribute(this.colC, 3).setUsage(THREE.DynamicDrawUsage));
    this.chispas = new THREE.Points(gp, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.chispas.frustumCulled = false;
    escena.add(this.chispas);
    this.datosC = Array.from({ length: MAX_CHISPAS }, () => ({ vida: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), color: new THREE.Color() }));

    // Fogonazo: estrella plana aditiva.
    const estrella = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.06 : 0.17, a = (i / 10) * Math.PI * 2;
      i ? estrella.lineTo(Math.cos(a) * r, Math.sin(a) * r) : estrella.moveTo(r, 0);
    }
    this.fogonazos = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(estrella), new THREE.MeshBasicMaterial({ color: 0xFFF1B8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.visible = false; m.userData.vida = 0;
      escena.add(m);
      return m;
    });

    // Explosiones: esfera toon + anillo (reutilizadas).
    this.explosiones = [0, 1].map(() => {
      const bola = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshToonMaterial({ color: 0xFFC27A, emissive: 0xFF7A4D, emissiveIntensity: 0.6, gradientMap: rampa, transparent: true }));
      const anillo = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORES.sakura, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      bola.visible = anillo.visible = false;
      escena.add(bola, anillo);
      return { bola, anillo, vida: 0, radio: 1 };
    });
    this.ocupado = false;
  }

  trazo(a, b, color = 0xFFF1B8) {
    const t = this.datosT.find((x) => x.vida <= 0) || this.datosT[0];
    t.vida = 0.09; t.a.copy(a); t.b.copy(b); t.color.set(color);
  }

  chispa(p, normal, color = 0xFFE6A8, n = 6, fuerza = 4) {
    for (let i = 0; i < n; i++) {
      const c = this.datosC.find((x) => x.vida <= 0);
      if (!c) return;
      c.vida = 0.25 + Math.random() * 0.3;
      c.p.copy(p);
      c.v.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).multiplyScalar(fuerza);
      if (normal) c.v.addScaledVector(normal, fuerza * 0.8);
      c.color.set(color);
    }
  }

  fogonazo(p, camara, i = 0) {
    const f = this.fogonazos[i];
    f.position.copy(p);
    f.quaternion.copy(camara.quaternion);
    f.rotation.z = Math.random() * Math.PI;
    f.scale.setScalar(0.8 + Math.random() * 0.5);
    f.visible = true; f.userData.vida = 0.05;
  }

  explosion(p, radio) {
    const e = this.explosiones.find((x) => x.vida <= 0) || this.explosiones[0];
    e.vida = 0.55; e.radio = radio;
    e.bola.position.copy(p); e.anillo.position.set(p.x, p.y + 0.05, p.z);
    e.bola.visible = e.anillo.visible = true;
    this.chispa(p, null, 0xFFB38A, 30, 9);
    this.chispa(p, null, 0xFF8FB8, 20, 7);
  }

  actualizar(dt) {
    // Trazadoras: el extremo de atrás alcanza al de delante.
    for (let i = 0; i < MAX_TRAZOS; i++) {
      const t = this.datosT[i];
      let k = 0;
      if (t.vida > 0) { t.vida -= dt; k = Math.max(0, t.vida / 0.09); }
      const a = _v.lerpVectors(t.b, t.a, k);
      const P = this.posT, Cc = this.colT, o = i * 6;
      P[o] = a.x; P[o + 1] = a.y; P[o + 2] = a.z; P[o + 3] = t.b.x; P[o + 4] = t.b.y; P[o + 5] = t.b.z;
      Cc[o] = t.color.r * k * 0.3; Cc[o + 1] = t.color.g * k * 0.3; Cc[o + 2] = t.color.b * k * 0.3;
      Cc[o + 3] = t.color.r * k; Cc[o + 4] = t.color.g * k; Cc[o + 5] = t.color.b * k;
    }
    this.trazos.geometry.attributes.position.needsUpdate = true;
    this.trazos.geometry.attributes.color.needsUpdate = true;

    for (let i = 0; i < MAX_CHISPAS; i++) {
      const c = this.datosC[i];
      if (c.vida > 0) {
        c.vida -= dt;
        c.v.y -= 12 * dt;
        c.p.addScaledVector(c.v, dt);
      }
      const k = Math.max(0, Math.min(1, c.vida * 4));
      const o = i * 3, P = this.posC, Cc = this.colC;
      if (c.vida > 0) { P[o] = c.p.x; P[o + 1] = c.p.y; P[o + 2] = c.p.z; } else P[o + 1] = -999;
      Cc[o] = c.color.r * k; Cc[o + 1] = c.color.g * k; Cc[o + 2] = c.color.b * k;
    }
    this.chispas.geometry.attributes.position.needsUpdate = true;
    this.chispas.geometry.attributes.color.needsUpdate = true;

    for (const f of this.fogonazos) {
      if (!f.visible) continue;
      f.userData.vida -= dt;
      if (f.userData.vida <= 0) f.visible = false;
    }
    for (const e of this.explosiones) {
      if (e.vida <= 0) continue;
      e.vida -= dt;
      const t = 1 - Math.max(0, e.vida) / 0.55;
      e.bola.scale.setScalar(e.radio * (0.3 + 0.55 * Math.sqrt(t)));
      e.bola.material.opacity = 1 - t * t;
      e.anillo.scale.setScalar(e.radio * (0.4 + t));
      e.anillo.material.opacity = 1 - t;
      if (e.vida <= 0) e.bola.visible = e.anillo.visible = false;
    }
  }
}

const _v = new THREE.Vector3();
