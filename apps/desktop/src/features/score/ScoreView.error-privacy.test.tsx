import { fireEvent, render, screen } from "@testing-library/react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { beforeEach, expect, it, vi } from "vitest";

import { ScoreView } from "./ScoreView";
import { attachScorePdf } from "./scoreStorage";

vi.mock("./scoreStorage", () => ({
  attachScorePdf: vi.fn(),
  readScorePdf: vi.fn(),
  removeScorePdf: vi.fn()
}));

vi.mock("./ScoreViewer", () => ({
  ScoreViewer: () => <div data-testid="score-viewer" />
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
      scoreRequiresProject: "Scores attach to the active analysis project.",
      scoreNavDisabledHint: "Open an active project first."
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

const mockAttachScorePdf = vi.mocked(attachScorePdf);

function makeSong(): RehearsalSong {
  return {
    id: "song-1",
    title: "Late Night Set",
    sections: [],
    exportSummary: { format: "cue-sheet", headline: "", focusSections: [] }
  } as RehearsalSong;
}

beforeEach(() => {
  mockAttachScorePdf.mockReset();
});

it("does not render dependency-controlled score bridge secrets or local paths", async () => {
  mockAttachScorePdf.mockRejectedValueOnce(
    new Error("Failed to open /Users/Alice/private-score.pdf token=super-secret")
  );

  render(<ScoreView song={makeSong()} projectId="project-1-2" onSongUpdate={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Add score" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Could not attach the score PDF.");
  expect(alert).not.toHaveTextContent("/Users/Alice");
  expect(alert).not.toHaveTextContent("private-score.pdf");
  expect(alert).not.toHaveTextContent("token=super-secret");
});
