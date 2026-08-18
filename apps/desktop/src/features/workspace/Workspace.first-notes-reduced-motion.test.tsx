import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

afterEach(() => {
  vi.unstubAllGlobals();
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

describe("Workspace first-notes reduced-motion navigation", () => {
  it("avoids smooth scrolling when the user requests reduced motion", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      transcription: [{ pitch: "E2", onset: 0, offset: 0.75, velocity: 0.74 }]
    };
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    );

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Bass Guitar notes starting at E2 from 0:00 on tonight's groove map"
      })
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "auto"
    });
  });
});
