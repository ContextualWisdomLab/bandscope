import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

const originalLanguage = navigator.language;
const originalMatchMedia = window.matchMedia;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

function setNavigatorLanguage(language: string): void {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("Workspace reduced-motion loop navigation", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView
    });
    vi.restoreAllMocks();
  });

  it("uses non-animated roadmap scrolling when reduced motion is requested", () => {
    setNavigatorLanguage("en-US");
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
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
        dispatchEvent: vi.fn()
      }))
    });

    render(<Workspace song={createDemoRehearsalSong()} />);
    fireEvent.click(screen.getByRole("button", { name: "Loop verse from 0:10 to 0:30" }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "nearest",
      inline: "center"
    });
  });
});
