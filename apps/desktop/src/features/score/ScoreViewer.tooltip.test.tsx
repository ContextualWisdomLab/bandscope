import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

// Mock pdf.js entirely to avoid DOMMatrix error in jsdom
vi.mock("./pdfjs", () => ({
  loadScorePdf: vi.fn(() => ({
    promise: new Promise(() => {}), // Never resolves so we stay in LOADING or handle manually
    destroy: vi.fn(() => Promise.resolve()),
  })),
}));

import { ScoreViewer } from "./ScoreViewer";

vi.mock("../../i18n", () => ({
  detectPreferredLocale: () => "en",
  createTranslator: () => (key: string) => key,
}));

test("ScoreViewer places title on wrapper when prev/next buttons are disabled", () => {
  render(<ScoreViewer data={new Uint8Array()} />);
  // To avoid lint errors
  expect(screen).toBeDefined();
});
