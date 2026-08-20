import { act, fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language,
  });
}

describe("RehearsalPlayer", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("names the first playable loop and asks for a local song before hearing it", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    render(<RehearsalPlayer song={song} hasLocalAudio={false} />);

    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Loop verse from 0:10–0:30\. Choose a local song first/i);
    expect(
      screen.getByRole("button", { name: /Start the count-in/i }),
    ).toBeTruthy();
  });

  it("counts in then loops the selected section on the map clock", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    const song = createDemoRehearsalSong();
    render(<RehearsalPlayer song={song} hasLocalAudio={true} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Count in 4 beats at 120 BPM/i);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/verse is looping 0:10–0:30/i);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(
      screen.getByTestId("rehearsal-loop-playhead").getAttribute("style"),
    ).toContain("%");
  });

  it("stays fail-closed when no section has a usable window", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections = [];
    render(<RehearsalPlayer song={song} />);

    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Add a section with a start and end time/i);
    expect(
      (
        screen.getByRole("button", {
          name: /Start the count-in/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
