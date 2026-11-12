// Personaje anime hecho con figuras simples. Cada parte del cuerpo es UNA malla
// (piezas fusionadas con color por vértice) + su contorno: ~14 llamadas de dibujo por personaje.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { materialContorno, pintar, rampa } from './render.js';
import { modeloArma } from './armas.js';

const PIEL = 0xFFE3D3, MEJILLA = 0xFFB8B8, BLANCO = 0xFFFDF8, OSCURO = 0x2A2350, PANTALON = 0x3B3170;

export const ESTILOS = {
  // Jugador: pelo de puntas sakura y chaqueta blanca con detalles rosas.
  sakura: { pelo: 0xFF8FB8, peloSombra: 0xE0679A, iris: 0xC2307A, acento: 0xFF8FB8, coleta: false },
  // Rival: coleta cian y chaqueta con detalles cian.
  cian: { pelo: 0x3EC9F0, peloSombra: 0x2398C2, iris: 0x1A7FB0, acento: 0x3EE0FF, coleta: true },
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
function parte(material, piezas, detalles = []) {
  const todas = [...piezas, ...detalles].map(([geo, color]) => pintar(limpiar(geo), color));
  const malla = new THREE.Mesh(mergeGeometries(todas), material);
  malla.castShadow = true;
  const contorno = new THREE.Mesh(mergeGeometries(piezas.map(([geo]) => limpiar(geo.clone()))), materialContorno);
  malla.add(contorno);
  return malla;
}

export class Personaje {
  constructor(escena, estilo = 'sakura') {
    const E = ESTILOS[estilo];
    this.estilo = estilo;
    this.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: rampa });
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
        [g.cil(0.08, 0.065, 0.8, 0, -0.4, 0), PANTALON],
        [g.caja(0.12, 0.1, 0.24, 0, -0.83, -0.04), BLANCO],
      ], [
        [g.caja(0.125, 0.03, 0.245, 0, -0.79, -0.04), E.acento],
      ]));
      this.cadera.add(grupo);
      return grupo;
    };
    this.piernaI = pierna(-1);
    this.piernaD = pierna(1);

    this.torso = new THREE.Group();
    this.cadera.add(this.torso);
    this.torso.add(parte(this.material, [
      [g.cil(0.17, 0.165, 0.2, 0, 0.02, 0), PANTALON],
      [g.cil(0.2, 0.165, 0.46, 0, 0.35, 0), BLANCO],
      [g.cil(0.05, 0.05, 0.1, 0, 0.62, 0), PIEL],
      // Bufanda (el toque anime) y su extremo colgando a la espalda.
      [new THREE.TorusGeometry(0.11, 0.045, 6, 14).rotateX(Math.PI / 2).translate(0, 0.6, 0), E.acento],
      [g.caja(0.09, 0.32, 0.04, 0.06, 0.45, 0.17), E.acento],
    ], [
      [g.caja(0.025, 0.4, 0.02, 0, 0.36, -0.196), E.acento], // cremallera de color
      [g.caja(0.34, 0.04, 0.34, 0, 0.13, 0), OSCURO],         // cinturón
    ]));

    // Cabeza grande con ojos anime.
    this.cabeza = new THREE.Group();
    this.cabeza.position.y = 0.66;
    this.torso.add(this.cabeza);
    const pelo = [], det = [];
    pelo.push([g.esfera(0.17, 0, 0.17, 0, 0.95, 1, 0.95, 14), PIEL]);
    // Casquete de pelo inclinado hacia atrás para dejar la cara libre.
    const casquete = new THREE.SphereGeometry(0.19, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.58).rotateX(0.42).translate(0, 0.19, 0.02);
    pelo.push([casquete, E.pelo]);
    // Flequillo de puntas.
    for (let i = -2; i <= 2; i++) pelo.push([g.cono(0.05, 0.17, i * 0.055, 0.25, -0.13, Math.PI + 0.35, 0, i * 0.12), i % 2 ? E.peloSombra : E.pelo]);
    // Mechones laterales.
    for (const l of [-1, 1]) pelo.push([g.cono(0.05, 0.26, l * 0.155, 0.1, -0.06, Math.PI + 0.1, 0, -l * 0.1), E.pelo]);
    // Puntas traseras.
    for (let i = -1; i <= 1; i++) pelo.push([g.cono(0.065, 0.24, i * 0.09, 0.14, 0.15, Math.PI - 1.0, 0, i * 0.3), E.peloSombra]);
    // Pelo rebelde arriba (ahoge).
    pelo.push([g.cono(0.022, 0.16, 0.02, 0.4, -0.02, -0.5, 0, -0.4), E.pelo]);
    if (E.coleta) {
      pelo.push([g.esfera(0.05, 0, 0.26, 0.17), E.peloSombra]);
      pelo.push([g.cono(0.08, 0.38, 0, 0.14, 0.28, Math.PI - 0.5), E.pelo]);
    }
    // Ojos: esclerótica, iris del color del equipo, pupila y dos brillos.
    for (const l of [-1, 1]) {
      const x = l * 0.065;
      det.push([g.esfera(0.05, x, 0.155, -0.142, 0.9, 1.25, 0.3), BLANCO]);
      det.push([g.esfera(0.038, x, 0.15, -0.152, 0.85, 1.25, 0.3), E.iris]);
      det.push([g.esfera(0.02, x, 0.145, -0.16, 1, 1.2, 0.3), OSCURO]);
      det.push([g.esfera(0.013, x + l * 0.012, 0.172, -0.166, 1, 1, 0.4, 6), BLANCO]);
      det.push([g.esfera(0.007, x - l * 0.012, 0.135, -0.165, 1, 1, 0.4, 6), BLANCO]);
      det.push([g.caja(0.07, 0.012, 0.02, x, 0.228, -0.148), OSCURO]); // ceja
      det.push([g.esfera(0.022, l * 0.105, 0.105, -0.13, 1.4, 0.6, 0.3, 6), MEJILLA]); // rubor
    }
    det.push([g.caja(0.035, 0.008, 0.02, 0, 0.075, -0.158), OSCURO]); // boca
    this.cabeza.add(parte(this.material, pelo, det));

    const brazo = (lado) => {
      const hombro = new THREE.Group();
      hombro.position.set(lado * 0.235, 0.53, 0);
      hombro.add(parte(this.material, [
        [g.cil(0.065, 0.055, 0.3, 0, -0.15, 0), BLANCO],
        [g.cil(0.048, 0.044, 0.26, 0, -0.42, 0), PIEL],
        [g.esfera(0.052, 0, -0.57, 0), PIEL],
      ], [
        [g.cil(0.068, 0.068, 0.04, 0, -0.29, 0), E.acento], // puño de la manga
      ]));
      this.torso.add(hombro);
      return hombro;
    };
    this.brazoI = brazo(-1);
    this.brazoD = brazo(1);
    this.mano = new THREE.Group();
    this.mano.position.set(0, -0.57, 0);
    this.brazoD.add(this.mano);

    this.armaActual = null;
    this.armas = {};
    this.fase = 0;
    this.muerte = 0;
    this.destello = 0;
    this.visibleEnPantalla = true;
    this.esfera = new THREE.Sphere(new THREE.Vector3(), 1.2);
  }

  ponerArma(tipo) {
    if (this.armaActual === tipo) return;
    if (this.armaActual && this.armas[this.armaActual]) this.armas[this.armaActual].visible = false;
    if (!this.armas[tipo]) { // las armas se construyen solo la primera vez que se usan
      const m = modeloArma(tipo);
      if (!m) { this.armaActual = tipo; return; }
      m.rotation.x = -Math.PI / 2; // el eje -Z del arma pasa a ser el eje del brazo
      this.mano.add(m);
      this.armas[tipo] = m;
    }
    this.armas[tipo].visible = true;
    this.armaActual = tipo;
  }

  setVisible(v) { this.raiz.visible = v; }

  // estado: { pos, yaw, pitch, vel (Vector3), suelo, deslizando, agachado, vivo, golpeKatana }
  actualizar(dt, e, camara) {
    const r = this.raiz;
    r.position.copy(e.pos);
    r.rotation.y = e.yaw;
    this.destello = Math.max(0, this.destello - dt);
    this.material.emissive.setHex(this.destello > 0 ? 0xffffff : 0x000000);
    this.material.emissiveIntensity = this.destello > 0 ? 0.6 : 0;

    // Si está fuera de la vista de la cámara, no gastamos tiempo animando.
    this.esfera.center.set(e.pos.x, e.pos.y + 0.9, e.pos.z);
    this.visibleEnPantalla = !camara || _frustum.intersectsSphere(this.esfera);

    if (!e.vivo) {
      this.muerte = Math.min(1, this.muerte + dt * 2.4);
      const k = 1 - (1 - this.muerte) ** 3;
      r.rotation.x = 0; this.cadera.rotation.x = -k * 1.45;
      this.cadera.position.y = 0.88 - k * 0.68;
      return;
    }
    this.muerte = 0;
    if (!this.visibleEnPantalla) return;

    // Velocidad en ejes locales (adelante / lado).
    const s = Math.sin(e.yaw), c = Math.cos(e.yaw);
    const adelante = -(e.vel.x * s + e.vel.z * c);
    const lado = e.vel.x * c - e.vel.z * s;
    const rapidez = Math.hypot(e.vel.x, e.vel.z);
    this.fase += dt * rapidez * 1.9;
    const amp = Math.min(1, rapidez / 6) * 0.75;

    let altura = 0.88, inclinacion = 0;
    if (e.deslizando) {
      altura = 0.42; inclinacion = 0.7;
      this.piernaI.rotation.x = -1.35; this.piernaD.rotation.x = -1.1;
    } else if (!e.suelo) {
      this.piernaI.rotation.x = -0.7; this.piernaD.rotation.x = 0.3;
    } else {
      const sw = Math.sin(this.fase) * amp * Math.sign(adelante || 1);
      this.piernaI.rotation.x = sw;
      this.piernaD.rotation.x = -sw;
      this.piernaI.rotation.z = this.piernaD.rotation.z = -lado / 30;
      altura -= Math.abs(Math.cos(this.fase)) * amp * 0.05;
      if (e.agachado) { altura = 0.62; this.piernaI.rotation.x -= 0.9; this.piernaD.rotation.x -= 0.6; }
    }
    this.cadera.position.y = altura;
    this.cadera.rotation.x = 0;
    this.torso.rotation.x = inclinacion * 0.5 - (rapidez > 6.5 && e.suelo && !e.deslizando ? 0.18 : 0);
    // Cabeza y brazos siguen la inclinación de la mirada.
    this.cabeza.rotation.x = e.pitch * 0.5 - this.torso.rotation.x * 0.5;
    // Rotación X del brazo: 0 = colgando, PI/2 = al frente, PI = hacia arriba.
    const apunte = Math.PI / 2 + e.pitch;
    const cuerpoAcuerpo = this.armaActual === 'katana' || this.armaActual === 'granada';
    if (e.golpeKatana > 0) {
      const t = 1 - e.golpeKatana;
      this.brazoD.rotation.set(2.8 - t * 2.4, 0, -0.5 + t * 0.9);
    } else if (cuerpoAcuerpo) {
      this.brazoD.rotation.set(0.5 + Math.sin(this.fase) * amp * 0.3, 0, -0.1);
    } else {
      this.brazoD.rotation.set(apunte, 0, -0.04);
    }
    if (cuerpoAcuerpo) this.brazoI.rotation.set(-Math.sin(this.fase) * amp * 0.6, 0, -0.1);
    else this.brazoI.rotation.set(apunte - 0.1, 0, 0.55);
  }

  // Esferas de impacto: cabeza y cuerpo (dos esferas apiladas). Coordenadas de mundo.
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
