import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import {
  formatAccelerandoPlanTime,
  resolveFirstAccelerandoPlan,
  type AccelerandoPlanGuidance
} from "./firstAccelerando";

/** Props for the first accelerando-plan rehearsal callout. */
export interface FirstAccelerandoCalloutProps {
  song: RehearsalSong;
  workspaceInstanceKey?: unknown;
}

type AccelerandoPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;
type AccelerandoPlanSource = "model" | "user";

type OpenedAccelerandoPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  sectionLabel: string;
  landingRoleId: string;
  landingRoleName: string;
  accelerandoPlan: string;
  accelerandoPlanSource: AccelerandoPlanSource;
  fromBpm: string | null;
  toBpm: string | null;
  atSeconds: number;
}>;

/** Prefer the owning workspace instance while preserving direct-call compatibility. */
function stableAccelerandoPlanSongIdentity(
  song: RehearsalSong,
  workspaceInstanceKey: unknown
): unknown {
  return workspaceInstanceKey ?? song;
}

/** Interpolate accelerando-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatAccelerandoPlanCopy(template: string, values: AccelerandoPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof AccelerandoPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Localize model accelerando guidance from structured tempo tokens, never from display-copy grammar. */
function localizedAccelerandoPlan(
  accelerandoPlan: string,
  accelerandoPlanSource: AccelerandoPlanSource,
  guidance: AccelerandoPlanGuidance | null,
  generatedTemplate: string
): string {
  if (accelerandoPlanSource !== "model" || guidance === null) {
    return accelerandoPlan;
  }
  return generatedTemplate
    .replace("{from}", () => guidance.fromBpm)
    .replace("{to}", () => guidance.toBpm);
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredAccelerandoPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveAccelerandoPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first accelerando plan and open the matching rendered map section. */
export function FirstAccelerandoCallout({
  song,
  workspaceInstanceKey
}: FirstAccelerandoCalloutProps) {
  const calloutId = `workspace-surface-accelerando-plan-${useId()}`;
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stableAccelerandoPlanSongIdentity(song, workspaceInstanceKey);
  const named = useMemo(() => resolveFirstAccelerandoPlan(song), [song]);
  const [openedAccelerandoPlan, setOpenedAccelerandoPlan] = useState<OpenedAccelerandoPlan | null>(
    null
  );
  const [navigationFailed, setNavigationFailed] = useState(false);
  const fromBpm = named?.accelerandoPlanGuidance?.fromBpm ?? null;
  const toBpm = named?.accelerandoPlanGuidance?.toBpm ?? null;

  useEffect(() => {
    setOpenedAccelerandoPlan(null);
    setNavigationFailed(false);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.sectionLabel,
    named?.landingRoleId,
    named?.landingRoleName,
    named?.accelerandoPlan,
    named?.accelerandoPlanSource,
    fromBpm,
    toBpm,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstAccelerandoPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
          {t("firstAccelerandoPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstAccelerandoPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedAccelerandoPlan !== null &&
    openedAccelerandoPlan.songIdentity === songIdentity &&
    openedAccelerandoPlan.sectionId === named.sectionId &&
    openedAccelerandoPlan.sectionIndex === named.sectionIndex &&
    openedAccelerandoPlan.sectionLabel === named.sectionLabel &&
    openedAccelerandoPlan.landingRoleId === named.landingRoleId &&
    openedAccelerandoPlan.landingRoleName === named.landingRoleName &&
    openedAccelerandoPlan.accelerandoPlan === named.accelerandoPlan &&
    openedAccelerandoPlan.accelerandoPlanSource === named.accelerandoPlanSource &&
    openedAccelerandoPlan.fromBpm === fromBpm &&
    openedAccelerandoPlan.toBpm === toBpm &&
    openedAccelerandoPlan.atSeconds === named.atSeconds;
  const at = formatAccelerandoPlanTime(named.atSeconds);
  const copyValues: AccelerandoPlanCopyValues = {
    role: named.landingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatAccelerandoPlanCopy(t("firstAccelerandoPlanOpenAction"), copyValues);
  const body = formatAccelerandoPlanCopy(t("firstAccelerandoPlanBody"), copyValues);
  const armed = formatAccelerandoPlanCopy(t("firstAccelerandoPlanArmed"), copyValues);
  const accelerandoPlan = localizedAccelerandoPlan(
    named.accelerandoPlan,
    named.accelerandoPlanSource,
    named.accelerandoPlanGuidance,
    t("firstAccelerandoPlanGeneratedGuidance")
  );

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstAccelerandoPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
        {t("firstAccelerandoPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{accelerandoPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-rose-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveAccelerandoPlanRenderer(event.currentTarget);
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
            behavior: preferredAccelerandoPlanScrollBehavior()
          });
          setOpenedAccelerandoPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            sectionLabel: named.sectionLabel,
            landingRoleId: named.landingRoleId,
            landingRoleName: named.landingRoleName,
            accelerandoPlan: named.accelerandoPlan,
            accelerandoPlanSource: named.accelerandoPlanSource,
            fromBpm,
            toBpm,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
      {navigationFailed ? (
        <p role="status" className="mt-2 text-sm leading-6 text-amber-200">
          {t("firstAccelerandoPlanNavigationFailed")}
        </p>
      ) : null}
    </aside>
  );
}
