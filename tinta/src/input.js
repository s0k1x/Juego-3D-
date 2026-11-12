// Entrada: teclado + ratón en PC y doble joystick táctil en móvil.
// El juego solo lee: move (x,y en -1..1), aim (modo ratón: punto en pantalla; modo táctil: vector),
// firing y las pulsaciones de pausa.

const RADIO_STICK = 64;

export class Input {
  constructor(superficie) {
    this.el = superficie;
    this.keys = new Set();
    this.mode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    this.move = { x: 0, y: 0 };
    this.mouse = { x: 0, y: 0, down: false, dentro: false };
    this.sticks = {
      mover: { id: null, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0, mag: 0 },
      apuntar: { id: null, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0, mag: 0 },
    };
    this.radio = RADIO_STICK;
    this.pausaPulsada = false;
    this.activo = false; // solo capturamos gestos de juego mientras se juega
    this.onGesto = null; // primer gesto: desbloquear audio

    this._bind();
  }

  _bind() {
    const el = this.el;
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' || e.code === 'Escape') { if (!e.repeat) this.pausaPulsada = true; e.preventDefault(); return; }
      if (this.activo && /^(Arrow|Space)/.test(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (this.mode !== 'mouse' && /^Key[WASD]$/.test(e.code)) this.mode = 'mouse';
      this.onGesto?.();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.limpiar());

    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._moveEv(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._up(e));
    addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse' && e.button === 0) this.mouse.down = false; });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.mouse.dentro = false; });
  }

  _pos(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
  }

  _down(e) {
    this.onGesto?.();
    const p = this._pos(e);
    if (e.pointerType === 'mouse') {
      this.mode = 'mouse';
      this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.dentro = true;
      if (e.button === 0) {
        this.mouse.down = true;
        // Así el soltar llega aunque ocurra fuera del lienzo o del iframe.
        try { this.el.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
      }
      this.el.focus?.({ preventScroll: true });
      return;
    }
    this.mode = 'touch';
    if (!this.activo) return;
    e.preventDefault();
    const s = p.x < p.w / 2 ? this.sticks.mover : this.sticks.apuntar;
    if (s.id !== null) return;
    s.id = e.pointerId; s.ox = s.x = p.x; s.oy = s.y = p.y; s.vx = s.vy = s.mag = 0;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
  }

  _moveEv(e) {
    const p = this._pos(e);
    if (e.pointerType === 'mouse') {
      this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.dentro = true;
      return;
    }
    for (const s of Object.values(this.sticks)) {
      if (s.id !== e.pointerId) continue;
      let dx = p.x - s.ox, dy = p.y - s.oy;
      const d = Math.hypot(dx, dy);
      // Si el dedo se aleja mucho, la base le sigue (stick flotante).
      if (d > this.radio) {
        const k = (d - this.radio) / d;
        s.ox += dx * k; s.oy += dy * k;
        dx = p.x - s.ox; dy = p.y - s.oy;
      }
      const m = Math.min(1, Math.hypot(dx, dy) / this.radio);
      s.x = p.x; s.y = p.y; s.mag = m;
      const l = Math.hypot(dx, dy) || 1;
      s.vx = dx / l; s.vy = dy / l;
    }
  }

  _up(e) {
    if (e.pointerType === 'mouse') { if (e.button === 0) this.mouse.down = false; return; }
    for (const s of Object.values(this.sticks)) {
      if (s.id === e.pointerId) { s.id = null; s.mag = 0; s.vx = s.vy = 0; }
    }
  }

  // Calcula el vector de movimiento del fotograma.
  actualizar() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    const sm = this.sticks.mover;
    if (sm.id !== null && sm.mag > 0.12) { x = sm.vx * sm.mag; y = sm.vy * sm.mag; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
  }

  // En táctil se dispara mientras el stick derecho está desplazado.
  get firing() {
    if (this.mode === 'touch') return this.sticks.apuntar.id !== null && this.sticks.apuntar.mag > 0.3;
    return this.mouse.down || this.keys.has('Space');
  }

  consumirPausa() { const p = this.pausaPulsada; this.pausaPulsada = false; return p; }

  limpiar() {
    this.keys.clear();
    this.mouse.down = false;
    for (const s of Object.values(this.sticks)) { s.id = null; s.mag = 0; s.vx = s.vy = 0; }
  }

  // Dibuja los joysticks en coordenadas de pantalla (px CSS).
  dibujar(ctx) {
    if (this.mode !== 'touch') return;
    for (const s of Object.values(this.sticks)) {
      if (s.id === null) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(242,240,255,.35)';
      ctx.beginPath(); ctx.arc(s.ox, s.oy, this.radio, 0, Math.PI * 2); ctx.stroke();
      const kx = s.ox + s.vx * s.mag * this.radio, ky = s.oy + s.vy * s.mag * this.radio;
      ctx.fillStyle = s === this.sticks.mover ? 'rgba(255,197,48,.55)' : 'rgba(255,79,154,.55)';
      ctx.beginPath(); ctx.arc(kx, ky, 26, 0, Math.PI * 2); ctx.fill();
    }
  }
}
