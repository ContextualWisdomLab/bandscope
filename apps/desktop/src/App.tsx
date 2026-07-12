import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  AudioWaveform,
  CircleHelp,
  Clock3,
  CloudOff,
  FileMusic,
  FolderOpen,
  Gauge,
  Home,
  KeyRound,
  ListMusic,
  Music2,
  Play,
  Save,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  Upload,
  Users,
  Wand2,
  Loader2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  SUPPORTED_AUDIO_FORMATS,
  type AnalysisJobRequest,
  type AnalysisJobStatus,
  type ProjectBootstrapSummary,
  type RehearsalSong
} from "@bandscope/shared-types";
import {
  createDefaultAnalysisRequest,
  getAnalysisJobStatus,
  importYoutubeUrl,
  isSupportedYoutubeUrl,
  loadProject,
  MAX_YOUTUBE_URL_LENGTH,
  saveProject,
  subscribeToAnalysisJobUpdates,
  selectLocalAudioSource,
  startAnalysisJob
} from "./lib/analysis";
import { createTranslator, detectPreferredLocale, type TranslationKey } from "./i18n";
import { ScoreView } from "./features/score/ScoreView";
import { Workspace } from "./features/workspace/Workspace";
import { EmptyState, ErrorState, LoadingState } from "./features/workspace/WorkspaceStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "@/components/ui/sonner";

const ANALYSIS_POLL_INTERVAL_MS = 250;
const MAX_ERROR_DETAIL_LENGTH = 220;
const LOCAL_PATH_PATTERN = /(?:[A-Za-z]:[\\/][^\s"'<>]+|\\\\[^\s"'<>]+|\/(?:Users|home|var|tmp|private|Volumes)\/[^\s"'<>]+)/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;
const SECRET_ASSIGNMENT_PATTERN = /\b(token|secret|password|api[_-]?key|access[_-]?token)\s*[:=]\s*[^\s,;]+/gi;

type RehearsalView = "workspace" | "score";

const NAV_ITEMS = [
  { labelKey: "navWorkspace", icon: Home, view: "workspace" },
  { labelKey: "navImport", icon: Upload, view: null },
  { labelKey: "navExport", icon: Save, view: null },
  { labelKey: "navSections", icon: ListMusic, view: null },
  { labelKey: "navRoles", icon: Users, view: null },
  { labelKey: "navStemLab", icon: AudioWaveform, view: null },
  { labelKey: "navCues", icon: Sparkles, view: null },
  { labelKey: "navTranspose", icon: SlidersHorizontal, view: null },
  { labelKey: "navScore", icon: FileMusic, view: "score" }
] as const satisfies readonly { labelKey: TranslationKey; icon: LucideIcon; view: RehearsalView | null }[];

const BRAND_BAR_HEIGHTS = ["h-3", "h-5", "h-7", "h-4", "h-6"] as const;

/** Documented. */
function preventUnavailableAction(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
  event.stopPropagation();
}

/** Documented. */
function blockInactiveNavActivation(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
}

/** Documented. */
function progressMessage(
  t: ReturnType<typeof createTranslator>,
  status: AnalysisJobStatus
): string {
  if (status.progressLabel?.trim()) {
    return status.progressLabel;
  }

  switch (status.state) {
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
function rawErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return null;
}

/** Documented. */
function isUserCancellation(error: unknown): boolean {
  return rawErrorMessage(error)?.trim() === "User cancelled";
}

/** Documented. */
function safeErrorDetail(error: unknown, fallback: string): string {
  const raw = rawErrorMessage(error);
  if (!raw?.trim()) {
    return fallback;
  }

  const firstLine = raw
    .split(/\r?\n/)[0]
    .replace(/\s+/g, " ")
    .trim();
  const redacted = firstLine
    .replace(URL_PATTERN, "[link]")
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match: string, key: string) => `${key}=[redacted]`)
    .replace(LOCAL_PATH_PATTERN, "[local path]")
    .trim();

  return redacted.length > MAX_ERROR_DETAIL_LENGTH
    ? `${redacted.slice(0, MAX_ERROR_DETAIL_LENGTH - 3)}...`
    : redacted;
}

