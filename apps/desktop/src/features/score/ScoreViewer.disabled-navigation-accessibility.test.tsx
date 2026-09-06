import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
      scoreViewerFitWidth: "Fit width",
      scoreViewerPrevPageDisabled: "Already at the first page",
      scoreViewerNextPageDisabled: "Already at the last page"
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

const SAMPLE_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function createFakeDocument(): PDFDocumentProxy {
  const page = {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale
    })),
    render: vi.fn(() => ({
      promise: Promise.resolve(),
      cancel: vi.fn()
    }))
  };

  return {
    numPages: 3,
    getPage: vi.fn(() => Promise.resolve(page))
  } as unknown as PDFDocumentProxy;
}

describe("ScoreViewer disabled page navigation accessibility", () => {
  beforeEach(() => {
    vi.mocked(loadScorePdf).mockReset();
    vi.mocked(loadScorePdf).mockReturnValue({
      promise: Promise.resolve(createFakeDocument()),
      destroy: vi.fn(() => Promise.resolve())
    } as unknown as PDFDocumentLoadingTask);
  });

  it("keeps boundary reasons hoverable, focusable, and dismissible with Escape", async () => {
    render(<ScoreViewer data={SAMPLE_BYTES} />);

    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    const previousButton = screen.getByRole("button", { name: "Previous page" });
    const nextButton = screen.getByRole("button", { name: "Next page" });
    const previousDescriptionId = previousButton.getAttribute("aria-describedby");

    expect(previousButton).toHaveAttribute("aria-disabled", "true");
    expect(previousButton).not.toHaveAttribute("title");
    expect(previousDescriptionId).toBeTruthy();

    const previousReason = screen.getByRole("tooltip");
    expect(previousReason).toHaveAttribute("id", previousDescriptionId);
    expect(previousReason).toHaveTextContent("Already at the first page");
    expect(previousReason).toHaveClass(
      "group-hover:opacity-100",
      "group-focus-within:opacity-100",
      "motion-reduce:transition-none",
      "pointer-events-none",
      "group-hover:pointer-events-auto",
      "group-focus-within:pointer-events-auto"
    );
    expect(previousReason).not.toHaveClass("mb-2");
    previousButton.focus();
    expect(previousButton).toHaveFocus();
    expect(nextButton).not.toHaveAttribute("aria-describedby");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(previousButton).not.toHaveAttribute("aria-describedby");

    previousButton.blur();
    previousButton.focus();
    expect(previousButton).toHaveAttribute("aria-describedby");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Already at the first page");

    fireEvent.click(nextButton);
    fireEvent.click(nextButton);
    expect(await screen.findByText("Page 3 of 3")).toBeInTheDocument();

    const nextDescriptionId = nextButton.getAttribute("aria-describedby");
    expect(nextButton).toHaveAttribute("aria-disabled", "true");
    expect(nextButton).not.toHaveAttribute("title");
    expect(nextDescriptionId).toBeTruthy();

    const nextReason = screen.getByRole("tooltip");
    expect(nextReason).toHaveAttribute("id", nextDescriptionId);
    expect(nextReason).toHaveTextContent("Already at the last page");
    expect(nextReason).toHaveClass(
      "group-hover:opacity-100",
      "group-focus-within:opacity-100",
      "motion-reduce:transition-none",
      "pointer-events-none",
      "group-hover:pointer-events-auto",
      "group-focus-within:pointer-events-auto"
    );
    expect(nextReason).not.toHaveClass("mb-2");
    nextButton.focus();
    expect(nextButton).toHaveFocus();
    expect(previousButton).not.toHaveAttribute("aria-describedby");
  });
});