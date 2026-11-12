// Enemigos: aguja (rápido), bloque (tanque), ojo (tirador) y La Prensa (jefe cada 5 oleadas).
import { TINTA, ARENA, clamp, rand, trama } from './util.js';

export const TIPOS = {
  aguja: { r: 12, vida: 1, vel: 215, puntos: 100, dmg: 1, empuje: 1, botin: 0.06 },
  bloque: { r: 26, vida: 9, vel: 72, puntos: 300, dmg: 2, empuje: 0.25, botin: 0.22 },
  ojo: { r: 17, vida: 3, vel: 120, puntos: 250, dmg: 1, empuje: 0.8, botin: 0.12 },
  prensa: { r: 72, vida: 160, vel: 60, puntos: 5000, dmg: 2, empuje: 0, botin: 1 },
};

const APARICION = 0.7; // segundos de aviso antes de que un enemigo entre en juego

export class Enemigos {
  constructor() {
    this.items = Array.from({ length: 140 }, () => ({ activo: false }));
    this.vivos = 0;
    this.jefe = null;
  }

  limpiar() { for (const e of this.items) e.activo = false; this.vivos = 0; this.jefe = null; }

  crear(tipo, x, y, nivel) {
    const e = this.items.find((i) => !i.activo);
    if (!e) return null;
    const T = TIPOS[tipo];
    const mVida = tipo === 'prensa' ? 1 + (nivel.n / 5 - 1) * 0.6 : nivel.vida;
    Object.assign(e, {
      activo: true, tipo, x, y, vx: 0, vy: 0,
      r: T.r, vida: Math.ceil(T.vida * mVida), vidaMax: Math.ceil(T.vida * mVida),
      vel: T.vel * (tipo === 'prensa' ? 1 : nivel.vel),
      aparicion: tipo === 'prensa' ? 1.4 : APARICION,
      destello: 0, fase: 1, t: rand(0, 10),
      recarga: rand(1.2, 2.2), recarga2: 2.5, recarga3: 4,
      giro: rand(0, Math.PI * 2), orbita: Math.random() < 0.5 ? 1 : -1,
      cadencia: nivel.cadencia,
    });
    if (tipo === 'prensa') this.jefe = e;
    return e;
  }

  actualizar(dt, juego) {
    const j = juego.jugador;
    let vivos = 0;
    for (const e of this.items) {
      if (!e.activo) continue;
      vivos++;
      e.t += dt;
      e.destello = Math.max(0, e.destello - dt);
      if (e.aparicion > 0) { e.aparicion -= dt; continue; }

      const dx = j.x - e.x, dy = j.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      let tx = 0, ty = 0; // velocidad deseada

      if (e.tipo === 'aguja') {
        // Persigue con giro limitado y un leve zigzag: se puede esquivar.
        const deseado = Math.atan2(dy, dx) + Math.sin(e.t * 6) * 0.35;
        let dif = deseado - e.giro;
        dif = Math.atan2(Math.sin(dif), Math.cos(dif));
        e.giro += clamp(dif, -4 * dt, 4 * dt);
        tx = Math.cos(e.giro) * e.vel; ty = Math.sin(e.giro) * e.vel;
      } else if (e.tipo === 'bloque') {
        tx = ux * e.vel; ty = uy * e.vel;
      } else if (e.tipo === 'ojo') {
        // Mantiene la distancia y orbita mientras dispara.
        const ideal = 320;
        const radial = clamp((d - ideal) / 120, -1, 1);
        // Se frena justo antes de disparar (a la vez que se enciende la pupila): ventana para acertarle.
        const freno = e.recarga < 0.45 ? 0.15 : 1;
        tx = (ux * radial - uy * e.orbita * 0.8) * e.vel * freno;
        ty = (uy * radial + ux * e.orbita * 0.8) * e.vel * freno;
        e.recarga -= dt;
        if (e.recarga <= 0 && d < 700) {
          e.recarga = rand(1.5, 2.2) / e.cadencia;
          juego.balas.disparar(e.x + ux * e.r, e.y + uy * e.r, Math.atan2(dy, dx), 250 * Math.min(1.5, e.cadencia), { enemiga: true, r: 6, vida: 3.5 });
          juego.audio.enemyShoot();
        }
      } else if (e.tipo === 'prensa') {
        this._jefe(e, dt, juego, d, ux, uy);
        tx = e.vx; ty = e.vy;
      }

      if (e.tipo !== 'prensa') {
        const a = Math.min(1, dt * 5);
        e.vx += (tx - e.vx) * a; e.vy += (ty - e.vy) * a;
      }
      e.x = clamp(e.x + e.vx * dt, e.r, ARENA.w - e.r);
      e.y = clamp(e.y + e.vy * dt, e.r, ARENA.h - e.r);
    }
    this.vivos = vivos;
    this._separar();
  }

