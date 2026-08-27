import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { ScoreViewer } from "./ScoreViewer";
import { loadScorePdf } from "./pdfjs";

vi.mock("./pdfjs", () => ({
  loadScorePdf: vi.fn()
}));

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) =>
    ({
      scoreViewerPrevPage: "Previous page",
      scoreViewerNextPage: "Next page",
      scoreViewerPageIndicator: "Page {current} of {total}",
      scoreViewerZoomIn: "Zoom in",
      scoreViewerZoomOut: "Zoom out",
      scoreViewerFitWidth: "Fit width"
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

const SAMPLE_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

describe("ScoreViewer disabled control tooltips", () => {
  it("keeps pagination tooltips on a non-disabled hover target", async () => {
    const renderTask = { promise: Promise.resolve(), cancel: vi.fn() };
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale })),
      render: vi.fn(() => renderTask)
    };
    const doc = {
      numPages: 2,
      getPage: vi.fn(() => Promise.resolve(page))
    } as unknown as PDFDocumentProxy;
    vi.mocked(loadScorePdf).mockReturnValue({
      promise: Promise.resolve(doc),
      destroy: vi.fn(() => Promise.resolve())
    } as unknown as PDFDocumentLoadingTask);

    render(<ScoreViewer data={SAMPLE_BYTES} />);

    await act(async () => {
      expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    });

    const previous = screen.getByRole("button", { name: "Previous page" });
    const next = screen.getByRole("button", { name: "Next page" });
    expect(previous).toBeDisabled();
    expect(previous.parentElement).toHaveAttribute("title", "Previous page");
    expect(next.parentElement).toHaveAttribute("title", "Next page");
  });
});
