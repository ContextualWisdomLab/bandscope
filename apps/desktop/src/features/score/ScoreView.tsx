import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { FileMusic, FilePlus2, Loader2, Trash2 } from "lucide-react";
import type { RehearsalSong, ScoreAttachment } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreViewer } from "./ScoreViewer";
import {
  attachScorePdf,
  getScorePdfReceipt,
  readScorePdf,
  removeScorePdfIfReceiptMatches
} from "./scoreStorage";

/** Props accepted by the per-song score attachments view. */
export interface ScoreViewProps {
  /** Song whose score attachments are listed and updated. */
  song: RehearsalSong;
  /**
   * Active analysis project id, or `null` when the song was loaded without a
   * live project workspace (demo songs, `.bscope` files opened directly).
   * Score PDFs live in the project workspace, so all storage actions are
   * disabled without it.
   */
  projectId: string | null;
  /**
   * Commit updated song metadata. Async owners may return `false` when the
   * project snapshot was not durably accepted; legacy synchronous owners may
   * return `void`, which remains an accepted update for backward compatibility.
   */
  onSongUpdate: (song: RehearsalSong) => void | boolean | Promise<void | boolean>;
}

/**
 * Extract the first line of a bridge error for display, falling back to the
 * provided message when the error carries no usable text.
 */
function bridgeErrorDetail(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  const firstLine = raw?.split(/\r?\n/)[0]?.trim();
  return firstLine ? firstLine : fallback;
}

/**
 * Score view for the current song: lists attached score PDFs, attaches new
 * ones through the validated desktop bridge, opens a selected score in the
 * embedded viewer, and removes attachments (metadata plus stored copy).
 */
