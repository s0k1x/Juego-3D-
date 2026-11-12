// Armas: datos, estado de munición/recarga y modelos 3D (se construyen solo al usarse).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { materialContorno, pintar, rampa } from './render.js';

export const ARMAS = {
  rifle: {
    nombre: 'Rifle Hikari', desc: 'Automático y fiable a media distancia.',
    auto: true, cadencia: 0.1, dano: 19, cabeza: 1.6, cargador: 30, recarga: 1.8,
    disp: 0.012, dispMov: 0.03, perdigones: 1, alcance: 120, zoom: 52, retroceso: 0.011, caida: [28, 60, 0.7],
    stats: { dano: 2, alcance: 3, cadencia: 4 },
  },
  escopeta: {
    nombre: 'Escopeta Raijin', desc: 'Demoledora de cerca. Ocho perdigones por disparo.',
    auto: false, cadencia: 0.85, dano: 12, cabeza: 1.25, cargador: 6, recarga: 2.1,
    disp: 0.075, dispMov: 0.09, perdigones: 8, alcance: 40, zoom: 64, retroceso: 0.05, caida: [7, 20, 0.3],
    stats: { dano: 5, alcance: 1, cadencia: 2 },
  },
  franco: {
    nombre: 'Francotirador Tsuki', desc: 'Un disparo a la cabeza basta. Apunta con clic derecho.',
    auto: false, cadencia: 1.15, dano: 92, cabeza: 2.2, cargador: 5, recarga: 2.4,
    disp: 0.0015, dispCadera: 0.06, dispMov: 0.1, perdigones: 1, alcance: 220, zoom: 20, retroceso: 0.06, mira: true,
    stats: { dano: 5, alcance: 5, cadencia: 1 },
  },
  pistola: {
    nombre: 'Pistola Kaze', desc: 'Secundaria rápida.',
    auto: false, cadencia: 0.16, dano: 21, cabeza: 1.7, cargador: 12, recarga: 1.3,
    disp: 0.01, dispMov: 0.025, perdigones: 1, alcance: 80, zoom: 60, retroceso: 0.02, caida: [20, 45, 0.6],
  },
  katana: { nombre: 'Katana Hana', cuerpo: true, cadencia: 0.6, dano: 55, alcance: 2.7 },
  granada: { nombre: 'Granada Hanabi', lanzable: true, cadencia: 0.8, dano: 95, radio: 6, mecha: 1.8 },
};

export const PRIMARIAS = ['rifle', 'escopeta', 'franco'];

// Daño según la distancia: completo hasta d0, baja linealmente hasta d1 y luego se queda en `min`.
export function caidaDano(arma, dist) {
  const c = arma.caida;
  if (!c) return 1;
  if (dist <= c[0]) return 1;
  if (dist >= c[1]) return c[2];
  return 1 - (1 - c[2]) * ((dist - c[0]) / (c[1] - c[0]));
}

export class Arsenal {
  constructor(primaria = 'rifle') {
    this.ranuras = [primaria, 'pistola', 'katana', 'granada'];
    this.reiniciar();
  }

  reiniciar(primaria) {
    if (primaria) this.ranuras[0] = primaria;
    this.municion = {};
    for (const k of this.ranuras) this.municion[k] = ARMAS[k].cargador ?? 0;
    this.granadas = 1;
    this.indice = 0;
    this.anterior = 1;
    this.enfriamiento = 0;
    this.recargando = 0;
    this.cambiando = 0.2;
  }

  get tipo() { return this.ranuras[this.indice]; }
  get arma() { return ARMAS[this.tipo]; }

  cambiar(i) {
    if (i === this.indice || i < 0 || i > 3) return false;
    if (this.ranuras[i] === 'granada' && this.granadas <= 0) return false;
    this.anterior = this.indice;
    this.indice = i;
    this.recargando = 0;
    this.cambiando = 0.32;
    return true;
  }

  actualizar(dt) {
    this.enfriamiento = Math.max(0, this.enfriamiento - dt);
    this.cambiando = Math.max(0, this.cambiando - dt);
    if (this.recargando > 0) {
      this.recargando -= dt;
      if (this.recargando <= 0) { this.recargando = 0; this.municion[this.tipo] = this.arma.cargador; }
    }
  }

