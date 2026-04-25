import type { RehearsalSong, RehearsalRole } from "@bandscope/shared-types";
import { useMemo } from "react";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { ConfidenceBadge } from "./ConfidenceBadge";

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
    if (priority === "high") return "#ff4d4f";
    if (priority === "medium") return "#faad14";
    return "#52c41a";
  };

  /** Documented. */
  const getPriorityIcon = (priority: string) => {
    if (priority === "high") return "🚨";
    if (priority === "medium") return "⚠️";
    return "✅";
  };

  return (
    <div style={{ marginTop: "24px" }}>
      <h2>{t("sectionRoadmapTitle")}</h2>
      <div style={{ display: "flex", overflowX: "auto", padding: "16px 0", gap: "16px" }}>
        {song.sections.map((section) => (
          <div
            key={section.id}
            style={{
              flex: "0 0 auto",
              width: "250px",
              border: "1px solid #ccc",
              borderRadius: "8px",
              padding: "16px",
              backgroundColor: section.confidence.level === "low" ? "#fff1f0" : "#fff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>{section.label}</h3>
              <ConfidenceBadge level={section.confidence.level} />
            </div>
            
            <div style={{ marginTop: "8px", fontSize: "0.9em", color: "#666" }}>
              <p style={{ margin: "4px 0" }}>Groove: {section.groove}</p>
            </div>

            <div style={{ marginTop: "16px" }}>
              {section.roles
                .filter(role => !activeRole || role.id === activeRole)
                .map(role => (
                  <div key={role.id} style={{ 
                    marginTop: "8px", 
                    padding: "8px", 
                    backgroundColor: "#f9f9f9", 
                    borderRadius: "4px",
                    borderLeft: `4px solid ${getPriorityColor(role.rehearsalPriority)}`
                  }}>
                    <div style={{ fontWeight: "bold", fontSize: "0.9em", display: "flex", justifyContent: "space-between" }}>
                      <span>
                        {role.name}
                        {role.confidence.level === "low" && (
                          <span style={{ color: "#ff4d4f", fontSize: "0.8em", marginLeft: "4px" }}>
                            ({t("confidenceLevelLow")})
                          </span>
                        )}
                      </span>
                      <span title={`Priority: ${role.rehearsalPriority}`}>
                        {getPriorityIcon(role.rehearsalPriority)}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.9em", marginTop: "4px" }}>
                      Chord: <strong 
                        role={onSongUpdate ? "button" : undefined}
                        tabIndex={onSongUpdate ? 0 : undefined}
                        style={{ cursor: onSongUpdate ? "pointer" : "default", textDecoration: onSongUpdate ? "underline" : "none", color: role.harmony.source === "user" ? "#1890ff" : "inherit" }} 
                        onClick={() => handleChordEdit(section.id, role)}
                        onKeyDown={(e) => {
                          if (onSongUpdate && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            handleChordEdit(section.id, role);
                          }
                        }}
                        title={onSongUpdate ? "Click to edit chord" : undefined}
                      >{role.harmony.chord}</strong>
                      {role.harmony.source === "user" && <span style={{ fontSize: "0.8em", marginLeft: "4px", color: "#1890ff" }}>(User)</span>}
                    </div>
                    <div style={{ fontSize: "0.85em", color: "#666", marginTop: "2px" }}>
                      Cue: {role.cue.value}
                    </div>
                    {role.setupNote && (
                      <div style={{ fontSize: "0.85em", color: "#fa8c16", marginTop: "4px" }}>
                        💡 {role.setupNote}
                      </div>
                    )}
                    {role.simplification && (
                      <div style={{ fontSize: "0.85em", color: "#1890ff", marginTop: "4px" }}>
                        ✨ {role.simplification}
                      </div>
                    )}
                    {role.overlapWarnings.length > 0 && (
                      <div style={{ marginTop: "4px" }}>
                        {role.overlapWarnings.map((warning, wIdx) => (
                          <div key={wIdx} style={{ fontSize: "0.8em", color: "#fa541c", marginTop: "2px" }}>
                            ⚠️ {warning}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
