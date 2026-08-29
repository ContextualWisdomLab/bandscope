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
      />,
    );

    expect(
      screen.getByRole("button", { name: /start the count-in/i }),
    ).toBeDisabled();
    expect(screen.getByRole("alert").textContent).toMatch(
      /could not play this local audio/i,
    );
  });
});
