import { act, fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SectionRoadmap } from "./SectionRoadmap";

const originalLanguage = window.navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("SectionRoadmap", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("localizes roadmap controls and provenance badges", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    song.sections[0].roles[0].harmony.source = "user";

    render(<SectionRoadmap song={song} activeRole={null} />);

    expect(screen.getByText("더 많은 구간은 옆으로 스크롤하세요 →")).toBeTruthy();
    expect(screen.getAllByText("그루브").length).toBeGreaterThan(0);
    expect(screen.getAllByText("코드").length).toBeGreaterThan(0);
    expect(screen.getAllByText("큐").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("우선순위: high").length).toBeGreaterThan(0);
    expect(screen.getByText("사용자")).toBeTruthy();
  });

  it("uses localized copy for chord edit prompts and control labels", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("C#m9");

    render(<SectionRoadmap song={song} activeRole={null} onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Bass Guitar의 verse 코드 수정, 현재 C#m7" }));

    expect(promptSpy).toHaveBeenCalledWith("새 코드 입력:", "C#m7");
    expect(screen.getAllByTitle("코드 수정").length).toBeGreaterThan(0);
    expect(onSongUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not update when the trimmed chord is unchanged", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    vi.spyOn(window, "prompt").mockReturnValue(" C#m7 ");

    render(<SectionRoadmap song={song} activeRole={null} onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit chord for Bass Guitar in verse, current C#m7" }));

    expect(onSongUpdate).not.toHaveBeenCalled();
  });

  it("names tonight's count-in on the first section card", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();

    render(<SectionRoadmap song={song} activeRole={null} />);

    const countIn = screen.getByRole("button", {
      name: "Count in verse from 0:10 to 0:30 at tonight's tempo"
    });
    expect(countIn).toBeTruthy();
    expect((countIn as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Count in verse · 0:10–0:30")).toBeTruthy();
  });

  it("counts four beats at the analyzed tempo then names the first pass", () => {
    vi.useFakeTimers();
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();

    render(<SectionRoadmap song={song} activeRole={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Count in verse from 0:10 to 0:30 at tonight's tempo" })
    );

    expect(screen.getByLabelText("Count-in beat 1 of 4")).toBeTruthy();
    expect(screen.getByText("Counting in verse · 1")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByLabelText("Count-in beat 2 of 4")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByLabelText("Count-in beat 3 of 4")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByLabelText("Count-in beat 4 of 4")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Counted in verse · 0:10–0:30. Start the first pass.")).toBeTruthy();
  });

  it("fails closed when tonight's song has no tempo", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    delete song.tempo;

    render(<SectionRoadmap song={song} activeRole={null} />);

    const countIn = screen.getByRole("button", { name: "Add a tempo before counting in tonight." });
    expect((countIn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(countIn);
    expect(screen.queryByText(/Counting in/)).toBeNull();
  });

  it("counts in the looped section when the map already named one", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections.push({
      ...song.sections[0]!,
      id: "chorus-1",
      label: "chorus",
      timeRange: { start: 30, end: 50 }
    });

    render(<SectionRoadmap song={song} activeRole={null} loopedSectionId="chorus-1" />);

    expect(
      screen.getByRole("button", {
        name: "Count in chorus from 0:30 to 0:50 at tonight's tempo"
      })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Count in verse from 0:10 to 0:30 at tonight's tempo" })
    ).toBeNull();
  });

  it("localizes tonight's count-in action", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();

    render(<SectionRoadmap song={song} activeRole={null} />);

    expect(screen.getByRole("button", { name: "오늘 템포로 verse 0:10부터 0:30까지 카운트인" })).toBeTruthy();
    expect(screen.getByText("verse · 0:10–0:30 카운트인")).toBeTruthy();
  });
});
