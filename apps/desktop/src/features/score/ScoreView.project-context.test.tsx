import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RehearsalSong } from "@bandscope/shared-types";
import { ScoreView } from "./ScoreView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

vi.mock("./ScoreViewer", () => ({
  ScoreViewer: () => <div data-testid="score-viewer">score viewer</div>
}));

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) =>
    ({
      scoreViewTitle: "Score",
      scoreViewSubtitle: "Attach validated PDF scores to the current song.",
      scoreListTitle: "Attached scores",
      scoreListEmpty: "Add a score to read it during rehearsal.",
      scoreAttach: "Add score",
      scoreRequiresProject:
        "Scores attach to the active analysis project. Analyze local audio or a YouTube import first."
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

function makeSong(): RehearsalSong {
  return {
    id: "song-1",
    title: "Late Night Set",
    sections: [],
    exportSummary: { format: "cue-sheet", headline: "", focusSections: [] }
  } as RehearsalSong;
}

describe("ScoreView project authority", () => {
  it("names analyze-first instead of unavailable score actions without a project", () => {
    render(<ScoreView song={makeSong()} projectId={null} onSongUpdate={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Analyze local audio or a YouTube import first."
    );
    expect(screen.queryByText("Add a score to read it during rehearsal.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("score-viewer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add score" })).toBeDisabled();
  });
});
