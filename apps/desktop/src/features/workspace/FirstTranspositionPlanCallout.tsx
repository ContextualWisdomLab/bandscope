import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatTranspositionPlanTime, resolveFirstTranspositionPlan } from "./firstTranspositionPlan";

/** Props for the first transposition-plan rehearsal callout. */
export interface FirstTranspositionPlanCalloutProps {
  song: RehearsalSong;
}

type TranspositionPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedTranspositionPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  transpositionPlan: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableTranspositionPlanSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate transposition-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatTranspositionPlanCopy(template: string, values: TranspositionPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof TranspositionPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredTranspositionPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveTranspositionPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first transposition plan and open the matching rendered map section. */
export function FirstTranspositionPlanCallout({ song }: FirstTranspositionPlanCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableTranspositionPlanSongIdentity(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const named = resolveFirstTranspositionPlan(song);
  const namedSectionIndex =
    named && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(named.section)
      : -1;
  const [openedTranspositionPlan, setOpenedTranspositionPlan] = useState<OpenedTranspositionPlan | null>(null);

  useEffect(() => {
    setOpenedTranspositionPlan(null);
  }, [
    songIdentity,
    namedSectionIndex,
    named?.section.id,
    named?.holdingRole.id,
    named?.transpositionPlan,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id="workspace-surface-transposition-plan"
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstTranspositionPlanUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstTranspositionPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstTranspositionPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedTranspositionPlan !== null &&
    openedTranspositionPlan.songIdentity === songIdentity &&
    openedTranspositionPlan.sectionId === named.section.id &&
    openedTranspositionPlan.sectionIndex === namedSectionIndex &&
    openedTranspositionPlan.holdingRoleId === named.holdingRole.id &&
    openedTranspositionPlan.transpositionPlan === named.transpositionPlan &&
    openedTranspositionPlan.atSeconds === named.atSeconds;
  const at = formatTranspositionPlanTime(named.atSeconds);
  const copyValues: TranspositionPlanCopyValues = {
    role: named.holdingRole.name,
    section: translateSectionFormLabel(locale, named.section.label),
    at
  };
  const actionLabel = formatTranspositionPlanCopy(t("firstTranspositionPlanOpenAction"), copyValues);
  const body = formatTranspositionPlanCopy(t("firstTranspositionPlanBody"), copyValues);
  const armed = formatTranspositionPlanCopy(t("firstTranspositionPlanArmed"), copyValues);

  return (
    <aside
      id="workspace-surface-transposition-plan"
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstTranspositionPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstTranspositionPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{named.transpositionPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveTranspositionPlanRenderer(event.currentTarget);
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
            behavior: preferredTranspositionPlanScrollBehavior()
          });
          setOpenedTranspositionPlan({
            songIdentity,
            sectionId: named.section.id,
            sectionIndex: namedSectionIndex,
            holdingRoleId: named.holdingRole.id,
            transpositionPlan: named.transpositionPlan,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
