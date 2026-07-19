import type { RehearsalSong } from "@bandscope/shared-types";

/** Documented. */
export function TransposeFeature(props: { title: string; song?: RehearsalSong | null }) {
  const { title, song } = props;

  if (!song) {
    return (
      <section style={{ padding: "24px" }}>
        <h2>{title}</h2>
        <p style={{ color: "#999" }}>No song loaded. Start an analysis to see transpose data.</p>
      </section>
    );
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
            {section.roles.map((role) => {
              if (!role.transpositionPlan) return null;
              return (
                <div
                  key={role.id}
                  style={{
                    marginTop: "8px",
                    padding: "8px",
                    backgroundColor: "#fff7e6",
                    borderRadius: "4px",
                  }}
                >
                  <div style={{ fontSize: "0.85em", color: "#666" }}>
                    {role.name}
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "0.8em", color: "#d46b08" }}>
                    <strong>Transpose:</strong> {role.transpositionPlan}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
