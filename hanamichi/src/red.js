// Red: salas multijugador sin servidor propio.
//  - «supabase»: Supabase Realtime (WebSocket con el protocolo Phoenix, canal de difusión por sala).
//  - «local»: BroadcastChannel entre pestañas del mismo navegador (pruebas y partidas en el mismo equipo).
// Cada máquina manda UN paquete por tick con el estado de sus entidades y los eventos pendientes
// (daño, bajas, poderes...). Así se respetan los límites de mensajes por segundo.
import { SUPABASE } from './config.js';

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const codigoSala = (n = 4) => Array.from({ length: n }, () => LETRAS[(Math.random() * LETRAS.length) | 0]).join('');
const idAleatorio = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

class TransporteLocal {
  constructor(sala, alMensaje) { this.sala = sala; this.alMensaje = alMensaje; }
  async unirse() {
    this.bc = new BroadcastChannel('hanamichi:' + this.sala);
    this.bc.onmessage = (e) => this.alMensaje(e.data);
  }
  enviar(m) { try { this.bc?.postMessage(m); } catch { /* cerrado */ } }
  salir() { try { this.bc?.close(); } catch { /* nada */ } this.bc = null; }
}

class TransporteSupabase {
  constructor(sala, alMensaje, alEstado) {
    this.topic = 'realtime:hanamichi-' + sala.toLowerCase();
    this.alMensaje = alMensaje; this.alEstado = alEstado;
    this.ref = 0; this.joinRef = null; this.unido = false; this.cerrando = false; this.intentos = 0;
  }

  unirse() {
    return new Promise((ok, mal) => {
      const url = SUPABASE.url.replace(/^http/, 'ws') + `/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE.clave)}&vsn=1.0.0`;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { mal(e); return; }
      this.ws = ws;
      const limite = setTimeout(() => { if (!this.unido) { mal(new Error('tiempo')); try { ws.close(); } catch { /* nada */ } } }, 8000);
      ws.onopen = () => {
        this.joinRef = String(++this.ref);
        this._mandar({
          topic: this.topic, event: 'phx_join', ref: this.joinRef, join_ref: this.joinRef,
          payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false }, access_token: SUPABASE.clave },
        });
        clearInterval(this.latido);
        this.latido = setInterval(() => this._mandar({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++this.ref) }), 25000);
      };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.event === 'phx_reply' && m.ref === this.joinRef) {
          if (m.payload?.status === 'ok') { this.unido = true; this.intentos = 0; clearTimeout(limite); this.alEstado?.('conectado'); ok(); }
          else { clearTimeout(limite); mal(new Error(m.payload?.response?.reason || 'rechazado')); }
        } else if (m.event === 'broadcast' && m.topic === this.topic) {
          const p = m.payload?.payload;
          if (p) this.alMensaje(p);
        } else if (m.event === 'phx_error' || m.event === 'phx_close') {
          if (m.topic === this.topic) this.unido = false;
        }
      };
      ws.onerror = () => { /* se gestiona en onclose */ };
      ws.onclose = () => {
        clearInterval(this.latido);
        const estaba = this.unido;
        this.unido = false;
        if (this.cerrando) return;
        if (!estaba) { clearTimeout(limite); mal(new Error('cerrado')); return; }
        // Reconexión con espera creciente.
        this.alEstado?.('reconectando');
        const espera = Math.min(8000, 800 * 2 ** this.intentos++);
        setTimeout(() => { if (!this.cerrando) this.unirse().catch(() => this.alEstado?.(this.intentos > 5 ? 'caido' : 'reconectando')); }, espera);
      };
    });
  }

  _mandar(o) { if (this.ws?.readyState === 1) { try { this.ws.send(JSON.stringify(o)); } catch { /* nada */ } } }

  enviar(m) {
    if (!this.unido) return;
    this._mandar({ topic: this.topic, event: 'broadcast', ref: String(++this.ref), join_ref: this.joinRef, payload: { type: 'broadcast', event: 'm', payload: m } });
  }

  salir() {
    this.cerrando = true;
    clearInterval(this.latido);
    if (this.unido) this._mandar({ topic: this.topic, event: 'phx_leave', payload: {}, ref: String(++this.ref), join_ref: this.joinRef });
    setTimeout(() => { try { this.ws?.close(); } catch { /* nada */ } }, 50);
  }
}

export class Red {
  constructor() {
    this.yo = idAleatorio();
    this.t = null;
    this.sala = null;
    this.estado = 'desconectado'; // desconectado | conectando | conectado | reconectando | caido
    this.alMensaje = null;
    this.alEstado = null;
    this.cola = [];
    this.recibidos = 0; this.enviados = 0;
  }

  get conectado() { return !!this.t && this.estado !== 'desconectado'; }

  async conectar(sala, tipo = 'supabase') {
    await this.salir();
    this.sala = sala;
    this._estado('conectando');
    const recibir = (m) => { if (m && m.p !== this.yo) { this.recibidos++; this.alMensaje?.(m); } };
    this.t = tipo === 'local' ? new TransporteLocal(sala, recibir) : new TransporteSupabase(sala, recibir, (e) => this._estado(e));
    try {
      await this.t.unirse();
      this._estado('conectado');
    } catch (e) {
      this.t = null;
      this._estado('desconectado');
      throw e;
    }
  }

  _estado(e) { this.estado = e; this.alEstado?.(e); }

  // Evento fiable "lo antes posible": viaja en el siguiente paquete.
  evento(ev) { if (this.t) this.cola.push(ev); }

  // Un paquete por tick: estado de mis entidades + eventos.
  paquete(datos) {
    if (!this.t) return;
    const m = { p: this.yo, ...datos };
    if (this.cola.length) { m.ev = this.cola; this.cola = []; }
    this.enviados++;
    this.t.enviar(m);
  }

  async salir() {
    if (this.t) {
      this.paquete({ adios: 1 });
      this.t.salir();
    }
    this.t = null; this.cola = [];
    if (this.estado !== 'desconectado') this._estado('desconectado');
  }

  // Mensajes para la web que contiene el juego (iframe).
  avisarWeb(tipo, datos = {}) {
    try {
      if (window.parent && window.parent !== window) {
        const origen = document.referrer ? new URL(document.referrer).origin : '*';
        window.parent.postMessage({ fuente: 'hanamichi', tipo, ...datos }, origen);
      }
    } catch { /* sin acceso al padre */ }
  }
}

export const red = new Red();
