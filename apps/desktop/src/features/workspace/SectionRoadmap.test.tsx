import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getAllByText("음역").length).toBeGreaterThan(0);
    expect(screen.getByText("C#2 — E3")).toBeTruthy();
    expect(screen.getAllByText("verse 들어가기 전에 이 음역을 악기로 확인해 보세요.").length).toBeGreaterThan(0);
    expect(screen.getByText("verse 들어가기 전에 이 길이를 세어 보세요.")).toBeTruthy();
  });

  it("names the next count-in on the section where the length changes", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      verse,
      {
        ...verse,
        id: "chorus-1",
        label: "chorus",
        timeRange: { start: 30, end: 62 },
        roles: verse.roles.map((role) => ({ ...role, id: `${role.id}-chorus` }))
      }
    ];

    render(<SectionRoadmap song={song} activeRole={null} />);

    expect(screen.queryByTestId("duration-next-action-verse-1")).toBeNull();
    expect(screen.getByTestId("duration-next-action-chorus-1")).toHaveTextContent(
      "Count this new length in before chorus."
    );
  });

  it("marks only the destination card when consecutive sections share a label", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, id: "verse-a", label: "verse", timeRange: { start: 0, end: 16 } },
      { ...verse, id: "verse-b", label: "verse", timeRange: { start: 16, end: 48 } }
    ];

    render(<SectionRoadmap song={song} activeRole={null} />);

    expect(screen.queryByTestId("duration-next-action-verse-a")).toBeNull();
    expect(screen.getByTestId("duration-next-action-verse-b")).toHaveTextContent(
      "Count this new length in before verse."
    );
  });

  it("omits the range row when both notes are unnamed", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      range: { lowestNote: " ", highestNote: "none" }
    };

    render(<SectionRoadmap song={song} activeRole="bass-guitar" />);

    expect(screen.queryByText("Range")).toBeNull();
    expect(screen.queryByText(/Check this span on your instrument/i)).toBeNull();
  });

  it("omits the range row when the span is inverted instead of presenting it as valid", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      range: { lowestNote: "E3", highestNote: "C#2" }
    };

    render(<SectionRoadmap song={song} activeRole="bass-guitar" />);

    expect(screen.queryByText("Range")).toBeNull();
    expect(screen.queryByText(/Check this span on your instrument/i)).toBeNull();
    expect(screen.queryByText(/E3 — C#2/)).toBeNull();
  });

  it("omits the range row when a note is not a scientific-pitch label", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      range: { lowestNote: "low-ish", highestNote: "E3" }
    };

    render(<SectionRoadmap song={song} activeRole="bass-guitar" />);

    expect(screen.queryByText("Range")).toBeNull();
    expect(screen.queryByText(/Check this span on your instrument/i)).toBeNull();
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
});
