import type { RehearsalSong, RehearsalRole } from "@bandscope/shared-types";
import { useEffect, useId, useMemo, useState } from "react";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle2, Music2, Wand2, Lightbulb, Info } from "lucide-react";

const COUNT_IN_BEATS = 4;

interface SectionRoadmapProps {
  song: RehearsalSong;
  activeRole: string | null; // null means all roles
  onSongUpdate?: (song: RehearsalSong) => void;
  loopedSectionIndex?: number | null;
}

/** Format a timeline instant as m:ss for rehearsal cards. */
function formatTimelineTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds >= 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Fill count-in copy with a section label and its start–end window. */
function countInCopy(
  template: string,
  section: RehearsalSong["sections"][number]
): string {
  return template
    .replace("{label}", section.label)
    .replace("{start}", formatTimelineTime(section.timeRange.start))
    .replace("{end}", formatTimelineTime(section.timeRange.end));
}

/** Return milliseconds per beat when the analyzed tempo can drive a count-in. */
function countInBeatMs(tempo: number | undefined): number | null {
  if (typeof tempo !== "number" || !Number.isFinite(tempo) || tempo <= 0) {
    return null;
  }

  return 60_000 / tempo;
}

/** Return the renderer-owned position of the section this player should count in tonight. */
function firstCountInSectionIndex(
  song: RehearsalSong,
  activeRole: string | null,
  loopedSectionIndex: number | null
): number | undefined {
  if (
    loopedSectionIndex !== null &&
    Number.isSafeInteger(loopedSectionIndex) &&
    loopedSectionIndex >= 0 &&
    loopedSectionIndex < song.sections.length
  ) {
    return loopedSectionIndex;
  }

  if (activeRole) {
    const forRoleIndex = song.sections.findIndex((section) =>
      section.roles.some((role) => role.id === activeRole)
    );
    if (forRoleIndex !== -1) {
      return forRoleIndex;
    }
  }

  return song.sections.length > 0 ? 0 : undefined;
}

