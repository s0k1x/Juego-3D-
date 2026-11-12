# Juego-3D

Juegos para navegador, sin frameworks ni archivos externos, que funcionan sin conexión.

- **[Hanamichi](hanamichi/)**: arena de héroes anime en primera persona, contra bots u online (Three.js). Es el juego principal.
- **[Tinta](tinta/)**: shooter de arena en 2D (Canvas).

La raíz (`index.html`) redirige a Hanamichi.

## Ejecutar

Los módulos ES necesitan un servidor; abrir el archivo directamente con `file://` no funciona.

```bash
python3 -m http.server 8080
```

Después abre `http://localhost:8080/hanamichi/`.

---

# Hanamichi

Arena de héroes anime **en primera persona**, para navegador. Eliges héroe y entras en segundos: partidas de **todos contra todos** contra bots o **online** con amigos. Gana quien llega antes a **20 bajas** (o quien más tenga a los 5 minutos). Reapareces a los 3 segundos.

## Héroes

Cada héroe tiene su arma, una habilidad (Q), un poder (E) y una definitiva (X) que se carga haciendo daño.

| Héroe | Arma | Q | E | X (definitiva) |
|---|---|---|---|---|
| **Sakura**, asesina veloz | Rifle Hikari | Destello: teletransporte de 9 m | Pétalos: +60 de vida | Tormenta Sakura: +50 % daño, +30 % velocidad, recarga triple |
| **Kaito**, tormenta de cerca | Escopeta Raijin | Rayo: 50 de daño instantáneo | Salto trueno: salto enorme y onda de choque al caer | Juicio de Raijin: rayos sobre todos los rivales a la vista |
| **Yuki**, francotiradora | Francotirador Tsuki | Muro de hielo (bloquea balas 6 s) | Escarcha: 60 de escudo | Ventisca: zona que ralentiza y daña |
| **Akane**, explosiva | Subfusil Kitsune | Bola de fuego explosiva | Propulsión: explosión que te lanza por los aires | Lluvia de meteoros |

Todos llevan además pistola, katana (más daño por la espalda) y dos granadas que se recargan con el tiempo.

## Cómo se juega

- **Movimiento rápido:** corres por defecto, doble salto que cambia de dirección, deslizamiento, salto deslizado y **saltadores** que te lanzan al tejado de la caseta o encima del depósito.
- **Vida:** se regenera rápido si pasas 4 segundos sin recibir daño. Al reaparecer tienes 2 s de protección (se pierde al disparar).
- **Primera persona siempre:** brazos del héroe con animaciones de respiración, balanceo, inercia al girar, esprint, apuntar, retroceso, recarga con cargador, bombeo de escopeta, tajos de katana, lanzamiento de granada y de poderes, y aterrizajes. La vista se dibuja en una capa aparte y nunca atraviesa paredes.
- **Feedback:** marcador de impacto (rojo si es letal), números de daño, críticos, anuncios de doble/triple baja y rachas, registro de bajas, indicador de dirección del daño, bordes de pantalla por estado (escudo, definitiva, ralentizado…), cámara de muerte que mira a quien te eliminó y tabla de jugadores (Tab).
- **Bots:** eligen rival, solo ven con línea de visión, reaccionan con retraso y error de puntería, se cubren, lanzan granadas y usan los poderes de su héroe. Tres niveles.

### Controles

| | PC | Móvil |
|---|---|---|
| Moverse | W A S D (corres al ir hacia delante; Mayús anda) | Pulgar izquierdo |
| Mirar | Ratón (clic en el juego para capturarlo) | Arrastrar a la derecha |
| Disparar / apuntar | Clic / clic derecho | Botón rosa / Apuntar |
| Habilidad, poder, definitiva | Q, E, X (o F) | Botones Q, E, X |
| Saltar, deslizarse | Espacio, C o Ctrl | Botones |
| Armas | 1 a 4, rueda; G granada; R recarga | Botones |
| Marcador | Tab | Botón Tabla |
| Pausa | Esc o P | Botón superior |

En Ajustes: sensibilidad, campo de visión, volumen, correr siempre o con Mayús, y calidad.

