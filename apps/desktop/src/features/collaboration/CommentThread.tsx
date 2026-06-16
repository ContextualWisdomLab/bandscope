import { useMemo } from "react";
import type { RehearsalComment, CollaborationParticipant } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, CheckCircle2 } from "lucide-react";

interface CommentThreadProps {
  comments: RehearsalComment[];
  participants: CollaborationParticipant[];
  onResolve?: (commentId: string) => void;
}

/** Documented. */
function getAuthorName(authorId: string, participants: CollaborationParticipant[]): string {
  return participants.find(p => p.id === authorId)?.displayName ?? authorId;
}

/** Documented. */
function formatCommentDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Documented. */
export function CommentThread({ comments, participants, onResolve }: CommentThreadProps) {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);

  const topLevelComments = useMemo(
    () => comments.filter(c => !c.parentId),
    [comments]
  );

  const repliesByParent = useMemo(() => {
    const map = new Map<string, RehearsalComment[]>();
    for (const c of comments) {
      if (c.parentId) {
        const existing = map.get(c.parentId) ?? [];
        existing.push(c);
        map.set(c.parentId, existing);
      }
    }
    return map;
  }, [comments]);

  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center" data-testid="comments-empty">
        <MessageCircle className="size-8 text-slate-500" />
        <p className="text-sm text-slate-400">{t("commentsEmptyState")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="comment-thread">
      {topLevelComments.map(comment => (
        <div key={comment.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">
                {getAuthorName(comment.authorId, participants)}
              </span>
              <span className="text-xs text-slate-500">
                {formatCommentDate(comment.createdAt)}
              </span>
            </div>
            {comment.status === "resolved" ? (
              <Badge variant="outline" className="border-emerald-300/30 bg-emerald-400/10 text-[0.6rem] text-emerald-200">
                {t("commentResolved")}
              </Badge>
            ) : onResolve ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-slate-400 hover:text-emerald-200"
                onClick={() => onResolve(comment.id)}
              >
                <CheckCircle2 className="mr-1 size-3" />
                {t("commentResolve")}
              </Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{comment.body}</p>

          {repliesByParent.has(comment.id) && (
            <div className="mt-3 space-y-2 border-l-2 border-white/10 pl-3">
              {repliesByParent.get(comment.id)!.map(reply => (
                <div key={reply.id} className="rounded-md bg-white/[0.02] p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-200">
                      {getAuthorName(reply.authorId, participants)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatCommentDate(reply.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{reply.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
