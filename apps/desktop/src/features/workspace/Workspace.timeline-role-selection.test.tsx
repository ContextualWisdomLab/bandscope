import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

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
});
