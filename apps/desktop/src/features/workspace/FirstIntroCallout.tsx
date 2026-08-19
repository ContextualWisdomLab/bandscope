import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatIntroTime, resolveFirstIntro } from "./firstIntro";

/** Props for the first-intro rehearsal callout. */
export interface FirstIntroCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearIntro?: (atSeconds: number) => void;
}

type IntroCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type HeardIntro = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate intro placeholders once so rehearsal data is never rescanned as template syntax. */
function formatIntroCopy(template: string, values: IntroCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof IntroCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredIntroScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first labeled intro and offer only an action that the current surface can execute. */
export function FirstIntroCallout({
  song,
  actionMode = "workspace-scroll",
  onHearIntro
}: FirstIntroCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const songId = typeof runtimeSong?.id === "string" ? runtimeSong.id : "";
  const intro = resolveFirstIntro(song);
  const introSectionIndex =
    intro && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(intro.section)
      : -1;
  const [heardIntro, setHeardIntro] = useState<HeardIntro | null>(null);

  useEffect(() => {
    setHeardIntro(null);
  }, [songId, introSectionIndex, intro?.section.id, intro?.holdingRole?.id, intro?.atSeconds]);

  if (!intro) {
    return (
      <aside
        id="workspace-surface-intro"
        className="rounded-2xl border border-teal-300/20 bg-teal-300/[0.06] p-4"
        aria-label={t("firstIntroUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-200">{t("firstIntroLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstIntroUnavailable")}</p>
      </aside>
    );
  }

  const heard =
    heardIntro?.songId === songId &&
    heardIntro.sectionId === intro.section.id &&
    heardIntro.sectionIndex === introSectionIndex &&
    heardIntro.holdingRoleId === (intro.holdingRole?.id ?? null) &&
    heardIntro.atSeconds === intro.atSeconds;
  const at = formatIntroTime(intro.atSeconds);
  const copyValues: IntroCopyValues = {
    role: intro.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, intro.section.label),
    at
  };
  const hasRole = intro.holdingRole !== null;
  const actionLabel = formatIntroCopy(
    t(
      actionMode === "callback-only"
        ? hasRole
          ? "firstIntroAction"
          : "firstIntroActionBand"
        : hasRole
          ? "firstIntroOpenAction"
          : "firstIntroOpenActionBand"
    ),
    copyValues
  );
  const body = formatIntroCopy(t(hasRole ? "firstIntroBody" : "firstIntroBodyBand"), copyValues);
  const armed = formatIntroCopy(t(hasRole ? "firstIntroArmed" : "firstIntroArmedBand"), copyValues);
  const canExecuteAction = actionMode === "workspace-scroll" || typeof onHearIntro === "function";
  /** Record completion only after the owning surface has executed the selected intro action. */
  const markIntroActionComplete = () => {
    setHeardIntro({
      songId,
      sectionId: intro.section.id,
      sectionIndex: introSectionIndex,
      holdingRoleId: intro.holdingRole?.id ?? null,
      atSeconds: intro.atSeconds
    });
  };

  return (
    <aside
      id="workspace-surface-intro"
      className="rounded-2xl border border-teal-300/20 bg-teal-300/[0.06] p-4"
      aria-label={t("firstIntroLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-200">{t("firstIntroLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-teal-300 to-amber-300 font-black text-slate-950"
          onClick={() => {
            if (actionMode === "callback-only") {
              onHearIntro!(intro.atSeconds);
              markIntroActionComplete();
              return;
            }
            const grid = document.querySelector('[data-testid="song-structure-grid"]');
            const target = introSectionIndex >= 0 ? grid?.children.item(introSectionIndex) : null;
            if (typeof target?.scrollIntoView !== "function") {
              return;
            }
            target.scrollIntoView({
              block: "nearest",
              behavior: preferredIntroScrollBehavior()
            });
            markIntroActionComplete();
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
