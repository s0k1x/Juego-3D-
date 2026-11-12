# Memoria del proyecto (Tinta)

- Juego web estático: no hay dotnet ni CI aquí; la comprobación es `node tests/smoke.mjs` (Playwright ya instalado en el entorno, se resuelve desde /opt/node-tools).
- Los agentes `aurevix-*` solo existen tras reiniciar la sesión; mientras tanto se usa `general-purpose` con `model: sonnet`.
- `window.tinta.juego` da acceso al estado para pruebas (saltar a oleada 5: `cola=[]; enemigos.limpiar(); oleada=4; descanso=0`).
- El jefe recibe muchos impactos: nunca pintarlo entero de blanco al destellar (solo el contorno).
- Fuentes descargadas de Google Fonts con User-Agent de Chrome para obtener woff2 latino.
- Hanamichi (3D) en hanamichi/; Tinta movida a tinta/. Prueba: `node hanamichi/tests/prueba.mjs` (Chromium con --use-angle=swiftshader; los FPS ahí no son reales, mirar llamadas de dibujo).
- Fuentes CJK: pedir a Google Fonts con `&text=花道` para un subconjunto mínimo.
- Rotación de brazos del personaje: rotation.x = PI/2 es "al frente" (el brazo cuelga en -Y y el modelo mira a -Z).
- Hanamichi 2: arena FFA en primera persona con 4 héroes (src/heroes.js, src/poderes.js) y vista en capa aparte (src/vista.js, render.escenaVista).
- Online: Supabase Realtime (proyecto Sok1x, clave anon en src/config.js). Desde el contenedor *.supabase.co está bloqueado por el proxy; se prueba con `?sala=X&red=local` (BroadcastChannel, dos pestañas).
- En la prueba, avanzar la simulación con `juego.actualizar(1/60)` en bucle: los fotogramas de swiftshader son lentos.
