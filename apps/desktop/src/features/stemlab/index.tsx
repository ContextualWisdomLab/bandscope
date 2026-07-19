import type { RehearsalSong } from "@bandscope/shared-types";

/** Documented. */
export function StemLabFeature(props: { title: string; song?: RehearsalSong | null }) {
  const { title, song } = props;

  if (!song) {
    return (
      <section style={{ padding: "24px" }}>
        <h2>{title}</h2>
        <p style={{ color: "#999" }}>No song loaded. Start an analysis to use the stem lab.</p>
      </section>
    );
  }

  return (
    <section style={{ padding: "24px" }}>
      <h2>{title}</h2>
      <div
        style={{
          padding: "16px",
          backgroundColor: "#fafafa",
          borderRadius: "8px",
          border: "1px solid #e8e8e8",
        }}
      >
        <div style={{ marginBottom: "16px" }}>
          <strong>{song.title}</strong>
          <span style={{ color: "#666", marginLeft: "8px" }}>
            Stem separation results
          </span>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              border: "1px solid #d9d9d9",
              backgroundColor: "#f5f5f5",
              cursor: "not-allowed",
              color: "#bfbfbf",
            }}
          >
            Play Vocals
          </button>
          <button
            type="button"
            disabled
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              border: "1px solid #d9d9d9",
              backgroundColor: "#f5f5f5",
              cursor: "not-allowed",
              color: "#bfbfbf",
            }}
          >
            Play Drums
          </button>
          <button
            type="button"
            disabled
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              border: "1px solid #d9d9d9",
              backgroundColor: "#f5f5f5",
              cursor: "not-allowed",
              color: "#bfbfbf",
            }}
          >
            Play Bass
          </button>
          <button
            type="button"
            disabled
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              border: "1px solid #d9d9d9",
              backgroundColor: "#f5f5f5",
              cursor: "not-allowed",
              color: "#bfbfbf",
            }}
          >
            Play Other
          </button>
        </div>
        <div style={{ marginTop: "16px", color: "#999", fontSize: "0.85em" }}>
          Interactive stem mixing is coming soon.
        </div>
      </div>
    </section>
  );
}
