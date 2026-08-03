#!/usr/bin/env python3
"""Apply the focused handoff-import App and locale integration, then self-delete."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "apps/desktop/src/App.tsx"
EN = ROOT / "apps/desktop/src/locales/en/common.json"
KO = ROOT / "apps/desktop/src/locales/ko/common.json"
SELF = ROOT / "scripts/ci/bootstrap_handoff_import.py"
SELF_WORKFLOW = ROOT / ".github/workflows/bootstrap-handoff-import.yml"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace exactly one reviewed source fragment and fail on branch drift."""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def patch_app(text: str) -> str:
    """Wire validated handoff state, request construction, errors, and controls."""
    text = replace_once(
        text,
        """  type AnalysisJobStatus,
  type ProjectBootstrapSummary,
  type RehearsalSong
""",
        """  type AnalysisJobStatus,
  type MetadataHandoffArtifact,
  type ProjectBootstrapSummary,
  type RehearsalSong
""",
        "shared type import",
    )
    text = replace_once(
        text,
        """import { Workspace } from "./features/workspace/Workspace";
import { EmptyState, ErrorState, LoadingState } from "./features/workspace/WorkspaceStates";
""",
        """import { Workspace } from "./features/workspace/Workspace";
import { EmptyState, ErrorState, LoadingState } from "./features/workspace/WorkspaceStates";
import { HandoffImportControl } from "./features/import/HandoffImportControl";
""",
        "handoff control import",
    )
    text = replace_once(
        text,
        """} from "./lib/analysis";
import { createTranslator, detectPreferredLocale, type TranslationKey } from "./i18n";
""",
        """} from "./lib/analysis";
import {
  createAnalysisRequestForSelection,
  type HandoffImportErrorCode
} from "./lib/handoff";
import { createTranslator, detectPreferredLocale, type TranslationKey } from "./i18n";
""",
        "handoff helper import",
    )
    text = replace_once(
        text,
        """  return redacted.length > MAX_ERROR_DETAIL_LENGTH
    ? `${redacted.slice(0, MAX_ERROR_DETAIL_LENGTH - 3)}...`
    : redacted;
}

/** Documented. */
function BandScopeMark""",
        """  return redacted.length > MAX_ERROR_DETAIL_LENGTH
    ? `${redacted.slice(0, MAX_ERROR_DETAIL_LENGTH - 3)}...`
    : redacted;
}

/** Documented. */
function handoffErrorMessage(
  t: ReturnType<typeof createTranslator>,
  code: HandoffImportErrorCode
): string {
  switch (code) {
    case "unsupported_file":
      return t("handoffErrorUnsupportedFile");
    case "too_large":
      return t("handoffErrorTooLarge");
    case "invalid_utf8":
      return t("handoffErrorInvalidUtf8");
    case "invalid_json":
      return t("handoffErrorInvalidJson");
    case "invalid_artifact":
      return t("handoffErrorInvalidArtifact");
    case "read_failed":
      return t("handoffErrorReadFailed");
  }
}

/** Documented. */
function BandScopeMark""",
        "handoff error mapper",
    )
    text = replace_once(
        text,
        """  const [selectedBootstrap, setSelectedBootstrap] = useState<ProjectBootstrapSummary | null>(null);
  const [activeAnalysisBootstrap, setActiveAnalysisBootstrap] = useState<ProjectBootstrapSummary | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [selectionErrorSource, setSelectionErrorSource] = useState<"local" | "youtube" | null>(null);
""",
        """  const [selectedBootstrap, setSelectedBootstrap] = useState<ProjectBootstrapSummary | null>(null);
  const [pendingHandoff, setPendingHandoff] = useState<MetadataHandoffArtifact | null>(null);
  const [activeAnalysisBootstrap, setActiveAnalysisBootstrap] = useState<ProjectBootstrapSummary | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [selectionErrorSource, setSelectionErrorSource] = useState<"local" | "youtube" | "handoff" | null>(null);
""",
        "handoff state",
    )
    text = replace_once(
        text,
        """  const selectedRequest: AnalysisJobRequest = selectedBootstrap
    ? {
        sourceKind: "local_audio",
        projectId: selectedBootstrap.projectId,
        sourceLabel: selectedBootstrap.source.fileName,
        roleFocus: defaultRequest.roleFocus
      }
    : defaultRequest;
""",
        """  const selectedRequest: AnalysisJobRequest = createAnalysisRequestForSelection(
    defaultRequest,
    selectedBootstrap,
    pendingHandoff
  );
""",
        "selected analysis request",
    )
    text = replace_once(
        text,
        """      setJobResultBootstrap(activeAnalysisBootstrap);
      setActiveAnalysisBootstrap(null);
      setJobError(null);
""",
        """      setJobResultBootstrap(activeAnalysisBootstrap);
      setActiveAnalysisBootstrap(null);
      setPendingHandoff(null);
      setJobError(null);
""",
        "subscription success cleanup",
    )
    text = replace_once(
        text,
        """        setJobResultBootstrap(submittedBootstrap);
        setActiveAnalysisBootstrap(null);
""",
        """        setJobResultBootstrap(submittedBootstrap);
        setActiveAnalysisBootstrap(null);
        setPendingHandoff(null);
""",
        "immediate success cleanup",
    )
    text = replace_once(
        text,
        """  const handleClearYoutubeUrl = () => {
    youtubeInputRef.current?.focus();
    setYoutubeUrl("");
  };

  /** Documented. */
  const handleLoadProject = async () => {
""",
        """  const handleClearYoutubeUrl = () => {
    youtubeInputRef.current?.focus();
    setYoutubeUrl("");
  };

  /** Store or clear one validated handoff without reading referenced assets. */
  const handleHandoffChange = (handoff: MetadataHandoffArtifact | null) => {
    setPendingHandoff(handoff);
  };

  /** Convert bounded import failure codes into localized, payload-free copy. */
  const handleHandoffImportError = (code: HandoffImportErrorCode | null) => {
    if (code === null) {
      if (selectionErrorSource === "handoff") {
        setSelectionError(null);
        setSelectionErrorSource(null);
      }
      return;
    }
    setSelectionError(handoffErrorMessage(t, code));
    setSelectionErrorSource("handoff");
  };

  /** Documented. */
  const handleLoadProject = async () => {
""",
        "handoff handlers",
    )
    text = replace_once(
        text,
        """      setSelectedBootstrap(null);
      setActiveAnalysisBootstrap(null);
      setJobStatus(null);
""",
        """      setSelectedBootstrap(null);
      setPendingHandoff(null);
      setActiveAnalysisBootstrap(null);
      setJobStatus(null);
""",
        "loaded project cleanup",
    )
    text = replace_once(
        text,
        """                <Button
                  onClick={handleChooseLocalAudio}
                  disabled={analysisInFlight || isStarting || isImporting}
                  variant="secondary"
                  className="min-h-11 w-full border border-cyan-300/20 bg-cyan-300/10 font-semibold text-cyan-50 hover:bg-cyan-300/20 xl:w-auto"
                  aria-label={t("chooseLocalAudio")}
                >
                  <Upload className="mr-2 size-4" aria-hidden="true" />
                  {t("chooseLocalAudio")}
                </Button>

                <div className="grid min-w-0 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
""",
        """                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
                  <Button
                    onClick={handleChooseLocalAudio}
                    disabled={analysisInFlight || isStarting || isImporting}
                    variant="secondary"
                    className="min-h-11 w-full border border-cyan-300/20 bg-cyan-300/10 font-semibold text-cyan-50 hover:bg-cyan-300/20 sm:w-auto"
                    aria-label={t("chooseLocalAudio")}
                  >
                    <Upload className="mr-2 size-4" aria-hidden="true" />
                    {t("chooseLocalAudio")}
                  </Button>
                  <HandoffImportControl
                    disabled={analysisInFlight || isStarting || isImporting}
                    handoff={pendingHandoff}
                    onHandoffChange={handleHandoffChange}
                    onImportError={handleHandoffImportError}
                  />
                </div>

                <div className="grid min-w-0 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
""",
        "source control integration",
    )
    return text


