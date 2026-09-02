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
  close: () => Promise<void>;
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
  dispose: () => Promise<void>;
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
  let disposed = false;
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

  /** Release an oscillator acquired before gain-node construction completed. */
  const releasePartialOscillator = (
    oscillator: RehearsalCountInOscillator,
  ): void => {
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
  };

  /** Invalidate pending resume work and release every active click node. */
  const stop = (): void => {
    playbackGeneration += 1;
    for (const node of [...liveNodes]) {
      releaseNode(node, true);
    }
  };

  /** Permanently release the mounted player's Web Audio authority. */
  const dispose = async (): Promise<void> => {
    if (disposed) {
      return;
    }
    disposed = true;
    stop();
    const closingContext = context;
    context = null;
    if (!closingContext) {
      return;
    }
    try {
      await closingContext.close();
    } catch {
      // Browser teardown failures must not keep an unmounted player alive.
    }
  };

  return {
    get available(): boolean {
      return contextFactory !== null && !disposed;
    },
    /** Sound exactly one admitted transport beat, accented only at count-in start. */
    async click(accent: boolean): Promise<void> {
      if (!contextFactory || disposed) {
        throw new Error("Rehearsal count-in click is unavailable.");
      }
      const generation = playbackGeneration;
      const activeContext = context ?? (context = contextFactory());
      if (activeContext.state === "suspended") {
        await activeContext.resume();
      }
      if (generation !== playbackGeneration || disposed) {
        return;
      }

      const oscillator = activeContext.createOscillator();
      let gain: RehearsalCountInGain;
      try {
        gain = activeContext.createGain();
      } catch (error) {
        releasePartialOscillator(oscillator);
        throw error;
      }

      const node = { gain, oscillator };
      liveNodes.add(node);
      try {
        const when = activeContext.currentTime + CLICK_LEAD_SECONDS;
        oscillator.type = "square";
        oscillator.frequency.value = accent
          ? ACCENT_FREQUENCY_HZ
          : TAP_FREQUENCY_HZ;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(0.12, when + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + CLICK_SECONDS);
        oscillator.connect(gain);
        gain.connect(activeContext.destination);
        oscillator.onended = () => releaseNode(node, false);
        oscillator.start(when);
        oscillator.stop(when + CLICK_SECONDS + 0.01);
      } catch (error) {
        releaseNode(node, true);
        throw error;
      }
    },
    dispose,
    stop,
  };
}
