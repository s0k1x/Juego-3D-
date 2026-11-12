// Prueba de Hanamichi Duelos con Playwright: carga sin errores, prueba todas las armas y utilidades,
// rondas y final de partida, juega partidas completas entre bots en los tres mapas, comprueba el
// multijugador entre dos pestañas y hace capturas.
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
  return { fase: juego.fase, mapa: juego.mapa.id, ronda: juego.ronda, marcador: juego.marcador, combatientes: juego.combatientes.length, llamadas: i.calls, triangulos: i.triangles };
});
// Avanza la simulación a mano (los fotogramas de swiftshader son lentos).
const pasos = (p, n, dt = 1 / 60) => p.evaluate(([n, dt]) => { const { juego } = window.hanamichi; for (let i = 0; i < n; i++) juego.actualizar(dt); }, [n, dt]);

const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const res = {};
const SOLO = process.argv[2]; // opcional: escritorio | bots | red | movil

// ---------- Escritorio: menú, armas, utilidades, rondas y final ----------
if (!SOLO || SOLO === 'escritorio') {
  const ctx = await nav.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  vigilar(p, 'escritorio');
  await p.goto(URL_J);
  await p.waitForFunction(() => window.hanamichi && document.fonts.status === 'loaded');
  await espera(800);
  await p.screenshot({ path: join(SALIDA, 'escritorio-menu.png') });
  await p.evaluate(() => { const { juego } = window.hanamichi; juego.config.modo = '1v1'; juego.config.mapa = 'azotea'; });
  await p.click('#btnJugar');
  await pasos(p, 100);
  await espera(200);
  await p.screenshot({ path: join(SALIDA, 'escritorio-cuenta.png') });
  await pasos(p, 120);
  res.escritorio = await info(p);
  // El rival delante, quieto, para ver modelo, nombre e impactos.
  const delante = (d = 6) => p.evaluate((d) => {
    const { juego } = window.hanamichi; const j = juego.jugador;
    for (const b of juego.bots.values()) b.p = { ...b.p, reaccion: 99, poderes: 0 };
    const r = juego.combatientes.find((c) => !c.aliado);
    j.pos.set(0, 0, 10); j.vel.set(0, 0, 0); j.yaw = 0; j.pitch = -0.03;
    r.pos.set(0, 0, 10 - d); r.vel.set(0, 0, 0); r.yaw = Math.PI; r.vida = 100; r.vivo = true;
  }, d);
  await delante();
  await pasos(p, 10);
  await espera(200);
  await p.screenshot({ path: join(SALIDA, 'escritorio-juego.png') });
  // Cada arma: se empuña, dispara o golpea y hace daño al rival que tiene delante.
  res.armas = {};
  for (const [ranura, ids] of [['principal', ['vector', 'trueno', 'aguja', 'avispa', 'cometa']], ['secundaria', ['chispa', 'sentencia', 'eco']], ['cuerpo', ['filo', 'yunque', 'colmillo']]]) {
    for (const id of ids) {
      await delante(ranura === 'cuerpo' ? 1.8 : 6);
      res.armas[id] = await p.evaluate(([ranura, id]) => {
        const { juego } = window.hanamichi; const j = juego.jugador;
        const r = juego.combatientes.find((c) => !c.aliado);
        juego.cambiarEquipo({ ...juego.config.equipo, [ranura]: id });
        j.arsenal.reiniciar(juego.config.equipo);
        j.arsenal.cambiar({ principal: 0, secundaria: 1, cuerpo: 2 }[ranura]);
        for (let i = 0; i < 50; i++) juego.actualizar(1 / 60);
        const antes = r.vida;
        juego.input.disparando = true;
        for (let i = 0; i < 12; i++) juego.actualizar(1 / 60);
        juego.input.disparando = false;
        for (let i = 0; i < 40; i++) juego.actualizar(1 / 60);
        return Math.round(antes - r.vida);
      }, [ranura, id]);
      await espera(120);
      await p.screenshot({ path: join(SALIDA, `arma-${id}.png`) });
    }
  }
  // Recarga a medias (para ver la animación).
  await p.evaluate(() => { const { juego } = window.hanamichi; const j = juego.jugador; juego.cambiarEquipo({ ...juego.config.equipo, principal: 'vector' }); j.arsenal.reiniciar(juego.config.equipo); for (let i = 0; i < 40; i++) juego.actualizar(1 / 60); j.arsenal.municion.vector = 3; j.arsenal.recargar(); for (let i = 0; i < 45; i++) juego.actualizar(1 / 60); });
  await espera(120);
  await p.screenshot({ path: join(SALIDA, 'escritorio-recarga.png') });
  // Cada utilidad se puede usar.
  res.utilidades = {};
  for (const id of ['petardo', 'humo', 'destello', 'muro', 'botiquin']) {
    await delante(12);
    res.utilidades[id] = await p.evaluate((id) => {
      const { juego } = window.hanamichi; const j = juego.jugador;
      juego.cambiarEquipo({ ...juego.config.equipo, utilidad: id });
      j.arsenal.reiniciar(juego.config.equipo);
      j.vida = 40;
      const ok = juego.utilidades.usar(j);
      for (let i = 0; i < 100; i++) juego.actualizar(1 / 60);
      return ok;
    }, id);
    await espera(120);
    await p.screenshot({ path: join(SALIDA, `utilidad-${id}.png`) });
  }
  await p.keyboard.down('Tab');
  await pasos(p, 2);
  await p.screenshot({ path: join(SALIDA, 'escritorio-tabla.png') });
  await p.keyboard.up('Tab');
  // Ronda ganada: marcador, toma final y siguiente ronda.
  await delante();
  await p.evaluate(() => { const { juego } = window.hanamichi; juego.danar(juego.jugador, juego.combatientes.find((c) => !c.aliado), 500, { arma: 'vector', cabeza: true }); });
  await pasos(p, 30);
  await espera(200);
  await p.screenshot({ path: join(SALIDA, 'escritorio-fin-ronda.png') });
  res.trasRonda = await p.evaluate(() => { const { juego } = window.hanamichi; return { fase: juego.fase, marcador: juego.marcador }; });
  await pasos(p, 60 * 9);
  res.ronda2 = await info(p);
  // Ronda perdida: el jugador cae y ve la tarjeta de eliminado.
  await p.evaluate(() => { const { juego } = window.hanamichi; juego.danar(juego.combatientes.find((c) => !c.aliado), juego.jugador, 500, { arma: 'aguja', cabeza: true }); });
  await pasos(p, 40);
  await espera(200);
  await p.screenshot({ path: join(SALIDA, 'escritorio-muerte.png') });
  await pasos(p, 60 * 9);
  res.ronda3 = await info(p);
  // Final de partida.
  await p.evaluate(() => { const { juego } = window.hanamichi; const e = juego.jugador.equipo; juego.marcadorEq[e] = 4; juego.danar(juego.jugador, juego.combatientes.find((c) => !c.aliado), 500, { arma: 'vector' }); });
  await pasos(p, 60 * 6);
  await espera(400);
  res.fin = await info(p);
  await p.screenshot({ path: join(SALIDA, 'escritorio-fin.png') });
  await ctx.close();
}

