import { useMemo } from "react";
import {
  createDemoRehearsalSong,
  SUPPORTED_AUDIO_FORMATS
} from "@bandscope/shared-types";
import { ChordsFeature } from "./features/chords";
import { HomeFeature } from "./features/home";
import { PlayerFeature } from "./features/player";
import { RangesFeature } from "./features/ranges";
import { SettingsFeature } from "./features/settings";
import { createTranslator, detectPreferredLocale } from "./i18n";

export function App() {
  const t = createTranslator(detectPreferredLocale());
  const rehearsalSong = useMemo(() => createDemoRehearsalSong(), []);
  const confidenceLabels = {
    low: t("confidenceLevelLow"),
    medium: t("confidenceLevelMedium"),
    high: t("confidenceLevelHigh")
  } as const;
  const provenanceLabels = {
    model: t("provenanceSourceModel"),
    user: t("provenanceSourceUser")
  } as const;

  return (
    <main>
      <h1>{t("appTitle")}</h1>
      <p>{t("appSubtitle")}</p>
      <p>
        {t("supportedFormats")}: {SUPPORTED_AUDIO_FORMATS.join(", ")}
      </p>
      <section>
        <h2>{rehearsalSong.title}</h2>
        <p>{rehearsalSong.exportSummary.headline}</p>
      </section>
      {rehearsalSong.sections.map((section) => (
        <section key={section.id}>
          <h3>{section.label}</h3>
          <p>{section.groove}</p>
          <p>
            {t("sectionConfidence")}: {confidenceLabels[section.confidence.level]} ({provenanceLabels[section.confidence.source]})
          </p>
          <ul>
            {section.roles.map((role) => (
              <li key={role.id}>
                <strong>{role.name}</strong>
                <span> - {role.harmony.chord}</span>
                <span> - {role.cue.value}</span>
                <span> - {t("roleConfidence")}: {confidenceLabels[role.confidence.level]}</span>
                <span> - {t("harmonySource")}: {provenanceLabels[role.harmony.source]}</span>
                {role.manualOverrides.map((override, index) => (
                  <span key={`${override.field}-${override.source}-${override.value.chord}-${index}`}>
                    {" "}
                    - {t("manualOverride")}: {override.value.chord} ({provenanceLabels[override.source]})
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <HomeFeature title={t("homeCard")} />
      <PlayerFeature title={t("playerCard")} />
      <ChordsFeature title={t("chordsCard")} />
      <RangesFeature title={t("rangesCard")} />
      <SettingsFeature title={t("settingsCard")} />
    </main>
  );
}
