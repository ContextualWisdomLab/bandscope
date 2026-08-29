import { countInOnsetsMs, type FirstCountInPlan } from "./firstCountIn";

/** Minimal oscillator used by the local count-in click engine. */
export type CountInOscillator = {
  connect: (destination: unknown) => void;
  disconnect: () => void;
  frequency: { value: number };
  type: string;
  start: (when?: number) => void;
  stop: (when?: number) => void;
};

/** Minimal gain node used to envelope each click. */
export type CountInGain = {
  connect: (destination: unknown) => CountInGain;
  disconnect: () => void;
  gain: {
    setValueAtTime: (value: number, when: number) => void;
    exponentialRampToValueAtTime: (value: number, when: number) => void;
  };
};

/** Browser audio graph surface required to render a local click. */
export type CountInAudioContext = {
  currentTime: number;
  destination: unknown;
  state: string;
  resume: () => Promise<void>;
  createOscillator: () => CountInOscillator;
  createGain: () => CountInGain;
};

/** Factory that returns a local audio context or throws. */
export type CountInContextFactory = () => CountInAudioContext;

/** Local click engine for tonight's count-in. No files, URLs, or song audio. */
export type CountInClickEngine = {
  available: boolean;
  play: (plan: FirstCountInPlan) => Promise<void>;
  stop: () => void;
};

const ACCENT_FREQUENCY_HZ = 1200;
const TAP_FREQUENCY_HZ = 800;
const CLICK_SECONDS = 0.05;

/**
 * Return a Web Audio context factory when the host exposes AudioContext.
 *
 * Missing constructors fail closed. This never fetches, decodes, or plays
 * rehearsal audio; it only synthesizes a short local click.
 */
export function defaultCountInContextFactory(): CountInContextFactory | null {
  const AudioContextCtor =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }
  return () => new AudioContextCtor() as unknown as CountInAudioContext;
}

/**
 * Create a bounded local click engine for a trusted count-in plan.
 *
 * Scheduled oscillators are tracked and stopped on `stop()` or the next play.
 * A missing factory is unavailable rather than throwing at construction.
 */
export function createWebAudioCountInEngine(
  contextFactory: CountInContextFactory | null = defaultCountInContextFactory()
): CountInClickEngine {
  let context: CountInAudioContext | null = null;
  const liveOscillators: CountInOscillator[] = [];

  const stop = (): void => {
    while (liveOscillators.length > 0) {
      const oscillator = liveOscillators.pop();
      if (!oscillator) {
        continue;
      }
      try {
        oscillator.stop();
      } catch {
        // Already stopped oscillators throw; the engine still releases them.
      }
      try {
        oscillator.disconnect();
      } catch {
        // Disconnect is best-effort after stop.
      }
    }
  };

  return {
    available: contextFactory !== null,
    async play(plan: FirstCountInPlan): Promise<void> {
      if (!contextFactory) {
        throw new Error("Count-in click is unavailable.");
      }

      stop();
      if (!context) {
        context = contextFactory();
      }
      if (context.state === "suspended") {
        await context.resume();
      }

      const onsets = countInOnsetsMs(plan);
      if (onsets.length === 0) {
        throw new Error("Count-in click has no trusted beats.");
      }

      const origin = context.currentTime + 0.02;
      for (const [index, onsetMs] of onsets.entries()) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const when = origin + onsetMs / 1000;
        oscillator.type = "square";
        oscillator.frequency.value = index === 0 ? ACCENT_FREQUENCY_HZ : TAP_FREQUENCY_HZ;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(0.12, when + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + CLICK_SECONDS);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(when);
        oscillator.stop(when + CLICK_SECONDS + 0.01);
        liveOscillators.push(oscillator);
      }

      const lastOnset = onsets[onsets.length - 1] ?? 0;
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(() => {
          resolve();
        }, lastOnset + CLICK_SECONDS * 1000 + 40);
      });
    },
    stop
  };
}
