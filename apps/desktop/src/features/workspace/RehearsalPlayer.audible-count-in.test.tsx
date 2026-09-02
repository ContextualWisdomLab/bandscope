import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

const originalLanguage = navigator.language;
const originalTauriInternals = Object.getOwnPropertyDescriptor(
  window,
  "__TAURI_INTERNALS__",
);
const originalAudioContext = Object.getOwnPropertyDescriptor(
  window,
  "AudioContext",
);
const audioSourcePath = "/Users/test/Music/rehearsal.wav";

type FakeOscillator = {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  frequency: { value: number };
  onended: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  type: OscillatorType;
};

type PlayableAudioMocks = {
  closeAudioContext: ReturnType<typeof vi.fn>;
  oscillators: FakeOscillator[];
};

function installPlayableAudioMocks(): PlayableAudioMocks {
  const oscillators: FakeOscillator[] = [];
  const closeAudioContext = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: "en-US",
  });
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {
      convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

  class FakeAudioContext {
    currentTime = 1;
    destination = {};
    state: AudioContextState = "running";

    close = closeAudioContext;
    resume = vi.fn(async () => undefined);

    createGain() {
      const gain = {
        connect: vi.fn(() => gain),
        disconnect: vi.fn(),
        gain: {
          exponentialRampToValueAtTime: vi.fn(),
          setValueAtTime: vi.fn(),
        },
      };
      return gain;
    }

    createOscillator() {
      const oscillator: FakeOscillator = {
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
    }
  }

  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: FakeAudioContext,
  });
  return { closeAudioContext, oscillators };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: originalLanguage,
  });
  if (originalTauriInternals) {
    Object.defineProperty(window, "__TAURI_INTERNALS__", originalTauriInternals);
  } else {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
  }
  if (originalAudioContext) {
    Object.defineProperty(window, "AudioContext", originalAudioContext);
  } else {
    Reflect.deleteProperty(window, "AudioContext");
  }
});

it("sounds the transport count-in without replaying a beat when playback rate changes", () => {
  vi.useFakeTimers();
  const { oscillators } = installPlayableAudioMocks();
  const song = createDemoRehearsalSong();

  render(
    <RehearsalPlayer
      song={song}
      hasLocalAudio={true}
      audioSourcePath={audioSourcePath}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Start the count-in/i }));

  expect(oscillators).toHaveLength(1);
  expect(oscillators[0]?.frequency.value).toBe(1200);
  expect(oscillators[0]?.type).toBe("square");
  expect(oscillators[0]?.start).toHaveBeenCalledTimes(1);

  act(() => {
    vi.advanceTimersByTime(400);
  });
  fireEvent.change(screen.getByRole("combobox", { name: /Playback speed/i }), {
    target: { value: "1.25" },
  });
  expect(oscillators).toHaveLength(1);

  act(() => {
    vi.advanceTimersByTime(79);
  });
  expect(oscillators).toHaveLength(1);

  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(oscillators).toHaveLength(2);
  expect(oscillators[1]?.frequency.value).toBe(800);

  fireEvent.click(screen.getByRole("button", { name: /Pause/i }));
  expect(oscillators[1]?.stop).toHaveBeenCalledTimes(2);
});

it("keeps audible count-in available across Strict Mode effect replay", () => {
  const { closeAudioContext, oscillators } = installPlayableAudioMocks();
  const song = createDemoRehearsalSong();
  const { unmount } = render(
    <StrictMode>
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />
    </StrictMode>,
  );

  fireEvent.click(screen.getByRole("button", { name: /Start the count-in/i }));

  expect(oscillators).toHaveLength(1);
  unmount();
  expect(closeAudioContext).toHaveBeenCalledTimes(1);
});

it("closes the count-in audio context when the mounted player unmounts", () => {
  const { closeAudioContext, oscillators } = installPlayableAudioMocks();
  const song = createDemoRehearsalSong();
  const { unmount } = render(
    <RehearsalPlayer
      song={song}
      hasLocalAudio={true}
      audioSourcePath={audioSourcePath}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Start the count-in/i }));
  expect(oscillators).toHaveLength(1);

  unmount();

  expect(closeAudioContext).toHaveBeenCalledTimes(1);
});