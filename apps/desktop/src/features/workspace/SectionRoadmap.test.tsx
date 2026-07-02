import { fireEvent, render, screen, within } from "@testing-library/react";
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

function getChordEditButton(roleName = "Bass Guitar", sectionLabel = "verse", chord = "C#m7") {
  return screen.getByRole("button", {
    name: new RegExp(`${roleName}.*${sectionLabel}.*${chord}`)
  });
}

function roleCard(roleName: string) {
  const card = screen.getByText(roleName).closest(".border-l-4");
  if (!card) throw new Error(`Role card not found for ${roleName}`);
  return card as HTMLElement;
}

describe("SectionRoadmap", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("localizes roadmap controls and provenance badges", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    song.sections[0].roles[0].harmony.source = "user";

    render(<SectionRoadmap song={song} activeRole={null} />);

    expect(screen.getByText("더 많은 구간은 옆으로 스크롤하세요 →")).toBeInTheDocument();
    expect(screen.getAllByText("그루브").length).toBeGreaterThan(0);
    expect(screen.getAllByText("코드").length).toBeGreaterThan(0);
    expect(screen.getAllByText("큐").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("우선순위: high").length).toBeGreaterThan(0);
    expect(screen.getByText("사용자")).toBeInTheDocument();
  });

  it("uses localized copy for chord edit prompts and control labels", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("C#m9");

    render(<SectionRoadmap song={song} activeRole={null} onSongUpdate={onSongUpdate} />);

    fireEvent.click(getChordEditButton());

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

    fireEvent.click(getChordEditButton());

    expect(onSongUpdate).not.toHaveBeenCalled();
  });

  it("cancels chord editing without updating the song", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);

    render(<SectionRoadmap song={song} activeRole={null} onSongUpdate={onSongUpdate} />);

    fireEvent.click(getChordEditButton());

    expect(promptSpy).toHaveBeenCalledWith("새 코드 입력:", "C#m7");
    expect(onSongUpdate).not.toHaveBeenCalled();
  });

  it("disables chord editing when no update handler is provided", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();

    render(<SectionRoadmap song={song} activeRole={null} />);

    expect(getChordEditButton()).toBeDisabled();
  });

  it("renders priority indicators for high, medium, and low roles", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();

    song.sections[0].roles.push({
      ...song.sections[0].roles[0],
      id: "medium-priority-role",
      name: "Medium Role",
      rehearsalPriority: "medium"
    });
    song.sections[0].roles.push({
      ...song.sections[0].roles[0],
      id: "low-priority-role",
      name: "Low Role",
      rehearsalPriority: "low"
    });

    render(<SectionRoadmap song={song} activeRole={null} />);

    expect(within(roleCard("Bass Guitar")).getByTitle("우선순위: high")).toBeInTheDocument();
    expect(within(roleCard("Medium Role")).getByTitle("우선순위: medium")).toBeInTheDocument();
    expect(within(roleCard("Low Role")).getByTitle("우선순위: low")).toBeInTheDocument();
  });

  it("renders low confidence badges for low-confidence sections and roles", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    song.sections[0].confidence.level = "low";
    song.sections[0].roles[0].confidence.level = "low";

    render(<SectionRoadmap song={song} activeRole={null} />);

    expect(screen.getAllByText("확신이 낮음").length).toBeGreaterThan(0);
  });

  it("filters the roadmap to the active role", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();

    render(<SectionRoadmap song={song} activeRole="bass-guitar" />);

    expect(screen.getByText("Bass Guitar")).toBeInTheDocument();
    expect(screen.queryByText("Keyboard 1 Right Hand")).toBeNull();
  });

  it("does not update when the entered chord is empty or whitespace", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    const promptSpy = vi.spyOn(window, "prompt");

    promptSpy.mockReturnValueOnce("").mockReturnValueOnce("   ");
    render(<SectionRoadmap song={song} activeRole={null} onSongUpdate={onSongUpdate} />);

    const editButton = getChordEditButton();
    fireEvent.click(editButton);
    fireEvent.click(editButton);

    expect(promptSpy).toHaveBeenCalledTimes(2);
    expect(onSongUpdate).not.toHaveBeenCalled();
  });

  it("renders overlap warnings", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();

    render(<SectionRoadmap song={song} activeRole={null} />);

    expect(screen.getByText(/Density warning/i)).toBeInTheDocument();
  });
});
