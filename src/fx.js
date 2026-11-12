// Efectos: partículas de trama, ondas, textos flotantes, sacudida y tinta descuadrada.
import { TINTA, FUENTE, rand } from './util.js';

export class Efectos {
  constructor() {
    this.particulas = Array.from({ length: 700 }, () => ({ vida: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, r: 2, color: '' }));
    this.ondas = Array.from({ length: 24 }, () => ({ vida: 0, max: 1, x: 0, y: 0, r0: 0, r1: 0, color: '' }));
    this.textos = Array.from({ length: 32 }, () => ({ vida: 0, x: 0, y: 0, txt: '', color: '' }));
    this.trauma = 0;      // 0..1, la sacudida crece con su cuadrado
    this.descuadre = 0;   // 0..1, efecto de registro desplazado al recibir daño
    this.sx = 0; this.sy = 0;
    this.reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  _libre(lista) {
    for (const p of lista) if (p.vida <= 0) return p;
    return null;
  }

  estallido(x, y, color, n = 14, vel = 220, tam = 3) {
    for (let i = 0; i < n; i++) {
      const p = this._libre(this.particulas);
      if (!p) return;
      const a = Math.random() * Math.PI * 2, v = vel * (0.3 + Math.random() * 0.9);
      p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
      p.max = p.vida = rand(0.35, 0.8); p.r = tam * rand(0.6, 1.4); p.color = color;
    }
  }

  // Chispas en un cono (impactos de bala).
  chispas(x, y, angulo, color, n = 5) {
    for (let i = 0; i < n; i++) {
      const p = this._libre(this.particulas);
      if (!p) return;
      const a = angulo + rand(-0.7, 0.7), v = rand(80, 260);
      p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
      p.max = p.vida = rand(0.15, 0.35); p.r = rand(1.2, 2.4); p.color = color;
    }
  }

  onda(x, y, r0, r1, color, dur = 0.45) {
    const o = this._libre(this.ondas);
    if (!o) return;
    o.x = x; o.y = y; o.r0 = r0; o.r1 = r1; o.color = color; o.max = o.vida = dur;
  }

  texto(x, y, txt, color = TINTA.tiza) {
    const t = this._libre(this.textos);
    if (!t) return;
    t.x = x; t.y = y; t.txt = txt; t.color = color; t.vida = 0.9;
  }

  sacudir(cantidad) { this.trauma = Math.min(1, this.trauma + cantidad); }
  descuadrar(cantidad = 1) { this.descuadre = Math.min(1, this.descuadre + cantidad); }

  actualizar(dt) {
    for (const p of this.particulas) {
      if (p.vida <= 0) continue;
      p.vida -= dt;
      const fr = Math.pow(0.04, dt); // rozamiento
      p.vx *= fr; p.vy *= fr;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (const o of this.ondas) if (o.vida > 0) o.vida -= dt;
    for (const t of this.textos) if (t.vida > 0) { t.vida -= dt; t.y -= 40 * dt; }

    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.descuadre = Math.max(0, this.descuadre - dt * 2.4);
    const k = this.reducido ? 0 : this.trauma * this.trauma * 18;
    this.sx = (Math.random() * 2 - 1) * k;
    this.sy = (Math.random() * 2 - 1) * k;
  }

  limpiar() {
    for (const p of this.particulas) p.vida = 0;
    for (const o of this.ondas) o.vida = 0;
    for (const t of this.textos) t.vida = 0;
    this.trauma = this.descuadre = 0;
  }

  // Dibuja en coordenadas del mundo.
  dibujar(ctx) {
    for (const o of this.ondas) {
      if (o.vida <= 0) continue;
      const t = 1 - o.vida / o.max;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r0 + (o.r1 - o.r0) * (1 - (1 - t) * (1 - t)), 0, Math.PI * 2); ctx.stroke();
    }
    // Partículas como puntos de trama que menguan.
    for (const p of this.particulas) {
      if (p.vida <= 0) continue;
      const k = p.vida / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + 0.6 * k), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `800 20px ${FUENTE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.textos) {
      if (t.vida <= 0) continue;
      ctx.globalAlpha = Math.min(1, t.vida * 2.5);
      ctx.fillStyle = TINTA.sombra;
      ctx.fillText(t.txt, t.x + 2, t.y + 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  // Tinta descuadrada: copia el lienzo sobre sí mismo desplazado y tiñe de rosa.
  // Se llama con la transformación de pantalla ya restablecida.
  dibujarDescuadre(ctx, canvas) {
    const k = this.descuadre;
    if (k <= 0.01) return;
    const dpr = canvas.width / (canvas.clientWidth || canvas.width);
    const d = (this.reducido ? 4 : 14) * k * dpr;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.5 * k;
    ctx.globalCompositeOperation = 'lighten';
    ctx.drawImage(canvas, d, -d * 0.55);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.16 * k;
    ctx.fillStyle = TINTA.rosa;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}
