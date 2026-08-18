import type { RehearsalSong } from "@bandscope/shared-types";
import { FirstStopCallout } from "../workspace/FirstStopCallout";
import { createTranslator, detectPreferredLocale } from "../../i18n";

type PlayerFeatureProps = {
  title: string;
  song?: RehearsalSong | null;
  onPlayFromSeconds?: (startSeconds: number) => void;
};

/** Player surface that names tonight's first stop and delegates playback to the owning player. */
export function PlayerFeature({ title, song, onPlayFromSeconds }: PlayerFeatureProps) {
  const t = createTranslator(detectPreferredLocale());

  if (!song) {
    return (
      <section style={{ padding: "24px" }}>
        <h2>{title}</h2>
        <p style={{ color: "#999" }}>{t("firstStopNeedsSong")}</p>
      </section>
    );
  }

  return (
    <section style={{ padding: "24px" }}>
      <h2>{title}</h2>
      <FirstStopCallout song={song} actionMode="callback-only" onHearStop={onPlayFromSeconds} />
      <div
        style={{
          padding: "16px",
          backgroundColor: "#fafafa",
          borderRadius: "8px",
          border: "1px solid #e8e8e8",
          marginTop: "16px"
        }}
      >
        <div style={{ marginBottom: "12px" }}>
          <strong>{song.title}</strong>
          <span style={{ color: "#666", marginLeft: "8px" }}>
            {song.sections.length} {song.sections.length === 1 ? "section" : "sections"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {song.sections.map((section, sectionIndex) => (
            <span
              key={`${section.id}-${sectionIndex}`}
              style={{
                padding: "4px 12px",
                borderRadius: "16px",
                backgroundColor: "#fff",
                border: "1px solid #d9d9d9",
                fontSize: "0.85em",
                textTransform: "capitalize"
              }}
            >
              {section.label}
            </span>
          ))}
        </div>
        <div style={{ marginTop: "16px", color: "#999", fontSize: "0.85em" }}>
          Audio playback requires the desktop app with a local audio source.
        </div>
      </div>
    </section>
  );
}
