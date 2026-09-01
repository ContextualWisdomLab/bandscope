import { act, fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

const originalTauriInternals = Object.getOwnPropertyDescriptor(
  window,
  "__TAURI_INTERNALS__",
);
const audioSourcePath = "/Users/test/Music/rehearsal.wav";

function installAudioBoundary() {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {
      convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
}

function renderPlayableSong() {
  render(
    <RehearsalPlayer
      song={createDemoRehearsalSong()}
      hasLocalAudio={true}
      audioSourcePath={audioSourcePath}
    />,
  );
}

describe("RehearsalPlayer media lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
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

  it("keeps a quick user pause when the pending play request aborts", async () => {
    installAudioBoundary();
    let rejectPlay: ((reason?: unknown) => void) | undefined;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPlay = reject;
        }),
    );
    renderPlayableSong();

    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Pause/i }));
    expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
      /paused/i,
    );

    await act(async () => {
      const interruption = new Error("The play request was interrupted");
      interruption.name = "AbortError";
      rejectPlay?.(interruption);
      await Promise.resolve();
    });

    expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
      /paused/i,
    );
    expect(screen.queryByTestId("rehearsal-loop-audio-error")).toBeNull();
  });

  it("ignores a stale play rejection after playback has resumed", async () => {
    installAudioBoundary();
    let rejectFirstPlay: ((reason?: unknown) => void) | undefined;
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFirstPlay = reject;
          }),
      )
      .mockResolvedValue(undefined);
    renderPlayableSong();

    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Pause/i }));
    fireEvent.click(screen.getByRole("button", { name: /Resume/i }));
    expect(play).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
      /Count in/i,
    );

    await act(async () => {
      const staleInterruption = new Error("The earlier play request was interrupted");
      staleInterruption.name = "AbortError";
      rejectFirstPlay?.(staleInterruption);
      await Promise.resolve();
    });

    expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
      /Count in/i,
    );
    expect(screen.queryByTestId("rehearsal-loop-audio-error")).toBeNull();
  });

  it("restarts a selected loop when the media ends at the section boundary", () => {
    vi.useFakeTimers();
    installAudioBoundary();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    renderPlayableSong();

    const audio = screen.getByTestId(
      "rehearsal-loop-audio",
    ) as HTMLAudioElement;
    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      writable: true,
      value: 10,
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
      /looping/i,
    );

    audio.currentTime = 30;
    fireEvent(audio, new Event("ended"));

    expect(audio.currentTime).toBe(10);
    expect(play.mock.calls.length).toBeGreaterThan(1);
    expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
      /looping/i,
    );
    expect(screen.queryByTestId("rehearsal-loop-audio-error")).toBeNull();
  });
});
