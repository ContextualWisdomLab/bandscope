import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RehearsalSong } from "@bandscope/shared-types";
import { invoke } from "@tauri-apps/api/core";
import { ScoreView } from "./ScoreView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

vi.mock("./ScoreViewer", () => ({
  ScoreViewer: ({ data, fileName }: { data: Uint8Array | null; fileName?: string }) => (
    <div data-testid="score-viewer">
      {data ? `bytes:${data.length}` : "no-data"}
      {fileName ? `:${fileName}` : ""}
    </div>
  )
}));

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) =>
    ({
      scoreViewTitle: "Score",
      scoreViewSubtitle: "Attach validated PDF scores to the current song.",
      scoreListTitle: "Attached scores",
      scoreListEmpty: "Add a score to read it during rehearsal.",
      scoreAttach: "Add score",
      scoreAttaching: "Attaching...",
      scoreRemove: "Remove",
      scoreRemoveConfirm: "Remove {fileName} from this song?",
      scoreOpen: "Open score",
      scoreOpening: "Opening score PDF...",
      scoreAttachFailed: "Could not attach the score PDF.",
      scoreReadFailed: "Could not open the score PDF.",
      scoreRemoveFailed: "Could not remove the score PDF.",
      scoreRequiresProject: "Scores attach to the active analysis project."
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const tauriWindow = window as TauriWindow;
const mockInvoke = vi.mocked(invoke);
const SCORE_ID = "3f2c8f0e-1a2b-4c3d-8e9f-001122334455";

function makeSong(): RehearsalSong {
  return {
    id: "song-1",
    title: "Late Night Set",
    sections: [],
    exportSummary: { format: "cue-sheet", headline: "", focusSections: [] },
    scoreAttachments: [{ id: SCORE_ID, fileName: "opener.pdf" }]
  } as RehearsalSong;
}

describe("ScoreView project-scoped viewer state", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    tauriWindow.__TAURI_INTERNALS__ = { invoke: () => Promise.resolve(null) };
    delete tauriWindow.__TAURI_INVOKE__;
  });

  afterEach(() => {
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
    vi.restoreAllMocks();
  });

  it("does not reuse opened PDF bytes after the active project changes", async () => {
    mockInvoke.mockResolvedValueOnce([1, 2, 3]);
    const song = makeSong();
    const onSongUpdate = vi.fn();
    const { rerender } = render(
      <ScoreView song={song} projectId="project-a" onSongUpdate={onSongUpdate} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open score: opener.pdf" }));
    await waitFor(() => {
      expect(screen.getByTestId("score-viewer")).toHaveTextContent("bytes:3:opener.pdf");
    });

    rerender(<ScoreView song={song} projectId={null} onSongUpdate={onSongUpdate} />);
    expect(screen.queryByTestId("score-viewer")).not.toBeInTheDocument();

    rerender(<ScoreView song={song} projectId="project-b" onSongUpdate={onSongUpdate} />);
    await waitFor(() => {
      expect(screen.getByTestId("score-viewer")).toHaveTextContent("no-data");
    });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("ignores a previous project's read completion after project authority is removed", async () => {
    let resolveRead!: (value: unknown) => void;
    mockInvoke.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRead = resolve;
      })
    );
    const song = makeSong();
    const onSongUpdate = vi.fn();
    const { rerender } = render(
      <ScoreView song={song} projectId="project-a" onSongUpdate={onSongUpdate} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open score: opener.pdf" }));
    expect(await screen.findByText("Opening score PDF...")).toBeInTheDocument();

    rerender(<ScoreView song={song} projectId={null} onSongUpdate={onSongUpdate} />);
    await act(async () => {
      resolveRead([9, 9]);
    });
    rerender(<ScoreView song={song} projectId="project-b" onSongUpdate={onSongUpdate} />);

    await waitFor(() => {
      expect(screen.getByTestId("score-viewer")).toHaveTextContent("no-data");
    });
  });
});
