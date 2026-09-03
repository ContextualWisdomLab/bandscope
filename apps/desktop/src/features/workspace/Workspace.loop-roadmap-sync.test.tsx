import { fireEvent, render } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

afterEach(() => {
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
});
