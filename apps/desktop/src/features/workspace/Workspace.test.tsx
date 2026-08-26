import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type ProjectBootstrapSummary, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";
import { EmptyState, LoadingState } from "./WorkspaceStates";
import { generateMetadataHandoffJson } from "../../lib/export";

const originalLanguage = navigator.language;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

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

  it("names tonight's first playable range and the next instrument check", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();

    render(<Workspace song={song} />);

    const callout = screen.getByTestId("first-range-squeeze");
    expect(callout).toHaveTextContent("Tonight's first range");
    expect(callout).toHaveTextContent(
      "Bass Guitar sits C#2–E3 in verse. Hear that clash on your instrument before the verse."
    );
  });

  it("asks for an ear check when the selected part has no named span", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = song.sections[0]!.roles.map((role) => ({
      ...role,
      range: { lowestNote: "", highestNote: "none" },
      overlapWarnings: []
    }));

    render(<Workspace song={song} />);

    expect(screen.getByTestId("first-range-squeeze")).toHaveTextContent(
      "Tonight's first range still needs an ear check. Confirm the high and low notes on the selected part before the first section."
    );
  });

  it("limits the range callout to the selected role", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));

    expect(screen.getByTestId("first-range-squeeze")).toHaveTextContent(
      "Lead Vocal sits G#3–C#5 in verse. Hear that clash on your instrument before the verse."
    );
  });

  it("asks the player to check a named span when no clash is present", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = song.sections[0]!.roles.map((role) => ({
      ...role,
      overlapWarnings: []
    }));

    render(<Workspace song={song} />);

    expect(screen.getByTestId("first-range-squeeze")).toHaveTextContent(
      "Bass Guitar sits C#2–E3 in verse. Check that span on your instrument before the verse."
    );
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
    expect(screen.getByText("역할과 화성")).toBeTruthy();
  });

  it("names tonight's first cutoff plan as workspace navigation", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();

    render(<Workspace song={song} />);

    const target = screen.getByTestId("song-structure-grid").children.item(0);
    expect(target).toBeTruthy();
    const scrollIntoView = vi.fn();
    Object.defineProperty(target!, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

    expect(
      screen.getAllByText(
        "Cut this off with Lead Vocal on the verse last beat; don't linger past the pickup."
      ).length
    ).toBeGreaterThan(0);
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar cutoff at 0:30"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Cut that off on Bass Guitar at 0:30 before the room starts./)
    ).toBeTruthy();
  });
});
