import { act, fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

const originalLanguage = navigator.language;
const originalTauriInternals = Object.getOwnPropertyDescriptor(
  window,
  "__TAURI_INTERNALS__",
);
const originalPreservesPitch = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "preservesPitch",
);
const audioSourcePath = "/Users/test/Music/rehearsal.wav";

function installPlayableAudioMocks() {
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
  Object.defineProperty(HTMLMediaElement.prototype, "preservesPitch", {
    configurable: true,
    writable: true,
    value: false,
  });
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
  if (originalPreservesPitch) {
    Object.defineProperty(
      HTMLMediaElement.prototype,
      "preservesPitch",
      originalPreservesPitch,
    );
  } else {
    delete (HTMLMediaElement.prototype as HTMLMediaElement & {
      preservesPitch?: boolean;
    }).preservesPitch;
  }
});

it("preserves cumulative progress through a count-in beat across repeated speed changes", () => {
  vi.useFakeTimers();
  installPlayableAudioMocks();
  const song = createDemoRehearsalSong();

  render(
    <RehearsalPlayer
      song={song}
      hasLocalAudio={true}
      audioSourcePath={audioSourcePath}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Start the count-in/i }));
  act(() => {
    vi.advanceTimersByTime(400);
  });

  fireEvent.change(screen.getByRole("combobox", { name: /Playback speed/i }), {
    target: { value: "0.75" },
  });
  act(() => {
    vi.advanceTimersByTime(50);
  });
  fireEvent.change(screen.getByRole("combobox", { name: /Playback speed/i }), {
    target: { value: "1.25" },
  });

  act(() => {
    vi.advanceTimersByTime(49);
  });
  expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
    /Count in 4 beats at 150 BPM/i,
  );

  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
    /Count in 3 beats at 150 BPM/i,
  );
});
