// Puntuaciones. Hoy se guardan en el navegador (sin conexión).
// La interfaz es asíncrona a propósito: más adelante se añadirá un adaptador de Supabase
// con los mismos métodos y el juego no tendrá que cambiar.

const CLAVE = 'tinta:record';
// Respaldo en memoria por si localStorage está bloqueado (modo privado, iframe de terceros).
let enMemoria = { puntos: 0, oleada: 0 };

const local = {
  async cargarRecord() {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (d && Number.isFinite(d.puntos) && d.puntos >= enMemoria.puntos) enMemoria = d;
    } catch { /* usamos el respaldo en memoria */ }
    return enMemoria;
  },
  async guardarPartida({ puntos, oleada }) {
    const previo = await local.cargarRecord();
    const nuevo = puntos > previo.puntos;
    const record = nuevo ? { puntos, oleada, fecha: Date.now() } : previo;
    if (nuevo) {
      enMemoria = record;
      try { localStorage.setItem(CLAVE, JSON.stringify(record)); } catch { /* almacenamiento no disponible */ }
    }
    return { record, nuevo };
  },
};

let adaptador = local;

// Permite sustituir el almacenamiento (p. ej. Supabase) sin tocar el resto del juego.
export function usarAlmacen(otro) { adaptador = otro; }

export const marcadores = {
  cargarRecord: () => adaptador.cargarRecord(),
  async guardarPartida(partida) {
    // Si el almacén remoto falla, no se pierde la partida: se guarda en local.
    try { return await adaptador.guardarPartida(partida); } catch { return local.guardarPartida(partida); }
  },
};

// Si el juego vive dentro de un iframe, avisa a la web que lo contiene.
export function avisarWeb(tipo, datos = {}) {
  try {
    if (window.parent && window.parent !== window) {
      // Solo se envía a la web que nos contiene (si se conoce su origen).
      const origen = document.referrer ? new URL(document.referrer).origin : '*';
      window.parent.postMessage({ fuente: 'tinta', tipo, ...datos }, origen);
    }
  } catch { /* sin acceso al padre */ }
}
