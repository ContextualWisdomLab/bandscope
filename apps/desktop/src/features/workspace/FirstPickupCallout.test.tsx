import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { FirstPickupCallout } from "./FirstPickupCallout";

function appendSongStructureTarget() {
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
  const target = document.createElement("div");
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(target);
  document.body.appendChild(grid);
  return { grid, scrollIntoView };
}

describe("FirstPickupCallout", () => {
  it("names the first pickup as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstPickupCallout song={createDemoRehearsalSong()} />);

    const action = screen.getByRole("button", {
      name: "Open Lead Vocal pickup from Bass Guitar at 0:30"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Start Lead Vocal's pickup from Bass Guitar before the next downbeat \(0:30\)/)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps workspace-scroll authoritative even when a playback callback is also supplied", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();
    const onHearPickup = vi.fn();

    render(
      <FirstPickupCallout
        song={createDemoRehearsalSong()}
        actionMode="workspace-scroll"
        onHearPickup={onHearPickup}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Lead Vocal pickup from Bass Guitar at 0:30"
      })
    );
    expect(onHearPickup).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstPickupCallout song={song} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Lead Vocal pickup from Bass Guitar at 0:30"
      })
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("shows fresh guidance when the first pickup changes or returns later", () => {
    const initialSong = createDemoRehearsalSong();
    const { rerender } = render(<FirstPickupCallout song={initialSong} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Lead Vocal pickup from Bass Guitar at 0:30"
      })
    );
    expect(
      screen.getByText(/Start Lead Vocal's pickup from Bass Guitar before the next downbeat \(0:30\)/)
    ).toBeTruthy();

    const replacementSong = createDemoRehearsalSong();
    replacementSong.id = "demo-song-replacement";
    replacementSong.sections[0]!.roles[2]!.name = "Lead Harmony";
    rerender(<FirstPickupCallout song={replacementSong} />);
    expect(screen.getByText("Lead Harmony picks up from Bass Guitar at the end of the verse (0:30).")).toBeTruthy();

    rerender(<FirstPickupCallout song={initialSong} />);
    expect(screen.getByText("Lead Vocal picks up from Bass Guitar at the end of the verse (0:30).")).toBeTruthy();
  });

  it("keeps placeholder-looking rehearsal data literal", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[2]!.name = "{section}";

    render(<FirstPickupCallout song={song} />);

    expect(
      screen.getByRole("button", {
        name: "Open {section} pickup from Bass Guitar at 0:30"
      })
    ).toBeTruthy();
  });

  it("tells the room to stay on the map when no pickup exists", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];
    render(<FirstPickupCallout song={song} />);
    expect(
      screen.getByText("No pickup yet. Stay on tonight's map until a part is ready to catch the handoff.")
    ).toBeTruthy();
  });

  it("names a labeled pickup section without inventing a partner", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      {
        ...verse,
        id: "pickup-1",
        label: "pickup",
        timeRange: { start: 8, end: 10 },
        roles: [
          {
            ...verse.roles[2]!,
            id: "lead-vocal-pickup",
            name: "Lead Vocal"
          }
        ],
        partGraph: [
          {
            role_id: "lead-vocal-pickup",
            is_active: true,
            handoff_to: [],
            handoff_from: []
          }
        ]
      }
    ];

    render(<FirstPickupCallout song={song} />);
    expect(screen.getByText("Lead Vocal picks up the pickup at 0:08.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Lead Vocal pickup at 0:08" })).toBeTruthy();
  });
});
