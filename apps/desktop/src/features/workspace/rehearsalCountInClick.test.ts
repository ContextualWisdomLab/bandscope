import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRehearsalCountInClickEngine,
  defaultRehearsalCountInContextFactory,
  type RehearsalCountInAudioContext,
  type RehearsalCountInGain,
  type RehearsalCountInOscillator,
} from "./rehearsalCountInClick";

function createFakeContext(): {
  context: RehearsalCountInAudioContext;
  gains: RehearsalCountInGain[];
  oscillators: RehearsalCountInOscillator[];
} {
  const gains: RehearsalCountInGain[] = [];
  const oscillators: RehearsalCountInOscillator[] = [];
  const context: RehearsalCountInAudioContext = {
    close: vi.fn(async () => undefined),
    createGain: () => {
      const gain: RehearsalCountInGain = {
        connect: () => gain,
        disconnect: vi.fn(),
        gain: {
          exponentialRampToValueAtTime: vi.fn(),
          setValueAtTime: vi.fn(),
        },
      };
      gains.push(gain);
      return gain;
    },
    createOscillator: () => {
      const oscillator: RehearsalCountInOscillator = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        frequency: { value: 0 },
        onended: null,
        start: vi.fn(),
        stop: vi.fn(),
        type: "sine",
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    currentTime: 1,
    destination: {},
    resume: vi.fn(async () => undefined),
    state: "running",
  };
  return { context, gains, oscillators };
}

describe("defaultRehearsalCountInContextFactory", () => {
  const originalAudioContext = Object.getOwnPropertyDescriptor(
    window,
    "AudioContext",
  );

  afterEach(() => {
    if (originalAudioContext) {
      Object.defineProperty(window, "AudioContext", originalAudioContext);
    } else {
      Reflect.deleteProperty(window, "AudioContext");
    }
    Reflect.deleteProperty(window, "webkitAudioContext");
  });

  it("is unavailable when the host exposes no Web Audio constructor", () => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(defaultRehearsalCountInContextFactory()).toBeNull();
  });

  it("constructs the standard AudioContext when present", () => {
    class FakeAudioContext {
      currentTime = 0;
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: FakeAudioContext,
    });
    const factory = defaultRehearsalCountInContextFactory();
    expect(factory).not.toBeNull();
    expect(factory?.()).toBeInstanceOf(FakeAudioContext);
  });

  it("falls back to webkitAudioContext when required by the host", () => {
    class FakeWebkitAudioContext {
      currentTime = 0;
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      configurable: true,
      writable: true,
      value: FakeWebkitAudioContext,
    });
    const factory = defaultRehearsalCountInContextFactory();
    expect(factory).not.toBeNull();
    expect(factory?.()).toBeInstanceOf(FakeWebkitAudioContext);
  });
});

describe("createRehearsalCountInClickEngine", () => {
  it("rejects a click when the host has no Web Audio boundary", async () => {
    const engine = createRehearsalCountInClickEngine(null);
    expect(engine.available).toBe(false);
    await expect(engine.click(true)).rejects.toThrow(/unavailable/i);
  });

  it("sounds accent and tap frequencies through one retained context", async () => {
    const { context, gains, oscillators } = createFakeContext();
    const factory = vi.fn(() => context);
    const engine = createRehearsalCountInClickEngine(factory);

    await engine.click(true);
    await engine.click(false);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(oscillators).toHaveLength(2);
    expect(oscillators[0]?.frequency.value).toBe(1200);
    expect(oscillators[1]?.frequency.value).toBe(800);
    expect(oscillators[0]?.type).toBe("square");
    expect(oscillators[0]?.start).toHaveBeenCalledTimes(1);
    expect(oscillators[0]?.stop).toHaveBeenCalledTimes(1);
    expect(gains[0]?.gain.setValueAtTime).toHaveBeenCalled();
    expect(gains[0]?.gain.exponentialRampToValueAtTime).toHaveBeenCalledTimes(2);

    oscillators[0]?.onended?.();
    expect(oscillators[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(gains[0]?.disconnect).toHaveBeenCalledTimes(1);

    engine.stop();
    expect(oscillators[1]?.stop).toHaveBeenCalledTimes(2);
    expect(oscillators[1]?.disconnect).toHaveBeenCalledTimes(1);
    expect(gains[1]?.disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not create a click after stop invalidates a pending resume", async () => {
    const { context, oscillators } = createFakeContext();
    context.state = "suspended";
    let finishResume: (() => void) | undefined;
    context.resume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishResume = resolve;
        }),
    );
    const engine = createRehearsalCountInClickEngine(() => context);

    const clickPromise = engine.click(true);
    await Promise.resolve();
    expect(context.resume).toHaveBeenCalledTimes(1);
    engine.stop();
    finishResume?.();
    await clickPromise;

    expect(oscillators).toHaveLength(0);
  });

  it("closes the context and invalidates pending resume work during disposal", async () => {
    const { context, oscillators } = createFakeContext();
    context.state = "suspended";
    let finishResume: (() => void) | undefined;
    context.resume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishResume = resolve;
        }),
    );
    const engine = createRehearsalCountInClickEngine(() => context);

    const clickPromise = engine.click(true);
    await Promise.resolve();
    expect(context.resume).toHaveBeenCalledTimes(1);

    await engine.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(engine.available).toBe(false);

    finishResume?.();
    await clickPromise;
    expect(oscillators).toHaveLength(0);

    await engine.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
    await expect(engine.click(false)).rejects.toThrow(/unavailable/i);
  });

  it("contains graph-construction failure and releases acquired nodes", async () => {
    const { context, oscillators } = createFakeContext();
    context.createGain = () => {
      throw new Error("gain failed");
    };
    const engine = createRehearsalCountInClickEngine(() => context);

    await expect(engine.click(true)).rejects.toThrow("gain failed");
    expect(oscillators[0]?.stop).toHaveBeenCalledTimes(1);
    expect(oscillators[0]?.disconnect).toHaveBeenCalledTimes(1);
  });

  it("contains node configuration failure and tolerates teardown errors", async () => {
    const { context, gains, oscillators } = createFakeContext();
    const baseCreateGain = context.createGain;
    context.createGain = () => {
      const gain = baseCreateGain();
      gain.gain.setValueAtTime = () => {
        throw new Error("envelope failed");
      };
      gain.disconnect = () => {
        throw new Error("gain already released");
      };
      return gain;
    };
    const baseCreateOscillator = context.createOscillator;
    context.createOscillator = () => {
      const oscillator = baseCreateOscillator();
      oscillator.stop = () => {
        throw new Error("oscillator already stopped");
      };
      oscillator.disconnect = () => {
        throw new Error("oscillator already released");
      };
      return oscillator;
    };
    const engine = createRehearsalCountInClickEngine(() => context);

    await expect(engine.click(false)).rejects.toThrow("envelope failed");
    expect(oscillators).toHaveLength(1);
    expect(gains).toHaveLength(1);
    expect(() => engine.stop()).not.toThrow();
  });
});
