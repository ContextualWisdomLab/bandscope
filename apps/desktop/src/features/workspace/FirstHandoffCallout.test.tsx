import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstHandoffCallout } from "./FirstHandoffCallout";

function songWithHandoff() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const handoff = structuredClone(verse);
  handoff.id = "handoff-1";
  handoff.label = "handoff";
  handoff.timeRange = { start: 22, end: 24 };
  handoff.roles = [
    {
      ...verse.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  handoff.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, handoff];
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

describe("FirstHandoffCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the first handoff as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstHandoffCallout song={songWithHandoff()} />);

    const action = screen.getByRole("button", {
      name: "Open Lead Vocal handoff at 0:22"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Catch Lead Vocal's pass at 0:22. Take the next part./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstHandoffCallout song={songWithHandoff()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal handoff at 0:22" }));

    expect(screen.getByText("Lead Vocal passes the handoff at 0:22.")).toBeTruthy();
    expect(screen.queryByText(/Catch Lead Vocal's pass at 0:22. Take the next part./)).toBeNull();
  });

  it("keeps workspace-scroll authoritative even when a playback callback is also supplied", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();
    const onHearHandoff = vi.fn();

    render(
      <FirstHandoffCallout song={songWithHandoff()} actionMode="workspace-scroll" onHearHandoff={onHearHandoff} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal handoff at 0:22" }));
    expect(onHearHandoff).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithHandoff();
    song.sections[1]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstHandoffCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal handoff at 0:22" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("shows fresh guidance when the first handoff changes or returns later", () => {
    const initialSong = songWithHandoff();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstHandoffCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal handoff at 0:22" }));
    expect(screen.getByText(/Catch Lead Vocal's pass at 0:22. Take the next part./)).toBeTruthy();

    const nextSong = songWithHandoff();
    nextSong.id = "next-song";
    nextSong.sections[1]!.timeRange = { start: 30, end: 32 };
    rerender(<FirstHandoffCallout song={nextSong} />);
    expect(screen.getByText("Lead Vocal passes the handoff at 0:30.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable handoff guidance-only", () => {
    render(<FirstHandoffCallout song={createDemoRehearsalSong()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No handoff yet. Stay on tonight's map until a pass is marked.")
    ).toBeTruthy();
  });

  it("names a band-wide pass when no part holds the handoff", () => {
    const song = songWithHandoff();
    song.sections[1]!.partGraph[0]!.is_active = false;
    render(<FirstHandoffCallout song={song} />);
    expect(screen.getByRole("button", { name: "Open the first handoff at 0:22" })).toBeTruthy();
    expect(screen.getByText("The band passes the handoff at 0:22.")).toBeTruthy();
  });

  it("renders Hear only in callback-only mode when a seek callback exists", () => {
    const onHearHandoff = vi.fn();
    render(<FirstHandoffCallout song={songWithHandoff()} actionMode="callback-only" onHearHandoff={onHearHandoff} />);
    fireEvent.click(screen.getByRole("button", { name: "Hear Lead Vocal pass at 0:22" }));
    expect(onHearHandoff).toHaveBeenCalledWith(22);
  });

  it("hides the Hear action in callback-only mode without a seek callback", () => {
    render(<FirstHandoffCallout song={songWithHandoff()} actionMode="callback-only" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Lead Vocal passes the handoff at 0:22.")).toBeTruthy();
  });

  it("localizes the handoff form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithHandoff();
    song.sections[1]!.roles[0]!.name = "리드 보컬";

    render(<FirstHandoffCallout song={song} />);

    expect(screen.getByText("0:22 핸드오프에서 리드 보컬 파트가 넘깁니다.")).toBeTruthy();
    expect(screen.queryByText(/handoff에서/)).toBeNull();
  });

  it("keeps dynamic Korean role names particle-safe without guessing Hangul morphology", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithHandoff();
    song.sections[1]!.roles[0]!.name = "피아노";

    render(<FirstHandoffCallout song={song} />);

    expect(screen.getByText("0:22 핸드오프에서 피아노 파트가 넘깁니다.")).toBeTruthy();
    expect(screen.queryByText("피아노이 0:22 핸드오프에서 넘깁니다.")).toBeNull();
  });
});
