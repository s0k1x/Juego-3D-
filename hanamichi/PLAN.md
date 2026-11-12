# Plan maestro: Hanamichi con acabado profesional

Objetivo: que Hanamichi sea y parezca un juego profesional, y que todo funcione. Regla de oro:
`node hanamichi/tests/prueba.mjs` debe terminar con «Todo correcto» antes de subir nada.

## Reparto (cada agente es dueño de sus archivos; nadie toca los de otro)

| Agente | Modelo | Archivos | Trabajo |
|---|---|---|---|
| Director (hilo principal) | el más capaz | juego.js, jugador.js, vista.js, poderes.js, bots.js, render.js, efectos.js, main.js, pruebas | Plan, jugabilidad, integrar, corregir fallos, revisar capturas, subir |
| Revisor | Sonnet (solo lee) | — | Auditar la lógica y la red; lista de fallos reales con archivo:línea |
| Sonido | Sonnet | audio.js | Música procedural (menú y combate), ambiente, mezcla y sonidos con más pegada |
| Escenario | Sonnet | mapa.js | Azotea con más vida: neones, antenas, farolillos, tuberías, carteles; sin romper colisiones ni rutas |
| Interfaz | Sonnet | index.html, estilo.css, ui.js | Pantalla de carga, guía de primera partida, menú y HUD pulidos, móvil, accesibilidad |

## Lista de trabajo

1. Fallos: lo que encuentre el Revisor + los que salgan en las pruebas.
2. Jugabilidad: botiquines, pegada de los disparos (hit-stop, casquillos, impactos), equilibrio de héroes y bots.
3. Sonido: música y ambiente con control de volumen propio.
4. Escenario: decoración y luz.
5. Interfaz: primera impresión, claridad del HUD, móvil.
6. Integración, prueba completa, capturas revisadas, README y subida.
