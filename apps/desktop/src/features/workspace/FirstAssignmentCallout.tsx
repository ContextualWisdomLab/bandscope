import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatAssignmentTime, resolveFirstAssignment } from "./firstAssignment";

/** Props for the first-assignment rehearsal callout. */
export interface FirstAssignmentCalloutProps {
  song: RehearsalSong;
}

type AssignmentCopyValues = Readonly<Record<"role" | "section" | "at" | "assignee", string>>;

type OpenedAssignment = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  assignmentId: string;
  atSeconds: number;
}>;

/** Interpolate assignment placeholders once so rehearsal data is never rescanned as template syntax. */
function formatAssignmentCopy(template: string, values: AssignmentCopyValues): string {
  return template.replace(/\{(role|section|at|assignee)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof AssignmentCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredAssignmentScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first assignment and open the matching rendered map section. */
export function FirstAssignmentCallout({ song }: FirstAssignmentCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity: unknown = song;
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const assignment = resolveFirstAssignment(song);
  const assignmentSectionIndex =
    assignment && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(assignment.section)
      : -1;
  const [openedAssignment, setOpenedAssignment] = useState<OpenedAssignment | null>(null);

  useEffect(() => {
    setOpenedAssignment(null);
  }, [
    songIdentity,
    assignmentSectionIndex,
    assignment?.section.id,
    assignment?.holdingRole?.id,
    assignment?.assignment.id,
    assignment?.atSeconds
  ]);

  if (!assignment) {
    return (
      <aside
        id="workspace-surface-assignment"
        className="rounded-2xl border border-teal-300/20 bg-teal-300/[0.06] p-4"
        aria-label={t("firstAssignmentUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-200">{t("firstAssignmentLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstAssignmentUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedAssignment !== null &&
    openedAssignment.songIdentity === songIdentity &&
    openedAssignment.sectionId === assignment.section.id &&
    openedAssignment.sectionIndex === assignmentSectionIndex &&
    openedAssignment.holdingRoleId === (assignment.holdingRole?.id ?? null) &&
    openedAssignment.assignmentId === assignment.assignment.id &&
    openedAssignment.atSeconds === assignment.atSeconds;
  const at = formatAssignmentTime(assignment.atSeconds);
  const copyValues: AssignmentCopyValues = {
    role: assignment.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, assignment.section.label),
    at,
    assignee: assignment.assignment.assignee
  };
  const hasRole = assignment.holdingRole !== null;
  const actionLabel = formatAssignmentCopy(
    t(hasRole ? "firstAssignmentOpenAction" : "firstAssignmentOpenActionBand"),
    copyValues
  );
  const body = formatAssignmentCopy(
    t(hasRole ? "firstAssignmentBody" : "firstAssignmentBodyBand"),
    copyValues
  );
  const armed = formatAssignmentCopy(
    t(hasRole ? "firstAssignmentArmed" : "firstAssignmentArmedBand"),
    copyValues
  );

  return (
    <aside
      id="workspace-surface-assignment"
      className="rounded-2xl border border-teal-300/20 bg-teal-300/[0.06] p-4"
      aria-label={t("firstAssignmentLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-200">{t("firstAssignmentLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{assignment.hint}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-teal-300 to-cyan-300 font-black text-slate-950"
        onClick={() => {
          const renderer = document.querySelector<HTMLElement>('[data-testid="song-structure-grid"]');
          const target =
            assignmentSectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(`[data-section-index="${assignmentSectionIndex}"]`) ??
                null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredAssignmentScrollBehavior()
          });
          setOpenedAssignment({
            songIdentity,
            sectionId: assignment.section.id,
            sectionIndex: assignmentSectionIndex,
            holdingRoleId: assignment.holdingRole?.id ?? null,
            assignmentId: assignment.assignment.id,
            atSeconds: assignment.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
