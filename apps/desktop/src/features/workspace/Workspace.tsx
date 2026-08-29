import { useState, useMemo, memo, type MouseEvent } from "react";
import { parseProjectBootstrapSummary, type ProjectBootstrapSummary, type RehearsalSong, type RehearsalRole } from "@bandscope/shared-types";
import { RoleSwitcher } from "./RoleSwitcher";
import { SectionRoadmap } from "./SectionRoadmap";
import { GrooveMap } from "./GrooveMap";
import { PracticeProgress } from "./PracticeProgress";
import { fillRangeCopy, firstRangeSqueeze } from "./firstRangeSqueeze";
import { TapTempo } from "./TapTempo";
import { songNeedsTapTempo } from "./tapTempo";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { generateCueSheetCsv, generateChartSummaryJson, generateMetadataHandoffJson, sanitizeFilename } from "../../lib/export";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Download, CheckCheck, ClipboardList, MessageSquareMore, CloudOff, Music4 } from "lucide-react";

interface WorkspaceProps {
  song: RehearsalSong;
  sourceBootstrap?: ProjectBootstrapSummary | null;
  onSongUpdate?: (song: RehearsalSong) => void;
}

/** Documented. */
function formatTimelineTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds >= 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Documented. */
function downloadTextFile(contents: string, type: string, filename: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type Translator = ReturnType<typeof createTranslator>;

/** Documented. */
function preventUnavailableAction(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
}

/** Documented. */
function formatStatusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

/** Documented. */
function nonBlankText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Documented. */
function safeProjectBootstrapSummary(value: ProjectBootstrapSummary | null): ProjectBootstrapSummary | null {
  if (!value) {
    return null;
  }

  try {
    return parseProjectBootstrapSummary(value);
  } catch {
    return null;
  }
}

/** Documented. */
const SongStructure = memo(function SongStructure({ sections, t }: { sections: RehearsalSong["sections"]; t: Translator }) {
  return (
    <section className="rounded-3xl border border-cyan-300/20 bg-slate-950/72 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.24)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-200">{t("workspaceSongStructureLabel")}</h3>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">{t("workspaceRehearsalTimelineLabel")}</span>
      </div>

      <div
        role="region"
        tabIndex={0}
        className="overflow-x-auto rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(8,18,35,0.96),rgba(2,6,23,0.98))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        aria-label="Scrollable song structure timeline"
      >
        <div
          className="grid min-w-[720px]"
          data-testid="song-structure-grid"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, sections.length)}, minmax(8rem, 1fr))` }}
        >
          {sections.map((section) => (
            <div key={section.id} className="border-r border-white/10 bg-cyan-300/[0.05] px-3 py-3 last:border-r-0">
              <p className="text-sm font-black text-white">
                {section.label} · {formatTimelineTime(section.timeRange.start)}–{formatTimelineTime(section.timeRange.end)}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-400">{section.groove}</p>
            </div>
          ))}
        </div>

        <div className="relative min-w-[720px] border-t border-white/10 px-3 py-6" aria-hidden="true">
          <div className="flex h-24 items-center gap-1 overflow-hidden">
            {Array.from({ length: 84 }, (_, index) => (
              <span
                key={index}
                className="w-1 flex-none rounded-full bg-gradient-to-t from-cyan-500 via-sky-400 to-violet-400 opacity-85"
                style={{ height: `${18 + ((index * 23) % 62)}px` }}
              />
            ))}
          </div>
          <div className="absolute inset-x-3 top-1/2 h-px bg-cyan-200/20" />
        </div>
      </div>
    </section>
  );
});

/** Documented. */
export function Workspace({ song, sourceBootstrap = null, onSongUpdate }: WorkspaceProps) {
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);

  // Extract all unique roles from the song's sections
  const roleMap = useMemo(() => {
    const map = new Map<string, RehearsalRole>();
    song.sections.forEach(section => {
      section.roles.forEach(role => {
        if (!map.has(role.id)) {
          map.set(role.id, role);
        }
      });
    });
    return map;
  }, [song]);

  const allRoles = useMemo(() => {
    // Performance: Avoid O(N) allocation of intermediate array from Array.from() before mapping
    const roles: { id: string; name: string }[] = [];
    for (const role of roleMap.values()) {
      roles.push({ id: role.id, name: role.name });
    }
    return roles;
  }, [roleMap]);

  // Performance: use the cached roleMap so activeRoleDetails does not rescan sections and roles on every render.
  const activeRoleDetails = useMemo(() => {
    if (!activeRole) return undefined;
    return roleMap.get(activeRole);
  }, [activeRole, roleMap]);
  const canTranscribeBass = activeRoleDetails?.name.toLowerCase().includes("bass") ?? false;
  const firstRange = useMemo(() => firstRangeSqueeze(song, activeRole), [activeRole, song]);
  const firstRangeCopy = firstRange
    ? fillRangeCopy(
        t(firstRange.overlapWarning ? "workspaceFirstRangeClash" : "workspaceFirstRangeCheck"),
        {
          roleName: firstRange.roleName,
          lowestNote: firstRange.lowestNote,
          highestNote: firstRange.highestNote,
          sectionLabel: firstRange.sectionLabel
        }
      )
    : t("workspaceFirstRangeMissing");

  /** Handle the practice progress change internally by immutably updating the song state. */
  const handlePracticeProgressChange = (newProgress: number) => {
    if (!activeRole || !onSongUpdate) return;

    // Performance: Use shallow copying to avoid expensive structuredClone
    const nextSong = {
      ...song,
      sections: song.sections.map(section => {
        const roleIndex = section.roles.findIndex(r => r.id === activeRole);
        if (roleIndex === -1) return section;

        const nextRoles = [...section.roles];
        nextRoles[roleIndex] = {
          ...nextRoles[roleIndex]!,
          practiceProgress: newProgress
        };

        return {
          ...section,
          roles: nextRoles
        };
      })
    };

    onSongUpdate(nextSong);
  };
  const collaborationAssignments = useMemo(
    () => (Array.isArray(song.collaboration?.assignments) ? song.collaboration.assignments : []),
    [song.collaboration]
  );
  const collaborationComments = useMemo(
    () => (Array.isArray(song.collaboration?.comments) ? song.collaboration.comments : []),
    [song.collaboration]
  );
  const collaborationApprovals = useMemo(
    () => (Array.isArray(song.collaboration?.approvals) ? song.collaboration.approvals : []),
    [song.collaboration]
  );
  const collaborationSummary = useMemo(
    () => ({
      assignments: collaborationAssignments.length,
      comments: collaborationComments.length,
      approvals: collaborationApprovals.length
    }),
    [collaborationApprovals.length, collaborationAssignments.length, collaborationComments.length]
  );
  const activeRoleAssignments = useMemo(
    () => collaborationAssignments.filter(assignment => assignment.roleId === undefined || assignment.roleId === activeRole),
    [activeRole, collaborationAssignments]
  );
  const activeRoleComments = useMemo(
    () => collaborationComments.filter(comment => comment.roleId === undefined || comment.roleId === activeRole),
    [activeRole, collaborationComments]
  );
  const roleHarmonicExplanation =
    nonBlankText(activeRoleDetails?.harmonicExplanation) ??
    nonBlankText(activeRoleDetails?.harmony.functionLabel) ??
    t("workspaceHarmonyExplainFallback");
  const roleTranspositionPlan =
    nonBlankText(activeRoleDetails?.transpositionPlan) ??
    nonBlankText(activeRoleDetails?.simplification);

  /** Documented. */
  const handleExportCueSheet = () => {
    const csv = generateCueSheetCsv(song);
    downloadTextFile(csv, "text/csv;charset=utf-8;", `${sanitizeFilename(song.title)}_cuesheet.csv`);
  };

  /** Documented. */
  const handleExportChart = () => {
    const json = generateChartSummaryJson(song);
    downloadTextFile(json, "application/json;charset=utf-8;", `${sanitizeFilename(song.title)}_chart.json`);
  };

  /** Documented. */
  const handleExportHandoff = () => {
    const parsedSourceBootstrap = safeProjectBootstrapSummary(sourceBootstrap);
    const json = generateMetadataHandoffJson(song, {
      sourceBootstrap: parsedSourceBootstrap,
      workspaceId: song.id,
      workspaceTitle: song.title
    });
    downloadTextFile(json, "application/json;charset=utf-8;", `${sanitizeFilename(song.title)}_handoff.json`);
  };

  return (
    <div className="animate-in space-y-6 fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both">
      <Card className="overflow-hidden border-white/10 bg-slate-950/78 text-slate-100 shadow-[0_24px_90px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
        <CardHeader className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 pb-6 md:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">{t("workspaceRehearsalMapLabel")}</p>
                {song.tempo && (
                  <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-0.5 text-[0.65rem] font-bold text-cyan-100">
                    {t("workspaceTempoLabel")}: {song.tempo} BPM
                  </span>
                )}
              </div>
              <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">{song.title}</h2>
              <CardDescription className="text-base font-medium text-slate-300">
              {song.exportSummary?.headline || t("workspaceRehearsalFallback")}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCueSheet}
                className="min-h-10 border-cyan-300/30 bg-cyan-300/10 font-semibold text-cyan-50 shadow-[0_10px_30px_rgba(34,211,238,0.16)] hover:bg-cyan-300/20 hover:text-white"
            >
                <Download className="mr-2 size-4 text-cyan-200" aria-hidden="true" />
              Export Cue Sheet (CSV)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportChart}
                className="min-h-10 border-white/10 bg-white/5 font-semibold text-slate-100 shadow-sm hover:bg-white/10 hover:text-white"
            >
                <Download className="mr-2 size-4 text-slate-300" aria-hidden="true" />
              Export Chart (JSON)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportHandoff}
              className="min-h-10 border-teal-300/25 bg-teal-300/10 font-semibold text-teal-50 shadow-sm hover:bg-teal-300/20 hover:text-white"
            >
              <Download className="mr-2 size-4 text-teal-200" aria-hidden="true" />
              Export Handoff (JSON)
            </Button>
          </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.86))] p-5 md:p-7">
          <section
            className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/[0.07] p-4"
            data-testid="first-range-squeeze"
            aria-label={t("workspaceFirstRangeTitle")}
          >
            <p className="text-xs font-black uppercase tracking-[0.24em] text-fuchsia-200">{t("workspaceFirstRangeTitle")}</p>
            <p className="mt-2 text-sm leading-6 text-slate-100">{firstRangeCopy}</p>
          </section>
          {songNeedsTapTempo(song) ? <TapTempo t={t} /> : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4 md:col-span-2">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">{t("workspaceSongTimelineLabel")}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {song.sections.length} section{song.sections.length === 1 ? "" : "s"} mapped with groove, role cues, and chord confidence notes.
              </p>
            </section>

            <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4 md:col-span-2 xl:col-span-1">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">{t("workspaceCollaborationLabel")}</p>
              {song.collaboration ? (
                <div className="mt-2 space-y-3 text-sm leading-6 text-slate-300">
                  <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">{collaborationSummary.assignments} {t("workspaceAssignmentsLabel")}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">{collaborationSummary.comments} {t("workspaceCommentsLabel")}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">{collaborationSummary.approvals} {t("workspaceApprovalsLabel")}</span>
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                    <CloudOff className="mt-0.5 size-4 shrink-0 text-emerald-200" aria-hidden="true" />
                    <div>
                      <p className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-emerald-200">{t("workspaceSyncStatusLabel")}</p>
                      <p>{song.collaboration.syncNote}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-300">{t("workspaceCollaborationEmpty")}</p>
              )}
            </section>

            <section className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.06] p-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-200">{t("workspaceStemsLabel")}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Stem lanes will appear when separation results are available.</p>
            </section>

            <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("workspaceRehearsalPrioritiesLabel")}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Focus: {song.exportSummary?.focusSections?.join(", ") || song.sections[0]?.label || "first pass"}.
              </p>
            </section>
          </div>

          <SongStructure sections={song.sections} t={t} />

          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-300">{t("workspaceRolesHarmonyLabel")}</p>
                <p className="mt-1 text-sm text-slate-400">Filter the board by player or vocal role without losing the full form context.</p>
              </div>
              <RoleSwitcher
                roles={allRoles}
                activeRole={activeRole}
                onRoleChange={setActiveRole}
                />
            </div>

            {activeRole && (
              <div className="mb-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">Stem Player</p>
                <p className="mt-1 text-sm font-semibold text-slate-100">{activeRoleDetails?.name ?? activeRole}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    aria-disabled={true}
                    aria-label="Play stem coming soon"
                    title="Play stem coming soon"
                    onClick={preventUnavailableAction}
                    variant="outline"
                    className="min-h-11 cursor-not-allowed border-white/10 bg-white/5 text-slate-400 opacity-70"
                  >
                    Play stem
                  </Button>
                  <Button
                    type="button"
                    aria-disabled={true}
                    aria-label="Loop section coming soon"
                    title="Loop section coming soon"
                    onClick={preventUnavailableAction}
                    variant="outline"
                    className="min-h-11 cursor-not-allowed border-white/10 bg-white/5 text-slate-400 opacity-70"
                  >
                    Loop section
                  </Button>
                  <Button
                    type="button"
                    aria-disabled={true}
                    aria-label="Solo / mute others coming soon"
                    title="Solo / mute others coming soon"
                    onClick={preventUnavailableAction}
                    variant="outline"
                    className="min-h-11 cursor-not-allowed border-white/10 bg-white/5 text-slate-400 opacity-70"
                  >
                    Solo / mute others
                  </Button>
                  {canTranscribeBass ? (
                    <Button
                      type="button"
                      title="Transcribe part"
                      variant="outline"
                      className="min-h-11 border-emerald-300/20 bg-emerald-300/10 font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                    >
                      Transcribe Bass
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      aria-disabled={true}
                      title={`${activeRoleDetails?.name ?? "This role"} transcription is coming soon. Bass is ready first.`}
                      onClick={preventUnavailableAction}
                      variant="outline"
                      className="min-h-11 cursor-not-allowed border-white/10 bg-white/5 font-semibold text-slate-500 opacity-70"
                    >
                      Transcribe Bass
                    </Button>
                  )}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3">
                    <div className="flex items-center gap-2 text-cyan-100">
                      <Music4 className="size-4" aria-hidden="true" />
                      <p className="text-[0.7rem] font-black uppercase tracking-[0.22em]">{t("workspaceHarmonyExplainLabel")}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      {roleHarmonicExplanation}
                    </p>
                  </div>
                  <div className="rounded-xl border border-indigo-300/20 bg-indigo-300/[0.08] p-3">
                    <div className="flex items-center gap-2 text-indigo-100">
                      <ClipboardList className="size-4" aria-hidden="true" />
                      <p className="text-[0.7rem] font-black uppercase tracking-[0.22em]">{t("workspaceTranspositionLabel")}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      {roleTranspositionPlan}
                    </p>
                  </div>
                </div>
                {song.collaboration && (
                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      <div className="flex items-center gap-2 text-slate-100">
                        <ClipboardList className="size-4 text-cyan-200" aria-hidden="true" />
                        <p className="text-[0.7rem] font-black uppercase tracking-[0.22em]">{t("workspaceAssignmentsLabel")}</p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {activeRoleAssignments.map((assignment) => (
                          <div key={assignment.id} className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.06] p-2">
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100">{assignment.assignee}</p>
                            <p className="mt-1 text-sm text-slate-100">{assignment.summary}</p>
                            <p className="mt-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-400">{formatStatusLabel(assignment.status)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      <div className="flex items-center gap-2 text-slate-100">
                        <MessageSquareMore className="size-4 text-amber-200" aria-hidden="true" />
                        <p className="text-[0.7rem] font-black uppercase tracking-[0.22em]">{t("workspaceCommentsLabel")}</p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {activeRoleComments.map((comment) => (
                          <div key={comment.id} className="rounded-lg border border-amber-300/15 bg-amber-300/[0.07] p-2">
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100">{comment.author}</p>
                            <p className="mt-1 text-sm text-slate-100">{comment.body}</p>
                            <p className="mt-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-400">{formatStatusLabel(comment.status)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      <div className="flex items-center gap-2 text-slate-100">
                        <CheckCheck className="size-4 text-emerald-200" aria-hidden="true" />
                        <p className="text-[0.7rem] font-black uppercase tracking-[0.22em]">{t("workspaceApprovalsLabel")}</p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {collaborationApprovals.map((approval) => (
                          <div key={approval.id} className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.07] p-2">
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-100">{approval.scope}</p>
                            <p className="mt-1 text-sm text-slate-100">{approval.owner}</p>
                            <p className="mt-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-400">{formatStatusLabel(approval.status)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <PracticeProgress progress={activeRoleDetails?.practiceProgress} onChange={handlePracticeProgressChange} />
                <GrooveMap notes={activeRoleDetails?.transcription} isLoading={false} />
              </div>
            )}

          <SectionRoadmap
            song={song}
            activeRole={activeRole}
            onSongUpdate={onSongUpdate}
          />
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
