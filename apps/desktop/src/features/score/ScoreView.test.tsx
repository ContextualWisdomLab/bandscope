import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RehearsalSong, ScoreAttachment } from "@bandscope/shared-types";
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

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const tauriWindow = window as TauriWindow;
const mockInvoke = vi.mocked(invoke);

const SCORE_ID = "3f2c8f0e-1a2b-4c3d-8e9f-001122334455";

function makeSong(scoreAttachments?: ScoreAttachment[]): RehearsalSong {
  return {
    id: "song-1",
    title: "Late Night Set",
    sections: [],
    exportSummary: { format: "cue-sheet", headline: "", focusSections: [] },
    ...(scoreAttachments ? { scoreAttachments } : {})
  } as RehearsalSong;
}

function attachResponse(overrides: Record<string, unknown> = {}) {
  return {
    scoreId: SCORE_ID,
    fileName: "opener.pdf",
    fileSizeBytes: 2048,
    ...overrides
  };
}

describe("ScoreView", () => {
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

  it("renders the empty attachment list with an enabled attach button", () => {
    render(<ScoreView song={makeSong()} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /Score · Late Night Set/i })).toBeInTheDocument();
    expect(screen.getByText("No scores attached to this song yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add score" })).toBeEnabled();
    expect(screen.getByTestId("score-viewer")).toHaveTextContent("no-data");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("disables score storage actions when no project workspace is active", () => {
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);
    render(<ScoreView song={song} projectId={null} onSongUpdate={vi.fn()} />);

    expect(screen.getByText("Scores attach to the active analysis project.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add score" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open score: opener.pdf" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Remove: opener.pdf" })).toBeDisabled();
    expect(screen.getAllByTitle("scoreNavDisabledHint")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Open score: opener.pdf" }));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("attaches a score, persists the metadata, and opens the new PDF", async () => {
    mockInvoke
      .mockResolvedValueOnce(attachResponse())
      .mockResolvedValueOnce([1, 2, 3]);
    const onSongUpdate = vi.fn();
    const song = makeSong();

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Add score" }));

    await waitFor(() => {
      expect(screen.getByTestId("score-viewer")).toHaveTextContent("bytes:3:opener.pdf");
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(1, "attach_score_pdf", {
      projectId: "project-1-2",
      songId: "song-1"
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "read_score_pdf", {
      projectId: "project-1-2",
      scoreId: SCORE_ID
    });
    expect(onSongUpdate).toHaveBeenCalledWith({
      ...song,
      scoreAttachments: [{ id: SCORE_ID, fileName: "opener.pdf" }]
    });
  });

  it("shows the bridge error when attaching fails and keeps metadata unchanged", async () => {
    mockInvoke.mockRejectedValueOnce("Choose a PDF file to attach as a score.");
    const onSongUpdate = vi.fn();

    render(<ScoreView song={makeSong()} projectId="project-1-2" onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Add score" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a PDF file to attach as a score."
    );
    expect(onSongUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add score" })).toBeEnabled();
  });

  it("falls back to the generic attach failure for malformed bridge responses", async () => {
    mockInvoke.mockResolvedValueOnce({ scoreId: 42 });

    render(<ScoreView song={makeSong()} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add score" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid score bridge response");
  });

  it("opens an existing attachment through the read command", async () => {
    const bytes = new Uint8Array([9, 9, 9, 9]).buffer;
    let resolveRead!: (value: unknown) => void;
    mockInvoke.mockImplementationOnce(
      () => new Promise((resolve) => { resolveRead = resolve; })
    );
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open score: opener.pdf" }));

    expect(await screen.findByText("Opening score PDF...")).toBeInTheDocument();
    resolveRead(bytes);

    await waitFor(() => {
      expect(screen.getByTestId("score-viewer")).toHaveTextContent("bytes:4:opener.pdf");
    });
    expect(mockInvoke).toHaveBeenCalledWith("read_score_pdf", {
      projectId: "project-1-2",
      scoreId: SCORE_ID
    });
  });

  it("accepts Uint8Array read responses from the bridge", async () => {
    mockInvoke.mockResolvedValueOnce(new Uint8Array([7, 7]));
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open score: opener.pdf" }));

    await waitFor(() => {
      expect(screen.getByTestId("score-viewer")).toHaveTextContent("bytes:2:opener.pdf");
    });
  });

  it("clears the selection and reports when reading a score fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Score was not found."));
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open score: opener.pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not open the score PDF. Score was not found."
    );
    expect(screen.getByTestId("score-viewer")).toHaveTextContent("no-data");
  });

  it("rejects malformed read responses", async () => {
    mockInvoke.mockResolvedValueOnce("not-bytes");
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open score: opener.pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not open the score PDF. Invalid score bridge response"
    );
  });

  it("removes an attachment after confirmation and resets the open viewer", async () => {
    mockInvoke
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce(true);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSongUpdate = vi.fn();
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Open score: opener.pdf" }));
    await waitFor(() => {
      expect(screen.getByTestId("score-viewer")).toHaveTextContent("bytes:2:opener.pdf");
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove: opener.pdf" }));

    await waitFor(() => {
      expect(onSongUpdate).toHaveBeenCalledWith({ ...song, scoreAttachments: [] });
    });
    expect(window.confirm).toHaveBeenCalledWith("Remove opener.pdf from this song?");
    expect(mockInvoke).toHaveBeenCalledWith("remove_score_pdf", {
      projectId: "project-1-2",
      scoreId: SCORE_ID
    });
    expect(screen.getByTestId("score-viewer")).toHaveTextContent("no-data");
  });

  it("keeps the attachment when the removal confirm is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onSongUpdate = vi.fn();
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove: opener.pdf" }));

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(onSongUpdate).not.toHaveBeenCalled();
  });

  it("reports removal failures without dropping the metadata", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Could not remove the score PDF."));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSongUpdate = vi.fn();
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove: opener.pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not remove the score PDF.");
    expect(onSongUpdate).not.toHaveBeenCalled();
  });

  it("rejects malformed removal responses", async () => {
    mockInvoke.mockResolvedValueOnce("done");
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <ScoreView
        song={makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }])}
        projectId="project-1-2"
        onSongUpdate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove: opener.pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid score bridge response");
  });

  it("fails closed when no desktop bridge is available", async () => {
    delete tauriWindow.__TAURI_INTERNALS__;

    render(<ScoreView song={makeSong()} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add score" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Score PDFs are only available in the desktop app."
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("uses the legacy invoke shim when Tauri internals are absent", async () => {
    delete tauriWindow.__TAURI_INTERNALS__;
    const legacyInvoke = vi.fn().mockResolvedValueOnce([5]);
    tauriWindow.__TAURI_INVOKE__ = legacyInvoke;
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open score: opener.pdf" }));

    await waitFor(() => {
      expect(screen.getByTestId("score-viewer")).toHaveTextContent("bytes:1:opener.pdf");
    });
    expect(legacyInvoke).toHaveBeenCalledWith("read_score_pdf", {
      projectId: "project-1-2",
      scoreId: SCORE_ID
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("falls back to the generic attach copy when the bridge rejects with a non-textual value", async () => {
    // A rejection that is neither an Error nor a string exercises the
    // `bridgeErrorDetail` fallback path (no usable message to surface).
    mockInvoke.mockRejectedValueOnce({ code: 500 });

    render(<ScoreView song={makeSong()} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add score" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not attach the score PDF.");
  });

  it("ignores a superseded read once a newer attachment is opened", async () => {
    // Opening a second score before the first read resolves must make the
    // stale first read a no-op (last-open-wins), so the viewer keeps the newer
    // score and the stale resolution never overwrites it.
    let resolveStale!: (value: unknown) => void;
    mockInvoke
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve; }))
      .mockResolvedValueOnce([9, 9]);
    const song = makeSong([
      { id: "id-1", fileName: "first.pdf" },
      { id: "id-2", fileName: "second.pdf" }
    ]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open score: first.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Open score: second.pdf" }));

    await waitFor(() => {
      expect(screen.getByTestId("score-viewer")).toHaveTextContent("bytes:2:second.pdf");
    });

    await act(async () => {
      resolveStale([1, 1, 1, 1, 1]);
    });

    expect(screen.getByTestId("score-viewer")).toHaveTextContent("bytes:2:second.pdf");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("swallows a superseded read failure instead of surfacing a stale error", async () => {
    // A rejected stale read must not clobber the newer, successful selection
    // with an error banner.
    let rejectStale!: (reason: unknown) => void;
    mockInvoke
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectStale = reject; }))
      .mockResolvedValueOnce([4, 4]);
    const song = makeSong([
      { id: "id-1", fileName: "first.pdf" },
      { id: "id-2", fileName: "second.pdf" }
    ]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open score: first.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Open score: second.pdf" }));

    await waitFor(() => {
      expect(screen.getByTestId("score-viewer")).toHaveTextContent("bytes:2:second.pdf");
    });

    await act(async () => {
      rejectStale(new Error("Stale read failed."));
    });

    expect(screen.getByTestId("score-viewer")).toHaveTextContent("bytes:2:second.pdf");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("removes a score that is not currently open without resetting the viewer", async () => {
    // With nothing open, removal updates metadata but must leave the (empty)
    // viewer state untouched.
    mockInvoke.mockResolvedValueOnce(true);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSongUpdate = vi.fn();
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove: opener.pdf" }));

    await waitFor(() => {
      expect(onSongUpdate).toHaveBeenCalledWith({ ...song, scoreAttachments: [] });
    });
    expect(screen.getByTestId("score-viewer")).toHaveTextContent("no-data");
  });
});
