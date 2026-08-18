import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstEntranceCallout } from "./FirstEntranceCallout";

describe("FirstEntranceCallout", () => {
  it("names the first hearable entrance and arms that action", () => {
    render(<FirstEntranceCallout song={createDemoRehearsalSong()} />);

    const action = screen.getByRole("button", { name: "Hear Bass Guitar enter the verse at 0:10" });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(screen.getByText(/Start on Bass Guitar in the verse at 0:10/)).toBeTruthy();
  });

  it("keeps placeholder-looking rehearsal data literal", () => {
    const song = createDemoRehearsalSong();
    const bassRole = song.sections[0]!.roles.find((role) => role.id === "bass-guitar");
    if (!bassRole) {
      throw new Error("Demo rehearsal song must include the bass-guitar role.");
    }
    bassRole.name = "{section}";

    render(<FirstEntranceCallout song={song} />);

    expect(screen.getByRole("button", { name: "Hear {section} enter the verse at 0:10" })).toBeTruthy();
  });

  it("tells the room to stay on the map when no entrance exists", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];
    render(<FirstEntranceCallout song={song} />);
    expect(screen.getByText("No first entrance yet. Stay on tonight's map until a section has a part.")).toBeTruthy();
  });
});
