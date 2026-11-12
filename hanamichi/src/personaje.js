// Personaje anime hecho con figuras simples. Cada parte del cuerpo es UNA malla
// (piezas fusionadas con color por vértice) + su contorno: ~14 llamadas de dibujo por personaje.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { materialContorno, pintar, rampa } from './render.js';
import { modeloArma } from './armas.js';

const PIEL = 0xFFE3D3, MEJILLA = 0xFFB8B8, BLANCO = 0xFFFDF8, OSCURO = 0x2A2350;

export const ESTILOS = {
  sakura: { pelo: 0xFF8FB8, peloSombra: 0xE0679A, iris: 0xC2307A, acento: 0xFF8FB8, chaqueta: BLANCO, pantalon: 0x3B3170, peinado: 'puntas' },
  cian: { pelo: 0x3EC9F0, peloSombra: 0x2398C2, iris: 0x1A7FB0, acento: 0x3EE0FF, chaqueta: 0x3A4A8C, pantalon: 0x232046, peinado: 'erizo' },
  hielo: { pelo: 0xEEF8FF, peloSombra: 0xA9D8F0, iris: 0x3B9BE0, acento: 0x8FD8FF, chaqueta: 0xDDEEFF, pantalon: 0x4C5FA8, peinado: 'largo' },
  fuego: { pelo: 0xFF6B4A, peloSombra: 0xD2452C, iris: 0xE0552B, acento: 0xFF9A4D, chaqueta: 0x3A2D5C, pantalon: 0x2A2350, peinado: 'coletas' },
};

const g = {
  esfera: (r, x, y, z, sx = 1, sy = 1, sz = 1, seg = 12) => new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)).scale(sx, sy, sz).translate(x, y, z),
  cil: (r1, r2, h, x, y, z, seg = 10) => new THREE.CylinderGeometry(r1, r2, h, seg, 1).translate(x, y, z),
  caja: (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z),
  cono: (r, h, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const c = new THREE.ConeGeometry(r, h, 5, 1);
    c.rotateX(rx); c.rotateY(ry); c.rotateZ(rz);
    return c.translate(x, y, z);
  },
};

function limpiar(geo) {
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('uv');
  return geo;
}

// Crea una parte: `piezas` lleva contorno, `detalles` no (ojos, brillos...).
export function parte(material, piezas, detalles = []) {
  const todas = [...piezas, ...detalles].map(([geo, color]) => pintar(limpiar(geo), color));
  const malla = new THREE.Mesh(mergeGeometries(todas), material);
  malla.castShadow = true;
  const contorno = new THREE.Mesh(mergeGeometries(piezas.map(([geo]) => limpiar(geo.clone()))), materialContorno);
  malla.add(contorno);
  return malla;
}

