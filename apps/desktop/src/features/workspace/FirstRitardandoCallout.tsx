import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import {
  formatRitardandoPlanTime,
  resolveFirstRitardandoPlan,
  type RitardandoPlanGuidance
} from "./firstRitardando";

/** Props for the first ritardando-plan rehearsal callout. */
export interface FirstRitardandoCalloutProps {
  song: RehearsalSong;
  workspaceInstanceKey?: unknown;
}

type RitardandoPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;
type RitardandoPlanSource = "model" | "user";

type OpenedRitardandoPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  sectionLabel: string;
  landingRoleId: string;
  landingRoleName: string;
  ritardandoPlan: string;
  ritardandoPlanSource: RitardandoPlanSource | null;
  fromBpm: string | null;
  toBpm: string | null;
  atSeconds: number;
}>;

/** Prefer the owning workspace instance while preserving direct-call compatibility. */
function stableRitardandoPlanSongIdentity(
  song: RehearsalSong,
  workspaceInstanceKey: unknown
): unknown {
  return workspaceInstanceKey ?? song;
}

/** Interpolate ritardando-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatRitardandoPlanCopy(template: string, values: RitardandoPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof RitardandoPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Localize model ritardando guidance from structured tempo tokens, never from display-copy grammar. */
function localizedRitardandoPlan(
  ritardandoPlan: string,
  ritardandoPlanSource: RitardandoPlanSource | null,
  guidance: RitardandoPlanGuidance | null,
  generatedTemplate: string
): string {
  if (ritardandoPlanSource !== "model" || guidance === null) {
    return ritardandoPlan;
  }
  return generatedTemplate
    .replace("{from}", () => guidance.fromBpm)
    .replace("{to}", () => guidance.toBpm);
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredRitardandoPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveRitardandoPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first ritardando plan and open the matching rendered map section. */
export function FirstRitardandoCallout({
  song,
  workspaceInstanceKey
}: FirstRitardandoCalloutProps) {
  const calloutId = `workspace-surface-ritardando-plan-${useId()}`;
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stableRitardandoPlanSongIdentity(song, workspaceInstanceKey);
  const named = useMemo(() => resolveFirstRitardandoPlan(song), [song]);
  const [openedRitardandoPlan, setOpenedRitardandoPlan] = useState<OpenedRitardandoPlan | null>(
    null
  );
  const [navigationFailed, setNavigationFailed] = useState(false);
  const fromBpm = named?.ritardandoPlanGuidance?.fromBpm ?? null;
  const toBpm = named?.ritardandoPlanGuidance?.toBpm ?? null;

  useEffect(() => {
    setOpenedRitardandoPlan(null);
    setNavigationFailed(false);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.sectionLabel,
    named?.landingRoleId,
    named?.landingRoleName,
    named?.ritardandoPlan,
    named?.ritardandoPlanSource,
    fromBpm,
    toBpm,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstRitardandoPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
          {t("firstRitardandoPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstRitardandoPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedRitardandoPlan !== null &&
    openedRitardandoPlan.songIdentity === songIdentity &&
    openedRitardandoPlan.sectionId === named.sectionId &&
    openedRitardandoPlan.sectionIndex === named.sectionIndex &&
    openedRitardandoPlan.sectionLabel === named.sectionLabel &&
    openedRitardandoPlan.landingRoleId === named.landingRoleId &&
    openedRitardandoPlan.landingRoleName === named.landingRoleName &&
    openedRitardandoPlan.ritardandoPlan === named.ritardandoPlan &&
    openedRitardandoPlan.ritardandoPlanSource === named.ritardandoPlanSource &&
    openedRitardandoPlan.fromBpm === fromBpm &&
    openedRitardandoPlan.toBpm === toBpm &&
    openedRitardandoPlan.atSeconds === named.atSeconds;
  const at = formatRitardandoPlanTime(named.atSeconds);
  const copyValues: RitardandoPlanCopyValues = {
    role: named.landingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatRitardandoPlanCopy(t("firstRitardandoPlanOpenAction"), copyValues);
  const body = formatRitardandoPlanCopy(t("firstRitardandoPlanBody"), copyValues);
  const armed = formatRitardandoPlanCopy(t("firstRitardandoPlanArmed"), copyValues);
  const ritardandoPlan = localizedRitardandoPlan(
    named.ritardandoPlan,
    named.ritardandoPlanSource,
    named.ritardandoPlanGuidance,
    t("firstRitardandoPlanGeneratedGuidance")
  );

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstRitardandoPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
        {t("firstRitardandoPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        {opened && named.ritardandoPlanSource === "model" ? armed : body}
      </p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{ritardandoPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-rose-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveRitardandoPlanRenderer(event.currentTarget);
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
            behavior: preferredRitardandoPlanScrollBehavior()
          });
          setOpenedRitardandoPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            sectionLabel: named.sectionLabel,
            landingRoleId: named.landingRoleId,
            landingRoleName: named.landingRoleName,
            ritardandoPlan: named.ritardandoPlan,
            ritardandoPlanSource: named.ritardandoPlanSource,
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
          {t("firstRitardandoPlanNavigationFailed")}
        </p>
      ) : null}
    </aside>
  );
}
