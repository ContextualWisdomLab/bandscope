import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatDynamicsPlanTime, resolveFirstDynamicsPlan } from "./firstDynamicsPlan";

/** Props for the first dynamics-plan rehearsal callout. */
export interface FirstDynamicsPlanCalloutProps {
  song: RehearsalSong;
}

type DynamicsPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedDynamicsPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  dynamicsPlan: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableDynamicsPlanSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate dynamics-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatDynamicsPlanCopy(template: string, values: DynamicsPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof DynamicsPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredDynamicsPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveDynamicsPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first dynamics plan and open the matching rendered map section. */
export function FirstDynamicsPlanCallout({ song }: FirstDynamicsPlanCalloutProps) {
  const calloutId = `workspace-surface-dynamics-plan-${useId()}`;
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stableDynamicsPlanSongIdentity(song);
  const named = useMemo(() => resolveFirstDynamicsPlan(song), [song]);
  const [openedDynamicsPlan, setOpenedDynamicsPlan] = useState<OpenedDynamicsPlan | null>(null);

  useEffect(() => {
    setOpenedDynamicsPlan(null);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.holdingRoleId,
    named?.dynamicsPlan,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstDynamicsPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstDynamicsPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstDynamicsPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedDynamicsPlan !== null &&
    openedDynamicsPlan.songIdentity === songIdentity &&
    openedDynamicsPlan.sectionId === named.sectionId &&
    openedDynamicsPlan.sectionIndex === named.sectionIndex &&
    openedDynamicsPlan.holdingRoleId === named.holdingRoleId &&
    openedDynamicsPlan.dynamicsPlan === named.dynamicsPlan &&
    openedDynamicsPlan.atSeconds === named.atSeconds;
  const at = formatDynamicsPlanTime(named.atSeconds);
  const copyValues: DynamicsPlanCopyValues = {
    role: named.holdingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatDynamicsPlanCopy(t("firstDynamicsPlanOpenAction"), copyValues);
  const body = formatDynamicsPlanCopy(t("firstDynamicsPlanBody"), copyValues);
  const armed = formatDynamicsPlanCopy(t("firstDynamicsPlanArmed"), copyValues);

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstDynamicsPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstDynamicsPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{named.dynamicsPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveDynamicsPlanRenderer(event.currentTarget);
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
            behavior: preferredDynamicsPlanScrollBehavior()
          });
          setOpenedDynamicsPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            holdingRoleId: named.holdingRoleId,
            dynamicsPlan: named.dynamicsPlan,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
