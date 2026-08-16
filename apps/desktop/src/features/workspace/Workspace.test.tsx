import { fireEvent, render, screen, within } from "@testing-library/react";
import { createDemoRehearsalSong, type ProjectBootstrapSummary, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";
import { EmptyState, LoadingState } from "./WorkspaceStates";
import { generateMetadataHandoffJson } from "../../lib/export";

const originalLanguage = navigator.language;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("Workspace", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl
    });
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("updates practice progress immutably through onSongUpdate", () => {
    const song = createDemoRehearsalSong();
    // Default mock setup puts "bass-guitar" as the role ID in index 0
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      practiceProgress: 50
    };
    const onSongUpdate = vi.fn();

    render(<Workspace song={song} onSongUpdate={onSongUpdate} />);

    // Select the Bass Guitar role to render PracticeProgress
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const increaseBtn = screen.getByRole("button", { name: "Increase progress" });
    fireEvent.click(increaseBtn);

    expect(onSongUpdate).toHaveBeenCalledTimes(1);
    const updatedSong = onSongUpdate.mock.calls[0]?.[0] as RehearsalSong;

    // Ensure immutable update logic: reference equality of untouched sections
    expect(updatedSong).not.toBe(song);
    expect(updatedSong.sections).not.toBe(song.sections);

    // Ensure the specific role progress updated
    expect(updatedSong.sections[0]!.roles[0]!.practiceProgress).toBe(60);
  });

  it("keeps the song-structure grid valid when a project has no sections", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];

    render(<Workspace song={song} />);

    const grid = screen.getByTestId("song-structure-grid");

    expect(grid.style.gridTemplateColumns).not.toContain("repeat(0");
    expect(grid.style.gridTemplateColumns).toContain("repeat(1");
  });

  it("falls back to safe timeline text for malformed section times", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0].timeRange = {
      start: Number.NaN,
      end: Number.POSITIVE_INFINITY
    };

    render(<Workspace song={song} />);

    expect(screen.getByText(/verse · 0:00–0:00/i)).toBeTruthy();
  });

  it("enables bass transcription from selected role metadata rather than role id text", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      id: "low-end",
      name: "Bass Guitar"
    };

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const transcribeButton = screen.getByRole("button", { name: "Transcribe Bass" }) as HTMLButtonElement;
    expect(transcribeButton.disabled).toBe(false);
    expect(transcribeButton.title).toBe("Transcribe part");
  });

  it("renders bass transcription in the dark rehearsal cockpit system", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      name: "Bass Guitar",
      transcription: [
        { pitch: "E2", onset: 0, offset: 0.75, velocity: 0.74 },
        { pitch: "G2", onset: 0.9, offset: 1.25, velocity: 0.68 }
      ]
    };

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const grooveMap = screen.getByRole("region", { name: /bass transcription groove map/i });
    expect(grooveMap.className).toContain("bg-slate-950");
    expect(screen.getByText("E2")).toBeTruthy();
    expect(screen.getByText("G2")).toBeTruthy();
    expect(screen.getByText(/2 notes mapped for rehearsal/i)).toBeTruthy();
  });

  it("renders collaboration summaries and role-specific rehearsal planning details", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();

    render(<Workspace song={song} />);

    expect(screen.getByText("Collaboration")).toBeTruthy();
    expect(screen.getByText(/2 Assignments/i)).toBeTruthy();
    expect(screen.getByText(/Keep assignments local for now/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    expect(screen.getByText(/The bass holds the vi center/i)).toBeTruthy();
    expect(screen.getByText(/whole step lower/i)).toBeTruthy();
    expect(screen.getByText(/Lock the bass entrance against the pickup/i)).toBeTruthy();
    expect(screen.getByText(/Verse harmony pass/i)).toBeTruthy();
  });

  it("falls back from blank planning copy and tolerates partial collaboration payloads", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      harmonicExplanation: "   ",
      transpositionPlan: ""
    };
    song.collaboration = {
      syncMode: "local_only",
      syncNote: "Local-only draft"
    } as RehearsalSong["collaboration"];

    render(<Workspace song={song} />);

    expect(screen.getByText(/0 Assignments/i)).toBeTruthy();
    expect(screen.getByText(/0 Comments/i)).toBeTruthy();
    expect(screen.getByText(/0 Approvals/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    expect(screen.getByText("vi pedal anchor")).toBeTruthy();
    expect(screen.getAllByText("Stay on roots if the chorus entrance gets muddy.").length).toBeGreaterThan(0);
  });

  it("exports a metadata-only handoff artifact from the workspace", async () => {
    const song = createDemoRehearsalSong();
    const sourceBootstrap: ProjectBootstrapSummary = {
      projectId: "project-1",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/project-1",
      cacheRoot: "/tmp/bandscope/cache/project-1",
      tempRoot: "/tmp/bandscope/temp/project-1",
      source: {
        sourcePath: "/Users/test/Music/late-night-set.wav",
        fileName: "late-night-set.wav",
        extension: "wav",
        fileSizeBytes: 1_024_000
      }
    };
    const createObjectUrl = vi.fn(() => "blob:handoff");
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl
    });

    render(<Workspace song={song} sourceBootstrap={sourceBootstrap} />);
    fireEvent.click(screen.getByRole("button", { name: /export handoff/i }));

    const blob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    const payload = JSON.parse(await blob.text());
    expect(payload.artifactKind).toBe("bandscope.metadata-handoff");
    expect(payload.sourceAssets[0].fileName).toBe("late-night-set.wav");
    expect(JSON.stringify(payload)).not.toContain("/Users/test");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:handoff");
  });

  it("exports metadata-only handoff when source bootstrap is invalid", async () => {
    const song = createDemoRehearsalSong();
    const invalidSourceBootstrap = {
      projectId: "project-1"
    } as ProjectBootstrapSummary;
    const createObjectUrl = vi.fn(() => "blob:handoff");
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl
    });

    render(<Workspace song={song} sourceBootstrap={invalidSourceBootstrap} />);
    fireEvent.click(screen.getByRole("button", { name: /export handoff/i }));

    const blob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    const payload = JSON.parse(await blob.text());
    expect(payload.artifactKind).toBe("bandscope.metadata-handoff");
    expect(payload.sourceAssets).toEqual([]);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:handoff");
  });

  it("validates source bootstrap before generating metadata handoff", () => {
    const song = createDemoRehearsalSong();
    const invalidSourceBootstrap = {
      projectId: "project-1"
    } as ProjectBootstrapSummary;

    expect(() => {
      generateMetadataHandoffJson(song, { sourceBootstrap: invalidSourceBootstrap });
    }).toThrow("sourceMode");
  });

  it("localizes empty and loading state titles", () => {
    setNavigatorLanguage("ko-KR");
    render(<EmptyState />);
    render(<LoadingState />);

    expect(screen.getByRole("heading", { name: "분석 준비 완료" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오디오 분석 중" })).toBeTruthy();
  });

  it("localizes workspace navigation and rehearsal labels", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    song.exportSummary = {
      ...song.exportSummary,
      headline: ""
    };

    render(<Workspace song={song} />);

    expect(screen.getByText("오늘의 합주 지도")).toBeTruthy();
    expect(screen.getByText("합주 작업 공간")).toBeTruthy();
    expect(screen.getByText("곡 타임라인")).toBeTruthy();
    expect(screen.getByText("협업")).toBeTruthy();
    expect(screen.getByText("스템")).toBeTruthy();
    expect(screen.getByText("합주 우선순위")).toBeTruthy();
    expect(screen.getByText("먼저 맞춰 볼 것")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로드맵에서 verse의 Bass Guitar 보기" })).toBeTruthy();
    expect(screen.getByText("역할과 화성")).toBeTruthy();
  });

  it("names high-priority role and section pairs to lock in first", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    expect(priorities.textContent).toContain("Lock in first");
    expect(priorities.textContent).toContain("Bass Guitar · verse");
    expect(priorities.textContent).toContain("Keyboard 1 Right Hand · verse");
    expect(priorities.textContent).not.toContain("Lead Vocal · verse");
    expect(priorities.textContent).not.toContain("Focus:");
  });

  it("falls back to medium-priority parts when no high-priority role exists", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    for (const section of song.sections) {
      for (const role of section.roles) {
        role.rehearsalPriority = role.rehearsalPriority === "high" ? "low" : role.rehearsalPriority;
      }
    }

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    expect(priorities.textContent).toContain("Lock in first");
    expect(priorities.textContent).toContain("Lead Vocal · verse");
    expect(priorities.textContent).not.toContain("Bass Guitar · verse");
  });

  it("falls back to focus sections when every role is low priority", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    for (const section of song.sections) {
      for (const role of section.roles) {
        role.rehearsalPriority = "low";
      }
    }

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    expect(priorities.textContent).toContain("Start with this section");
    expect(priorities.textContent).toContain("verse");
    expect(priorities.textContent).not.toContain("Lock in first");
  });

  it("does not turn blank or none sentinels into lock-in instructions", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections = [];
    song.exportSummary = {
      ...song.exportSummary,
      focusSections: ["NONE", "  ", "none"]
    };

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    expect(priorities.textContent).toContain(
      "No named parts to lock in yet. Pick the first entrance on the section roadmap."
    );
    expect(priorities.textContent).not.toContain("Open a role on the roadmap");
    expect(priorities.textContent).not.toMatch(/NONE/i);
  });

  it("localizes the empty lock-in copy without promising a role click will fill the card", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    song.sections = [];
    song.exportSummary = {
      ...song.exportSummary,
      focusSections: []
    };

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "합주 우선순위" });
    expect(priorities.textContent).toContain("아직 먼저 맞출 파트가 없습니다. 구간 로드맵에서 첫 입구를 고르세요.");
    expect(priorities.textContent).not.toContain("로드맵에서 역할을 열면");
  });

  it("keeps repeated verse labels from consuming a third lock-in slot", () => {
    setNavigatorLanguage("en-US");
    const song = createLateNightSetWithRepeatedVerse();

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    expect(priorities.textContent).toContain("Lock in first");
    expect(priorities.querySelectorAll("li")).toHaveLength(3);
    expect(priorities.textContent).toContain("Bass Guitar · verse");
    expect(priorities.textContent).toContain("Keyboard 1 Right Hand · verse");
    expect(priorities.textContent).toContain("Lead Vocal · chorus");
    expect(priorities.textContent?.match(/Bass Guitar · verse/g)).toHaveLength(1);
  });

  it("selects the named role and section when a lock-in pair is activated", () => {
    setNavigatorLanguage("en-US");
    const song = createLateNightSetWithRepeatedVerse();

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    fireEvent.click(
      within(priorities).getByRole("button", { name: "Show Lead Vocal in chorus on the roadmap" })
    );

    expect(screen.getByRole("tab", { name: "Lead Vocal" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("section-roadmap-chorus-1")).toHaveAttribute("data-focused-section", "true");
    expect(screen.getByTestId("section-roadmap-verse-1")).not.toHaveAttribute("data-focused-section", "true");
  });

  it("focuses the matching section when a fallback focus label is activated", () => {
    setNavigatorLanguage("en-US");
    const song = createLateNightSetWithRepeatedVerse();
    for (const section of song.sections) {
      for (const role of section.roles) {
        role.rehearsalPriority = "low";
      }
    }
    song.exportSummary = {
      ...song.exportSummary,
      focusSections: ["chorus"]
    };

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    fireEvent.click(within(priorities).getByRole("button", { name: "Show chorus on the roadmap" }));

    expect(screen.getByTestId("section-roadmap-chorus-1")).toHaveAttribute("data-focused-section", "true");
    expect(screen.getByTestId("section-roadmap-verse-1")).not.toHaveAttribute("data-focused-section", "true");
  });

  it("omits unmatched focus labels so they cannot clear a real section", () => {
    setNavigatorLanguage("en-US");
    const song = createLateNightSetWithRepeatedVerse();
    for (const section of song.sections) {
      for (const role of section.roles) {
        role.rehearsalPriority = "low";
      }
    }
    song.exportSummary = {
      ...song.exportSummary,
      focusSections: ["verse", "bridge"]
    };

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    fireEvent.click(within(priorities).getByRole("button", { name: "Show verse on the roadmap" }));
    expect(screen.getByTestId("section-roadmap-verse-1")).toHaveAttribute("data-focused-section", "true");
    expect(within(priorities).queryByRole("button", { name: "Show bridge on the roadmap" })).toBeNull();
    expect(screen.getByTestId("section-roadmap-verse-1")).toHaveAttribute("data-focused-section", "true");
  });

  it("falls back to the first valid section when unmatched focus labels are the only evidence", () => {
    setNavigatorLanguage("en-US");
    const song = createLateNightSetWithRepeatedVerse();
    for (const section of song.sections) {
      for (const role of section.roles) {
        role.rehearsalPriority = "low";
      }
    }
    song.exportSummary = {
      ...song.exportSummary,
      focusSections: ["bridge"]
    };

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    expect(within(priorities).queryByRole("button", { name: "Show bridge on the roadmap" })).toBeNull();
    fireEvent.click(within(priorities).getByRole("button", { name: "Show verse on the roadmap" }));
    expect(screen.getByTestId("section-roadmap-verse-1")).toHaveAttribute("data-focused-section", "true");
  });

  it("falls back to the first section label when every role is low and focus sections are empty", () => {
    setNavigatorLanguage("en-US");
    const song = createLateNightSetWithRepeatedVerse();
    for (const section of song.sections) {
      for (const role of section.roles) {
        role.rehearsalPriority = "low";
      }
    }
    song.exportSummary = {
      ...song.exportSummary,
      focusSections: []
    };

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    expect(priorities.textContent).toContain("Start with this section");
    expect(priorities.textContent).toContain("verse");
    expect(priorities.textContent).not.toContain("chorus");
    expect(priorities.textContent).not.toContain("Lock in first");
    fireEvent.click(within(priorities).getByRole("button", { name: "Show verse on the roadmap" }));
    expect(screen.getByTestId("section-roadmap-verse-1")).toHaveAttribute("data-focused-section", "true");
  });

  it("skips a none first-section label when falling back to the roadmap entrance", () => {
    setNavigatorLanguage("en-US");
    const song = createLateNightSetWithRepeatedVerse();
    for (const section of song.sections) {
      for (const role of section.roles) {
        role.rehearsalPriority = "low";
      }
    }
    song.sections[0] = { ...song.sections[0]!, label: "none" };
    song.sections[1] = { ...song.sections[1]!, label: "NONE" };
    song.exportSummary = {
      ...song.exportSummary,
      focusSections: []
    };

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    expect(within(priorities).queryByRole("button", { name: "Show none on the roadmap" })).toBeNull();
    fireEvent.click(within(priorities).getByRole("button", { name: "Show chorus on the roadmap" }));
    expect(screen.getByTestId("section-roadmap-chorus-1")).toHaveAttribute("data-focused-section", "true");
  });

  it("scrolls the named section into view when a lock-in pair is activated", () => {
    setNavigatorLanguage("en-US");
    const song = createLateNightSetWithRepeatedVerse();
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    fireEvent.click(
      within(priorities).getByRole("button", { name: "Show Lead Vocal in chorus on the roadmap" })
    );

    const chorusCard = screen.getByTestId("section-roadmap-chorus-1");
    expect(chorusCard).toHaveAttribute("data-focused-section", "true");
    expect(chorusCard).toHaveAttribute("aria-current", "true");
    expect(scrollIntoView).toHaveBeenCalled();
  });
});

/**
 * Build a Late Night Set with verse, chorus, and a second verse that reuses
 * the same role names and section label the analysis engine emits for repeats.
 */
function createLateNightSetWithRepeatedVerse(): RehearsalSong {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: 30, end: 50 };
  chorus.roles = chorus.roles.map((role) => ({
    ...role,
    rehearsalPriority: role.id === "lead-vocal" ? "high" : "low"
  }));
  const verseRepeat = structuredClone(verse);
  verseRepeat.id = "verse-2";
  verseRepeat.timeRange = { start: 50, end: 70 };
  song.sections = [verse, verseRepeat, chorus];
  return song;
}
