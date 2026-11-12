# Tinta

Shooter de arena con vista cenital para navegador, hecho con HTML5 Canvas y JavaScript sin frameworks. Tiene estética de impresión risográfica a dos tintas. Funciona sin conexión y está preparado para conectar Supabase más adelante.

## Cómo ejecutarlo

Los módulos ES necesitan un servidor; si abres `index.html` directamente con `file://`, no carga.

```bash
python3 -m http.server 8080
# o bien
npx serve .
```

Después abre `http://localhost:8080`.

### Dentro de otra web

Copia la carpeta en tu web y enlázala, o incrústala con un iframe:

```html
<iframe src="/tinta/" style="width:100%;height:100vh;border:0" allow="autoplay; fullscreen"></iframe>
```

La web que contiene el juego recibe estos mensajes con `postMessage`:

- `{ fuente: 'tinta', tipo: 'inicio' }` al empezar una partida.
- `{ fuente: 'tinta', tipo: 'fin', puntos, oleada, nuevoRecord }` al terminarla.

## Controles

| | PC | Móvil |
|---|---|---|
| Moverse | W A S D (o flechas) | Pulgar izquierdo |
| Apuntar | Ratón | Pulgar derecho |
| Disparar | Mantener el clic (o Espacio) | Desplazar el pulgar derecho |
| Pausa | P o Esc | Botón superior |

## Cómo se juega

- **Oleadas:** cada una trae más enemigos, más rápidos y resistentes. Cada 5 oleadas aparece el jefe, La Prensa, que tiene 3 fases.
- **Enemigos:**
  - **Aguja:** rápida y persigue zigzagueando.
  - **Bloque:** un tanque que se agrieta al recibir daño.
  - **Ojo:** guarda la distancia y dispara. Su pupila se enciende justo antes de disparar.
- **Power-ups:**
  - **T:** disparo triple.
  - **E:** escudo de 3 golpes.
  - **V:** velocidad.
  - **+:** vida extra. Si ya tienes la vida al máximo, se convierte en 500 puntos.
- **Combo:** cuantas más muertes encadenas, más alto es el multiplicador, hasta ×5.
- **Récord:** se guarda en el navegador (`localStorage`).

## Estructura

```
index.html            pantallas y HUD (DOM)
manifest.webmanifest  instalación como app
sw.js                 caché para jugar sin conexión
assets/               icono y tipografías (Big Shoulders Stencil y Atkinson Hyperlegible, licencia OFL)
src/main.js           arranque y bucle con delta time
src/game.js           estados, oleadas, colisiones, cámara y dibujo
src/player.js         jugador y power-ups
src/enemies.js        enemigos y jefe
src/bullets.js        balas con reserva reutilizable
src/fx.js             partículas, sacudida y efecto de tinta descuadrada
src/input.js          teclado, ratón y doble joystick táctil
src/audio.js          sonidos generados con Web Audio API
src/ui.js             HUD y pantallas
src/storage.js        récord (localStorage), preparado para Supabase
tests/smoke.mjs       prueba con Playwright y capturas
```

## Pruebas

```bash
node tests/smoke.mjs
```

La prueba arranca un servidor local y abre el juego en tamaño escritorio y en un iPhone 13 emulado. Durante la partida:

- juega un rato;
- salta al jefe;
- comprueba la pausa, el fin de partida y el récord;
- mide los FPS.

Si aparece algún error en la consola, la prueba falla. Las capturas se guardan en `tests/capturas/`.

## Conectar Supabase (más adelante)

`src/storage.js` expone `usarAlmacen(adaptador)`. Basta con crear un adaptador que tenga los mismos dos métodos asíncronos, `cargarRecord()` y `guardarPartida({ puntos, oleada })`, y registrarlo al arrancar. Si el servidor falla, la partida se guarda en local igualmente.

## Versiones

Al publicar cambios, sube `VERSION` en `sw.js` para que los jugadores reciban la versión nueva.
