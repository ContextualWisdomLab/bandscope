import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatSoloPlanTime, resolveFirstSoloPlan } from "./firstSoloPlan";

/** Props for the first solo-plan rehearsal callout. */
export interface FirstSoloPlanCalloutProps {
  song: RehearsalSong;
}

type SoloPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedSoloPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  holdingRoleId: string;
  soloPlan: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableSoloPlanSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate solo-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatSoloPlanCopy(template: string, values: SoloPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof SoloPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredSoloPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve only this callout's local workspace scope; never borrow a renderer from another workspace. */
function resolveSoloPlanWorkspaceScope(origin: HTMLElement): HTMLElement | null {
  const selector = "#workspace-song-structure-grid";
  const localScope = origin.closest("aside")?.parentElement ?? null;
  if (!localScope) {
    return null;
  }
  const localRenderers = localScope.querySelectorAll<HTMLElement>(selector);
  return localRenderers.length === 1 ? localScope : null;
}

/** Resolve exactly one rendered map section by stable identity without selector interpolation. */
function resolveSoloPlanSectionTarget(scope: HTMLElement | null, sectionId: string): HTMLElement | null {
  if (!scope || sectionId.trim().length === 0) {
    return null;
  }
  const matches = Array.from(scope.querySelectorAll<HTMLElement>("[data-section-id]")).filter(
    (candidate) => candidate.dataset.sectionId === sectionId
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/** Name tonight's first solo plan and open the matching rendered map section. */
export function FirstSoloPlanCallout({ song }: FirstSoloPlanCalloutProps) {
  const calloutId = `workspace-surface-solo-plan-${useId()}`;
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableSoloPlanSongIdentity(song);
  const named = useMemo(() => resolveFirstSoloPlan(song), [song]);
  const [openedSoloPlan, setOpenedSoloPlan] = useState<OpenedSoloPlan | null>(null);

  useEffect(() => {
    setOpenedSoloPlan(null);
  }, [
    songIdentity,
    named?.sectionId,
    named?.holdingRoleId,
    named?.soloPlan,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstSoloPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstSoloPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstSoloPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedSoloPlan !== null &&
    openedSoloPlan.songIdentity === songIdentity &&
    openedSoloPlan.sectionId === named.sectionId &&
    openedSoloPlan.holdingRoleId === named.holdingRoleId &&
    openedSoloPlan.soloPlan === named.soloPlan &&
    openedSoloPlan.atSeconds === named.atSeconds;
  const at = formatSoloPlanTime(named.atSeconds);
  const copyValues: SoloPlanCopyValues = {
    role: named.holdingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatSoloPlanCopy(t("firstSoloPlanOpenAction"), copyValues);
  const body = formatSoloPlanCopy(t("firstSoloPlanBody"), copyValues);
  const armed = formatSoloPlanCopy(t("firstSoloPlanArmed"), copyValues);

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstSoloPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstSoloPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{named.soloPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const scope = resolveSoloPlanWorkspaceScope(event.currentTarget);
          const target = resolveSoloPlanSectionTarget(scope, named.sectionId);
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredSoloPlanScrollBehavior()
          });
          setOpenedSoloPlan({
            songIdentity,
            sectionId: named.sectionId,
            holdingRoleId: named.holdingRoleId,
            soloPlan: named.soloPlan,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
