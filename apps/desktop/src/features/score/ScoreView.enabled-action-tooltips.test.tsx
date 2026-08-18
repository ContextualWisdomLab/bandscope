import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RehearsalSong } from "@bandscope/shared-types";
import { ScoreView } from "./ScoreView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
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
      scoreNavDisabledHint: "Analyze or open a song first"
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

const song = {
  id: "song-1",
  title: "Late Night Set",
  sections: [],
  exportSummary: { format: "cue-sheet", headline: "", focusSections: [] },
  scoreAttachments: [
    { id: "3f2c8f0e-1a2b-4c3d-8e9f-001122334455", fileName: "opener.pdf" }
  ]
} as RehearsalSong;

describe("ScoreView enabled action tooltips", () => {
  it("exposes localized pointer tooltips for enabled open and remove actions", () => {
    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Open score: opener.pdf" })).toHaveAttribute(
      "title",
      "Open score: opener.pdf"
    );
    expect(screen.getByRole("button", { name: "Remove: opener.pdf" })).toHaveAttribute(
      "title",
      "Remove: opener.pdf"
    );
  });
});
