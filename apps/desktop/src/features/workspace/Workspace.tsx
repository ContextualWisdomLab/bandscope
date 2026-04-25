import { useState, useMemo } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { RoleSwitcher } from "./RoleSwitcher";
import { SectionRoadmap } from "./SectionRoadmap";
import { generateCueSheetCsv, generateChartSummaryJson, sanitizeFilename } from "../../lib/export";

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
    <div style={{ marginTop: "32px", padding: "24px", border: "1px solid #e8e8e8", borderRadius: "12px", backgroundColor: "#fff" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <h2 style={{ fontSize: "1.8em", margin: "0 0 8px 0" }}>{song.title}</h2>
          <p style={{ color: "#666", margin: "0 0 16px 0" }}>{song.exportSummary?.headline || ""}</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button 
            type="button" 
            onClick={handleExportCueSheet}
            style={{ padding: "6px 12px", cursor: "pointer", borderRadius: "4px", backgroundColor: "#fff", border: "1px solid #d9d9d9" }}
          >
            Export Cue Sheet (CSV)
          </button>
          <button 
            type="button" 
            onClick={handleExportChart}
            style={{ padding: "6px 12px", cursor: "pointer", borderRadius: "4px", backgroundColor: "#fff", border: "1px solid #d9d9d9" }}
          >
            Export Chart (JSON)
          </button>
        </div>
      </header>

      <RoleSwitcher 
        roles={allRoles} 
        activeRole={activeRole} 
        onRoleChange={setActiveRole} 
      />

      
      {activeRole && (
        <div style={{ marginTop: "16px", padding: "16px", backgroundColor: "#f0f2f5", borderRadius: "8px", display: "flex", gap: "16px", alignItems: "center" }}>
          <strong>Stem Player: {activeRole}</strong>
          <button aria-label="Play stem" title="Coming soon" disabled={true} style={{ padding: "8px 16px", borderRadius: "4px", backgroundColor: "#1890ff", color: "#fff", border: "none", cursor: "not-allowed", minWidth: "44px", minHeight: "44px" }}>▶ Play</button>
          <button aria-label="Loop section" title="Coming soon" disabled={true} style={{ padding: "8px 16px", borderRadius: "4px", border: "1px solid #d9d9d9", backgroundColor: "#f5f5f5", cursor: "not-allowed", minWidth: "44px", minHeight: "44px" }}>🔁 Loop Section</button>
          <button aria-label="Solo/mute others" title="Coming soon" disabled={true} style={{ padding: "8px 16px", borderRadius: "4px", border: "1px solid #d9d9d9", backgroundColor: "#f5f5f5", cursor: "not-allowed", minWidth: "44px", minHeight: "44px" }}>🔇 Mute Others (Solo)</button>
        </div>
      )}

      <SectionRoadmap 
        song={song} 
        activeRole={activeRole} 
        onSongUpdate={onSongUpdate}
      />
    </div>
  );
}
