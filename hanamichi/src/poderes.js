// Poderes de los héroes. Quien lanza el poder calcula el efecto y avisa a los demás por red con los
// parámetros (origen, destino...), así todos ven lo mismo. El daño lo aplica solo el dueño del poder.
import * as THREE from 'three';
import { HEROES, CARGA_DEFINITIVA } from './heroes.js';
import { materialContorno, rampa } from './render.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _n = new THREE.Vector3();
const MAX_PROY = 14;

export class Poderes {
  constructor(juego) {
    this.j = juego;
    const escena = juego.render.escena;
    const mat = new THREE.MeshToonMaterial({ color: 0xFFB04D, emissive: 0xFF5A2A, emissiveIntensity: 0.9, gradientMap: rampa });
    const geo = new THREE.IcosahedronGeometry(0.28, 1);
    this.proy = Array.from({ length: MAX_PROY }, () => {
      const m = new THREE.Mesh(geo, mat);
      m.add(new THREE.Mesh(geo, materialContorno));
      m.visible = false;
      escena.add(m);
      return { activo: false, malla: m, pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, dueno: null, tipo: 'bola', retraso: 0 };
    });
    // Ventiscas: cilindro translúcido.
    this.zonas = [];
    this.geoZona = new THREE.CylinderGeometry(1, 1, 5, 28, 1, true).translate(0, 2.5, 0);
    this.matZona = new THREE.MeshBasicMaterial({ color: 0xCFF3FF, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  }

  limpiar() {
    for (const p of this.proy) { p.activo = false; p.malla.visible = false; }
    for (const z of this.zonas) this.j.render.escena.remove(z.malla);
    this.zonas.length = 0;
  }

  // ranura: 'q' | 'e' | 'x'. Devuelve true si se ha usado.
  usar(c, ranura) {
    if (!c.vivo) return false;
    const H = HEROES[c.heroe];
    const def = H[ranura];
    if (ranura === 'q' && c.cdQ > 0) return false;
    if (ranura === 'e' && c.cdE > 0) return false;
    if (ranura === 'x' && c.carga < CARGA_DEFINITIVA) return false;
    const datos = this._preparar(c, def.id);
    if (!datos) return false;
    if (ranura === 'q') c.cdQ = def.cd;
    if (ranura === 'e') c.cdE = def.cd;
    if (ranura === 'x') c.carga = 0;
    c.protegido = 0;
    c.lanzando = 1;
    this.ejecutar(c, def.id, datos, true);
    this.j.enviarFx({ k: 'poder', id: c.id, h: def.id, d: datos });
    return true;
  }

  // Aterrizaje del Salto trueno (lo detecta el dueño tras la física).
  aterrizajeTrueno(c) {
    c.trueno = false;
    const r = (v) => Math.round(v * 100) / 100;
    const d = { x: r(c.pos.x), y: r(c.pos.y), z: r(c.pos.z) };
    this.ejecutar(c, 'golpe', d, true);
    this.j.enviarFx({ k: 'poder', id: c.id, h: 'golpe', d });
  }

  _ojo(c, out) { return out.set(c.pos.x, c.pos.y + c.ojos, c.pos.z); }

  // Calcula los parámetros del poder (solo quien lo lanza).
  _preparar(c, id) {
    const mapa = this.j.mapa;
    this._ojo(c, _o); c.direccion(_d);
    const r = (v) => Math.round(v * 100) / 100;
    switch (id) {
      case 'destello': {
        _q.set(_d.x, 0, _d.z).normalize();
        _p.set(c.pos.x, c.pos.y + 0.9, c.pos.z);
        const t = Math.min(9, mapa.rayo(_p, _q, 9.6) - 0.7);
        if (t < 1) return null;
        return { a: [r(c.pos.x), r(c.pos.y), r(c.pos.z)], b: [r(c.pos.x + _q.x * t), r(c.pos.y + 0.05), r(c.pos.z + _q.z * t)] };
      }
      case 'rayo': {
        const imp = this._rayoCombatientes(c, _o, _d, 60, 0.55);
        const tm = mapa.rayo(_o, _d, 60);
        const t = Math.min(tm, imp ? imp.t : Infinity, 60);
        _p.copy(_o).addScaledVector(_d, t);
        return { b: [r(_p.x), r(_p.y), r(_p.z)], v: imp && imp.t < tm ? imp.c.id : null, cab: imp?.cabeza ? 1 : 0 };
      }
      case 'juicio': {
        const vs = [];
        for (const o of this.j.combatientes) {
          if (o === c || !o.vivo || o.pos.distanceTo(c.pos) > 45) continue;
          _p.set(o.pos.x, o.pos.y + 1.2, o.pos.z);
          if (mapa.visible(_o, _p)) vs.push(o.id);
        }
        return { v: vs };
      }
      case 'muro': {
        _q.set(_d.x, 0, _d.z).normalize();
        const t = Math.min(3.5, mapa.rayo(_o, _q, 4) - 0.6);
        const x = c.pos.x + _q.x * Math.max(1.2, t), z = c.pos.z + _q.z * Math.max(1.2, t);
        return { x: r(x), z: r(z), ax: Math.abs(_q.z) >= Math.abs(_q.x) ? 1 : 0 };
      }
      case 'ventisca': case 'meteoro': {
        const t = Math.min(mapa.rayo(_o, _d, 40), 40);
        _p.copy(_o).addScaledVector(_d, t);
        _p.y = 0;
        const base = mapa.rayo(_q.set(_p.x, 8, _p.z), _n.set(0, -1, 0), 20);
        if (base !== Infinity) _p.y = 8 - base;
        const res = { x: r(_p.x), y: r(_p.y), z: r(_p.z) };
        if (id === 'meteoro') res.o = Array.from({ length: 6 }, () => [r((Math.random() - 0.5) * 8), r((Math.random() - 0.5) * 8)]);
        return res;
      }
      case 'bola': {
        _p.copy(_o).addScaledVector(_d, 0.7);
        return { o: [r(_p.x), r(_p.y), r(_p.z)], d: [r(_d.x), r(_d.y), r(_d.z)] };
      }
      default: return {};
    }
  }

  // Aplica el efecto. `dueno`: true en la máquina de quien lo lanza (aplica daño y movimiento).
  ejecutar(c, id, d, dueno) {
    const J = this.j, ef = J.efectos, au = J.audio;
    const dist = J.distOyente(c.pos);
    const esYo = c === J.jugador;
    if (esYo) J.vista.poder();
    switch (id) {
      case 'destello': {
        _o.set(d.a[0], d.a[1] + 1, d.a[2]); _p.set(d.b[0], d.b[1] + 1, d.b[2]);
        for (let i = 0; i < 6; i++) { _q.lerpVectors(_o, _p, i / 5); ef.chispa(_q, null, 0xFF8FB8, 4, 2.5); }
        ef.trazo(_o, _p, 0xFFB8D4, 0.3);
        if (dueno) {
          c.pos.set(d.b[0], d.b[1], d.b[2]);
          _q.set(d.b[0] - d.a[0], 0, d.b[2] - d.a[2]).normalize();
          c.vel.x = _q.x * 9; c.vel.z = _q.z * 9;
          if (esYo) J.camara.patada = 1;
        }
        au.destello(dist);
        break;
      }
      case 'petalos': {
        if (dueno) c.curando = 60;
        if (!esYo) { _p.set(c.pos.x, c.pos.y + 1, c.pos.z); ef.chispa(_p, null, 0xFFB8D4, 30, 3); }
        au.curar(dist);
        break;
      }
      case 'tormenta': {
        if (dueno) { c.ult = 8; for (const k in c.arsenal.municion) c.arsenal.municion[k] = Math.max(c.arsenal.municion[k], 0); }
        _p.set(c.pos.x, c.pos.y + 0.1, c.pos.z);
        if (!esYo) { ef.explosion(_p, 3, 'onda'); ef.chispa(_p, null, 0xFF8FB8, 40, 6); }
        au.definitiva(dist);
        if (esYo) J.ui.aviso('¡Tormenta Sakura!', '', 'gana');
        break;
      }
      case 'rayo': {
        this._mano(c, _o);
        _p.set(d.b[0], d.b[1], d.b[2]);
        ef.rayo(_o, _p, 0x9BEFFF);
        au.rayo(dist);
        if (dueno && d.v) { const v = J.porId(d.v); if (v) J.danar(c, v, d.cab ? 65 : 50, { cabeza: !!d.cab, arma: 'rayo' }); }
        break;
      }
      case 'trueno': {
        if (dueno) {
          c.direccion(_d); _d.y = 0; _d.normalize();
          c.vel.y = 13.5; c.suelo = false; c.vel.x += _d.x * 6; c.vel.z += _d.z * 6;
          c.trueno = true;
        }
        _p.set(c.pos.x, c.pos.y + 0.05, c.pos.z);
        ef.chispa(_p, null, 0x9BEFFF, 20, 5);
        au.rayo(dist);
        break;
      }
      case 'golpe': { // aterrizaje del Salto trueno
        _p.set(d.x, d.y + 0.1, d.z);
        ef.explosion(_p, 6, 'onda');
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          _q.set(_p.x + Math.cos(a) * 5, _p.y, _p.z + Math.sin(a) * 5);
          ef.rayo(_p, _q, 0x9BEFFF, 4);
        }
        au.explosion(dist);
        if (esYo || J.distOyente(_p) < 8) J.camara.sacudida = Math.min(1, J.camara.sacudida + 0.6);
        if (dueno) this._area(c, _p, 6, 60, 'trueno', 7);
        break;
      }
      case 'juicio': {
        au.definitiva(dist);
        for (const vid of d.v) {
          const v = J.porId(vid);
          if (!v) continue;
          _p.set(v.pos.x, v.pos.y + 1.1, v.pos.z);
          _o.set(v.pos.x + (Math.random() - 0.5) * 3, v.pos.y + 26, v.pos.z + (Math.random() - 0.5) * 3);
          ef.rayo(_o, _p, 0x9BEFFF, 10);
          ef.explosion(_p, 2.5, 'onda');
          if (dueno) J.danar(c, v, 90, { arma: 'juicio' });
        }
        if (esYo) J.ui.aviso('¡Juicio de Raijin!', d.v.length ? '' : 'No hay rivales a la vista', 'gana');
        break;
      }
      case 'muro': {
        J.mapa.agregarMuro(d.x, d.z, !!d.ax, 6);
        _p.set(d.x, 1, d.z);
        ef.chispa(_p, null, 0xD8F6FF, 30, 5);
        au.hielo(dist);
        break;
      }
      case 'escudo': {
        if (dueno) { c.escudo = 60; c.tEscudo = 6; }
        if (!esYo) { _p.set(c.pos.x, c.pos.y + 1, c.pos.z); ef.chispa(_p, null, 0xD8F6FF, 30, 3); }
        au.hielo(dist);
        break;
      }
      case 'ventisca': {
        const malla = new THREE.Mesh(this.geoZona, this.matZona);
        malla.position.set(d.x, d.y, d.z);
        malla.scale.set(0.1, 1, 0.1);
        J.render.escena.add(malla);
        this.zonas.push({ dueno: c.id, pos: new THREE.Vector3(d.x, d.y, d.z), radio: 9, vida: 5, malla, acum: new Map() });
        au.definitiva(dist);
        if (esYo) J.ui.aviso('¡Ventisca!', '', 'gana');
        break;
      }
      case 'bola': {
        this._lanzar(c, 'bola', _o.set(...d.o), _d.set(...d.d).multiplyScalar(34), 0);
        au.fuego(dist);
        break;
      }
      case 'impulso': {
        _p.set(c.pos.x, c.pos.y + 0.1, c.pos.z);
        ef.explosion(_p, 3, 'fuego');
        au.explosion(dist + 6);
        if (dueno) {
          c.direccion(_d); _d.y = 0; _d.normalize();
          c.vel.y = 12.5; c.suelo = false; c.vel.x = _d.x * 10; c.vel.z = _d.z * 10;
          this._area(c, _p, 3.2, 30, 'impulso', 5);
          if (esYo) J.camara.patada = 0.8;
        }
        break;
      }
      case 'meteoro': {
        d.o.forEach(([ox, oz], i) => {
          _o.set(d.x + ox + 6, d.y + 34, d.z + oz - 4);
          _q.set(d.x + ox, d.y, d.z + oz);
          _d.subVectors(_q, _o).normalize().multiplyScalar(42);
          this._lanzar(c, 'meteoro', _o, _d, 0.35 + i * 0.28);
        });
        au.definitiva(dist);
        if (esYo) J.ui.aviso('¡Lluvia de meteoros!', '', 'gana');
        break;
      }
    }
  }

  _mano(c, out) {
    c.direccion(_d);
    out.set(c.pos.x, c.pos.y + c.ojos - 0.2, c.pos.z).addScaledVector(_d, 0.5);
    out.x += Math.cos(c.yaw) * -0.25; out.z += -Math.sin(c.yaw) * -0.25;
    return out;
  }

  _lanzar(c, tipo, pos, vel, retraso) {
    const p = this.proy.find((x) => !x.activo);
    if (!p) return;
    p.activo = true; p.tipo = tipo; p.dueno = c; p.t = 0; p.retraso = retraso;
    p.pos.copy(pos); p.vel.copy(vel);
    p.malla.scale.setScalar(tipo === 'meteoro' ? 2.2 : 1);
    p.malla.visible = retraso <= 0;
    p.malla.position.copy(pos);
  }

  // Daño en área (con caída) a todos los rivales vivos con línea de visión desde el centro.
  _area(c, centro, radio, dano, arma, empuje = 6) {
    const J = this.j;
    for (const v of J.combatientes) {
      if (!v.vivo || v === c) continue;
      _q.set(v.pos.x, v.pos.y + 1, v.pos.z);
      const dd = _q.distanceTo(centro);
      if (dd > radio) continue;
      _n.copy(centro); _n.y += 0.3;
      if (!J.mapa.visible(_n, _q)) continue;
      const k = 1 - (dd / radio) * 0.5;
      J.danar(c, v, Math.round(dano * k), { arma, empuje: [(_q.x - centro.x) / (dd || 1) * empuje, 4, (_q.z - centro.z) / (dd || 1) * empuje] });
    }
  }

  // ---------- Bucle ----------
  actualizar(dt) {
    const J = this.j, mapa = J.mapa, ef = J.efectos;
    for (const p of this.proy) {
      if (!p.activo) continue;
      if (p.retraso > 0) { p.retraso -= dt; if (p.retraso <= 0) p.malla.visible = true; continue; }
      p.t += dt;
      if (p.tipo === 'bola') p.vel.y -= 3 * dt;
      const paso = p.vel.length() * dt;
      _d.copy(p.vel).normalize();
      let t = mapa.rayo(p.pos, _d, paso + 0.25);
      let golpe = t !== Infinity;
      // Contacto directo con un rival.
      if (!golpe) {
        for (const v of J.combatientes) {
          if (!v.vivo || v === p.dueno) continue;
          _q.set(v.pos.x, v.pos.y + 1, v.pos.z);
          if (_q.distanceToSquared(p.pos) < 0.8) { golpe = true; t = 0; break; }
        }
      }
      if (golpe) { if (t !== Infinity) p.pos.addScaledVector(_d, Math.max(0, t - 0.1)); this._estallar(p); continue; }
      p.pos.addScaledVector(p.vel, dt);
      p.malla.position.copy(p.pos);
      p.malla.rotation.x += dt * 9; p.malla.rotation.y += dt * 7;
      ef.chispa(p.pos, null, p.tipo === 'meteoro' ? 0xFF7A4D : 0xFFB04D, p.tipo === 'meteoro' ? 3 : 2, 1.5);
      if (p.t > 4) this._estallar(p);
    }

    for (let i = this.zonas.length - 1; i >= 0; i--) {
      const z = this.zonas[i];
      z.vida -= dt;
      const k = Math.min(1, (5 - z.vida) * 4) * Math.min(1, z.vida * 2);
      z.malla.scale.set(z.radio * Math.max(0.05, k), 1, z.radio * Math.max(0.05, k));
      z.malla.rotation.y += dt * 2;
      // Nieve girando dentro.
      for (let n = 0; n < 3; n++) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * z.radio;
        _p.set(z.pos.x + Math.cos(a) * rr, z.pos.y + Math.random() * 4, z.pos.z + Math.sin(a) * rr);
        ef.chispa(_p, null, 0xFFFFFF, 1, 1.5);
      }
      // Efecto sobre las entidades de esta máquina (cada dueño se lo aplica a las suyas).
      for (const c of J.combatientes) {
        if (!c.vivo || !J.esLocal(c) || c.id === z.dueno) continue;
        if (Math.hypot(c.pos.x - z.pos.x, c.pos.z - z.pos.z) > z.radio || c.pos.y > z.pos.y + 5) continue;
        c.lento = 0.3;
        const a = (z.acum.get(c.id) || 0) + dt * 30;
        if (a >= 10) {
          z.acum.set(c.id, a - 10);
          const atac = J.porId(z.dueno);
          J.recibirDano(z.dueno, c, 10, { arma: 'ventisca' }, atac?.pos);
        } else z.acum.set(c.id, a);
      }
      if (z.vida <= 0) { J.render.escena.remove(z.malla); this.zonas.splice(i, 1); }
    }
  }

