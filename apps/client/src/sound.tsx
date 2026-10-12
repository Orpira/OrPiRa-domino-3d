import { useEffect, useRef, useSyncExternalStore } from "react";
import { soundCues, type SoundCue, type SoundSnapshot } from "./sound-events.ts";

const STORAGE_KEY = "orpira-domino-3d:sound:v1";
const MASTER_VOLUME = .5;

type Synth = (context: AudioContext, output: AudioNode, start: number) => number;

function tone(context: AudioContext, output: AudioNode, { frequency, start, duration, type = "sine", gain = .2, glideTo, attack = .006 }:
  { frequency: number; start: number; duration: number; type?: OscillatorType; gain?: number; glideTo?: number; attack?: number }) {
  const oscillator = context.createOscillator(); const envelope = context.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start);
  if (glideTo) oscillator.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(gain, start + attack);
  envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(envelope).connect(output); oscillator.start(start); oscillator.stop(start + duration + .02);
}

let noiseBuffer: AudioBuffer | null = null;
function noise(context: AudioContext, output: AudioNode, { start, duration, frequency, q = 1, gain = .3 }: { start: number; duration: number; frequency: number; q?: number; gain?: number }) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== context.sampleRate) {
    noiseBuffer = context.createBuffer(1, context.sampleRate * .5, context.sampleRate); const data = noiseBuffer.getChannelData(0);
    let seed = 7; for (let index = 0; index < data.length; index += 1) { seed = (seed * 16807) % 2147483647; data[index] = seed / 1073741823.5 - 1; }
  }
  const source = context.createBufferSource(); const filter = context.createBiquadFilter(); const envelope = context.createGain();
  source.buffer = noiseBuffer; filter.type = "bandpass"; filter.frequency.value = frequency; filter.Q.value = q;
  envelope.gain.setValueAtTime(gain, start); envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
  source.connect(filter).connect(envelope).connect(output); source.start(start); source.stop(start + duration + .02);
}

const NOTE = { E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.51, G6: 1567.98, B6: 1975.53, C7: 2093 };
const chord = (context: AudioContext, output: AudioNode, start: number, notes: number[], duration: number, gain: number) =>
  notes.forEach((frequency) => tone(context, output, { frequency, start, duration, type: "triangle", gain, attack: .02 }));

