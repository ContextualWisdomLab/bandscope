import { useEffect, useId, useMemo, useState } from "react";
import type { ProvenanceSource, RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatHitPlanTime, resolveFirstHitPlan } from "./firstHitPlan";

/** Props for the first hit-plan rehearsal callout. */
export interface FirstHitPlanCalloutProps {
  song: RehearsalSong;
}

type HitPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedHitPlan = Readonly<{
  songIdentity: RehearsalSong;
  sectionId: string;
  sectionIndex: number;
  landingRoleId: string;
  hitPlan: string;
  hitPlanSource: ProvenanceSource;
  atSeconds: number;
}>;

const GENERATED_ACTIVITY_HIT_PLAN =
  /^Land this hit with (.+); don't drift past the downbeat\.$/u;
const GENERATED_ACTIVITY_HIT_PLAN_BAND_TARGET = "the rest of the band";
/** Engine-owned source labels that can appear as targets without being section lineup names. */
const GENERATED_ACTIVITY_HIT_PLAN_ENGINE_TARGETS = new Set<string>([
  GENERATED_ACTIVITY_HIT_PLAN_BAND_TARGET,
  "Accompaniment"
]);

/** Interpolate hit-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatHitPlanCopy(template: string, values: HitPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof HitPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Localize the analysis-engine-owned hit sentence while preserving custom role-owned guidance verbatim. */
function localizedHitPlan(
  hitPlan: string,
  hitPlanSource: ProvenanceSource,
  generatedTemplate: string,
  generatedBandTemplate: string,
  knownSectionRoleNames: readonly string[]
): string {
  if (hitPlanSource !== "model") {
    return hitPlan;
  }
  const match = GENERATED_ACTIVITY_HIT_PLAN.exec(hitPlan);
  const targetRole = match?.[1]?.trim() ?? "";
  if (targetRole.length === 0) {
    return hitPlan;
  }
  if (targetRole === GENERATED_ACTIVITY_HIT_PLAN_BAND_TARGET) {
    return generatedBandTemplate;
  }
  if (GENERATED_ACTIVITY_HIT_PLAN_ENGINE_TARGETS.has(targetRole)) {
    return generatedTemplate.replace("{target}", () => targetRole);
  }
  // The engine only names active parts from the resolver's trusted snapshot or
  // an engine-owned aggregate label. Any other shaped sentence stays verbatim.
  const matchesLineup = knownSectionRoleNames.some((name) => name.startsWith(targetRole));
  if (!matchesLineup) {
    return hitPlan;
  }
  return generatedTemplate.replace("{target}", () => targetRole);
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredHitPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveHitPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first hit plan and open the matching rendered map section. */
export function FirstHitPlanCallout({ song }: FirstHitPlanCalloutProps) {
  const calloutId = `workspace-surface-hit-plan-${useId()}`;
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = song;
  const named = useMemo(() => resolveFirstHitPlan(song), [song]);
  const [openedHitPlan, setOpenedHitPlan] = useState<OpenedHitPlan | null>(null);

  useEffect(() => {
    setOpenedHitPlan(null);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.landingRoleId,
    named?.hitPlan,
    named?.hitPlanSource,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstHitPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstHitPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstHitPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedHitPlan !== null &&
    openedHitPlan.songIdentity === songIdentity &&
    openedHitPlan.sectionId === named.sectionId &&
    openedHitPlan.sectionIndex === named.sectionIndex &&
    openedHitPlan.landingRoleId === named.landingRoleId &&
    openedHitPlan.hitPlan === named.hitPlan &&
    openedHitPlan.hitPlanSource === named.hitPlanSource &&
    openedHitPlan.atSeconds === named.atSeconds;
  const at = formatHitPlanTime(named.atSeconds);
  const copyValues: HitPlanCopyValues = {
    role: named.landingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatHitPlanCopy(t("firstHitPlanOpenAction"), copyValues);
  const body = formatHitPlanCopy(t("firstHitPlanBody"), copyValues);
  const armed = formatHitPlanCopy(t("firstHitPlanArmed"), copyValues);
  const hitPlan = localizedHitPlan(
    named.hitPlan,
    named.hitPlanSource,
    t("firstHitPlanGeneratedGuidance"),
    t("firstHitPlanGeneratedBandGuidance"),
    named.sectionRoleNames
  );

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstHitPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstHitPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{hitPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveHitPlanRenderer(event.currentTarget);
          const target =
            renderer?.querySelector<HTMLElement>(
              `[data-section-index="${named.sectionIndex}"]`
            ) ?? null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredHitPlanScrollBehavior()
          });
          setOpenedHitPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            landingRoleId: named.landingRoleId,
            hitPlan: named.hitPlan,
            hitPlanSource: named.hitPlanSource,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
