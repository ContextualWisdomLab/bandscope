import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileMusic,
  Loader2,
  MoveHorizontal,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadScorePdf } from "./pdfjs";

/** Viewer lifecycle states following the clearfolio LOADING/FAILED/READY contract. */
export type ScoreViewerStatus = "LOADING" | "FAILED" | "READY";

/** Props accepted by the score PDF viewer. */
export interface ScoreViewerProps {
  /**
   * Validated score PDF bytes to display, or `null` when no score is
   * attached. Following the validated-resource-only rule the viewer never
   * loads arbitrary URLs; callers (PR3 wires Tauri `read_score_pdf`) must
   * hand it bytes they already validated.
   */
  scorePdfBytes: Uint8Array | null;
  /** Optional display name of the attached score file. */
  fileName?: string;
  /** Optional observer notified on every LOADING/FAILED/READY transition. */
  onStatusChange?: (viewerStatus: ScoreViewerStatus) => void;
}

const ZOOM_STEP = 1.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

/**
 * Render a score PDF from validated in-memory bytes with pdf.js.
 *
 * Implements the clearfolio viewer state machine (LOADING spinner, FAILED
 * error with retry, READY canvas) plus rehearsal-friendly page navigation
 * and zoom in/out/fit-width controls.
 */
export function ScoreViewer({ scorePdfBytes, fileName, onStatusChange }: ScoreViewerProps) {
  const scoreTranslator = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const [viewerStatus, setViewerStatus] = useState<ScoreViewerStatus>("LOADING");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scorePdfBytes !== null) {
      onStatusChange?.(viewerStatus);
    }
  }, [scorePdfBytes, viewerStatus, onStatusChange]);

  useEffect(() => {
    if (scorePdfBytes === null) {
      return;
    }

    let cancelled = false;
    setViewerStatus("LOADING");
    setErrorMessage(null);
    setPdfDocument(null);

    const loadingTask = loadScorePdf(scorePdfBytes);
    loadingTask.promise
      .then((loadedDocument) => {
        if (cancelled) {
          return;
        }
        setPdfDocument(loadedDocument);
        setPageCount(loadedDocument.numPages);
        setPageNumber(1);
        setViewerStatus("READY");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setViewerStatus("FAILED");
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy().catch(() => undefined);
    };
  }, [scorePdfBytes, retryToken]);

  useEffect(() => {
    const viewerContainer = containerRef.current;
    if (
      viewerStatus !== "READY" ||
      !viewerContainer ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(viewerContainer);
    return () => resizeObserver.disconnect();
  }, [viewerStatus]);

  useEffect(() => {
    const scoreCanvas = canvasRef.current;
    if (viewerStatus !== "READY" || !pdfDocument || !scoreCanvas) {
      return;
    }

    let cancelled = false;
    let renderTask: RenderTask | null = null;

    pdfDocument
      .getPage(pageNumber)
      .then((pdfPage) => {
        if (cancelled) {
          return;
        }
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const viewportScale =
          fitWidth && containerWidth > 0 ? containerWidth / baseViewport.width : zoomScale;
        const pageViewport = pdfPage.getViewport({ scale: viewportScale });
        scoreCanvas.width = Math.floor(pageViewport.width);
        scoreCanvas.height = Math.floor(pageViewport.height);
        renderTask = pdfPage.render({ canvas: scoreCanvas, viewport: pageViewport });
        renderTask.promise.catch(() => {
          // Cancelled renders (rapid page/zoom changes) are expected.
        });
      })
      .catch(() => {
        // The document was destroyed mid-flight; the load effect owns errors.
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [viewerStatus, pdfDocument, pageNumber, zoomScale, fitWidth, containerWidth]);

  /** Move to the previous page, clamped at the first page. */
  const goToPreviousPage = () => {
    setPageNumber((current) => Math.max(1, current - 1));
  };

  /** Move to the next page, clamped at the last page. */
  const goToNextPage = () => {
    setPageNumber((current) => Math.min(pageCount, current + 1));
  };

  /** Switch to manual zoom and enlarge, clamped at the maximum scale. */
  const zoomIn = () => {
    setFitWidth(false);
    setZoomScale((current) => Math.min(MAX_ZOOM, current * ZOOM_STEP));
  };

  /** Switch to manual zoom and shrink, clamped at the minimum scale. */
  const zoomOut = () => {
    setFitWidth(false);
    setZoomScale((current) => Math.max(MIN_ZOOM, current / ZOOM_STEP));
  };

  /** Re-enable fit-width so the page tracks the container size. */
  const fitToWidth = () => {
    setFitWidth(true);
  };

  /** Re-run the load state machine with the same validated bytes. */
  const retryPdfLoad = () => {
    setRetryToken((current) => current + 1);
  };

  if (scorePdfBytes === null) {
    return (
      <Card className="border-2 border-dashed border-cyan-300/20 bg-slate-950/50 backdrop-blur-xl">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full border border-cyan-300/30 bg-cyan-300/10 p-4 text-cyan-200">
            <FileMusic className="size-8" aria-hidden="true" />
          </div>
          <p className="max-w-sm text-slate-400">{scoreTranslator("scoreViewerEmpty")}</p>
        </CardContent>
      </Card>
    );
  }

  if (viewerStatus === "LOADING") {
    return (
      <Card
        className="border-cyan-300/20 bg-slate-950/75 backdrop-blur-xl"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 className="mb-4 size-10 animate-spin text-cyan-300" aria-hidden="true" />
          <p className="animate-pulse text-slate-400">{scoreTranslator("scoreViewerLoading")}</p>
        </CardContent>
      </Card>
    );
  }

  if (viewerStatus === "FAILED") {
    return (
      <Card
        className="border-rose-300/30 bg-rose-950/40 backdrop-blur-xl"
        role="alert"
        aria-live="assertive"
      >
        <CardContent className="flex flex-col items-center justify-center py-14 text-center">
          <div className="mb-4 rounded-full border border-rose-300/30 bg-rose-300/10 p-4 text-rose-200">
            <AlertCircle className="size-8" aria-hidden="true" />
          </div>
          <h3 className="mb-2 text-lg font-black text-rose-100">
            {scoreTranslator("scoreViewerFailedTitle")}
          </h3>
          {errorMessage && (
            <p className="mb-4 rounded-md bg-rose-300/10 px-4 py-2 text-sm font-medium text-rose-100">
              {errorMessage}
            </p>
          )}
          <Button variant="outline" className="h-12 min-w-32 text-base" onClick={retryPdfLoad}>
            <RotateCw aria-hidden="true" />
            {scoreTranslator("scoreViewerRetry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const pageIndicator = scoreTranslator("scoreViewerPageIndicator")
    .replace("{current}", String(pageNumber))
    .replace("{total}", String(pageCount));

  return (
    <Card className="border-cyan-300/20 bg-slate-950/75 backdrop-blur-xl">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {fileName && (
            <div className="flex min-w-0 items-center text-sm font-semibold text-slate-200">
              <FileMusic className="mr-2 size-4 shrink-0 text-cyan-300" aria-hidden="true" />
              <span className="truncate">{fileName}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon-lg"
              className="size-12"
              aria-label={scoreTranslator("scoreViewerZoomOut")}
              onClick={zoomOut}
            >
              <ZoomOut aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon-lg"
              className="size-12"
              aria-label={scoreTranslator("scoreViewerZoomIn")}
              onClick={zoomIn}
            >
              <ZoomIn aria-hidden="true" />
            </Button>
            <Button
              variant={fitWidth ? "secondary" : "outline"}
              className="h-12 px-4 text-base"
              aria-label={scoreTranslator("scoreViewerFitWidth")}
              aria-pressed={fitWidth}
              onClick={fitToWidth}
            >
              <MoveHorizontal aria-hidden="true" />
              {scoreTranslator("scoreViewerFitWidth")}
            </Button>
          </div>
        </div>
        <div ref={containerRef} className="overflow-auto rounded-lg border border-white/10 bg-slate-900/60">
          <canvas ref={canvasRef} className="mx-auto block max-w-none" />
        </div>
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon-lg"
            className="size-14"
            aria-label={scoreTranslator("scoreViewerPrevPage")}
            disabled={pageNumber <= 1}
            onClick={goToPreviousPage}
          >
            <ChevronLeft className="size-6" aria-hidden="true" />
          </Button>
          <span className="min-w-28 text-center text-sm font-semibold text-slate-200">
            {pageIndicator}
          </span>
          <Button
            variant="outline"
            size="icon-lg"
            className="size-14"
            aria-label={scoreTranslator("scoreViewerNextPage")}
            disabled={pageNumber >= pageCount}
            onClick={goToNextPage}
          >
            <ChevronRight className="size-6" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
