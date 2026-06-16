import { useMemo } from "react";
import type { RoleApproval, CollaborationParticipant } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck } from "lucide-react";

interface ApprovalListProps {
  approvals: RoleApproval[];
  participants: CollaborationParticipant[];
  roleNames: Map<string, string>;
  sectionLabels: Map<string, string>;
}

/** Documented. */
function getReviewerName(reviewerId: string, participants: CollaborationParticipant[]): string {
  return participants.find(p => p.id === reviewerId)?.displayName ?? reviewerId;
}

/** Documented. */
export function ApprovalList({ approvals, participants, roleNames, sectionLabels }: ApprovalListProps) {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);

  if (approvals.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center" data-testid="approvals-empty">
        <ClipboardCheck className="size-8 text-slate-500" />
        <p className="text-sm text-slate-400">{t("approvalsEmptyState")}</p>
      </div>
    );
  }

  /** Documented. */
  const getStatusBadge = (status: RoleApproval["status"]) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="border-slate-300/30 bg-slate-400/10 text-[0.6rem] text-slate-300">
            {t("approvalStatusPending")}
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="border-emerald-300/30 bg-emerald-400/10 text-[0.6rem] text-emerald-200">
            {t("approvalStatusApproved")}
          </Badge>
        );
      case "changes_requested":
        return (
          <Badge variant="outline" className="border-amber-300/30 bg-amber-400/10 text-[0.6rem] text-amber-200">
            {t("approvalStatusChangesRequested")}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-2" data-testid="approval-list">
      {approvals.map((approval, index) => (
        <div
          key={`${approval.roleId}-${approval.sectionId}-${index}`}
          className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-slate-100">
              {roleNames.get(approval.roleId) ?? approval.roleId}
            </span>
            <span className="text-xs text-slate-400">
              {sectionLabels.get(approval.sectionId) ?? approval.sectionId}
            </span>
            <span className="text-xs text-slate-500">
              {getReviewerName(approval.reviewerId, participants)}
            </span>
            {approval.comment && (
              <span className="mt-1 text-xs italic text-slate-500">{approval.comment}</span>
            )}
          </div>
          {getStatusBadge(approval.status)}
        </div>
      ))}
    </div>
  );
}
