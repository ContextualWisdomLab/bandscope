import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstChorusCallout } from "./FirstChorusCallout";

function songWithChorus() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: 30, end: 46 };
  chorus.roles = [
    {
      ...verse.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  chorus.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, chorus];
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

describe("FirstChorusCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the first chorus as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstChorusCallout song={songWithChorus()} />);

    const action = screen.getByRole("button", {
      name: "Open Lead Vocal chorus at 0:30"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Catch Lead Vocal's lift at 0:30. Sing the next line./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstChorusCallout song={songWithChorus()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal chorus at 0:30" }));

    expect(screen.getByText("Lead Vocal lifts the chorus at 0:30.")).toBeTruthy();
    expect(screen.queryByText(/Catch Lead Vocal's lift at 0:30. Sing the next line./)).toBeNull();
  });

  it("keeps workspace-scroll authoritative even when a playback callback is also supplied", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();
    const onHearChorus = vi.fn();

    render(
      <FirstChorusCallout song={songWithChorus()} actionMode="workspace-scroll" onHearChorus={onHearChorus} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal chorus at 0:30" }));
    expect(onHearChorus).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithChorus();
    song.sections[1]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstChorusCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal chorus at 0:30" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("shows fresh guidance when the first chorus changes or returns later", () => {
    const initialSong = songWithChorus();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstChorusCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal chorus at 0:30" }));
    expect(screen.getByText(/Catch Lead Vocal's lift at 0:30. Sing the next line./)).toBeTruthy();

    const nextSong = songWithChorus();
    nextSong.id = "next-song";
    nextSong.sections[1]!.timeRange = { start: 64, end: 80 };
    rerender(<FirstChorusCallout song={nextSong} />);
    expect(screen.getByText("Lead Vocal lifts the chorus at 1:04.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable chorus guidance-only", () => {
    render(<FirstChorusCallout song={createDemoRehearsalSong()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No chorus yet. Stay on tonight's map until the lift is labeled.")
    ).toBeTruthy();
  });

  it("names a band-wide lift when no part holds the chorus", () => {
    const song = songWithChorus();
    song.sections[1]!.partGraph[0]!.is_active = false;
    render(<FirstChorusCallout song={song} />);
    expect(screen.getByRole("button", { name: "Open the first chorus at 0:30" })).toBeTruthy();
    expect(screen.getByText("The band lifts the chorus at 0:30.")).toBeTruthy();
  });

  it("renders Hear only in callback-only mode when a seek callback exists", () => {
    const onHearChorus = vi.fn();
    render(<FirstChorusCallout song={songWithChorus()} actionMode="callback-only" onHearChorus={onHearChorus} />);
    fireEvent.click(screen.getByRole("button", { name: "Hear Lead Vocal lift at 0:30" }));
    expect(onHearChorus).toHaveBeenCalledWith(30);
  });

  it("hides the Hear action in callback-only mode without a seek callback", () => {
    render(<FirstChorusCallout song={songWithChorus()} actionMode="callback-only" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Lead Vocal lifts the chorus at 0:30.")).toBeTruthy();
  });

  it("localizes the chorus form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithChorus();
    song.sections[1]!.roles[0]!.name = "리드 보컬";

    render(<FirstChorusCallout song={song} />);

    expect(screen.getByText("0:30 후렴에서 리드 보컬 파트가 올립니다.")).toBeTruthy();
    expect(screen.queryByText(/chorus에서/)).toBeNull();
  });

  it("keeps dynamic Korean role names particle-safe without guessing Hangul morphology", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithChorus();
    song.sections[1]!.roles[0]!.name = "피아노";

    render(<FirstChorusCallout song={song} />);

    expect(screen.getByText("0:30 후렴에서 피아노 파트가 올립니다.")).toBeTruthy();
    expect(screen.queryByText("피아노이 0:30 후렴에서 올립니다.")).toBeNull();
  });
});
