import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatSimplificationTime, resolveFirstSimplification } from "./firstSimplification";

/** Props for the first-simplification rehearsal callout. */
export interface FirstSimplificationCalloutProps {
  song: RehearsalSong;
}

type SimplificationCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedSimplification = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate simplification placeholders once so rehearsal data is never rescanned as template syntax. */
function formatSimplificationCopy(template: string, values: SimplificationCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof SimplificationCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use a stable own song id when available, otherwise retain object identity without invoking accessors. */
function stableSongIdentity(song: unknown): unknown {
  if (song === null || typeof song !== "object") {
    return song;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(song, "id");
    if (
      descriptor !== undefined &&
      Object.prototype.hasOwnProperty.call(descriptor, "value") &&
      typeof descriptor.value === "string" &&
      descriptor.value.trim().length > 0
    ) {
      return descriptor.value;
    }
  } catch {
    return song;
  }
  return song;
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredSimplificationScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first simpler take and open the matching rendered map section. */
export function FirstSimplificationCallout({ song }: FirstSimplificationCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableSongIdentity(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const simpler = resolveFirstSimplification(song);
  const sectionIndex =
    simpler && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(simpler.section)
      : -1;
  const [openedSimplification, setOpenedSimplification] = useState<OpenedSimplification | null>(null);

  useEffect(() => {
    setOpenedSimplification(null);
  }, [songIdentity, sectionIndex, simpler?.section.id, simpler?.holdingRole?.id, simpler?.atSeconds]);

  if (!simpler) {
    return (
      <aside
        id="workspace-surface-simplification"
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstSimplificationUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstSimplificationLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstSimplificationUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedSimplification !== null &&
    openedSimplification.songIdentity === songIdentity &&
    openedSimplification.sectionId === simpler.section.id &&
    openedSimplification.sectionIndex === sectionIndex &&
    openedSimplification.holdingRoleId === (simpler.holdingRole?.id ?? null) &&
    openedSimplification.atSeconds === simpler.atSeconds;
  const at = formatSimplificationTime(simpler.atSeconds);
  const copyValues: SimplificationCopyValues = {
    role: simpler.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, simpler.section.label),
    at
  };
  const actionLabel = formatSimplificationCopy(t("firstSimplificationOpenAction"), copyValues);
  const body = formatSimplificationCopy(t("firstSimplificationBody"), copyValues);
  const armed = formatSimplificationCopy(t("firstSimplificationArmed"), copyValues);

  return (
    <aside
      id="workspace-surface-simplification"
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstSimplificationLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstSimplificationLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{simpler.hint}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-rose-300 font-black text-slate-950"
        onClick={() => {
          const renderer = document.querySelector<HTMLElement>('[data-testid="song-structure-grid"]');
          const target =
            sectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(
                  `[data-section-index="${sectionIndex}"]`
                ) ?? null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredSimplificationScrollBehavior()
          });
          setOpenedSimplification({
            songIdentity,
            sectionId: simpler.section.id,
            sectionIndex,
            holdingRoleId: simpler.holdingRole?.id ?? null,
            atSeconds: simpler.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
