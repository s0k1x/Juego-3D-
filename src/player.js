// Jugador: movimiento con inercia, disparo y power-ups activos.
import { TINTA, ARENA, clamp } from './util.js';

export const PODERES = {
  triple: { letra: 'T', nombre: 'Triple', dur: 10 },
  escudo: { letra: 'E', nombre: 'Escudo', dur: 12 },
  velocidad: { letra: 'V', nombre: 'Velocidad', dur: 10 },
  vida: { letra: '+', nombre: 'Vida', dur: 0 },
};

const VEL = 270;
const CADENCIA = 0.11;
const VEL_BALA = 760;

export class Jugador {
  constructor() { this.reiniciar(); }

  reiniciar() {
    this.x = ARENA.w / 2; this.y = ARENA.h / 2;
    this.vx = 0; this.vy = 0;
    this.r = 16;
    this.maxVida = 5; this.vida = 5;
    this.angulo = -Math.PI / 2;
    this.enfriamiento = 0;
    this.invulnerable = 0;
    this.retroceso = 0;
    this.poderes = { triple: 0, escudo: 0, velocidad: 0 };
    this.cargasEscudo = 0;
    this.vivo = true;
  }

  aplicarPoder(tipo) {
    if (tipo === 'vida') {
      if (this.vida < this.maxVida) { this.vida++; return true; }
      return false; // vida llena: el juego lo convierte en puntos
    }
    this.poderes[tipo] = PODERES[tipo].dur;
    if (tipo === 'escudo') this.cargasEscudo = 3;
    return true;
  }

  actualizar(dt, input, juego) {
    for (const k in this.poderes) this.poderes[k] = Math.max(0, this.poderes[k] - dt);
    if (this.poderes.escudo <= 0) this.cargasEscudo = 0;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.enfriamiento -= dt;
    this.retroceso = Math.max(0, this.retroceso - dt * 10);

    // Movimiento con aceleración suave.
    const vel = VEL * (this.poderes.velocidad > 0 ? 1.4 : 1);
    const a = Math.min(1, dt * 14);
    this.vx += (input.move.x * vel - this.vx) * a;
    this.vy += (input.move.y * vel - this.vy) * a;
    this.x = clamp(this.x + this.vx * dt, this.r, ARENA.w - this.r);
    this.y = clamp(this.y + this.vy * dt, this.r, ARENA.h - this.r);

    // Apuntado: ratón (punto del mundo) o stick derecho (vector).
    if (input.mode === 'touch') {
      const s = input.sticks.apuntar;
      if (s.id !== null && s.mag > 0.2) this.angulo = Math.atan2(s.vy, s.vx);
      else if (Math.hypot(this.vx, this.vy) > 30) this.angulo = Math.atan2(this.vy, this.vx);
    } else if (input.mouse.dentro) {
      const m = juego.pantallaAMundo(input.mouse.x, input.mouse.y);
      this.angulo = Math.atan2(m.y - this.y, m.x - this.x);
    }

    if (input.firing && this.enfriamiento <= 0) this.disparar(juego);
  }

  disparar(juego) {
    this.enfriamiento = CADENCIA;
    this.retroceso = 1;
    const bx = this.x + Math.cos(this.angulo) * (this.r + 6);
    const by = this.y + Math.sin(this.angulo) * (this.r + 6);
    const dispersion = (Math.random() - 0.5) * 0.05;
    juego.balas.disparar(bx, by, this.angulo + dispersion, VEL_BALA);
    if (this.poderes.triple > 0) {
      juego.balas.disparar(bx, by, this.angulo - 0.2, VEL_BALA);
      juego.balas.disparar(bx, by, this.angulo + 0.2, VEL_BALA);
    }
    juego.audio.shoot();
  }

  // Devuelve 'escudo' si el golpe lo absorbe el escudo, 'golpe' si quita vida, null si es invulnerable.
  recibirGolpe(dmg = 1) {
    if (this.invulnerable > 0) return null;
    if (this.cargasEscudo > 0) {
      this.cargasEscudo--;
      if (this.cargasEscudo === 0) this.poderes.escudo = 0;
      this.invulnerable = 0.35;
      return 'escudo';
    }
    this.vida = Math.max(0, this.vida - dmg);
    this.invulnerable = 1.1;
    if (this.vida === 0) this.vivo = false;
    return 'golpe';
  }

  dibujar(ctx, t) {
    if (!this.vivo) return;
    // Parpadeo durante la invulnerabilidad.
    if (this.invulnerable > 0 && Math.floor(t * 16) % 2 === 0) return;
    const { x, y, r } = this;
    const ca = Math.cos(this.angulo), sa = Math.sin(this.angulo);
    const rec = this.retroceso * 3;

    // Rastro de velocidad.
    if (this.poderes.velocidad > 0) {
      ctx.fillStyle = 'rgba(95,227,192,.35)';
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath(); ctx.arc(x - this.vx * 0.03 * i, y - this.vy * 0.03 * i, r * (1 - i * 0.18), 0, Math.PI * 2); ctx.fill();
      }
    }

    // Primera tinta (rosa) desplazada, segunda tinta (azafrán) encima: el registro de la risografía.
    ctx.save();
    ctx.translate(x - ca * rec, y - sa * rec);
    ctx.rotate(this.angulo);
    for (const [dx, dy, color] of [[3, 3, TINTA.rosa], [0, 0, TINTA.azafran]]) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill();
      // Plumilla que indica hacia dónde apunta.
      ctx.beginPath();
      ctx.moveTo(dx + r + 11, dy);
      ctx.lineTo(dx + r - 4, dy - 8);
      ctx.lineTo(dx + r - 4, dy + 8);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = TINTA.ultramar;
    ctx.beginPath(); ctx.arc(4, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Escudo: anillo de menta con una muesca por carga.
    if (this.cargasEscudo > 0) {
      ctx.strokeStyle = TINTA.menta;
      ctx.lineWidth = 3;
      const seg = (Math.PI * 2) / 3;
      for (let i = 0; i < this.cargasEscudo; i++) {
        const a0 = t * 2 + i * seg + 0.15;
        ctx.beginPath(); ctx.arc(x, y, r + 9, a0, a0 + seg - 0.3); ctx.stroke();
      }
    }
  }
}