  listo() { return this.enfriamiento <= 0 && this.cambiando <= 0 && this.recargando <= 0; }

  recargar() {
    const a = this.arma;
    if (!a.cargador || this.recargando > 0 || this.municion[this.tipo] >= a.cargador) return false;
    this.recargando = a.recarga;
    return true;
  }

  // Devuelve true si se ha podido disparar (gasta munición y aplica cadencia).
  disparar() {
    if (!this.listo()) return false;
    const a = this.arma;
    if (a.cargador) {
      if (this.municion[this.tipo] <= 0) { this.recargar(); return false; }
      this.municion[this.tipo]--;
    }
    if (a.lanzable) {
      if (this.granadas <= 0) return false;
      this.granadas--;
    }
    this.enfriamiento = a.cadencia;
    return true;
  }
}

// ---------- Modelos ----------
const OSC = 0x2F2A55, MET = 0x6C66A6, CLARO = 0xEDE6FF, ACENTO = 0xFF8FB8, MADERA = 0xC98F6A, HOJA = 0xF4F7FF;
const caja = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cil = (r, h, x, y, z) => new THREE.CylinderGeometry(r, r, h, 8).rotateX(Math.PI / 2).translate(x, y, z);

const PIEZAS = {
  rifle: () => [
    [caja(0.07, 0.1, 0.42, 0, 0.03, -0.12), OSC], [cil(0.022, 0.3, 0, 0.05, -0.47), MET],
    [caja(0.05, 0.14, 0.07, 0, -0.06, -0.12), MET], [caja(0.06, 0.08, 0.2, 0, 0.0, 0.17), CLARO],
    [caja(0.03, 0.04, 0.16, 0, 0.1, -0.1), ACENTO],
  ],
  escopeta: () => [
    [caja(0.08, 0.1, 0.36, 0, 0.03, -0.1), OSC], [cil(0.03, 0.34, -0.02, 0.06, -0.44), MET],
    [cil(0.03, 0.34, 0.02, 0.06, -0.44), MET], [caja(0.07, 0.09, 0.22, 0, -0.02, 0.18), MADERA],
    [caja(0.085, 0.03, 0.1, 0, 0.0, -0.3), ACENTO],
  ],
  franco: () => [
    [caja(0.06, 0.09, 0.5, 0, 0.03, -0.15), OSC], [cil(0.018, 0.55, 0, 0.05, -0.68), MET],
    [cil(0.035, 0.26, 0, 0.13, -0.12), OSC], [caja(0.06, 0.1, 0.26, 0, -0.01, 0.22), CLARO],
    [cil(0.04, 0.02, 0, 0.13, -0.26), ACENTO],
  ],
  pistola: () => [
    [caja(0.05, 0.08, 0.22, 0, 0.04, -0.08), OSC], [caja(0.045, 0.12, 0.06, 0, -0.04, 0.0), MET],
    [caja(0.052, 0.02, 0.18, 0, 0.09, -0.08), ACENTO],
  ],
  katana: () => [
    [caja(0.035, 0.035, 0.22, 0, 0, 0.02), OSC], [caja(0.12, 0.02, 0.05, 0, 0, -0.1), ACENTO],
    [caja(0.012, 0.045, 0.85, 0, 0.01, -0.54), HOJA],
  ],
  granada: () => [
    [new THREE.SphereGeometry(0.07, 10, 8).translate(0, 0, -0.04), ACENTO], [caja(0.03, 0.05, 0.03, 0, 0.07, -0.04), OSC],
  ],
};

const matArma = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: rampa });

export function geometriaArma(tipo) {
  const p = PIEZAS[tipo]?.();
  if (!p) return null;
  const geos = p.map(([geo, c]) => { const g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv'); return pintar(g, c); });
  return { malla: mergeGeometries(geos), contorno: mergeGeometries(geos.map((g) => g.clone())) };
}

export function modeloArma(tipo) {
  const g = geometriaArma(tipo);
  if (!g) return null;
  const m = new THREE.Mesh(g.malla, matArma);
  m.castShadow = true;
  m.add(new THREE.Mesh(g.contorno, materialContorno));
  return m;
}
