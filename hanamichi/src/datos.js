// Datos guardados en el navegador: ajustes y estadísticas. Todo con try/catch
// (modo privado o iframe sin almacenamiento) y con copia en memoria.
const CLAVE = 'hanamichi:datos';
const BASE = {
  ajustes: { sensibilidad: 1, camara: 'tercera', calidad: 'auto', dificultad: 'normal', primaria: 'rifle' },
  stats: { partidas: 0, victorias: 0, racha: 0, mejorRacha: 0 },
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
  registrarPartida({ gano }) {
    const s = memoria.stats;
    s.partidas++;
    if (gano) { s.victorias++; s.racha++; s.mejorRacha = Math.max(s.mejorRacha, s.racha); } else s.racha = 0;
    guardar();
    return { ...s };
  },
};
