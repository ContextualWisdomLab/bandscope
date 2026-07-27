import { type FC } from "react";
import { type RehearsalSong } from "@bandscope/shared-types";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createTranslator } from "@/i18n";

/** Documented. */
export interface ExportViewProps {
  /** Documented. */
  song: RehearsalSong;
  /** Documented. */
  t: ReturnType<typeof createTranslator>;
}

/**
 * Export View component to handle exporting data to CSV and JSON formats
 * @param props Props containing the rehearsal song and translator function
 * @returns React node representing the Export View
 */
export /**
 *
 */
const ExportView: FC<ExportViewProps> = ({ t }) => {
  return (
    <div className="flex h-full flex-col p-6">
      <h2 className="mb-4 text-2xl font-bold tracking-tight">{t("navExport")}</h2>
      <p className="mb-6 text-slate-300">내보내기 기능이 준비되었습니다.</p>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--bandscope-border)] bg-[var(--bandscope-surface)] p-5">
          <h3 className="mb-2 text-lg font-semibold text-slate-200">CSV Cue Sheet</h3>
          <p className="mb-4 text-sm text-slate-400">Export the rehearsal roadmap and cues as a CSV file for printing or spreadsheet editing.</p>
          <Button variant="outline" className="w-full justify-start gap-2 border-[color:var(--bandscope-border)] bg-[var(--bandscope-surface-strong)] text-slate-300 hover:bg-slate-800 hover:text-slate-100">
            <Download className="size-4" />
            <span>Download CSV</span>
          </Button>
        </div>

        <div className="rounded-xl border border-[color:var(--bandscope-border)] bg-[var(--bandscope-surface)] p-5">
          <h3 className="mb-2 text-lg font-semibold text-slate-200">JSON Chart</h3>
          <p className="mb-4 text-sm text-slate-400">Export the full analysis project data as a JSON file for interoperability with other tools.</p>
          <Button variant="outline" className="w-full justify-start gap-2 border-[color:var(--bandscope-border)] bg-[var(--bandscope-surface-strong)] text-slate-300 hover:bg-slate-800 hover:text-slate-100">
            <Download className="size-4" />
            <span>Download JSON</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
