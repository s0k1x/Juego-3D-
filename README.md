# Juego-3D

Juegos para navegador, sin frameworks ni archivos externos, que funcionan sin conexión.

- **[Hanamichi](hanamichi/)**: duelos anime en 3D (Three.js). Es el juego principal.
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

Duelos uno contra uno con estética anime sobre una azotea al atardecer. Gana quien se lleve cinco rondas. Es un juego del mismo género que los shooters competitivos de duelos, con personajes, armas y mapa propios.

## Cómo se juega

- **Rondas:** las rondas duran 80 segundos. Si se acaba el tiempo, gana quien conserve más vida. Los jugadores cambian de lado en cada ronda.
- **Armas:** eliges un arma principal entre el Rifle Hikari, la Escopeta Raijin y el Francotirador Tsuki. Además llevas la Pistola Kaze, la Katana Hana (hace más daño por la espalda) y una Granada Hanabi por ronda.
- **Movimiento:** puedes correr, saltar, hacer doble salto, deslizarte (incluido el salto deslizado) y agacharte.
- **Rival:** es un bot con tres niveles:
  - **Tranquilo**
  - **Equilibrado**
  - **Implacable**

  Solo te ve si hay línea de visión, tarda un tiempo en reaccionar y su puntería empieza con error y se va corrigiendo. Además se cubre para recargar, te busca y lanza granadas.
- **Feedback:**
  - marcador de impacto;
  - números de daño y «¡Crítico!» en los disparos a la cabeza;
  - indicador de la dirección desde la que te disparan;
  - cámara lenta y toma final girando alrededor del rival;
  - líneas de velocidad al correr.

### Controles

| | PC | Móvil |
|---|---|---|
| Moverse | W A S D (Mayús para correr) | Pulgar izquierdo; al fondo, corres |
| Mirar | Ratón (clic en el juego para capturarlo) | Arrastrar a la derecha |
| Disparar / apuntar | Clic / clic derecho | Botón rosa (también sirve para mirar) / Apuntar |
| Saltar, deslizarse | Espacio, C | Botones |
| Armas | 1 a 4, rueda; G lanza granada; R recarga | Botones |
| Cámara | V (tercera o primera persona) | Ajustes |
| Pausa | Esc o P | Botón superior |

## Rendimiento: solo se dibuja lo que se ve

- **Mapa por zonas:** el mapa está hecho de cajas fusionadas en zonas de 12 m, cada una con una sola malla y un solo contorno. La cámara descarta automáticamente las zonas que quedan fuera de la vista.
- **Personajes:** si un personaje queda fuera de cámara, no se calcula su animación.
- **Sombras:** solo se calculan alrededor del jugador, con un único foco de luz.
- **Pétalos:** se animan por completo en la tarjeta gráfica, sin coste para el procesador.
- **Armas:** su modelo se construye la primera vez que se equipan.
- **Efectos:** usan reservas fijas, así que no se crean objetos durante la partida.
- **Resolución adaptativa:** si un fotograma tarda más de lo que permiten los 60 FPS, baja la resolución. En los ajustes puedes elegir «Ligera», que además quita las sombras.
- **Peso de cada fotograma:** en las pruebas, entre 30 y 70 llamadas de dibujo y unos 16 000 triángulos. La lógica de un paso cuesta unos 0,03 ms.

## Estructura

```
hanamichi/
  index.html, manifest.webmanifest, sw.js (sin conexión)
  vendor/        three.js r170 y BufferGeometryUtils (licencia MIT)
  assets/        icono y tipografías (Dela Gothic One, M PLUS Rounded 1c; licencia OFL)
  src/main.js      arranque y bucle con delta time
  src/juego.js     rondas, disparos, impactos, granadas, katana y toma final
  src/jugador.js   física del combatiente y cámara
  src/personaje.js modelo anime y animaciones
  src/bots.js      inteligencia del rival
  src/armas.js     datos, munición y modelos de las armas
  src/mapa.js      mapa, colisiones, rayos y navegación (A*)
  src/render.js    sombreado toon, contornos, cielo, luz, pétalos y calidad
  src/efectos.js   trazadoras, chispas, fogonazos y explosiones
  src/input.js     teclado, ratón y controles táctiles
  src/audio.js     sonidos generados con Web Audio
  src/ui.js        menú, HUD y pantallas
  src/datos.js     ajustes y estadísticas (localStorage)
  src/red.js       avisos a la web contenedora y base para el modo online
  tests/prueba.mjs prueba con Playwright
```

## Pruebas

```bash
node hanamichi/tests/prueba.mjs
```

La prueba hace capturas en escritorio y en móvil horizontal y juega un duelo completo entre dos bots. Si aparece algún error en la consola, falla. Las capturas quedan en `hanamichi/tests/capturas/`.

## Incrustar en una web

```html
<iframe src="/hanamichi/" style="width:100%;height:100vh;border:0" allow="fullscreen; autoplay"></iframe>
```

La web contenedora recibe mensajes `postMessage` con `{ fuente: 'hanamichi', tipo: 'inicio' | 'fin', ... }`.

## Modo online (próximo paso)

`src/red.js` ya define la interfaz: `conectar(adaptador, sala)`, `enviarEstado()` y `alRecibir()`. El plan es usar Supabase Realtime con un canal por sala. Cada jugador envía su estado unas 20 veces por segundo, el rival se pinta interpolado en lugar del bot y los impactos los confirma quien los recibe.

Al publicar cambios, sube `VERSION` en `hanamichi/sw.js`.
