import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWebAudioCountInEngine,
  defaultCountInContextFactory,
  type CountInAudioContext,
  type CountInGain,
  type CountInOscillator
} from "./countInClickEngine";
import type { FirstCountInPlan } from "./firstCountIn";

const plan: FirstCountInPlan = {
  tempoBpm: 120,
  beats: 2,
  intervalMs: 500,
  sectionLabel: "verse"
};

function createFakeContext(): {
  context: CountInAudioContext;
  oscillators: CountInOscillator[];
} {
  const oscillators: CountInOscillator[] = [];
  const gain: CountInGain = {
    connect: () => gain,
    disconnect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn()
    }
  };
  const context: CountInAudioContext = {
    currentTime: 1,
    destination: {},
    state: "running",
    resume: vi.fn(async () => undefined),
    createGain: () => gain,
    createOscillator: () => {
      const oscillator: CountInOscillator = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        frequency: { value: 0 },
        type: "sine",
        start: vi.fn(),
        stop: vi.fn()
      };
      oscillators.push(oscillator);
      return oscillator;
    }
  };
  return { context, oscillators };
}

describe("defaultCountInContextFactory", () => {
  const originalAudioContext = window.AudioContext;

  afterEach(() => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: originalAudioContext
    });
    Reflect.deleteProperty(window, "webkitAudioContext");
  });

  it("returns null when the host has no AudioContext constructor", () => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: undefined
    });
    expect(defaultCountInContextFactory()).toBeNull();
  });

  it("constructs a context from the host AudioContext", () => {
    class FakeAudioContext {
      currentTime = 0;
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: FakeAudioContext
    });
    const factory = defaultCountInContextFactory();
    expect(factory).not.toBeNull();
    expect(factory?.()).toBeInstanceOf(FakeAudioContext);
  });

  it("falls back to webkitAudioContext when AudioContext is missing", () => {
    class FakeWebkitAudioContext {
      currentTime = 0;
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: undefined
    });
    Object.defineProperty(window, "webkitAudioContext", {
      configurable: true,
      writable: true,
      value: FakeWebkitAudioContext
    });
    const factory = defaultCountInContextFactory();
    expect(factory).not.toBeNull();
    expect(factory?.()).toBeInstanceOf(FakeWebkitAudioContext);
  });
});

describe("createWebAudioCountInEngine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is unavailable and rejects play when no factory exists", async () => {
    const engine = createWebAudioCountInEngine(null);
    expect(engine.available).toBe(false);
    await expect(engine.play(plan)).rejects.toThrow(/unavailable/i);
  });

  it("schedules an accented first click, resumes a suspended context, and stops live oscillators", async () => {
    vi.useFakeTimers();
    const { context, oscillators } = createFakeContext();
    context.state = "suspended";
    const engine = createWebAudioCountInEngine(() => context);

    const playPromise = engine.play(plan);
    await Promise.resolve();
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(oscillators).toHaveLength(2);
    expect(oscillators[0]?.frequency.value).toBe(1200);
    expect(oscillators[1]?.frequency.value).toBe(800);
    expect(oscillators[0]?.type).toBe("square");
    expect(oscillators[0]?.start).toHaveBeenCalled();
    expect(oscillators[0]?.stop).toHaveBeenCalled();

    engine.stop();
    expect(oscillators[0]?.stop).toHaveBeenCalled();
    expect(oscillators[0]?.disconnect).toHaveBeenCalled();

    vi.runAllTimers();
    await playPromise;
  });

  it("rejects a plan with no trusted beats", async () => {
    const { context } = createFakeContext();
    const engine = createWebAudioCountInEngine(() => context);
    await expect(engine.play({ ...plan, beats: 0 })).rejects.toThrow(/trusted beats/i);
  });

  it("swallows stop errors from already-finished oscillators", async () => {
    const { context, oscillators } = createFakeContext();
    const engine = createWebAudioCountInEngine(() => context);
    vi.useFakeTimers();
    const playPromise = engine.play(plan);
    await Promise.resolve();
    oscillators[0]!.stop = () => {
      throw new Error("already stopped");
    };
    oscillators[0]!.disconnect = () => {
      throw new Error("already disconnected");
    };
    engine.stop();
    vi.runAllTimers();
    await playPromise;
  });
});
