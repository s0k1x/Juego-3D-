// Balas con reserva reutilizable: sin crear objetos durante la partida.
import { TINTA, ARENA } from './util.js';

export class Balas {
  constructor(max = 600) {
    this.items = Array.from({ length: max }, () => ({
      activa: false, x: 0, y: 0, vx: 0, vy: 0, r: 4, vida: 0, dmg: 1, enemiga: false,
    }));
  }

  disparar(x, y, angulo, velocidad, { enemiga = false, r = 4, dmg = 1, vida = 1.6 } = {}) {
    for (const b of this.items) {
      if (b.activa) continue;
      b.activa = true; b.x = x; b.y = y;
      b.vx = Math.cos(angulo) * velocidad; b.vy = Math.sin(angulo) * velocidad;
      b.r = r; b.dmg = dmg; b.vida = vida; b.enemiga = enemiga;
      return b;
    }
    return null;
  }

  actualizar(dt) {
    for (const b of this.items) {
      if (!b.activa) continue;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.vida -= dt;
      if (b.vida <= 0 || b.x < -20 || b.y < -20 || b.x > ARENA.w + 20 || b.y > ARENA.h + 20) b.activa = false;
    }
  }

  limpiar() { for (const b of this.items) b.activa = false; }

  dibujar(ctx) {
    // Balas del jugador: trazos de azafrán.
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = TINTA.azafran;
    ctx.beginPath();
    for (const b of this.items) {
      if (!b.activa || b.enemiga) continue;
      ctx.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    // Balas enemigas: gotas rosas con núcleo claro, fáciles de leer.
    ctx.fillStyle = TINTA.rosa;
    ctx.beginPath();
    for (const b of this.items) {
      if (!b.activa || !b.enemiga) continue;
      ctx.moveTo(b.x + b.r, b.y);
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = TINTA.tiza;
    ctx.beginPath();
    for (const b of this.items) {
      if (!b.activa || !b.enemiga) continue;
      ctx.moveTo(b.x + 2.2, b.y);
      ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
