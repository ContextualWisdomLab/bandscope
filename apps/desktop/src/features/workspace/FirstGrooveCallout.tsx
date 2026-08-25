import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatGrooveTime, resolveFirstGroove } from "./firstGroove";

/** Props for the first-groove rehearsal callout. */
export interface FirstGrooveCalloutProps {
  song: RehearsalSong;
}

type GrooveCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedGroove = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate groove placeholders once so rehearsal data is never rescanned as template syntax. */
function formatGrooveCopy(template: string, values: GrooveCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof GrooveCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredGrooveScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first groove and open the matching rendered map section. */
export function FirstGrooveCallout({ song }: FirstGrooveCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity: unknown = song;
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const groove = resolveFirstGroove(song);
  const grooveSectionIndex =
    groove && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(groove.section)
      : -1;
  const [openedGroove, setOpenedGroove] = useState<OpenedGroove | null>(null);

  useEffect(() => {
    setOpenedGroove(null);
  }, [songIdentity, grooveSectionIndex, groove?.section.id, groove?.holdingRole?.id, groove?.atSeconds]);

  if (!groove) {
    return (
      <aside
        id="workspace-surface-groove"
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstGrooveUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstGrooveLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstGrooveUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedGroove !== null &&
    openedGroove.songIdentity === songIdentity &&
    openedGroove.sectionId === groove.section.id &&
    openedGroove.sectionIndex === grooveSectionIndex &&
    openedGroove.holdingRoleId === (groove.holdingRole?.id ?? null) &&
    openedGroove.atSeconds === groove.atSeconds;
  const at = formatGrooveTime(groove.atSeconds);
  const copyValues: GrooveCopyValues = {
    role: groove.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, groove.section.label),
    at
  };
  const hasRole = groove.holdingRole !== null;
  const actionLabel = formatGrooveCopy(
    t(hasRole ? "firstGrooveOpenAction" : "firstGrooveOpenActionBand"),
    copyValues
  );
  const body = formatGrooveCopy(t(hasRole ? "firstGrooveBody" : "firstGrooveBodyBand"), copyValues);
  const armed = formatGrooveCopy(t(hasRole ? "firstGrooveArmed" : "firstGrooveArmedBand"), copyValues);

  return (
    <aside
      id="workspace-surface-groove"
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstGrooveLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstGrooveLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{groove.hint}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-rose-300 font-black text-slate-950"
        onClick={() => {
          const renderer = document.querySelector<HTMLElement>(
            '[role="region"][aria-label="Scrollable song structure timeline"]'
          );
          const target =
            grooveSectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(
                  `[data-section-index="${grooveSectionIndex}"]`
                ) ?? null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredGrooveScrollBehavior()
          });
          setOpenedGroove({
            songIdentity,
            sectionId: groove.section.id,
            sectionIndex: grooveSectionIndex,
            holdingRoleId: groove.holdingRole?.id ?? null,
            atSeconds: groove.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
