import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { ScoreViewer } from "./ScoreViewer";
import { loadScorePdf } from "./pdfjs";

vi.mock("./pdfjs", () => ({
  loadScorePdf: vi.fn()
}));

vi.mock("../../i18n", () => ({
  createTranslator: () => (translationKey: string) =>
    ({
      scoreViewerEmpty: "No score PDF attached. Attach a validated score PDF to view it here.",
      scoreViewerLoading: "Loading score PDF...",
      scoreViewerFailedTitle: "Could not display the score",
      scoreViewerRetry: "Retry",
      scoreViewerPrevPage: "Previous page",
      scoreViewerNextPage: "Next page",
      scoreViewerPageIndicator: "Page {current} of {total}",
      scoreViewerZoomIn: "Zoom in",
      scoreViewerZoomOut: "Zoom out",
      scoreViewerFitWidth: "Fit width"
    })[translationKey] ?? translationKey,
  detectPreferredLocale: () => "en"
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createFakePage(renderPromise: Promise<void> = Promise.resolve()) {
  const renderTask = { promise: renderPromise, cancel: vi.fn() };
  return {
    renderTask,
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale
    })),
    render: vi.fn(() => renderTask)
  };
}

function createFakeDocument(pageCount = 3, pdfPage = createFakePage()) {
  return {
    pdfPage,
    pdfDocument: {
      numPages: pageCount,
      getPage: vi.fn(() => Promise.resolve(pdfPage))
    } as unknown as PDFDocumentProxy
  };
}

function mockLoadTaskOnce(
  loadingPromise: Promise<unknown>,
  destroyCallback: () => Promise<void> = () => Promise.resolve()
) {
  const destroyMock = vi.fn(destroyCallback);
  vi.mocked(loadScorePdf).mockReturnValueOnce({
    promise: loadingPromise,
    destroy: destroyMock
  } as unknown as PDFDocumentLoadingTask);
  return { destroyMock };
}

const SAMPLE_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