/** Documented. */
function BandScopeMark({ ariaLabel }: { ariaLabel: string }) {
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className="relative grid size-11 shrink-0 place-items-center rounded-full border border-cyan-200/45 bg-cyan-200/10 shadow-[0_0_28px_rgba(103,232,249,0.34)]"
    >
      <span className="absolute inset-1 rounded-full border border-teal-200/20" aria-hidden="true" />
      <span className="flex h-8 items-end gap-0.5" aria-hidden="true">
        {BRAND_BAR_HEIGHTS.map((height, index) => (
          <span
            key={`${height}-${index}`}
            className={`w-1.5 rounded-full bg-gradient-to-t from-teal-300 via-cyan-200 to-violet-300 ${height}`}
          />
        ))}
      </span>
    </span>
  );
}

/** Documented. */
function MetricCard({
  icon,
  label,
  value,
  detail,
  accent = "text-cyan-300"
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  accent?: string;
}) {
  return (
    <article className="group relative overflow-hidden rounded-lg border border-[color:var(--bandscope-border)] bg-[var(--bandscope-surface)] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-300/40">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_35%)] opacity-60 transition group-hover:opacity-100" />
      <div className="relative flex items-start gap-3">
        <div className={`rounded-xl bg-white/5 p-2 ${accent}`}>{icon}</div>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{value}</p>
          <p className="mt-1 text-sm text-slate-400">{detail}</p>
        </div>
      </div>
    </article>
  );
}

/** Documented. */
function sectionCountDetail(t: ReturnType<typeof createTranslator>, sectionCount: number): string {
  if (sectionCount === 0) {
    return t("metricConfidenceLocalAnalysis");
  }
  if (sectionCount === 1) {
    return `1 ${t("metricConfidenceSectionSingular")}`;
  }
  return `${sectionCount} ${t("metricConfidenceSectionPlural")}`;
}

/** Documented. */
function ConfidenceMetric({ song, t }: { song: RehearsalSong | null; t: ReturnType<typeof createTranslator> }) {
  const sectionCount = song?.sections.length ?? 0;
  const confidenceOrder = { high: 3, medium: 2, low: 1 } as const;
  let lowestConfidence: RehearsalSong["sections"][number]["confidence"]["level"] | null = null;
  if (song?.sections) {
    for (const section of song.sections) {
      if (!lowestConfidence || confidenceOrder[section.confidence.level] < confidenceOrder[lowestConfidence]) {
        lowestConfidence = section.confidence.level;
      }
      // Performance: Early break if we found the absolute minimum
      if (lowestConfidence === "low") {
        break;
      }
    }
  }
  const confidence = lowestConfidence ? `${lowestConfidence[0].toUpperCase()}${lowestConfidence.slice(1)}` : t("metricConfidenceReady");
  const detail = sectionCountDetail(t, sectionCount);

  return (
    <MetricCard
      icon={<Gauge className="size-5" aria-hidden="true" />}
      label={t("metricConfidenceLabel")}
      value={confidence}
      detail={detail}
      accent="text-emerald-300"
    />
  );
}

/** Documented. */
function priorityLabel(song: RehearsalSong | null, t: ReturnType<typeof createTranslator>): string {
  const firstFocus = song?.exportSummary?.focusSections?.[0];
  if (firstFocus) {
    return firstFocus;
  }
  return song?.sections?.[0]?.label ?? t("metricPriorityFallback");
}

