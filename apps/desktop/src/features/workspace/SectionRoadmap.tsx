import type { RehearsalSong, RehearsalRole } from "@bandscope/shared-types";
import { useMemo } from "react";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle2, Music2, Wand2, Lightbulb, Info } from "lucide-react";

interface SectionRoadmapProps {
  song: RehearsalSong;
  activeRole: string | null; // null means all roles
  onSongUpdate?: (song: RehearsalSong) => void;
}

/** Documented. */
export function SectionRoadmap({ song, activeRole, onSongUpdate }: SectionRoadmapProps) {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);

  /** Documented. */
  const handleChordEdit = (sectionId: string, role: RehearsalRole) => {
    if (!onSongUpdate) return;
    const newChord = window.prompt("Enter new chord:", role.harmony.chord);
    if (newChord !== null && newChord.trim() !== "" && newChord !== role.harmony.chord) {
      const updatedSong = structuredClone(song);
      const section = updatedSong.sections.find(s => s.id === sectionId);
      if (section) {
        const targetRole = section.roles.find(r => r.id === role.id);
        if (targetRole) {
          targetRole.harmony = {
            ...targetRole.harmony,
            chord: newChord.trim(),
            source: "user"
          };
          targetRole.manualOverrides = targetRole.manualOverrides.filter(o => o.field !== "harmony");
          targetRole.manualOverrides.push({
            field: "harmony",
            value: { ...targetRole.harmony, source: "user" as const },
            source: "user"
          });
          onSongUpdate(updatedSong);
        }
      }
    }
  };

  /** Documented. */
  const getPriorityColor = (priority: string) => {
    if (priority === "high") return "border-rose-400 bg-rose-400/[0.08] shadow-[0_0_30px_rgba(251,113,133,0.10)]";
    if (priority === "medium") return "border-amber-300 bg-amber-300/[0.08] shadow-[0_0_30px_rgba(252,211,77,0.08)]";
    return "border-emerald-300 bg-emerald-300/[0.08] shadow-[0_0_30px_rgba(110,231,183,0.08)]";
  };

  /** Documented. */
  const getPriorityIcon = (priority: string) => {
    if (priority === "high") return <AlertCircle className="size-4 text-rose-300" aria-hidden="true" />;
    if (priority === "medium") return <Info className="size-4 text-amber-200" aria-hidden="true" />;
    return <CheckCircle2 className="size-4 text-emerald-200" aria-hidden="true" />;
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center text-xl font-black tracking-tight text-white">
          <Music2 className="mr-2 size-5 text-cyan-300" aria-hidden="true" />
          {t("sectionRoadmapTitle")}
        </h2>
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Scroll for more sections →</span>
      </div>

      <div className="hide-scrollbar flex snap-x snap-mandatory gap-6 overflow-x-auto pb-6 pt-2">
        {song.sections.map((section) => (
          <Card
            key={section.id}
            className={`w-80 flex-none shrink-0 snap-start overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_80px_rgba(0,0,0,0.32)] ${
              section.confidence.level === "low" ? "border-rose-300/30 bg-rose-950/30" : "border-white/10 bg-slate-950/80"
            }`}
          >
            <CardHeader className="border-b border-white/10 bg-white/[0.04] p-5 pb-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-lg font-black tracking-tight text-white">{section.label}</h3>
                <ConfidenceBadge level={section.confidence.level} />
              </div>
              <div className="flex items-center text-sm font-medium text-slate-300">
                <span className="mr-2 text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">Groove</span>
                {section.groove}
              </div>
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
                      <div title={`Priority: ${role.rehearsalPriority}`} className="rounded-full border border-white/10 bg-white/10 p-1 shadow-sm">
                        {getPriorityIcon(role.rehearsalPriority)}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">Chord</span>
                        <button
                          type="button"
                          aria-label={`Edit chord for ${role.name} in ${section.label}, current ${role.harmony.chord}`}
                          className={`-ml-2 rounded px-2 py-0.5 text-lg font-black tracking-tight transition-colors ${
                            onSongUpdate
                              ? "cursor-pointer hover:bg-white/10"
                              : "cursor-default"
                          } ${
                            role.harmony.source === "user"
                              ? "bg-indigo-300/15 text-indigo-200"
                              : "text-cyan-100"
                          }`}
                          onClick={() => handleChordEdit(section.id, role)}
                          onKeyDown={(e) => {
                            if (onSongUpdate && (e.key === "Enter" || e.key === " ")) {
                              e.preventDefault();
                              handleChordEdit(section.id, role);
                            }
                          }}
                          title={onSongUpdate ? "Click to edit chord" : undefined}
                          disabled={!onSongUpdate}
                        >
                          {role.harmony.chord}
                        </button>
                        {role.harmony.source === "user" && (
                          <Badge variant="secondary" className="h-4 bg-indigo-300/20 px-1 text-[0.6rem] text-indigo-100 hover:bg-indigo-300/20">
                            User
                          </Badge>
                        )}
                      </div>

                      <Separator className="bg-white/10" />

                      <div className="space-y-2">
                        <div className="text-sm font-medium leading-snug text-slate-200">
                          <span className="mb-0.5 block text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">Cue</span>
                          {role.cue.value}
                        </div>

                        {role.setupNote && (
                          <div className="flex items-start gap-2 rounded-md border border-amber-300/20 bg-amber-300/[0.08] p-2 text-xs font-medium text-amber-100">
                            <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
                            <span className="leading-snug">{role.setupNote}</span>
                          </div>
                        )}

                        {role.simplification && (
                          <div className="flex items-start gap-2 rounded-md border border-indigo-300/20 bg-indigo-300/[0.08] p-2 text-xs font-medium text-indigo-100">
                            <Wand2 className="mt-0.5 size-3.5 shrink-0" />
                            <span className="leading-snug">{role.simplification}</span>
                          </div>
                        )}

                        {role.overlapWarnings.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {role.overlapWarnings.map((warning, wIdx) => (
                              <div key={wIdx} className="flex items-start gap-2 rounded-md border border-rose-300/20 bg-rose-300/[0.08] p-2 text-xs font-medium text-rose-100">
                                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
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