describe("ScoreViewer", () => {
  beforeEach(() => {
    vi.mocked(loadScorePdf).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the empty placeholder without loading when no score PDF bytes are attached", () => {
    const onStatusChange = vi.fn();
    render(<ScoreViewer scorePdfBytes={null} onStatusChange={onStatusChange} />);

    expect(
      screen.getByText("No score PDF attached. Attach a validated score PDF to view it here.")
    ).toBeInTheDocument();
    expect(loadScorePdf).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("transitions from LOADING to READY and renders the first page", async () => {
    const deferred = createDeferred<PDFDocumentProxy>();
    mockLoadTaskOnce(deferred.promise);
    const { pdfDocument, pdfPage } = createFakeDocument(3);
    const onStatusChange = vi.fn();

    render(<ScoreViewer scorePdfBytes={SAMPLE_BYTES} onStatusChange={onStatusChange} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Loading score PDF...")).toBeInTheDocument();
    expect(onStatusChange).toHaveBeenLastCalledWith("LOADING");
    expect(loadScorePdf).toHaveBeenCalledWith(SAMPLE_BYTES);

    await act(async () => {
      deferred.resolve(pdfDocument);
    });

    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    expect(onStatusChange).toHaveBeenLastCalledWith("READY");
    await waitFor(() => {
      expect(pdfPage.render).toHaveBeenCalled();
    });
    expect(pdfPage.getViewport).toHaveBeenCalledWith({ scale: 1 });
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("shows the file name when provided", async () => {
    const { pdfDocument } = createFakeDocument(1);
    mockLoadTaskOnce(Promise.resolve(pdfDocument));

    render(<ScoreViewer scorePdfBytes={SAMPLE_BYTES} fileName="setlist-opener.pdf" />);

    expect(await screen.findByText("setlist-opener.pdf")).toBeInTheDocument();
  });

  it("transitions to FAILED with the error message and recovers on retry", async () => {
    mockLoadTaskOnce(Promise.reject(new Error("broken bytes")));
    const { pdfDocument } = createFakeDocument(2);
    mockLoadTaskOnce(Promise.resolve(pdfDocument));
    const onStatusChange = vi.fn();

    render(<ScoreViewer scorePdfBytes={SAMPLE_BYTES} onStatusChange={onStatusChange} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Could not display the score")).toBeInTheDocument();
    expect(screen.getByText("broken bytes")).toBeInTheDocument();
    // The FAILED status is set from the load promise's catch (a microtask), and
    // onStatusChange fires from a passive effect that may not have flushed the
    // instant the alert appears. Poll for it, matching the READY assertion below.
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith("FAILED"));

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith("READY"));
    expect(loadScorePdf).toHaveBeenCalledTimes(2);
  });

  it("stringifies non-Error load failures", async () => {
    mockLoadTaskOnce(Promise.reject("password protected"));

    render(<ScoreViewer scorePdfBytes={SAMPLE_BYTES} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("password protected")).toBeInTheDocument();
  });

  it("navigates pages and clamps at both bounds", async () => {
    const { pdfDocument } = createFakeDocument(3);
    mockLoadTaskOnce(Promise.resolve(pdfDocument));

    render(<ScoreViewer scorePdfBytes={SAMPLE_BYTES} />);

    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    const previousButton = screen.getByRole("button", { name: "Previous page" });
    const nextButton = screen.getByRole("button", { name: "Next page" });
    expect(previousButton).toBeDisabled();

    fireEvent.click(nextButton);
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

    fireEvent.click(nextButton);
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
    expect(nextButton).toBeDisabled();

    await waitFor(() => {
      expect(pdfDocument.getPage).toHaveBeenCalledWith(3);
    });

    fireEvent.click(previousButton);
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    await waitFor(() => {
      expect(pdfDocument.getPage).toHaveBeenCalledWith(2);
    });
  });

  it("zooms in and out with clamping and returns to fit-width", async () => {
    const { pdfDocument, pdfPage } = createFakeDocument(1);
    mockLoadTaskOnce(Promise.resolve(pdfDocument));

    render(<ScoreViewer scorePdfBytes={SAMPLE_BYTES} />);

    expect(await screen.findByText("Page 1 of 1")).toBeInTheDocument();
    const zoomInButton = screen.getByRole("button", { name: "Zoom in" });
    const zoomOutButton = screen.getByRole("button", { name: "Zoom out" });
    const fitWidthButton = screen.getByRole("button", { name: "Fit width" });
    expect(fitWidthButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(zoomInButton);
    expect(fitWidthButton).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => {
      expect(pdfPage.getViewport).toHaveBeenCalledWith({ scale: 1.25 });
    });

    for (let zoomClickCount = 0; zoomClickCount < 8; zoomClickCount += 1) {
      fireEvent.click(zoomInButton);
    }
    await waitFor(() => {
      expect(pdfPage.getViewport).toHaveBeenCalledWith({ scale: 4 });
    });

    for (let zoomClickCount = 0; zoomClickCount < 12; zoomClickCount += 1) {
      fireEvent.click(zoomOutButton);
    }
    await waitFor(() => {
      expect(pdfPage.getViewport).toHaveBeenCalledWith({ scale: 0.5 });
    });

    fireEvent.click(fitWidthButton);
    expect(fitWidthButton).toHaveAttribute("aria-pressed", "true");
  });

  it("re-renders at fit-width scale when the container resizes", async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    class FakeResizeObserver {
      constructor(resizeObserverCallback: ResizeObserverCallback) {
        resizeCallback = resizeObserverCallback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);

    const { pdfDocument, pdfPage } = createFakeDocument(1);
    mockLoadTaskOnce(Promise.resolve(pdfDocument));

    render(<ScoreViewer scorePdfBytes={SAMPLE_BYTES} />);

    expect(await screen.findByText("Page 1 of 1")).toBeInTheDocument();

    // The ResizeObserver is registered by a READY-gated effect that commits
    // after the "Page 1 of 1" text appears. Wait for that effect to capture the
    // callback before driving a resize; otherwise the optional call below is a
    // silent no-op and the fit-width recompute never runs.
    await waitFor(() => {
      expect(resizeCallback).not.toBeNull();
    });

    // Wrap the resize in an async act() so the resulting re-render and its async
    // getPage()/getViewport() calls flush deterministically before we assert.
    await act(async () => {
      resizeCallback?.(
        [{ contentRect: { width: 300 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

    await waitFor(() => {
      expect(pdfPage.getViewport).toHaveBeenCalledWith({ scale: 0.5 });
    });
  });

  it("keeps the READY layout when a page render is cancelled mid-flight", async () => {
    const renderFailure = Promise.reject(new Error("Rendering cancelled"));
    renderFailure.catch(() => undefined);
    const pdfPage = createFakePage(renderFailure);
    const { pdfDocument } = createFakeDocument(1, pdfPage);
    mockLoadTaskOnce(Promise.resolve(pdfDocument));

    render(<ScoreViewer scorePdfBytes={SAMPLE_BYTES} />);

    expect(await screen.findByText("Page 1 of 1")).toBeInTheDocument();
    await waitFor(() => {
      expect(pdfPage.render).toHaveBeenCalled();
    });
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });

  it("keeps the READY layout when fetching a page fails after load", async () => {
    const pdfDocument = {
      numPages: 1,
      getPage: vi.fn(() => Promise.reject(new Error("destroyed")))
    } as unknown as PDFDocumentProxy;
    mockLoadTaskOnce(Promise.resolve(pdfDocument));

    render(<ScoreViewer scorePdfBytes={SAMPLE_BYTES} />);

    expect(await screen.findByText("Page 1 of 1")).toBeInTheDocument();
    await waitFor(() => {
      expect(pdfDocument.getPage).toHaveBeenCalled();
    });
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });

  it("destroys the loading task on unmount and ignores late results", async () => {
    const deferred = createDeferred<PDFDocumentProxy>();
    const { destroyMock } = mockLoadTaskOnce(deferred.promise, () =>
      Promise.reject(new Error("already destroyed"))
    );
    const onStatusChange = vi.fn();

    const { unmount } = render(
      <ScoreViewer scorePdfBytes={SAMPLE_BYTES} onStatusChange={onStatusChange} />
    );
    unmount();

    expect(destroyMock).toHaveBeenCalledTimes(1);

    const { pdfDocument } = createFakeDocument(1);
    await act(async () => {
      deferred.resolve(pdfDocument);
    });
    expect(onStatusChange).not.toHaveBeenCalledWith("READY");
  });

  it("ignores a late failure after unmount", async () => {
    const deferred = createDeferred<PDFDocumentProxy>();
    mockLoadTaskOnce(deferred.promise);
    const onStatusChange = vi.fn();

    const { unmount } = render(
      <ScoreViewer scorePdfBytes={SAMPLE_BYTES} onStatusChange={onStatusChange} />
    );
    unmount();

    await act(async () => {
      deferred.reject(new Error("too late"));
    });
    expect(onStatusChange).not.toHaveBeenCalledWith("FAILED");
  });
});
