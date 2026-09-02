import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

const originalTauriInternals = Object.getOwnPropertyDescriptor(
  window,
  "__TAURI_INTERNALS__",
);

describe("RehearsalPlayer audio authority", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalTauriInternals) {
      Object.defineProperty(window, "__TAURI_INTERNALS__", originalTauriInternals);
    } else {
      delete (window as Window & { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__;
    }
  });

  it("refuses to start when local-audio metadata has no playable asset URL", () => {
    const song = createDemoRehearsalSong();

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath="browser://selected-audio"
        startNonce={1}
      />,
    );

    expect(
      screen.getByRole("button", { name: /start the count-in/i }),
    ).toBeDisabled();
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).not.toMatch(/count in 4 beats/i);
  });

  it("reports native asset conversion failures instead of presenting missing-audio copy", () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {
        convertFileSrc: () => {
          throw new Error("asset conversion failed");
        },
      },
    });
    const song = createDemoRehearsalSong();

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath="/Users/test/Music/late-night-set.wav"
        audioPlaybackProjectId="project-1"
      />,
    );

    expect(
      screen.getByRole("button", { name: /start the count-in/i }),
    ).toBeDisabled();
    expect(screen.getByRole("alert").textContent).toMatch(
      /could not play this local audio/i,
    );
  });

  it("mints the media URL from the app-owned project authority, never the native source path", () => {
    const convertFileSrc = vi.fn(
      () => "bandscope-playback://localhost/project-1",
    );
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: { convertFileSrc },
    });
    const song = createDemoRehearsalSong();

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath="/Users/test/Music/private-rehearsal.wav"
        audioPlaybackProjectId="project-1"
      />,
    );

    expect(convertFileSrc).toHaveBeenCalledWith(
      "project-1",
      "bandscope-playback",
    );
    expect(convertFileSrc).not.toHaveBeenCalledWith(
      "/Users/test/Music/private-rehearsal.wav",
    );
  });

  it("does not expose a native path when no current playback project authority exists", () => {
    const convertFileSrc = vi.fn(() => "asset://localhost/private-rehearsal.wav");
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: { convertFileSrc },
    });
    const song = createDemoRehearsalSong();

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath="/Users/test/Music/private-rehearsal.wav"
      />,
    );

    expect(convertFileSrc).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /start the count-in/i }),
    ).toBeDisabled();
  });
});
