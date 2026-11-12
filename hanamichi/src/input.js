// Entrada: teclado + ratón (puntero bloqueado) en PC; joystick + arrastre + botones en móvil.
// El juego lee el estado cada fotograma y consume los "pulsados" (eventos de un solo uso).

export class Input {
  constructor(canvas, controlesTactiles) {
    this.canvas = canvas;
    this.tactil = matchMedia('(pointer: coarse)').matches;
    this.teclas = new Set();
    this.mover = { x: 0, y: 0 };
    this.mirar = { x: 0, y: 0 };       // píxeles acumulados desde el último fotograma
    this.sensibilidad = 1;
    this.disparando = false;
    this.apuntando = false;
    this.esprintar = false;
    this.agachar = false;
    this.pulsados = new Set();          // 'saltar', 'deslizar', 'recargar', 'r1'..'r4', 'siguiente', 'pausa', 'granada', 'q', 'e', 'x'
    this.tabla = false;
    this.correrSiempre = true;          // correr por defecto al ir hacia delante (Mayús no hace falta)
    this.bloqueado = false;
    this.activo = false;
    this.onGesto = null;

    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.mira = { id: null, x: 0, y: 0 };
    this.botones = controlesTactiles;
    this._teclado();
    this._raton();
    this._tactil();
  }

  _teclado() {
    const mapa = {
      Space: 'saltar', KeyC: 'deslizar', ControlLeft: 'deslizar', KeyR: 'recargar',
      Digit1: 'r1', Digit2: 'r2', Digit3: 'r3', Digit4: 'r4', KeyG: 'granada',
      KeyQ: 'q', KeyE: 'e', KeyX: 'x', KeyF: 'x', KeyP: 'pausa',
    };
    addEventListener('keydown', (e) => {
      this.onGesto?.();
      if (!this.activo) return;
      if (e.code === 'Escape') { this.pulsados.add('pausa'); return; }
      if (mapa[e.code] && !e.repeat) this.pulsados.add(mapa[e.code]);
      this.teclas.add(e.code);
      if (/^(Space|Arrow|Tab)/.test(e.code) || e.code === 'ControlLeft') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.teclas.delete(e.code));
    addEventListener('blur', () => this.limpiar());
    addEventListener('wheel', (e) => { if (this.activo && this.bloqueado) this.pulsados.add(e.deltaY > 0 ? 'siguiente' : 'anterior'); }, { passive: true });
  }

  _raton() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      this.onGesto?.();
      if (this.tactil || !this.activo) return;
      if (!this.bloqueado) { this.pedirBloqueo(); return; }
      if (e.button === 0) this.disparando = true;
      if (e.button === 2) this.apuntando = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.disparando = false;
      if (e.button === 2) this.apuntando = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.bloqueado) return;
      this.mirar.x += e.movementX; this.mirar.y += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      const antes = this.bloqueado;
      this.bloqueado = document.pointerLockElement === c;
      if (antes && !this.bloqueado && this.activo) this.pulsados.add('pausa'); // Esc del navegador
      if (!this.bloqueado) { this.disparando = false; this.apuntando = false; }
    });
  }

  pedirBloqueo() {
    if (this.tactil) return;
    const normal = () => { try { this.canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* sin bloqueo */ } };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      p?.catch?.((e) => { if (e?.name === 'NotSupportedError') normal(); });
    } catch { normal(); }
  }

  soltarBloqueo() { if (document.pointerLockElement) document.exitPointerLock(); }

  _tactil() {
    const c = this.canvas;
    const opts = { passive: false };
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.tactil = true;
      this.onGesto?.();
      if (!this.activo) return;
      e.preventDefault();
      if (e.clientX < innerWidth * 0.42 && this.stick.id === null) {
        Object.assign(this.stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
      } else if (this.mira.id === null) {
        Object.assign(this.mira, { id: e.pointerId, x: e.clientX, y: e.clientY });
      }
      try { c.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    }, opts);
    const mover = (e) => {
      if (e.pointerType === 'mouse') return;
      if (e.pointerId === this.stick.id) { this.stick.x = e.clientX; this.stick.y = e.clientY; }
      if (e.pointerId === this.mira.id) {
        this.mirar.x += (e.clientX - this.mira.x) * 2.2;
        this.mirar.y += (e.clientY - this.mira.y) * 2.2;
        this.mira.x = e.clientX; this.mira.y = e.clientY;
      }
    };
    const soltar = (e) => {
      if (e.pointerId === this.stick.id) this.stick.id = null;
      if (e.pointerId === this.mira.id) { this.mira.id = null; this.disparando = false; }
    };
    addEventListener('pointermove', mover, opts);
    addEventListener('pointerup', soltar);
    addEventListener('pointercancel', soltar);

    // Botones táctiles: [data-accion]. El de disparo también sirve para mirar mientras se mantiene.
    if (!this.botones) return;
    for (const b of this.botones.querySelectorAll('[data-accion]')) {
      const accion = b.dataset.accion;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.onGesto?.();
        b.classList.add('activo');
        if (accion === 'disparar') {
          this.disparando = true;
          Object.assign(this.mira, { id: e.pointerId, x: e.clientX, y: e.clientY });
          try { b.releasePointerCapture(e.pointerId); } catch { /* nada */ }
        } else if (accion === 'apuntar') {
          this.apuntando = !this.apuntando;
          b.classList.toggle('fijo', this.apuntando);
        } else if (accion === 'tabla') {
          this.tablaTactil = !this.tablaTactil;
        } else if (accion === 'agachar') {
          this.pulsados.add('deslizar');
          this.agachar = true;
        } else {
          this.pulsados.add(accion);
        }
      }, opts);
      const fin = () => {
        b.classList.remove('activo');
        if (accion === 'agachar') this.agachar = false;
      };
      b.addEventListener('pointerup', fin);
      b.addEventListener('pointercancel', fin);
      b.addEventListener('pointerleave', fin);
    }
  }

  actualizar() {
    let x = 0, y = 0;
    const k = this.teclas;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    // Con «correr siempre», Mayús sirve para andar despacio.
    const mayus = k.has('ShiftLeft') || k.has('ShiftRight');
    this.esprintar = this.correrSiempre ? y > 0 && !mayus : mayus;
    this.tabla = k.has('Tab') || this.tablaTactil;
    if (!this.tactil) this.agachar = k.has('KeyC') || k.has('ControlLeft');

    if (this.stick.id !== null) {
      const R = 60;
      let dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { // el joystick sigue al dedo
        this.stick.ox += dx * (1 - R / d); this.stick.oy += dy * (1 - R / d);
        dx = this.stick.x - this.stick.ox; dy = this.stick.y - this.stick.oy;
      }
      x = dx / R; y = -dy / R;
      this.esprintar = Math.hypot(x, y) > (this.correrSiempre ? 0.7 : 0.92);
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.mover.x = x; this.mover.y = y;
  }

  // Devuelve y vacía el movimiento de mirada acumulado, en radianes.
  consumirMirada(fov) {
    const base = (this.tactil ? 0.0042 : 0.0022) * this.sensibilidad * (fov / 72);
    const r = { x: this.mirar.x * base, y: this.mirar.y * base };
    this.mirar.x = this.mirar.y = 0;
    return r;
  }

  pulsado(n) { return this.pulsados.delete(n); }

  limpiar() {
    this.teclas.clear();
    this.pulsados.clear();
    this.disparando = this.apuntando = false;
    this.tablaTactil = false;
    this.stick.id = this.mira.id = null;
    this.mirar.x = this.mirar.y = 0;
  }
}
