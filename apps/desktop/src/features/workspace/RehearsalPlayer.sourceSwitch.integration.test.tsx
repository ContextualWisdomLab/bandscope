import { act, fireEvent, render, screen } from "@testing-library/react";
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

function admitDuration(audio: HTMLAudioElement, duration: number): void {
  Object.defineProperty(audio, "duration", {
    configurable: true,
    value: duration,
  });
  fireEvent.loadedMetadata(audio);
}

async function enterLoopingPlayback(audio: HTMLAudioElement): Promise<void> {
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /start the count-in/i }));
  await act(async () => {
    vi.advanceTimersByTime(2_100);
    await Promise.resolve();
  });
  audio.currentTime = 17.5;
  fireEvent.timeUpdate(audio);
}

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
    admitDuration(audio, 120);
    await enterLoopingPlayback(audio);
    play.mockClear();
    load.mockClear();

    fireEvent.click(vocals);

    expect(vocals).toBeChecked();
    expect(load).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();

    admitDuration(audio, 120);

    expect(audio.currentTime).toBe(17.5);
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    play.mockClear();
    fireEvent.loadedMetadata(audio);
    expect(play).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aborts a target that cannot cover the active loop and never reuses its receipt", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
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
    admitDuration(audio, 120);
    await enterLoopingPlayback(audio);
    play.mockClear();

    fireEvent.click(vocals);
    expect(play).not.toHaveBeenCalled();

    admitDuration(audio, 20);

    expect(play).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(
      /could not play this local audio/i,
    );

    admitDuration(audio, 120);
    expect(play).not.toHaveBeenCalled();
  });

  it("keeps a cross-project source rotation non-playing before and after target admission", async () => {
    const load = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => undefined);
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);

    const song = createDemoRehearsalSong();
    const { rerender } = render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={fullMixAuthority}
      />,
    );

    const audio = screen.getByTestId("rehearsal-loop-audio") as HTMLAudioElement;
    admitDuration(audio, 120);
    await enterLoopingPlayback(audio);
    play.mockClear();
    load.mockClear();

    const nextProjectAuthority = "bandscope-project://project-200-1";
    rerender(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={nextProjectAuthority}
      />,
    );

    expect(load).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();

    admitDuration(audio, 120);
    expect(play).not.toHaveBeenCalled();
  });
});
