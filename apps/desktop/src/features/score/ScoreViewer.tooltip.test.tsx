import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("../../i18n", () => ({
  detectPreferredLocale: () => "en",
  createTranslator: () => (key: string) => key,
}));

vi.mock("./pdfjs", () => ({
  loadScorePdf: vi.fn(() => ({
    // Resolve immediately to enter READY state, allowing buttons to render
    promise: Promise.resolve({
      numPages: 2,
      getPage: vi.fn(() => Promise.resolve({
        getViewport: vi.fn(() => ({ width: 800, height: 600, scale: 1 })),
        render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
      }))
    }),
    destroy: vi.fn(() => Promise.resolve()),
  })),
}));

import { ScoreViewer } from "./ScoreViewer";

test("ScoreViewer places title on wrapper when prev/next buttons are disabled", async () => {
  render(<ScoreViewer data={new Uint8Array()} />);

  // Wait for READY state
  const prevButton = await screen.findByRole("button", { name: "scoreViewerPrevPage" });
  const nextButton = await screen.findByRole("button", { name: "scoreViewerNextPage" });

  // On page 1, prev is disabled, next is enabled (since numPages = 2)
  expect(prevButton).toBeDisabled();
  expect(nextButton).not.toBeDisabled();

  // title should be on the wrapper for both
  expect(prevButton).not.toHaveAttribute("title");
  expect(nextButton).not.toHaveAttribute("title");

  const prevWrapper = prevButton.parentElement;
  const nextWrapper = nextButton.parentElement;

  expect(prevWrapper).toHaveAttribute("title", "scoreViewerPrevPage");
  expect(nextWrapper).toHaveAttribute("title", "scoreViewerNextPage");
});