/** Cada sonido se sintetiza en el navegador (sin archivos) y devuelve cuánto esperar antes del siguiente. */
const SYNTHS: Record<SoundCue, Synth> = {
  // Ficha de hueso contra la mesa: chasquido seco y un golpe grave.
  place: (c, o, t) => { noise(c, o, { start: t, duration: .07, frequency: 2300, q: 1.4, gain: .55 }); tone(c, o, { frequency: 170, glideTo: 90, start: t, duration: .07, type: "triangle", gain: .35 }); return .09; },
  // Doble: campanilla brillante de dos notas.
  double: (c, o, t) => { tone(c, o, { frequency: NOTE.E6, start: t, duration: .28, gain: .12 }); tone(c, o, { frequency: NOTE.B6, start: t + .08, duration: .34, gain: .1 }); return .32; },
  // Pase forzado del rival: «bloop» descendente juguetón.
  pass: (c, o, t) => { tone(c, o, { frequency: 620, glideTo: 300, start: t, duration: .22, type: "triangle", gain: .18 }); tone(c, o, { frequency: 460, glideTo: 210, start: t + .15, duration: .26, type: "triangle", gain: .15 }); return .4; },
  // Capicúa: arpegio ascendente con destellos.
  capicua: (c, o, t) => {
    [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7].forEach((frequency, index) => tone(c, o, { frequency, start: t + index * .07, duration: .34, gain: .11 }));
    noise(c, o, { start: t + .28, duration: .25, frequency: 7000, q: .8, gain: .12 }); return .55;
  },
  // Ronda ganada por dominada: fanfarria corta.
  roundWin: (c, o, t) => {
    [NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5].forEach((frequency, index) => tone(c, o, { frequency, start: t + index * .11, duration: .18, type: "triangle", gain: .16 }));
    chord(c, o, t + .48, [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], .8, .08); return 1.2;
  },
  // Ronda ganada por cierre (tranque): dos golpes y acorde.
  roundWinBlocked: (c, o, t) => {
    tone(c, o, { frequency: NOTE.E4, start: t, duration: .16, type: "triangle", gain: .16 }); tone(c, o, { frequency: NOTE.G4, start: t + .14, duration: .16, type: "triangle", gain: .16 });
    chord(c, o, t + .32, [NOTE.C5, NOTE.E5, NOTE.G5], .6, .08); return .95;
  },
  // Ronda de otro jugador: aviso neutro.
  roundEnd: (c, o, t) => { tone(c, o, { frequency: NOTE.A4, start: t, duration: .26, gain: .13 }); tone(c, o, { frequency: NOTE.E4, start: t + .2, duration: .4, gain: .12 }); return .65; },
  // Partida ganada: fanfarria larga y acorde final con destellos.
  matchWin: (c, o, t) => {
    [NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5].forEach((frequency, index) => tone(c, o, { frequency, start: t + index * .12, duration: .2, type: "triangle", gain: .16 }));
    [NOTE.A5, NOTE.G5, NOTE.A5, NOTE.C6].forEach((frequency, index) => tone(c, o, { frequency, start: t + .6 + index * .13, duration: .2, type: "triangle", gain: .15 }));
    chord(c, o, t + 1.18, [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6], 1.6, .07);
    for (let index = 0; index < 5; index += 1) noise(c, o, { start: t + 1.2 + index * .18, duration: .2, frequency: 6500 + index * 400, q: .9, gain: .08 });
    return 2.9;
  },
  matchEnd: (c, o, t) => { tone(c, o, { frequency: NOTE.C5, start: t, duration: .3, gain: .13 }); tone(c, o, { frequency: NOTE.G4, start: t + .24, duration: .3, gain: .12 }); tone(c, o, { frequency: NOTE.C5, start: t + .48, duration: .6, gain: .12 }); return 1.1; },
  // Nueva ronda: fichas revolviéndose sobre la mesa.
  shuffle: (c, o, t) => { [0, .05, .11, .15, .22, .27, .34, .4].forEach((offset, index) => noise(c, o, { start: t + offset, duration: .05, frequency: 1600 + (index % 3) * 500, q: 1.2, gain: .28 })); return .5; },
};

function readPreference() { try { return window.localStorage.getItem(STORAGE_KEY) !== "off"; } catch { return true; } }

class SoundEngine {
  private context: AudioContext | null = null; private master: GainNode | null = null; private readonly listeners = new Set<() => void>();
  enabled = typeof window === "undefined" ? false : readPreference();

  private audio(): AudioContext | null {
    if (!this.context) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!Context) return null;
      try { this.context = new Context(); } catch { return null; }
      this.master = this.context.createGain(); this.master.gain.value = MASTER_VOLUME; this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
    return this.context;
  }

  /** Los navegadores solo permiten sonar tras un gesto del usuario: se llama en cada toque o tecla. */
  unlock() { if (this.enabled) this.audio(); }

  play(cues: readonly SoundCue[]) {
    if (!this.enabled || cues.length === 0) return; const context = this.audio(); if (!context || !this.master) return;
    let start = context.currentTime + .02; for (const cue of cues) start += SYNTHS[cue](context, this.master, start);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled; try { window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off"); } catch { /* Preferencia solo en memoria. */ }
    this.listeners.forEach((listener) => listener()); if (enabled) this.play(["place"]);
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.enabled;
}

export const sound = new SoundEngine();
if (typeof window !== "undefined") for (const event of ["pointerdown", "keydown"]) window.addEventListener(event, () => sound.unlock(), { passive: true });

/** Reproduce los sonidos de cada cambio de la partida. El primer estado (al abrir o reconectar) no suena. */
export function useGameSounds(snapshot: SoundSnapshot, viewerId?: string) {
  const previous = useRef<SoundSnapshot | null>(null);
  useEffect(() => { const cues = soundCues(previous.current, snapshot, viewerId); previous.current = snapshot; sound.play(cues); }, [snapshot, viewerId]);
}

export function SoundToggle() {
  const enabled = useSyncExternalStore(sound.subscribe, sound.snapshot, () => false);
  return <button type="button" className="sound-toggle" aria-pressed={enabled} onClick={() => sound.setEnabled(!enabled)}>
    <span aria-hidden="true">{enabled ? "🔊" : "🔇"}</span>{enabled ? "Sonido" : "Sin sonido"}
  </button>;
}
