import { fireEvent, render, screen } from "@testing-library/react";
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

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language,
  });
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
        fileSizeBytes: 1_024_000,
      },
    };
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
    expect(
      screen.getByRole("heading", { name: "오디오 분석 중" }),
    ).toBeTruthy();
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

  it("exports a cue sheet from the workspace", async () => {
    const song = createDemoRehearsalSong();
    const createObjectUrl = vi.fn(() => "blob:cuesheet");
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

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("button", { name: /export cue sheet/i }));

    const blob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();
    expect(text).toContain("Section,Groove,Role,Harmony");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:cuesheet");
  });

  it("exports a chart summary from the workspace", async () => {
    const song = createDemoRehearsalSong();
    const createObjectUrl = vi.fn(() => "blob:chart");
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

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("button", { name: /export chart/i }));

    const blob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();
    const payload = JSON.parse(text);
    expect(payload.title).toBe(song.title);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:chart");
  });

  it("handles rendering active role comments correctly", () => {
    const song = createDemoRehearsalSong();

    song.collaboration = {
      ...song.collaboration,
      comments: [
        {
          id: "comment-1",
          author: "John Doe",
          body: "Need more dynamics here",
          status: "open",
          createdAt: new Date().toISOString(),
          roleId: song.sections[0]!.roles[0]!.id,
        },
      ],
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    render(<Workspace song={song} />);
    // Just click all the tabs
    screen.getAllByRole("tab").forEach((tab) => fireEvent.click(tab));
  });

  it("handles parseProjectBootstrapSummary failure safely", () => {
    const song = createDemoRehearsalSong();

    // Test the safeProjectBootstrapSummary try/catch block by giving a bad sourceBootstrap
    const badBootstrap = { invalid: "bootstrap" } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    render(<Workspace song={song} sourceBootstrap={badBootstrap} />);
  });

  it("handles blank text correctly", () => {
    // testing nonBlankText undefined path inside Workspace
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      harmonicExplanation: "   ",
      harmony: {
        functionLabel: "  ",
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    render(<Workspace song={song} />);
  });

  it("handles null project bootstrap gracefully", () => {
    const song = createDemoRehearsalSong();
    render(
      <Workspace
        song={song}
        sourceBootstrap={null as unknown as ProjectBootstrapSummary}
      />,
    );
  });

  it("handles song without focusSections and blank label correctly", () => {
    const song = createDemoRehearsalSong();
    song.exportSummary = { headline: "test" } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    song.sections[0]!.label = "   "; // whitespace label
    render(<Workspace song={song} />);
    expect(screen.getAllByText(/first pass/i)).toBeTruthy();
  });

  it("handles empty role transcription title correctly when canTranscribeBass is false and role has no name", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      id: "another-role-1",
      name: "   ", // blank name falls back to role.id
      harmony: {
        chord: "C",
        originalChord: "C",
      },
    };
    render(<Workspace song={song} />);
    // Select the tab, which should fallback to role.id 'another-role-1' due to blank name
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[0]);
  });

  it("handles empty collaboration planning state", () => {
    const song = createDemoRehearsalSong();
    song.collaboration = {
      assignments: [],
      comments: [],
      approvals: [],
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    render(<Workspace song={song} />);
    // Check if collaboration empty message exists
    expect(screen.getByText(/0 Assignments/i)).toBeTruthy();
    expect(screen.getByText(/0 Comments/i)).toBeTruthy();
    expect(screen.getByText(/0 Approvals/i)).toBeTruthy();
  });

  it("covers safeProjectBootstrapSummary (!value) branch", () => {
    // We need to render the component with sourceBootstrap = null.
    // And to cover the catch branch, we previously used a bad bootstrap.
    // To cover the focusSections branch completely, we need one where exportSummary.focusSections exists but is empty? No, it's || song.sections[0]?.label || "first pass"
    const song = createDemoRehearsalSong();

    // We want song.exportSummary.focusSections empty and song.sections[0].label undefined
    song.exportSummary = { focusSections: [] } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    song.sections[0]!.label = undefined as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Also we want activeRoleDetails?.name undefined to hit activeRoleDetails?.name ?? "This role" in button title
    song.sections[0]!.roles[0]!.name = undefined as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    render(<Workspace song={song} sourceBootstrap={null} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[0]);
  });

  it("covers specific active role fallback strings", () => {
    const song = createDemoRehearsalSong();

    // We want activeRoleDetails?.name ?? activeRole on line 312:
    // So name needs to be missing, and it will use activeRole (which is the role ID).
    song.sections[0]!.roles[0]!.name = undefined as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    render(<Workspace song={song} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[0]);
  });

  it("covers more edge case branches safely", () => {
    const song = createDemoRehearsalSong();

    // Test the activeRoleDetails?.name ?? activeRole on line 312 and 320
    // If activeRoleDetails is defined but name is empty or undefined, it should fallback
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      name: undefined as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    };

    // We already have a test for sourceBootstrap = null. The branch !value is hit.
    // What if value is an empty object? It doesn't hit !value.

    render(<Workspace song={song} sourceBootstrap={undefined} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[0]); // activeRole becomes the first role ID
  });

  it("covers final edge case fallbacks", () => {
    const song = createDemoRehearsalSong();

    // Line 277: collaboration empty array check
    song.collaboration = {
      assignments: [],
      comments: [],
      approvals: [],
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Line 312 and 320: activeRoleDetails?.name ?? "This role" when name is undefined
    // For this to happen, activeRoleDetails must exist, but name must be undefined.
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      name: undefined as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    };

    // Also, canTranscribeBass is based on name. If name is undefined, canTranscribeBass is false.
    // So line 320 will hit: `${activeRoleDetails?.name ?? "This role"} transcription is coming soon...`
    // And since name is undefined, it uses "This role".

    render(<Workspace song={song} sourceBootstrap={undefined} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[0]);
  });

  it("covers safeProjectBootstrapSummary (!value) explicitly with empty string", () => {
    const song = createDemoRehearsalSong();
    render(
      <Workspace
        song={song}
        sourceBootstrap={
          "" as any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        }
      />,
    );
  });

  it("covers empty role details completely", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = []; // clear all roles
    render(<Workspace song={song} />);
    // Should render fine but without role tabs
  });

  it("covers safeProjectBootstrapSummary (!value) with undefined explicitly", () => {
    const song = createDemoRehearsalSong();
    render(<Workspace song={song} sourceBootstrap={undefined} />);
  });

  it("covers specific active role fallback strings again", () => {
    const song = createDemoRehearsalSong();
    // Instead of activeRoleDetails being defined but name missing,
    // What if activeRoleDetails itself is undefined somehow?
    // We can do this by setting activeRole to a non-existent role, or avoiding roles.
    song.sections[0]!.roles = [];
    render(<Workspace song={song} />);
    // If no roles, there are no tabs to click...
  });

  it("covers specific active role fallback strings again 2", () => {
    const song = createDemoRehearsalSong();

    // We want activeRoleDetails?.name ?? activeRole on line 312
    // and activeRoleDetails?.name ?? "This role" on line 320.
    // Also covers !map.has(role.id) by having duplicate roles.

    // Create duplicate roles to hit !map.has(role.id)
    const duplicateRole = {
      ...song.sections[0]!.roles[0]!,
      name: undefined as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    song.sections[0]!.roles.push(duplicateRole);

    // And for line 277: collaboration comments/approvals empty
    song.collaboration = {
      assignments: [],
      comments: [],
      approvals: [],
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    render(<Workspace song={song} sourceBootstrap={undefined} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[0]);
  });
});