// ---------- Partidas completas entre bots en los tres mapas: que nada se rompa ----------
if (!SOLO || SOLO === 'bots') {
  const ctx = await nav.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  vigilar(p, 'simulacion');
  await p.goto(URL_J);
  await p.waitForFunction(() => window.hanamichi);
  res.simulacion = {};
  for (const [mapa, modo] of [['azotea', '2v2'], ['muelle', '3v3'], ['patio', '1v1']]) {
    res.simulacion[mapa] = await p.evaluate(([mapa, modo]) => import('./src/bots.js').then(({ Bot }) => {
      const { juego } = window.hanamichi;
      juego.config.modo = modo; juego.config.mapa = mapa;
      juego.empezarPartida();
      juego.bots.set(juego.jugador.id, new Bot(juego.jugador, 'normal')); // el jugador también es un bot
      const t0 = performance.now();
      let n = 0, porTiempo = 0, ultima = 0;
      for (; n < 60 * 60 * 14 && juego.fase !== 'finPartida'; n++) {
        juego.actualizar(1 / 60);
        if (juego.fase === 'finRonda' && juego.ronda !== ultima) { ultima = juego.ronda; if (juego.motivoRonda === 'tiempo') porTiempo++; }
      }
      return { modo, mapaCargado: juego.mapa.id, fase: juego.fase, minutos: +(n / 3600).toFixed(1), rondas: juego.ronda, marcador: juego.marcador.join('-'), rondasPorTiempo: porTiempo, msPorPaso: +((performance.now() - t0) / n).toFixed(3) };
    }), [mapa, modo]);
    await espera(300);
    await p.screenshot({ path: join(SALIDA, `mapa-${mapa}.png`) });
    await p.evaluate(() => window.hanamichi.juego.salirAlMenu());
  }
  await ctx.close();
}

