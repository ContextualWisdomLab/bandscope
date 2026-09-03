import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

const originalMatchMedia = window.matchMedia;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: originalScrollIntoView,
  });
  vi.restoreAllMocks();
});

describe("Workspace timeline role selection", () => {
  it("clears the role filter before selecting a timeline section outside that role", async () => {
    const song = createDemoRehearsalSong();
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 64 };
    chorus.roles = chorus.roles.filter((role) => role.id !== "lead-vocal");
    song.sections.push(chorus);

    const { container } = render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));

    const roleFilteredSections = screen.getByRole("group", {
      name: "Playable sections for Lead Vocal",
    });
    expect(
      within(roleFilteredSections).queryByRole("button", { name: /chorus/i }),
    ).toBeNull();

    const chorusTimelineButton = container.querySelector<HTMLButtonElement>(
      '[data-song-structure-section-index="1"]',
    );
    expect(chorusTimelineButton).not.toBeNull();
    fireEvent.click(chorusTimelineButton!);

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "All Roles", selected: true }),
      ).toBeTruthy();
      const allSections = screen.getByRole("group", { name: "Playable sections" });
      expect(
        within(allSections).getByRole("button", { name: /chorus/i }),
      ).toBeTruthy();
    });
  });

  it("focuses an explicitly reselected first occurrence with reduced-motion scrolling", async () => {
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

    const { container } = render(<Workspace song={createDemoRehearsalSong()} />);
    const firstTimelineButton = container.querySelector<HTMLButtonElement>(
      '[data-song-structure-section-index="0"]',
    );
    expect(firstTimelineButton).not.toBeNull();
    fireEvent.click(firstTimelineButton!);

    await waitFor(() => {
      expect(document.activeElement?.id).toBe("workspace-section-card-0");
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "auto",
        block: "nearest",
        inline: "center",
      });
    });
  });

  it("focuses the clicked renderer occurrence when analysis section ids collide", async () => {
    const song = createDemoRehearsalSong();
    const duplicate = structuredClone(song.sections[0]!);
    duplicate.timeRange = { start: 40, end: 64 };
    song.sections.push(duplicate);
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    const { container } = render(<Workspace song={song} />);
    const secondTimelineButton = container.querySelector<HTMLButtonElement>(
      '[data-song-structure-section-index="1"]',
    );
    expect(secondTimelineButton).not.toBeNull();
    fireEvent.click(secondTimelineButton!);

    await waitFor(() => {
      expect(document.activeElement?.id).toBe("workspace-section-card-1");
      expect(scrollIntoView).toHaveBeenCalled();
    });
  });
});
