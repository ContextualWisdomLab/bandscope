import {
  SECTION_FORM_LABELS,
  type RehearsalSection,
  type RehearsalSong,
  type SectionFormLabel
} from "@bandscope/shared-types";
import { FirstHandoffCallout } from "../workspace/FirstHandoffCallout";
import { createTranslator, detectPreferredLocale } from "../../i18n";

type PlayerFeatureProps = {
  title: string;
  song?: RehearsalSong | null;
  onPlayFromSeconds?: (startSeconds: number) => void;
};

/** Return whether one runtime section is safe to summarize in the player. */
function isPlayerSummarySection(value: unknown): value is RehearsalSection {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const section = value as Partial<RehearsalSection>;
  return (
    typeof section.id === "string" &&
    section.id.trim().length > 0 &&
    typeof section.label === "string" &&
    SECTION_FORM_LABELS.includes(section.label as SectionFormLabel)
  );
}

/** Return dense, individually valid sections without trusting runtime collection metadata. */
function playerSummarySections(song: RehearsalSong): RehearsalSection[] {
  const sections = song.sections as unknown;
  if (!Array.isArray(sections)) {
    return [];
  }
  const length = Number(sections.length);
  if (!Number.isSafeInteger(length) || length < 0 || length > 0xffffffff) {
    return [];
  }
  for (let index = 0; index < length; index += 1) {
    if (!(index in sections)) {
      return [];
    }
  }
  return sections.filter(isPlayerSummarySection);
}

/** Player surface that names tonight's first labeled handoff and delegates playback to the owning player. */
export function PlayerFeature({ title, song, onPlayFromSeconds }: PlayerFeatureProps) {
  const t = createTranslator(detectPreferredLocale());

  if (!song) {
    return (
      <section style={{ padding: "24px" }}>
        <h2>{title}</h2>
        <p style={{ color: "#999" }}>{t("firstHandoffNeedsSong")}</p>
      </section>
    );
  }

  const sections = playerSummarySections(song);

  return (
    <section style={{ padding: "24px" }}>
      <h2>{title}</h2>
      <FirstHandoffCallout song={song} actionMode="callback-only" onHearHandoff={onPlayFromSeconds} />
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
            {sections.length} {sections.length === 1 ? "section" : "sections"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {sections.map((section, sectionIndex) => (
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
