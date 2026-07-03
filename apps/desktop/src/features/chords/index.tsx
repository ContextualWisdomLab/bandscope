import type { RehearsalSong } from "@bandscope/shared-types";

/** Documented. */
export function ChordsFeature(props: { title: string; song?: RehearsalSong | null }) {
  const { title, song } = props;

  if (!song) {
    return (
      <section style={{ padding: "24px" }}>
        <h2>{title}</h2>
        <p style={{ color: "#999" }}>No song loaded. Start an analysis to see chord data.</p>
      </section>
    );
  }

  // Collect unique chords across all sections and roles
  const chordsBySectionLabel = new Map<string, { chord: string; functionLabel: string; source: string; roleName: string; transpositionPlan?: string }[]>();
  for (const section of song.sections) {
    const entries: { chord: string; functionLabel: string; source: string; roleName: string; transpositionPlan?: string }[] = [];
    for (const role of section.roles) {
      entries.push({
        chord: role.harmony.chord,
        functionLabel: role.harmony.functionLabel,
        source: role.harmony.source,
        roleName: role.name,
        transpositionPlan: role.transpositionPlan,
      });
    }
    chordsBySectionLabel.set(section.label, entries);
  }

  return (
    <section style={{ padding: "24px" }}>
      <h2>{title}</h2>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {song.sections.map((section) => (
          <div
            key={section.id}
            style={{
              flex: "0 0 auto",
              minWidth: "200px",
              border: "1px solid #e8e8e8",
              borderRadius: "8px",
              padding: "16px",
              backgroundColor: "#fff",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", textTransform: "capitalize" }}>
              {section.label}
            </h3>
            {section.roles.map((role) => (
              <div
                key={role.id}
                style={{
                  marginTop: "8px",
                  padding: "8px",
                  backgroundColor: role.harmony.source === "user" ? "#e6f7ff" : "#f9f9f9",
                  borderRadius: "4px",
                }}
              >
                <div style={{ fontWeight: "bold", fontSize: "1.1em" }}>
                  {role.harmony.chord}
                  {role.harmony.source === "user" && (
                    <span style={{ fontSize: "0.7em", color: "#1890ff", marginLeft: "4px" }}>(User)</span>
                  )}
                </div>
                <div style={{ fontSize: "0.85em", color: "#666" }}>
                  {role.harmony.functionLabel}
                </div>
                <div style={{ fontSize: "0.8em", color: "#999" }}>
                  {role.name}
                </div>
                {role.transpositionPlan && (
                  <div style={{ marginTop: "6px", fontSize: "0.8em", color: "#d46b08", backgroundColor: "#fff7e6", padding: "4px", borderRadius: "2px" }}>
                    <strong>Transpose:</strong> {role.transpositionPlan}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
