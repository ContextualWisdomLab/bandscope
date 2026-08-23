import { useEffect, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatBlockedTime, resolveFirstBlockedAssignment } from "./firstBlocked";

/** Props for the first-blocked rehearsal callout. */
export interface FirstBlockedCalloutProps {
  song: RehearsalSong;
}

type BlockedCopyValues = Readonly<Record<"role" | "section" | "at" | "assignee", string>>;

type OpenedBlocked = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  assignmentId: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableBlockedSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate blocked-job placeholders once so rehearsal data is never rescanned as template syntax. */
function formatBlockedCopy(template: string, values: BlockedCopyValues): string {
  return template.replace(/\{(role|section|at|assignee)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof BlockedCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredBlockedScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first blocked job and open the matching rendered map section. */
export function FirstBlockedCallout({ song }: FirstBlockedCalloutProps) {
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stableBlockedSongIdentity(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const blocked = useMemo(() => resolveFirstBlockedAssignment(song), [song]);
  const blockedSectionIndex =
    blocked && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(blocked.section)
      : -1;
  const [openedBlocked, setOpenedBlocked] = useState<OpenedBlocked | null>(null);

  useEffect(() => {
    setOpenedBlocked(null);
  }, [
    songIdentity,
    blockedSectionIndex,
    blocked?.section.id,
    blocked?.holdingRole?.id,
    blocked?.assignment.id,
    blocked?.atSeconds
  ]);

  if (!blocked) {
    return (
      <aside
        id="workspace-surface-blocked"
        className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4"
        aria-label={t("firstBlockedUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">{t("firstBlockedLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstBlockedUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedBlocked !== null &&
    openedBlocked.songIdentity === songIdentity &&
    openedBlocked.sectionId === blocked.section.id &&
    openedBlocked.sectionIndex === blockedSectionIndex &&
    openedBlocked.holdingRoleId === (blocked.holdingRole?.id ?? null) &&
    openedBlocked.assignmentId === blocked.assignment.id &&
    openedBlocked.atSeconds === blocked.atSeconds;
  const at = formatBlockedTime(blocked.atSeconds);
  const copyValues: BlockedCopyValues = {
    role: blocked.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, blocked.section.label),
    at,
    assignee: blocked.assignment.assignee
  };
  const hasRole = blocked.holdingRole !== null;
  const actionLabel = formatBlockedCopy(
    t(hasRole ? "firstBlockedOpenAction" : "firstBlockedOpenActionBand"),
    copyValues
  );
  const body = formatBlockedCopy(t(hasRole ? "firstBlockedBody" : "firstBlockedBodyBand"), copyValues);
  const armed = formatBlockedCopy(t(hasRole ? "firstBlockedArmed" : "firstBlockedArmedBand"), copyValues);

  return (
    <aside
      id="workspace-surface-blocked"
      className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4"
      aria-label={t("firstBlockedLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">{t("firstBlockedLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{blocked.hint}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-rose-300 to-orange-300 font-black text-slate-950"
        onClick={() => {
          const renderer = document.querySelector<HTMLElement>('[data-testid="song-structure-grid"]');
          const target =
            blockedSectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(`[data-section-index="${blockedSectionIndex}"]`) ??
                null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredBlockedScrollBehavior()
          });
          setOpenedBlocked({
            songIdentity,
            sectionId: blocked.section.id,
            sectionIndex: blockedSectionIndex,
            holdingRoleId: blocked.holdingRole?.id ?? null,
            assignmentId: blocked.assignment.id,
            atSeconds: blocked.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
