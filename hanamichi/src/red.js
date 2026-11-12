// Red: hoy solo avisa a la web que contiene el juego (iframe).
// Preparado para duelos online con Supabase Realtime más adelante:
//   1. Crear un canal por sala: supabase.channel('duelo:' + sala, { config: { broadcast: { self: false } } })
//   2. Enviar ~20 veces por segundo el estado del jugador (pos, yaw, pitch, arma, vida) con `enviarEstado`.
//   3. Pintar al rival con el estado recibido (interpolado) en lugar de usar el bot.
//   4. Los impactos los confirma quien recibe el disparo (más justo con lag) o una Edge Function.

let conexion = null;
const oyentes = new Set();

export const red = {
  get conectado() { return !!conexion; },

  // `adaptador` tendrá: unirse(sala, alRecibir), enviar(datos), salir().
  async conectar(adaptador, sala) {
    conexion = adaptador;
    await conexion.unirse(sala, (msg) => { for (const f of oyentes) f(msg); });
  },
  enviarEstado(estado) { conexion?.enviar({ tipo: 'estado', ...estado }); },
  alRecibir(f) { oyentes.add(f); return () => oyentes.delete(f); },
  async desconectar() { await conexion?.salir(); conexion = null; },

  // Mensajes para la web que contiene el juego.
  avisarWeb(tipo, datos = {}) {
    try {
      if (window.parent && window.parent !== window) {
        const origen = document.referrer ? new URL(document.referrer).origin : '*';
        window.parent.postMessage({ fuente: 'hanamichi', tipo, ...datos }, origen);
      }
    } catch { /* sin acceso al padre */ }
  },
};
