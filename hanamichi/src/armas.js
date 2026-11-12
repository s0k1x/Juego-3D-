// Armas: datos y estado del equipo (munición, recarga, cambio, utilidad). Los modelos 3D están en modelos.js.
// stats (0..100) son solo para las barras del menú.
export const ARMAS = {
  // ---------- Principal ----------
  vector: {
    nombre: 'Fusil Vector', corto: 'Vector', ranura: 'principal', desc: 'Automático y fiable a media distancia. Poco retroceso en ráfagas cortas.',
    auto: true, cadencia: 0.1, dano: 20, cabeza: 1.6, cargador: 30, recarga: 1.7, sacar: 0.4, movilidad: 0.97,
    disp: 0.009, dispMov: 0.022, perdigones: 1, alcance: 120, zoom: 50, retroceso: 0.01, caida: [28, 60, 0.7],
    stats: { dano: 40, cadencia: 78, alcance: 62, movilidad: 70 },
  },
  trueno: {
    nombre: 'Escopeta Trueno', corto: 'Trueno', ranura: 'principal', desc: 'Nueve perdigones por disparo. De cerca lo decide todo.',
    auto: false, cadencia: 0.8, dano: 13, cabeza: 1.25, cargador: 5, recarga: 2.2, sacar: 0.45, movilidad: 0.95,
    disp: 0.065, dispMov: 0.06, perdigones: 9, alcance: 40, zoom: 62, retroceso: 0.05, caida: [8, 22, 0.3],
    stats: { dano: 95, cadencia: 20, alcance: 18, movilidad: 62 },
  },
  aguja: {
    nombre: 'Rifle Aguja', corto: 'Aguja', ranura: 'principal', desc: 'Francotirador de cerrojo. Un tiro a la cabeza basta; apunta con clic derecho.',
    auto: false, cadencia: 1.15, dano: 90, cabeza: 2.2, cargador: 5, recarga: 2.4, sacar: 0.55, movilidad: 0.9,
    disp: 0.001, dispCadera: 0.05, dispMov: 0.08, perdigones: 1, alcance: 220, zoom: 22, retroceso: 0.06, mira: true,
    stats: { dano: 100, cadencia: 10, alcance: 100, movilidad: 40 },
  },
  avispa: {
    nombre: 'Subfusil Avispa', corto: 'Avispa', ranura: 'principal', desc: 'Cadencia altísima y casi sin penalización al correr.',
    auto: true, cadencia: 0.062, dano: 13, cabeza: 1.5, cargador: 36, recarga: 1.5, sacar: 0.32, movilidad: 1.05,
    disp: 0.018, dispMov: 0.012, perdigones: 1, alcance: 70, zoom: 56, retroceso: 0.007, caida: [12, 35, 0.55],
    stats: { dano: 28, cadencia: 100, alcance: 35, movilidad: 92 },
  },
  cometa: {
    nombre: 'Lanzador Cometa', corto: 'Cometa', ranura: 'principal', desc: 'Cohetes lentos que estallan en área. Cuidado: también te dañan a ti.',
    auto: false, cadencia: 1.0, dano: 85, cargador: 1, recarga: 1.9, sacar: 0.6, movilidad: 0.88, proyectil: 'cohete', radio: 4.5,
    disp: 0, dispMov: 0, perdigones: 1, alcance: 200, zoom: 58, retroceso: 0.07,
    stats: { dano: 90, cadencia: 12, alcance: 60, movilidad: 35 },
  },
  // ---------- Secundaria ----------
  chispa: {
    nombre: 'Pistola Chispa', corto: 'Chispa', ranura: 'secundaria', desc: 'Rápida de sacar y precisa. Tan rápida como tu dedo.',
    auto: false, cadencia: 0.14, dano: 22, cabeza: 1.8, cargador: 12, recarga: 1.1, sacar: 0.22, movilidad: 1.05,
    disp: 0.008, dispMov: 0.018, perdigones: 1, alcance: 80, zoom: 58, retroceso: 0.018, caida: [20, 45, 0.6],
    stats: { dano: 42, cadencia: 60, alcance: 45, movilidad: 95 },
  },
  sentencia: {
    nombre: 'Revólver Sentencia', corto: 'Sentencia', ranura: 'secundaria', desc: 'Seis balas que pegan fuerte y precisas a distancia.',
    auto: false, cadencia: 0.5, dano: 55, cabeza: 2.0, cargador: 6, recarga: 2.0, sacar: 0.3, movilidad: 1.02,
    disp: 0.004, dispMov: 0.04, perdigones: 1, alcance: 100, zoom: 52, retroceso: 0.05, caida: [30, 60, 0.7],
    stats: { dano: 80, cadencia: 25, alcance: 65, movilidad: 85 },
  },
  eco: {
    nombre: 'Dobles Eco', corto: 'Eco', ranura: 'secundaria', desc: 'Una pistola en cada mano: el doble de plomo, la mitad de puntería.',
    auto: true, cadencia: 0.09, dano: 15, cabeza: 1.5, cargador: 24, recarga: 1.9, sacar: 0.3, movilidad: 1.05, sinApuntar: true,
    disp: 0.028, dispMov: 0.015, perdigones: 1, alcance: 50, zoom: 66, retroceso: 0.01, caida: [10, 28, 0.5],
    stats: { dano: 34, cadencia: 85, alcance: 25, movilidad: 95 },
  },
  // ---------- Cuerpo a cuerpo ----------
  filo: {
    nombre: 'Katana Filo', corto: 'Filo', ranura: 'cuerpo', desc: 'Tres tajos encadenados; el tercero pega más. Embiste al golpear.',
    cuerpo: true, cadencia: 0.38, dano: 45, danoFinal: 65, combo: 3, alcance: 2.9, embestida: 7, sacar: 0.3, movilidad: 1.1,
    stats: { dano: 70, cadencia: 55, alcance: 8, movilidad: 100 },
  },
  yunque: {
    nombre: 'Mazo Yunque', corto: 'Yunque', ranura: 'cuerpo', desc: 'Lento, pero cada golpe lanza al rival por los aires.',
    cuerpo: true, cadencia: 0.75, dano: 75, danoFinal: 100, combo: 3, alcance: 3.1, embestida: 3, empuje: 11, sacar: 0.45, movilidad: 1.02,
    stats: { dano: 100, cadencia: 22, alcance: 9, movilidad: 80 },
  },
  colmillo: {
    nombre: 'Cuchillo Colmillo', corto: 'Colmillo', ranura: 'cuerpo', desc: 'Corres más con él en la mano. Por la espalda es letal.',
    cuerpo: true, cadencia: 0.26, dano: 30, danoFinal: 40, combo: 3, alcance: 2.3, embestida: 4, espalda: 3.5, sacar: 0.18, movilidad: 1.2,
    stats: { dano: 45, cadencia: 90, alcance: 6, movilidad: 120 },
  },
  // ---------- Utilidad (uso rápido con Q) ----------
  petardo: {
    nombre: 'Granada Petardo', corto: 'Petardo', ranura: 'utilidad', desc: 'Rebota y estalla a los 1,5 s: hasta 100 de daño en 6 m.',
    utilidad: true, cd: 14, dano: 100, radio: 6, mecha: 1.5, stats: { dano: 90, cadencia: 20, alcance: 40, movilidad: 50 },
  },
  humo: {
    nombre: 'Bomba de humo', corto: 'Humo', ranura: 'utilidad', desc: 'Nube que tapa la vista durante 7 s. Los bots tampoco ven a través.',
    utilidad: true, cd: 16, radio: 5, duracion: 7, stats: { dano: 0, cadencia: 20, alcance: 40, movilidad: 60 },
  },
  destello: {
    nombre: 'Destello', corto: 'Destello', ranura: 'utilidad', desc: 'Te impulsa 9 m hacia donde miras, también en el aire.',
    utilidad: true, cd: 7, stats: { dano: 0, cadencia: 60, alcance: 20, movilidad: 100 },
  },
  muro: {
    nombre: 'Muro', corto: 'Muro', ranura: 'utilidad', desc: 'Levanta una pared que para las balas durante 6 s.',
    utilidad: true, cd: 12, duracion: 6, stats: { dano: 0, cadencia: 35, alcance: 10, movilidad: 50 },
  },
  botiquin: {
    nombre: 'Botiquín', corto: 'Botiquín', ranura: 'utilidad', desc: 'Recuperas 50 de vida en 2 s.',
    utilidad: true, cd: 18, cura: 50, stats: { dano: 0, cadencia: 15, alcance: 0, movilidad: 50 },
  },
};