  _jefe(e, dt, juego, d, ux, uy) {
    const ratio = e.vida / e.vidaMax;
    const fase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (fase !== e.fase) {
      e.fase = fase;
      juego.fx.sacudir(0.6);
      juego.fx.onda(e.x, e.y, e.r, e.r * 3, TINTA.rosa, 0.7);
      juego.audio.boss();
      juego.ui.aviso(fase === 2 ? 'La prensa acelera' : 'Última tirada');
    }
    // Se acerca despacio, orbitando al jugador.
    const lejos = d > 360 ? 1 : -0.3;
    const v = e.vel * (1 + (fase - 1) * 0.35);
    e.vx = (ux * lejos - uy * 0.6) * v;
    e.vy = (uy * lejos + ux * 0.6) * v;
    e.giro += dt * (0.6 + fase * 0.35);

    // Patrón 1: anillo de balas que gira.
    e.recarga -= dt;
    if (e.recarga <= 0) {
      e.recarga = fase === 3 ? 1.5 : 2.2;
      const n = 14 + fase * 3;
      for (let i = 0; i < n; i++) {
        const a = e.giro + (i / n) * Math.PI * 2;
        juego.balas.disparar(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a, 170 + fase * 20, { enemiga: true, r: 7, vida: 5 });
      }
      juego.audio.enemyShoot();
    }
    // Patrón 2: abanico apuntado.
    if (fase >= 2) {
      e.recarga2 -= dt;
      if (e.recarga2 <= 0) {
        e.recarga2 = 1.3;
        const base = Math.atan2(uy, ux);
        for (let i = -2; i <= 2; i++) juego.balas.disparar(e.x, e.y, base + i * 0.16, 300, { enemiga: true, r: 6, vida: 4 });
      }
    }
    // Patrón 3: imprime agujas.
    if (fase === 3) {
      e.recarga3 -= dt;
      if (e.recarga3 <= 0) {
        e.recarga3 = 4.5;
        for (let i = 0; i < 3; i++) {
          const a = rand(0, Math.PI * 2);
          this.crear('aguja', e.x + Math.cos(a) * (e.r + 30), e.y + Math.sin(a) * (e.r + 30), juego.nivel);
        }
      }
    }
  }

  // Empuje mutuo para que no se amontonen en un punto.
  _separar() {
    const it = this.items;
    for (let i = 0; i < it.length; i++) {
      const a = it[i];
      if (!a.activo || a.aparicion > 0) continue;
      for (let k = i + 1; k < it.length; k++) {
        const b = it[k];
        if (!b.activo || b.aparicion > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2), sol = (min - d) / d * 0.5;
        const pa = TIPOS[a.tipo].empuje, pb = TIPOS[b.tipo].empuje;
        const ta = pa / (pa + pb || 1), tb = pb / (pa + pb || 1);
        a.x -= dx * sol * ta * 2; a.y -= dy * sol * ta * 2;
        b.x += dx * sol * tb * 2; b.y += dy * sol * tb * 2;
      }
    }
  }

