// Mapa «Azotea al atardecer»: cajas sencillas fusionadas por zonas (pocas llamadas de dibujo),
// colisiones AABB con rejilla espacial, rayos y una rejilla de navegación para los bots.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { materialToon, materialContornoCaja, pintar } from './render.js';

const C = {
  suelo1: 0xE9D3C6, suelo2: 0xDFC6BA, muro: 0xF6E7DA, tapa: 0xB9A6E8,
  aire: 0xBFD9EC, caja: 0xF0A877, casa: 0xFBF0E6, puerta: 0x5B4B9A,
  maceta: 0xC98F7A, arbusto: 0x8FD3A6, deposito: 0x9ED0E6, patas: 0x7B6BB0,
  maquina: 0xFF6F91, panel: 0xFFF2B8, escalon: 0xEADBEE,
};

export const LIMITES = { x: 16, z: 26 };

// Cada pieza: [x, yBase, z, ancho, alto, fondo, color, opciones]
// Solo se define media azotea; la otra mitad es simétrica (giro de 180º) para que sea justo.
function mitad() {
  const p = [];
  const caja = (x, y, z, w, h, d, c, o = {}) => p.push([x, y, z, w, h, d, c, o]);
  // Cobertura junto a la salida.
  caja(0, 0, 19.5, 6, 1.5, 0.7, C.muro, { tapa: true });
  caja(-6, 0, 22, 0.7, 1.5, 3, C.muro, { tapa: true });
  // Caseta de la escalera, con escalones para subir a su tejado (puesto de francotirador).
  caja(-10, 0, 14, 6, 3.4, 5, C.casa);
  caja(-10, 0.6, 16.52, 1.2, 2.2, 0.06, C.puerta, { solido: false, contorno: false });
  for (let i = 0; i < 8; i++) caja(-6.5, 0, 12.0 + i * 0.5, 0.8, 0.425 * (i + 1), 0.5, C.escalon, { contorno: i === 7 });
  // Aires acondicionados y cajas.
  caja(8, 0, 16, 2.4, 1.5, 1.6, C.aire);
  caja(8.6, 1.5, 16, 1, 0.35, 1, C.patas, { solido: false });
  caja(4.5, 0, 9, 1.6, 1.2, 1.6, C.aire);
  caja(-3, 0, 8.5, 1.2, 1.2, 1.2, C.caja);
  caja(-1.8, 0, 8.5, 1.2, 1.2, 1.2, C.caja);
  caja(-2.4, 1.2, 8.5, 1.2, 1.2, 1.2, C.caja);
  // Muro lateral largo.
  caja(12.5, 0, 6, 0.7, 1.3, 8, C.muro, { tapa: true });
  // Maceteros con arbustos (solo la maceta es sólida).
  caja(-11, 0, 4, 3.2, 0.9, 1.2, C.maceta);
  caja(-11.8, 0.9, 4, 1.4, 0.7, 1, C.arbusto, { solido: false, redondo: true });
  caja(-10.3, 0.9, 4, 1.2, 0.6, 0.9, C.arbusto, { solido: false, redondo: true });
  // Máquina expendedora junto a la caseta.
  caja(-6.2, 0, 17.6, 1.2, 2, 0.9, C.maquina);
  caja(-6.2, 1, 17.13, 0.9, 0.7, 0.04, C.panel, { solido: false, contorno: false });
  // Cobertura media.
  caja(6, 0, 2.5, 3, 1.1, 0.7, C.muro, { tapa: true });
  return p;
}

function centro() {
  const p = [];
  const caja = (x, y, z, w, h, d, c, o = {}) => p.push([x, y, z, w, h, d, c, o]);
  // Depósito de agua sobre patas: se puede pasar por debajo.
  for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) caja(x, 0, z, 0.35, 2.4, 0.35, C.patas);
  caja(0, 2.4, 0, 4.2, 0.35, 4.2, C.patas);
  caja(0, 2.75, 0, 3.4, 2.6, 3.4, C.deposito, { cilindro: true });
  // Muretes a los lados del depósito.
  caja(-6, 0, 0, 0.7, 1.2, 3.2, C.muro, { tapa: true });
  caja(6, 0, 0, 0.7, 1.2, 3.2, C.muro, { tapa: true });
  return p;
}

