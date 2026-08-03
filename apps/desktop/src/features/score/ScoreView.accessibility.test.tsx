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
      scoreAttach: "Add score",
      scoreRemove: "Remove",
      scoreOpen: "Open score",
      scoreRequiresProject: "Scores attach to the active analysis project.",
      scoreNavDisabledHint: "Analyze or open a song first"
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

const song = {
  id: "song-a11y",
  title: "Accessible Set",
  sections: [],
  exportSummary: { format: "cue-sheet", headline: "", focusSections: [] },
  scoreAttachments: [
    {
      id: "score-a11y",
      fileName: "opener.pdf"
    }
  ]
} as RehearsalSong;

describe("ScoreView disabled-score accessibility", () => {
  it("references the visible disabled reason from each unavailable score button", () => {
    render(<ScoreView song={song} projectId={null} onSongUpdate={vi.fn()} />);

    const reason = screen.getByText("Scores attach to the active analysis project.");
    const openButton = screen.getByRole("button", { name: "Open score: opener.pdf" });
    const descriptionId = openButton.getAttribute("aria-describedby");

    expect(openButton).toHaveAttribute("aria-disabled", "true");
    expect(openButton).toHaveAttribute("title", "Analyze or open a song first");
    expect(descriptionId).toBe(reason.id);
    expect(descriptionId).not.toBe("");
    expect(document.getElementById(descriptionId ?? "")).toBe(reason);
  });

  it("removes disabled-only semantics when a project workspace is available", () => {
    render(<ScoreView song={song} projectId="project-a11y" onSongUpdate={vi.fn()} />);

    const openButton = screen.getByRole("button", { name: "Open score: opener.pdf" });

    expect(openButton).not.toHaveAttribute("aria-disabled");
    expect(openButton).not.toHaveAttribute("aria-describedby");
    expect(openButton).not.toHaveAttribute("title");
    expect(
      screen.queryByText("Scores attach to the active analysis project.")
    ).not.toBeInTheDocument();
  });
});
