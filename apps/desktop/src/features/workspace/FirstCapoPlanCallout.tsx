import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatCapoPlanTime, resolveFirstCapoPlan } from "./firstCapoPlan";

/** Props for the first capo-plan rehearsal callout. */
export interface FirstCapoPlanCalloutProps {
  song: RehearsalSong;
}

type CapoPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedCapoPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  capoPlan: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableCapoPlanSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate capo-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatCapoPlanCopy(template: string, values: CapoPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof CapoPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredCapoPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveCapoPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first capo plan and open the matching rendered map section. */
export function FirstCapoPlanCallout({ song }: FirstCapoPlanCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableCapoPlanSongIdentity(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const named = resolveFirstCapoPlan(song);
  const namedSectionIndex =
    named && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(named.section)
      : -1;
  const [openedCapoPlan, setOpenedCapoPlan] = useState<OpenedCapoPlan | null>(null);

  useEffect(() => {
    setOpenedCapoPlan(null);
  }, [
    songIdentity,
    namedSectionIndex,
    named?.section.id,
    named?.holdingRole.id,
    named?.capoPlan,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id="workspace-surface-capo-plan"
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstCapoPlanUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstCapoPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstCapoPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedCapoPlan !== null &&
    openedCapoPlan.songIdentity === songIdentity &&
    openedCapoPlan.sectionId === named.section.id &&
    openedCapoPlan.sectionIndex === namedSectionIndex &&
    openedCapoPlan.holdingRoleId === named.holdingRole.id &&
    openedCapoPlan.capoPlan === named.capoPlan &&
    openedCapoPlan.atSeconds === named.atSeconds;
  const at = formatCapoPlanTime(named.atSeconds);
  const copyValues: CapoPlanCopyValues = {
    role: named.holdingRole.name,
    section: translateSectionFormLabel(locale, named.section.label),
    at
  };
  const actionLabel = formatCapoPlanCopy(t("firstCapoPlanOpenAction"), copyValues);
  const body = formatCapoPlanCopy(t("firstCapoPlanBody"), copyValues);
  const armed = formatCapoPlanCopy(t("firstCapoPlanArmed"), copyValues);

  return (
    <aside
      id="workspace-surface-capo-plan"
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstCapoPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstCapoPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{named.capoPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveCapoPlanRenderer(event.currentTarget);
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
            behavior: preferredCapoPlanScrollBehavior()
          });
          setOpenedCapoPlan({
            songIdentity,
            sectionId: named.section.id,
            sectionIndex: namedSectionIndex,
            holdingRoleId: named.holdingRole.id,
            capoPlan: named.capoPlan,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
