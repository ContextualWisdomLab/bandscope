import type { RehearsalSong } from "@bandscope/shared-types";
import { useMemo } from "react";

/** Documented. */
export function HomeFeature(props: { title: string; song?: RehearsalSong | null }) {
  const { title, song } = props;

  // Performance: O(1) memory lookup for role counts via nested loops instead of flatMap().map()
  const roleCount = useMemo(() => {
    if (!song) return 0;
    const roleIds = new Set<string>();
    for (const s of song.sections) {
      for (const r of s.roles) {
        roleIds.add(r.id);
      }
    }
    return roleIds.size;
  }, [song]);

  return (
    <section style={{ padding: "24px" }}>
      <h2>{title}</h2>
      {song ? (
        <div>
          <p style={{ fontSize: "1.1em", color: "#333", marginBottom: "16px" }}>
            🎵 <strong>{song.title}</strong>
          </p>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ padding: "12px 16px", backgroundColor: "#f0f5ff", borderRadius: "8px", minWidth: "120px" }}>
              <div style={{ fontSize: "0.85em", color: "#666" }}>Sections</div>
              <div style={{ fontSize: "1.5em", fontWeight: "bold" }}>{song.sections.length}</div>
            </div>
            <div style={{ padding: "12px 16px", backgroundColor: "#f6ffed", borderRadius: "8px", minWidth: "120px" }}>
              <div style={{ fontSize: "0.85em", color: "#666" }}>Roles</div>
              <div style={{ fontSize: "1.5em", fontWeight: "bold" }}>{roleCount}</div>
            </div>
            <div style={{ padding: "12px 16px", backgroundColor: "#fff7e6", borderRadius: "8px", minWidth: "120px" }}>
              <div style={{ fontSize: "0.85em", color: "#666" }}>Export</div>
              <div style={{ fontSize: "1.5em", fontWeight: "bold" }}>{song.exportSummary.format}</div>
            </div>
          </div>
          {song.exportSummary.headline && (
            <p style={{ marginTop: "16px", color: "#595959", fontStyle: "italic" }}>
              {song.exportSummary.headline}
            </p>
          )}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "32px", color: "#999", backgroundColor: "#fafafa", borderRadius: "8px" }}>
          <p>🎵 Choose a local audio file or import from YouTube to get started.</p>
          <p style={{ fontSize: "0.9em" }}>BandScope will analyze harmony, form, groove, and player cues for your rehearsal.</p>
        </div>
      )}
    </section>
  );
}
