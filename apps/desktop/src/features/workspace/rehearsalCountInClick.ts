export type RehearsalCountInOscillator = {
  connect: (destination: unknown) => void;
  disconnect: () => void;
  frequency: { value: number };
  onended: (() => void) | null;
  start: (when?: number) => void;
  stop: (when?: number) => void;
  type: string;
};

export type RehearsalCountInGain = {
  connect: (destination: unknown) => RehearsalCountInGain;
  disconnect: () => void;
  gain: {
    exponentialRampToValueAtTime: (value: number, when: number) => void;
    setValueAtTime: (value: number, when: number) => void;
  };
};

export type RehearsalCountInAudioContext = {
  createGain: () => RehearsalCountInGain;
  createOscillator: () => RehearsalCountInOscillator;
  currentTime: number;
  destination: unknown;
  resume: () => Promise<void>;
  state: string;
};

export type RehearsalCountInContextFactory = () => RehearsalCountInAudioContext;

export type RehearsalCountInClickEngine = {
  available: boolean;
  click: (accent: boolean) => Promise<void>;
  stop: () => void;
};

const ACCENT_FREQUENCY_HZ = 1200;
const TAP_FREQUENCY_HZ = 800;
const CLICK_SECONDS = 0.05;
const CLICK_LEAD_SECONDS = 0.005;

type LiveClickNode = {
  gain: RehearsalCountInGain;
  oscillator: RehearsalCountInOscillator;
};

/** Return the host Web Audio factory used only for the local count-in click. */
export function defaultRehearsalCountInContextFactory(): RehearsalCountInContextFactory | null {
  const AudioContextCtor =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }
  return () => new AudioContextCtor() as unknown as RehearsalCountInAudioContext;
}

/** Create a bounded local click engine owned by the active-player transport. */
export function createRehearsalCountInClickEngine(
  contextFactory: RehearsalCountInContextFactory | null =
    defaultRehearsalCountInContextFactory(),
): RehearsalCountInClickEngine {
  let context: RehearsalCountInAudioContext | null = null;
  let playbackGeneration = 0;
  const liveNodes = new Set<LiveClickNode>();

  /** Release one tracked click node without retaining audio-graph authority. */
  const releaseNode = (node: LiveClickNode, stopOscillator: boolean): void => {
    liveNodes.delete(node);
    if (stopOscillator) {
      try {
        node.oscillator.stop();
      } catch {
        // An already-ended oscillator may reject a second stop during teardown.
      }
    }
    try {
      node.oscillator.disconnect();
    } catch {
      // Disconnect remains best-effort after the browser releases a node.
    }
    try {
      node.gain.disconnect();
    } catch {
      // Gain cleanup must not keep a stale transport alive.
    }
  };

  /** Invalidate pending resume work and release every active click node. */
  const stop = (): void => {
    playbackGeneration += 1;
    for (const node of [...liveNodes]) {
      releaseNode(node, true);
    }
  };

  return {
    available: contextFactory !== null,
    /** Sound exactly one admitted transport beat, accented only at count-in start. */
    async click(accent: boolean): Promise<void> {
      if (!contextFactory) {
        throw new Error("Rehearsal count-in click is unavailable.");
      }
      const generation = playbackGeneration;
      if (!context) {
        context = contextFactory();
      }
      if (context.state === "suspended") {
        await context.resume();
      }
      if (generation !== playbackGeneration) {
        return;
      }

      let oscillator: RehearsalCountInOscillator | null = null;
      let gain: RehearsalCountInGain | null = null;
      let node: LiveClickNode | null = null;
      try {
        oscillator = context.createOscillator();
        gain = context.createGain();
        node = { gain, oscillator };
        liveNodes.add(node);
        const when = context.currentTime + CLICK_LEAD_SECONDS;
        oscillator.type = "square";
        oscillator.frequency.value = accent
          ? ACCENT_FREQUENCY_HZ
          : TAP_FREQUENCY_HZ;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(0.12, when + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + CLICK_SECONDS);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          if (node) {
            releaseNode(node, false);
          }
        };
        oscillator.start(when);
        oscillator.stop(when + CLICK_SECONDS + 0.01);
      } catch (error) {
        if (node) {
          releaseNode(node, true);
        } else {
          if (oscillator) {
            try {
              oscillator.stop();
            } catch {
              // Partial construction still releases every acquired node.
            }
            try {
              oscillator.disconnect();
            } catch {
              // Partial construction cleanup is best-effort.
            }
          }
          if (gain) {
            try {
              gain.disconnect();
            } catch {
              // Partial construction cleanup is best-effort.
            }
          }
        }
        throw error;
      }
    },
    stop,
  };
}
