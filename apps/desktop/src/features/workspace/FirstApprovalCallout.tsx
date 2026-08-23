import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatApprovalTime, resolveFirstApproval } from "./firstApproval";

/** Props for the first-approval rehearsal callout. */
export interface FirstApprovalCalloutProps {
  song: RehearsalSong;
}

type ApprovalCopyValues = Readonly<Record<"owner" | "scope" | "section" | "at", string>>;

type OpenedApproval = Readonly<{
  songIdentity: unknown;
  sectionId: string | null;
  sectionIndex: number;
  approvalId: string;
  atSeconds: number | null;
}>;

/** Interpolate approval placeholders once so rehearsal data is never rescanned as template syntax. */
function formatApprovalCopy(template: string, values: ApprovalCopyValues): string {
  return template.replace(/\{(owner|scope|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof ApprovalCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredApprovalScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first pending approval and open the matching rendered map section. */
export function FirstApprovalCallout({ song }: FirstApprovalCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity: unknown = song;
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const approval = resolveFirstApproval(song);
  const approvalSectionIndex =
    approval?.section && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(approval.section)
      : -1;
  const [openedApproval, setOpenedApproval] = useState<OpenedApproval | null>(null);

  useEffect(() => {
    setOpenedApproval(null);
  }, [
    songIdentity,
    approvalSectionIndex,
    approval?.section?.id,
    approval?.approval.id,
    approval?.atSeconds
  ]);

  if (!approval) {
    return (
      <aside
        id="workspace-surface-approval"
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstApprovalUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstApprovalLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstApprovalUnavailable")}</p>
      </aside>
    );
  }

  const hasSection = approval.section !== null && approval.atSeconds !== null;
  const opened =
    openedApproval !== null &&
    openedApproval.songIdentity === songIdentity &&
    openedApproval.sectionId === (approval.section?.id ?? null) &&
    openedApproval.sectionIndex === approvalSectionIndex &&
    openedApproval.approvalId === approval.approval.id &&
    openedApproval.atSeconds === approval.atSeconds;
  const at = hasSection ? formatApprovalTime(approval.atSeconds ?? 0) : "";
  const copyValues: ApprovalCopyValues = {
    owner: approval.approval.owner,
    scope: approval.scope,
    section: approval.section ? translateSectionFormLabel(locale, approval.section.label) : "",
    at
  };
  const isChangesRequested = approval.approval.status === "changes_requested";
  const bodyKey = hasSection
    ? isChangesRequested
      ? "firstApprovalBodyChanges"
      : "firstApprovalBody"
    : isChangesRequested
      ? "firstApprovalBodyChangesBand"
      : "firstApprovalBodyBand";
  const armedKey = hasSection ? "firstApprovalArmed" : "firstApprovalArmedBand";
  const body = formatApprovalCopy(t(bodyKey), copyValues);
  const armed = formatApprovalCopy(t(armedKey), copyValues);
  const actionLabel = hasSection
    ? formatApprovalCopy(t("firstApprovalOpenAction"), copyValues)
    : "";

  return (
    <aside
      id="workspace-surface-approval"
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstApprovalLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstApprovalLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      {hasSection ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-orange-300 font-black text-slate-950"
          onClick={() => {
            const renderer = document.querySelector<HTMLElement>('[data-testid="song-structure-grid"]');
            const target =
              approvalSectionIndex >= 0
                ? (renderer?.querySelector<HTMLElement>(`[data-section-index="${approvalSectionIndex}"]`) ??
                  null)
                : null;
            if (typeof target?.scrollIntoView !== "function") {
              return;
            }
            target.scrollIntoView({
              block: "nearest",
              behavior: preferredApprovalScrollBehavior()
            });
            setOpenedApproval({
              songIdentity,
              sectionId: approval.section?.id ?? null,
              sectionIndex: approvalSectionIndex,
              approvalId: approval.approval.id,
              atSeconds: approval.atSeconds
            });
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
