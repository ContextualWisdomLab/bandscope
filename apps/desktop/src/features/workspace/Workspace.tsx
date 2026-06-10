import { useState, useMemo } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { RoleSwitcher } from "./RoleSwitcher";
import { SectionRoadmap } from "./SectionRoadmap";
import { GrooveMap } from "./GrooveMap";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { generateCueSheetCsv, generateChartSummaryJson, sanitizeFilename } from "../../lib/export";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Download } from "lucide-react";

interface WorkspaceProps {
  song: RehearsalSong;
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

type Translator = ReturnType<typeof createTranslator>;

/** Documented. */
function SongStructure({ sections, t }: { sections: RehearsalSong["sections"]; t: Translator }) {
  return (
    <section className="rounded-3xl border border-cyan-300/20 bg-slate-950/72 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.24)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-200">{t("workspaceSongStructureLabel")}</h3>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">{t("workspaceRehearsalTimelineLabel")}</span>
      </div>

      <div
        role="region"
        tabIndex={0}
        className="overflow-x-auto rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(8,18,35,0.96),rgba(2,6,23,0.98))]"
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
            {Array.from({ length: 84 }).map((_, index) => (
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
}

/** Documented. */
export function Workspace({ song, onSongUpdate }: WorkspaceProps) {
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);

  // Extract all unique roles from the song's sections
  const allRoles = useMemo(() => {
    const roleMap = new Map<string, string>();
    song.sections.forEach(section => {
      section.roles.forEach(role => {
        if (!roleMap.has(role.id)) {
          roleMap.set(role.id, role.name);
        }
      });
    });
    return Array.from(roleMap.entries()).map(([id, name]) => ({ id, name }));
  }, [song]);
  const activeRoleDetails = useMemo(
    () => song.sections.flatMap((section) => section.roles).find((role) => role.id === activeRole),
    [activeRole, song]
  );
  const canTranscribeBass = activeRoleDetails?.name.toLowerCase().includes("bass") ?? false;

  /** Documented. */
  const handleExportCueSheet = () => {
    const csv = generateCueSheetCsv(song);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFilename(song.title)}_cuesheet.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** Documented. */
  const handleExportChart = () => {
    const json = generateChartSummaryJson(song);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFilename(song.title)}_chart.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-in space-y-6 fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both">
      <Card className="overflow-hidden border-white/10 bg-slate-950/78 text-slate-100 shadow-[0_24px_90px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
        <CardHeader className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 pb-6 md:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">{t("workspaceRehearsalMapLabel")}</p>
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
                <Download className="mr-2 size-4 text-cyan-200" />
              Export Cue Sheet (CSV)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportChart}
                className="min-h-10 border-white/10 bg-white/5 font-semibold text-slate-100 shadow-sm hover:bg-white/10 hover:text-white"
            >
                <Download className="mr-2 size-4 text-slate-300" />
              Export Chart (JSON)
            </Button>
          </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.86))] p-5 md:p-7">
          <div className="grid gap-4 lg:grid-cols-4">
            <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4 lg:col-span-2">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">{t("workspaceSongTimelineLabel")}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {song.sections.length} section{song.sections.length === 1 ? "" : "s"} mapped with groove, role cues, and chord confidence notes.
              </p>
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
                  <Button type="button" disabled title="Coming soon" variant="outline" className="min-h-11 cursor-not-allowed border-white/10 bg-white/5 text-slate-400">Play stem</Button>
                  <Button type="button" disabled title="Coming soon" variant="outline" className="min-h-11 cursor-not-allowed border-white/10 bg-white/5 text-slate-400">Loop section</Button>
                  <Button type="button" disabled title="Coming soon" variant="outline" className="min-h-11 cursor-not-allowed border-white/10 bg-white/5 text-slate-400">Solo / mute others</Button>
                  <Button
                    type="button"
                    disabled={!canTranscribeBass}
                    title={canTranscribeBass ? "Transcribe part" : `${activeRoleDetails?.name ?? "This role"} transcription is coming soon. Bass is ready first.`}
                    variant="outline"
                    className="min-h-11 border-emerald-300/20 bg-emerald-300/10 font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                  >
                    Transcribe Bass
                  </Button>
                </div>
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
