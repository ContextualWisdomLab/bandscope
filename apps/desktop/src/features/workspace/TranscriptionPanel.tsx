import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelTranscription, createMidiPreview, saveTranscriptionMidi, exceedsPreviewPolyphony,
  transcribeRecording, TranscriptionError, type MidiPreview, type TranscriptionDraft, type TranscriptionErrorKind
} from "@/lib/transcription";
import { createTranscriptionTranslator, type TranscriptionCopyKey } from "@/i18n/transcription";
import type { Locale } from "@/i18n";
import { GrooveMap } from "./GrooveMap";

type Phase = "idle" | "working" | "cancelling" | "cancelled" | "ready" | "empty" | "error";
type ActiveRequest = { discard: boolean; runFinished: boolean; cancelPending: boolean; cancelFailed: boolean };
const errorCopy: Record<TranscriptionErrorKind, TranscriptionCopyKey> = {
  unavailable: "errorUnavailable", busy: "errorBusy", cancelled: "cancelled", audio: "errorAudio",
  model: "errorModel", complex: "errorComplex", invalid: "errorInvalid", timeout: "errorTimeout", cleanup: "errorCleanup", failed: "errorFailed",
  exportBusy: "saveBusy", exportStale: "saveStale", exportFailed: "saveFailed", exportInvalid: "saveInvalid"
};
const saveErrorCopy: Partial<Record<TranscriptionErrorKind, TranscriptionCopyKey>> = {
  exportBusy: "saveBusy", exportStale: "saveStale", exportFailed: "saveFailed", exportInvalid: "saveInvalid",
  invalid: "saveDraftInvalid", unavailable: "saveUnavailable"
};
const warningCopy: Record<string, TranscriptionCopyKey> = {
  audio_peak_normalized: "peakWarning", overlapping_pitch_bends_omitted: "bendWarning",
  note_times_clipped: "clippedWarning", out_of_range_notes_omitted: "omittedWarning"
};
const actionClass = "min-h-11 h-auto max-w-full whitespace-normal px-4 py-2 text-left focus-visible:ring-2 focus-visible:ring-cyan-300";

