import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstBridgeCallout } from "./FirstBridgeCallout";

function songWithBridge() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const bridge = structuredClone(verse);
  bridge.id = "bridge-1";
  bridge.label = "bridge";
  bridge.timeRange = { start: 30, end: 46 };
  bridge.roles = [
    {
      ...verse.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  bridge.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, bridge];
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

describe("FirstBridgeCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the first bridge as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstBridgeCallout song={songWithBridge()} />);

    const action = screen.getByRole("button", {
      name: "Open Lead Vocal bridge at 0:30"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Catch Lead Vocal's turn at 0:30. Play the next line./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstBridgeCallout song={songWithBridge()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal bridge at 0:30" }));

    expect(screen.getByText("Lead Vocal takes the bridge at 0:30.")).toBeTruthy();
    expect(screen.queryByText(/Catch Lead Vocal's turn at 0:30. Play the next line./)).toBeNull();
  });

  it("keeps workspace-scroll authoritative even when a playback callback is also supplied", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();
    const onHearBridge = vi.fn();

    render(
      <FirstBridgeCallout song={songWithBridge()} actionMode="workspace-scroll" onHearBridge={onHearBridge} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal bridge at 0:30" }));
    expect(onHearBridge).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithBridge();
    song.sections[1]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstBridgeCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal bridge at 0:30" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("shows fresh guidance when the first bridge changes or returns later", () => {
    const initialSong = songWithBridge();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstBridgeCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal bridge at 0:30" }));
    expect(screen.getByText(/Catch Lead Vocal's turn at 0:30. Play the next line./)).toBeTruthy();

    const nextSong = songWithBridge();
    nextSong.id = "next-song";
    nextSong.sections[1]!.timeRange = { start: 64, end: 80 };
    rerender(<FirstBridgeCallout song={nextSong} />);
    expect(screen.getByText("Lead Vocal takes the bridge at 1:04.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable bridge guidance-only", () => {
    render(<FirstBridgeCallout song={createDemoRehearsalSong()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No bridge yet. Stay on tonight's map until the turn is labeled.")
    ).toBeTruthy();
  });

  it("names a band-wide turn when no part holds the bridge", () => {
    const song = songWithBridge();
    song.sections[1]!.partGraph[0]!.is_active = false;
    render(<FirstBridgeCallout song={song} />);
    expect(screen.getByRole("button", { name: "Open the first bridge at 0:30" })).toBeTruthy();
    expect(screen.getByText("The band takes the bridge at 0:30.")).toBeTruthy();
  });

  it("renders Hear only in callback-only mode when a seek callback exists", () => {
    const onHearBridge = vi.fn();
    render(<FirstBridgeCallout song={songWithBridge()} actionMode="callback-only" onHearBridge={onHearBridge} />);
    fireEvent.click(screen.getByRole("button", { name: "Hear Lead Vocal turn at 0:30" }));
    expect(onHearBridge).toHaveBeenCalledWith(30);
  });

  it("hides the Hear action in callback-only mode without a seek callback", () => {
    render(<FirstBridgeCallout song={songWithBridge()} actionMode="callback-only" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Lead Vocal takes the bridge at 0:30.")).toBeTruthy();
  });

  it("localizes the bridge form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithBridge();
    song.sections[1]!.roles[0]!.name = "리드 보컬";

    render(<FirstBridgeCallout song={song} />);

    expect(screen.getByText("리드 보컬이 0:30 브리지에서 받습니다.")).toBeTruthy();
    expect(screen.queryByText(/bridge에서/)).toBeNull();
  });
});
