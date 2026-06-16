import { useMemo } from "react";
import type { PlayerAssignment, CollaborationParticipant } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

interface AssignmentPanelProps {
  assignments: PlayerAssignment[];
  participants: CollaborationParticipant[];
  roleNames: Map<string, string>;
}

/** Documented. */
function getParticipantName(participantId: string, participants: CollaborationParticipant[]): string {
  return participants.find(p => p.id === participantId)?.displayName ?? participantId;
}

/** Documented. */
export function AssignmentPanel({ assignments, participants, roleNames }: AssignmentPanelProps) {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);

  if (assignments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center" data-testid="assignments-empty">
        <Users className="size-8 text-slate-500" />
        <p className="text-sm text-slate-400">{t("assignmentsEmptyState")}</p>
      </div>
    );
  }

  /** Documented. */
  const getStatusBadge = (status: PlayerAssignment["status"]) => {
    switch (status) {
      case "assigned":
        return (
          <Badge variant="outline" className="border-cyan-300/30 bg-cyan-400/10 text-[0.6rem] text-cyan-200">
            {t("assignmentStatusAssigned")}
          </Badge>
        );
      case "in_progress":
        return (
          <Badge variant="outline" className="border-amber-300/30 bg-amber-400/10 text-[0.6rem] text-amber-200">
            {t("assignmentStatusInProgress")}
          </Badge>
        );
      case "done":
        return (
          <Badge variant="outline" className="border-emerald-300/30 bg-emerald-400/10 text-[0.6rem] text-emerald-200">
            {t("assignmentStatusDone")}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-2" data-testid="assignment-panel">
      {assignments.map(assignment => (
        <div
          key={assignment.id}
          className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-slate-100">
              {getParticipantName(assignment.participantId, participants)}
            </span>
            <span className="text-xs text-slate-400">
              {roleNames.get(assignment.roleId) ?? assignment.roleId}
            </span>
            {assignment.notes && (
              <span className="mt-1 text-xs italic text-slate-500">{assignment.notes}</span>
            )}
          </div>
          {getStatusBadge(assignment.status)}
        </div>
      ))}
    </div>
  );
}
