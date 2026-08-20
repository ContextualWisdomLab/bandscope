import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPreChorusCallout } from "./FirstPreChorusCallout";

function songWithPreChorus() {
  const song = createDemoRehearsalSong();
  const seed = song.sections[0]!;
  const preChorus = structuredClone(seed);
  preChorus.id = "pre-chorus-1";
  preChorus.label = "pre-chorus";
  preChorus.timeRange = { start: 20, end: 28 };
  preChorus.roles = [
    {
      ...seed.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  preChorus.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [preChorus];
  return song;
}

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

describe("FirstPreChorusCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the first pre-chorus as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstPreChorusCallout song={songWithPreChorus()} />);

    const action = screen.getByRole("button", {
      name: "Open Lead Vocal pre-chorus at 0:20"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Learn Lead Vocal's pre-chorus at 0:20. Play the lift into the chorus./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstPreChorusCallout song={songWithPreChorus()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal pre-chorus at 0:20" }));

    expect(screen.getByText("Lead Vocal carries the pre-chorus at 0:20.")).toBeTruthy();
    expect(
      screen.queryByText(/Learn Lead Vocal's pre-chorus at 0:20. Play the lift into the chorus./)
    ).toBeNull();
  });

  it("keeps workspace-scroll authoritative even when a playback callback is also supplied", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();
    const onHearPreChorus = vi.fn();

    render(
      <FirstPreChorusCallout
        song={songWithPreChorus()}
        actionMode="workspace-scroll"
        onHearPreChorus={onHearPreChorus}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal pre-chorus at 0:20" }));
    expect(onHearPreChorus).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithPreChorus();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstPreChorusCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal pre-chorus at 0:20" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("shows fresh guidance when the first pre-chorus changes or returns later", () => {
    const initialSong = songWithPreChorus();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstPreChorusCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal pre-chorus at 0:20" }));
    expect(
      screen.getByText(/Learn Lead Vocal's pre-chorus at 0:20. Play the lift into the chorus./)
    ).toBeTruthy();

    const nextSong = songWithPreChorus();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 48, end: 56 };
    rerender(<FirstPreChorusCallout song={nextSong} />);
    expect(screen.getByText("Lead Vocal carries the pre-chorus at 0:48.")).toBeTruthy();

    grid.remove();
  });

  it("does not carry completed guidance into a replacement song with an invalid runtime id", () => {
    const firstSong = songWithPreChorus();
    const replacementSong = songWithPreChorus();
    (firstSong as unknown as { id: unknown }).id = null;
    (replacementSong as unknown as { id: unknown }).id = null;
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstPreChorusCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal pre-chorus at 0:20" }));
    expect(
      screen.getByText(/Learn Lead Vocal's pre-chorus at 0:20. Play the lift into the chorus./)
    ).toBeTruthy();

    rerender(<FirstPreChorusCallout song={replacementSong} />);

    expect(screen.getByText("Lead Vocal carries the pre-chorus at 0:20.")).toBeTruthy();
    expect(
      screen.queryByText(/Learn Lead Vocal's pre-chorus at 0:20. Play the lift into the chorus./)
    ).toBeNull();

    grid.remove();
  });

  it("keeps an unavailable pre-chorus guidance-only", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.label = "chorus";
    render(<FirstPreChorusCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No pre-chorus yet. Stay on tonight's map until the first lift is labeled.")
    ).toBeTruthy();
  });

  it("names a band-wide lift when no part holds the pre-chorus", () => {
    const song = songWithPreChorus();
    song.sections[0]!.partGraph[0]!.is_active = false;
    render(<FirstPreChorusCallout song={song} />);
    expect(screen.getByRole("button", { name: "Open the first pre-chorus at 0:20" })).toBeTruthy();
    expect(screen.getByText("The band carries the pre-chorus at 0:20.")).toBeTruthy();
  });

  it("renders Hear only in callback-only mode when a seek callback exists", () => {
    const onHearPreChorus = vi.fn();
    render(
      <FirstPreChorusCallout
        song={songWithPreChorus()}
        actionMode="callback-only"
        onHearPreChorus={onHearPreChorus}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Hear Lead Vocal pre-chorus at 0:20" }));
    expect(onHearPreChorus).toHaveBeenCalledWith(20);
  });

  it("hides the Hear action in callback-only mode without a seek callback", () => {
    render(<FirstPreChorusCallout song={songWithPreChorus()} actionMode="callback-only" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Lead Vocal carries the pre-chorus at 0:20.")).toBeTruthy();
  });

  it("localizes the pre-chorus form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithPreChorus();
    song.sections[0]!.roles[0]!.name = "리드 보컬";

    render(<FirstPreChorusCallout song={song} />);

    expect(screen.getByText("리드 보컬이 0:20 프리코러스에서 리프트를 잡습니다.")).toBeTruthy();
    expect(screen.queryByText(/pre-chorus에서/)).toBeNull();
  });
});
