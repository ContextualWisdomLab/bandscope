import { useState, useMemo } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { RoleSwitcher } from "./RoleSwitcher";
import { SectionRoadmap } from "./SectionRoadmap";
import { generateCueSheetCsv, generateChartSummaryJson, sanitizeFilename } from "../../lib/export";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Download } from "lucide-react";

interface WorkspaceProps {
  song: RehearsalSong;
  onSongUpdate?: (song: RehearsalSong) => void;
}

/** Documented. */
export function Workspace({ song, onSongUpdate }: WorkspaceProps) {
  const [activeRole, setActiveRole] = useState<string | null>(null);

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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both">
      <Card className="border-zinc-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6">
          <div className="space-y-1.5">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900">{song.title}</h2>
            <CardDescription className="text-base font-medium text-zinc-500">
              {song.exportSummary?.headline || "Rehearsal Workspace"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleExportCueSheet}
              className="bg-white hover:bg-zinc-50 shadow-sm"
            >
              <Download className="w-4 h-4 mr-2 text-zinc-500" />
              Export Cue Sheet (CSV)
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleExportChart}
              className="bg-white hover:bg-zinc-50 shadow-sm"
            >
              <Download className="w-4 h-4 mr-2 text-zinc-500" />
              Export Chart (JSON)
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6 md:p-8 space-y-8 bg-zinc-50/30">
          <RoleSwitcher 
            roles={allRoles} 
            activeRole={activeRole} 
            onRoleChange={setActiveRole} 
          />

          <SectionRoadmap 
            song={song} 
            activeRole={activeRole} 
            onSongUpdate={onSongUpdate}
          />
        </CardContent>
      </Card>
    </div>
  );
}
