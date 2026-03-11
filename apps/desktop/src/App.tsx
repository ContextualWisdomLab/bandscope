import { SUPPORTED_AUDIO_FORMATS } from "@bandscope/shared-types";
import { ChordsFeature } from "./features/chords";
import { HomeFeature } from "./features/home";
import { PlayerFeature } from "./features/player";
import { RangesFeature } from "./features/ranges";
import { SettingsFeature } from "./features/settings";
import { createTranslator, detectPreferredLocale } from "./i18n";

export function App() {
  const t = createTranslator(detectPreferredLocale());

  return (
    <main>
      <h1>{t("appTitle")}</h1>
      <p>{t("appSubtitle")}</p>
      <p>
        {t("supportedFormats")}: {SUPPORTED_AUDIO_FORMATS.join(", ")}
      </p>
      <HomeFeature title={t("homeCard")} />
      <PlayerFeature title={t("playerCard")} />
      <ChordsFeature title={t("chordsCard")} />
      <RangesFeature title={t("rangesCard")} />
      <SettingsFeature title={t("settingsCard")} />
    </main>
  );
}
