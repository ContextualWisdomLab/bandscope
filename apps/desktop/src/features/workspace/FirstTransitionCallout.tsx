import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatTransitionTime, resolveFirstTransition } from "./firstTransition";

/** Props for the first-transition rehearsal callout. */
export interface FirstTransitionCalloutProps {
  song: RehearsalSong;
}

type TransitionCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedTransition = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate transition placeholders once so rehearsal data is never rescanned as template syntax. */
function formatTransitionCopy(template: string, values: TransitionCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof TransitionCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredTransitionScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first transition and open the matching rendered map section. */
export function FirstTransitionCallout({ song }: FirstTransitionCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity: unknown = song;
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const transition = resolveFirstTransition(song);
  const transitionSectionIndex =
    transition && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(transition.section)
      : -1;
  const [openedTransition, setOpenedTransition] = useState<OpenedTransition | null>(null);

  useEffect(() => {
    setOpenedTransition(null);
  }, [songIdentity, transitionSectionIndex, transition?.section.id, transition?.holdingRole?.id, transition?.atSeconds]);

  if (!transition) {
    return (
      <aside
        id="workspace-surface-transition"
        className="rounded-2xl border border-teal-300/20 bg-teal-300/[0.06] p-4"
        aria-label={t("firstTransitionUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-200">{t("firstTransitionLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstTransitionUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedTransition !== null &&
    openedTransition.songIdentity === songIdentity &&
    openedTransition.sectionId === transition.section.id &&
    openedTransition.sectionIndex === transitionSectionIndex &&
    openedTransition.holdingRoleId === (transition.holdingRole?.id ?? null) &&
    openedTransition.atSeconds === transition.atSeconds;
  const at = formatTransitionTime(transition.atSeconds);
  const copyValues: TransitionCopyValues = {
    role: transition.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, transition.section.label),
    at
  };
  const hasRole = transition.holdingRole !== null;
  const actionLabel = formatTransitionCopy(
    t(hasRole ? "firstTransitionOpenAction" : "firstTransitionOpenActionBand"),
    copyValues
  );
  const body = formatTransitionCopy(
    t(hasRole ? "firstTransitionBody" : "firstTransitionBodyBand"),
    copyValues
  );
  const armed = formatTransitionCopy(
    t(hasRole ? "firstTransitionArmed" : "firstTransitionArmedBand"),
    copyValues
  );

  return (
    <aside
      id="workspace-surface-transition"
      className="rounded-2xl border border-teal-300/20 bg-teal-300/[0.06] p-4"
      aria-label={t("firstTransitionLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-200">{t("firstTransitionLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{transition.hint}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-teal-300 to-cyan-300 font-black text-slate-950"
        onClick={() => {
          const renderer = document.querySelector<HTMLElement>('[data-testid="song-structure-grid"]');
          const target =
            transitionSectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(
                  `[data-section-index="${transitionSectionIndex}"]`
                ) ?? null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredTransitionScrollBehavior()
          });
          setOpenedTransition({
            songIdentity,
            sectionId: transition.section.id,
            sectionIndex: transitionSectionIndex,
            holdingRoleId: transition.holdingRole?.id ?? null,
            atSeconds: transition.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
