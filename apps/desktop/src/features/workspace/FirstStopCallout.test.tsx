import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { FirstStopCallout } from "./FirstStopCallout";

function songWithStop() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const stop = structuredClone(verse);
  stop.id = "stop-1";
  stop.label = "stop";
  stop.timeRange = { start: 18, end: 19 };
  stop.roles = [
    {
      ...verse.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  stop.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, stop];
  return song;
}

function appendSongStructureTarget() {
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
  const first = document.createElement("div");
  const target = document.createElement("div");
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(first);
  grid.appendChild(target);
  document.body.appendChild(grid);
  return { grid, scrollIntoView };
}

describe("FirstStopCallout", () => {
  it("names the first stop as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstStopCallout song={songWithStop()} />);

    const action = screen.getByRole("button", {
      name: "Open Lead Vocal stop at 0:18"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Hold Lead Vocal's cut at 0:18. Do not play through it./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstStopCallout song={songWithStop()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal stop at 0:18" }));

    expect(screen.getByText("Lead Vocal cuts the stop at 0:18.")).toBeTruthy();
    expect(screen.queryByText(/Hold Lead Vocal's cut at 0:18. Do not play through it./)).toBeNull();
  });

  it("keeps workspace-scroll authoritative even when a playback callback is also supplied", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();
    const onHearStop = vi.fn();

    render(
      <FirstStopCallout song={songWithStop()} actionMode="workspace-scroll" onHearStop={onHearStop} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal stop at 0:18" }));
    expect(onHearStop).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithStop();
    song.sections[1]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstStopCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal stop at 0:18" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("shows fresh guidance when the first stop changes or returns later", () => {
    const initialSong = songWithStop();
    const { rerender } = render(<FirstStopCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal stop at 0:18" }));
    expect(screen.getByText(/Hold Lead Vocal's cut at 0:18. Do not play through it./)).toBeTruthy();

    const nextSong = songWithStop();
    nextSong.id = "next-song";
    nextSong.sections[1]!.timeRange = { start: 24, end: 25 };
    rerender(<FirstStopCallout song={nextSong} />);
    expect(screen.getByText("Lead Vocal cuts the stop at 0:24.")).toBeTruthy();
  });

  it("keeps an unavailable stop guidance-only", () => {
    render(<FirstStopCallout song={createDemoRehearsalSong()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No stop yet. Stay on tonight's map until a cut is marked.")
    ).toBeTruthy();
  });

  it("names a band-wide cut when no part holds the stop", () => {
    const song = songWithStop();
    song.sections[1]!.partGraph[0]!.is_active = false;
    render(<FirstStopCallout song={song} />);
    expect(screen.getByRole("button", { name: "Open the first stop at 0:18" })).toBeTruthy();
    expect(screen.getByText("The band cuts the stop at 0:18.")).toBeTruthy();
  });

  it("renders Hear only in callback-only mode when a seek callback exists", () => {
    const onHearStop = vi.fn();
    render(<FirstStopCallout song={songWithStop()} actionMode="callback-only" onHearStop={onHearStop} />);
    fireEvent.click(screen.getByRole("button", { name: "Hear Lead Vocal cut at 0:18" }));
    expect(onHearStop).toHaveBeenCalledWith(18);
  });

  it("hides the Hear action in callback-only mode without a seek callback", () => {
    render(<FirstStopCallout song={songWithStop()} actionMode="callback-only" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Lead Vocal cuts the stop at 0:18.")).toBeTruthy();
  });
});
