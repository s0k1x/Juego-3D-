# Contrato técnico de Hanamichi Duelos

Juego web sin build: módulos ES en `hanamichi/src`, Three.js r170 en `vendor/` (importmap `three`).
Diseño aprobado: estilo limpio y colorido, bloques de color con borde de tinta `#10131C`, aliados en azul
`#2563FF`, rivales en naranja `#FF7A1A`, amarillo `#FFD23F` para críticos, fondos pastel apagados.
Tipos: Space Grotesk (títulos y cifras) e Inter. Colores en `src/paleta.js` (PALETA, css(), COLOR_ALIADO, COLOR_RIVAL).
Todo el texto visible en español claro. Sin archivos externos en tiempo de ejecución salvo las fuentes locales.

Modo: duelos por rondas (1v1, 2v2, 3v3), gana quien llega a 5 rondas; sin reaparecer dentro de la ronda;
al morir se mira a un compañero. Equipo de 4 huecos: principal, secundaria, cuerpo a cuerpo (se empuñan con
1, 2, 3) y una utilidad de uso rápido (Q o 4) con tiempo de espera.

## Identificadores de armas (no cambiar)
- principal: `vector` (fusil automático), `trueno` (escopeta de bombeo), `aguja` (francotirador de cerrojo, mira),
  `avispa` (subfusil), `cometa` (lanzacohetes)
- secundaria: `chispa` (pistola), `sentencia` (revólver), `eco` (dos pistolas, una en cada mano)
- cuerpo: `filo` (katana), `yunque` (mazo a dos manos), `colmillo` (cuchillo)
- utilidad: `petardo` (granada), `humo` (bomba de humo), `destello` (impulso), `muro`, `botiquin`