export const RANURAS = ['principal', 'secundaria', 'cuerpo', 'utilidad'];
export const NOMBRE_RANURA = { principal: 'Principal', secundaria: 'Secundaria', cuerpo: 'Cuerpo a cuerpo', utilidad: 'Utilidad' };
export const POR_RANURA = { principal: [], secundaria: [], cuerpo: [], utilidad: [] };
for (const id in ARMAS) POR_RANURA[ARMAS[id].ranura].push(id);
export const EQUIPO_BASE = { principal: 'vector', secundaria: 'chispa', cuerpo: 'filo', utilidad: 'petardo' };
export const LISTA_ARMAS = Object.keys(ARMAS);

// Devuelve un equipo válido a partir de datos guardados o recibidos por red.
export function equipoValido(e) {
  const r = {};
  for (const k of RANURAS) r[k] = POR_RANURA[k].includes(e?.[k]) ? e[k] : EQUIPO_BASE[k];
  return r;
}

export function equipoAlAzar() {
  const r = {};
  for (const k of RANURAS) r[k] = POR_RANURA[k][(Math.random() * POR_RANURA[k].length) | 0];
  return r;
}

// Daño según la distancia: completo hasta d0, baja linealmente hasta d1 y luego se queda en `min`.
export function caidaDano(arma, dist) {
  const c = arma.caida;
  if (!c) return 1;
  if (dist <= c[0]) return 1;
  if (dist >= c[1]) return c[2];
  return 1 - (1 - c[2]) * ((dist - c[0]) / (c[1] - c[0]));
}

