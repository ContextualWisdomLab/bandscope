import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatVampPlanTime, resolveFirstVampPlan } from "./firstVampPlan";

/** Props for the first vamp-plan rehearsal callout. */
export interface FirstVampPlanCalloutProps {
  song: RehearsalSong;
}

type VampPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedVampPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  vampPlan: string;
  atSeconds: number;
}>;

const GENERATED_ACTIVITY_VAMP_PLAN =
  /^Keep this part going until (.+) enters in the next section\.$/u;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableVampPlanSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate vamp-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatVampPlanCopy(template: string, values: VampPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof VampPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Localize the analysis-engine-owned vamp sentence while preserving custom role-owned guidance verbatim. */
function localizedVampPlan(vampPlan: string, generatedTemplate: string): string {
  const match = GENERATED_ACTIVITY_VAMP_PLAN.exec(vampPlan);
  const targetRole = match?.[1]?.trim() ?? "";
  if (targetRole.length === 0) {
    return vampPlan;
  }
  return generatedTemplate.replace("{target}", () => targetRole);
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredVampPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveVampPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first vamp plan and open the matching rendered map section. */
export function FirstVampPlanCallout({ song }: FirstVampPlanCalloutProps) {
  const calloutId = `workspace-surface-vamp-plan-${useId()}`;
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableVampPlanSongIdentity(song);
  const named = useMemo(() => resolveFirstVampPlan(song), [song]);
  const [openedVampPlan, setOpenedVampPlan] = useState<OpenedVampPlan | null>(null);

  useEffect(() => {
    setOpenedVampPlan(null);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.holdingRoleId,
    named?.vampPlan,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstVampPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstVampPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstVampPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedVampPlan !== null &&
    openedVampPlan.songIdentity === songIdentity &&
    openedVampPlan.sectionId === named.sectionId &&
    openedVampPlan.sectionIndex === named.sectionIndex &&
    openedVampPlan.holdingRoleId === named.holdingRoleId &&
    openedVampPlan.vampPlan === named.vampPlan &&
    openedVampPlan.atSeconds === named.atSeconds;
  const at = formatVampPlanTime(named.atSeconds);
  const copyValues: VampPlanCopyValues = {
    role: named.holdingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatVampPlanCopy(t("firstVampPlanOpenAction"), copyValues);
  const body = formatVampPlanCopy(t("firstVampPlanBody"), copyValues);
  const armed = formatVampPlanCopy(t("firstVampPlanArmed"), copyValues);
  const vampPlan = localizedVampPlan(named.vampPlan, t("firstVampPlanGeneratedGuidance"));

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstVampPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstVampPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{vampPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveVampPlanRenderer(event.currentTarget);
          const target =
            renderer?.querySelector<HTMLElement>(
              `[data-section-index="${named.sectionIndex}"]`
            ) ?? null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredVampPlanScrollBehavior()
          });
          setOpenedVampPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            holdingRoleId: named.holdingRoleId,
            vampPlan: named.vampPlan,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
