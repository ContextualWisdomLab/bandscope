import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask } from "pdfjs-dist";
import scorePdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * Point pdf.js at the locally bundled worker asset.
 *
 * The worker URL is resolved by Vite from the pinned `pdfjs-dist` package at
 * build time and emitted as a same-origin asset, so it satisfies the Tauri
 * `script-src 'self'` Content Security Policy. No CDN or remote script is
 * ever referenced.
 */
export function configureScorePdfWorker(): void {
  if (GlobalWorkerOptions.workerSrc !== scorePdfWorkerUrl) {
    GlobalWorkerOptions.workerSrc = scorePdfWorkerUrl;
  }
}

/**
 * Start parsing validated in-memory score PDF bytes with pdf.js.
 *
 * Only caller-provided bytes are accepted (validated-resource-only rule);
 * this helper never fetches arbitrary URLs. The bytes are copied before they
 * are handed to pdf.js because pdf.js transfers the underlying buffer to its
 * worker, which would otherwise detach the caller's copy and break retries.
 *
 * PDF.js 6.2.108 no longer exposes the legacy `isEvalSupported` initialization
 * option. Security therefore relies on the patched parser release plus this
 * narrow data-only, same-origin-worker boundary rather than an ignored and
 * falsely reassuring unknown option.
 */
export function loadScorePdf(data: Uint8Array): PDFDocumentLoadingTask {
  configureScorePdfWorker();
  return getDocument({ data: new Uint8Array(data) });
}