// ---------- Multijugador entre dos pestañas (BroadcastChannel) ----------
if (!SOLO || SOLO === 'red') {
  const ctx = await nav.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const a = await ctx.newPage(), b = await ctx.newPage();
  vigilar(a, 'red-a'); vigilar(b, 'red-b');
  const estado = (p) => p.evaluate(() => {
    const { juego } = window.hanamichi;
    return { anfitriona: juego.anfitriona, fase: juego.fase, partida: juego.partidaN, ronda: juego.ronda, mapa: juego.mapa.id, pares: juego.pares.size,
      equipo: juego.jugador.asignado ? juego.jugador.equipo : -1, vivo: juego.jugador.vivo, marcadorEq: juego.marcadorEq.join('-'),
      entidades: juego.combatientes.map((c) => `${c.nombre}${c.local ? '*' : ''}:e${c.asignado ? c.equipo : '?'}:${c.vivo ? 'vivo' : 'caido'}`).join(' ') };
  });
  const hasta = async (p, cond, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(cond)) return true; await espera(250); } return false; };
  await a.goto(URL_J + '?sala=PRUEBA&red=local');
  // A sola: se hace anfitriona y juega contra un bot.
  res.red = { aSola: await hasta(a, () => window.hanamichi?.juego.fase === 'combate' && window.hanamichi.juego.combatientes.length === 2) };
  await b.goto(URL_J + '?sala=PRUEBA&red=local');
  // B llega a mitad de ronda: espera mirando.
  res.red.bEspera = await hasta(b, () => { const j = window.hanamichi?.juego; return j && j.pares.size === 1 && j.ronda > 0 && !j.jugador.vivo; });
  res.red.a1 = await estado(a); res.red.b1 = await estado(b);
  // A gana la ronda contra su bot; en la siguiente, A y B se enfrentan sin bots.
  await a.evaluate(() => { const { juego } = window.hanamichi; juego.danar(juego.jugador, juego.combatientes.find((c) => c.local && c !== juego.jugador), 500, { arma: 'vector' }); });
  res.red.duelo = await hasta(b, () => { const j = window.hanamichi.juego; return j.fase === 'combate' && j.jugador.vivo && j.jugador.asignado && j.combatientes.length === 2; });
  res.red.a2 = await estado(a); res.red.b2 = await estado(b);
  // B dispara a A hasta eliminarla: la ronda debe acabar en las dos pestañas con el mismo marcador.
  await a.evaluate(() => { const j = window.hanamichi.juego.jugador; j.pos.set(0, 0, 3); j.vel.set(0, 0, 0); });
  await espera(500);
  for (let i = 0; i < 60; i++) {
    const fin = await b.evaluate(() => {
      const { juego } = window.hanamichi; const j = juego.jugador;
      const o = juego.combatientes.find((c) => !c.local);
      if (!o || !o.vivo || juego.fase !== 'combate') { juego.input.disparando = false; return true; }
      j.pos.set(o.pos.x, o.pos.y, o.pos.z + 5); j.vel.set(0, 0, 0);
      j.yaw = 0; j.pitch = Math.atan2(o.pos.y + 1.15 - (j.pos.y + j.ojos), 5);
      juego.input.disparando = true;
      return false;
    });
    if (fin) break;
    await espera(100);
  }
  await espera(1200);
  res.red.a3 = await estado(a); res.red.b3 = await estado(b);
  await b.screenshot({ path: join(SALIDA, 'red-juego.png') });
  await a.close();
  res.red.bAnfitriona = await hasta(b, () => { const j = window.hanamichi.juego; return j.anfitriona && j.pares.size === 0; }, 15000);
  res.red.bConBot = await hasta(b, () => { const j = window.hanamichi.juego; return j.fase === 'combate' && j.combatientes.length === 2 && j.bots.size === 1; }, 30000);
  res.red.b4 = await estado(b);
  await ctx.close();
}

