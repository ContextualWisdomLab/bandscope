import { useMemo } from "react";
import type { CollaborationSession, RehearsalSong } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { CommentThread } from "./CommentThread";
import { AssignmentPanel } from "./AssignmentPanel";
import { ApprovalList } from "./ApprovalList";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Users } from "lucide-react";

interface CollaborationPanelProps {
  session: CollaborationSession | null;
  song: RehearsalSong;
  onResolveComment?: (commentId: string) => void;
}

/** Documented. */
export function CollaborationPanel({ session, song, onResolveComment }: CollaborationPanelProps) {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);

  const roleNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of song.sections) {
      for (const role of section.roles) {
        if (!map.has(role.id)) {
          map.set(role.id, role.name);
        }
      }
    }
    return map;
  }, [song]);

  const sectionLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of song.sections) {
      map.set(section.id, section.label);
    }
    return map;
  }, [song]);

  if (!session) {
    return (
      <Card className="border-white/10 bg-slate-950/60" data-testid="collaboration-empty">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <Users className="size-10 text-slate-500" />
          <p className="text-sm text-slate-400">{t("collaborationEmptyState")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-slate-950/60" data-testid="collaboration-panel">
      <CardHeader className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-[0.24em] text-cyan-300">
            {t("collaborationTitle")}
          </h3>
          <span className="text-xs text-slate-400">
            {session.participants.length} {t("participantsTitle").toLowerCase()}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-4">
        <section>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">
            {t("commentsTitle")}
          </h4>
          <CommentThread
            comments={session.comments}
            participants={session.participants}
            onResolve={onResolveComment}
          />
        </section>

        <section>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">
            {t("assignmentsTitle")}
          </h4>
          <AssignmentPanel
            assignments={session.assignments}
            participants={session.participants}
            roleNames={roleNames}
          />
        </section>

        <section>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">
            {t("approvalsTitle")}
          </h4>
          <ApprovalList
            approvals={session.approvals}
            participants={session.participants}
            roleNames={roleNames}
            sectionLabels={sectionLabels}
          />
        </section>
      </CardContent>
    </Card>
  );
}
