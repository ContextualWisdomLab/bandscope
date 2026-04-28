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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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
    const normalizedUrl = youtubeUrl.trim();
    if (!normalizedUrl) {
      setSelectionError(t("youtubeImportFailed"));
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      setSelectionError(t("youtubeImportFailed"));
      return;
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      setSelectionError(t("youtubeImportFailed"));
      return;
    }

    setIsImporting(true);
    try {
      const selection = await importYoutubeUrl(normalizedUrl);
      if (selection.ok) {
        setSelectedBootstrap(selection.bootstrap);
        setYoutubeUrl("");
      } else {
        setSelectionError(selection.error.message || t("youtubeImportFailed"));
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
    try {
      await saveProject(jobResult!);
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
    <div className="min-h-screen bg-zinc-50 text-zinc-950 font-sans selection:bg-zinc-200">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <header className="mb-12 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-zinc-900 mb-2">{t("appTitle")}</h1>
            <p className="text-lg text-zinc-500 tracking-tight font-medium max-w-2xl">{t("appSubtitle")}</p>
          </div>
          <Button 
            variant="outline" 
            size="lg"
            onClick={handleSaveProject} 
            disabled={!jobResult}
            className="shadow-sm font-semibold transition-all hover:shadow-md"
            aria-label="Save Project"
          >
            Save Project
          </Button>
        </header>

        <Card className="border-zinc-200 shadow-sm mb-12 overflow-hidden bg-white">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-center justify-between">
              
              {/* Actions Area */}
              <div className="flex flex-wrap items-center gap-4 w-full">
                <Button 
                  onClick={handleChooseLocalAudio} 
                  disabled={analysisInFlight || isStarting || isImporting}
                  variant="secondary"
                  className="font-semibold shadow-sm"
                  aria-label="Choose local audio"
                >
                  {t("chooseLocalAudio")}
                </Button>
                
                <div className="flex flex-1 min-w-[280px] max-w-sm items-center gap-2 relative">
                  <Input 
                    type="text" 
                    placeholder={t("youtubePlaceholder")} 
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    disabled={analysisInFlight || isStarting || isImporting}
                    className="flex-1 bg-zinc-50 focus-visible:ring-zinc-400"
                    aria-label="YouTube URL"
                  />
                  <Button 
                    onClick={handleImportYoutube} 
                    disabled={!youtubeUrl || analysisInFlight || isStarting || isImporting}
                    variant="outline"
                    className="font-medium bg-zinc-50 hover:bg-zinc-100"
                    aria-label="Import YouTube"
                  >
                    {isImporting ? t("importingYoutube") : t("importYoutube")}
                  </Button>
                </div>

                <Separator orientation="vertical" className="hidden lg:block h-10" />
                
                <Button 
                  onClick={handleLoadProject} 
                  disabled={analysisInFlight || isStarting}
                  variant="outline"
                  className="font-medium bg-zinc-50 hover:bg-zinc-100"
                  aria-label="Open Project"
                >
                  Open Project
                </Button>

                <div className="ml-auto">
                  <Button 
                    onClick={handleStartAnalysis} 
                    disabled={analysisInFlight || isStarting || !selectedBootstrap || isImporting}
                    size="lg"
                    className="font-bold shadow-md hover:shadow-lg transition-all"
                    aria-label="Start analysis"
                  >
                    {t("startAnalysis")}
                  </Button>
                </div>
              </div>
            </div>

            {/* Status Information */}
            <div className="mt-8 pt-6 border-t border-zinc-100 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-zinc-500 font-medium">
                <span className="text-zinc-400 uppercase tracking-wider text-xs font-bold mr-2">Formats</span>
                {SUPPORTED_AUDIO_FORMATS.join(", ")}
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-2">
                {selectedBootstrap && (
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                    <span className="font-semibold text-zinc-700 truncate max-w-[200px]" title={selectedBootstrap.source.fileName}>
                      {selectedBootstrap.source.fileName}
                    </span>
                  </div>
                )}
                
                {jobStatus && (
                  <div className="flex items-center text-zinc-900 font-semibold bg-zinc-100 px-3 py-1 rounded-md">
                    {jobStatus.state === 'running' && (
                      <span className="inline-block w-4 h-4 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mr-2"></span>
                    )}
                    {progressMessage(t, jobStatus.state)}
                  </div>
                )}
                
                {selectionError && (
                  <div className="text-rose-600 font-medium bg-rose-50 px-3 py-1 rounded-md border border-rose-100 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {selectionError}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="animate-in fade-in duration-500 ease-out fill-mode-both">
          {renderWorkspaceState()}
        </section>
      </div>
    </div>
  );
}
