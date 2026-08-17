import { useMemo } from "react";
import type { RehearsalPriority, RehearsalRole, RehearsalSong } from "@bandscope/shared-types";
import { AudioWaveform } from "lucide-react";
import { createTranslator, detectPreferredLocale, type TranslationKey } from "../../i18n";
import { collectStemLanes, type StemLane } from "./stemLanes";

/**
 * Props for the Stem Lab isolation board.
 */
export interface StemLabProps {
  /**
   * Analyzed song whose roles become isolation lanes, or `null` before the
   * player has a rehearsal map.
   */
  song: RehearsalSong | null;
}

/**
 * Translate a role class into the locale label the player should read.
 */
export function stemRoleTypeLabel(
  roleType: RehearsalRole["roleType"],
  t: (key: TranslationKey) => string
): string {
  switch (roleType) {
    case "instrument":
      return t("stemLabRoleTypeInstrument");
    case "vocal":
      return t("stemLabRoleTypeVocal");
    case "hand":
      return t("stemLabRoleTypeHand");
    default: {
      const _exhaustive: never = roleType;
      return _exhaustive;
    }
  }
}

/**
 * Translate a merged rehearsal priority into the next action for that lane.
 */
export function stemLanePriorityLabel(
  priority: RehearsalPriority,
  t: (key: TranslationKey) => string
): string {
  switch (priority) {
    case "high":
      return t("stemLabPriorityHigh");
    case "medium":
      return t("stemLabPriorityMedium");
    case "low":
      return t("stemLabPriorityLow");
    default: {
      const _exhaustive: never = priority;
      return _exhaustive;
    }
  }
}

/**
 * Stem Lab lists the parts to isolate tonight.
 *
 * It does not invent playable stem files. When analysis has roles, each lane
 * tells the player the range, sections, and clashes to lock before rehearsal.
 * Invalid or incomplete range evidence is replaced by an explicit ear-check
 * action rather than presented as a playable range. Before analysis, the empty
 * copy tells the player to choose local audio next; an analyzed song with no
 * detected roles instead reports that result without sending the player back
 * to the import step.
 */
export function StemLab({ song }: StemLabProps) {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const lanes = useMemo(() => (song ? collectStemLanes(song) : []), [song]);

  return (
    <section
      className="rounded-3xl border border-[color:var(--bandscope-stem-lane-border)] bg-[var(--bandscope-stem-lane-surface)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.24)]"
      aria-labelledby="stem-lab-title"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="rounded-2xl border border-violet-300/30 bg-violet-300/10 p-3 text-violet-100">
          <AudioWaveform className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="stem-lab-title" className="text-xl font-black tracking-tight text-white">
            {t("stemLabTitle")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">{t("stemLabSubtitle")}</p>
        </div>
      </div>

      {song === null ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-slate-200">
          {t("stemLabEmptyNextAction")}
        </p>
      ) : lanes.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-slate-200">
          {t("stemLabNoRolesDetected")}
        </p>
      ) : (
        <ul className="grid gap-3" aria-label={t("stemLabLaneListLabel")}>
          {lanes.map((lane) => (
            <StemLaneCard key={lane.roleId} lane={lane} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One role lane with the next rehearsal action, not a fake play control.
 */
function StemLaneCard({
  lane,
  t
}: {
  lane: StemLane;
  t: (key: TranslationKey) => string;
}) {
  const hasTrustedRange = Boolean(lane.lowestNote && lane.highestNote);

  return (
    <li className="rounded-2xl border border-[color:var(--bandscope-stem-lane-border)] bg-[var(--bandscope-stem-lane-fill)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-black text-white">{lane.roleName}</h3>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
          {stemRoleTypeLabel(lane.roleType, t)}
        </p>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-200">
        {hasTrustedRange
          ? `${t("stemLabRangeLabel")} ${lane.lowestNote}–${lane.highestNote}`
          : t("stemLabRangeUnknown")}
      </p>
      <p className="mt-1 text-sm leading-6 text-slate-300">
        {lane.sectionLabels.length > 0
          ? `${t("stemLabSectionsLabel")} ${lane.sectionLabels.join(", ")}`
          : t("stemLabSectionsUnknown")}
      </p>
      {lane.overlapWarnings.length > 0 ? (
        <p className="mt-2 text-sm leading-6 text-amber-100">
          {t("stemLabOverlapLabel")} {lane.overlapWarnings.join(" ")}
        </p>
      ) : null}
      <p className="mt-2 text-sm leading-6 text-rose-100">
        {t("stemLabPriorityLabel")} {stemLanePriorityLabel(lane.rehearsalPriority, t)}
      </p>
      <p className="mt-3 text-sm font-semibold leading-6 text-cyan-100">{t("stemLabLaneNextAction")}</p>
    </li>
  );
}
