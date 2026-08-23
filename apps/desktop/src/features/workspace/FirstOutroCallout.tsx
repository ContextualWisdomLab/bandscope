import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatOutroTime, resolveFirstOutro } from "./firstOutro";

/** Props for the first-outro rehearsal callout. */
export interface FirstOutroCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearOutro?: (atSeconds: number) => void;
}

type OutroCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type HeardOutro = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate outro placeholders once so rehearsal data is never rescanned as template syntax. */
function formatOutroCopy(template: string, values: OutroCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof OutroCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredOutroScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first labeled outro and offer only an action that the current surface can execute. */
export function FirstOutroCallout({
  song,
  actionMode = "workspace-scroll",
  onHearOutro
}: FirstOutroCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const songId = typeof runtimeSong?.id === "string" ? runtimeSong.id : "";
  const outro = resolveFirstOutro(song);
  const outroSectionIndex =
    outro && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(outro.section)
      : -1;
  const [heardOutro, setHeardOutro] = useState<HeardOutro | null>(null);

  useEffect(() => {
    setHeardOutro(null);
  }, [songId, outroSectionIndex, outro?.section.id, outro?.holdingRole?.id, outro?.atSeconds]);

  if (!outro) {
    return (
      <aside
        id="workspace-surface-outro"
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstOutroUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstOutroLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstOutroUnavailable")}</p>
      </aside>
    );
  }

  const heard =
    heardOutro?.songId === songId &&
    heardOutro.sectionId === outro.section.id &&
    heardOutro.sectionIndex === outroSectionIndex &&
    heardOutro.holdingRoleId === (outro.holdingRole?.id ?? null) &&
    heardOutro.atSeconds === outro.atSeconds;
  const at = formatOutroTime(outro.atSeconds);
  const copyValues: OutroCopyValues = {
    role: outro.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, outro.section.label),
    at
  };
  const hasRole = outro.holdingRole !== null;
  const actionLabel = formatOutroCopy(
    t(
      actionMode === "callback-only"
        ? hasRole
          ? "firstOutroAction"
          : "firstOutroActionBand"
        : hasRole
          ? "firstOutroOpenAction"
          : "firstOutroOpenActionBand"
    ),
    copyValues
  );
  const body = formatOutroCopy(t(hasRole ? "firstOutroBody" : "firstOutroBodyBand"), copyValues);
  const armed = formatOutroCopy(t(hasRole ? "firstOutroArmed" : "firstOutroArmedBand"), copyValues);
  const canExecuteAction = actionMode === "workspace-scroll" || typeof onHearOutro === "function";
  /** Record completion only after the owning surface has executed the selected outro action. */
  const markOutroActionComplete = () => {
    setHeardOutro({
      songId,
      sectionId: outro.section.id,
      sectionIndex: outroSectionIndex,
      holdingRoleId: outro.holdingRole?.id ?? null,
      atSeconds: outro.atSeconds
    });
  };

  return (
    <aside
      id="workspace-surface-outro"
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstOutroLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstOutroLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-rose-300 font-black text-slate-950"
          onClick={() => {
            if (actionMode === "callback-only") {
              onHearOutro!(outro.atSeconds);
              markOutroActionComplete();
              return;
            }
            const target =
              outroSectionIndex >= 0
                ? document.querySelector<HTMLElement>(
                    `[data-section-index="${outroSectionIndex}"]`
                  )
                : null;
            if (typeof target?.scrollIntoView !== "function") {
              return;
            }
            target.scrollIntoView({
              block: "nearest",
              behavior: preferredOutroScrollBehavior()
            });
            markOutroActionComplete();
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
