// Paleta del juego (estilo limpio y colorido). Todo el mundo importa los colores de aquí.
export const PALETA = {
  tinta: 0x10131C, papel: 0xFFFFFF, fondo: 0xF3F5FA, gris: 0x9AA3B8, grisClaro: 0xD5DAE6,
  azul: 0x2563FF, naranja: 0xFF7A1A, amarillo: 0xFFD23F, verde: 0x3BD67A, rojo: 0xFF4D5E,
  piel: 0xFFE2CF,
  // Pasteles apagados para escenarios (los jugadores siempre destacan sobre ellos).
  melocoton: 0xF7C9A8, lila: 0xC9B8F2, menta: 0xB9E6C9, cielo: 0xBFE3F7, arena: 0xFBE3D3, hielo: 0xD3E8F5, suelo: 0xE9EDF5,
};
export const css = (n) => '#' + n.toString(16).padStart(6, '0');
// Color de un combatiente según su relación con el jugador local.
export const COLOR_ALIADO = PALETA.azul, COLOR_RIVAL = PALETA.naranja;
