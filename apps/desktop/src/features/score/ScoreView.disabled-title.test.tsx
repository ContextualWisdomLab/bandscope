import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RehearsalSong } from "@bandscope/shared-types";
import { ScoreView } from "./ScoreView";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

vi.mock("./ScoreViewer", () => ({
  ScoreViewer: () => <div data-testid="score-viewer" />
}));

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) =>
    ({
      scoreViewTitle: "Score",
      scoreViewSubtitle: "Attach validated PDF scores to the current song.",
      scoreListTitle: "Attached scores",
      scoreAttach: "Add score",
      scoreRemove: "Remove",
      scoreOpen: "Open score",
      scoreRequiresProject: "Scores attach to the active analysis project.",
      scoreNavDisabledHint: "Analyze or open a song first"
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

describe("ScoreView unavailable action hints", () => {
  it("explains why remove is unavailable when no project workspace is active", () => {
    const song = {
      id: "song-1",
      title: "Late Night Set",
      sections: [],
      exportSummary: { format: "cue-sheet", headline: "", focusSections: [] },
      scoreAttachments: [{ id: "score-1", fileName: "opener.pdf" }]
    } as RehearsalSong;

    render(<ScoreView song={song} projectId={null} onSongUpdate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Remove: opener.pdf" })).toHaveAttribute(
      "title",
      "Analyze or open a song first"
    );
  });
});
