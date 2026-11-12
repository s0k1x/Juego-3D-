// Prueba de humo con Playwright: carga sin errores, juega un poco y hace capturas.
// Uso: node tests/smoke.mjs   (capturas en tests/capturas/)
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(require.resolve('playwright', { paths: ['/opt/node-tools/node_modules'] })); }
const { chromium, devices } = playwright;

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SALIDA = join(RAIZ, 'tests', 'capturas');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

// Servidor estático mínimo (los módulos ES no funcionan con file://).
const servidor = http.createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const archivo = join(RAIZ, ruta.endsWith('/') ? ruta + 'index.html' : ruta);
  try {
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream' });
    res.end(datos);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const URL_JUEGO = `http://127.0.0.1:${servidor.address().port}/`;
await mkdir(SALIDA, { recursive: true });

const errores = [];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function vigilar(page, nombre) {
  page.on('console', (m) => { if (m.type() === 'error') errores.push(`[${nombre}] consola: ${m.text()}`); });
  page.on('pageerror', (e) => errores.push(`[${nombre}] excepción: ${e.message}`));
  page.on('requestfailed', (r) => errores.push(`[${nombre}] petición fallida: ${r.url()}`));
}

async function fps(page, ms = 2000) {
  return page.evaluate((ms) => new Promise((ok) => {
    let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else ok(Math.round(n / ((performance.now() - t0) / 1000))); };
    requestAnimationFrame(f);
  }), ms);
}

const navegador = await chromium.launch();
const resultados = {};

// ---------- Escritorio ----------
{
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  vigilar(page, 'escritorio');
  await page.goto(URL_JUEGO);
  await page.waitForFunction(() => document.fonts.status === 'loaded' && window.tinta);
  await espera(400);
  await page.screenshot({ path: join(SALIDA, 'escritorio-inicio.png') });

  await page.click('#btnJugar');
  await page.mouse.move(900, 300);
  await page.mouse.down();
  await page.keyboard.down('KeyD');
  await espera(1200);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyW');
  await espera(1500);
  await page.keyboard.up('KeyW');
  await page.mouse.move(400, 500);
  await espera(2500);
  await page.screenshot({ path: join(SALIDA, 'escritorio-juego.png') });

  // Saltamos a la oleada 5 para ver al jefe, con el jugador protegido.
  await page.evaluate(() => {
    const j = window.tinta.juego;
    j.cola = []; j.enemigos.limpiar(); j.oleada = 4; j.descanso = 0;
    j.jugador.invulnerable = 60; j.jugador.aplicarPoder('triple'); j.jugador.aplicarPoder('escudo');
  });
  await espera(3500);
  resultados.fpsEscritorio = await fps(page);
  await page.screenshot({ path: join(SALIDA, 'escritorio-jefe.png') });
  resultados.jefe = await page.evaluate(() => !!window.tinta.juego.enemigos.jefe);

  // Golpe: tinta descuadrada.
  await page.evaluate(() => { const j = window.tinta.juego; j.jugador.invulnerable = 0; j.jugador.cargasEscudo = 0; j._danoJugador(1, 0, 0); });
  await espera(90);
  await page.screenshot({ path: join(SALIDA, 'escritorio-golpe.png') });

  await page.mouse.up();
  await page.keyboard.press('KeyP');
  await espera(200);
  resultados.pausa = await page.evaluate(() => window.tinta.juego.estado);
  await page.screenshot({ path: join(SALIDA, 'escritorio-pausa.png') });
  await page.click('#btnSeguir');

  // Fin de partida y récord.
  await page.evaluate(() => { const j = window.tinta.juego; j.puntos = 12480; j.jugador.vida = 1; j.jugador.invulnerable = 0; j.jugador.cargasEscudo = 0; j._danoJugador(1, j.jugador.x, j.jugador.y); });
  await espera(2600);
  resultados.fin = await page.evaluate(() => window.tinta.juego.estado);
  resultados.record = await page.evaluate(() => localStorage.getItem('tinta:record'));
  await page.screenshot({ path: join(SALIDA, 'escritorio-fin.png') });
  await ctx.close();
}

// ---------- Móvil ----------
{
  const ctx = await navegador.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  vigilar(page, 'movil');
  await page.goto(URL_JUEGO);
  await page.waitForFunction(() => document.fonts.status === 'loaded' && window.tinta);
  await espera(400);
  await page.screenshot({ path: join(SALIDA, 'movil-inicio.png') });
  await page.tap('#btnJugar');

  // Simulamos los dos pulgares con eventos de puntero táctiles.
  const toque = (tipo, id, x, y) => page.evaluate(([tipo, id, x, y]) => {
    document.getElementById('lienzo').dispatchEvent(new PointerEvent(tipo, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }));
  }, [tipo, id, x, y]);
  const vp = page.viewportSize();
  await toque('pointerdown', 1, 80, vp.height - 140);
  await toque('pointermove', 1, 130, vp.height - 170);
  await toque('pointerdown', 2, vp.width - 90, vp.height - 140);
  await toque('pointermove', 2, vp.width - 40, vp.height - 190);
  await espera(2500);
  resultados.disparoTactil = await page.evaluate(() => window.tinta.juego.input.firing);
  resultados.fpsMovil = await fps(page);
  await page.screenshot({ path: join(SALIDA, 'movil-juego.png') });
  await toque('pointerup', 1, 0, 0);
  await toque('pointerup', 2, 0, 0);

  // Horizontal.
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await espera(600);
  await page.screenshot({ path: join(SALIDA, 'movil-horizontal.png') });
  await ctx.close();
}

await navegador.close();
servidor.close();

console.log(JSON.stringify(resultados, null, 2));
if (errores.length) { console.log('ERRORES:\n' + errores.join('\n')); process.exit(1); }
console.log('Sin errores en consola. Capturas en tests/capturas/');
