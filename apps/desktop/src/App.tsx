import { useEffect, useMemo, useState } from "react";
import {
  SUPPORTED_AUDIO_FORMATS,
  type AnalysisJobStatus,
  type AnalysisJobRequest,
  type ProjectBootstrapSummary,
  type RehearsalSong
} from "@bandscope/shared-types";
import {
  createDefaultAnalysisRequest,
  getAnalysisJobStatus,
  selectLocalAudioSource,
  importYoutubeUrl,
  startAnalysisJob,
  loadProject,
  saveProject
} from "./lib/analysis";
import { createTranslator, detectPreferredLocale } from "./i18n";
import { Workspace } from "./features/workspace/Workspace";
import { EmptyState, LoadingState, ErrorState } from "./features/workspace/WorkspaceStates";

const ANALYSIS_POLL_INTERVAL_MS = 250;

/** Documented. */
function progressMessage(
  t: ReturnType<typeof createTranslator>,
  state: AnalysisJobStatus["state"]
): string {
  switch (state) {
    case "queued":
      return t("analysisStateQueued");
    case "running":
      return t("analysisStateRunning");
    case "succeeded":
      return t("analysisStateSucceeded");
    case "failed":
      return t("analysisStateFailed");
  }
}

/** Documented. */
export function App() {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const defaultRequest = useMemo(() => createDefaultAnalysisRequest(), []);
  const [jobStatus, setJobStatus] = useState<AnalysisJobStatus | null>(null);
  const [jobResult, setJobResult] = useState<RehearsalSong | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [selectedBootstrap, setSelectedBootstrap] = useState<ProjectBootstrapSummary | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  
  const analysisInFlight = jobStatus?.state === "queued" || jobStatus?.state === "running";
  const selectedRequest: AnalysisJobRequest = selectedBootstrap
    ? {
        sourceKind: "local_audio",
        projectId: selectedBootstrap.projectId,
        sourceLabel: selectedBootstrap.source.fileName,
        roleFocus: defaultRequest.roleFocus
      }
    : defaultRequest;

  useEffect(() => {
    if (!jobStatus || (jobStatus.state !== "queued" && jobStatus.state !== "running")) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const nextStatus = await getAnalysisJobStatus(jobStatus.jobId);
        setJobStatus(nextStatus);
        if (nextStatus.state === "succeeded" && nextStatus.result) {
          setJobResult(nextStatus.result);
          setJobError(null);
        }
        if (nextStatus.state === "failed") {
          setJobError(nextStatus.error?.message ?? t("analysisCouldNotStart"));
        }
      } catch {
        setJobStatus(null);
        setJobError(t("analysisCouldNotStart"));
      }
    }, ANALYSIS_POLL_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [jobStatus, t]);

  /** Documented. */
  const handleStartAnalysis = async () => {
    setJobError(null);
    setJobResult(null);
    setJobStatus(null);
    setIsStarting(true);
    try {
      const nextStatus = await startAnalysisJob(selectedRequest);
      setJobStatus(nextStatus);
      if (nextStatus.state === "succeeded" && nextStatus.result) {
        setJobResult(nextStatus.result);
      }
      if (nextStatus.state === "failed") {
        setJobError(nextStatus.error?.message ?? t("analysisCouldNotStart"));
      }
    } catch {
      setJobStatus(null);
      setJobError(t("analysisCouldNotStart"));
    } finally {
      setIsStarting(false);
    }
  };

  /** Documented. */
  const handleChooseLocalAudio = async () => {
    setSelectionError(null);
    const selection = await selectLocalAudioSource();
    if (selection.ok) {
      setSelectedBootstrap(selection.bootstrap);
      return;
    }

    setSelectedBootstrap(null);
    setSelectionError(selection.error.message || t("unsupportedLocalAudio"));
    setJobStatus(null);
  };

  /** Documented. */
  const handleImportYoutube = async () => {
    setSelectionError(null);
    setIsImporting(true);
    try {
      const selection = await importYoutubeUrl(youtubeUrl);
      if (selection.ok) {
        setSelectedBootstrap(selection.bootstrap);
        setYoutubeUrl("");
      } else {
        setSelectionError(selection.error.message);
      }
    } catch {
      setSelectionError(t("youtubeImportFailed"));
    } finally {
      setIsImporting(false);
    }
  };

  /** Documented. */
  const handleLoadProject = async () => {
    try {
      const song = await loadProject();
      setJobResult(song);
      setJobError(null);
      setSelectedBootstrap(null);
      setJobStatus(null);
    } catch (e) {
      if (e instanceof Error && e.message !== "User cancelled") {
        setJobError(`Failed to load project: ${e.message}`);
      } else if (typeof e === "string" && e !== "User cancelled") {
        setJobError(`Failed to load project: ${e}`);
      }
    }
  };

  /** Documented. */
  const handleSaveProject = async () => {
    if (!jobResult) return;
    try {
      await saveProject(jobResult);
    } catch (e) {
      if (e instanceof Error && e.message !== "User cancelled") {
        setJobError(`Failed to save project: ${e.message}`);
      } else if (typeof e === "string" && e !== "User cancelled") {
        setJobError(`Failed to save project: ${e}`);
      }
    }
  };

  /** Documented. */
  const handleSongUpdate = (updatedSong: RehearsalSong) => {
    setJobResult(updatedSong);
  };

  /** Documented. */
  const renderWorkspaceState = () => {
    if (jobError) {
      return <ErrorState error={jobError} />;
    }
    if (analysisInFlight || isStarting) {
      return <LoadingState />;
    }
    if (jobResult) {
      return <Workspace song={jobResult} onSongUpdate={handleSongUpdate} />;
    }
    return <EmptyState />;
  };

  return (
    <main style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: "0 0 8px 0" }}>{t("appTitle")}</h1>
          <p style={{ color: "#666", margin: "0" }}>{t("appSubtitle")}</p>
        </div>
        <button 
            type="button" 
            onClick={handleSaveProject} 
            aria-disabled={!jobResult}
            style={{ 
              padding: "8px 16px", 
              cursor: jobResult ? "pointer" : "not-allowed", 
              borderRadius: "4px", 
              backgroundColor: jobResult ? "#fff" : "#f5f5f5", 
              border: "1px solid #ccc",
              opacity: jobResult ? 1 : 0.5
            }}
          >
            Save Project
          </button>
      </header>

      <div style={{ marginBottom: "24px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <button 
          type="button" 
          onClick={handleChooseLocalAudio} 
          disabled={analysisInFlight || isStarting || isImporting}
          style={{ padding: "8px 16px", cursor: "pointer", borderRadius: "4px" }}
        >
          {t("chooseLocalAudio")}
        </button>
        
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input 
            type="text" 
            placeholder={t("youtubePlaceholder")} 
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            disabled={analysisInFlight || isStarting || isImporting}
            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "200px" }}
          />
          <button 
            type="button" 
            onClick={handleImportYoutube} 
            disabled={!youtubeUrl || analysisInFlight || isStarting || isImporting}
            style={{ padding: "8px 16px", cursor: "pointer", borderRadius: "4px" }}
          >
            {isImporting ? t("importingYoutube") : t("importYoutube")}
          </button>
        </div>

        <button 
          type="button" 
          onClick={handleLoadProject} 
          disabled={analysisInFlight || isStarting}
          style={{ padding: "8px 16px", cursor: "pointer", borderRadius: "4px" }}
        >
          Open Project
        </button>
        <button 
          type="button" 
          onClick={handleStartAnalysis} 
          disabled={analysisInFlight || isStarting || !selectedBootstrap || isImporting}
          style={{ padding: "8px 16px", cursor: "pointer", borderRadius: "4px", backgroundColor: "#1890ff", color: "white", border: "none" }}
        >
          {t("startAnalysis")}
        </button>
      </div>

      <div style={{ marginBottom: "24px", fontSize: "0.9em", color: "#666" }}>
        <p style={{ margin: "4px 0" }}>
          {t("supportedFormats")}: {SUPPORTED_AUDIO_FORMATS.join(", ")}
        </p>
        {selectedBootstrap && (
          <>
            <p style={{ margin: "4px 0" }}>{t("selectedAudio")}: {selectedBootstrap.source.fileName}</p>
            <p style={{ margin: "4px 0" }}>{t("sourceModeReference")}</p>
          </>
        )}
        {jobStatus && <p style={{ margin: "4px 0", fontWeight: "bold" }}>{progressMessage(t, jobStatus.state)}</p>}
        {selectionError && <p style={{ margin: "4px 0", color: "#a8071a" }}>{selectionError}</p>}
      </div>

      <section>
        {renderWorkspaceState()}
      </section>
    </main>
  );
}
