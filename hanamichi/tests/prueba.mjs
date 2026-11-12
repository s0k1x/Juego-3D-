// Prueba de Hanamichi con Playwright: carga sin errores, prueba los cuatro héroes y sus poderes,
// juega una partida completa entre bots, comprueba el multijugador entre dos pestañas y hace capturas.
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
  return { fase: juego.fase, combatientes: juego.combatientes.length, llamadas: i.calls, triangulos: i.triangles, ratio: render.ratio };
});
// Avanza la simulación a mano (los fotogramas de swiftshader son lentos).
const pasos = (p, n, dt = 1 / 60) => p.evaluate(([n, dt]) => { const { juego } = window.hanamichi; for (let i = 0; i < n; i++) juego.actualizar(dt); }, [n, dt]);

const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const res = {};

// ---------- Escritorio: menú, partida, héroes y poderes ----------
{
  const ctx = await nav.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  vigilar(p, 'escritorio');
  await p.goto(URL_J);
  await p.waitForFunction(() => window.hanamichi && document.fonts.status === 'loaded');
  await espera(800);
  await p.screenshot({ path: join(SALIDA, 'escritorio-menu.png') });
  await p.click('#btnJugar');
  await pasos(p, 200);
  await espera(300);
  res.escritorio = await info(p);
  await p.screenshot({ path: join(SALIDA, 'escritorio-juego.png') });

  // Un rival delante, quieto, para ver modelo, nombre e impactos.
  const delante = () => p.evaluate(() => {
    const { juego } = window.hanamichi; const j = juego.jugador;
    for (const b of juego.bots.values()) b.p = { ...b.p, reaccion: 99, poderes: 0 };
    const r = juego.combatientes[1];
    r.pos.set(j.pos.x - Math.sin(j.yaw) * 6, j.pos.y, j.pos.z - Math.cos(j.yaw) * 6);
    r.yaw = j.yaw + Math.PI; j.pitch = -0.04; r.protegido = 0; j.protegido = 0;
  });
  // Cada héroe: reaparece con él y usa Q, E y la definitiva.
  res.heroes = {};
  for (const h of ['sakura', 'kaito', 'yuki', 'akane']) {
    await p.evaluate((h) => {
      const { juego } = window.hanamichi; const j = juego.jugador;
      juego.cambiarHeroe(h); juego._aparecer(j);
    }, h);
    await delante();
    await pasos(p, 5);
    const r = await p.evaluate(() => {
      const { juego } = window.hanamichi; const j = juego.jugador;
      const usados = [];
      for (const k of ['q', 'e']) { usados.push(juego.poderes.usar(j, k)); for (let i = 0; i < 30; i++) juego.actualizar(1 / 60); }
      j.carga = 100;
      usados.push(juego.poderes.usar(j, 'x'));
      for (let i = 0; i < 20; i++) juego.actualizar(1 / 60);
      return usados;
    });
    res.heroes[h] = r;
    await espera(150);
    await p.screenshot({ path: join(SALIDA, `escritorio-${h}.png`) });
  }
  // Recarga, katana y pistola (animaciones de la vista).
  await p.evaluate(() => { const { juego } = window.hanamichi; juego.cambiarHeroe('sakura'); juego._aparecer(juego.jugador); });
  await delante();
  await p.evaluate(() => { const a = window.hanamichi.juego.jugador.arsenal; a.municion.rifle = 2; a.recargar(); });
  await pasos(p, 40);
  await p.screenshot({ path: join(SALIDA, 'escritorio-recarga.png') });
  await p.evaluate(() => { const { juego } = window.hanamichi; juego.jugador.arsenal.cambiar(2); });
  await pasos(p, 30);
  await p.evaluate(() => { const { juego } = window.hanamichi; juego.disparar(juego.jugador); });
  await pasos(p, 4);
  await p.screenshot({ path: join(SALIDA, 'escritorio-katana.png') });
  await p.keyboard.down('Tab');
  await pasos(p, 2);
  await p.screenshot({ path: join(SALIDA, 'escritorio-tabla.png') });
  await p.keyboard.up('Tab');
  // Muerte y reaparición.
  await p.evaluate(() => { const { juego } = window.hanamichi; juego.danar(juego.combatientes[1], juego.jugador, 500, { arma: 'rifle', cabeza: true }); });
  await pasos(p, 50);
  await p.screenshot({ path: join(SALIDA, 'escritorio-muerte.png') });
  await pasos(p, 200);
  res.reaparece = await p.evaluate(() => window.hanamichi.juego.jugador.vivo);
  // Final de partida.
  await p.evaluate(() => { const { juego } = window.hanamichi; const j = juego.jugador; j.bajas = 19; juego.danar(j, juego.combatientes[1], 500, { arma: 'rifle' }); });
  await pasos(p, 120);
  await espera(400);
  res.fin = await info(p);
  await p.screenshot({ path: join(SALIDA, 'escritorio-fin.png') });
  await ctx.close();
}

