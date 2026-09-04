import {
  SECTION_FORM_LABELS,
  type RehearsalSection,
  type RehearsalSong,
  type SectionFormLabel
} from "@bandscope/shared-types";
import { FirstIntroCallout } from "../workspace/FirstIntroCallout";
import { createTranslator, detectPreferredLocale, translateSectionFormLabel } from "../../i18n";

type PlayerFeatureProps = {
  title: string;
  song?: RehearsalSong | null;
  onPlayFromSeconds?: (startSeconds: number) => void;
};

/** Read an own data property without invoking accessors or letting descriptor traps escape. */
function readOwnDataProperty(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      return undefined;
    }
    Reflect.get(value, key);
    return descriptor.value;
  } catch {
    return undefined;
  }
}

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

/** Return dense, individually valid sections without invoking an untrusted collection accessor. */
function playerSummarySections(song: RehearsalSong): RehearsalSection[] {
  const sections = readOwnDataProperty(song, "sections");
  if (!Array.isArray(sections)) {
    return [];
  }
  try {
    const length = Number(sections.length);
    if (!Number.isSafeInteger(length) || length < 0 || length > 0xffffffff) {
      return [];
    }
    const keys = Object.keys(sections);
    if (keys.length !== length || !keys.every((key, index) => key === String(index))) {
      return [];
    }
    return sections.filter(isPlayerSummarySection);
  } catch {
    return [];
  }
}

/** Player surface that names tonight's first labeled intro and delegates playback to the owning player. */
export function PlayerFeature({ title, song, onPlayFromSeconds }: PlayerFeatureProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);

  if (!song) {
    return (
      <section style={{ padding: "24px" }}>
        <h2>{title}</h2>
        <p style={{ color: "#999" }}>{t("firstIntroNeedsSong")}</p>
      </section>
    );
  }

  const sections = playerSummarySections(song);
  const rawSongTitle = readOwnDataProperty(song, "title");
  const songTitle = typeof rawSongTitle === "string" ? rawSongTitle : "";
  const calloutSong = sections.length === 0
    ? ({ sections: [] } as unknown as RehearsalSong)
    : song;
  const sectionCountLabel = t(
    sections.length === 1
      ? "metricConfidenceSectionCountSingular"
      : "metricConfidenceSectionCountPlural"
  ).replace("{count}", String(sections.length));

  return (
    <section style={{ padding: "24px" }}>
      <h2>{title}</h2>
      <FirstIntroCallout song={calloutSong} actionMode="callback-only" onHearIntro={onPlayFromSeconds} />
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
          <strong>{songTitle}</strong>
          <span style={{ color: "#666", marginLeft: "8px" }}>
            {sectionCountLabel}
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
              {translateSectionFormLabel(locale, section.label)}
            </span>
          ))}
        </div>
        <div style={{ marginTop: "16px", color: "#999", fontSize: "0.85em" }}>
          {t("playerPlaybackRequiresDesktop")}
        </div>
      </div>
    </section>
  );
}