function peinado(E, pelo) {
  const P = E.pelo, S = E.peloSombra;
  if (E.peinado === 'puntas' || E.peinado === 'coletas' || E.peinado === 'largo') {
    for (let i = -2; i <= 2; i++) pelo.push([g.cono(0.05, 0.17, i * 0.055, 0.25, -0.13, Math.PI + 0.35, 0, i * 0.12), i % 2 ? S : P]);
    for (const l of [-1, 1]) pelo.push([g.cono(0.05, 0.26, l * 0.155, 0.1, -0.06, Math.PI + 0.1, 0, -l * 0.1), P]);
  }
  if (E.peinado === 'puntas') {
    for (let i = -1; i <= 1; i++) pelo.push([g.cono(0.065, 0.24, i * 0.09, 0.14, 0.15, Math.PI - 1.0, 0, i * 0.3), S]);
    pelo.push([g.cono(0.022, 0.16, 0.02, 0.4, -0.02, -0.5, 0, -0.4), P]);
  } else if (E.peinado === 'erizo') {
    // Pelo de punta hacia arriba y atrás + cinta en la frente.
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 1.6;
      pelo.push([g.cono(0.06, 0.26, Math.sin(a) * 0.12, 0.34, 0.04 + Math.cos(a) * 0.03, -0.6, 0, -a * 0.6), i % 2 ? S : P]);
    }
    for (let i = -2; i <= 2; i++) pelo.push([g.cono(0.045, 0.13, i * 0.06, 0.27, -0.14, Math.PI + 0.6, 0, i * 0.15), P]);
    pelo.push([new THREE.TorusGeometry(0.178, 0.022, 5, 18).rotateX(Math.PI / 2 - 0.25).translate(0, 0.24, 0.0), E.acento]);
    pelo.push([g.caja(0.05, 0.2, 0.02, 0.05, 0.14, 0.2), E.acento]);
  } else if (E.peinado === 'largo') {
    // Melena larga hasta la espalda y horquilla de hielo.
    pelo.push([g.caja(0.32, 0.46, 0.12, 0, -0.02, 0.13), S]);
    pelo.push([g.esfera(0.16, 0, -0.24, 0.13, 1.05, 0.5, 0.5), P]);
    for (const l of [-1, 1]) pelo.push([g.caja(0.07, 0.36, 0.08, l * 0.16, -0.02, -0.02), P]);
    pelo.push([g.cono(0.035, 0.12, 0.15, 0.32, -0.05, 0, 0, -0.8), 0xBFF0FF]);
    pelo.push([g.cono(0.03, 0.1, 0.1, 0.36, -0.03, 0, 0, -0.3), 0xFFFFFF]);
  } else if (E.peinado === 'coletas') {
    for (const l of [-1, 1]) {
      pelo.push([g.esfera(0.05, l * 0.17, 0.26, 0.04), E.acento]);
      pelo.push([g.cono(0.08, 0.42, l * 0.24, 0.05, 0.06, 0, 0, l * 0.35 + Math.PI), P]);
    }
    // Máscara de zorro en un lado de la cabeza.
    pelo.push([g.esfera(0.075, -0.17, 0.25, -0.05, 0.5, 1, 1), BLANCO]);
    pelo.push([g.cono(0.03, 0.07, -0.19, 0.33, -0.08, 0, 0, 0.4), BLANCO]);
    pelo.push([g.cono(0.03, 0.07, -0.19, 0.33, -0.01, 0, 0, 0.4), BLANCO]);
  }
}

