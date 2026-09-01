import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  data: Uint8Array | null;
  /** Optional display name of the attached score file. */
  fileName?: string;
  /** Optional observer notified on every LOADING/FAILED/READY transition. */
  onStatusChange?: (status: ScoreViewerStatus) => void;
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
export function ScoreViewer({ data, fileName, onStatusChange }: ScoreViewerProps) {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const previousDisabledDescriptionId = useId();
  const nextDisabledDescriptionId = useId();
  const [status, setStatus] = useState<ScoreViewerStatus>("LOADING");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (data !== null) {
      onStatusChange?.(status);
    }
  }, [data, status, onStatusChange]);

  useEffect(() => {
    if (data === null) {
      return;
    }

    let cancelled = false;
    setStatus("LOADING");
    setErrorMessage(null);
    setPdfDocument(null);

    const loadingTask = loadScorePdf(data);
    loadingTask.promise
      .then((loadedDocument) => {
        if (cancelled) {
          return;
        }
        setPdfDocument(loadedDocument);
        setPageCount(loadedDocument.numPages);
        setPageNumber(1);
        setStatus("READY");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setStatus("FAILED");
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy().catch(() => undefined);
    };
  }, [data, retryToken]);

  useEffect(() => {
    const container = containerRef.current;
    if (status !== "READY" || !container || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (status !== "READY" || !pdfDocument || !canvas) {
      return;
    }

    let cancelled = false;
    let renderTask: RenderTask | null = null;

    pdfDocument
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) {
          return;
        }
        const baseViewport = page.getViewport({ scale: 1 });
        const scale =
          fitWidth && containerWidth > 0 ? containerWidth / baseViewport.width : zoom;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        renderTask = page.render({ canvas, viewport });
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
  }, [status, pdfDocument, pageNumber, zoom, fitWidth, containerWidth]);

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
    setZoom((current) => Math.min(MAX_ZOOM, current * ZOOM_STEP));
  };

  /** Switch to manual zoom and shrink, clamped at the minimum scale. */
  const zoomOut = () => {
    setFitWidth(false);
    setZoom((current) => Math.max(MIN_ZOOM, current / ZOOM_STEP));
  };

  /** Re-enable fit-width so the page tracks the container size. */
  const fitToWidth = () => {
    setFitWidth(true);
  };

  /** Re-run the load state machine with the same validated bytes. */
  const retry = () => {
    setRetryToken((current) => current + 1);
  };

  if (data === null) {
    return (
      <Card className="border-2 border-dashed border-cyan-300/20 bg-slate-950/50 backdrop-blur-xl">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full border border-cyan-300/30 bg-cyan-300/10 p-4 text-cyan-200">
            <FileMusic className="size-8" aria-hidden="true" />
          </div>
          <p className="max-w-sm text-slate-400">{t("scoreViewerEmpty")}</p>
        </CardContent>
      </Card>
    );
  }

  if (status === "LOADING") {
    return (
      <Card
        className="border-cyan-300/20 bg-slate-950/75 backdrop-blur-xl"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 className="mb-4 size-10 animate-spin text-cyan-300" aria-hidden="true" />
          <p className="animate-pulse text-slate-400">{t("scoreViewerLoading")}</p>
        </CardContent>
      </Card>
    );
  }

  if (status === "FAILED") {
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
          <h3 className="mb-2 text-lg font-black text-rose-100">{t("scoreViewerFailedTitle")}</h3>
          {errorMessage && (
            <p className="mb-4 rounded-md bg-rose-300/10 px-4 py-2 text-sm font-medium text-rose-100">
              {errorMessage}
            </p>
          )}
          <Button variant="outline" className="h-12 min-w-32 text-base" onClick={retry}>
            <RotateCw aria-hidden="true" />
            {t("scoreViewerRetry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const pageIndicator = t("scoreViewerPageIndicator")
    .replace("{current}", String(pageNumber))
    .replace("{total}", String(pageCount));
  const previousPageUnavailable = pageNumber <= 1;
  const nextPageUnavailable = pageNumber >= pageCount;
  const unavailableReasonClassName =
    "pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-48 -translate-x-1/2 rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-center text-xs text-slate-100 opacity-0 shadow-lg transition-opacity motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100";

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
              aria-label={t("scoreViewerZoomOut")}
              title={t("scoreViewerZoomOut")}
              onClick={zoomOut}
            >
              <ZoomOut aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon-lg"
              className="size-12"
              aria-label={t("scoreViewerZoomIn")}
              title={t("scoreViewerZoomIn")}
              onClick={zoomIn}
            >
              <ZoomIn aria-hidden="true" />
            </Button>
            <Button
              variant={fitWidth ? "secondary" : "outline"}
              className="h-12 px-4 text-base"
              aria-label={t("scoreViewerFitWidth")}
              title={t("scoreViewerFitWidth")}
              aria-pressed={fitWidth}
              onClick={fitToWidth}
            >
              <MoveHorizontal aria-hidden="true" />
              {t("scoreViewerFitWidth")}
            </Button>
          </div>
        </div>
        <div ref={containerRef} className="overflow-auto rounded-lg border border-white/10 bg-slate-900/60">
          <canvas ref={canvasRef} className="mx-auto block max-w-none" />
        </div>
        <div className="flex items-center justify-center gap-4">
          <span className="group relative inline-flex">
            <Button
              variant="outline"
              size="icon-lg"
              className="size-14 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              aria-label={t("scoreViewerPrevPage")}
              aria-describedby={
                previousPageUnavailable ? previousDisabledDescriptionId : undefined
              }
              title={previousPageUnavailable ? undefined : t("scoreViewerPrevPage")}
              aria-disabled={previousPageUnavailable}
              onClick={(e) => {
                if (previousPageUnavailable) {
                  e.preventDefault();
                } else {
                  goToPreviousPage();
                }
              }}
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </Button>
            {previousPageUnavailable && (
              <span
                id={previousDisabledDescriptionId}
                role="tooltip"
                className={unavailableReasonClassName}
              >
                {t("scoreViewerPrevPageDisabled")}
              </span>
            )}
          </span>
          <span className="min-w-28 text-center text-sm font-semibold text-slate-200">
            {pageIndicator}
          </span>
          <span className="group relative inline-flex">
            <Button
              variant="outline"
              size="icon-lg"
              className="size-14 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              aria-label={t("scoreViewerNextPage")}
              aria-describedby={nextPageUnavailable ? nextDisabledDescriptionId : undefined}
              title={nextPageUnavailable ? undefined : t("scoreViewerNextPage")}
              aria-disabled={nextPageUnavailable}
              onClick={(e) => {
                if (nextPageUnavailable) {
                  e.preventDefault();
                } else {
                  goToNextPage();
                }
              }}
            >
              <ChevronRight className="size-6" aria-hidden="true" />
            </Button>
            {nextPageUnavailable && (
              <span
                id={nextDisabledDescriptionId}
                role="tooltip"
                className={unavailableReasonClassName}
              >
                {t("scoreViewerNextPageDisabled")}
              </span>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}