// ---------- Partida completa entre bots: que nada se rompa ----------
{
  const ctx = await nav.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  vigilar(p, 'simulacion');
  await p.goto(URL_J);
  await p.waitForFunction(() => window.hanamichi);
  res.simulacion = await p.evaluate(() => import('./src/bots.js').then(({ Bot }) => {
    const { juego } = window.hanamichi;
    juego.empezarPartida();
    juego.bots.set(juego.jugador.id, new Bot(juego.jugador, 'normal')); // el jugador también es un bot
    const t0 = performance.now();
    let n = 0;
    for (; n < 60 * 60 * 8 && juego.fase !== 'finPartida'; n++) juego.actualizar(1 / 60);
    const r = juego.ranking();
    return { fase: juego.fase, pasos: n, minutos: +(n / 3600).toFixed(1), ganador: r[0].nombre + ' (' + r[0].heroe + ') ' + r[0].bajas, bajas: r.map((c) => c.bajas).join(','), msPorPaso: +((performance.now() - t0) / n).toFixed(3) };
  }));
  await ctx.close();
}

// ---------- Multijugador entre dos pestañas (BroadcastChannel) ----------
{
  const ctx = await nav.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const a = await ctx.newPage(), b = await ctx.newPage();
  vigilar(a, 'red-a'); vigilar(b, 'red-b');
  await a.goto(URL_J + '?sala=PRUEBA&red=local');
  await espera(2500);
  await b.goto(URL_J + '?sala=PRUEBA&red=local');
  await espera(4000);
  const estado = (p) => p.evaluate(() => {
    const { juego } = window.hanamichi;
    return { anfitriona: juego.anfitriona, fase: juego.fase, partida: juego.partidaN, pares: juego.pares.size, entidades: juego.combatientes.length };
  });
  res.red = { a: await estado(a), b: await estado(b) };
  // A se queda quieta en una zona despejada (y sus bots no atacan); B se coloca delante y le dispara.
  await a.evaluate(() => {
    const { juego } = window.hanamichi;
    for (const bt of juego.bots.values()) bt.p = { ...bt.p, reaccion: 99, poderes: 0 };
    juego.jugador.pos.set(0, 0, 8); juego.jugador.vel.set(0, 0, 0); juego.jugador.protegido = 0;
  });
  await espera(600);
  // La baja debe constar en las dos pestañas.
  for (let i = 0; i < 40; i++) {
    await b.evaluate(() => {
      const { juego } = window.hanamichi; const j = juego.jugador;
      const o = juego.combatientes.find((c) => !c.local && !c.nombre.includes('(bot)'));
      for (const bt of juego.bots.values()) bt.p = { ...bt.p, reaccion: 99 };
      if (!o || !o.vivo) { juego.input.disparando = false; return; }
      j.pos.set(0, 0, 12); j.vel.set(0, 0, 0);
      j.yaw = 0; j.pitch = Math.atan2(o.pos.y + 1.15 - (j.pos.y + j.ojos), 4); j.protegido = 0;
      juego.input.disparando = true;
    });
    await espera(100);
  }
  await b.evaluate(() => { window.hanamichi.juego.input.disparando = false; });
  await espera(1500);
  const bajas = (p) => p.evaluate(() => { const { juego } = window.hanamichi; return juego.combatientes.filter((c) => !c.nombre.includes('(bot)')).map((c) => `${c.local ? 'yo' : 'otro'}:${c.bajas}/${c.muertes}`).join(' '); });
  res.red.bajasA = await bajas(a);
  res.red.bajasB = await bajas(b);
  await b.screenshot({ path: join(SALIDA, 'red-juego.png') });
  await a.close();
  await espera(8000);
  res.red.trasIrseA = await estado(b);
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
  await pasos(p, 200);
  await espera(300);
  res.movil = await info(p);
  await p.screenshot({ path: join(SALIDA, 'movil-juego.png') });
  await ctx.close();
}

await nav.close();
srv.close();
console.log(JSON.stringify(res, null, 2));
const fallos = [];
if (res.simulacion.fase !== 'finPartida') fallos.push('la partida entre bots no ha terminado');
for (const [h, u] of Object.entries(res.heroes)) if (u.some((x) => !x)) fallos.push(`${h}: algún poder no se ha podido usar (${u})`);
if (!res.reaparece) fallos.push('el jugador no reaparece');
if (res.fin.fase !== 'finPartida') fallos.push('la partida no termina al llegar a 20 bajas');
if (res.red.a.pares !== 1 || res.red.b.pares !== 1) fallos.push('las dos pestañas no se ven');
if (!res.red.bajasA.includes('otro:1/') || !res.red.bajasB.includes('yo:1/')) fallos.push('la baja online no consta en las dos pestañas');
if (!res.red.trasIrseA.anfitriona) fallos.push('B no ha pasado a ser la anfitriona');
if (errores.length) fallos.push('errores en consola:\n' + [...new Set(errores)].join('\n'));
if (fallos.length) { console.log('FALLOS:\n' + fallos.join('\n')); process.exit(1); }
console.log('Todo correcto, sin errores en consola.');