  _estallar(p) {
    const J = this.j;
    p.activo = false; p.malla.visible = false;
    const radio = p.tipo === 'meteoro' ? 4.2 : 4.5;
    J.efectos.explosion(p.pos, radio, 'fuego');
    const dist = J.distOyente(p.pos);
    J.audio.explosion(dist);
    J.camara.sacudida = Math.min(1, J.camara.sacudida + Math.max(0, 1 - dist / 16) * 0.7);
    if (J.esLocal(p.dueno)) this._area(p.dueno, p.pos, radio, p.tipo === 'meteoro' ? 55 : 75, p.tipo, 7);
  }

  // Rayo contra las esferas de impacto de los rivales (con radio extra para poderes).
  _rayoCombatientes(c, o, d, max, extra = 0) {
    let mejor = null;
    for (const v of this.j.combatientes) {
      if (v === c || !v.vivo) continue;
      const imp = v.cajasImpacto();
      for (const [zona, r] of [['cabeza', 0.21], ['pecho', 0.34], ['piernas', 0.3]]) {
        const t = rayoEsfera(o, d, imp[zona], r + extra);
        if (t < max && (!mejor || t < mejor.t)) mejor = { t, c: v, cabeza: zona === 'cabeza' };
      }
    }
    return mejor;
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
