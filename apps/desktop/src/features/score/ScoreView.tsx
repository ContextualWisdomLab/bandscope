import { useMemo, useRef, useState } from "react";
import { FileMusic, FilePlus2, Loader2, Trash2 } from "lucide-react";
import type { RehearsalSong, ScoreAttachment } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreViewer } from "./ScoreViewer";
import { attachScorePdf, readScorePdf, removeScorePdf } from "./scoreStorage";

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
  /** Callback receiving the song with updated `scoreAttachments` metadata. */
  onSongUpdate: (song: RehearsalSong) => void;
}

/**
 * Extract the first line of a bridge error for display, falling back to the
 * provided message when the error carries no usable text.
 */
function bridgeErrorDetail(bridgeError: unknown, fallbackMessage: string): string {
  const rawErrorMessage =
    bridgeError instanceof Error
      ? bridgeError.message
      : typeof bridgeError === "string"
        ? bridgeError
        : null;
  const firstErrorLine = rawErrorMessage?.split(/\r?\n/)[0]?.trim();
  return firstErrorLine ? firstErrorLine : fallbackMessage;
}

/**
 * Score view for the current song: lists attached score PDFs, attaches new
 * ones through the validated desktop bridge, opens a selected score in the
 * embedded viewer, and removes attachments (metadata plus stored copy).
 */
export function ScoreView({ song, projectId, onSongUpdate }: ScoreViewProps) {
  const scoreTranslator = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const scoreAttachments = useMemo(
    () => song.scoreAttachments ?? [],
    [song.scoreAttachments]
  );
  const [selectedScoreAttachment, setSelectedScoreAttachment] = useState<ScoreAttachment | null>(
    null
  );
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const readRequestRef = useRef(0);

  /**
   * Load the stored PDF bytes for an attachment into the viewer. Callers pass
   * the active project id explicitly; the storage controls are only wired up
   * (and enabled) when a workspace is present, so this never runs without one.
   */
  const openAttachment = async (
    activeProjectId: string,
    scoreAttachment: ScoreAttachment
  ) => {
    const requestId = readRequestRef.current + 1;
    readRequestRef.current = requestId;
    setSelectedScoreAttachment(scoreAttachment);
    setPdfBytes(null);
    setScoreError(null);
    setIsOpening(true);
    try {
      const scorePdfBytes = await readScorePdf(activeProjectId, scoreAttachment.id);
      if (readRequestRef.current === requestId) {
        setPdfBytes(scorePdfBytes);
      }
    } catch (readError) {
      if (readRequestRef.current === requestId) {
        setSelectedScoreAttachment(null);
        setScoreError(
          `${scoreTranslator("scoreReadFailed")} ${bridgeErrorDetail(readError, "")}`.trim()
        );
      }
    } finally {
      if (readRequestRef.current === requestId) {
        setIsOpening(false);
      }
    }
  };

  /**
   * Attach a new score PDF via the native picker and open it. The attach
   * control is disabled while `isAttaching`, so overlapping attaches cannot be
   * started; the active project id is supplied by the enabled control.
   */
  const handleAttach = async (activeProjectId: string) => {
    setScoreError(null);
    setIsAttaching(true);
    try {
      const attachmentResult = await attachScorePdf(activeProjectId, song.id);
      const scoreAttachment: ScoreAttachment = {
        id: attachmentResult.id,
        fileName: attachmentResult.fileName
      };
      onSongUpdate({ ...song, scoreAttachments: [...scoreAttachments, scoreAttachment] });
      setIsAttaching(false);
      await openAttachment(activeProjectId, scoreAttachment);
    } catch (attachError) {
      setIsAttaching(false);
      setScoreError(bridgeErrorDetail(attachError, scoreTranslator("scoreAttachFailed")));
    }
  };

  /** Remove an attachment after confirmation (metadata and stored copy). */
  const handleRemove = async (
    activeProjectId: string,
    scoreAttachment: ScoreAttachment
  ) => {
    const removalConfirmed = window.confirm(
      scoreTranslator("scoreRemoveConfirm").replace("{fileName}", scoreAttachment.fileName)
    );
    if (!removalConfirmed) {
      return;
    }
    setScoreError(null);
    try {
      await removeScorePdf(activeProjectId, scoreAttachment.id);
      onSongUpdate({
        ...song,
        scoreAttachments: scoreAttachments.filter(
          (scoreAttachmentEntry) => scoreAttachmentEntry.id !== scoreAttachment.id
        )
      });
      if (selectedScoreAttachment?.id === scoreAttachment.id) {
        readRequestRef.current += 1;
        setSelectedScoreAttachment(null);
        setPdfBytes(null);
        setIsOpening(false);
      }
    } catch (removeError) {
      setScoreError(bridgeErrorDetail(removeError, scoreTranslator("scoreRemoveFailed")));
    }
  };

  return (
    <section aria-label={scoreTranslator("scoreViewTitle")} className="flex flex-col gap-4">
      <Card className="border-cyan-300/20 bg-slate-950/75 backdrop-blur-xl">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight text-white">
                {scoreTranslator("scoreViewTitle")} · {song.title}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                {scoreTranslator("scoreViewSubtitle")}
              </p>
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
              {isAttaching ? scoreTranslator("scoreAttaching") : scoreTranslator("scoreAttach")}
            </Button>
          </div>

          {!projectId && (
            <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-medium text-amber-100">
              {scoreTranslator("scoreRequiresProject")}
            </p>
          )}

          {scoreError && (
            <p
              className="rounded-xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-medium text-rose-100"
              role="alert"
              aria-live="assertive"
            >
              {scoreError}
            </p>
          )}

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              {scoreTranslator("scoreListTitle")}
            </h3>
            {scoreAttachments.length === 0 ? (
              <p className="text-sm text-slate-400">{scoreTranslator("scoreListEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {scoreAttachments.map((scoreAttachment) => (
                  <li
                    key={scoreAttachment.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${
                      selectedScoreAttachment?.id === scoreAttachment.id
                        ? "border-cyan-300/40 bg-cyan-300/10"
                        : "border-white/10 bg-white/[0.04]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={
                        projectId ? () => void openAttachment(projectId, scoreAttachment) : undefined
                      }
                      disabled={!projectId}
                      aria-current={
                        selectedScoreAttachment?.id === scoreAttachment.id ? "true" : undefined
                      }
                      aria-label={`${scoreTranslator("scoreOpen")}: ${scoreAttachment.fileName}`}
                      className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FileMusic className="size-4 shrink-0 text-cyan-300" aria-hidden="true" />
                      <span className="truncate">{scoreAttachment.fileName}</span>
                    </button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={
                        projectId ? () => void handleRemove(projectId, scoreAttachment) : undefined
                      }
                      disabled={!projectId}
                      aria-label={`${scoreTranslator("scoreRemove")}: ${scoreAttachment.fileName}`}
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
            <p className="animate-pulse text-slate-400">{scoreTranslator("scoreOpening")}</p>
          </CardContent>
        </Card>
      ) : (
        <ScoreViewer scorePdfBytes={pdfBytes} fileName={selectedScoreAttachment?.fileName} />
      )}
    </section>
  );
}
