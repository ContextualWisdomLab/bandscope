import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ScoreView } from "./ScoreView";
import type { RehearsalSong } from "@bandscope/shared-types";

vi.mock("../../i18n", () => ({
  detectPreferredLocale: () => "en",
  createTranslator: () => (key: string) => key,
}));
vi.mock("./scoreStorage", () => ({
  readScorePdf: vi.fn(),
  attachScorePdf: vi.fn(),
  removeScorePdf: vi.fn(),
}));
vi.mock("./ScoreViewer", () => ({
  ScoreViewer: () => <div data-testid="score-viewer">Viewer</div>,
}));

test("ScoreView places title on wrapper when remove button is disabled", () => {
  const song: RehearsalSong = {
    id: "song-1",
    title: "Test Song",
    scoreAttachments: [{ id: "att-1", fileName: "test.pdf" }],
  } as unknown as RehearsalSong;

  // No projectId -> buttons should be disabled
  render(<ScoreView song={song} projectId={null} onSongUpdate={vi.fn()} />);

  const removeButton = screen.getByRole("button", { name: "scoreRemove: test.pdf" });
  expect(removeButton).toBeDisabled();

  // title should be on the wrapper, NOT the button
  expect(removeButton).not.toHaveAttribute("title");

  const wrapper = removeButton.parentElement;
  expect(wrapper).toHaveAttribute("title", "scoreRemove: test.pdf");
});
