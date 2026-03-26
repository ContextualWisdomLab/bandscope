import type { RehearsalSong } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface SectionRoadmapProps {
  song: RehearsalSong;
  activeRole: string | null; // null means all roles
}

export function SectionRoadmap({ song, activeRole }: SectionRoadmapProps) {
  const t = createTranslator(detectPreferredLocale());

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
                    borderLeft: role.confidence.level === "low" ? "4px solid #ff4d4f" : "4px solid #d9d9d9"
                  }}>
                    <div style={{ fontWeight: "bold", fontSize: "0.9em" }}>
                      {role.name}
                      {role.confidence.level === "low" && (
                        <span style={{ color: "#ff4d4f", fontSize: "0.8em", marginLeft: "4px" }}>
                          ({t("confidenceLevelLow")})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.9em", marginTop: "4px" }}>
                      Chord: <strong>{role.harmony.chord}</strong>
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
                  </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
