import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RehearsalSong, ScoreAttachment } from "@bandscope/shared-types";
import { ScoreView } from "./ScoreView";
import { attachScorePdf, readScorePdf, removeScorePdf } from "./scoreStorage";

vi.mock("./scoreStorage", () => ({
  attachScorePdf: vi.fn(),
  readScorePdf: vi.fn(),
  removeScorePdf: vi.fn()
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
const mockReadScorePdf = vi.mocked(readScorePdf);
const mockRemoveScorePdf = vi.mocked(removeScorePdf);
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

describe("ScoreView persistence outcome ordering", () => {
  beforeEach(() => {
    mockAttachScorePdf.mockReset();
    mockReadScorePdf.mockReset();
    mockRemoveScorePdf.mockReset();
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
    expect(mockRemoveScorePdf).not.toHaveBeenCalled();
    expect(screen.getByTestId("score-viewer")).toHaveTextContent("no-data");
  });

  it("does not delete score bytes when durable metadata removal is rejected", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSongUpdate = vi.fn().mockResolvedValue(false);
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove: opener.pdf" }));

    await waitFor(() => expect(onSongUpdate).toHaveBeenCalledTimes(1));
    expect(mockRemoveScorePdf).not.toHaveBeenCalled();
  });

  it("commits metadata removal before deleting the stored score object", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSongUpdate = vi.fn().mockResolvedValue(true);
    mockRemoveScorePdf.mockResolvedValue(true);
    const song = makeSong([{ id: SCORE_ID, fileName: "opener.pdf" }]);

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={onSongUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove: opener.pdf" }));

    await waitFor(() => expect(mockRemoveScorePdf).toHaveBeenCalledTimes(1));
    expect(onSongUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockRemoveScorePdf.mock.invocationCallOrder[0]
    );
  });
});