export class Personaje {
  constructor(escena, estilo = 'sakura') {
    const E = ESTILOS[estilo] || ESTILOS.sakura;
    this.estilo = estilo;
    this.E = E;
    this.escena = escena;
    this.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: rampa });
    this.matArma = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: rampa });
    this.raiz = new THREE.Group();
    escena.add(this.raiz);

    // El personaje mira hacia -Z (igual que la cámara).
    this.cadera = new THREE.Group();
    this.cadera.position.y = 0.88;
    this.raiz.add(this.cadera);

    const pierna = (lado) => {
      const grupo = new THREE.Group();
      grupo.position.set(lado * 0.095, 0, 0);
      grupo.add(parte(this.material, [
        [g.cil(0.08, 0.065, 0.8, 0, -0.4, 0), E.pantalon],
        [g.caja(0.12, 0.1, 0.24, 0, -0.83, -0.04), BLANCO],
      ], [
        [g.caja(0.125, 0.03, 0.245, 0, -0.79, -0.04), E.acento],
        [g.cil(0.084, 0.084, 0.05, 0, -0.42, 0), E.acento],
      ]));
      this.cadera.add(grupo);
      return grupo;
    };
    this.piernaI = pierna(-1);
    this.piernaD = pierna(1);

    this.torso = new THREE.Group();
    this.cadera.add(this.torso);
    this.torso.add(parte(this.material, [
      [g.cil(0.17, 0.165, 0.2, 0, 0.02, 0), E.pantalon],
      [g.cil(0.2, 0.165, 0.46, 0, 0.35, 0), E.chaqueta],
      [g.cil(0.05, 0.05, 0.1, 0, 0.62, 0), PIEL],
      // Bufanda (el toque anime) y sus extremos colgando a la espalda.
      [new THREE.TorusGeometry(0.11, 0.045, 6, 14).rotateX(Math.PI / 2).translate(0, 0.6, 0), E.acento],
      [g.caja(0.09, 0.32, 0.04, 0.06, 0.45, 0.17), E.acento],
      [g.caja(0.08, 0.24, 0.04, -0.04, 0.48, 0.18), E.acento],
      // Hombreras.
      [g.esfera(0.08, 0.2, 0.55, 0, 1.1, 0.7, 1), E.chaqueta], [g.esfera(0.08, -0.2, 0.55, 0, 1.1, 0.7, 1), E.chaqueta],
    ], [
      [g.caja(0.025, 0.4, 0.02, 0, 0.36, -0.196), E.acento],
      [g.caja(0.34, 0.04, 0.34, 0, 0.13, 0), OSCURO],
      [g.caja(0.06, 0.05, 0.02, 0, 0.13, -0.175), 0xFFD27A],
    ]));

    // Cabeza grande con ojos anime.
    this.cabeza = new THREE.Group();
    this.cabeza.position.y = 0.66;
    this.torso.add(this.cabeza);
    const pelo = [], det = [];
    pelo.push([g.esfera(0.17, 0, 0.17, 0, 0.95, 1, 0.95, 14), PIEL]);
    const casquete = new THREE.SphereGeometry(0.19, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.58).rotateX(0.42).translate(0, 0.19, 0.02);
    pelo.push([casquete, E.pelo]);
    peinado(E, pelo);
    for (const l of [-1, 1]) {
      const x = l * 0.065;
      det.push([g.esfera(0.05, x, 0.155, -0.142, 0.9, 1.25, 0.3), BLANCO]);
      det.push([g.esfera(0.038, x, 0.15, -0.152, 0.85, 1.25, 0.3), E.iris]);
      det.push([g.esfera(0.02, x, 0.145, -0.16, 1, 1.2, 0.3), OSCURO]);
      det.push([g.esfera(0.013, x + l * 0.012, 0.172, -0.166, 1, 1, 0.4, 6), BLANCO]);
      det.push([g.esfera(0.007, x - l * 0.012, 0.135, -0.165, 1, 1, 0.4, 6), BLANCO]);
      det.push([g.caja(0.07, 0.012, 0.02, x, 0.228, -0.148), OSCURO]);
      det.push([g.esfera(0.022, l * 0.105, 0.105, -0.13, 1.4, 0.6, 0.3, 6), MEJILLA]);
    }
    det.push([g.caja(0.035, 0.008, 0.02, 0, 0.075, -0.158), OSCURO]);
    this.cabeza.add(parte(this.material, pelo, det));

    const brazo = (lado) => {
      const hombro = new THREE.Group();
      hombro.position.set(lado * 0.235, 0.53, 0);
      hombro.add(parte(this.material, [
        [g.cil(0.065, 0.055, 0.3, 0, -0.15, 0), E.chaqueta],
        [g.cil(0.048, 0.044, 0.26, 0, -0.42, 0), PIEL],
        [g.esfera(0.054, 0, -0.57, 0), OSCURO],
      ], [
        [g.cil(0.068, 0.068, 0.04, 0, -0.29, 0), E.acento],
      ]));
      this.torso.add(hombro);
      return hombro;
    };
    this.brazoI = brazo(-1);
    this.brazoD = brazo(1);
    this.mano = new THREE.Group();
    this.mano.position.set(0, -0.57, 0);
    this.brazoD.add(this.mano);

    // Burbuja (escudo / definitiva activa).
    this.burbuja = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xBFEFFF, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.burbuja.scale.set(0.62, 1.05, 0.62);
    this.burbuja.position.y = 0.95;
    this.burbuja.visible = false;
    this.raiz.add(this.burbuja);

    this.etiqueta = null;
    this.armaActual = null;
    this.armas = {};
    this.fase = 0;
    this.muerte = 0;
    this.destello = 0;
    this.visibleEnPantalla = true;
    this.esfera = new THREE.Sphere(new THREE.Vector3(), 1.2);
    this._ladoMuerte = 1;
  }

  // Nombre flotante sobre la cabeza (para rivales y jugadores online).
  setEtiqueta(texto, color = '#FFF7EE') {
    if (!texto) { if (this.etiqueta) this.etiqueta.visible = false; return; }
    if (!this.etiqueta) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthWrite: false, transparent: true });
      this.etiqueta = new THREE.Sprite(mat);
      this.etiqueta.scale.set(0.16, 0.04, 1);
      this.etiqueta.position.y = 2.12;
      this.etiqueta.renderOrder = 5;
      this.raiz.add(this.etiqueta);
      this._lienzo = c;
    }
    if (this._texto === texto + color) { this.etiqueta.visible = true; return; }
    this._texto = texto + color;
    const c = this._lienzo, x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    x.font = '800 34px "Redonda", system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 8; x.strokeStyle = '#2A2350'; x.lineJoin = 'round';
    x.strokeText(texto, 128, 34);
    x.fillStyle = color;
    x.fillText(texto, 128, 34);
    this.etiqueta.material.map.needsUpdate = true;
    this.etiqueta.visible = true;
  }

  ponerArma(tipo) {
    if (this.armaActual === tipo) return;
    if (this.armaActual && this.armas[this.armaActual]) this.armas[this.armaActual].visible = false;
    if (!this.armas[tipo]) {
      const m = modeloArma(tipo, this.matArma);
      if (!m) { this.armaActual = tipo; return; }
      m.rotation.x = -Math.PI / 2; // el eje -Z del arma pasa a ser el eje del brazo
      this.mano.add(m);
      this.armas[tipo] = m;
    }
    this.armas[tipo].visible = true;
    this.armaActual = tipo;
  }

  setVisible(v) { this.raiz.visible = v; }

  destruir() {
    this.escena.remove(this.raiz);
    this.raiz.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.material.dispose();
    this.etiqueta?.material.map.dispose();
  }

  // e: { pos, yaw, pitch, vel, suelo, deslizando, agachado, vivo, golpeKatana, katanaLado, recarga, lanzando,
  //      flinch, protegido, escudo, ult }
  actualizar(dt, e, camara) {
    const r = this.raiz;
    r.position.copy(e.pos);
    r.rotation.y = e.yaw;
    this.destello = Math.max(0, this.destello - dt);
    const m = this.material;
    if (this.destello > 0) { m.emissive.setHex(0xffffff); m.emissiveIntensity = 0.7; }
    else if (e.protegido) { m.emissive.setHex(0x9BE8FF); m.emissiveIntensity = 0.25 + Math.sin(performance.now() / 60) * 0.2; }
    else if (e.ult) { m.emissive.setHex(this.E.acento); m.emissiveIntensity = 0.22; }
    else { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
    const burbuja = !!(e.vivo && (e.escudo > 0 || e.ult));
    this.burbuja.visible = burbuja;
    if (burbuja) {
      this.burbuja.material.color.setHex(e.escudo > 0 ? 0xBFEFFF : this.E.acento);
      this.burbuja.material.opacity = (e.escudo > 0 ? 0.22 : 0.12) + Math.sin(performance.now() / 180) * 0.04;
    }

    this.esfera.center.set(e.pos.x, e.pos.y + 0.9, e.pos.z);
    this.visibleEnPantalla = !camara || _frustum.intersectsSphere(this.esfera);

    if (!e.vivo) {
      if (this.muerte === 0) this._ladoMuerte = Math.random() < 0.5 ? -1 : 1;
      this.muerte = Math.min(1, this.muerte + dt * 2.4);
      const k = 1 - (1 - this.muerte) ** 3;
      this.cadera.rotation.set(-k * 1.45, 0, k * 0.25 * this._ladoMuerte);
      this.cadera.position.y = 0.88 - k * 0.68;
      this.brazoD.rotation.set(2.6 * k, 0, -0.6 * k);
      this.brazoI.rotation.set(2.2 * k, 0, 0.8 * k);
      if (this.etiqueta) this.etiqueta.visible = false;
      return;
    }
    this.muerte = 0;
    if (!this.visibleEnPantalla) return;

    const s = Math.sin(e.yaw), c = Math.cos(e.yaw);
    const adelante = -(e.vel.x * s + e.vel.z * c);
    const lado = e.vel.x * c - e.vel.z * s;
    const rapidez = Math.hypot(e.vel.x, e.vel.z);
    this.fase += dt * rapidez * 1.9;
    const amp = Math.min(1, rapidez / 6) * 0.75;
    const corre = rapidez > 7 && e.suelo && !e.deslizando;

    let altura = 0.88, inclinacion = 0;
    if (e.deslizando) {
      altura = 0.42; inclinacion = 0.7;
      this.piernaI.rotation.set(-1.35, 0, 0); this.piernaD.rotation.set(-1.1, 0, 0);
    } else if (!e.suelo) {
      const sube = Math.max(-1, Math.min(1, e.vel.y / 6));
      this.piernaI.rotation.set(-0.8 + sube * 0.2, 0, -0.05); this.piernaD.rotation.set(0.2 - sube * 0.3, 0, 0.05);
    } else {
      const sw = Math.sin(this.fase) * amp * Math.sign(adelante || 1);
      this.piernaI.rotation.set(sw, 0, -lado / 30);
      this.piernaD.rotation.set(-sw, 0, -lado / 30);
      altura -= Math.abs(Math.cos(this.fase)) * amp * 0.05;
      if (e.agachado) { altura = 0.62; this.piernaI.rotation.x -= 0.9; this.piernaD.rotation.x -= 0.6; }
    }
    this.cadera.position.y = altura;
    this.cadera.rotation.set(0, 0, 0);
    const flinch = e.flinch || 0;
    this.torso.rotation.x = inclinacion * 0.5 - (corre ? 0.2 : 0) + flinch * 0.25;
    this.torso.rotation.y = Math.sin(this.fase) * amp * 0.12;
    this.torso.rotation.z = -lado / 40;
    this.cabeza.rotation.x = e.pitch * 0.5 - this.torso.rotation.x * 0.5;
    this.cabeza.rotation.y = -this.torso.rotation.y;

    // Rotación X del brazo: 0 = colgando, PI/2 = al frente, PI = hacia arriba.
    const apunte = Math.PI / 2 + e.pitch;
    const cuerpoAcuerpo = this.armaActual === 'katana' || this.armaActual === 'granada';
    if (e.golpeKatana > 0) {
      const t = 1 - e.golpeKatana, l = e.katanaLado || 1;
      this.brazoD.rotation.set(2.8 - t * 2.4, 0, l * (-0.5 + t * 1.1));
    } else if (cuerpoAcuerpo) {
      this.brazoD.rotation.set(corre ? 0.3 + Math.sin(this.fase) * 0.7 : 0.9 + Math.sin(this.fase) * amp * 0.3, 0, -0.1);
    } else if (corre) {
      this.brazoD.rotation.set(0.9, 0, -0.3);
    } else {
      this.brazoD.rotation.set(apunte, 0, -0.04);
    }
    if (e.lanzando > 0) {
      // Lanza un poder: brazo izquierdo extendido al frente.
      this.brazoI.rotation.set(apunte + 0.1, 0, -0.15);
    } else if (e.recarga > 0) {
      const t = e.recarga;
      this.brazoI.rotation.set(apunte - 0.6 - Math.sin(t * Math.PI) * 0.8, 0, 0.5);
    } else if (cuerpoAcuerpo) {
      this.brazoI.rotation.set(-Math.sin(this.fase) * amp * 0.8, 0, -0.1);
    } else if (corre) {
      this.brazoI.rotation.set(0.7, 0, 0.6);
    } else {
      this.brazoI.rotation.set(apunte - 0.1, 0, 0.55);
    }
  }

  // Esferas de impacto: cabeza, pecho y piernas. Coordenadas de mundo.
  cajasImpacto(e, out) {
    const alto = e.deslizando ? 0.48 : e.agachado ? 0.7 : 1;
    out.cabeza.set(e.pos.x, e.pos.y + 1.58 * alto + (alto < 1 ? 0.05 : 0), e.pos.z);
    out.pecho.set(e.pos.x, e.pos.y + 1.15 * alto, e.pos.z);
    out.piernas.set(e.pos.x, e.pos.y + 0.55 * alto, e.pos.z);
    return out;
  }
}

const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();
export function actualizarFrustum(camara) {
  _m.multiplyMatrices(camara.projectionMatrix, camara.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_m);
}
