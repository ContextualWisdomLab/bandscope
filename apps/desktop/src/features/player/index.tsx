import type { RehearsalSong } from "@bandscope/shared-types";
import { FirstEntranceCallout } from "../workspace/FirstEntranceCallout";
import { createTranslator, detectPreferredLocale } from "../../i18n";

type PlayerFeatureProps = {
  title: string;
  song?: RehearsalSong | null;
  onPlayFromSeconds?: (startSeconds: number) => void;
};

/** Player surface that names tonight's first entrance and delegates playback to the owning player. */
export function PlayerFeature({ title, song, onPlayFromSeconds }: PlayerFeatureProps) {
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
      <FirstEntranceCallout
        song={song}
        actionMode="callback-only"
        onHearEntrance={onPlayFromSeconds}
      />
    </section>
  );
}
