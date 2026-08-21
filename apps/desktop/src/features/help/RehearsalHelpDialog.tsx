import { useMemo, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createTranslator,
  detectPreferredLocale,
  type TranslationKey,
} from "../../i18n";
import {
  rehearsalHelpAction,
  type RehearsalHelpPhase,
} from "./rehearsalHelp";

interface RehearsalHelpProps {
  open: boolean;
  phase: RehearsalHelpPhase;
  onOpenChange: (open: boolean) => void;
  onChooseLocal: () => void;
  onStartAnalysis: () => void;
  onShowMap: () => void;
}

const PHASE_BODY_KEY: Record<RehearsalHelpPhase, TranslationKey> = {
  "choose-local-song": "helpChooseLocalBody",
  "start-analysis": "helpStartAnalysisBody",
  "wait-for-analysis": "helpWaitBody",
  "retry-after-failure": "helpRetryBody",
  "open-rehearsal-map": "helpReadyBody",
};

const PHASE_ACTION_KEY: Record<
  Exclude<ReturnType<typeof rehearsalHelpAction>, "none">,
  TranslationKey
> = {
  "choose-local": "helpChooseLocalAction",
  "start-analysis": "helpStartAnalysisAction",
  "focus-map": "helpReadyAction",
};

/** Render tonight's rehearsal help with one next action. */
export function RehearsalHelp({
  open,
  phase,
  onOpenChange,
  onChooseLocal,
  onStartAnalysis,
  onShowMap,
}: RehearsalHelpProps): ReactElement {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const action = rehearsalHelpAction(phase);
  const retry = phase === "retry-after-failure";

  /** Documented. */
  const runNextAction = (): void => {
    onOpenChange(false);
    if (action === "choose-local") {
      onChooseLocal();
      return;
    }
    if (action === "start-analysis") {
      onStartAnalysis();
      return;
    }
    if (action === "focus-map") {
      onShowMap();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-cyan-300/20 bg-slate-950 text-slate-100 sm:max-w-lg"
        data-testid="rehearsal-help-dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight text-white">
            {t("helpTitle")}
          </DialogTitle>
          <DialogDescription
            className="text-sm leading-6 text-slate-300"
            data-testid="rehearsal-help-next-action"
          >
            {t(PHASE_BODY_KEY[phase])}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm leading-6 text-slate-400">{t("helpPrivacy")}</p>
        <DialogFooter>
          <DialogClose
            render={
              <Button
                type="button"
                variant="outline"
                className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100"
              >
                {t("helpClose")}
              </Button>
            }
          />
          {action !== "none" ? (
            <Button
              type="button"
              className="min-h-11 bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200"
              onClick={runNextAction}
            >
              {retry ? t("helpRetryAction") : t(PHASE_ACTION_KEY[action])}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
