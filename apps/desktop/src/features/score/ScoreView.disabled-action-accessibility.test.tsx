import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RehearsalSong } from "@bandscope/shared-types";
import { invoke } from "@tauri-apps/api/core";
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
  id: "song-1",
  title: "Late Night Set",
  scoreAttachments: [{ id: "score-1", fileName: "opener.pdf" }]
} as RehearsalSong;

describe("ScoreView unavailable action accessibility", () => {
  it("links focusable unavailable actions to localized recovery copy and blocks activation", () => {
    render(<ScoreView song={song} projectId={null} onSongUpdate={vi.fn()} />);

    const requirement = screen.getByText("Scores attach to the active analysis project.");
    const openButton = screen.getByRole("button", { name: "Open score: opener.pdf" });
    const removeButton = screen.getByRole("button", { name: "Remove: opener.pdf" });

    for (const button of [openButton, removeButton]) {
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAttribute("aria-describedby", requirement.id);
      expect(button).toHaveAttribute("title", "Analyze or open a song first");
      expect(button).not.toBeDisabled();
    }

    fireEvent.click(openButton);
    fireEvent.click(removeButton);
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });
});
