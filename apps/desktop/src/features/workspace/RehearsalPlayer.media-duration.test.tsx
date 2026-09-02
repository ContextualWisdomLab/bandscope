import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

const originalTauriInternals = Object.getOwnPropertyDescriptor(
  window,
  "__TAURI_INTERNALS__",
);
const audioSourcePath = "/Users/test/Music/rehearsal.wav";

function installPlayableAudioMocks() {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {
      convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
}

function admitDuration(audio: HTMLAudioElement, duration: number) {
  Object.defineProperty(audio, "duration", {
    configurable: true,
    value: duration,
  });
  fireEvent.loadedMetadata(audio);
}

describe("RehearsalPlayer admitted media duration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalTauriInternals) {
      Object.defineProperty(
        window,
        "__TAURI_INTERNALS__",
        originalTauriInternals,
      );
    } else {
      delete (window as Window & { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__;
    }
  });

  it("disables transport start when the selected loop extends beyond loaded audio", () => {
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio
        audioSourcePath={audioSourcePath}
      />,
    );

    const audio = screen.getByTestId("rehearsal-loop-audio") as HTMLAudioElement;
    admitDuration(audio, 20);

    expect(
      screen.getByRole("button", { name: /Start the count-in/i }),
    ).toBeDisabled();
  });

  it("rejects a corrected end boundary beyond admitted EOF", () => {
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange.end = 20;
    const onSongUpdate = vi.fn();

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio
        audioSourcePath={audioSourcePath}
        onSongUpdate={onSongUpdate}
      />,
    );

    const audio = screen.getByTestId("rehearsal-loop-audio") as HTMLAudioElement;
    admitDuration(audio, 25);
    const endInput = screen.getByLabelText(/end/i) as HTMLInputElement;
    fireEvent.change(endInput, { target: { value: "26" } });
    fireEvent.blur(endInput);

    expect(onSongUpdate).not.toHaveBeenCalled();
    expect(endInput.value).toBe("20");
    expect(endInput.getAttribute("aria-invalid")).toBe("true");
  });

  it("rejects a corrected start boundary at admitted EOF", () => {
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio
        audioSourcePath={audioSourcePath}
        onSongUpdate={onSongUpdate}
      />,
    );

    const audio = screen.getByTestId("rehearsal-loop-audio") as HTMLAudioElement;
    admitDuration(audio, 25);
    const startInput = screen.getByLabelText(/start/i) as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: "25" } });
    fireEvent.blur(startInput);

    expect(onSongUpdate).not.toHaveBeenCalled();
    expect(startInput.value).toBe("10");
    expect(startInput.getAttribute("aria-invalid")).toBe("true");
  });
});
