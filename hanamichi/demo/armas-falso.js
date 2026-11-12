// Datos de armas de prueba con la forma del contrato (el Director los sustituye por los reales de src/armas.js).
const A = (nombre, corto, ranura, desc, d, c, a, m, cargador) => ({ nombre, corto, ranura, desc, stats: { dano: d, cadencia: c, alcance: a, movilidad: m }, cargador });
export const ARMAS = {
  vector: A('Vector', 'Vector', 'principal', 'Fusil automático equilibrado. Fiable a cualquier distancia.', 55, 70, 65, 60, 30),
  trueno: A('Trueno', 'Trueno', 'principal', 'Escopeta de bombeo. Devastadora de cerca, inútil de lejos.', 90, 25, 20, 55, 6),
  aguja: A('Aguja', 'Aguja', 'principal', 'Francotirador de cerrojo con mira. Un disparo, una baja.', 100, 10, 100, 35, 5),
  avispa: A('Avispa', 'Avispa', 'principal', 'Subfusil muy rápido. Ideal para moverte y presionar.', 35, 95, 35, 90, 25),
  cometa: A('Cometa', 'Cometa', 'principal', 'Lanzacohetes. Daño en área, recarga lenta.', 95, 12, 70, 40, 1),
  chispa: A('Chispa', 'Chispa', 'secundaria', 'Pistola semiautomática. Segura y precisa.', 38, 55, 50, 85, 12),
  sentencia: A('Sentencia', 'Sentencia', 'secundaria', 'Revólver pesado. Cada bala cuenta.', 80, 25, 70, 75, 6),
  eco: A('Eco', 'Eco', 'secundaria', 'Dos pistolas, una en cada mano. Mucha cadencia.', 30, 85, 30, 80, 20),
  filo: A('Filo', 'Filo', 'cuerpo', 'Katana con combo de tres tajos. Rápida y elegante.', 70, 70, 10, 95, 0),
  yunque: A('Yunque', 'Yunque', 'cuerpo', 'Mazo a dos manos. Lento, pero aplasta.', 100, 20, 15, 60, 0),
  colmillo: A('Colmillo', 'Colmillo', 'cuerpo', 'Cuchillo veloz. Te hace ágil y silencioso.', 45, 95, 8, 100, 0),
  petardo: A('Petardo', 'Petardo', 'utilidad', 'Granada que explota al rebotar. Limpia esquinas.', 80, 20, 50, 70, 0),
  humo: A('Humo', 'Humo', 'utilidad', 'Bomba de humo. Bloquea la visión unos segundos.', 0, 15, 40, 80, 0),
  destello: A('Destello', 'Destello', 'utilidad', 'Impulso hacia delante para entrar o escapar.', 0, 40, 30, 100, 0),
  muro: A('Muro', 'Muro', 'utilidad', 'Levanta un muro temporal para cubrirte.', 0, 10, 20, 60, 0),
  botiquin: A('Botiquín', 'Botiquín', 'utilidad', 'Recupera vida tras unos segundos quieto.', 0, 10, 10, 65, 0),
};
export const POR_RANURA = {
  principal: ['vector', 'trueno', 'aguja', 'avispa', 'cometa'],
  secundaria: ['chispa', 'sentencia', 'eco'],
  cuerpo: ['filo', 'yunque', 'colmillo'],
  utilidad: ['petardo', 'humo', 'destello', 'muro', 'botiquin'],
};
