import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RehearsalSong, ScoreAttachment } from "@bandscope/shared-types";
import { invoke } from "@tauri-apps/api/core";
import { ScoreView } from "./ScoreView";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

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
      scoreListEmpty: "No scores attached to this song yet.",
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

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };
const tauriWindow = window as TauriWindow;
const mockInvoke = vi.mocked(invoke);
const SCORE_ID = "3f2c8f0e-1a2b-4c3d-8e9f-001122334455";
const SCORE_DIGEST = "ab".repeat(32);

function makeSong(scoreAttachments?: ScoreAttachment[]): RehearsalSong {
  return {
    id: "song-1",
    title: "Late Night Set",
    sections: [],
    exportSummary: { format: "cue-sheet", headline: "", focusSections: [] },
    ...(scoreAttachments ? { scoreAttachments } : {})
  } as RehearsalSong;
}

function attachResponse() {
  return { scoreId: SCORE_ID, fileName: "opener.pdf", fileSizeBytes: 2048 };
}

describe("ScoreView project-context invalidation", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    tauriWindow.__TAURI_INTERNALS__ = { invoke: () => Promise.resolve(null) };
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("does not render a read that resolves after the active project changes", async () => {
    let resolveRead!: (value: unknown) => void;
    mockInvoke.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);
    const onSongUpdate = vi.fn();
    const { rerender } = render(
      <ScoreView song={song} projectId="project-a" onSongUpdate={onSongUpdate} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open score: opener.pdf" }));
    expect(await screen.findByText("Opening score PDF...")).toBeInTheDocument();

    rerender(<ScoreView song={song} projectId="project-b" onSongUpdate={onSongUpdate} />);
    await act(async () => { resolveRead([1, 2, 3]); });

    expect(screen.getByTestId("score-viewer")).toHaveTextContent("no-data");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves a completed old-project attachment for recovery instead of mutating the new project", async () => {
    let resolveAttach!: (value: unknown) => void;
    mockInvoke.mockImplementationOnce(() => new Promise((resolve) => { resolveAttach = resolve; }));
    const song = makeSong();
    const onSongUpdate = vi.fn();
    const { rerender } = render(
      <ScoreView song={song} projectId="project-a" onSongUpdate={onSongUpdate} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add score" }));
    rerender(<ScoreView song={song} projectId="project-b" onSongUpdate={onSongUpdate} />);
    await act(async () => { resolveAttach(attachResponse()); });

    expect(onSongUpdate).not.toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("attach_score_pdf", {
      projectId: "project-a",
      songId: "song-1"
    });
    expect(screen.getByTestId("score-viewer")).toHaveTextContent("no-data");
  });

  it("does not detach metadata when an old-project receipt resolves after a project switch", async () => {
    let resolveReceipt!: (value: unknown) => void;
    mockInvoke.mockImplementationOnce(() => new Promise((resolve) => { resolveReceipt = resolve; }));
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);
    const onSongUpdate = vi.fn();
    const { rerender } = render(
      <ScoreView song={song} projectId="project-a" onSongUpdate={onSongUpdate} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove: opener.pdf" }));
    rerender(<ScoreView song={song} projectId="project-b" onSongUpdate={onSongUpdate} />);
    await act(async () => {
      resolveReceipt({ scoreId: SCORE_ID, contentSha256: SCORE_DIGEST });
    });

    expect(onSongUpdate).not.toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("get_score_pdf_receipt", {
      projectId: "project-a",
      scoreId: SCORE_ID
    });
  });

  it("does not delete old-project bytes when project context changes during metadata persistence", async () => {
    mockInvoke.mockResolvedValueOnce({ scoreId: SCORE_ID, contentSha256: SCORE_DIGEST });
    let resolvePersistence!: (value: void | boolean) => void;
    const onSongUpdate = vi.fn(
      () => new Promise<void | boolean>((resolve) => { resolvePersistence = resolve; })
    );
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);
    const { rerender } = render(
      <ScoreView song={song} projectId="project-a" onSongUpdate={onSongUpdate} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove: opener.pdf" }));
    await waitFor(() => expect(onSongUpdate).toHaveBeenCalledTimes(1));

    rerender(<ScoreView song={song} projectId="project-b" onSongUpdate={onSongUpdate} />);
    await act(async () => { resolvePersistence(true); });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "remove_score_pdf_if_receipt_matches",
      expect.anything()
    );
  });
});
