import { AlertCircle } from "lucide-react";
import { createTranslator, detectPreferredLocale } from "../../i18n";

/** Shared clash list used by Section Roadmap and Ranges. */
export interface OverlapWarningListProps {
  warnings: readonly string[];
}

/** Render localized rehearsal-overlap warnings, or nothing when no warnings exist. */
export function OverlapWarningList({ warnings }: OverlapWarningListProps) {
  const t = createTranslator(detectPreferredLocale());
  if (warnings.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 space-y-1.5" aria-label={t("overlapWarning")}>
      {warnings.map((warning) => (
        <li
          key={warning}
          className="flex items-start gap-2 rounded-md border border-[color:var(--bandscope-overlap-border)] bg-[var(--bandscope-overlap-bg)] p-2 text-xs font-medium text-[color:var(--bandscope-overlap-fg)]"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="leading-snug">{warning}</span>
        </li>
      ))}
    </ul>
  );
}
