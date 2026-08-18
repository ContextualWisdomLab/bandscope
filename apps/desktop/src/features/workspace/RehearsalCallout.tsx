import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";

/** First-practice callout shown after analysis or in empty-state stories. */
export interface RehearsalCalloutProps {
  title: string;
  body: string;
  actionLabel: string;
  onAction?: () => void;
}

/** Render a rehearsal next-action callout and disable its button when no action is available. */
export function RehearsalCallout({ title, body, actionLabel, onAction }: RehearsalCalloutProps) {
  return (
    <aside
      className="flex flex-col gap-3 rounded-2xl border border-[color:var(--bandscope-callout-border)] bg-[var(--bandscope-callout-bg)] p-4 text-left text-[color:var(--bandscope-callout-fg)]"
      aria-label={title}
    >
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-black tracking-tight">{title}</p>
          <p className="text-sm leading-6 opacity-90">{body}</p>
        </div>
      </div>
      <Button
        type="button"
        disabled={!onAction}
        onClick={() => onAction?.()}
        className="min-h-11 self-start bg-gradient-to-r from-cyan-400 to-violet-500 font-black text-slate-950"
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
