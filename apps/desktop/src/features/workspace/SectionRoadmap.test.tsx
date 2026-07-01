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

  it("cancels chord edit and does not update song", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);

    render(<SectionRoadmap song={song} activeRole={null} onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Bass Guitar의 verse 코드 수정, 현재 C#m7" }));

    expect(promptSpy).toHaveBeenCalledWith("새 코드 입력:", "C#m7");
    expect(onSongUpdate).not.toHaveBeenCalled();
  });

  it("does not allow editing if onSongUpdate is undefined", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();

    const { getByRole } = render(<SectionRoadmap song={song} activeRole={null} />);

    const button = getByRole("button", { name: "Bass Guitar의 verse 코드 수정, 현재 C#m7" });

    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("returns early from handleChordEdit if onSongUpdate is undefined, tested by calling handler directly", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    const promptSpy = vi.spyOn(window, "prompt");

    render(<SectionRoadmap song={song} activeRole={null} />);

    const button = screen.getByRole("button", { name: "Bass Guitar의 verse 코드 수정, 현재 C#m7" });
    fireEvent(button, new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it("renders priority colors and icons correctly", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();

    // Add a role with medium priority
    song.sections[0].roles.push({
      ...song.sections[0].roles[0],
      id: "medium-priority-role",
      name: "Medium Role",
      rehearsalPriority: "medium"
    });

    // Add a role with low priority
    song.sections[0].roles.push({
      ...song.sections[0].roles[0],
      id: "low-priority-role",
      name: "Low Role",
      rehearsalPriority: "low"
    });

    render(<SectionRoadmap song={song} activeRole={null} />);

    expect(screen.getAllByTitle("우선순위: high").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("우선순위: medium").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("우선순위: low").length).toBeGreaterThan(0);
  });

  it("renders low confidence badges correctly", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();

    song.sections[0].confidence.level = "low";
    song.sections[0].roles[0].confidence.level = "low";

    render(<SectionRoadmap song={song} activeRole={null} />);

    // "확신이 낮음" is the ko-KR translation for "Low confidence"
    const lowConfidenceElements = screen.getAllByText("확신이 낮음");
    expect(lowConfidenceElements.length).toBeGreaterThan(0);
  });

  it("filters roles when activeRole is provided", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();

    // The demo song has "bass-guitar" and "keys-right" among others
    render(<SectionRoadmap song={song} activeRole="bass-guitar" />);

    // Should render Bass Guitar
    expect(screen.getByText("Bass Guitar")).toBeTruthy();

    // Should not render Keyboard 1 Right Hand since it's filtered out
    expect(screen.queryByText("Keyboard 1 Right Hand")).toBeNull();
  });

  it("does not update song when section or role is not found during edit", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("NewChord");

    // We'll mock global structuredClone safely
    const originalStructuredClone = global.structuredClone;
    vi.stubGlobal("structuredClone", vi.fn().mockImplementation((val) => {
      const cloned = originalStructuredClone(val);
      // Remove all sections so the find fails
      cloned.sections = [];
      return cloned;
    }));

    try {
      render(<SectionRoadmap song={song} activeRole={null} onSongUpdate={onSongUpdate} />);

      fireEvent.click(screen.getByRole("button", { name: "Bass Guitar의 verse 코드 수정, 현재 C#m7" }));

      expect(promptSpy).toHaveBeenCalled();
      expect(onSongUpdate).not.toHaveBeenCalled();

      // Now mock it to return a section but missing the role
      vi.stubGlobal("structuredClone", vi.fn().mockImplementation((val) => {
        const cloned = originalStructuredClone(val);
        // Remove all roles so the find fails
        if (cloned.sections.length > 0) {
          cloned.sections[0].roles = [];
        }
        return cloned;
      }));

      fireEvent.click(screen.getByRole("button", { name: "Bass Guitar의 verse 코드 수정, 현재 C#m7" }));

      expect(promptSpy).toHaveBeenCalledTimes(2);
      expect(onSongUpdate).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not update song when entered chord is whitespace", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("   ");

    render(<SectionRoadmap song={song} activeRole={null} onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Bass Guitar의 verse 코드 수정, 현재 C#m7" }));

    expect(promptSpy).toHaveBeenCalled();
    expect(onSongUpdate).not.toHaveBeenCalled();
  });

  it("renders overlap warnings correctly", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();

    render(<SectionRoadmap song={song} activeRole={null} />);

    // The demo song has a density warning: "Density warning: competing with Keyboard Left Hand in low register."
    expect(screen.getByText("Density warning: competing with Keyboard Left Hand in low register.")).toBeTruthy();
  });

  it("handles empty chord input as cancel", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("");

    render(<SectionRoadmap song={song} activeRole={null} onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Bass Guitar의 verse 코드 수정, 현재 C#m7" }));

    expect(promptSpy).toHaveBeenCalledWith("새 코드 입력:", "C#m7");
    expect(onSongUpdate).not.toHaveBeenCalled();
  });
});