## Reparto de archivos (cada agente solo toca los suyos)
| Dueño | Archivos |
|---|---|
| Director | juego.js, jugador.js, bots.js, armas.js (datos y Arsenal), utilidades.js, red.js, main.js, datos.js, input.js, efectos.js, audio.js, tests/prueba.mjs |
| Modelos | modelos.js, vista.js, demo/vista.html |
| Personaje | personaje.js, demo/personaje.html |
| Mapas | mapa.js, render.js, demo/mapa.html |
| Interfaz | index.html, estilo.css, ui.js, assets/fonts/*, demo/ui.html |

Cada agente verifica su parte con una página de demostración propia en `hanamichi/demo/` (el juego completo no
arranca hasta que el Director integre todo) y capturas con Playwright revisadas con ojo crítico.

## modelos.js (Modelos)
```js
export function modeloArma(id, material?) // -> THREE.Group; -Z es hacia delante; origen en la empuñadura (mano derecha)
// group.userData = { boca: Vector3, izq: Vector3 (apoyo mano izquierda), mira: number (altura de la línea de mira),
//   cargador?: Object3D (pieza que sale al recargar), movil?: Object3D (corredera, bomba, cerrojo, tambor),
//   segunda?: Object3D (solo `eco`: la pistola izquierda) }
export function geometriaArma(id) // -> { malla: BufferGeometry, contorno: BufferGeometry } fusionadas (granadas en vuelo, cohetes)
export const IDS_MODELO // lista de ids con modelo, incluye además 'cohete'
```
Estilo: pocas piezas con esquinas biseladas, cuerpo tinta/gris, un acento de color por arma, contorno con
`materialContorno` de render.js; color por vértice con `pintar` (un material para todo).

## vista.js (Modelos)
```js
export class Vista {
  constructor(escena)            // escena aparte (render.escenaVista), cámara fija FOV 60
  raiz                           // Group
  setColor(hex)                  // color de las mangas (equipo)
  disparo(id)                    // retroceso, fogonazo, pieza móvil, casquillo
  tajo(n)                        // golpe cuerpo a cuerpo; n = 0,1,2 dentro del combo
  usar(tipo)                     // lanza/usa la utilidad con la mano izquierda ('petardo','humo','destello','muro','botiquin')
  inspeccionar()                 // animación de inspección (se cancela al disparar/recargar/cambiar)
  aterrizar(vy)
  actualizar(dt, j, { apunta, mirada: {x, y}, visible })
}
```
`j` (Combatiente local): `vel` (Vector3), `suelo`, `deslizando` (s restantes), `vivo`,
`arsenal: { tipo, arma (datos), indice, cambiando (s restantes de sacar; total = arma.sacar), recargando (s),
progresoRecarga (0..1), municion: {id: n} }`. Datos del arma: `{ ranura, auto, cargador, recarga, sacar, mira, cuerpo, combo }`.
Animaciones obligatorias por arma: sacar (distinta por tipo), reposo con respiración, balanceo al andar, arma baja
al correr (vel > 7), inercia al girar, apuntar (centrada en la línea de mira; `aguja` oculta el modelo al apuntar,
lo gestiona el Director con `visible`), disparo, recarga por pasos (cargador fuera/dentro, cerrojo, tambor del
revólver, cartucho a cartucho en la escopeta, las dos pistolas), recarga en vacío más larga con tirón final,
inspección, deslizarse (arma ladeada), saltar/aterrizar, combo de 3 golpes distinto por arma cuerpo a cuerpo.

## personaje.js (Personaje)
```js
export class Personaje {
  constructor(escena, { color = 0x2563FF, variante = 0 })   // variante 0..5: peinado/gorra/accesorio distinto
  raiz, mano (Group donde cuelga el arma), material, destello (s), muerte (0..1), visibleEnPantalla
  setColor(hex)                 // color de equipo (ropa); se puede cambiar en cualquier momento
  reiniciar()                   // vuelve a la pose inicial (tras morir)
  ponerArma(id)                 // usa modeloArma(id) de modelos.js; `eco` muestra dos pistolas
  setVisible(bool)
  setEtiqueta(texto | null, colorCss)
  actualizar(dt, e, camara)
  cajasImpacto(e, out)          // out = { cabeza, pecho, piernas } (Vector3 en mundo)
  destruir()                    // libera geometrías y materiales propios
}
export function actualizarFrustum(camara)
```
`e`: `{ pos, yaw, pitch, vel, suelo, deslizando (bool), agachado, vivo, golpe (0..1, baja de 1 a 0), golpeN (0..2),
recarga (0..1), usando (0..1), flinch (0..1), protegido, escudo, apuntando, celebra (bool), arma (id) }`.
El personaje mira a -Z. Alto 1,75 m; esferas de impacto: cabeza r 0,21 a y≈1,58; pecho r 0,34 a 1,15; piernas r 0,30 a 0,55
(escaladas ×0,7 agachado y ×0,48 deslizando), igual que ahora.
Animaciones: reposo, correr (con braceo si no apunta), andar de lado y hacia atrás, saltar, caer, aterrizar, deslizarse,
agacharse, apuntar siguiendo el `pitch`, recargar, golpear (combo), lanzar utilidad, recibir daño, morir (cae según
de dónde vino el golpe), celebrar la ronda ganada.

## mapa.js y render.js (Mapas)
```js
export const MAPAS = { azotea: { nombre, desc }, muelle: {...}, patio: {...} }
export class Mapa {
  constructor(escena, render)
  cargar(id)                    // destruye el mapa anterior y construye el nuevo (geometría, colisiones, navegación, ambiente)
  id, limites: { x, z }
  cajas, cercanas(minX, minZ, maxX, maxZ, salida), rayo(o, d, max, normal?), visible(a, b)
  nodos, nodoCercano(x, z), ruta(x0, z0, x1, z1)       // rejilla de navegación; nodo.cobertura
  aparicion(equipo, indice)     // -> { pos: Vector3, yaw }; equipo 0 y 1 en extremos opuestos; indice 0..2 separados ≥ 1,5 m
  saltador(pos)                 // -> { dir: Vector3, fuerza } | null
  agregarMuro(x, z, alongX, duracion), limpiarDinamicas()
  actualizar(t, dt)
}
```
Tres mapas pequeños y simétricos (giro de 180º), según la lámina: **Azotea** (≈32×52 m, depósito central, dos casetas
con tejado accesible), **Muelle** (≈48×30 m, tres carriles entre contenedores apilados, puentes por arriba),
**Patio** (≈34×34 m, torre central con saltadores, esquinas en L). Colisiones AABB como ahora.
render.js conserva sus exports (`Render`, `rampa`, `materialToon`, `materialContorno`, `materialContornoCaja`,
`pintar`, `COLORES`) y `render.escenaVista/camaraVista/seguirSombra/setCalidad/adaptar/dibujar/redimensionar`;
añade `render.setAmbiente({ cielo: [arriba, medio, horizonte], niebla, sol })` que `Mapa.cargar` llama.
El contorno pasa a ser tinta `#10131C`.

## ui.js (Interfaz)
`export class Interfaz` con estos métodos (el Director los llama; no cambiar firmas):
```js
marcarTactil(si)
construirMenu(ajustes, alCambiar)   // ajustes: { nombre, modo:'1v1'|'2v2'|'3v3', mapa:'azar'|'azotea'|'muelle'|'patio',
                                    //   dificultad:'facil'|'normal'|'dificil', equipo:{principal,secundaria,cuerpo,utilidad},
                                    //   sensibilidad, fov, volumen, musica, calidad:'auto'|'alta'|'baja', fps:bool }
                                    // alCambiar(clave, valor) con esas mismas claves; el equipo se emite entero: alCambiar('equipo', {...})
stats(s)                            // { partidas, victorias, bajas, muertes }
menu()                              // muestra el menú principal
equipo(abrir)                       // panel «Tu equipo» también dentro de la pausa y entre rondas
ajustes(abrir, volverA)             // volverA: 'menu' | 'pausa'
pausa(si, online)
conectando(sala), errorRed(msg), estadoRed(estado, sala, pares), toast(msg)
empezarPartida(juego)               // oculta pantallas, enseña el HUD
ronda(n, marcador)                  // «Ronda 3» al empezar cada ronda; marcador = [azul, naranja] (azul = equipo del jugador)
cuentaAtras(n)                      // 3, 2, 1 y 0 = «¡A luchar!»
finRonda({ gana: true|false|null, marcador, motivo })   // motivo: 'eliminacion' | 'tiempo'
hud(juego, apunta)                  // cada fotograma; solo escribe en el DOM lo que cambia
impacto(dano, cabeza, letal), recibirDano(angRel), baja({ victima, cabeza, multi })
feed(lista)                         // [{ a, v, arma, cabeza, aAliado, vAliado }]
muerto(asesino | null)              // asesino: { nombre, vida, armaNombre }
espectar(nombre | null)             // «Viendo a Ana» mientras estás eliminado
utilUsada(), utilNoLista()
tabla(juego | null)
finPartida({ gano, marcador, jugadores: [{ nombre, aliado, yo, bajas, muertes, dano }], resumen, online })
guia(forzar), fps(valor | null, estadoRed)
```
`hud` lee de `juego`: `jugador` (o `espectando` si existe): `{ vida, escudo, vivo, protegido, vel, suelo, deslizando,
arsenal: { ranuras:[3 ids], indice, tipo, arma, municion, recargando, progresoRecarga, utilidad (id), cdUtil (s), cdUtilTotal } }`;
`marcador` [azul, naranja], `ronda`, `tiempo` (s), `rondasParaGanar` (5), `fase`
('menu'|'preparacion'|'combate'|'finRonda'|'finPartida'), `combatientes` (cada uno `{ nombre, aliado, vivo, vida }`),
`online`. Datos de armas en `src/armas.js`: `ARMAS[id] = { nombre, corto, ranura, desc, stats: { dano, cadencia, alcance, movilidad } (0..100), cargador }`
y `POR_RANURA = { principal: [ids], ... }`.
Ids del DOM que usa main.js y deben existir: lienzo, tactil, carga, hud, btnJugar, btnRapida, btnCrear, btnUnirse,
codigoSala, btnCancelarCon, btnRevancha, btnSeguir, btnAbandonar, btnMenu, btnPausa, btnAjustes, btnAjustesPausa,
btnCerrarAjustes, btnInvitar, btnEquipoPausa, nombre. Botones táctiles en `#tactil` con `data-accion`:
disparar, saltar, agachar, apuntar, recargar, siguiente, util, tabla.