/** Render the rehearsal section roadmap and optional tempo-driven count-in. */
export function SectionRoadmap({
  song,
  activeRole,
  onSongUpdate,
  loopedSectionIndex = null
}: SectionRoadmapProps) {
  const sectionRoadmapTitleId = useId();
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const countInSectionIndex = firstCountInSectionIndex(song, activeRole, loopedSectionIndex);
  const countInSection =
    countInSectionIndex === undefined ? undefined : song.sections[countInSectionIndex];
  const beatMs = countInBeatMs(song.tempo);
  const [countInPhase, setCountInPhase] = useState<"idle" | "counting" | "ready">("idle");
  const [countInBeat, setCountInBeat] = useState(0);

  useEffect(() => {
    setCountInPhase("idle");
    setCountInBeat(0);
  }, [countInSectionIndex]);

  useEffect(() => {
    if (countInPhase !== "counting") {
      return;
    }

    if (beatMs === null) {
      setCountInPhase("idle");
      setCountInBeat(0);
      return;
    }

    if (countInBeat >= COUNT_IN_BEATS) {
      const readyTimer = window.setTimeout(() => {
        setCountInPhase("ready");
      }, beatMs);
      return () => window.clearTimeout(readyTimer);
    }

    const nextTimer = window.setTimeout(() => {
      setCountInBeat((current) => current + 1);
    }, beatMs);
    return () => window.clearTimeout(nextTimer);
  }, [beatMs, countInBeat, countInPhase]);

  /** Build the localized accessible label for a role's chord-edit control. */
  const editChordLabel = (role: RehearsalRole, sectionLabel: string): string => {
    return t("chordEditAriaLabel")
      .replace("{roleName}", role.name)
      .replace("{sectionLabel}", sectionLabel)
      .replace("{chord}", role.harmony.chord);
  };

  /** Apply a user-entered chord override to the matching role. */
  const handleChordEdit = (sectionId: string, role: RehearsalRole) => {
    if (!onSongUpdate) return;
    const newChord = window.prompt(t("chordEditPrompt"), role.harmony.chord);
    if (newChord === null) return;

    const trimmedChord = newChord.trim();
    if (trimmedChord === "" || trimmedChord === role.harmony.chord) return;

    let changed = false;
    const updatedSong = {
      ...song,
      sections: song.sections.map((section) => {
        if (section.id !== sectionId) return section;

        return {
          ...section,
          roles: section.roles.map((targetRole) => {
            if (targetRole.id !== role.id) return targetRole;
            changed = true;

            const harmony = {
              ...targetRole.harmony,
              chord: trimmedChord,
              source: "user" as const
            };

            return {
              ...targetRole,
              harmony,
              manualOverrides: [
                ...targetRole.manualOverrides.filter((override) => override.field !== "harmony"),
                {
                  field: "harmony" as const,
                  value: { ...harmony, source: "user" as const },
                  source: "user" as const
                }
              ]
            };
          })
        };
      })
    };

    if (changed) onSongUpdate(updatedSong);
  };

  /** Return the visual treatment for a rehearsal priority. */
  const getPriorityColor = (priority: string) => {
    if (priority === "high") return "border-rose-400 bg-rose-400/[0.08] shadow-[0_0_30px_rgba(251,113,133,0.10)]";
    if (priority === "medium") return "border-amber-300 bg-amber-300/[0.08] shadow-[0_0_30px_rgba(252,211,77,0.08)]";
    return "border-emerald-300 bg-emerald-300/[0.08] shadow-[0_0_30px_rgba(110,231,183,0.08)]";
  };

  /** Return the icon that communicates rehearsal priority. */
  const getPriorityIcon = (priority: string) => {
    if (priority === "high") return <AlertCircle className="size-4 text-rose-300" aria-hidden="true" />;
    if (priority === "medium") return <Info className="size-4 text-amber-200" aria-hidden="true" />;
    return <CheckCircle2 className="size-4 text-emerald-200" aria-hidden="true" />;
  };

  /** Start a four-beat count-in on tonight's section at the analyzed tempo. */
  const startCountIn = (): void => {
    if (!countInSection || beatMs === null) {
      return;
    }

    setCountInPhase("counting");
    setCountInBeat(1);
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 id={sectionRoadmapTitleId} className="flex items-center text-xl font-black tracking-tight text-white">
          <Music2 className="mr-2 size-5 text-cyan-300" aria-hidden="true" />
          {t("sectionRoadmapTitle")}
        </h2>
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("sectionRoadmapScrollHint")}</span>
      </div>

      <div
        className="hide-scrollbar flex snap-x snap-mandatory gap-6 overflow-x-auto rounded-xl pb-6 pt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        role="region"
        tabIndex={0}
        aria-labelledby={sectionRoadmapTitleId}
      >
        {song.sections.map((section, sectionIndex) => (
          <Card
            key={`${section.id}-${sectionIndex}`}
            id={`workspace-section-card-${sectionIndex}`}
            tabIndex={-1}
            className={`w-80 flex-none shrink-0 snap-start overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_80px_rgba(0,0,0,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
              countInSectionIndex === sectionIndex
                ? "border-cyan-300/50 bg-cyan-950/40 ring-2 ring-cyan-300/70"
                : section.confidence.level === "low"
                  ? "border-rose-300/30 bg-rose-950/30"
                  : "border-white/10 bg-slate-950/80"
            }`}
          >
            <CardHeader className="border-b border-white/10 bg-white/[0.04] p-5 pb-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-lg font-black tracking-tight text-white">{section.label}</h3>
                <ConfidenceBadge level={section.confidence.level} />
              </div>
              <div className="flex items-center text-sm font-medium text-slate-300">
                <span className="mr-2 text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">{t("sectionGrooveLabel")}</span>
                {section.groove}
              </div>
              {countInSectionIndex === sectionIndex ? (
                <div className="mt-3 space-y-2">
                  <Button
                    type="button"
                    disabled={beatMs === null || countInPhase === "counting"}
                    aria-label={
                      beatMs === null
                        ? t("workspaceCountInNeedsTempo")
                        : countInCopy(t("workspaceCountInAria"), section)
                    }
                    title={
                      beatMs === null
                        ? t("workspaceCountInNeedsTempo")
                        : countInCopy(t("workspaceCountInAria"), section)
                    }
                    onClick={startCountIn}
                    variant="outline"
                    className="min-h-11 w-full border-cyan-300/30 bg-cyan-300/10 font-semibold text-cyan-50 hover:bg-cyan-300/20 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-400"
                  >
                    {countInCopy(t("workspaceCountInAction"), section)}
                  </Button>
                  {countInPhase === "counting" ? (
                    <p
                      className="text-sm font-semibold text-cyan-100"
                      role="status"
                      aria-live="polite"
                      aria-label={t("workspaceCountInBeatAria").replace("{beat}", String(countInBeat))}
                      data-testid="workspace-count-in-beat"
                    >
                      {t("workspaceCountInCounting")
                        .replace("{label}", section.label)
                        .replace("{beat}", String(countInBeat))}
                    </p>
                  ) : null}
                  {countInPhase === "ready" ? (
                    <p className="text-sm font-semibold text-cyan-100" role="status" aria-live="polite">
                      {countInCopy(t("workspaceCountInReady"), section)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {section.roles
                .filter(role => !activeRole || role.id === activeRole)
                .map(role => (
                  <div
                    key={role.id}
                    className={`rounded-xl border-l-4 p-4 transition-all hover:translate-x-1 ${getPriorityColor(role.rehearsalPriority)}`}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold text-slate-100">
                          {role.name}
                        </span>
                        {role.confidence.level === "low" && (
                          <Badge variant="outline" className="border-rose-300/30 bg-rose-400/10 px-1.5 py-0 text-[0.65rem] font-semibold text-rose-100">
                            {t("confidenceLevelLow")}
                          </Badge>
                        )}
                      </div>
                      <div title={`${t("priorityLabel")}: ${role.rehearsalPriority}`} className="rounded-full border border-white/10 bg-white/10 p-1 shadow-sm">
                        <span className="sr-only">{`${t("priorityLabel")}: ${role.rehearsalPriority}`}</span>
                        {getPriorityIcon(role.rehearsalPriority)}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">{t("sectionChordLabel")}</span>
                        <button
                          type="button"
                          aria-label={editChordLabel(role, section.label)}
                          className={`-ml-2 rounded px-2 py-0.5 text-lg font-black tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                            onSongUpdate
                              ? "cursor-pointer hover:bg-white/10"
                              : "cursor-default"
                          } ${
                            role.harmony.source === "user"
                              ? "bg-indigo-300/15 text-indigo-200"
                              : "text-cyan-100"
                          }`}
                          onClick={() => handleChordEdit(section.id, role)}
                          title={onSongUpdate ? t("chordEditTitle") : undefined}
                          disabled={!onSongUpdate}
                        >
                          {role.harmony.chord}
                        </button>
                        {role.harmony.source === "user" && (
                          <Badge variant="secondary" className="h-4 bg-indigo-300/20 px-1 text-[0.6rem] text-indigo-100 hover:bg-indigo-300/20">
                            {t("harmonySourceUserBadge")}
                          </Badge>
                        )}
                      </div>

                      <Separator className="bg-white/10" />

                      <div className="space-y-2">
                        <div className="text-sm font-medium leading-snug text-slate-200">
                          <span className="mb-0.5 block text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">{t("sectionCueLabel")}</span>
                          {role.cue.value}
                        </div>

                        {role.setupNote && (
                          <div className="flex items-start gap-2 rounded-md border border-amber-300/20 bg-amber-300/[0.08] p-2 text-xs font-medium text-amber-100">
                            <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                            <span className="leading-snug">{role.setupNote}</span>
                          </div>
                        )}

                        {role.simplification && (
                          <div className="flex items-start gap-2 rounded-md border border-indigo-300/20 bg-indigo-300/[0.08] p-2 text-xs font-medium text-indigo-100">
                            <Wand2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                            <span className="leading-snug">{role.simplification}</span>
                          </div>
                        )}

                        {role.overlapWarnings.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {role.overlapWarnings.map((warning, wIdx) => (
                              <div key={wIdx} className="flex items-start gap-2 rounded-md border border-rose-300/20 bg-rose-300/[0.08] p-2 text-xs font-medium text-rose-100">
                                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                                <span className="leading-snug">{warning}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