export class Arsenal {
  constructor(equipo) { this.reiniciar(equipo || EQUIPO_BASE); }

  // Nueva ronda: munición llena, utilidad lista y arma principal en la mano.
  reiniciar(equipo) {
    if (equipo) this.equipo = equipoValido(equipo);
    const e = this.equipo;
    this.ranuras = [e.principal, e.secundaria, e.cuerpo];
    this.utilidad = e.utilidad;
    this.municion = {};
    for (const k of this.ranuras) this.municion[k] = ARMAS[k].cargador ?? 0;
    this.indice = 0;
    this.anterior = 1;
    this.enfriamiento = 0;
    this.recargando = 0;
    this.recargaVacia = false;
    this.cambiando = this.arma.sacar;
    this.cdUtil = 0;
    this.combo = 0; this.tCombo = 0;
    this.disparos = 0; // contador (para la red)
  }

  get tipo() { return this.ranuras[this.indice]; }
  get arma() { return ARMAS[this.tipo]; }
  get cdUtilTotal() { return ARMAS[this.utilidad].cd; }
  get progresoRecarga() { return this.recargando > 0 ? 1 - this.recargando / this.tRecarga : 0; }
  get tRecarga() { return this.arma.recarga * (this.recargaVacia ? 1.15 : 1); }

  cambiar(i) {
    if (i === this.indice || i < 0 || i > 2) return false;
    this.anterior = this.indice;
    this.indice = i;
    this.recargando = 0;
    this.combo = 0;
    this.cambiando = this.arma.sacar;
    return true;
  }

  actualizar(dt) {
    this.enfriamiento = Math.max(0, this.enfriamiento - dt);
    this.cambiando = Math.max(0, this.cambiando - dt);
    this.cdUtil = Math.max(0, this.cdUtil - dt);
    if (this.tCombo > 0) { this.tCombo -= dt; if (this.tCombo <= 0) this.combo = 0; }
    if (this.recargando > 0) {
      this.recargando -= dt;
      if (this.recargando <= 0) { this.recargando = 0; this.municion[this.tipo] = this.arma.cargador; }
    }
  }

  listo() { return this.enfriamiento <= 0 && this.cambiando <= 0 && this.recargando <= 0; }

  recargar() {
    const a = this.arma;
    if (!a.cargador || this.recargando > 0 || this.cambiando > 0 || this.municion[this.tipo] >= a.cargador) return false;
    this.recargaVacia = this.municion[this.tipo] === 0;
    this.recargando = this.tRecarga;
    return true;
  }

  // Devuelve true si se ha podido disparar o golpear (gasta munición y aplica cadencia).
  // En armas cuerpo a cuerpo deja en `golpeN` el paso del combo (0, 1, 2).
  disparar() {
    if (!this.listo()) return false;
    const a = this.arma;
    if (a.cargador) {
      if (this.municion[this.tipo] <= 0) { this.recargar(); return false; }
      this.municion[this.tipo]--;
    }
    if (a.cuerpo) {
      this.golpeN = this.combo;
      this.combo = (this.combo + 1) % a.combo;
      this.tCombo = a.cadencia + 0.55;
      this.enfriamiento = a.cadencia * (this.golpeN === a.combo - 1 ? 1.5 : 1);
    } else this.enfriamiento = a.cadencia;
    this.disparos = (this.disparos + 1) % 256;
    return true;
  }

  usarUtilidad() {
    if (this.cdUtil > 0) return false;
    this.cdUtil = this.cdUtilTotal;
    return true;
  }
}
