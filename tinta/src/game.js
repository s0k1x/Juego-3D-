// Núcleo del juego: estados, oleadas, colisiones, cámara y dibujo.
import { TINTA, ARENA, FUENTE, clamp, lerp, rand, dist2, pesoAleatorio, trama } from './util.js';
import { Jugador, PODERES } from './player.js';
import { Enemigos, TIPOS } from './enemies.js';
import { Balas } from './bullets.js';
import { Efectos } from './fx.js';
import { marcadores, avisarWeb } from './storage.js';

const VISTA = 640; // unidades de mundo visibles en el lado corto de la pantalla

export class Juego {
  constructor({ canvas, input, audio, ui }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.input = input;
    this.audio = audio;
    this.ui = ui;
    this.jugador = new Jugador();
    this.enemigos = new Enemigos();
    this.balas = new Balas();
    this.fx = new Efectos();
    this.botin = Array.from({ length: 16 }, () => ({ activo: false }));
    this.estado = 'inicio';
    this.t = 0;
    this.cam = { x: ARENA.w / 2, y: ARENA.h / 2, s: 1 };
    this.cw = 1; this.ch = 1; this.dpr = 1;
    this.manchas = Array.from({ length: 14 }, () => ({ x: rand(0, ARENA.w), y: rand(0, ARENA.h), r: rand(90, 260) }));
    this.record = { puntos: 0, oleada: 0 };
    this.redimensionar();
  }

