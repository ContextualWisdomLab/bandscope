import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

const originalLanguageDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "language");

afterEach(() => {
  vi.restoreAllMocks();
  if (originalLanguageDescriptor) {
    Object.defineProperty(window.navigator, "language", originalLanguageDescriptor);
  } else {
    Reflect.deleteProperty(window.navigator, "language");
  }
});

function useEnglishLocale(): void {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: "en-US"
  });
}

function makeTwoSectionSong(): RehearsalSong {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const chorus = {
    ...verse,
    id: "chorus-1",
    label: "chorus",
    timeRange: { start: 30, end: 50 }
  };
  return {
    ...song,
    sections: [verse, chorus],
    exportSummary: {
      ...song.exportSummary,
      focusSections: ["verse"]
    }
  };
}

describe("Workspace timeline cue regressions", () => {
  it("moves real keyboard focus to the timeline bar on every cue action", () => {
    useEnglishLocale();
    const song = createDemoRehearsalSong();
    render(<Workspace song={song} />);

    const bar = document.getElementById("workspace-timeline-verse-1");
    expect(bar).toBeTruthy();
    const scrollIntoView = vi.fn();
    Object.defineProperty(bar!, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

    const cueButton = screen.getByRole("button", {
      name: "Cue verse on the song timeline from 0:10 to 0:30"
    });
    fireEvent.click(cueButton);

    expect(bar).toHaveAttribute("aria-current", "true");
    expect(document.activeElement).toBe(bar);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    fireEvent.click(cueButton);

    expect(document.activeElement).toBe(bar);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("keeps the live cue status aligned with the highlighted section after focus metadata changes", () => {
    useEnglishLocale();
    const initialSong = makeTwoSectionSong();
    const { rerender } = render(<Workspace song={initialSong} />);

    const verseBar = document.getElementById("workspace-timeline-verse-1");
    expect(verseBar).toBeTruthy();
    Object.defineProperty(verseBar!, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cue verse on the song timeline from 0:10 to 0:30"
      })
    );

    expect(verseBar).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByText("Tonight's first lock-in is cued at verse · 0:10–0:30. Count in from that mark.")
    ).toBeTruthy();

    const updatedSong: RehearsalSong = {
      ...initialSong,
      exportSummary: {
        ...initialSong.exportSummary,
        focusSections: ["chorus"]
      }
    };
    rerender(<Workspace song={updatedSong} />);

    expect(document.getElementById("workspace-timeline-verse-1")).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByText("Tonight's first lock-in is cued at verse · 0:10–0:30. Count in from that mark.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Tonight's first lock-in is cued at chorus · 0:30–0:50. Count in from that mark.")
    ).toBeNull();
  });
});
