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

  it("names the stop next action only on the destination card", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, id: "verse-1", label: "verse" },
      {
        ...verse,
        id: "stop-1",
        label: "stop",
        roles: verse.roles.map((role) => ({ ...role, id: `${role.id}-stop` }))
      },
      {
        ...verse,
        id: "chorus-1",
        label: "chorus",
        roles: verse.roles.map((role) => ({ ...role, id: `${role.id}-chorus` }))
      }
    ];

    render(<SectionRoadmap song={song} activeRole={null} />);

    expect(screen.getByTestId("first-stop-action-stop-1")).toHaveTextContent(
      "Cut together here, then come back in on chorus."
    );
    expect(screen.queryByTestId("first-stop-action-verse-1")).toBeNull();
    expect(screen.queryByTestId("first-stop-action-chorus-1")).toBeNull();
  });

  it("omits the stop next action when no stop is named", () => {
    setNavigatorLanguage("en-US");
    render(<SectionRoadmap song={createDemoRehearsalSong()} activeRole={null} />);

    expect(screen.queryByText(/Cut together here/i)).toBeNull();
  });
});
