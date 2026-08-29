import { useMemo } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { fillRangeCopy, meaningfulRangeText } from "../workspace/firstRangeSqueeze";

/** Tonight's first named section a player should loop from the rehearsal map. */
export type FirstNamedSection = {
  id: string;
  label: string;
};

/** Return whether an untrusted runtime value is a non-array object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read an owned data-property value without invoking an accessor or Proxy get trap. */
function ownDataProperty(record: Record<string, unknown>, property: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, property);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/** Pick the first named section window without treating malformed evidence as a loop. */
export function firstNamedSection(song: RehearsalSong | null | undefined): FirstNamedSection | null {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong)) {
    return null;
  }
  const sections = ownDataProperty(runtimeSong, "sections");
  if (!Array.isArray(sections)) {
    return null;
  }
  for (const sectionValue of sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const id = meaningfulRangeText(ownDataProperty(sectionValue, "id"));
    const label = meaningfulRangeText(ownDataProperty(sectionValue, "label"));
    if (!id || !label) {
      continue;
    }
    const timeRange = ownDataProperty(sectionValue, "timeRange");
    if (!isRuntimeObject(timeRange)) {
      continue;
    }
    const start = ownDataProperty(timeRange, "start");
    const end = ownDataProperty(timeRange, "end");
    if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }
    return { id, label };
  }
  return null;
}

/** Name the next map loop when this window cannot play local audio yet. */
export function PlayerFeature(props: { title: string; song?: RehearsalSong | null }) {
  const { title, song } = props;
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const namedSection = useMemo(() => firstNamedSection(song), [song]);

  if (!song) {
    return (
      <section className="space-y-4 rounded-3xl border border-cyan-300/20 bg-slate-950/72 p-5 text-slate-100 shadow-[0_20px_80px_rgba(0,0,0,0.24)]">
        <h2 className="text-2xl font-black tracking-tight text-white">{title}</h2>
        <p className="text-sm leading-6 text-slate-300">{t("playerEmptyState")}</p>
      </section>
    );
  }

  const nextAction = namedSection
    ? fillRangeCopy(t("playerMapLoopNextAction"), { sectionLabel: namedSection.label })
    : t("playerMissingSection");

  return (
    <section className="space-y-4 text-slate-100">
      <h2 className="text-2xl font-black tracking-tight text-white">{title}</h2>
      <section
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4"
        data-testid="player-next-map-loop"
        aria-label={t("playerNextMapLoopTitle")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("playerNextMapLoopTitle")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-100">{nextAction}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("playerNoAudioYet")}</p>
      </section>
      {namedSection ? (
        <p className="text-sm font-semibold text-slate-200" data-testid="player-song-title">
          {song.title}
        </p>
      ) : null}
    </section>
  );
}