/** Keep a chosen recording's MIDI draft separate from the song's existing part analysis. */
export function TranscriptionPanel({ locale }: { locale?: Locale }) {
  const t = useMemo(() => createTranscriptionTranslator(locale), [locale]);
  const titleId = useId();
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState<TranscriptionDraft | null>(null);
  const [error, setError] = useState<TranscriptionCopyKey | null>(null);
  const [feedback, setFeedback] = useState<TranscriptionCopyKey | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<TranscriptionCopyKey | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [previewPhase, setPreviewPhase] = useState<"stopped" | "starting" | "playing">("stopped");
  const mounted = useRef(false);
  const active = useRef<ActiveRequest | null>(null);
  const preview = useRef<MidiPreview | null>(null);
  const saveRequest = useRef<symbol | null>(null);
  const busy = phase === "working" || phase === "cancelling";
  const previewLimited = useMemo(() => draft ? exceedsPreviewPolyphony(draft.notes) : false, [draft]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      preview.current?.stop();
      preview.current = null;
      saveRequest.current = null;
      if (active.current) {
        active.current.discard = true;
        void cancelTranscription().catch(() => undefined);
      }
    };
  }, []);

  /** Release the UI lock only after both the owned run and any cancel request settle. */
  function finish(request: ActiveRequest): void {
    if (!mounted.current || active.current !== request || !request.runFinished || request.cancelPending) return;
    active.current = null;
    if (request.discard) {
      setPhase(request.cancelFailed ? "error" : "cancelled");
      if (request.cancelFailed) setError("cancelUnconfirmed");
    }
  }

  /** A synchronous ref closes the double-click gap before React commits the working state. */
  async function chooseRecording(): Promise<void> {
    if (active.current || saveRequest.current) return;
    preview.current?.stop();
    preview.current = null;
    setPreviewPhase("stopped");
    setFeedback(null);
    setSaveFeedback(null);
    setError(null);
    setPhase("working");
    const request: ActiveRequest = { discard: false, runFinished: false, cancelPending: false, cancelFailed: false };
    active.current = request;
    try {
      const result = await transcribeRecording();
      if (!mounted.current || active.current !== request || request.discard) return;
      if (result === null) {
        setPhase(draft ? draft.notes.length ? "ready" : "empty" : "idle");
        return;
      }
      setDraft(result);
      setPhase(result.notes.length ? "ready" : "empty");
    } catch (caught) {
      if (!mounted.current || active.current !== request || request.discard) return;
      const kind = caught instanceof TranscriptionError ? caught.kind : "failed";
      setError(errorCopy[kind]);
      setPhase(kind === "cancelled" ? "cancelled" : "error");
    } finally {
      request.runFinished = true;
      finish(request);
    }
  }

  /** Suppress late results immediately while native cancellation terminates the owned process. */
  async function cancel(): Promise<void> {
    const request = active.current;
    if (!request || request.cancelPending) return;
    request.discard = true;
    request.cancelPending = true;
    request.cancelFailed = false;
    setError(null);
    setPhase("cancelling");
    try {
      await cancelTranscription();
    } catch {
      request.cancelFailed = true;
      if (mounted.current && active.current === request) {
        setError("cancelFailed");
        setPhase("working");
      }
    } finally {
      request.cancelPending = false;
      finish(request);
    }
  }

  /** Report success only after native saving completes, with one chooser at a time. */
  async function saveMidi(): Promise<void> {
    if (!draft || saveRequest.current || active.current) return;
    const request = Symbol("MIDI save");
    saveRequest.current = request;
    setIsSaving(true);
    setSaveFeedback(null);
    try {
      const saved = await saveTranscriptionMidi(draft);
      if (mounted.current && saveRequest.current === request) setSaveFeedback(saved ? "saved" : "saveCancelled");
    } catch (caught) {
      if (mounted.current && saveRequest.current === request) {
        const key = caught instanceof TranscriptionError ? saveErrorCopy[caught.kind] : undefined;
        setSaveFeedback(key ?? "saveFailed");
      }
    } finally {
      if (saveRequest.current === request) {
        saveRequest.current = null;
        if (mounted.current) setIsSaving(false);
      }
    }
  }

  /** Preserve a stop handle before awaiting browser audio activation. */
  async function playPreview(): Promise<void> {
    if (!draft || preview.current) return;
    setFeedback(null);
    setPreviewPhase("starting");
    let control: MidiPreview | null = null;
    try {
      control = createMidiPreview(draft, () => {
        if (!mounted.current || preview.current !== control) return;
        preview.current = null;
        setPreviewPhase("stopped");
        setFeedback("previewFinished");
      });
      preview.current = control;
      const started = await control.start();
      if (mounted.current && preview.current === control) setPreviewPhase(started ? "playing" : "stopped");
    } catch {
      control?.stop();
      if (mounted.current && preview.current === control) {
        preview.current = null;
        setPreviewPhase("stopped");
        setFeedback("previewFailed");
      }
    }
  }

  /** Stop also invalidates an unresolved resume promise so it cannot restart the UI state. */
  function stopPreview(): void {
    preview.current?.stop();
    preview.current = null;
    setPreviewPhase("stopped");
    setFeedback("previewStopped");
  }

  const status = phase === "working" ? t("working") : phase === "cancelling" ? t("cancelling") :
    phase === "cancelled" ? t("cancelled") : phase === "empty" ? t("empty") :
    phase === "ready" && draft ? t("ready", { count: draft.notes.length, duration: draft.durationSeconds.toFixed(1) }) : "";
  const previewStatus = previewPhase === "starting" ? t("previewStarting") : previewPhase === "playing" ? t("previewPlaying") : "";
  const showDraft = !!draft && (phase === "ready" || phase === "empty");

  return (
    <section aria-labelledby={titleId} className="min-w-0 rounded-xl border border-cyan-300/20 bg-slate-950 p-4 sm:p-5">
      <h3 id={titleId} className="text-base font-semibold text-slate-100">{t("title")}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{t("description")}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{t("inputHint")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" disabled={busy || isSaving} onClick={chooseRecording}
          className={`${actionClass} bg-cyan-200 font-semibold text-slate-950 hover:bg-cyan-100 disabled:bg-slate-700 disabled:text-slate-200`}>
          {phase === "error" ? t("retry") : draft ? t("chooseAnother") : t("choose")}
        </Button>
        {busy && <Button type="button" variant="outline" disabled={phase === "cancelling"} onClick={cancel}
          className={`${actionClass} border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white`}>{t("cancel")}</Button>}
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="mt-3 break-words text-sm leading-6 text-slate-200">{status}</p>
      {error && <p role="alert" className="mt-2 text-sm leading-6 text-amber-200">{t(error)}</p>}
      {showDraft && <div className="mt-3 min-w-0 border-t border-slate-700 pt-4">
        <p className="break-words text-sm font-medium text-slate-100">{draft.sourceLabel}</p>
        {draft.warnings.map(warning => warningCopy[warning] && <p key={warning} className="mt-2 text-sm leading-6 text-amber-200">{t(warningCopy[warning])}</p>)}
        {draft.notes.length > 0 && <>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{t("reviewHint")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={saveMidi} disabled={isSaving} variant="outline"
              className={`${actionClass} border-cyan-300/40 bg-cyan-200/10 text-cyan-100 hover:bg-cyan-200/20 hover:text-white`}>{t(isSaving ? "saving" : "save")}</Button>
            <Button type="button" onClick={playPreview} disabled={previewPhase !== "stopped"} variant="outline"
              className={`${actionClass} border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white`}>{t("preview")}</Button>
            {previewPhase !== "stopped" && <Button type="button" onClick={stopPreview} variant="outline"
              className={`${actionClass} border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white`}>{t("stopPreview")}</Button>}
          </div>
          <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm leading-6 text-slate-200">{isSaving ? t("saving") : saveFeedback ? t(saveFeedback) : ""}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">{t("previewHint")}</p>
          {previewLimited && <p className="mt-2 text-sm leading-6 text-amber-200">{t("previewLimit")}</p>}
          <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm leading-6 text-slate-200">{previewStatus || (feedback ? t(feedback) : "")}</p>
          <GrooveMap notes={draft.notes} durationSeconds={draft.durationSeconds} locale={locale} />
        </>}
      </div>}
    </section>
  );
}
