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

describe("Workspace handoff export contract", () => {
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

  it("keeps the full-band handoff lead stable when the UI role changes", async () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const createObjectUrl = vi.fn(() => "blob:full-band-handoff");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));
    fireEvent.click(screen.getByRole("button", { name: "Download tonight's first-action handoff" }));

    const blob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    const payload = JSON.parse(await blob.text()) as {
      firstAction?: { roleId?: string; roleName?: string };
      sections?: Array<{ roleBuckets?: Array<{ name?: string }> }>;
    };

    expect(payload.firstAction?.roleId).toBe("bass-guitar");
    expect(payload.firstAction?.roleName).toBe("Bass Guitar");
    expect(payload.sections?.[0]?.roleBuckets?.map((role) => role.name)).toEqual(
      expect.arrayContaining(["Bass Guitar", "Lead Vocal"])
    );
  });
});
