import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn(
    (source: string) => `bandscope-playback://localhost/${source}`,
  ),
  invoke: vi.fn(),
}));

const fullMixAuthority = "bandscope-project://project-100-1";
const vocalsAuthority = `${fullMixAuthority}/stem/vocals`;
const stemAuthorities = [
  vocalsAuthority,
  `${fullMixAuthority}/stem/bass`,
  `${fullMixAuthority}/stem/drums`,
  `${fullMixAuthority}/stem/other`,
] as const;

describe("RehearsalPlayer mounted source-switch transaction", () => {
  beforeEach(() => {
    vi.mocked(convertFileSrc).mockClear();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue([
      fullMixAuthority,
      ...stemAuthorities,
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps a looping transport non-playing until the selected stem is admitted, then restores position and resumes", async () => {
    const load = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => undefined);
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);

    render(
      <RehearsalPlayer
        song={createDemoRehearsalSong()}
        hasLocalAudio={true}
        audioSourcePath={fullMixAuthority}
      />,
    );

    const vocals = await screen.findByRole("radio", { name: "Vocals" });
    const audio = screen.getByTestId("rehearsal-loop-audio") as HTMLAudioElement;
    Object.defineProperty(audio, "duration", {
      configurable: true,
      value: 120,
    });
    fireEvent.loadedMetadata(audio);

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /start the count-in/i }));
    await act(async () => {
      vi.advanceTimersByTime(2_100);
      await Promise.resolve();
    });

    audio.currentTime = 2.5;
    fireEvent.timeUpdate(audio);
    play.mockClear();
    load.mockClear();

    fireEvent.click(vocals);

    await waitFor(() => expect(vocals).toBeChecked());
    expect(load).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();

    Object.defineProperty(audio, "duration", {
      configurable: true,
      value: 120,
    });
    fireEvent.loadedMetadata(audio);

    expect(audio.currentTime).toBe(2.5);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
