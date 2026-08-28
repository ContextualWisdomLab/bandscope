import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import {
  formatFermataPlanTime,
  resolveFirstFermataPlan,
  type FermataPlanGuidance
} from "./firstFermata";

/** Props for the first fermata-plan rehearsal callout. */
export interface FirstFermataCalloutProps {
  song: RehearsalSong;
  workspaceInstanceKey?: unknown;
}

type FermataPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;
type FermataPlanSource = "model" | "user";

type OpenedFermataPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  sectionLabel: string;
  landingRoleId: string;
  landingRoleName: string;
  fermataPlan: string;
  fermataPlanSource: FermataPlanSource | null;
  holdSeconds: string | null;
  atSeconds: number;
}>;

/** Prefer the owning workspace instance while preserving direct-call compatibility. */
function stableFermataPlanSongIdentity(
  song: RehearsalSong,
  workspaceInstanceKey: unknown
): unknown {
  return workspaceInstanceKey ?? song;
}

/** Interpolate fermata-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatFermataPlanCopy(template: string, values: FermataPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof FermataPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Localize model fermata guidance from structured tempo tokens, never from display-copy grammar. */
function localizedFermataPlan(
  fermataPlan: string,
  fermataPlanSource: FermataPlanSource | null,
  guidance: FermataPlanGuidance | null,
  generatedTemplate: string
): string {
  if (fermataPlanSource !== "model" || guidance === null) {
    return fermataPlan;
  }
  return generatedTemplate.replace("{hold}", () => guidance.holdSeconds);
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredFermataPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveFermataPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first fermata plan and open the matching rendered map section. */
export function FirstFermataCallout({
  song,
  workspaceInstanceKey
}: FirstFermataCalloutProps) {
  const calloutId = `workspace-surface-fermata-plan-${useId()}`;
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stableFermataPlanSongIdentity(song, workspaceInstanceKey);
  const named = useMemo(() => resolveFirstFermataPlan(song), [song]);
  const [openedFermataPlan, setOpenedFermataPlan] = useState<OpenedFermataPlan | null>(
    null
  );
  const [navigationFailed, setNavigationFailed] = useState(false);
  const holdSeconds = named?.fermataPlanGuidance?.holdSeconds ?? null;

  useEffect(() => {
    setOpenedFermataPlan(null);
    setNavigationFailed(false);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.sectionLabel,
    named?.landingRoleId,
    named?.landingRoleName,
    named?.fermataPlan,
    named?.fermataPlanSource,
    holdSeconds,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstFermataPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
          {t("firstFermataPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstFermataPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedFermataPlan !== null &&
    openedFermataPlan.songIdentity === songIdentity &&
    openedFermataPlan.sectionId === named.sectionId &&
    openedFermataPlan.sectionIndex === named.sectionIndex &&
    openedFermataPlan.sectionLabel === named.sectionLabel &&
    openedFermataPlan.landingRoleId === named.landingRoleId &&
    openedFermataPlan.landingRoleName === named.landingRoleName &&
    openedFermataPlan.fermataPlan === named.fermataPlan &&
    openedFermataPlan.fermataPlanSource === named.fermataPlanSource &&
    openedFermataPlan.holdSeconds === holdSeconds &&
    openedFermataPlan.atSeconds === named.atSeconds;
  const at = formatFermataPlanTime(named.atSeconds);
  const copyValues: FermataPlanCopyValues = {
    role: named.landingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatFermataPlanCopy(t("firstFermataPlanOpenAction"), copyValues);
  const body = formatFermataPlanCopy(t("firstFermataPlanBody"), copyValues);
  const armed = formatFermataPlanCopy(t("firstFermataPlanArmed"), copyValues);
  const fermataPlan = localizedFermataPlan(
    named.fermataPlan,
    named.fermataPlanSource,
    named.fermataPlanGuidance,
    t("firstFermataPlanGeneratedGuidance")
  );

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstFermataPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
        {t("firstFermataPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{fermataPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-rose-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveFermataPlanRenderer(event.currentTarget);
          const target =
            renderer?.querySelector<HTMLElement>(
              `[data-section-index="${named.sectionIndex}"]`
            ) ?? null;
          if (typeof target?.scrollIntoView !== "function") {
            setNavigationFailed(true);
            return;
          }
          setNavigationFailed(false);
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredFermataPlanScrollBehavior()
          });
          setOpenedFermataPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            sectionLabel: named.sectionLabel,
            landingRoleId: named.landingRoleId,
            landingRoleName: named.landingRoleName,
            fermataPlan: named.fermataPlan,
            fermataPlanSource: named.fermataPlanSource,
            holdSeconds,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
      {navigationFailed ? (
        <p role="status" className="mt-2 text-sm leading-6 text-amber-200">
          {t("firstFermataPlanNavigationFailed")}
        </p>
      ) : null}
    </aside>
  );
}
