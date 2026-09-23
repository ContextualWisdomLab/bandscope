import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("uses the shared tooltip while keeping a persistent assistive boundary reason", async () => {
    render(<ScoreViewer data={SAMPLE_BYTES} />);

    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    const previousButton = screen.getByRole("button", { name: "Previous page" });
    const nextButton = screen.getByRole("button", { name: "Next page" });
    const previousDescriptionId = previousButton.getAttribute("aria-describedby");

    expect(previousButton).toHaveAttribute("aria-disabled", "true");
    expect(previousButton).not.toBeDisabled();
    expect(previousButton).not.toHaveAttribute("title");
    expect(previousDescriptionId).toBeTruthy();
    expect(document.getElementById(previousDescriptionId ?? "")).toHaveTextContent(
      "Already at the first page"
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(previousButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Previous page: Already at the first page"
    );

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
    expect(previousButton).toHaveAttribute("aria-describedby", previousDescriptionId ?? undefined);
    expect(document.getElementById(previousDescriptionId ?? "")).toHaveTextContent(
      "Already at the first page"
    );

    fireEvent.click(previousButton);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();

    fireEvent.mouseMove(nextButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Next page");
    fireEvent.mouseLeave(nextButton);

    fireEvent.click(nextButton);
    fireEvent.click(nextButton);
    expect(await screen.findByText("Page 3 of 3")).toBeInTheDocument();

    const nextDescriptionId = nextButton.getAttribute("aria-describedby");
    expect(nextButton).toHaveAttribute("aria-disabled", "true");
    expect(nextButton).not.toBeDisabled();
    expect(nextDescriptionId).toBeTruthy();
    expect(document.getElementById(nextDescriptionId ?? "")).toHaveTextContent(
      "Already at the last page"
    );
  });
});
