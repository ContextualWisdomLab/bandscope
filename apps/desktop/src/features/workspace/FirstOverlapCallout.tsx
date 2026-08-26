import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatOverlapTime, resolveFirstOverlap } from "./firstOverlap";

/** Props for the first-overlap rehearsal callout. */
export interface FirstOverlapCalloutProps {
  song: RehearsalSong;
}

type OverlapCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedOverlap = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate overlap placeholders once so rehearsal data is never rescanned as template syntax. */
function formatOverlapCopy(template: string, values: OverlapCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof OverlapCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Keep logical song identity stable across immutable edits without invoking an untrusted id accessor. */
function overlapSongIdentity(song: unknown): unknown {
  if ((typeof song !== "object" && typeof song !== "function") || song === null) {
    return song;
  }

  try {
    const descriptor = Object.getOwnPropertyDescriptor(song, "id");
    return descriptor && "value" in descriptor && typeof descriptor.value === "string"
      ? descriptor.value
      : song;
  } catch {
    return song;
  }
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredOverlapScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first overlap and open the matching rendered map section. */
export function FirstOverlapCallout({ song }: FirstOverlapCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = overlapSongIdentity(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const overlap = resolveFirstOverlap(song);
  const overlapSectionIndex =
    overlap && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(overlap.section)
      : -1;
  const [openedOverlap, setOpenedOverlap] = useState<OpenedOverlap | null>(null);

  useEffect(() => {
    setOpenedOverlap(null);
  }, [songIdentity, overlapSectionIndex, overlap?.section.id, overlap?.holdingRole?.id, overlap?.atSeconds]);

  if (!overlap) {
    return (
      <aside
        id="workspace-surface-overlap"
        className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4"
        aria-label={t("firstOverlapUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">{t("firstOverlapLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstOverlapUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedOverlap !== null &&
    openedOverlap.songIdentity === songIdentity &&
    openedOverlap.sectionId === overlap.section.id &&
    openedOverlap.sectionIndex === overlapSectionIndex &&
    openedOverlap.holdingRoleId === (overlap.holdingRole?.id ?? null) &&
    openedOverlap.atSeconds === overlap.atSeconds;
  const at = formatOverlapTime(overlap.atSeconds);
  const copyValues: OverlapCopyValues = {
    role: overlap.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, overlap.section.label),
    at
  };
  const hasRole = overlap.holdingRole !== null;
  const actionLabel = formatOverlapCopy(
    t(hasRole ? "firstOverlapOpenAction" : "firstOverlapOpenActionBand"),
    copyValues
  );
  const body = formatOverlapCopy(t(hasRole ? "firstOverlapBody" : "firstOverlapBodyBand"), copyValues);
  const armed = formatOverlapCopy(t(hasRole ? "firstOverlapArmed" : "firstOverlapArmedBand"), copyValues);

  return (
    <aside
      id="workspace-surface-overlap"
      className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4"
      aria-label={t("firstOverlapLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">{t("firstOverlapLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{overlap.hint}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-rose-300 to-amber-300 font-black text-slate-950"
        onClick={() => {
          const renderer = document.querySelector<HTMLElement>('[data-testid="song-structure-grid"]');
          const target =
            overlapSectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(
                  `[data-section-index="${overlapSectionIndex}"]`
                ) ?? null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredOverlapScrollBehavior()
          });
          setOpenedOverlap({
            songIdentity,
            sectionId: overlap.section.id,
            sectionIndex: overlapSectionIndex,
            holdingRoleId: overlap.holdingRole?.id ?? null,
            atSeconds: overlap.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
