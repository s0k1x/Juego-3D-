// Datos guardados en el navegador: ajustes y estadísticas. Todo con try/catch
// (modo privado o iframe sin almacenamiento) y con copia en memoria.
const CLAVE = 'hanamichi:datos2';
const BASE = {
  ajustes: { sensibilidad: 1, fov: 80, calidad: 'auto', dificultad: 'normal', heroe: 'sakura', nombre: '', bots: 5, volumen: null, correr: true, musica: 0.5, fps: false },
  stats: { partidas: 0, victorias: 0, bajas: 0, muertes: 0, mejorPartida: 0 },
};

let memoria = cargar();

function cargar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (d) return { ajustes: { ...BASE.ajustes, ...d.ajustes }, stats: { ...BASE.stats, ...d.stats } };
  } catch { /* sin almacenamiento */ }
  return structuredClone(BASE);
}

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(memoria)); } catch { /* sin almacenamiento */ }
}

export const datos = {
  get ajustes() { return memoria.ajustes; },
  get stats() { return memoria.stats; },
  ajustar(cambios) { Object.assign(memoria.ajustes, cambios); guardar(); },
  registrarPartida({ gano, bajas, muertes }) {
    const s = memoria.stats;
    s.partidas++;
    if (gano) s.victorias++;
    s.bajas += bajas; s.muertes += muertes;
    s.mejorPartida = Math.max(s.mejorPartida, bajas);
    guardar();
    return { ...s };
  },
};
