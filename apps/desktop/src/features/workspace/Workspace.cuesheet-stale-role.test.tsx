import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

const originalLanguage = navigator.language;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("Workspace cue-sheet role filter lifecycle", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl
    });
  });

  it("exports the new song's first action when the previous role filter no longer exists", async () => {
    setNavigatorLanguage("en-US");
    const firstSong = createDemoRehearsalSong();
    const nextSong = createDemoRehearsalSong();
    nextSong.id = "next-project";
    nextSong.title = "Next Project";
    nextSong.sections = nextSong.sections.map((section) => ({
      ...section,
      roles: section.roles.filter((role) => role.id !== "lead-vocal"),
      partGraph: section.partGraph.filter((node) => node.role_id !== "lead-vocal")
    }));

    const createObjectUrl = vi.fn(() => "blob:next-cuesheet");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });

    const { rerender } = render(<Workspace song={firstSong} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));

    rerender(<Workspace song={nextSong} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Download tonight's first-action sheet" })
    );

    const blob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    const lines = (await blob.text()).split("\n");
    expect(lines[0]).toBe("Section,Groove,Role,Harmony,Cue,Priority,Notes");
    expect(lines[1]).toMatch(/^Tonight first,/);
    expect(lines[1]).toContain(",Bass Guitar,");
  });
});