  redimensionar() {
    const r = this.canvas.getBoundingClientRect();
    this.cw = Math.max(1, r.width); this.ch = Math.max(1, r.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.cam.s = clamp(Math.min(this.cw, this.ch) / VISTA, 0.42, 1.5);
    // En pantallas muy apaisadas, que se vea un poco más de arena.
    if (this.cw > this.ch * 1.6) this.cam.s *= 0.9;
  }

  pantallaAMundo(x, y) {
    return { x: (x - this.cw / 2) / this.cam.s + this.cam.x, y: (y - this.ch / 2) / this.cam.s + this.cam.y };
  }

  // ---------- Estados ----------
  async empezar() {
    this.jugador.reiniciar();
    this.enemigos.limpiar();
    this.balas.limpiar();
    this.fx.limpiar();
    for (const b of this.botin) b.activo = false;
    this.puntos = 0; this.combo = 1; this.tCombo = 0;
    this.oleada = 0;
    this.cola = [];
    this.tAparicion = 0;
    this.descanso = 0.6;
    this.tMuerte = 0;
    this.camaraLenta = 1;
    this.estado = 'jugando';
    this.input.activo = true;
    this.input.limpiar();
    this.ui.resetHud();
    this.ui.mostrar(null);
    this.canvas.classList.add('jugando');
    avisarWeb('inicio');
  }

  pausar() {
    if (this.estado !== 'jugando') return;
    this.estado = 'pausa';
    this.input.limpiar();
    this.ui.mostrar('pausa');
    this.canvas.classList.remove('jugando');
  }

  seguir() {
    if (this.estado !== 'pausa') return;
    this.estado = 'jugando';
    this.input.limpiar();
    this.ui.mostrar(null);
    this.canvas.classList.add('jugando');
  }

  irAInicio() {
    this.estado = 'inicio';
    this.input.activo = false;
    this.enemigos.limpiar();
    this.balas.limpiar();
    for (const b of this.botin) b.activo = false;
    this.ui.record(this.record);
    this.ui.mostrar('inicio');
    this.canvas.classList.remove('jugando');
  }

  async terminar() {
    this.estado = 'fin';
    this.input.activo = false;
    this.canvas.classList.remove('jugando');
    const partida = { puntos: Math.floor(this.puntos), oleada: this.oleada };
    const { record, nuevo } = await marcadores.guardarPartida(partida);
    this.record = record;
    this.ui.fin({ ...partida, record, nuevo });
    this.ui.mostrar('fin');
    avisarWeb('fin', { ...partida, nuevoRecord: nuevo });
  }

  // ---------- Oleadas ----------
  get nivel() {
    const n = Math.max(1, this.oleada);
    return {
      n,
      vel: Math.min(1.6, 0.85 + n * 0.04),
      vida: 1 + (n - 1) * 0.08,
      cadencia: Math.min(1.8, 0.9 + n * 0.05),
    };
  }

  siguienteOleada() {
    this.oleada++;
    const n = this.oleada;
    const jefe = n % 5 === 0;
    const total = jefe ? 2 + Math.floor(n / 2) : Math.min(44, 5 + n * 2);
    const pesos = {
      aguja: 1 + n * 0.1,
      bloque: n >= 3 ? 0.25 + n * 0.05 : 0,
      ojo: n >= 2 ? 0.3 + n * 0.06 : 0,
    };
    this.cola = [];
    if (jefe) this.cola.push('prensa');
    for (let i = 0; i < total; i++) this.cola.push(pesoAleatorio(pesos));
    this.tAparicion = jefe ? 0 : 0.4;
    this.intervalo = Math.max(0.28, 1.15 - n * 0.045);
    if (jefe) {
      this.ui.aviso(`Oleada ${n}`, 'Llega La Prensa');
      this.audio.boss();
      this.fx.sacudir(0.4);
    } else {
      this.ui.aviso(`Oleada ${n}`, n === 1 ? 'Sobrevive todo lo que puedas' : '');
      this.audio.wave();
    }
  }

  _generar(dt) {
    if (!this.cola.length) return;
    this.tAparicion -= dt;
    if (this.tAparicion > 0) return;
    if (this.enemigos.vivos >= 26 + this.oleada) return;
    const grupo = Math.min(this.cola.length, 1 + Math.floor(Math.random() * Math.min(3, 1 + this.oleada / 4)));
    for (let i = 0; i < grupo; i++) {
      const tipo = this.cola.shift();
      const p = tipo === 'prensa' ? this._puntoJefe() : this._puntoAparicion(TIPOS[tipo].r);
      this.enemigos.crear(tipo, p.x, p.y, this.nivel);
    }
    this.tAparicion = this.intervalo * (0.7 + Math.random() * 0.6);
  }

  _puntoAparicion(r) {
    const j = this.jugador;
    for (let i = 0; i < 12; i++) {
      // Preferimos bordes de la arena, lejos del jugador.
      const borde = Math.random() < 0.7;
      const x = borde ? (Math.random() < 0.5 ? rand(r, 160) : rand(ARENA.w - 160, ARENA.w - r)) : rand(r, ARENA.w - r);
      const y = borde && Math.random() < 0.5 ? rand(r, ARENA.h - r) : (Math.random() < 0.5 ? rand(r, 160) : rand(ARENA.h - 160, ARENA.h - r));
      if (dist2(x, y, j.x, j.y) > 380 * 380) return { x, y };
    }
    return { x: j.x < ARENA.w / 2 ? ARENA.w - 80 : 80, y: j.y < ARENA.h / 2 ? ARENA.h - 80 : 80 };
  }

  _puntoJefe() {
    const j = this.jugador;
    return { x: j.x < ARENA.w / 2 ? ARENA.w * 0.75 : ARENA.w * 0.25, y: ARENA.h / 2 };
  }

  // ---------- Botín (power-ups) ----------
  _soltar(x, y, prob) {
    if (Math.random() > prob) return;
    const b = this.botin.find((i) => !i.activo);
    if (!b) return;
    const j = this.jugador;
    const pesos = { triple: 1, escudo: 0.8, velocidad: 0.8, vida: j.vida < j.maxVida ? 0.7 + (j.maxVida - j.vida) * 0.15 : 0.15 };
    Object.assign(b, { activo: true, x, y, tipo: pesoAleatorio(pesos), vida: 10, t: 0 });
  }

  _actualizarBotin(dt) {
    const j = this.jugador;
    for (const b of this.botin) {
      if (!b.activo) continue;
      b.vida -= dt; b.t += dt;
      if (b.vida <= 0) { b.activo = false; continue; }
      const d2 = dist2(b.x, b.y, j.x, j.y);
      if (d2 < 110 * 110) { // imán suave
        const d = Math.sqrt(d2) || 1;
        b.x += ((j.x - b.x) / d) * 260 * dt; b.y += ((j.y - b.y) / d) * 260 * dt;
      }
      if (d2 < (j.r + 16) ** 2) {
        b.activo = false;
        const aplicado = j.aplicarPoder(b.tipo);
        if (!aplicado) { this._sumar(500, b.x, b.y); }
        this.fx.onda(b.x, b.y, 10, 70, TINTA.menta, 0.4);
        this.fx.estallido(b.x, b.y, TINTA.menta, 12, 180, 2.5);
        this.fx.texto(b.x, b.y - 24, PODERES[b.tipo].nombre, TINTA.menta);
        this.audio.powerup();
      }
    }
  }

  _sumar(p, x, y) {
    const total = Math.round(p * Math.floor(this.combo));
    this.puntos += total;
    this.fx.texto(x, y, '+' + total, this.combo > 2 ? TINTA.azafran : TINTA.tiza);
  }

  // ---------- Colisiones ----------
  _colisiones() {
    const j = this.jugador;
    const balas = this.balas.items;
    const enemigos = this.enemigos.items;

    for (const b of balas) {
      if (!b.activa) continue;
      if (b.enemiga) {
        if (j.vivo && dist2(b.x, b.y, j.x, j.y) < (b.r + j.r - 3) ** 2) {
          b.activa = false;
          this._danoJugador(1, b.x, b.y);
        }
        continue;
      }
      for (const e of enemigos) {
        if (!e.activo || e.aparicion > 0) continue;
        if (dist2(b.x, b.y, e.x, e.y) >= (b.r + e.r) ** 2) continue;
        b.activa = false;
        e.vida -= b.dmg;
        e.destello = 0.06;
        const emp = TIPOS[e.tipo].empuje * 60;
        e.x += (b.vx / 760) * emp * 0.2; e.y += (b.vy / 760) * emp * 0.2;
        this.fx.chispas(b.x, b.y, Math.atan2(-b.vy, -b.vx), TINTA.azafran, 4);
        this.audio.hit();
        if (e.vida <= 0) this._matar(e);
        break;
      }
    }

    if (!j.vivo) return;
    for (const e of enemigos) {
      if (!e.activo || e.aparicion > 0) continue;
      if (dist2(e.x, e.y, j.x, j.y) < (e.r + j.r - 2) ** 2) {
        const r = this._danoJugador(TIPOS[e.tipo].dmg, e.x, e.y);
        if (r) {
          // Empuja al jugador y, si es una aguja, la destruye al chocar.
          const a = Math.atan2(j.y - e.y, j.x - e.x);
          j.vx += Math.cos(a) * 520; j.vy += Math.sin(a) * 520;
          if (e.tipo === 'aguja') this._matar(e, false);
        }
      }
    }
  }

  _matar(e, puntua = true) {
    e.activo = false;
    const T = TIPOS[e.tipo];
    const tam = e.tipo === 'prensa' ? 1 : e.tipo === 'bloque' ? 0.7 : e.tipo === 'ojo' ? 0.45 : 0.25;
    this.fx.estallido(e.x, e.y, TINTA.rosa, 10 + tam * 40, 160 + tam * 260, 2.5 + tam * 3);
    this.fx.estallido(e.x, e.y, TINTA.azafran, 4 + tam * 14, 120 + tam * 200, 2);
    this.fx.onda(e.x, e.y, e.r * 0.5, e.r * 2.2, TINTA.rosa, 0.35 + tam * 0.4);
    this.fx.sacudir(0.06 + tam * 0.35);
    this.audio.kill(tam);
    if (!puntua) return;
    // Encadenar muertes sube el multiplicador (cada 4 muertes seguidas, +1, hasta ×5).
    this.combo = Math.min(5, this.combo + (this.tCombo > 0 ? 0.25 : 0));
    this.tCombo = 1.6;
    this._sumar(T.puntos, e.x, e.y);
    if (e.tipo === 'prensa') {
      this.enemigos.jefe = null;
      this.fx.descuadrar(0.6);
      for (let i = 0; i < 3; i++) this._soltar(e.x + rand(-60, 60), e.y + rand(-60, 60), 1);
      this.ui.aviso('Prensa rota', `+${T.puntos} puntos`);
    } else {
      this._soltar(e.x, e.y, T.botin);
    }
  }

  _danoJugador(dmg, x, y) {
    const j = this.jugador;
    const r = j.recibirGolpe(dmg);
    if (!r) return null;
    if (r === 'escudo') {
      this.audio.shieldHit();
      this.fx.onda(j.x, j.y, j.r, j.r + 40, TINTA.menta, 0.3);
      this.fx.sacudir(0.15);
      return r;
    }
    this.combo = 1;
    this.audio.hurt();
    this.fx.sacudir(0.55);
    this.fx.descuadrar(1);
    this.fx.estallido(j.x, j.y, TINTA.azafran, 18, 240, 3);
    this.camaraLenta = 0.35;
    if (this.input.mode === 'touch' && navigator.userActivation?.hasBeenActive !== false) {
      try { navigator.vibrate?.(j.vivo ? 60 : [80, 40, 160]); } catch { /* sin vibración */ }
    }
    if (!j.vivo) {
      this.estado = 'muriendo';
      this.tMuerte = 1.4;
      this.fx.estallido(j.x, j.y, TINTA.azafran, 60, 380, 4);
      this.fx.estallido(j.x, j.y, TINTA.rosa, 40, 300, 3);
      this.fx.onda(j.x, j.y, 10, 260, TINTA.azafran, 0.9);
      this.fx.sacudir(1);
      this.audio.gameOver();
    }
    return r;
  }

  // ---------- Bucle ----------
  actualizar(dtReal) {
    this.t += dtReal;
    if (this.input.consumirPausa()) {
      if (this.estado === 'jugando') this.pausar();
      else if (this.estado === 'pausa') this.seguir();
    }

    if (this.estado === 'pausa' || this.estado === 'fin') return;

    // La cámara lenta tras un golpe vuelve sola a velocidad normal.
    this.camaraLenta = Math.min(1, this.camaraLenta + dtReal * 2.2);
    const dt = dtReal * (this.estado === 'muriendo' ? 0.3 : this.camaraLenta);

    this.fx.actualizar(dtReal);

    if (this.estado === 'inicio') {
      // Fondo vivo en el menú: la cámara deriva por la arena.
      this.cam.x = ARENA.w / 2 + Math.cos(this.t * 0.08) * 380;
      this.cam.y = ARENA.h / 2 + Math.sin(this.t * 0.11) * 240;
      if (Math.random() < dtReal * 3) this.fx.estallido(rand(0, ARENA.w), rand(0, ARENA.h), Math.random() < 0.5 ? TINTA.rosa : TINTA.azafran, 6, 90, 3);
      return;
    }

    this.input.actualizar();
    const j = this.jugador;
    if (this.estado === 'jugando') j.actualizar(dt, this.input, this);
    this.enemigos.actualizar(dt, this);
    this.balas.actualizar(dt);
    this._actualizarBotin(dt);
    if (this.estado === 'jugando') this._colisiones();

    this.tCombo -= dt;
    if (this.tCombo <= 0) this.combo = 1;

    if (this.estado === 'jugando') {
      this._generar(dt);
      if (!this.cola.length && this.enemigos.vivos === 0) {
        this.descanso -= dt;
        if (this.descanso <= 0) { this.siguienteOleada(); this.descanso = 2.2; }
      }
    } else if (this.estado === 'muriendo') {
      this.tMuerte -= dtReal;
      if (this.tMuerte <= 0) this.terminar();
    }

    // Cámara: sigue al jugador con suavidad, adelantándose hacia donde apunta.
    const ox = Math.cos(j.angulo) * 40, oy = Math.sin(j.angulo) * 40;
    const k = Math.min(1, dtReal * 6);
    this.cam.x = lerp(this.cam.x, j.x + ox, k);
    this.cam.y = lerp(this.cam.y, j.y + oy, k);
    this._limitarCamara();

    this.ui.actualizarHud(j, this);
  }

  _limitarCamara() {
    const mw = this.cw / 2 / this.cam.s, mh = this.ch / 2 / this.cam.s;
    // Margen en píxeles de pantalla: deja ver el borde de la arena por debajo del HUD.
    const margen = 120 / this.cam.s;
    this.cam.x = mw * 2 >= ARENA.w + margen * 2 ? ARENA.w / 2 : clamp(this.cam.x, mw - margen, ARENA.w - mw + margen);
    this.cam.y = mh * 2 >= ARENA.h + margen * 2 ? ARENA.h / 2 : clamp(this.cam.y, mh - margen, ARENA.h - mh + margen);
  }

  dibujar() {
    const { ctx, dpr, cam } = this;
    const s = cam.s * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = TINTA.fondoFuera;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(s, 0, 0, s, dpr * (this.cw / 2 + this.fx.sx) - cam.x * s, dpr * (this.ch / 2 + this.fx.sy) - cam.y * s);
    this._dibujarArena(ctx);
    this._dibujarBotin(ctx);
    this.enemigos.dibujar(ctx, this);
    this.balas.dibujar(ctx);
    if (this.estado !== 'inicio') this.jugador.dibujar(ctx, this.t);
    this.fx.dibujar(ctx);

    this.fx.dibujarDescuadre(ctx, this.canvas);

    // Capa de pantalla: joysticks y mira.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.estado === 'jugando') {
      this.input.dibujar(ctx);
      if (this.input.mode === 'mouse' && this.input.mouse.dentro) this._mira(ctx, this.input.mouse.x, this.input.mouse.y);
    }
  }

