import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { FirstDropoutCallout } from "./FirstDropoutCallout";

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

describe("FirstDropoutCallout", () => {
  it("names the first dropout as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstDropoutCallout song={createDemoRehearsalSong()} />);

    const action = screen.getByRole("button", {
      name: "Open Bass Guitar dropout for Lead Vocal at 0:30"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Start the last bar of Bass Guitar before Lead Vocal takes the verse \(0:30\)/)).toBeTruthy();

    grid.remove();
  });

  it("keeps workspace-scroll authoritative even when a playback callback is also supplied", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();
    const onHearDropout = vi.fn();

    render(
      <FirstDropoutCallout
        song={createDemoRehearsalSong()}
        actionMode="workspace-scroll"
        onHearDropout={onHearDropout}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Bass Guitar dropout for Lead Vocal at 0:30"
      })
    );
    expect(onHearDropout).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstDropoutCallout song={song} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Bass Guitar dropout for Lead Vocal at 0:30"
      })
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("shows fresh guidance when the first dropout changes or returns later", () => {
    const initialSong = createDemoRehearsalSong();
    const { rerender } = render(<FirstDropoutCallout song={initialSong} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Bass Guitar dropout for Lead Vocal at 0:30"
      })
    );
    expect(screen.getByText(/Start the last bar of Bass Guitar before Lead Vocal takes the verse \(0:30\)/)).toBeTruthy();

    const replacementSong = createDemoRehearsalSong();
    replacementSong.id = "demo-song-replacement";
    replacementSong.sections[0]!.roles[0]!.name = "Upright Bass";
    rerender(<FirstDropoutCallout song={replacementSong} />);
    expect(screen.getByText("Upright Bass hands off to Lead Vocal at the end of the verse (0:30).")).toBeTruthy();

    rerender(<FirstDropoutCallout song={initialSong} />);
    expect(screen.getByText("Bass Guitar hands off to Lead Vocal at the end of the verse (0:30).")).toBeTruthy();
  });

  it("keeps placeholder-looking rehearsal data literal", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0]!.name = "{section}";

    render(<FirstDropoutCallout song={song} />);

    expect(
      screen.getByRole("button", {
        name: "Open {section} dropout for Lead Vocal at 0:30"
      })
    ).toBeTruthy();
  });

  it("tells the room to stay on the map when no dropout exists", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];
    render(<FirstDropoutCallout song={song} />);
    expect(
      screen.getByText("No dropout yet. Stay on tonight's map until a part hands off.")
    ).toBeTruthy();
  });
});
