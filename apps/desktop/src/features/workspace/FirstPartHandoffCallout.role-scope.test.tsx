import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FirstPartHandoffCallout } from "./FirstPartHandoffCallout";
import { createPartHandoffTransitionSong } from "./firstPartHandoff.test-fixture";

describe("FirstPartHandoffCallout selected role scope", () => {
  it("keeps the handoff when the selected role receives the pass", () => {
    render(
      <FirstPartHandoffCallout
        song={createPartHandoffTransitionSong()}
        activeRole="lead-vocal"
      />
    );

    expect(screen.getByText("Bass Guitar still hands off to Lead Vocal in the chorus at 0:10.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Bass Guitar handoff at 0:10" })).toBeTruthy();
  });

  it("keeps an unrelated selected role guidance-only", () => {
    render(
      <FirstPartHandoffCallout
        song={createPartHandoffTransitionSong()}
        activeRole="keys-right"
      />
    );

    expect(
      screen.getByText(
        "Nothing still has a part handoff. Stay on tonight's map until a part owns a rehearsal-facing pass."
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
