import type { RehearsalSong } from "@bandscope/shared-types";

/** Documented. */
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
                {role.overlapWarnings.length > 0 && (
                  <div style={{ marginTop: "8px" }}>
                    {role.overlapWarnings.map((warning, wIndex) => (
                      <div
                        key={wIndex}
                        style={{
                          fontSize: "0.8em",
                          color: "#fa8c16",
                          marginTop: "4px",
                          padding: "4px 6px",
                          backgroundColor: "#fff7e6",
                          borderRadius: "4px",
                        }}
                      >
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
    </section>
  );
}
