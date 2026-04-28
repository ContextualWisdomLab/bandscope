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
    if (priority === "high") return "border-rose-500 bg-rose-50/50";
    if (priority === "medium") return "border-amber-500 bg-amber-50/50";
    return "border-emerald-500 bg-emerald-50/50";
  };

  /** Documented. */
  const getPriorityIcon = (priority: string) => {
    if (priority === "high") return <AlertCircle className="w-4 h-4 text-rose-500" />;
    if (priority === "medium") return <Info className="w-4 h-4 text-amber-500" />;
    return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  };

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center">
          <Music2 className="w-5 h-5 mr-2 text-zinc-500" />
          {t("sectionRoadmapTitle")}
        </h2>
      </div>
      
      <div className="flex overflow-x-auto pb-6 pt-2 gap-6 snap-x snap-mandatory hide-scrollbar">
        {song.sections.map((section) => (
          <Card
            key={section.id}
            className={`flex-none w-80 shrink-0 snap-start shadow-md hover:shadow-lg transition-shadow duration-300 ${
              section.confidence.level === "low" ? "border-rose-200 bg-rose-50/20" : "border-zinc-200 bg-white"
            }`}
          >
            <CardHeader className="p-5 pb-4 border-b border-zinc-100 bg-zinc-50/50">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-lg text-zinc-800 tracking-tight">{section.label}</h3>
                <ConfidenceBadge level={section.confidence.level} />
              </div>
              <div className="text-sm font-medium text-zinc-500 flex items-center">
                <span className="text-zinc-400 mr-2 uppercase text-[0.65rem] tracking-wider font-bold">Groove</span>
                {section.groove}
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {section.roles
                .filter(role => !activeRole || role.id === activeRole)
                .map(role => (
                  <div 
                    key={role.id} 
                    className={`rounded-lg border-l-4 p-4 shadow-sm transition-all hover:translate-x-1 ${getPriorityColor(role.rehearsalPriority)}`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-sm text-zinc-800">
                          {role.name}
                        </span>
                        {role.confidence.level === "low" && (
                          <Badge variant="outline" className="text-[0.65rem] text-rose-600 border-rose-200 bg-rose-50 font-semibold px-1.5 py-0">
                            {t("confidenceLevelLow")}
                          </Badge>
                        )}
                      </div>
                      <div title={`Priority: ${role.rehearsalPriority}`} className="bg-white rounded-full p-1 shadow-sm">
                        {getPriorityIcon(role.rehearsalPriority)}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[0.7rem] uppercase tracking-wider font-bold text-zinc-400">Chord</span>
                        <button
                          type="button"
                          className={`text-lg font-black tracking-tight rounded px-2 py-0.5 -ml-2 transition-colors ${
                            onSongUpdate 
                              ? "hover:bg-zinc-200 cursor-pointer" 
                              : "cursor-default"
                          } ${
                            role.harmony.source === "user" 
                              ? "text-indigo-600 bg-indigo-50" 
                              : "text-zinc-800"
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
                          <Badge variant="secondary" className="text-[0.6rem] h-4 px-1 bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                            User
                          </Badge>
                        )}
                      </div>

                      <Separator className="bg-zinc-200/60" />

                      <div className="space-y-2">
                        <div className="text-sm font-medium text-zinc-700 leading-snug">
                          <span className="text-[0.65rem] uppercase tracking-wider font-bold text-zinc-400 block mb-0.5">Cue</span>
                          {role.cue.value}
                        </div>
                        
                        {role.setupNote && (
                          <div className="text-xs font-medium text-amber-700 bg-amber-50/50 p-2 rounded-md border border-amber-100 flex items-start gap-2">
                            <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span className="leading-snug">{role.setupNote}</span>
                          </div>
                        )}
                        
                        {role.simplification && (
                          <div className="text-xs font-medium text-indigo-700 bg-indigo-50/50 p-2 rounded-md border border-indigo-100 flex items-start gap-2">
                            <Wand2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span className="leading-snug">{role.simplification}</span>
                          </div>
                        )}
                        
                        {role.overlapWarnings.length > 0 && (
                          <div className="space-y-1.5 mt-2">
                            {role.overlapWarnings.map((warning, wIdx) => (
                              <div key={wIdx} className="text-xs font-medium text-rose-700 bg-rose-50 p-2 rounded-md border border-rose-100 flex items-start gap-2">
                                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
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