function bordes() {
  const p = [];
  const { x: X, z: Z } = LIMITES;
  const t = 0.6, h = 1.15;
  p.push([0, 0, Z + t / 2, X * 2 + t * 2, h, t, C.muro, { tapa: true }]);
  p.push([0, 0, -Z - t / 2, X * 2 + t * 2, h, t, C.muro, { tapa: true }]);
  p.push([X + t / 2, 0, 0, t, h, Z * 2, C.muro, { tapa: true }]);
  p.push([-X - t / 2, 0, 0, t, h, Z * 2, C.muro, { tapa: true }]);
  // Paredes invisibles: nadie se cae de la azotea.
  for (const [x, z, w, d] of [[0, Z + 0.3, X * 2, 0.6], [0, -Z - 0.3, X * 2, 0.6], [X + 0.3, 0, 0.6, Z * 2], [-X - 0.3, 0, 0.6, Z * 2]]) {
    p.push([x, 0, z, w, 8, d, 0, { visible: false }]);
  }
  return p;
}

export class Mapa {
  constructor(escena) {
    this.escena = escena;
    this.cajas = []; // AABB sólidas: {min: Vector3, max: Vector3}
    this.grupo = new THREE.Group();
    escena.add(this.grupo);

    const piezas = [...bordes(), ...centro()];
    for (const pz of mitad()) {
      piezas.push(pz);
      const [x, y, z, w, h, d, c, o] = pz;
      piezas.push([-x, y, -z, w, h, d, c, o]); // simétrico
    }
    this.piezas = piezas;
    this._construir();
    this._rejilla();
    this._navegacion();
    this._skyline();
    this._saltadores();
    this.dinamicas = []; // muros de hielo temporales: {min, max, malla, fin, id}
  }

