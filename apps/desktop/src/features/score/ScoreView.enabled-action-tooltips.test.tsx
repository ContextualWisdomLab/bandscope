import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RehearsalSong } from "@bandscope/shared-types";
import { ScoreView } from "./ScoreView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

vi.mock("./ScoreViewer", () => ({
  ScoreViewer: () => <div data-testid="score-viewer">Mock Viewer</div>
}));

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) =>
    ({
      scoreOpen: "Open score",
      scoreRemove: "Remove"
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

describe("ScoreView enabled action tooltips", () => {
  it("exposes localized pointer tooltips for enabled open and remove actions", () => {
    const song = {
      id: "song-1",
      title: "Test",
      scoreAttachments: [{ id: "doc1", fileName: "opener.pdf" }]
    } as RehearsalSong;

    render(<ScoreView song={song} projectId="project-1-2" onSongUpdate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Open score: opener.pdf" })).not.toHaveAttribute("title");
    expect(screen.getByRole("button", { name: "Remove: opener.pdf" })).toHaveAttribute(
      "title",
      "Remove: opener.pdf"
    );
  });
});
