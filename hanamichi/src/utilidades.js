// Utilidades de uso rápido (Q): granada, humo, destello, muro y botiquín, más los cohetes del lanzador.
// Quien la usa calcula los parámetros y avisa a los demás por red; el daño lo aplica solo el dueño.
import * as THREE from 'three';
import { ARMAS } from './armas.js';
import { geometriaArma } from './modelos.js';
import { materialContorno, rampa } from './render.js';
import { PALETA } from './paleta.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _n = new THREE.Vector3();
const _cajas = [];
const r2 = (v) => Math.round(v * 100) / 100;
const MAX = 10;

export class Utilidades {
  constructor(juego) {
    this.j = juego;
    const escena = juego.render.escena;
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: rampa });
    const reserva = (id) => Array.from({ length: MAX }, () => {
      const g = geometriaArma(id);
      const m = new THREE.Mesh(g.malla, mat);
      m.add(new THREE.Mesh(g.contorno, materialContorno));
      m.visible = false;
      escena.add(m);
      return m;
    });
    const mallas = { petardo: reserva('petardo'), humo: reserva('humo'), cohete: reserva('cohete') };
    // Proyectiles: granadas (rebotan, con mecha) y cohetes (rectos, estallan al tocar).
    this.proy = [];
    for (const tipo of ['petardo', 'humo', 'cohete']) for (const malla of mallas[tipo]) this.proy.push({ activo: false, tipo, malla, pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, dueno: null });
    // Nubes de humo: esferas translúcidas que crecen y se deshacen.
    const geoHumo = new THREE.IcosahedronGeometry(1, 2);
    this.nubes = Array.from({ length: 4 }, () => {
      const grupo = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(geoHumo, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xE9EDF5 : 0xD5DAE6, transparent: true, opacity: 0.96, depthWrite: false }));
        const a = (i / 6) * Math.PI * 2;
        m.position.set(i ? Math.cos(a) * 1.9 : 0, 1.2 + (i % 3) * 0.7, i ? Math.sin(a) * 1.9 : 0);
        m.scale.setScalar(i ? 2.1 : 2.8);
        grupo.add(m);
      }
      grupo.visible = false;
      escena.add(grupo);
      return { grupo, vida: 0, pos: new THREE.Vector3(), radio: 5 };
    });
  }

  limpiar() {
    for (const p of this.proy) { p.activo = false; p.malla.visible = false; }
    for (const n of this.nubes) { n.vida = 0; n.grupo.visible = false; }
  }

  // ¿Tapa el humo la línea entre a y b? (para bots, nombres y barras de vida)
  tapado(a, b) {
    for (const n of this.nubes) {
      if (n.vida <= 0.5) continue;
      _q.subVectors(b, a);
      const l = _q.length();
      _q.divideScalar(l || 1);
      _p.set(n.pos.x - a.x, n.pos.y + 1.6 - a.y, n.pos.z - a.z);
      const t = Math.max(0, Math.min(l, _p.dot(_q)));
      const dx = _p.x - _q.x * t, dy = _p.y - _q.y * t, dz = _p.z - _q.z * t;
      if (dx * dx + dy * dy + dz * dz < (n.radio * 0.8) ** 2) return true;
    }
    return false;
  }

  // Usa la utilidad del combatiente. Devuelve true si se ha usado.
  usar(c) {
    if (!c.vivo || c.arsenal.cdUtil > 0) return false;
    const tipo = c.arsenal.utilidad;
    const datos = this._preparar(c, tipo);
    if (!datos) return false;
    c.arsenal.usarUtilidad();
    c.usando = 1;
    this.ejecutar(c, tipo, datos, true);
    this.j.enviarFx({ k: 'u', id: c.id, t: tipo, d: datos });
    return true;
  }

  // Dispara un cohete (lo llama el juego cuando el arma tiene `proyectil`).
  cohete(c, origen, dir) {
    const d = { o: [r2(origen.x), r2(origen.y), r2(origen.z)], d: [r2(dir.x), r2(dir.y), r2(dir.z)] };
    this.ejecutar(c, 'cohete', d, true);
    this.j.enviarFx({ k: 'u', id: c.id, t: 'cohete', d });
  }

  _preparar(c, tipo) {
    const mapa = this.j.mapa;
    _o.set(c.pos.x, c.pos.y + c.ojos, c.pos.z); c.direccion(_d);
    switch (tipo) {
      case 'petardo': case 'humo': {
        _q.copy(_d); _q.y += 0.28; _q.normalize();
        _p.copy(_o).addScaledVector(_q, 0.6); _p.y -= 0.1;
        _q.multiplyScalar(tipo === 'humo' ? 14 : 17).add(c.vel);
        return { o: [r2(_p.x), r2(_p.y), r2(_p.z)], v: [r2(_q.x), r2(_q.y), r2(_q.z)] };
      }
      case 'destello': {
        // Hacia donde miras, también hacia arriba (pero nunca hacia abajo contra el suelo).
        _q.set(_d.x, Math.max(0, _d.y) * 0.6, _d.z).normalize();
        _p.set(c.pos.x, c.pos.y + 0.9, c.pos.z);
        const t = Math.min(9, mapa.rayo(_p, _q, 9.7) - 0.7);
        if (t < 1) return null;
        return { a: [r2(c.pos.x), r2(c.pos.y), r2(c.pos.z)], b: [r2(c.pos.x + _q.x * t), r2(c.pos.y + _q.y * t + 0.05), r2(c.pos.z + _q.z * t)] };
      }
      case 'muro': {
        _q.set(_d.x, 0, _d.z).normalize();
        _p.set(c.pos.x, c.pos.y + 0.9, c.pos.z);
        const t = Math.max(1.3, Math.min(3.5, mapa.rayo(_p, _q, 4) - 0.6));
        return { x: r2(c.pos.x + _q.x * t), z: r2(c.pos.z + _q.z * t), ax: Math.abs(_q.z) >= Math.abs(_q.x) ? 1 : 0 };
      }
      default: return {};
    }
  }

  // Aplica el efecto. `dueno`: true en la máquina de quien la usa (aplica movimiento, cura y daño).
  ejecutar(c, tipo, d, dueno) {
    const J = this.j, ef = J.efectos, au = J.audio;
    const dist = J.distOyente(c.pos);
    const esYo = c === J.jugador;
    if (esYo && tipo !== 'cohete') J.vista.usar(tipo);
    if (!dueno) c.usando = 1;
    switch (tipo) {
      case 'petardo': case 'humo': case 'cohete': {
        const p = this.proy.find((x) => !x.activo && x.tipo === tipo);
        if (!p) break;
        p.activo = true; p.t = 0; p.dueno = c;
        p.pos.set(...d.o);
        if (tipo === 'cohete') { p.vel.set(...d.d).multiplyScalar(38); p.malla.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z); au.fuego(dist); }
        else { p.vel.set(...d.v); au.granadaLanzar(); }
        p.malla.position.copy(p.pos);
        p.malla.visible = true;
        break;
      }
      case 'destello': {
        _o.set(d.a[0], d.a[1] + 1, d.a[2]); _p.set(d.b[0], d.b[1] + 1, d.b[2]);
        for (let i = 0; i < 6; i++) { _q.lerpVectors(_o, _p, i / 5); ef.chispa(_q, null, PALETA.amarillo, 4, 2.5); }
        ef.trazo(_o, _p, 0xFFF1B8, 0.3);
        if (dueno) {
          c.pos.set(d.b[0], d.b[1], d.b[2]);
          _q.set(d.b[0] - d.a[0], 0, d.b[2] - d.a[2]).normalize();
          c.vel.x = _q.x * 9; c.vel.z = _q.z * 9; c.vel.y = Math.max(c.vel.y, 2);
          c.suelo = false;
          if (esYo) J.camara.patada = 1;
        }
        au.destello(dist);
        break;
      }
      case 'muro': {
        J.mapa.agregarMuro(d.x, d.z, !!d.ax, ARMAS.muro.duracion);
        _p.set(d.x, 1, d.z);
        ef.chispa(_p, null, PALETA.hielo, 30, 5);
        au.hielo(dist);
        break;
      }
      case 'botiquin': {
        if (dueno) c.curando = ARMAS.botiquin.cura;
        if (!esYo) { _p.set(c.pos.x, c.pos.y + 1, c.pos.z); ef.chispa(_p, null, PALETA.verde, 24, 3); }
        if (esYo) { au.botiquin?.(); J.ui.aviso?.('+' + ARMAS.botiquin.cura + ' de vida', '', 'gana'); } else au.curar(dist);
        break;
      }
    }
  }

  actualizar(dt) {
    const J = this.j, mapa = J.mapa, ef = J.efectos;
    for (const p of this.proy) {
      if (!p.activo) continue;
      p.t += dt;
      if (p.tipo === 'cohete') {
        const paso = p.vel.length() * dt;
        _d.copy(p.vel).normalize();
        let t = mapa.rayo(p.pos, _d, paso + 0.25);
        let toca = t !== Infinity;
        if (!toca) for (const v of J.combatientes) {
          if (!v.vivo || v === p.dueno) continue;
          _q.set(v.pos.x, v.pos.y + 1, v.pos.z);
          if (_q.distanceToSquared(p.pos) < 0.7) { toca = true; t = 0; break; }
        }
        if (toca || p.t > 4) { if (t !== Infinity) p.pos.addScaledVector(_d, Math.max(0, t - 0.15)); this._estallar(p, ARMAS.cometa.radio, ARMAS.cometa.dano, 'cometa'); continue; }
        p.pos.addScaledVector(p.vel, dt);
        p.malla.position.copy(p.pos);
        ef.chispa(p.pos, null, PALETA.naranja, 2, 1.2);
        continue;
      }
      // Granadas: gravedad y rebote eje a eje contra las cajas.
      p.vel.y -= 20 * dt;
      for (const k of ['x', 'y', 'z']) {
        const antes = p.pos[k];
        p.pos[k] += p.vel[k] * dt;
        for (const b of mapa.cercanas(p.pos.x - 0.3, p.pos.z - 0.3, p.pos.x + 0.3, p.pos.z + 0.3, _cajas)) {
          if (p.pos.x < b.min.x - 0.07 || p.pos.x > b.max.x + 0.07 || p.pos.y < b.min.y - 0.07 || p.pos.y > b.max.y + 0.07 || p.pos.z < b.min.z - 0.07 || p.pos.z > b.max.z + 0.07) continue;
          p.pos[k] = antes;
          p.vel[k] *= -0.35;
          if (k === 'y') { p.vel.x *= 0.7; p.vel.z *= 0.7; }
          break;
        }
      }
      p.malla.position.copy(p.pos);
      p.malla.rotation.x += dt * 8; p.malla.rotation.z += dt * 5;
      if (p.tipo === 'petardo' && p.t >= ARMAS.petardo.mecha) this._estallar(p, ARMAS.petardo.radio, ARMAS.petardo.dano, 'petardo');
      else if (p.tipo === 'humo' && p.t >= 1.1) this._humo(p);
    }
    for (const n of this.nubes) {
      if (n.vida <= 0) continue;
      n.vida -= dt;
      const total = ARMAS.humo.duracion;
      const k = Math.min(1, (total - n.vida) * 2.5) * Math.min(1, n.vida * 1.5);
      n.grupo.scale.setScalar(Math.max(0.01, k));
      n.grupo.rotation.y += dt * 0.15;
      if (n.vida <= 0) n.grupo.visible = false;
    }
  }

  _humo(p) {
    p.activo = false; p.malla.visible = false;
    const n = this.nubes.find((x) => x.vida <= 0) || this.nubes[0];
    n.vida = ARMAS.humo.duracion; n.radio = ARMAS.humo.radio;
    n.pos.copy(p.pos); n.pos.y = Math.max(0, p.pos.y - 0.3);
    n.grupo.position.copy(n.pos);
    n.grupo.visible = true;
    this.j.audio.hielo(this.j.distOyente(p.pos));
  }

  _estallar(p, radio, dano, arma) {
    const J = this.j;
    p.activo = false; p.malla.visible = false;
    J.efectos.explosion(p.pos, radio, 'fuego');
    const dist = J.distOyente(p.pos);
    J.audio.explosion(dist);
    J.camara.sacudida = Math.min(1, J.camara.sacudida + Math.max(0, 1 - dist / 16));
    if (!J.esLocal(p.dueno) || J.fase !== 'combate') return;
    for (const v of J.combatientes) {
      if (!v.vivo) continue;
      // Sin fuego amigo, salvo a uno mismo (a la mitad).
      if (v !== p.dueno && v.equipo === p.dueno.equipo) continue;
      _q.set(v.pos.x, v.pos.y + 1, v.pos.z);
      const dd = _q.distanceTo(p.pos);
      if (dd > radio) continue;
      _n.copy(p.pos); _n.y += 0.25;
      if (!J.mapa.visible(_n, _q)) continue;
      let n = dano * Math.pow(1 - dd / radio, 0.7);
      if (v === p.dueno) n *= 0.5;
      if (n > 1) J.danar(p.dueno, v, n, { arma, empuje: [(_q.x - p.pos.x) / (dd || 1) * 7, 4.5, (_q.z - p.pos.z) / (dd || 1) * 7] });
    }
  }
}

export function rayoEsfera(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : Infinity;
}