  // Saltadores: discos que te lanzan al tejado de la caseta o encima del depósito.
  _saltadores() {
    this.listaSaltadores = [];
    const datos = [
      [0, 4.6, 0, -1, 16.2], [0, -4.6, 0, 1, 16.2],
      [-10.5, 9.2, 0, 1, 13.4], [10.5, -9.2, 0, -1, 13.4],
    ];
    const disco = new THREE.CylinderGeometry(0.85, 0.95, 0.12, 20).translate(0, 0.06, 0);
    const matDisco = new THREE.MeshBasicMaterial({ color: 0x3EE0FF });
    const anilloGeo = new THREE.RingGeometry(0.55, 0.75, 24).rotateX(-Math.PI / 2);
    this.anillos = [];
    for (const [x, z, dx, dz, fuerza] of datos) {
      const m = new THREE.Mesh(disco, matDisco);
      m.position.set(x, 0, z);
      const borde = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.08, 20).translate(0, 0.04, 0), materialContornoCaja);
      m.add(borde);
      const flecha = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 3).rotateX(dz > 0 ? Math.PI / 2 : -Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xFFF7EE }));
      flecha.position.y = 0.2;
      m.add(flecha);
      this.grupo.add(m);
      const anillo = new THREE.Mesh(anilloGeo, new THREE.MeshBasicMaterial({ color: 0x3EE0FF, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      anillo.position.set(x, 0.15, z);
      this.grupo.add(anillo);
      this.anillos.push(anillo);
      this.listaSaltadores.push({ x, z, dir: new THREE.Vector3(dx, 0, dz), fuerza });
    }
  }

  saltador(p) {
    if (p.y > 0.2) return null;
    for (const s of this.listaSaltadores) if ((p.x - s.x) ** 2 + (p.z - s.z) ** 2 < 0.8) return s;
    return null;
  }

  actualizar(t, dt) {
    for (let i = 0; i < this.anillos.length; i++) {
      const a = this.anillos[i], k = (t * 0.9 + i * 0.25) % 1;
      a.position.y = 0.15 + k * 2.2;
      a.scale.setScalar(1 + k * 0.4);
      a.material.opacity = 0.8 * (1 - k);
    }
    for (let i = this.dinamicas.length - 1; i >= 0; i--) {
      const d = this.dinamicas[i];
      d.vida -= dt;
      const k = Math.min(1, (d.total - d.vida) * 6);
      d.malla.scale.y = Math.max(0.01, k * Math.min(1, d.vida * 3));
      if (d.vida <= 0) { this.grupo.remove(d.malla); d.malla.geometry.dispose(); this.dinamicas.splice(i, 1); }
    }
  }

  // Muro de hielo alineado con los ejes (las colisiones son AABB).
  agregarMuro(x, z, alongX, duracion = 6) {
    const w = alongX ? 4.4 : 0.6, d = alongX ? 0.6 : 4.4, h = 2.6;
    const min = new THREE.Vector3(x - w / 2, 0, z - d / 2), max = new THREE.Vector3(x + w / 2, h, z + d / 2);
    const geo = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    const malla = new THREE.Mesh(geo, matHielo);
    malla.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, d + 0.08).translate(0, h / 2, 0), materialContornoCaja));
    malla.position.set(x, 0, z);
    malla.scale.y = 0.01;
    this.grupo.add(malla);
    this.dinamicas.push({ min, max, malla, vida: duracion, total: duracion });
  }

  limpiarDinamicas() {
    for (const d of this.dinamicas) { this.grupo.remove(d.malla); d.malla.geometry.dispose(); }
    this.dinamicas.length = 0;
  }

  _construir() {
    // Agrupamos por zonas de 12 m: cada zona es UNA malla y UN contorno, y Three.js
    // descarta automáticamente las zonas que quedan fuera de la vista de la cámara.
    const zonas = new Map();
    const zona = (x, z) => {
      const k = `${Math.floor(x / 12)},${Math.floor(z / 12)}`;
      if (!zonas.has(k)) zonas.set(k, { solidos: [], contornos: [] });
      return zonas.get(k);
    };

    for (const [x, y, z, w, h, d, color, o] of this.piezas) {
      if (o.solido !== false) {
        this.cajas.push({ min: new THREE.Vector3(x - w / 2, y, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h, z + d / 2) });
      }
      if (o.visible === false) continue;
      const zn = zona(x, z);
      let g;
      if (o.cilindro) g = new THREE.CylinderGeometry(w / 2, w / 2, h, 16, 1);
      else if (o.redondo) g = new THREE.SphereGeometry(0.5, 10, 7).scale(w, h * 1.4, d);
      else g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y + h / 2, z);
      zn.solidos.push(pintar(g, color));
      if (o.tapa) { // remate de color en lo alto de los muros
        const t = new THREE.BoxGeometry(w + 0.08, 0.12, d + 0.08).translate(x, y + h + 0.06, z);
        zn.solidos.push(pintar(t, C.tapa));
      }
      if (o.contorno !== false) {
        const e = 0.045;
        let hull;
        if (o.cilindro) hull = new THREE.CylinderGeometry(w / 2 + e, w / 2 + e, h + e * 2, 16, 1);
        else if (o.redondo) hull = new THREE.SphereGeometry(0.5, 10, 7).scale(w + e * 2, h * 1.4 + e * 2, d + e * 2);
        else hull = new THREE.BoxGeometry(w + e * 2, h + e * 2 + (o.tapa ? 0.12 : 0), d + e * 2);
        hull.translate(x, y + h / 2 + (o.tapa ? 0.06 : 0), z);
        hull.deleteAttribute('uv'); hull.deleteAttribute('normal');
        zn.contornos.push(hull);
      }
    }

    // Suelo en baldosas grandes de dos tonos (también por zonas).
    const { x: X, z: Z } = LIMITES;
    for (let x = -X; x < X; x += 4) {
      for (let z = -Z; z < Z; z += 4) {
        const w = Math.min(4, X - x), d = Math.min(4, Z - z);
        const g = new THREE.BoxGeometry(w, 0.4, d).translate(x + w / 2, -0.2, z + d / 2);
        zona(x + w / 2, z + d / 2).solidos.push(pintar(g, (Math.round((x + X) / 4) + Math.round((z + Z) / 4)) % 2 === 0 ? C.suelo1 : C.suelo2));
      }
    }
    this.cajas.push({ min: new THREE.Vector3(-X - 2, -1, -Z - 2), max: new THREE.Vector3(X + 2, 0, Z + 2) });

    const matToon = materialToon();
    this.zonas = [];
    for (const zn of zonas.values()) {
      for (const g of zn.solidos) { g.deleteAttribute('uv'); }
      const malla = new THREE.Mesh(mergeGeometries(zn.solidos), matToon);
      malla.castShadow = true; malla.receiveShadow = true;
      malla.matrixAutoUpdate = false;
      this.grupo.add(malla);
      this.zonas.push(malla);
      if (zn.contornos.length) {
        const c = new THREE.Mesh(mergeGeometries(zn.contornos), materialContornoCaja);
        c.matrixAutoUpdate = false;
        this.grupo.add(c);
      }
      for (const g of [...zn.solidos, ...zn.contornos]) g.dispose();
    }
  }

  // Ciudad de fondo: una sola malla, sin luces ni sombras, que la niebla funde con el cielo.
  _skyline() {
    const geos = [];
    const tonos = [0xB49BE0, 0xC7A6DE, 0xA28BD6, 0xD7A9CF];
    let semilla = 7;
    const r = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, dist = 55 + r() * 70;
      const w = 6 + r() * 12, d = 6 + r() * 12, h = 15 + r() * 55;
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      const base = -38;
      geos.push(pintar(new THREE.BoxGeometry(w, h, d).translate(x, base + h / 2, z), tonos[i % 4]));
      // Ventanas encendidas en franjas (sensación de ciudad al atardecer).
      if (r() < 0.5) {
        for (let k = 0; k < 3; k++) {
          const y = base + h * (0.3 + k * 0.2);
          geos.push(pintar(new THREE.BoxGeometry(w + 0.1, 0.5, d + 0.1).translate(x, y, z), 0xFFE2A8));
        }
      }
    }
    for (const g of geos) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); }
    const malla = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
    malla.matrixAutoUpdate = false;
    this.grupo.add(malla);
    for (const g of geos) g.dispose();
  }

  // ---------- Colisiones ----------
  _rejilla() {
    this.celda = 4;
    this.indice = new Map();
    this.cajas.forEach((c, i) => {
      for (let x = Math.floor(c.min.x / this.celda); x <= Math.floor(c.max.x / this.celda); x++) {
        for (let z = Math.floor(c.min.z / this.celda); z <= Math.floor(c.max.z / this.celda); z++) {
          const k = x * 1000 + z;
          if (!this.indice.has(k)) this.indice.set(k, []);
          this.indice.get(k).push(i);
        }
      }
    });
    this._vistos = new Uint32Array(this.cajas.length);
    this._marca = 0;
  }

  // Cajas que tocan el rectángulo XZ dado (sin repetir).
  cercanas(minX, minZ, maxX, maxZ, salida) {
    salida.length = 0;
    this._marca++;
    for (let x = Math.floor(minX / this.celda); x <= Math.floor(maxX / this.celda); x++) {
      for (let z = Math.floor(minZ / this.celda); z <= Math.floor(maxZ / this.celda); z++) {
        const l = this.indice.get(x * 1000 + z);
        if (!l) continue;
        for (const i of l) { if (this._vistos[i] !== this._marca) { this._vistos[i] = this._marca; salida.push(this.cajas[i]); } }
      }
    }
    for (const d of this.dinamicas) if (d.max.x >= minX && d.min.x <= maxX && d.max.z >= minZ && d.min.z <= maxZ) salida.push(d);
    return salida;
  }

  // Rayo contra todas las cajas (método de las franjas). Devuelve la distancia o Infinity.
  rayo(o, d, max = 200, normal = null) {
    let mejor = max, eje = -1, signo = 0;
    const n0 = this.cajas.length, total = n0 + this.dinamicas.length;
    for (let ci = 0; ci < total; ci++) {
      const c = ci < n0 ? this.cajas[ci] : this.dinamicas[ci - n0];
      let tmin = 0, tmax = mejor, e = -1, s = 0;
      let ok = true;
      for (let a = 0; a < 3; a++) {
        const k = a === 0 ? 'x' : a === 1 ? 'y' : 'z';
        const od = d[k], oo = o[k];
        if (Math.abs(od) < 1e-9) { if (oo < c.min[k] || oo > c.max[k]) { ok = false; break; } continue; }
        let t1 = (c.min[k] - oo) / od, t2 = (c.max[k] - oo) / od;
        let sg = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sg = 1; }
        if (t1 > tmin) { tmin = t1; e = a; s = sg; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
      if (ok && tmin < mejor && tmin > 0) { mejor = tmin; eje = e; signo = s; }
    }
    if (normal) { normal.set(0, 0, 0); if (eje >= 0) normal.setComponent(eje, signo); }
    return mejor < max ? mejor : Infinity;
  }

  // ¿Se ven dos puntos?
  visible(a, b) {
    const d = _v.subVectors(b, a);
    const l = d.length();
    d.divideScalar(l);
    return this.rayo(a, d, l) === Infinity;
  }

  // ---------- Navegación ----------
  _navegacion() {
    const paso = 1.5;
    const nodos = [];
    const libre = (x, z) => {
      const r = 0.45;
      for (const c of this.cajas) {
        if (c.max.y <= 0.05 || c.min.y > 1.7) continue;
        if (x + r > c.min.x && x - r < c.max.x && z + r > c.min.z && z - r < c.max.z) return false;
      }
      return true;
    };
    const cols = Math.floor((LIMITES.x * 2 - 1) / paso) + 1, filas = Math.floor((LIMITES.z * 2 - 1) / paso) + 1;
    const id = new Int32Array(cols * filas).fill(-1);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < filas; j++) {
        const x = -LIMITES.x + 0.5 + i * paso, z = -LIMITES.z + 0.5 + j * paso;
        if (!libre(x, z)) continue;
        id[i * filas + j] = nodos.length;
        nodos.push({ x, z, v: [], cobertura: false });
      }
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < filas; j++) {
        const a = id[i * filas + j];
        if (a < 0) continue;
        for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          const ni = i + di, nj = j + dj;
          if (ni >= cols || nj < 0 || nj >= filas) continue;
          const b = id[ni * filas + nj];
          if (b < 0) continue;
          const A = nodos[a], B = nodos[b];
          if (!libre((A.x + B.x) / 2, (A.z + B.z) / 2)) continue;
          if (di && dj && (id[ni * filas + j] < 0 || id[i * filas + nj] < 0)) continue; // sin cortar esquinas
          const c = Math.hypot(A.x - B.x, A.z - B.z);
          A.v.push(b, c); B.v.push(a, c);
        }
        // Cobertura: un obstáculo alto pegado al nodo.
        const n = nodos[a];
        for (const c of this.cajas) {
          if (c.max.y < 1.1 || c.min.y > 0.5 || c.max.y > 7) continue;
          if (n.x > c.min.x - 1.2 && n.x < c.max.x + 1.2 && n.z > c.min.z - 1.2 && n.z < c.max.z + 1.2) { n.cobertura = true; break; }
        }
      }
    }
    this.nodos = nodos;
  }

  nodoCercano(x, z) {
    let mejor = -1, md = Infinity;
    for (let i = 0; i < this.nodos.length; i++) {
      const n = this.nodos[i];
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < md) { md = d; mejor = i; }
    }
    return mejor;
  }

  // A* sobre la rejilla. Devuelve una lista de puntos {x, z}.
  ruta(x0, z0, x1, z1) {
    const a = this.nodoCercano(x0, z0), b = this.nodoCercano(x1, z1);
    if (a < 0 || b < 0) return [];
    const N = this.nodos;
    const g = new Float32Array(N.length).fill(Infinity), de = new Int32Array(N.length).fill(-1);
    const cerrado = new Uint8Array(N.length);
    const abierta = [a];
    g[a] = 0;
    const h = (i) => Math.hypot(N[i].x - N[b].x, N[i].z - N[b].z);
    while (abierta.length) {
      let bi = 0, bf = Infinity;
      for (let k = 0; k < abierta.length; k++) { const f = g[abierta[k]] + h(abierta[k]); if (f < bf) { bf = f; bi = k; } }
      const actual = abierta[bi];
      abierta[bi] = abierta[abierta.length - 1]; abierta.pop();
      if (actual === b) break;
      cerrado[actual] = 1;
      const v = N[actual].v;
      for (let k = 0; k < v.length; k += 2) {
        const n = v[k], ng = g[actual] + v[k + 1];
        if (cerrado[n] || ng >= g[n]) continue;
        if (g[n] === Infinity) abierta.push(n);
        g[n] = ng; de[n] = actual;
      }
    }
    const camino = [];
    for (let i = b; i >= 0; i = de[i]) { camino.push(N[i]); if (i === a) break; }
    return camino.reverse();
  }

  // Aparición: el punto más alejado de los rivales vivos (con algo de azar para no ser previsible).
  aparicionLibre(rivales, out = new THREE.Vector3()) {
    let mejor = APARICIONES[0], mv = -Infinity;
    for (const a of APARICIONES) {
      let md = 60;
      for (const r of rivales) if (r.vivo) md = Math.min(md, Math.hypot(r.pos.x - a[0], r.pos.z - a[1]));
      const v = md + Math.random() * 6;
      if (v > mv) { mv = v; mejor = a; }
    }
    out.set(mejor[0], 0, mejor[1]);
    // Mirando hacia el centro.
    return { pos: out, yaw: Math.atan2(out.x, out.z) };
  }
}

const _v = new THREE.Vector3();
const matHielo = new THREE.MeshToonMaterial({ color: 0xBFEFFF, emissive: 0x3A8FC0, emissiveIntensity: 0.25, transparent: true, opacity: 0.85 });
const APARICIONES = [
  [0, 23.5], [0, -23.5], [-13, 22.5], [13, -22.5], [13, 21], [-13, -21],
  [-14.2, -1], [14.2, 1], [10, 10], [-10, -10], [-2.5, 13], [2.5, -13],
];
