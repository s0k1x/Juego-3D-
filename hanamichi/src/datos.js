// Datos guardados en el navegador: ajustes y estadísticas. Todo con try/catch
// (modo privado o iframe sin almacenamiento) y con copia en memoria.
const CLAVE = 'hanamichi:duelos';
const BASE = {
  ajustes: {
    nombre: '', modo: '1v1', mapa: 'azar', dificultad: 'normal',
    equipo: { principal: 'vector', secundaria: 'chispa', cuerpo: 'filo', utilidad: 'petardo' },
    sensibilidad: 1, fov: 80, volumen: null, musica: 0.5, calidad: 'auto', fps: false,
  },
  stats: { partidas: 0, victorias: 0, bajas: 0, muertes: 0 },
};

let memoria = cargar();

function cargar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (d) return { ajustes: { ...BASE.ajustes, ...d.ajustes, equipo: { ...BASE.ajustes.equipo, ...d.ajustes?.equipo } }, stats: { ...BASE.stats, ...d.stats } };
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
    guardar();
    return { ...s };
  },
};
