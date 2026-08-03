import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { FileJson, Loader2, X } from "lucide-react";
import type { MetadataHandoffArtifact } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import {
  handoffRoleFocus,
  readMetadataHandoffFile,
  type HandoffImportErrorCode
} from "../../lib/handoff";

interface HandoffImportControlProps {
  disabled: boolean;
  handoff: MetadataHandoffArtifact | null;
  onHandoffChange: (handoff: MetadataHandoffArtifact | null) => void;
  onImportError: (code: HandoffImportErrorCode | null) => void;
}

/** Documented. */
export function HandoffImportControl({
  disabled,
  handoff,
  onHandoffChange,
  onImportError
}: HandoffImportControlProps) {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isReading, setIsReading] = useState(false);
  const roleFocusCount = handoff ? handoffRoleFocus(handoff).length : 0;
  const controlsDisabled = disabled || isReading;

  /** Open the browser-owned local file picker. */
  const handleOpenPicker = () => {
    inputRef.current?.click();
  };

  /** Validate one selected handoff before publishing it to application state. */
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }

    setIsReading(true);
    try {
      const result = await readMetadataHandoffFile(file);
      if (!result.ok) {
        onImportError(result.code);
        return;
      }
      onHandoffChange(result.artifact);
      onImportError(null);
    } finally {
      setIsReading(false);
    }
  };

  /** Remove the pending handoff without touching the selected audio source. */
  const handleClear = () => {
    onHandoffChange(null);
    onImportError(null);
  };

  return (
    <div className="min-w-0 space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        aria-label={t("handoffFileAriaLabel")}
        disabled={controlsDisabled}
        onChange={handleFileChange}
        className="sr-only"
      />
      <Button
        type="button"
        onClick={handleOpenPicker}
        disabled={controlsDisabled}
        variant="outline"
        className="min-h-11 w-full border-teal-300/25 bg-teal-300/10 font-semibold text-teal-50 hover:bg-teal-300/20 hover:text-white sm:w-auto"
        aria-label={
          isReading
            ? t("validatingHandoff")
            : handoff
              ? t("replaceHandoff")
              : t("importHandoff")
        }
      >
        {isReading ? (
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileJson className="mr-2 size-4" aria-hidden="true" />
        )}
        {isReading
          ? t("validatingHandoff")
          : handoff
            ? t("replaceHandoff")
            : t("importHandoff")}
      </Button>

      {handoff ? (
        <div
          role="status"
          aria-live="polite"
          className="flex min-w-0 items-center gap-2 rounded-xl border border-teal-300/20 bg-teal-300/[0.08] px-3 py-2 text-sm text-teal-50"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{handoff.workspace.title}</p>
            <p className="truncate text-xs text-teal-100/75">
              {handoff.song.title} · {roleFocusCount} {t("handoffFocusedRoles")}
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={controlsDisabled}
            onClick={handleClear}
            aria-label={t("clearImportedHandoff")}
            title={t("clearImportedHandoff")}
            className="size-8 shrink-0 text-teal-100 hover:bg-teal-200/10 hover:text-white"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