## Multijugador

- **Partida rápida online:** entra en la sala pública.
- **Crear sala / Unirse:** salas privadas con un código de 4 letras. El enlace `?sala=CODIGO` entra directamente (en pausa hay un botón para copiarlo).
- Usa **Supabase Realtime** (canales de difusión, sin tablas) con la clave pública del proyecto en `src/config.js`. No hace falta servidor propio.
- Cada máquina es dueña de sus entidades: simula su jugador, le aplica el daño que recibe y difunde su estado ~6-12 veces por segundo en un único paquete con los eventos pendientes (daño, bajas, poderes, granadas). Quien dispara calcula el impacto sobre lo que ve (a favor del que dispara). Los demás se dibujan interpolados con 120 ms de retraso.
- La máquina que lleva más tiempo en la sala es la **anfitriona**: lleva el reloj y el marcador, y rellena la sala con bots hasta 4 combatientes. Si se va, la siguiente toma el relevo.
- Para probar en un solo equipo: abre dos pestañas con `?sala=PRUEBA&red=local` (usa BroadcastChannel en lugar de internet).

## Rendimiento

- Mapa por zonas fusionadas, una malla y un contorno por zona; la cámara descarta lo que no se ve.
- Personajes fuera de cámara no se animan; nombres flotantes solo con línea de visión (comprobada 5 veces por segundo).
- Sombras solo alrededor del jugador; pétalos animados en la GPU; efectos con reservas fijas.
- Resolución adaptativa y modo «Ligera» sin sombras.
- En las pruebas: unas 80-160 llamadas de dibujo y 23 000-43 000 triángulos con 6 combatientes; un paso de lógica con 6 bots cuesta unos 0,15 ms.

## Estructura

```
hanamichi/
  index.html, manifest.webmanifest, sw.js (sin conexión)
  vendor/          three.js r170 y BufferGeometryUtils (licencia MIT)
  assets/          icono y tipografías (licencia OFL)
  src/main.js      arranque, botones, salas y bucle
  src/juego.js     partida, entidades, disparos, daño, granadas, katana y red
  src/heroes.js    datos de los héroes
  src/poderes.js   habilidades, proyectiles y zonas
  src/jugador.js   física del combatiente, interpolación y cámara en primera persona
  src/vista.js     brazos y arma en primera persona con sus animaciones
  src/personaje.js modelo anime de cada héroe, nombre flotante y animaciones
  src/bots.js      inteligencia de los bots
  src/armas.js     datos, munición y modelos de las armas
  src/mapa.js      mapa, colisiones, saltadores, muros de hielo, rayos y navegación (A*)
  src/render.js    sombreado toon, contornos, cielo, luz, pétalos, capa de la vista y calidad
  src/efectos.js   trazadoras, rayos, chispas, fogonazos y explosiones
  src/red.js       salas online (Supabase Realtime o BroadcastChannel)
  src/config.js    URL y clave pública de Supabase
  src/input.js     teclado, ratón y controles táctiles
  src/audio.js     sonidos generados con Web Audio
  src/ui.js        menú, HUD y pantallas
  src/datos.js     ajustes y estadísticas (localStorage)
  tests/prueba.mjs prueba con Playwright
```

## Pruebas

```bash
node hanamichi/tests/prueba.mjs
```

Comprueba que los cuatro héroes pueden usar sus tres poderes, que el jugador muere y reaparece, que la partida termina al llegar a 20 bajas, juega una partida completa solo con bots, abre dos pestañas en la misma sala y verifica que una baja consta en las dos y que la anfitriona cambia cuando una se va. Falla si hay errores en la consola. Las capturas quedan en `hanamichi/tests/capturas/`.

## Incrustar en una web

```html
<iframe src="/hanamichi/" style="width:100%;height:100vh;border:0" allow="fullscreen; autoplay; clipboard-write"></iframe>
```

La web contenedora recibe mensajes `postMessage` con `{ fuente: 'hanamichi', tipo: 'inicio' | 'fin' | 'online', ... }`.

Al publicar cambios, sube `VERSION` en `hanamichi/sw.js`.
