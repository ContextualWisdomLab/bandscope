import type { RehearsalSong } from "@bandscope/shared-types";
import { FirstEntranceCallout } from "../workspace/FirstEntranceCallout";
import { createTranslator, detectPreferredLocale } from "../../i18n";

/** Player surface that names tonight's first entrance instead of a generic ready card. */
export function PlayerFeature(props: { title: string; song?: RehearsalSong | null }) {
  const { title, song } = props;
  const t = createTranslator(detectPreferredLocale());

  if (!song) {
    return (
      <section className="p-6">
        <h2 className="text-xl font-black text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{t("firstEntranceNeedsSong")}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 p-6">
      <h2 className="text-xl font-black text-white">{title}</h2>
      <FirstEntranceCallout song={song} />
    </section>
  );
}
