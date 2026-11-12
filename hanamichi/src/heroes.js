// Héroes: cada uno tiene un arma propia, una habilidad (Q), un poder de apoyo (E) y una definitiva (X).
// La definitiva se carga haciendo daño (y un poco con el tiempo).
export const HEROES = {
  sakura: {
    nombre: 'Sakura', rol: 'Asesina veloz', estilo: 'sakura', arma: 'rifle', color: '#FF8FB8', velocidad: 1.06,
    q: { id: 'destello', nombre: 'Destello', desc: 'Te teletransportas 9 m hacia donde miras.', cd: 5 },
    e: { id: 'petalos', nombre: 'Pétalos', desc: 'Recuperas 60 de vida en 2 s.', cd: 11 },
    x: { id: 'tormenta', nombre: 'Tormenta Sakura', desc: '8 s con +50 % de daño, +30 % de velocidad y recarga triple.' },
  },
  kaito: {
    nombre: 'Kaito', rol: 'Tormenta de cerca', estilo: 'cian', arma: 'escopeta', color: '#3EE0FF', velocidad: 1,
    q: { id: 'rayo', nombre: 'Rayo', desc: 'Descarga instantánea: 50 de daño a lo que apuntas.', cd: 6 },
    e: { id: 'trueno', nombre: 'Salto trueno', desc: 'Salto enorme; al caer, onda de choque de 60.', cd: 9 },
    x: { id: 'juicio', nombre: 'Juicio de Raijin', desc: 'Rayos sobre todos los rivales a la vista: 90 de daño.' },
  },
  yuki: {
    nombre: 'Yuki', rol: 'Francotiradora', estilo: 'hielo', arma: 'franco', color: '#BFE9FF', velocidad: 0.98,
    q: { id: 'muro', nombre: 'Muro de hielo', desc: 'Levantas un muro que bloquea balas durante 6 s.', cd: 9 },
    e: { id: 'escudo', nombre: 'Escarcha', desc: 'Ganas 60 de escudo durante 6 s.', cd: 11 },
    x: { id: 'ventisca', nombre: 'Ventisca', desc: 'Tormenta de 9 m: ralentiza y hace 30 de daño por segundo.' },
  },
  akane: {
    nombre: 'Akane', rol: 'Explosiva', estilo: 'fuego', arma: 'subfusil', color: '#FF9A4D', velocidad: 1.02,
    q: { id: 'bola', nombre: 'Bola de fuego', desc: 'Proyectil que estalla: 75 de daño en área.', cd: 6 },
    e: { id: 'impulso', nombre: 'Propulsión', desc: 'Una explosión a tus pies te lanza por los aires.', cd: 6 },
    x: { id: 'meteoro', nombre: 'Lluvia de meteoros', desc: 'Seis meteoros caen donde apuntas.' },
  },
};

export const LISTA_HEROES = Object.keys(HEROES);
export const CARGA_DEFINITIVA = 100;