export function ScoreView({ song, projectId, onSongUpdate }: ScoreViewProps) {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const attachments = useMemo(() => song.scoreAttachments ?? [], [song.scoreAttachments]);
  const [selected, setSelected] = useState<ScoreAttachment | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readRequestRef = useRef(0);
  const selectedRef = useRef<ScoreAttachment | null>(selected);
  const contextKey = `${projectId ?? ""}\u0000${song.id}`;
  const contextKeyRef = useRef(contextKey);
  const previousContextKeyRef = useRef(contextKey);
  selectedRef.current = selected;
  contextKeyRef.current = contextKey;

  /** Return whether an async operation still belongs to the rendered project/song context. */
  const isCurrentContext = (expectedContextKey: string) =>
    contextKeyRef.current === expectedContextKey;

  useLayoutEffect(() => {
    if (previousContextKeyRef.current === contextKey) {
      return;
    }
    previousContextKeyRef.current = contextKey;
    readRequestRef.current += 1;
    selectedRef.current = null;
    setSelected(null);
    setPdfBytes(null);
    setIsOpening(false);
    setIsAttaching(false);
    setError(null);
  }, [contextKey]);

  /**
   * Load the stored PDF bytes for an attachment into the viewer. The caller's
   * project/song context is captured with the request so a late result cannot
   * repaint a different project after navigation.
   */
  const openAttachment = async (
    activeProjectId: string,
    attachment: ScoreAttachment,
    expectedContextKey = contextKeyRef.current
  ) => {
    const requestId = readRequestRef.current + 1;
    readRequestRef.current = requestId;
    selectedRef.current = attachment;
    setSelected(attachment);
    setPdfBytes(null);
    setError(null);
    setIsOpening(true);
    try {
      const bytes = await readScorePdf(activeProjectId, attachment.id);
      if (readRequestRef.current === requestId && isCurrentContext(expectedContextKey)) {
        setPdfBytes(bytes);
      }
    } catch (readError) {
      if (readRequestRef.current === requestId && isCurrentContext(expectedContextKey)) {
        selectedRef.current = null;
        setSelected(null);
        setError(`${t("scoreReadFailed")} ${bridgeErrorDetail(readError, "")}`.trim());
      }
    } finally {
      if (readRequestRef.current === requestId && isCurrentContext(expectedContextKey)) {
        setIsOpening(false);
      }
    }
  };

  /**
   * Attach a new score PDF via the native picker and open it only after the
   * owning project metadata accepts the attachment. A completed publication
   * whose project context has since changed is left as a recovery candidate;
   * stale UI intent never mutates the newly active project.
   */
  const handleAttach = async (activeProjectId: string) => {
    const expectedContextKey = contextKeyRef.current;
    setError(null);
    setIsAttaching(true);
    try {
      const result = await attachScorePdf(activeProjectId, song.id);
      if (!isCurrentContext(expectedContextKey)) {
        return;
      }
      const attachment: ScoreAttachment = { id: result.id, fileName: result.fileName };
      const accepted = await onSongUpdate({
        ...song,
        scoreAttachments: [...attachments, attachment]
      });
      if (!isCurrentContext(expectedContextKey) || accepted === false) {
        return;
      }
      await openAttachment(activeProjectId, attachment, expectedContextKey);
    } catch (attachError) {
      if (isCurrentContext(expectedContextKey)) {
        setError(bridgeErrorDetail(attachError, t("scoreAttachFailed")));
      }
    } finally {
      if (isCurrentContext(expectedContextKey)) {
        setIsAttaching(false);
      }
    }
  };

  /**
   * Capture the exact Score Storage object identity before changing durable
   * project metadata, then delete bytes only if that same receipt is still
   * current after metadata detachment. The project/song context is also
   * revalidated before metadata mutation and again before storage deletion, so
   * an async detach cannot cross a project switch. Selection freshness is read
   * at acceptance time so a score opened while receipt/persistence work is in
   * flight cannot remain visible after its metadata is detached.
   */
  const handleRemove = async (activeProjectId: string, attachment: ScoreAttachment) => {
    const expectedContextKey = contextKeyRef.current;
    const confirmed = window.confirm(
      t("scoreRemoveConfirm").replace("{fileName}", attachment.fileName)
    );
    if (!confirmed) {
      return;
    }
    setError(null);
    try {
      const receipt = await getScorePdfReceipt(activeProjectId, attachment.id);
      if (!isCurrentContext(expectedContextKey)) {
        return;
      }
      const accepted = await onSongUpdate({
        ...song,
        scoreAttachments: attachments.filter((entry) => entry.id !== attachment.id)
      });
      if (!isCurrentContext(expectedContextKey) || accepted === false) {
        return;
      }
      if (selectedRef.current?.id === attachment.id) {
        readRequestRef.current += 1;
        selectedRef.current = null;
        setSelected(null);
        setPdfBytes(null);
        setIsOpening(false);
      }
      if (receipt) {
        await removeScorePdfIfReceiptMatches(activeProjectId, receipt);
      }
    } catch (removeError) {
      if (isCurrentContext(expectedContextKey)) {
        setError(bridgeErrorDetail(removeError, t("scoreRemoveFailed")));
      }
    }
  };

  return (
    <section aria-label={t("scoreViewTitle")} className="flex flex-col gap-4">
      <Card className="border-cyan-300/20 bg-slate-950/75 backdrop-blur-xl">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight text-white">
                {t("scoreViewTitle")} · {song.title}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">{t("scoreViewSubtitle")}</p>
            </div>
            <Button
              onClick={projectId ? () => void handleAttach(projectId) : undefined}
              disabled={!projectId || isAttaching}
              variant="secondary"
              className="min-h-11 border border-cyan-300/20 bg-cyan-300/10 font-semibold text-cyan-50 hover:bg-cyan-300/20"
            >
              {isAttaching ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              ) : (
                <FilePlus2 className="mr-2 size-4" aria-hidden="true" />
              )}
              {isAttaching ? t("scoreAttaching") : t("scoreAttach")}
            </Button>
          </div>

          {!projectId && (
            <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-medium text-amber-100">
              {t("scoreRequiresProject")}
            </p>
          )}

          {error && (
            <p
              className="rounded-xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-medium text-rose-100"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </p>
          )}

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              {t("scoreListTitle")}
            </h3>
            {attachments.length === 0 ? (
              <p className="text-sm text-slate-400">{t("scoreListEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${
                      selected?.id === attachment.id
                        ? "border-cyan-300/40 bg-cyan-300/10"
                        : "border-white/10 bg-white/[0.04]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={projectId ? () => void openAttachment(projectId, attachment) : undefined}
                      disabled={!projectId}
                      aria-current={selected?.id === attachment.id ? "true" : undefined}
                      aria-label={`${t("scoreOpen")}: ${attachment.fileName}`}
                      className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FileMusic className="size-4 shrink-0 text-cyan-300" aria-hidden="true" />
                      <span className="truncate">{attachment.fileName}</span>
                    </button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={projectId ? () => void handleRemove(projectId, attachment) : undefined}
                      disabled={!projectId}
                      aria-label={`${t("scoreRemove")}: ${attachment.fileName}`}
                      className="size-10 border-rose-300/25 text-rose-200 hover:bg-rose-400/10"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {isOpening ? (
        <Card
          className="border-cyan-300/20 bg-slate-950/75 backdrop-blur-xl"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 className="mb-4 size-10 animate-spin text-cyan-300" aria-hidden="true" />
            <p className="animate-pulse text-slate-400">{t("scoreOpening")}</p>
          </CardContent>
        </Card>
      ) : (
        <ScoreViewer data={pdfBytes} fileName={selected?.fileName} />
      )}
    </section>
  );
}