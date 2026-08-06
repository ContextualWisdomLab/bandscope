import type { RehearsalSong } from "@bandscope/shared-types";

/**
 * Normalize an optional rehearsal instruction and reject producer sentinel text.
 *
 * Analysis producers historically used the string `none` when no guidance was
 * available. Treating that sentinel as buyer-facing copy creates misleading
 * setup cards, so the presentation layer maps it and whitespace-only input to
 * an absent value while preserving meaningful source text after trimming.
 */
function normalizeRoleDetail(value: string | undefined): string | null {
  const normalizedValue = value?.trim() ?? "";
  if (normalizedValue === "" || normalizedValue.toLowerCase() === "none") {
    return null;
  }
  return normalizedValue;
}

/** Return only meaningful overlap warnings without mutating analysis output. */
function normalizeOverlapWarnings(values: readonly string[]): string[] {
  return values
    .map((value) => normalizeRoleDetail(value))
    .filter((value): value is string => value !== null);
}

/** Render chord, transposition, setup, simplification, and overlap guidance. */
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
              const transpositionPlan = normalizeRoleDetail(role.transpositionPlan);
              const setupNote = normalizeRoleDetail(role.setupNote);
              const simplification = normalizeRoleDetail(role.simplification);
              const overlapWarnings = normalizeOverlapWarnings(role.overlapWarnings);

              return (
                <article
                  key={role.id}
                  aria-label={role.name}
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
                  {transpositionPlan && (
                    <div style={{ marginTop: "6px", fontSize: "0.8em", color: "#d46b08", backgroundColor: "#fff7e6", padding: "4px", borderRadius: "2px" }}>
                      <strong>Transpose:</strong> {transpositionPlan}
                    </div>
                  )}
                  {setupNote && (
                    <div style={{ marginTop: "6px", fontSize: "0.8em", color: "#08979c", backgroundColor: "#e6fffb", padding: "4px", borderRadius: "2px" }}>
                      <strong>Setup:</strong> {setupNote}
                    </div>
                  )}
                  {simplification && (
                    <div style={{ marginTop: "6px", fontSize: "0.8em", color: "#531dab", backgroundColor: "#f9f0ff", padding: "4px", borderRadius: "2px" }}>
                      <strong>Simplification:</strong> {simplification}
                    </div>
                  )}
                  {overlapWarnings.length > 0 && (
                    <div style={{ marginTop: "6px", fontSize: "0.8em", color: "#cf1322", backgroundColor: "#fff1f0", padding: "4px", borderRadius: "2px" }}>
                      <strong>Overlap warnings:</strong>
                      <ul aria-label={`${role.name} overlap warnings`} style={{ margin: "2px 0 0 16px", padding: 0 }}>
                        {overlapWarnings.map((warning, warningIndex) => (
                          <li key={`${role.id}-${warningIndex}-${warning}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
