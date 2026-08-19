import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatVerseTime, resolveFirstVerse } from "./firstVerse";

/** Props for the first-verse rehearsal callout. */
export interface FirstVerseCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearVerse?: (atSeconds: number) => void;
}

type VerseCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type HeardVerse = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate verse placeholders once so rehearsal data is never rescanned as template syntax. */
function formatVerseCopy(template: string, values: VerseCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof VerseCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredVerseScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first labeled verse and offer only an action that the current surface can execute. */
export function FirstVerseCallout({
  song,
  actionMode = "workspace-scroll",
  onHearVerse
}: FirstVerseCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const songId = typeof runtimeSong?.id === "string" ? runtimeSong.id : "";
  const verse = resolveFirstVerse(song);
  const verseSectionIndex =
    verse && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(verse.section)
      : -1;
  const [heardVerse, setHeardVerse] = useState<HeardVerse | null>(null);

  useEffect(() => {
    setHeardVerse(null);
  }, [songId, verseSectionIndex, verse?.section.id, verse?.holdingRole?.id, verse?.atSeconds]);

  if (!verse) {
    return (
      <aside
        id="workspace-surface-verse"
        className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] p-4"
        aria-label={t("firstVerseUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">{t("firstVerseLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstVerseUnavailable")}</p>
      </aside>
    );
  }

  const heard =
    heardVerse?.songId === songId &&
    heardVerse.sectionId === verse.section.id &&
    heardVerse.sectionIndex === verseSectionIndex &&
    heardVerse.holdingRoleId === (verse.holdingRole?.id ?? null) &&
    heardVerse.atSeconds === verse.atSeconds;
  const at = formatVerseTime(verse.atSeconds);
  const copyValues: VerseCopyValues = {
    role: verse.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, verse.section.label),
    at
  };
  const hasRole = verse.holdingRole !== null;
  const actionLabel = formatVerseCopy(
    t(
      actionMode === "callback-only"
        ? hasRole
          ? "firstVerseAction"
          : "firstVerseActionBand"
        : hasRole
          ? "firstVerseOpenAction"
          : "firstVerseOpenActionBand"
    ),
    copyValues
  );
  const body = formatVerseCopy(t(hasRole ? "firstVerseBody" : "firstVerseBodyBand"), copyValues);
  const armed = formatVerseCopy(t(hasRole ? "firstVerseArmed" : "firstVerseArmedBand"), copyValues);
  const canExecuteAction = actionMode === "workspace-scroll" || typeof onHearVerse === "function";
  /** Record completion only after the owning surface has executed the selected verse action. */
  const markVerseActionComplete = () => {
    setHeardVerse({
      songId,
      sectionId: verse.section.id,
      sectionIndex: verseSectionIndex,
      holdingRoleId: verse.holdingRole?.id ?? null,
      atSeconds: verse.atSeconds
    });
  };

  return (
    <aside
      id="workspace-surface-verse"
      className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] p-4"
      aria-label={t("firstVerseLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">{t("firstVerseLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-sky-300 to-amber-300 font-black text-slate-950"
          onClick={() => {
            if (actionMode === "callback-only") {
              onHearVerse!(verse.atSeconds);
              markVerseActionComplete();
              return;
            }
            const grid = document.querySelector('[data-testid="song-structure-grid"]');
            const target = verseSectionIndex >= 0 ? grid?.children.item(verseSectionIndex) : null;
            if (typeof target?.scrollIntoView !== "function") {
              return;
            }
            target.scrollIntoView({
              block: "nearest",
              behavior: preferredVerseScrollBehavior()
            });
            markVerseActionComplete();
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
