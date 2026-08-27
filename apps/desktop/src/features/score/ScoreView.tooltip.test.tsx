import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RehearsalSong } from "@bandscope/shared-types";
import { ScoreView } from "./ScoreView";

vi.mock("./ScoreViewer", () => ({
  ScoreViewer: () => <div data-testid="score-viewer" />
}));

vi.mock("./scoreStorage", () => ({
  attachScorePdf: vi.fn(),
  readScorePdf: vi.fn(),
  removeScorePdf: vi.fn()
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

const SONG: RehearsalSong = {
  id: "song-1",
  title: "Late Night Set",
  sections: [],
  exportSummary: { format: "cue-sheet", headline: "", focusSections: [] },
  scoreAttachments: [{ id: "score-1", fileName: "opener.pdf" }]
};

describe("ScoreView tooltips", () => {
  it("uses the localized remove label as the native tooltip for the icon-only action", () => {
    render(<ScoreView song={SONG} projectId="project-1" onSongUpdate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Remove: opener.pdf" })).toHaveAttribute(
      "title",
      "Remove: opener.pdf"
    );
  });
});
