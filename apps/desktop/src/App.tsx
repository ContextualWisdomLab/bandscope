import { useEffect, useMemo, useState } from "react";
import {
  SUPPORTED_AUDIO_FORMATS,
  type AnalysisJobStatus,
  type RehearsalSong
} from "@bandscope/shared-types";
import { ChordsFeature } from "./features/chords";
import { HomeFeature } from "./features/home";
import { PlayerFeature } from "./features/player";
import { RangesFeature } from "./features/ranges";
import { SettingsFeature } from "./features/settings";
import {
  createDefaultAnalysisRequest,
  getAnalysisJobStatus,
  startAnalysisJob
} from "./lib/analysis";
import { createTranslator, detectPreferredLocale } from "./i18n";

const ANALYSIS_POLL_INTERVAL_MS = 250;

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

function renderSong(
  song: RehearsalSong,
  sectionConfidenceLabel: string,
  roleConfidenceLabel: string,
  harmonySourceLabel: string,
  manualOverrideLabel: string,
  confidenceLabels: Record<"low" | "medium" | "high", string>,
  provenanceLabels: Record<"model" | "user", string>
) {
  return (
    <>
      <section>
        <h2>{song.title}</h2>
        <p>{song.exportSummary.headline}</p>
      </section>
      {song.sections.map((section) => (
        <section key={section.id}>
          <h3>{section.label}</h3>
          <p>{section.groove}</p>
          <p>
            {sectionConfidenceLabel}: {confidenceLabels[section.confidence.level]} ({provenanceLabels[section.confidence.source]})
          </p>
          <ul>
            {section.roles.map((role) => (
              <li key={role.id}>
                <strong>{role.name}</strong>
                <span> - {role.harmony.chord}</span>
                <span> - {role.cue.value}</span>
                <span> - {roleConfidenceLabel}: {confidenceLabels[role.confidence.level]}</span>
                <span> - {harmonySourceLabel}: {provenanceLabels[role.harmony.source]}</span>
                {role.manualOverrides.map((override, index) => (
                  <span key={`${override.field}-${override.source}-${override.value.chord}-${index}`}>
                    {" "}
                    - {manualOverrideLabel}: {override.value.chord} ({provenanceLabels[override.source]})
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function App() {
  const t = createTranslator(detectPreferredLocale());
  const defaultRequest = useMemo(() => createDefaultAnalysisRequest(), []);
  const [jobStatus, setJobStatus] = useState<AnalysisJobStatus | null>(null);
  const [jobResult, setJobResult] = useState<RehearsalSong | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const confidenceLabels = {
    low: t("confidenceLevelLow"),
    medium: t("confidenceLevelMedium"),
    high: t("confidenceLevelHigh")
  } as const;
  const provenanceLabels = {
    model: t("provenanceSourceModel"),
    user: t("provenanceSourceUser")
  } as const;
  const analysisInFlight = jobStatus?.state === "queued" || jobStatus?.state === "running";

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
        setJobError(t("analysisCouldNotStart"));
      }
    }, ANALYSIS_POLL_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [jobStatus]);

  const handleStartAnalysis = async () => {
    setJobError(null);
    setJobResult(null);
    setJobStatus(null);
    try {
      const nextStatus = await startAnalysisJob(defaultRequest);
      setJobStatus(nextStatus);
      if (nextStatus.state === "succeeded" && nextStatus.result) {
        setJobResult(nextStatus.result);
      }
      if (nextStatus.state === "failed") {
        setJobError(nextStatus.error?.message ?? t("analysisCouldNotStart"));
      }
    } catch {
      setJobError(t("analysisCouldNotStart"));
    }
  };

  return (
    <main>
      <h1>{t("appTitle")}</h1>
      <p>{t("appSubtitle")}</p>
      <p>
        {t("supportedFormats")}: {SUPPORTED_AUDIO_FORMATS.join(", ")}
      </p>
      <button type="button" onClick={handleStartAnalysis} disabled={analysisInFlight}>{t("startAnalysis")}</button>
      {jobStatus ? <p>{progressMessage(t, jobStatus.state)}</p> : null}
      {jobError ? <p>{jobError}</p> : null}
      {jobResult
        ? renderSong(
            jobResult,
            t("sectionConfidence"),
            t("roleConfidence"),
            t("harmonySource"),
            t("manualOverride"),
            confidenceLabels,
            provenanceLabels
          )
        : null}
      <HomeFeature title={t("homeCard")} />
      <PlayerFeature title={t("playerCard")} />
      <ChordsFeature title={t("chordsCard")} />
      <RangesFeature title={t("rangesCard")} />
      <SettingsFeature title={t("settingsCard")} />
    </main>
  );
}
