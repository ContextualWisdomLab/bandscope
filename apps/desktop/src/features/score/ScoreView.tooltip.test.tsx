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
      scoreOpen: "Open score",
      scoreOpening: "Opening score PDF...",
      scoreRequiresProject: "Scores attach to the active analysis project."
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

describe("ScoreView disabled control tooltips", () => {
  it("keeps the disabled remove tooltip on a non-disabled hover target", () => {
    const song = {
      id: "song-1",
      title: "Late Night Set",
      sections: [],
      exportSummary: { format: "cue-sheet", headline: "", focusSections: [] },
      scoreAttachments: [{ id: "score-1", fileName: "opener.pdf" }]
    } as RehearsalSong;

    render(<ScoreView song={song} projectId={null} onSongUpdate={vi.fn()} />);

    const remove = screen.getByRole("button", { name: "Remove: opener.pdf" });
    expect(remove).toBeDisabled();
    expect(remove.parentElement).toHaveAttribute("title", "Remove: opener.pdf");
  });
});
