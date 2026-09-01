import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";
import { createPartHandoffTransitionSong } from "./firstPartHandoff.test-fixture";

describe("Workspace first part handoff selected-role integration", () => {
  it("keeps unrelated roles guidance-only while preserving giver and receiver handoffs", () => {
    const song = createPartHandoffTransitionSong();
    const demoSong = createDemoRehearsalSong();
    const keysRole = demoSong.sections
      .flatMap((section) => section.roles)
      .find((role) => role.id === "keys-right");

    if (!keysRole) {
      throw new Error("Demo fixture must contain the unrelated keys-right role");
    }

    song.sections[0] = {
      ...song.sections[0]!,
      roles: [...song.sections[0]!.roles, structuredClone(keysRole)]
    };

    render(<Workspace song={song} />);

    expect(
      screen.getByText("Bass Guitar still hands off to Lead Vocal in the chorus at 0:10.")
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Keyboard 1 Right Hand" }));

    expect(
      screen.getByText(
        "Nothing still has a part handoff. Stay on tonight's map until a part owns a rehearsal-facing pass."
      )
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Open Bass Guitar handoff at 0:10" })
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    expect(
      screen.getByText("Bass Guitar still hands off to Lead Vocal in the chorus at 0:10.")
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));
    expect(
      screen.getByText("Bass Guitar still hands off to Lead Vocal in the chorus at 0:10.")
    ).toBeTruthy();
  });

  it("does not let a selected role from the previous song hide a new song handoff", () => {
    const previousSong = createDemoRehearsalSong();
    const { rerender } = render(<Workspace song={previousSong} />);

    fireEvent.click(screen.getByRole("tab", { name: "Keyboard 1 Right Hand" }));

    const nextSong = createPartHandoffTransitionSong();
    rerender(<Workspace song={nextSong} />);

    expect(
      screen.getByText("Bass Guitar still hands off to Lead Vocal in the chorus at 0:10.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" })).toBeTruthy();
  });
});
