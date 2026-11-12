# Memoria del proyecto (Tinta)

- Juego web estático: no hay dotnet ni CI aquí; la comprobación es `node tests/smoke.mjs` (Playwright ya instalado en el entorno, se resuelve desde /opt/node-tools).
- Los agentes `aurevix-*` solo existen tras reiniciar la sesión; mientras tanto se usa `general-purpose` con `model: sonnet`.
- `window.tinta.juego` da acceso al estado para pruebas (saltar a oleada 5: `cola=[]; enemigos.limpiar(); oleada=4; descanso=0`).
- El jefe recibe muchos impactos: nunca pintarlo entero de blanco al destellar (solo el contorno).
- Fuentes descargadas de Google Fonts con User-Agent de Chrome para obtener woff2 latino.