// ---------- Móvil ----------
if (!SOLO || SOLO === 'movil') {
  const ctx = await nav.newContext({ ...devices['iPhone 13 landscape'] });
  const p = await ctx.newPage();
  vigilar(p, 'movil');
  await p.goto(URL_J);
  await p.waitForFunction(() => window.hanamichi && document.fonts.status === 'loaded');
  await espera(800);
  await p.screenshot({ path: join(SALIDA, 'movil-menu.png') });
  await p.tap('#btnJugar');
  await pasos(p, 260);
  await espera(300);
  res.movil = await info(p);
  await p.screenshot({ path: join(SALIDA, 'movil-juego.png') });
  await ctx.close();
}

await nav.close();
srv.close();
console.log(JSON.stringify(res, null, 2));
const fallos = [];
if (res.armas) for (const [id, d] of Object.entries(res.armas)) if (!(d > 0)) fallos.push(`${id}: no hace daño al rival que tiene delante`);
if (res.utilidades) for (const [id, ok] of Object.entries(res.utilidades)) if (!ok) fallos.push(`${id}: la utilidad no se ha podido usar`);
if (res.trasRonda && (res.trasRonda.fase !== 'finRonda' || res.trasRonda.marcador.join() !== '1,0')) fallos.push('ganar una ronda no suma en el marcador');
if (res.ronda2 && res.ronda2.ronda !== 2) fallos.push('no empieza la segunda ronda');
if (res.ronda3 && (res.ronda3.ronda !== 3 || res.ronda3.marcador.join() !== '1,1')) fallos.push('perder una ronda no suma al rival');
if (res.fin && res.fin.fase !== 'finPartida') fallos.push('la partida no termina al llegar a 5 rondas');
if (res.simulacion) for (const [m, r] of Object.entries(res.simulacion)) {
  if (r.fase !== 'finPartida') fallos.push(`${m}: la partida entre bots no ha terminado`);
  if (r.mapaCargado !== m) fallos.push(`${m}: no se ha cargado ese mapa`);
  if (r.rondasPorTiempo > r.rondas / 2) fallos.push(`${m}: demasiadas rondas acaban por tiempo (${r.rondasPorTiempo} de ${r.rondas}): los bots no se encuentran`);
}
if (res.red) {
  const r = res.red;
  if (!r.aSola) fallos.push('online: la primera jugadora no empieza contra un bot');
  if (!r.bEspera) fallos.push('online: quien llega a mitad de ronda no se queda esperando');
  if (!r.duelo) fallos.push('online: no empieza el duelo entre las dos jugadoras');
  else if (r.a2.equipo === r.b2.equipo) fallos.push('online: las dos jugadoras están en el mismo equipo');
  if (r.a3.marcadorEq !== r.b3.marcadorEq || r.a3.marcadorEq === r.a2.marcadorEq) fallos.push(`online: el marcador no coincide o no ha sumado (${r.a2.marcadorEq} → A ${r.a3.marcadorEq}, B ${r.b3.marcadorEq})`);
  if (!r.bAnfitriona) fallos.push('online: B no pasa a ser la anfitriona');
  if (!r.bConBot) fallos.push('online: B no recibe un bot al quedarse sola');
}
if (errores.length) fallos.push('errores en consola:\n' + [...new Set(errores)].join('\n'));
if (fallos.length) { console.log('FALLOS:\n' + fallos.join('\n')); process.exit(1); }
console.log('Todo correcto, sin errores en consola.');
