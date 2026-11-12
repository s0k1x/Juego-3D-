// Prueba de Hanamichi con Playwright: carga sin errores, juega un duelo corto y hace capturas.
// Uso: node hanamichi/tests/prueba.mjs   (capturas en hanamichi/tests/capturas/)
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(require.resolve('playwright', { paths: ['/opt/node-tools/node_modules'] })); }
const { chromium, devices } = pw;

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SALIDA = join(RAIZ, 'tests', 'capturas');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const f = join(RAIZ, ruta.endsWith('/') ? ruta + 'index.html' : ruta);
  try { const d = await readFile(f); res.writeHead(200, { 'Content-Type': TIPOS[extname(f)] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const URL_J = `http://127.0.0.1:${srv.address().port}/`;
await mkdir(SALIDA, { recursive: true });

const errores = [];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const vigilar = (p, n) => {
  p.on('console', (m) => { if (m.type() === 'error') errores.push(`[${n}] ${m.text()}`); });
  p.on('pageerror', (e) => errores.push(`[${n}] excepción: ${e.message}`));
  p.on('requestfailed', (r) => errores.push(`[${n}] fallo: ${r.url()}`));
};
const info = (p) => p.evaluate(() => {
  const { juego, render } = window.hanamichi;
  const i = render.renderer.info.render;
  return { fase: juego.fase, ronda: juego.ronda, marcador: juego.marcador, llamadas: i.calls, triangulos: i.triangles, vida: [juego.jugador.vida, juego.rival.vida], ratio: render.ratio };
});

const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const res = {};

// ---------- Escritorio ----------
{
  const ctx = await nav.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  vigilar(p, 'escritorio');
  await p.goto(URL_J);
  await p.waitForFunction(() => window.hanamichi && document.fonts.status === 'loaded');
  await espera(800);
  await p.screenshot({ path: join(SALIDA, 'escritorio-menu.png') });
  await p.click('#btnJugar');
  await espera(3600); // cuenta atrás
  // Simulamos movimiento y disparos (sin bloqueo de puntero en modo headless).
  await p.evaluate(() => { const { juego } = window.hanamichi; juego.input.disparando = true; });
  await p.keyboard.down('KeyW');
  await espera(1500);
  await p.keyboard.up('KeyW');
  await p.evaluate(() => { const { juego } = window.hanamichi; juego.input.disparando = false; });
  res.escritorio = await info(p);
  await p.screenshot({ path: join(SALIDA, 'escritorio-juego.png') });
  // Colocamos al rival delante para ver el impacto y el personaje.
  await p.evaluate(() => {
    const { juego } = window.hanamichi;
    const j = juego.jugador, r = juego.rival;
    r.pos.set(j.pos.x + Math.sin(j.yaw) * -6, 0, j.pos.z + Math.cos(j.yaw) * -6);
    j.pitch = -0.05;
    juego.bot.p = { ...juego.bot.p, reaccion: 99 };
  });
  await espera(300);
  await p.screenshot({ path: join(SALIDA, 'escritorio-rival.png') });
  await p.keyboard.press('KeyV');
  await espera(300);
  await p.screenshot({ path: join(SALIDA, 'escritorio-primera.png') });
  // Ronda ganada -> toma final.
  await p.evaluate(() => { const { juego } = window.hanamichi; juego._aplicarDano(juego.jugador, juego.rival, 200, true); });
  await espera(900);
  await p.screenshot({ path: join(SALIDA, 'escritorio-toma-final.png') });
  // Final de partida.
  await p.evaluate(() => { const { juego } = window.hanamichi; juego.marcador = [4, 2]; });
  await p.waitForFunction(() => window.hanamichi.juego.fase === 'combate', null, { timeout: 20000 });
  await p.evaluate(() => { const { juego } = window.hanamichi; juego._aplicarDano(juego.jugador, juego.rival, 200, false); });
  await p.waitForFunction(() => window.hanamichi.juego.fase === 'finPartida', null, { timeout: 20000 });
  await espera(3600);
  res.fin = await info(p);
  await p.screenshot({ path: join(SALIDA, 'escritorio-fin.png') });
  await ctx.close();
}

// ---------- Duelo largo bot contra bot: que nada se rompa ----------
{
  const ctx = await nav.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  vigilar(p, 'simulacion');
  await p.goto(URL_J);
  await p.waitForFunction(() => window.hanamichi);
  res.simulacion = await p.evaluate(() => {
    const { juego } = window.hanamichi;
    juego.empezarPartida();
    // El jugador también lo controla un bot.
    return import('./src/bots.js').then(({ Bot }) => {
      const bj = new Bot(juego.jugador, 'normal');
      const rivalReal = juego.rival;
      const t0 = performance.now();
      let rondas = 0, ultima = 0;
      for (let i = 0; i < 60 * 60 * 4 && juego.fase !== 'finPartida'; i++) {
        // Para el bot del jugador, "jugador" es el rival.
        const vista = { ...juego, jugador: rivalReal, mapa: juego.mapa, fase: juego.fase, lanzarGranada: (c, e) => juego.lanzarGranada(c, e), disparoHecho: juego.disparoHecho };
        const I = bj.pensar(1 / 60, vista);
        juego.input.mover.x = I.x; juego.input.mover.y = I.y;
        juego.input.disparando = I.disparar;
        juego.input.mirar.x = 0; juego.input.mirar.y = 0;
        juego.actualizar(1 / 60);
        if (juego.ronda !== ultima) { ultima = juego.ronda; rondas++; bj.reiniciar(); }
      }
      return { fase: juego.fase, marcador: juego.marcador, rondas, msPorPaso: +((performance.now() - t0) / (60 * 60 * 4)).toFixed(3) };
    });
  });
  await ctx.close();
}

// ---------- Móvil ----------
{
  const ctx = await nav.newContext({ ...devices['iPhone 13 landscape'] });
  const p = await ctx.newPage();
  vigilar(p, 'movil');
  await p.goto(URL_J);
  await p.waitForFunction(() => window.hanamichi && document.fonts.status === 'loaded');
  await espera(800);
  await p.screenshot({ path: join(SALIDA, 'movil-menu.png') });
  await p.tap('#btnJugar');
  await espera(3600);
  res.movil = await info(p);
  await p.screenshot({ path: join(SALIDA, 'movil-juego.png') });
  await ctx.close();
}

await nav.close();
srv.close();
console.log(JSON.stringify(res, null, 2));
if (errores.length) { console.log('ERRORES:\n' + [...new Set(errores)].join('\n')); process.exit(1); }
console.log('Sin errores en consola.');
