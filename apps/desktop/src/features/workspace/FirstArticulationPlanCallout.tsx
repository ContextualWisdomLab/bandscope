import { useEffect, useId, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatArticulationPlanTime, resolveFirstArticulationPlan } from "./firstArticulationPlan";

/** Props for the first articulation-plan rehearsal callout. */
export interface FirstArticulationPlanCalloutProps {
  song: RehearsalSong;
}

type ArticulationPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedArticulationPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  articulationPlan: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableArticulationPlanSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate articulation-plan placeholders once so rehearsal data is never rescanned as template syntax. */
export function formatArticulationPlanCopy(template: string, values: ArticulationPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof ArticulationPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredArticulationPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveArticulationPlanRenderer(origin: HTMLElement): HTMLElement | null {
  const selector = "#workspace-song-structure-grid";
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

/** Name tonight's first articulation plan and open the matching rendered map section. */
export function FirstArticulationPlanCallout({ song }: FirstArticulationPlanCalloutProps) {
  const calloutId = `workspace-surface-articulation-plan-${useId()}`;
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableArticulationPlanSongIdentity(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const named = resolveFirstArticulationPlan(song);
  const namedSectionIndex =
    named && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(named.section)
      : -1;
  const [openedArticulationPlan, setOpenedArticulationPlan] = useState<OpenedArticulationPlan | null>(null);

  useEffect(() => {
    setOpenedArticulationPlan(null);
  }, [
    songIdentity,
    namedSectionIndex,
    named?.section.id,
    named?.holdingRole.id,
    named?.articulationPlan,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstArticulationPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstArticulationPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstArticulationPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedArticulationPlan !== null &&
    openedArticulationPlan.songIdentity === songIdentity &&
    openedArticulationPlan.sectionId === named.section.id &&
    openedArticulationPlan.sectionIndex === namedSectionIndex &&
    openedArticulationPlan.holdingRoleId === named.holdingRole.id &&
    openedArticulationPlan.articulationPlan === named.articulationPlan &&
    openedArticulationPlan.atSeconds === named.atSeconds;
  const at = formatArticulationPlanTime(named.atSeconds);
  const copyValues: ArticulationPlanCopyValues = {
    role: named.holdingRole.name,
    section: translateSectionFormLabel(locale, named.section.label),
    at
  };
  const actionLabel = formatArticulationPlanCopy(t("firstArticulationPlanOpenAction"), copyValues);
  const body = formatArticulationPlanCopy(t("firstArticulationPlanBody"), copyValues);
  const armed = formatArticulationPlanCopy(t("firstArticulationPlanArmed"), copyValues);

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstArticulationPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstArticulationPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{named.articulationPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveArticulationPlanRenderer(event.currentTarget);
          const target =
            namedSectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(
                  `[data-section-index="${namedSectionIndex}"]`
                ) ?? null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredArticulationPlanScrollBehavior()
          });
          setOpenedArticulationPlan({
            songIdentity,
            sectionId: named.section.id,
            sectionIndex: namedSectionIndex,
            holdingRoleId: named.holdingRole.id,
            articulationPlan: named.articulationPlan,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
