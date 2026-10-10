import { fireEvent, render } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

const originalLanguageDescriptor = Object.getOwnPropertyDescriptor(
  window.navigator,
  "language",
);
const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

afterEach(() => {
  if (originalLanguageDescriptor) {
    Object.defineProperty(window.navigator, "language", originalLanguageDescriptor);
  }

  if (originalMatchMediaDescriptor) {
    Object.defineProperty(window, "matchMedia", originalMatchMediaDescriptor);
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }

  if (originalScrollIntoViewDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoViewDescriptor,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }

  vi.restoreAllMocks();
});

describe("Workspace loop roadmap synchronization", () => {
  it("projects the player-selected section onto the production roadmap", () => {
    const song = createDemoRehearsalSong();
    const verse = structuredClone(song.sections[0]!);
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 64 };
    song.sections = [verse, chorus];

    render(<Workspace song={song} />);

    const sectionButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        'button[id^="rehearsal-loop-section-"]',
      ),
    );
    const verseCard = document.getElementById("workspace-section-card-0");
    const chorusCard = document.getElementById("workspace-section-card-1");

    expect(sectionButtons).toHaveLength(2);
    expect(verseCard?.className).toContain("ring-cyan-300/70");
    expect(chorusCard?.className).not.toContain("ring-cyan-300/70");

    fireEvent.click(sectionButtons[1]!);

    expect(verseCard?.className).not.toContain("ring-cyan-300/70");
    expect(chorusCard?.className).toContain("ring-cyan-300/70");
  });

  it("selects the same player and roadmap occurrence from the song-structure timeline", () => {
    const song = createDemoRehearsalSong();
    const verse = structuredClone(song.sections[0]!);
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 64 };
    song.sections = [verse, chorus];

    render(<Workspace song={song} />);

    const timelineChorus = document.querySelector<HTMLButtonElement>(
      'button[data-song-structure-section-index="1"]',
    );
    const playerButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        'button[id^="rehearsal-loop-section-"]',
      ),
    );
    const chorusCard = document.getElementById("workspace-section-card-1");

    expect(timelineChorus).not.toBeNull();
    expect(playerButtons).toHaveLength(2);
    fireEvent.click(timelineChorus!);

    expect(timelineChorus?.getAttribute("aria-pressed")).toBe("true");
    expect(playerButtons[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(chorusCard?.className).toContain("ring-cyan-300/70");
  });

  it("localizes the song-structure timeline region for Korean assistive technology", () => {
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "ko-KR",
    });

    const view = render(<Workspace song={createDemoRehearsalSong()} />);

    expect(
      view.getByRole("region", { name: "스크롤 가능한 곡 구조 타임라인" }),
    ).toBeTruthy();
  });

  it("focuses the selected roadmap occurrence without motion when reduced motion is requested", () => {
    const song = createDemoRehearsalSong();
    const verse = structuredClone(song.sections[0]!);
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = verse.id;
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 64 };
    song.sections = [verse, chorus];

    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(<Workspace song={song} />);

    const sectionButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        'button[id^="rehearsal-loop-section-"]',
      ),
    );
    const chorusCard = document.getElementById("workspace-section-card-1");

    expect(sectionButtons).toHaveLength(2);
    fireEvent.click(sectionButtons[1]!);

    expect(document.activeElement).toBe(chorusCard);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "nearest",
      inline: "center",
    });
  });

  it("keeps focus in the section picker across consecutive arrow-key selections", () => {
    const song = createDemoRehearsalSong();
    const verse = structuredClone(song.sections[0]!);
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 64 };
    const bridge = structuredClone(song.sections[0]!);
    bridge.id = "bridge-1";
    bridge.label = "bridge";
    bridge.timeRange = { start: 64, end: 88 };
    song.sections = [verse, chorus, bridge];

    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(<Workspace song={song} />);

    const sectionButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        'button[id^="rehearsal-loop-section-"]',
      ),
    );

    expect(sectionButtons).toHaveLength(3);
    sectionButtons[0]!.focus();

    fireEvent.keyDown(sectionButtons[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(sectionButtons[1]);

    fireEvent.keyDown(sectionButtons[1]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(sectionButtons[2]);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
