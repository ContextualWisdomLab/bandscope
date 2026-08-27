import { OverlapWarningList } from "../workspace/OverlapWarningList";
import type { RehearsalSong } from "@bandscope/shared-types";

/** Render per-role range, overlap, and transcription summaries for the loaded rehearsal song. */
export function RangesFeature(props: { title: string; song?: RehearsalSong | null }) {
  const { title, song } = props;

  if (!song) {
    return (
      <section style={{ padding: "24px" }}>
        <h2>{title}</h2>
        <p style={{ color: "#999" }}>No song loaded. Start an analysis to see range data.</p>
      </section>
    );
  }

  return (
    <section style={{ padding: "24px" }}>
      <h2>{title}</h2>
      {song.sections.map((section) => (
        <div key={section.id} style={{ marginBottom: "24px" }}>
          <h3 style={{ textTransform: "capitalize", marginBottom: "8px" }}>{section.label}</h3>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {section.roles.map((role) => (
              <div
                key={role.id}
                style={{
                  padding: "12px",
                  border: "1px solid #e8e8e8",
                  borderRadius: "8px",
                  minWidth: "160px",
                  backgroundColor: "#fff",
                }}
              >
                <div style={{ fontWeight: "bold", fontSize: "0.9em", marginBottom: "4px" }}>
                  {role.name}
                </div>
                <div style={{ fontSize: "0.85em", color: "#333" }}>
                  🎵 {role.range.lowestNote} — {role.range.highestNote}
                </div>
                <OverlapWarningList warnings={role.overlapWarnings} surface="light" />
                {role.transcription && role.transcription.length > 0 && (
                  <div style={{ marginTop: "8px", fontSize: "0.8em", color: "#08979c", backgroundColor: "#e6fffb", padding: "4px 6px", borderRadius: "4px" }}>
                    <strong>Transcription available:</strong> {role.transcription.length} notes
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}