/** Documented. */
export function App() {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const defaultRequest = useMemo(() => createDefaultAnalysisRequest(), []);
  const [jobStatus, setJobStatus] = useState<AnalysisJobStatus | null>(null);
  const [jobResult, setJobResult] = useState<RehearsalSong | null>(null);
  const [jobResultBootstrap, setJobResultBootstrap] = useState<ProjectBootstrapSummary | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [renderedProgressPercent, setRenderedProgressPercent] = useState<number | undefined>(undefined);
  const [isStarting, setIsStarting] = useState(false);
  const [selectedBootstrap, setSelectedBootstrap] = useState<ProjectBootstrapSummary | null>(null);
  const [activeAnalysisBootstrap, setActiveAnalysisBootstrap] = useState<ProjectBootstrapSummary | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [activeView, setActiveView] = useState<RehearsalView>("workspace");
  const activeJobIdRef = useRef<string | null>(null);
  const youtubeInputRef = useRef<HTMLInputElement | null>(null);

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
    activeJobIdRef.current = jobStatus?.jobId ?? null;
  }, [jobStatus?.jobId]);

  /** Documented. */
  const applyJobStatus = useCallback((nextStatus: AnalysisJobStatus) => {
    setJobStatus(nextStatus);
    if (nextStatus.state === "succeeded" && nextStatus.result) {
      setJobResult(nextStatus.result);
      setJobResultBootstrap(activeAnalysisBootstrap);
      setActiveAnalysisBootstrap(null);
      setJobError(null);
    }
    if (nextStatus.state === "failed") {
      setActiveAnalysisBootstrap(null);
      setJobError(safeErrorDetail(nextStatus.error?.message, t("analysisCouldNotStart")));
    }
  }, [activeAnalysisBootstrap, t]);

  useEffect(() => {
    const targetPercent = jobStatus?.progressPercent;
    if (targetPercent === undefined) {
      setRenderedProgressPercent(undefined);
      return;
    }
    if (jobStatus?.state === "failed" || jobStatus?.state === "succeeded") {
      setRenderedProgressPercent(targetPercent);
      return;
    }

    const currentPercent = renderedProgressPercent ?? 0;
    if (currentPercent >= targetPercent) {
      setRenderedProgressPercent(targetPercent);
      return;
    }

    const timer = window.setTimeout(() => {
      setRenderedProgressPercent((current) => {
        const base = current ?? 0;
        return Math.min(targetPercent, base + 1);
      });
    }, 20);
    return () => window.clearTimeout(timer);
  }, [jobStatus?.progressPercent, jobStatus?.state, renderedProgressPercent]);

  useEffect(() => {
    if (!jobStatus || (jobStatus.state !== "queued" && jobStatus.state !== "running")) {
      return;
    }

    let disposed = false;
    let unsubscribe: () => void = Function.prototype as () => void;
    void subscribeToAnalysisJobUpdates(jobStatus.jobId, (nextStatus) => {
      if (!disposed) {
        applyJobStatus(nextStatus);
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unsubscribe = cleanup;
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [applyJobStatus, jobStatus?.jobId, jobStatus?.state]);

  useEffect(() => {
    if (!jobStatus || (jobStatus.state !== "queued" && jobStatus.state !== "running")) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const nextStatus = await getAnalysisJobStatus(jobStatus.jobId);
        applyJobStatus(nextStatus);
      } catch (error) {
        if (error instanceof Error && error.message === "Invalid analysis job status response") {
          if (activeJobIdRef.current !== jobStatus.jobId) {
            return;
          }
          const fallbackMessage = t("analysisCouldNotStart");
          setJobError(fallbackMessage);
          setJobStatus({
            ...jobStatus,
            state: "failed",
            error: {
              code: "engine_unavailable",
              message: fallbackMessage
            }
          });
          return;
        }

        setJobStatus((currentStatus) =>
          currentStatus?.jobId === jobStatus.jobId &&
          (currentStatus.state === "queued" || currentStatus.state === "running")
            ? { ...currentStatus }
            : currentStatus
        );
      }
    }, ANALYSIS_POLL_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [applyJobStatus, jobStatus, t]);

  /** Documented. */
  const handleStartAnalysis = async () => {
    const submittedBootstrap = selectedBootstrap;
    setJobError(null);
    setJobResult(null);
    setJobResultBootstrap(null);
    setJobStatus(null);
    setActiveAnalysisBootstrap(submittedBootstrap);
    setIsStarting(true);
    try {
      const nextStatus = await startAnalysisJob(selectedRequest);
      if (nextStatus.state === "succeeded" && nextStatus.result) {
        setJobStatus(nextStatus);
        setJobResult(nextStatus.result);
        setJobResultBootstrap(submittedBootstrap);
        setActiveAnalysisBootstrap(null);
      } else {
        applyJobStatus(nextStatus);
      }
    } catch {
      setJobStatus(null);
      setActiveAnalysisBootstrap(null);
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
    setSelectionError(safeErrorDetail(selection.error.message, t("unsupportedLocalAudio")));
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

    if (!isSupportedYoutubeUrl(normalizedUrl)) {
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
        setSelectionError(safeErrorDetail(selection.error.message, t("youtubeImportFailed")));
      }
    } catch {
      setSelectionError(t("youtubeImportFailed"));
    } finally {
      setIsImporting(false);
    }
  };

  /** Documented. */
  const handleClearYoutubeUrl = () => {
    youtubeInputRef.current?.focus();
    setYoutubeUrl("");
  };

  /** Documented. */
  const handleLoadProject = async () => {
    try {
      const song = await loadProject();
      setJobResult(song);
      setJobResultBootstrap(null);
      setJobError(null);
      setSelectedBootstrap(null);
      setActiveAnalysisBootstrap(null);
      setJobStatus(null);
    } catch (e) {
      if (!isUserCancellation(e)) {
        setJobError(`${t("loadProjectFailedPrefix")}: ${safeErrorDetail(e, t("loadProjectFailedFallback"))}`);
      }
    }
  };

  /** Documented. */
  const handleSaveProject = async () => {
    try {
      await saveProject(jobResult!);
    } catch (e) {
      if (!isUserCancellation(e)) {
        setJobError(`${t("saveProjectFailedPrefix")}: ${safeErrorDetail(e, t("saveProjectFailedFallback"))}`);
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
      return <Workspace song={jobResult} sourceBootstrap={jobResultBootstrap} onSongUpdate={handleSongUpdate} />;
    }
    return <EmptyState />;
  };

  const currentView: RehearsalView = jobResult && activeView === "score" ? "score" : "workspace";

  /** Resolve label, enablement, and active state for one sidebar item. */
  const navButtonState = (item: (typeof NAV_ITEMS)[number]) => {
    const enabled = item.view === "workspace" || (item.view === "score" && jobResult !== null);
    return {
      label: t(item.labelKey),
      enabled,
      active: enabled && item.view === currentView,
      title: enabled ? undefined : item.view === "score" ? t("scoreNavDisabledHint") : t("comingSoon")
    };
  };

  /** Switch the main content to the clicked rehearsal view. */
  const handleNavSelect = (view: RehearsalView) => {
    setActiveView(view);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--bandscope-bg)] text-slate-100 selection:bg-cyan-300/30">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(15,120,255,0.22),transparent_28%),radial-gradient(circle_at_78%_0%,rgba(124,58,237,0.20),transparent_30%),linear-gradient(180deg,#07111f_0%,#020713_55%,#020611_100%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:46px_46px]" />

      <div className="relative flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-[color:var(--bandscope-border)] bg-[var(--bandscope-surface-strong)] px-5 py-5 shadow-[24px_0_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl lg:flex lg:flex-col">
          <div className="mb-7 flex items-center gap-2" aria-hidden="true">
            <span className="size-3 rounded-full bg-red-400" />
            <span className="size-3 rounded-full bg-amber-300" />
            <span className="size-3 rounded-full bg-emerald-400" />
          </div>

          <div className="mb-9 flex items-center gap-3">
            <BandScopeMark ariaLabel={t("brandMarkAriaLabel")} />
            <div>
              <div className="text-2xl font-black tracking-tight">
                Band<span className="text-cyan-300">Scope</span>
              </div>
              <div className="text-xs font-semibold uppercase text-slate-400">
                {t("rehearsalCockpit")}
              </div>
            </div>
          </div>

          <nav aria-label={t("primaryRehearsalViewsAriaLabel")} className="space-y-2">
            {NAV_ITEMS.map((item) => {
              const { label, enabled, active, title } = navButtonState(item);
              const { icon: Icon, view } = item;

              return (
                <button
                  key={item.labelKey}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  aria-disabled={enabled ? undefined : true}
                  title={title}
                  onClick={enabled && view ? () => handleNavSelect(view) : blockInactiveNavActivation}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                    active
                      ? "bg-blue-600/70 text-white shadow-[0_12px_30px_rgba(37,99,235,0.32)]"
                      : enabled
                        ? "text-slate-200 hover:bg-white/5"
                        : "cursor-not-allowed text-slate-500 opacity-70"
                  }`}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto space-y-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <CloudOff className="size-4 text-cyan-300" aria-hidden="true" />
                {t("localFirst")}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("localFirstDetail")}
              </p>
              <div className="mt-3 h-14 overflow-hidden rounded-xl bg-[linear-gradient(90deg,rgba(34,211,238,.12),rgba(124,58,237,.12))]">
                <div className="flex h-full items-end gap-0.5 px-2 pb-1" aria-hidden="true">
                  {Array.from({ length: 34 }).map((_, index) => (
                    <span
                      key={index}
                      className="w-1 rounded-t bg-gradient-to-t from-cyan-400 to-violet-400"
                      style={{ height: `${14 + ((index * 19) % 38)}px` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <button
                type="button"
                aria-disabled={true}
                aria-label={t("settingsComingSoon")}
                title={t("settingsComingSoon")}
                onClick={preventUnavailableAction}
                className="inline-flex cursor-not-allowed items-center justify-center rounded-xl p-2 text-slate-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <Settings className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-disabled={true}
                aria-label={t("helpComingSoon")}
                title={t("helpComingSoon")}
                onClick={preventUnavailableAction}
                className="inline-flex cursor-not-allowed items-center justify-center rounded-xl p-2 text-slate-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <CircleHelp className="size-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>

        <main id="main-content" className="max-h-screen min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
          <nav aria-label={t("compactRehearsalViewsAriaLabel")} className="mb-4 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/72 p-2 backdrop-blur-xl lg:hidden">
            {NAV_ITEMS.map((item) => {
              const { label, enabled, active, title } = navButtonState(item);
              const { icon: Icon, view } = item;

              return (
                <button
                  key={item.labelKey}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  aria-label={`${label} ${t("compactViewSuffix")}`}
                  aria-disabled={enabled ? undefined : true}
                  title={title}
                  onClick={enabled && view ? () => handleNavSelect(view) : blockInactiveNavActivation}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                    active
                      ? "bg-blue-600/70 text-white"
                      : enabled
                        ? "text-slate-200 hover:bg-white/5"
                        : "cursor-not-allowed text-slate-500 opacity-70"
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </nav>

          <section aria-label={t("sourceControlsAriaLabel")} className="mb-4 rounded-3xl border border-white/10 bg-slate-950/72 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.25)] backdrop-blur-xl">
            <div className="grid gap-4 2xl:grid-cols-[1.4fr_minmax(0,1fr)_auto] 2xl:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-300">
                  {jobResult ? t("statusReadyRehearsal") : t("statusSyncedLocal")}
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
                  {jobResult ? t("rehearsalConsoleTitle") : t("workspaceHomeTitle")}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  {jobResult?.exportSummary?.headline ?? t("workspaceHomeSummary")}
                </p>
              </div>

              <div className="grid min-w-0 gap-3 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-center">
                <Button
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
                  <div className="flex min-w-0 items-center gap-2">
                    <Music2 className="ml-2 size-4 shrink-0 text-rose-300" aria-hidden="true" />
                    <div className="relative min-w-0 flex-1">
                      <Input
                        ref={youtubeInputRef}
                        type="text"
                        placeholder={t("youtubePlaceholder")}
                        value={youtubeUrl}
                        maxLength={MAX_YOUTUBE_URL_LENGTH}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        disabled={analysisInFlight || isStarting || isImporting}
                        className="h-10 w-full border-0 bg-transparent pr-9 text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-300"
                        aria-label={t("youtubeUrlAriaLabel")}
                      />
                      {youtubeUrl && !analysisInFlight && !isStarting && !isImporting ? (
                        <button
                          type="button"
                          onClick={handleClearYoutubeUrl}
                          className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                          aria-label={t("clearYoutubeUrl")}
                          title={t("clearYoutubeUrl")}
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    onClick={handleImportYoutube}
                    disabled={!youtubeUrl || analysisInFlight || isStarting || isImporting}
                    variant="outline"
                    className="min-h-10 w-full border-white/10 bg-white/5 font-semibold text-slate-100 hover:bg-white/10 hover:text-white sm:w-auto"
                    aria-label={t("importYoutube")}
                  >
                    {isImporting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
                    {isImporting ? t("importingYoutube") : t("importYoutube")}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 2xl:flex 2xl:flex-wrap 2xl:justify-end">
                <Button
                  onClick={handleLoadProject}
                  disabled={analysisInFlight || isStarting}
                  variant="outline"
                  className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100 hover:bg-white/10 hover:text-white"
                  aria-label={t("openProject")}
                >
                  <FolderOpen className="mr-2 size-4" aria-hidden="true" />
                  {t("openProject")}
                </Button>
                {jobResult ? (
                  <Button
                    onClick={handleSaveProject}
                    variant="outline"
                    className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100 hover:bg-white/10 hover:text-white"
                    aria-label={t("saveProject")}
                  >
                    <Save className="mr-2 size-4" aria-hidden="true" />
                    {t("saveProject")}
                  </Button>
                ) : (
                  <span tabIndex={0} role="button" aria-disabled="true" title={t("saveRequiresAnalysis")} className="inline-block cursor-not-allowed rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                    <Button
                      disabled
                      variant="outline"
                      className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100"
                      aria-label={t("saveProject")}
                    >
                      <Save className="mr-2 size-4" aria-hidden="true" />
                      {t("saveProject")}
                    </Button>
                  </span>
                )}
                <Button
                  onClick={handleStartAnalysis}
                  disabled={analysisInFlight || isStarting || !selectedBootstrap || isImporting}
                  size="lg"
                  className="min-h-11 bg-gradient-to-r from-cyan-400 to-violet-500 font-black text-slate-950 shadow-[0_14px_38px_rgba(34,211,238,0.28)] hover:from-cyan-300 hover:to-violet-400"
                  aria-label={isStarting ? t("startingAnalysis") : t("startAnalysis")}
                >
                  {isStarting ? (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="mr-2 size-4 fill-current" aria-hidden="true" />
                  )}
                  {isStarting ? t("startingAnalysis") : t("startAnalysis")}
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-slate-400 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <span className="mr-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">{t("formatsLabel")}</span>
                {SUPPORTED_AUDIO_FORMATS.join(", ")}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {selectedBootstrap && (
                  <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 font-semibold text-emerald-200" title={selectedBootstrap.source.fileName}>
                    {selectedBootstrap.source.fileName}
                  </div>
                )}

                {jobStatus && (
                  <div
                    className="min-w-52 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 font-semibold text-cyan-100"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <div className="flex items-center gap-2">
                      {jobStatus.state === "running" && <span className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-cyan-100/30 border-t-cyan-200" />}
                      <span className="min-w-0 flex-1 truncate">{progressMessage(t, jobStatus)}</span>
                      {jobStatus.progressPercent !== undefined && (
                        <span className="shrink-0 tabular-nums text-cyan-50/80">
                          {(renderedProgressPercent ?? jobStatus.progressPercent)}%
                        </span>
                      )}
                    </div>
                    {jobStatus.progressPercent !== undefined && (
                      <Progress
                        aria-label={t("analysisProgressAriaLabel")}
                        value={renderedProgressPercent ?? jobStatus.progressPercent}
                        className="mt-2"
                      />
                    )}
                  </div>
                )}

                {selectionError && (
                  <div className="rounded-full border border-rose-300/25 bg-rose-400/10 px-3 py-1 font-semibold text-rose-100" role="alert" aria-live="assertive" aria-atomic="true">
                    {selectionError}
                  </div>
                )}
              </div>
            </div>
          </section>

          <header aria-label={t("analysisSummaryAriaLabel")} className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard icon={<Clock3 className="size-5" aria-hidden="true" />} label={t("metricTempoLabel")} value={t("metricPendingValue")} detail={t("metricTempoPendingDetail")} accent="text-sky-300" />
            <MetricCard icon={<KeyRound className="size-5" aria-hidden="true" />} label={t("metricKeyLabel")} value={t("metricPendingValue")} detail={t("metricKeyPendingDetail")} accent="text-cyan-300" />
            <MetricCard icon={<Wand2 className="size-5" aria-hidden="true" />} label={t("metricTransposeLabel")} value={t("metricPendingValue")} detail={t("metricTransposePendingDetail")} accent="text-blue-300" />
            <ConfidenceMetric song={jobResult} t={t} />
            <MetricCard icon={<Star className="size-5 fill-amber-300 text-amber-300" aria-hidden="true" />} label={t("metricPriorityLabel")} value={priorityLabel(jobResult, t)} detail={jobResult?.exportSummary?.headline ?? t("metricPriorityPendingDetail")} accent="text-amber-300" />
          </header>

          <section className="animate-in fade-in duration-500 ease-out fill-mode-both">
            {currentView === "score" && jobResult ? (
              <ScoreView
                song={jobResult}
                projectId={jobResultBootstrap?.projectId ?? null}
                onSongUpdate={handleSongUpdate}
              />
            ) : (
              renderWorkspaceState()
            )}
          </section>
        </main>
      </div>

      <Toaster />
    </div>
  );
}