def patch_locale(path: Path, additions: dict[str, str]) -> None:
    """Append synchronized localized handoff copy without reordering existing keys."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"locale root is not an object: {path}")
    conflicts = [key for key in additions if key in payload and payload[key] != additions[key]]
    if conflicts:
        raise RuntimeError(f"locale key conflicts in {path}: {', '.join(conflicts)}")
    payload.update(additions)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    """Patch reviewed files and remove the one-shot bootstrap artifacts."""
    app_text = APP.read_text(encoding="utf-8")
    APP.write_text(patch_app(app_text), encoding="utf-8")
    patch_locale(
        EN,
        {
            "importHandoff": "Import Handoff",
            "replaceHandoff": "Replace Handoff",
            "validatingHandoff": "Validating handoff",
            "handoffFileAriaLabel": "Handoff JSON file",
            "handoffFocusedRoles": "focused roles",
            "clearImportedHandoff": "Clear imported handoff",
            "handoffErrorUnsupportedFile": "Choose a BandScope handoff JSON file.",
            "handoffErrorTooLarge": "The handoff file is too large.",
            "handoffErrorInvalidUtf8": "The handoff file is not valid UTF-8 text.",
            "handoffErrorInvalidJson": "The handoff file is not valid JSON.",
            "handoffErrorInvalidArtifact": "The file is not a supported BandScope handoff.",
            "handoffErrorReadFailed": "The handoff file could not be read."
        },
    )
    patch_locale(
        KO,
        {
            "importHandoff": "인계 파일 가져오기",
            "replaceHandoff": "인계 파일 바꾸기",
            "validatingHandoff": "인계 파일 확인 중",
            "handoffFileAriaLabel": "인계 JSON 파일",
            "handoffFocusedRoles": "집중 역할",
            "clearImportedHandoff": "가져온 인계 파일 지우기",
            "handoffErrorUnsupportedFile": "BandScope 인계 JSON 파일을 선택하세요.",
            "handoffErrorTooLarge": "인계 파일이 너무 큽니다.",
            "handoffErrorInvalidUtf8": "인계 파일이 올바른 UTF-8 텍스트가 아닙니다.",
            "handoffErrorInvalidJson": "인계 파일이 올바른 JSON이 아닙니다.",
            "handoffErrorInvalidArtifact": "지원되는 BandScope 인계 파일이 아닙니다.",
            "handoffErrorReadFailed": "인계 파일을 읽을 수 없습니다."
        },
    )
    SELF.unlink()
    SELF_WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
