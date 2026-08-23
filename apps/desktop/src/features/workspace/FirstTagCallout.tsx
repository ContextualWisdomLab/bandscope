import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatTagTime, resolveFirstTag } from "./firstTag";

/** Props for the first-tag rehearsal callout. */
export interface FirstTagCalloutProps {
  song: RehearsalSong;
}

type TagCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedTag = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate tag placeholders once so rehearsal data is never rescanned as template syntax. */
function formatTagCopy(template: string, values: TagCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof TagCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredTagScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first labeled tag and open the matching rendered map section. */
export function FirstTagCallout({ song }: FirstTagCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const songId = typeof runtimeSong?.id === "string" ? runtimeSong.id : "";
  const tag = resolveFirstTag(song);
  const tagSectionIndex =
    tag && Array.isArray(runtimeSong?.sections) ? runtimeSong.sections.indexOf(tag.section) : -1;
  const [openedTag, setOpenedTag] = useState<OpenedTag | null>(null);

  useEffect(() => {
    setOpenedTag(null);
  }, [songId, tagSectionIndex, tag?.section.id, tag?.holdingRole?.id, tag?.atSeconds]);

  if (!tag) {
    return (
      <aside
        id="workspace-surface-tag"
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstTagUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstTagLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstTagUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedTag?.songId === songId &&
    openedTag.sectionId === tag.section.id &&
    openedTag.sectionIndex === tagSectionIndex &&
    openedTag.holdingRoleId === (tag.holdingRole?.id ?? null) &&
    openedTag.atSeconds === tag.atSeconds;
  const at = formatTagTime(tag.atSeconds);
  const copyValues: TagCopyValues = {
    role: tag.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, tag.section.label),
    at
  };
  const hasRole = tag.holdingRole !== null;
  const actionLabel = formatTagCopy(
    t(hasRole ? "firstTagOpenAction" : "firstTagOpenActionBand"),
    copyValues
  );
  const body = formatTagCopy(t(hasRole ? "firstTagBody" : "firstTagBodyBand"), copyValues);
  const armed = formatTagCopy(t(hasRole ? "firstTagArmed" : "firstTagArmedBand"), copyValues);

  return (
    <aside
      id="workspace-surface-tag"
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstTagLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstTagLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-rose-300 font-black text-slate-950"
        onClick={() => {
          const renderer = document.querySelector<HTMLElement>(
            '[data-testid="song-structure-grid"]'
          );
          const target =
            tagSectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(
                  `[data-section-index="${tagSectionIndex}"]`
                ) ?? null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredTagScrollBehavior()
          });
          setOpenedTag({
            songId,
            sectionId: tag.section.id,
            sectionIndex: tagSectionIndex,
            holdingRoleId: tag.holdingRole?.id ?? null,
            atSeconds: tag.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
