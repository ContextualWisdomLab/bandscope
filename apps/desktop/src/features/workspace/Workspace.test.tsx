import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  createDemoRehearsalSong,
  type ProjectBootstrapSummary,
  type RehearsalSong,
} from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";
import { EmptyState, LoadingState } from "./WorkspaceStates";
import { generateMetadataHandoffJson } from "../../lib/export";

const originalLanguage = navigator.language;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
const originalTauriInternals = Object.getOwnPropertyDescriptor(
  window,
  "__TAURI_INTERNALS__",
);

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language,
  });
}

function createLocalSourceBootstrap(): ProjectBootstrapSummary {
  return {
    projectId: "project-1",
    sourceMode: "reference",
    projectRoot: "/tmp/bandscope/projects/project-1",
    cacheRoot: "/tmp/bandscope/cache/project-1",
    tempRoot: "/tmp/bandscope/temp/project-1",
    source: {
      sourcePath: "bandscope-project://project-1-1",
      fileName: "late-night-set.wav",
      extension: "wav",
      fileSizeBytes: 1_024_000,
    },
  };
}

function installPlayableAudioMocks() {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {
      convertFileSrc: (path: string) => `asset://localhost/${path}`,
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
}

describe("Workspace", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
    if (originalTauriInternals) {
      Object.defineProperty(
        window,
        "__TAURI_INTERNALS__",
        originalTauriInternals,
      );
    } else {
      delete (window as Window & { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__;
    }
  });

  it("updates practice progress immutably through onSongUpdate", () => {
    const song = createDemoRehearsalSong();
    // Default mock setup puts "bass-guitar" as the role ID in index 0
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      practiceProgress: 50,
    };
    const onSongUpdate = vi.fn();

    render(<Workspace song={song} onSongUpdate={onSongUpdate} />);

    // Select the Bass Guitar role to render PracticeProgress
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const increaseBtn = screen.getByRole("button", {
      name: "Increase progress",
    });
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
      end: Number.POSITIVE_INFINITY,
    };

    render(<Workspace song={song} />);

    expect(screen.getByText(/verse · 0:00–0:00/i)).toBeTruthy();
  });

  it("puts tonight's first playable loop on the map before a role is chosen", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();

    render(<Workspace song={song} />);

    expect(
      screen.getByRole("region", { name: /Tonight's section loop/i }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(
      /Map verse from 0:10–0:30\. Choose a local song first to start the rehearsal clock/i,
    );
  });

  it("keeps the role loop action unavailable without local audio authority", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
    };

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const loopButton = screen.getByRole("button", {
      name: "Start selected section loop",
    });
    expect(loopButton.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(loopButton);
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Choose a local song first/i);
  });

  it("keeps the role loop action unavailable for browser-only audio authority", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
    };
    const browserSourceBootstrap = {
      ...createLocalSourceBootstrap(),
      source: {
        ...createLocalSourceBootstrap().source,
        sourcePath: "browser://selected-audio",
      },
    } satisfies ProjectBootstrapSummary;

    render(
      <Workspace song={song} sourceBootstrap={browserSourceBootstrap} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const loopButton = screen.getByRole("button", {
      name: "Start selected section loop",
    });
    expect(loopButton.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(loopButton);
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).not.toMatch(/count in 4 beats/i);
  });

  it("starts the selected section loop from the role action when local audio is available", () => {
    setNavigatorLanguage("en-US");
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
    };

    render(
      <Workspace
        song={song}
        sourceBootstrap={createLocalSourceBootstrap()}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Start selected section loop" }),
    );

    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Count in 4 beats at 120 BPM/i);
    expect(
      screen.queryByRole("button", { name: /Loop section coming soon/i }),
    ).toBeNull();
  });

  it("passes the selected role into the player section filter", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 64 };
    chorus.roles = chorus.roles.filter((role) => role.id !== "lead-vocal");
    song.sections.push(chorus);

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));

    const playerSections = screen.getByRole("group", {
      name: "Playable sections for Lead Vocal",
    });
    expect(within(playerSections).getByRole("button", { name: /verse/i })).toBeTruthy();
    expect(within(playerSections).queryByRole("button", { name: /chorus/i })).toBeNull();
  });

  it("clears a role that is absent after replacing the song", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const replacement = createDemoRehearsalSong();
    replacement.sections = replacement.sections.map((section) => ({
      ...section,
      roles: section.roles.filter((role) => role.id !== "lead-vocal"),
    }));

    const { rerender } = render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));
    expect(screen.getByTestId("rehearsal-loop-role-filter")).toHaveTextContent(
      "Showing sections that include Lead Vocal.",
    );

    rerender(<Workspace song={replacement} />);

    expect(screen.queryByTestId("rehearsal-loop-role-filter")).toBeNull();
    expect(
      screen.getByRole("tab", { name: "All Roles", selected: true }),
    ).toBeTruthy();
    expect(screen.getByTestId("rehearsal-loop-next-action")).not.toHaveTextContent(
      /No playable sections include Lead Vocal/i,
    );
  });

  it("enables bass transcription from selected role metadata rather than role id text", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      id: "low-end",
      name: "Bass Guitar",
    };

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const transcribeButton = screen.getByRole("button", {
      name: "Transcribe Bass",
    }) as HTMLButtonElement;
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
        { pitch: "G2", onset: 0.9, offset: 1.25, velocity: 0.68 },
      ],
    };

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const grooveMap = screen.getByRole("region", {
      name: /bass transcription groove map/i,
    });
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
    expect(
      screen.getByText(/Lock the bass entrance against the pickup/i),
    ).toBeTruthy();
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
      transpositionPlan: "",
    };
    song.collaboration = {
      syncMode: "local_only",
      syncNote: "Local-only draft",
    } as RehearsalSong["collaboration"];

    render(<Workspace song={song} />);

    expect(screen.getByText(/0 Assignments/i)).toBeTruthy();
    expect(screen.getByText(/0 Comments/i)).toBeTruthy();
    expect(screen.getByText(/0 Approvals/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    expect(screen.getByText("vi pedal anchor")).toBeTruthy();
    expect(
      screen.getAllByText("Stay on roots if the chorus entrance gets muddy.")
        .length,
    ).toBeGreaterThan(0);
  });

  it("exports a metadata-only handoff artifact from the workspace", async () => {
    const song = createDemoRehearsalSong();
    const sourceBootstrap = createLocalSourceBootstrap();
    const createObjectUrl = vi.fn(() => "blob:handoff");
    const revokeObjectUrl = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
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
      projectId: "project-1",
    } as ProjectBootstrapSummary;
    const createObjectUrl = vi.fn(() => "blob:handoff");
    const revokeObjectUrl = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
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
      projectId: "project-1",
    } as ProjectBootstrapSummary;

    expect(() => {
      generateMetadataHandoffJson(song, {
        sourceBootstrap: invalidSourceBootstrap,
      });
    }).toThrow("sourceMode");
  });

  it("localizes empty and loading state titles", () => {
    setNavigatorLanguage("ko-KR");
    render(<EmptyState />);
    render(<LoadingState />);

    expect(
      screen.getByRole("heading", { name: "분석 준비 완료" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오디오 분석 중" })).toBeTruthy();
  });

  it("localizes workspace navigation and rehearsal labels", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    song.exportSummary = {
      ...song.exportSummary,
      headline: "",
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
});