  dibujar(ctx, juego) {
    const j = juego.jugador;
    for (const e of this.items) {
      if (!e.activo) continue;
      if (e.aparicion > 0) { this._aviso(ctx, e); continue; }
      const color = e.destello > 0 ? TINTA.tiza : TINTA.rosa;
      ctx.save();
      ctx.translate(e.x, e.y);
      if (e.tipo === 'aguja') {
        ctx.rotate(e.giro);
        for (const [dx, c] of [[3, TINTA.sombra], [0, color]]) {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.moveTo(dx + e.r + 4, dx); ctx.lineTo(dx - e.r, dx - e.r * 0.75); ctx.lineTo(dx - e.r * 0.45, dx); ctx.lineTo(dx - e.r, dx + e.r * 0.75);
          ctx.closePath(); ctx.fill();
        }
      } else if (e.tipo === 'bloque') {
        ctx.rotate(Math.sin(e.t * 1.3) * 0.12);
        const s = e.r;
        ctx.fillStyle = TINTA.sombra; ctx.fillRect(-s + 4, -s + 4, s * 2, s * 2);
        ctx.fillStyle = e.destello > 0 ? TINTA.tiza : trama(ctx, TINTA.rosa, 6, 2.2);
        ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.strokeStyle = color; ctx.lineWidth = 4;
        ctx.strokeRect(-s + 2, -s + 2, s * 2 - 4, s * 2 - 4);
        // Grietas según el daño recibido.
        const dano = 1 - e.vida / e.vidaMax;
        if (dano > 0.3) {
          ctx.strokeStyle = TINTA.ultramar; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(-s * 0.6, -s); ctx.lineTo(-s * 0.1, -s * 0.2); ctx.lineTo(-s * 0.4, s * 0.4);
          if (dano > 0.6) { ctx.moveTo(s, s * 0.2); ctx.lineTo(s * 0.2, 0); ctx.lineTo(s * 0.5, -s * 0.6); }
          ctx.stroke();
        }
      } else if (e.tipo === 'ojo') {
        ctx.fillStyle = TINTA.sombra;
        ctx.beginPath(); ctx.arc(3, 3, e.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = TINTA.ultramar;
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.62, 0, Math.PI * 2); ctx.fill();
        // La pupila mira al jugador y se ilumina antes de disparar.
        const a = Math.atan2(j.y - e.y, j.x - e.x);
        ctx.fillStyle = e.recarga < 0.35 ? TINTA.azafran : TINTA.tiza;
        ctx.beginPath(); ctx.arc(Math.cos(a) * e.r * 0.28, Math.sin(a) * e.r * 0.28, e.r * 0.3, 0, Math.PI * 2); ctx.fill();
      } else if (e.tipo === 'prensa') {
        this._dibujarJefe(ctx, e, color);
      }
      ctx.restore();
    }
  }

  _dibujarJefe(ctx, e, color) {
    const r = e.r;
    const octo = (rad, dx = 0) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = e.giro * 0.25 + (i / 8) * Math.PI * 2 + Math.PI / 8;
        ctx.lineTo(dx + Math.cos(a) * rad, dx + Math.sin(a) * rad);
      }
      ctx.closePath();
    };
    ctx.fillStyle = TINTA.sombra; octo(r, 6); ctx.fill();
    // El jefe recibe muchos impactos seguidos: solo destella el contorno, no el cuerpo.
    ctx.fillStyle = TINTA.ultramar; octo(r); ctx.fill();
    ctx.fillStyle = trama(ctx, TINTA.rosa, 7, 2.6); octo(r); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 6; octo(r - 3); ctx.stroke();
    // Rodillos que giran.
    ctx.fillStyle = TINTA.azafran;
    for (let i = 0; i < 6; i++) {
      const a = e.giro + (i / 6) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = TINTA.ultramar;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = e.fase === 3 ? TINTA.azafran : TINTA.tiza;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.18 + Math.sin(e.t * 8) * 2, 0, Math.PI * 2); ctx.fill();
  }

  // Marca de registro (una cruz con círculo) donde va a aparecer el enemigo.
  _aviso(ctx, e) {
    const total = e.tipo === 'prensa' ? 1.4 : APARICION;
    const k = 1 - e.aparicion / total;
    const r = e.r + 10;
    ctx.strokeStyle = TINTA.rosa;
    ctx.globalAlpha = 0.35 + 0.5 * k;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * (1.6 - k * 0.6), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.x - r * 1.3, e.y); ctx.lineTo(e.x + r * 1.3, e.y);
    ctx.moveTo(e.x, e.y - r * 1.3); ctx.lineTo(e.x, e.y + r * 1.3);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
