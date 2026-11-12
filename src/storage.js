// Puntuaciones. Hoy se guardan en el navegador (sin conexión).
// La interfaz es asíncrona a propósito: más adelante se añadirá un adaptador de Supabase
// con los mismos métodos y el juego no tendrá que cambiar.

const CLAVE = 'tinta:record';

const local = {
  async cargarRecord() {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      return d && Number.isFinite(d.puntos) ? d : { puntos: 0, oleada: 0 };
    } catch {
      return { puntos: 0, oleada: 0 };
    }
  },
  async guardarPartida({ puntos, oleada }) {
    const previo = await local.cargarRecord();
    const nuevo = puntos > previo.puntos;
    const record = nuevo ? { puntos, oleada, fecha: Date.now() } : previo;
    if (nuevo) {
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
    if (window.parent && window.parent !== window) window.parent.postMessage({ fuente: 'tinta', tipo, ...datos }, '*');
  } catch { /* sin acceso al padre */ }
}
