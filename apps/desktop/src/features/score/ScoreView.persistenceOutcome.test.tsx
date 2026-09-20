import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RehearsalSong, ScoreAttachment } from "@bandscope/shared-types";
import { ScoreView } from "./ScoreView";
import {
  attachScorePdf,
  getScorePdfReceipt,
  readScorePdf,
  removeScorePdfIfReceiptMatches
} from "./scoreStorage";

vi.mock("./scoreStorage", () => ({
  attachScorePdf: vi.fn(),
  getScorePdfReceipt: vi.fn(),
  readScorePdf: vi.fn(),
  removeScorePdfIfReceiptMatches: vi.fn()
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

const mockAttachScorePdf = vi.mocked(attachScorePdf);
const mockGetScorePdfReceipt = vi.mocked(getScorePdfReceipt);
const mockReadScorePdf = vi.mocked(readScorePdf);
const mockRemoveScorePdfIfReceiptMatches = vi.mocked(removeScorePdfIfReceiptMatches);
const SCORE_ID = "3f2c8f0e-1a2b-4c3d-8e9f-001122334455";
const RECEIPT = { scoreId: SCORE_ID, contentSha256: "ab".repeat(32) };

function makeSong(scoreAttachments?: ScoreAttachment[]): RehearsalSong {
  return {
    id: "song-1",
    title: "Late Night Set",
    sections: [],
    exportSummary: { format: "cue-sheet", headline: "", focusSections: [] },
    ...(scoreAttachments ? { scoreAttachments } : {})
  } as RehearsalSong;
}

describe("ScoreView persistence outcome ordering", () => {
  beforeEach(() => {
    mockAttachScorePdf.mockReset();
    mockGetScorePdfReceipt.mockReset();
    mockReadScorePdf.mockReset();
    mockRemoveScorePdfIfReceiptMatches.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not present a newly published score as accepted when project metadata persistence rejects it", async () => {
    mockAttachScorePdf.mockResolvedValue({
      id: SCORE_ID,
      fileName: "opener.pdf",
      fileSizeBytes: 2048
    });
    const onSongUpdate = vi.fn().mockResolvedValue(false);

    render(<ScoreView song={makeSong()} projectId="project-1-2" onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Add score" }));

    await waitFor(() => expect(onSongUpdate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add score" })).toBeEnabled());
    expect(mockAttachScorePdf).toHaveBeenCalledTimes(1);
    expect(mockReadScorePdf).not.toHaveBeenCalled();
    expect(mockRemoveScorePdfIfReceiptMatches).not.toHaveBeenCalled();
    expect(screen.getByTestId("score-viewer")).toHaveTextContent("no-data");
  });

  it("captures storage identity but does not delete bytes when durable metadata removal is rejected", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGetScorePdfReceipt.mockResolvedValue(RECEIPT);
    const onSongUpdate = vi.fn().mockResolvedValue(false);
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove: opener.pdf" }));

    await waitFor(() => expect(onSongUpdate).toHaveBeenCalledTimes(1));
    expect(mockGetScorePdfReceipt).toHaveBeenCalledWith("project-1-2", SCORE_ID);
    expect(mockRemoveScorePdfIfReceiptMatches).not.toHaveBeenCalled();
  });

  it("captures a receipt before metadata removal and deletes only by that receipt afterward", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGetScorePdfReceipt.mockResolvedValue(RECEIPT);
    const onSongUpdate = vi.fn().mockResolvedValue(true);
    mockRemoveScorePdfIfReceiptMatches.mockResolvedValue(true);
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove: opener.pdf" }));

    await waitFor(() => expect(mockRemoveScorePdfIfReceiptMatches).toHaveBeenCalledTimes(1));
    expect(mockRemoveScorePdfIfReceiptMatches).toHaveBeenCalledWith("project-1-2", RECEIPT);
    expect(mockGetScorePdfReceipt.mock.invocationCallOrder[0]).toBeLessThan(
      onSongUpdate.mock.invocationCallOrder[0]
    );
    expect(onSongUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockRemoveScorePdfIfReceiptMatches.mock.invocationCallOrder[0]
    );
  });

  it("detaches broken metadata without inventing delete authority when storage is already absent", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGetScorePdfReceipt.mockResolvedValue(null);
    const onSongUpdate = vi.fn().mockResolvedValue(true);
    const song = makeSong([{ id: SCORE_ID, fileName: "missing.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove: missing.pdf" }));

    await waitFor(() => expect(onSongUpdate).toHaveBeenCalledTimes(1));
    expect(mockGetScorePdfReceipt).toHaveBeenCalledWith("project-1-2", SCORE_ID);
    expect(mockRemoveScorePdfIfReceiptMatches).not.toHaveBeenCalled();
  });
});