  _dibujarArena(ctx) {
    ctx.fillStyle = TINTA.ultramar;
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
    // Manchas de trama gruesa, como zonas mal entintadas.
    ctx.fillStyle = trama(ctx, TINTA.trama, 10, 3.2);
    for (const m of this.manchas) { ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill(); }
    // Retícula fina.
    ctx.fillStyle = trama(ctx, 'rgba(242,240,255,.07)', 30, 1.4);
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
    // Borde a dos tintas, ligeramente fuera de registro.
    ctx.lineWidth = 8;
    ctx.strokeStyle = TINTA.rosa;
    ctx.strokeRect(-2, 2, ARENA.w + 4, ARENA.h);
    ctx.strokeStyle = TINTA.azafran;
    ctx.lineWidth = 4;
    ctx.strokeRect(-4, -4, ARENA.w + 8, ARENA.h + 8);
    // Marcas de registro en las esquinas.
    ctx.strokeStyle = TINTA.tiza; ctx.lineWidth = 2; ctx.globalAlpha = 0.25;
    for (const [x, y] of [[-60, -60], [ARENA.w + 60, -60], [-60, ARENA.h + 60], [ARENA.w + 60, ARENA.h + 60]]) {
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.moveTo(x - 22, y); ctx.lineTo(x + 22, y); ctx.moveTo(x, y - 22); ctx.lineTo(x, y + 22);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _dibujarBotin(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 20px ${FUENTE}`;
    for (const b of this.botin) {
      if (!b.activo) continue;
      if (b.vida < 2.5 && Math.floor(b.t * 8) % 2 === 0) continue;
      const y = b.y + Math.sin(b.t * 4) * 3;
      ctx.strokeStyle = TINTA.menta; ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]); ctx.lineDashOffset = -b.t * 20;
      ctx.beginPath(); ctx.arc(b.x, y, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = TINTA.sombra;
      ctx.beginPath(); ctx.arc(b.x + 3, y + 3, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = TINTA.menta;
      ctx.beginPath(); ctx.arc(b.x, y, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = TINTA.ultramar;
      ctx.fillText(PODERES[b.tipo].letra, b.x, y + 1);
    }
  }

  _mira(ctx, x, y) {
    ctx.strokeStyle = TINTA.tiza; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.moveTo(x - 16, y); ctx.lineTo(x - 6, y); ctx.moveTo(x + 6, y); ctx.lineTo(x + 16, y);
    ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 6); ctx.moveTo(x, y + 6); ctx.lineTo(x, y + 16);
    ctx.stroke();
    ctx.fillStyle = TINTA.rosa;
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
}
