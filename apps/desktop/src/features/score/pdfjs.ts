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
 * this helper never supplies a URL. The bytes are copied before they are
 * handed to pdf.js because pdf.js transfers the underlying buffer to its
 * worker, which would otherwise detach the caller's copy and break retries.
 *
 * XFA rendering is explicitly disabled even though pdf.js 6.2.108 defaults it
 * to `false`, and worker-side resource fetching is explicitly disabled. These
 * settings make the parser boundary fail closed against XML-form activation
 * and remote helper-resource acquisition instead of relying on upstream
 * defaults. In the pinned pdf.js XML parser, DOCTYPE declarations are reported
 * to a no-op hook and unknown named entities are preserved literally rather
 * than dereferenced, so no external-entity resolver is exposed by this API.
 */
export function loadScorePdf(data: Uint8Array): PDFDocumentLoadingTask {
  configureScorePdfWorker();
  return getDocument({
    data: new Uint8Array(data),
    enableXfa: false,
    useWorkerFetch: false
  });
}
