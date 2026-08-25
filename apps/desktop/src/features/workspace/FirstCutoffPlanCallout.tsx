import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatCutoffPlanTime, resolveFirstCutoffPlan } from "./firstCutoffPlan";

/** Props for the first cutoff-plan rehearsal callout. */
export interface FirstCutoffPlanCalloutProps {
  song: RehearsalSong;
}

type CutoffPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedCutoffPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  landingRoleId: string;
  cutoffPlan: string;
  atSeconds: number;
}>;

const GENERATED_ACTIVITY_CUTOFF_PLAN =
  /^Cut this off with (.+); don't linger past the last beat\.$/u;
const GENERATED_ACTIVITY_CUTOFF_PLAN_BAND_TARGET = "the rest of the band";

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableCutoffPlanSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate cutoff-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatCutoffPlanCopy(template: string, values: CutoffPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof CutoffPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Localize the analysis-engine-owned cutoff sentence while preserving custom role-owned guidance verbatim. */
function localizedCutoffPlan(
  cutoffPlan: string,
  generatedTemplate: string,
  generatedBandTemplate: string
): string {
  const match = GENERATED_ACTIVITY_CUTOFF_PLAN.exec(cutoffPlan);
  const targetRole = match?.[1]?.trim() ?? "";
  if (targetRole.length === 0) {
    return cutoffPlan;
  }
  if (targetRole === GENERATED_ACTIVITY_CUTOFF_PLAN_BAND_TARGET) {
    return generatedBandTemplate;
  }
  return generatedTemplate.replace("{target}", () => targetRole);
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredCutoffPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveCutoffPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first cutoff plan and open the matching rendered map section. */
export function FirstCutoffPlanCallout({ song }: FirstCutoffPlanCalloutProps) {
  const calloutId = `workspace-surface-cutoff-plan-${useId()}`;
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableCutoffPlanSongIdentity(song);
  const named = useMemo(() => resolveFirstCutoffPlan(song), [song]);
  const [openedCutoffPlan, setOpenedCutoffPlan] = useState<OpenedCutoffPlan | null>(null);

  useEffect(() => {
    setOpenedCutoffPlan(null);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.landingRoleId,
    named?.cutoffPlan,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstCutoffPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstCutoffPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstCutoffPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedCutoffPlan !== null &&
    openedCutoffPlan.songIdentity === songIdentity &&
    openedCutoffPlan.sectionId === named.sectionId &&
    openedCutoffPlan.sectionIndex === named.sectionIndex &&
    openedCutoffPlan.landingRoleId === named.landingRoleId &&
    openedCutoffPlan.cutoffPlan === named.cutoffPlan &&
    openedCutoffPlan.atSeconds === named.atSeconds;
  const at = formatCutoffPlanTime(named.atSeconds);
  const copyValues: CutoffPlanCopyValues = {
    role: named.landingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatCutoffPlanCopy(t("firstCutoffPlanOpenAction"), copyValues);
  const body = formatCutoffPlanCopy(t("firstCutoffPlanBody"), copyValues);
  const armed = formatCutoffPlanCopy(t("firstCutoffPlanArmed"), copyValues);
  const cutoffPlan = localizedCutoffPlan(
    named.cutoffPlan,
    t("firstCutoffPlanGeneratedGuidance"),
    t("firstCutoffPlanGeneratedBandGuidance")
  );

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstCutoffPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstCutoffPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{cutoffPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveCutoffPlanRenderer(event.currentTarget);
          const target =
            renderer?.querySelector<HTMLElement>(
              `[data-section-index="${named.sectionIndex}"]`
            ) ?? null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredCutoffPlanScrollBehavior()
          });
          setOpenedCutoffPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            landingRoleId: named.landingRoleId,
            cutoffPlan: named.cutoffPlan,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
