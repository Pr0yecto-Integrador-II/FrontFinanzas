/**
 * Pitido corto que avisa «ya puedes hablar». Sin él, quien habla justo al tocar el botón
 * empieza antes de que el micrófono esté abierto y se pierde el comienzo de la frase.
 * Es opcional: si el navegador no tiene Web Audio, simplemente no suena.
 */
export function playReadyTone(): void {
  try {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.onended = () => void ctx.close();
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // sin aviso sonoro: la interfaz igual muestra «Escuchando»
  }
}
