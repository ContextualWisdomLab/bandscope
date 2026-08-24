import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatFillPlanTime, resolveFirstFillPlan } from "./firstFillPlan";

/** Props for the first fill-plan rehearsal callout. */
export interface FirstFillPlanCalloutProps {
  song: RehearsalSong;
}

type FillPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedFillPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  fillPlan: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableFillPlanSongIdentity(song: RehearsalSong): unknown {
  if (song === null || typeof song !== "object" || Array.isArray(song)) {
    return song;
  }
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(song, "id");
  } catch {
    return song;
  }
  return descriptor !== undefined &&
    Object.prototype.hasOwnProperty.call(descriptor, "value") &&
    typeof descriptor.value === "string" &&
    descriptor.value.trim().length > 0
    ? descriptor.value
    : song;
}

/** Interpolate fill-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatFillPlanCopy(template: string, values: FillPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof FillPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredFillPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveFillPlanRenderer(origin: HTMLElement): HTMLElement | null {
  const selector = '[data-testid="song-structure-grid"]';
  const localScope = origin.closest("aside")?.parentElement ?? null;
  const localRenderers = localScope?.querySelectorAll<HTMLElement>(selector) ?? [];
  if (localRenderers.length === 1) {
    return localRenderers[0] ?? null;
  }
  if (localRenderers.length > 1) {
    return null;
  }

  const globalRenderers = document.querySelectorAll<HTMLElement>(selector);
  return globalRenderers.length === 1 ? (globalRenderers[0] ?? null) : null;
}

/** Name tonight's first fill plan and open the matching rendered map section. */
export function FirstFillPlanCallout({ song }: FirstFillPlanCalloutProps) {
  const calloutId = `workspace-surface-fill-plan-${useId()}`;
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableFillPlanSongIdentity(song);
  const named = useMemo(() => resolveFirstFillPlan(song), [song]);
  const [openedFillPlan, setOpenedFillPlan] = useState<OpenedFillPlan | null>(null);

  useEffect(() => {
    setOpenedFillPlan(null);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.holdingRoleId,
    named?.fillPlan,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstFillPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstFillPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstFillPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedFillPlan !== null &&
    openedFillPlan.songIdentity === songIdentity &&
    openedFillPlan.sectionId === named.sectionId &&
    openedFillPlan.sectionIndex === named.sectionIndex &&
    openedFillPlan.holdingRoleId === named.holdingRoleId &&
    openedFillPlan.fillPlan === named.fillPlan &&
    openedFillPlan.atSeconds === named.atSeconds;
  const at = formatFillPlanTime(named.atSeconds);
  const copyValues: FillPlanCopyValues = {
    role: named.holdingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatFillPlanCopy(t("firstFillPlanOpenAction"), copyValues);
  const body = formatFillPlanCopy(t("firstFillPlanBody"), copyValues);
  const armed = formatFillPlanCopy(t("firstFillPlanArmed"), copyValues);

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstFillPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstFillPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{named.fillPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveFillPlanRenderer(event.currentTarget);
          const target =
            named.sectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(
                  `[data-section-index="${named.sectionIndex}"]`
                ) ?? null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredFillPlanScrollBehavior()
          });
          setOpenedFillPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            holdingRoleId: named.holdingRoleId,
            fillPlan: named.fillPlan,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
