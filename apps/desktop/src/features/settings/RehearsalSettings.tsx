import { SUPPORTED_AUDIO_FORMATS } from "@bandscope/shared-types";
import { CloudOff, Upload } from "lucide-react";
import { useMemo } from "react";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { admittedAudioFormats, settingsNextAction } from "./settingsModel";

interface RehearsalSettingsProps {
  disabled: boolean;
  songReady: boolean;
  onChooseAudio: () => void;
  onOpenMap: () => void;
}

/** Settings names admitted local audio and the next rehearsal action. */
export function RehearsalSettings({ disabled, songReady, onChooseAudio, onOpenMap }: RehearsalSettingsProps) {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const formats = admittedAudioFormats(SUPPORTED_AUDIO_FORMATS);
  const action = settingsNextAction(songReady);

  return (
    <Card
      id="rehearsal-settings"
      className="overflow-hidden border-white/10 bg-slate-950/78 text-slate-100 shadow-[0_24px_90px_rgba(0,0,0,0.34)] backdrop-blur-2xl"
    >
      <CardHeader className="border-b border-white/10 pb-4">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">{t("settingsViewEyebrow")}</p>
        <CardTitle className="text-2xl font-black tracking-tight text-white">{t("settingsViewTitle")}</CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-400">{t("settingsViewSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
        <section aria-label={t("settingsFormatsLabel")}>
          <h3 className="text-xs font-black uppercase tracking-[0.22em] text-slate-300">{t("settingsFormatsLabel")}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {formats.length > 0 ? (
              formats.map((format) => (
                <Badge
                  key={format}
                  variant="outline"
                  className="h-7 border-cyan-300/30 bg-cyan-300/10 px-3 font-semibold uppercase tracking-[0.12em] text-cyan-50"
                >
                  .{format}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-slate-400">{t("settingsFormatsMissing")}</p>
            )}
          </div>
        </section>

        <section>
          <p className="text-sm leading-6 text-slate-200">
            {action === "choose-audio" ? t("settingsChooseAudioAction") : t("settingsOpenMapAction")}
          </p>
          <Button
            type="button"
            disabled={disabled}
            className="mt-4 min-h-11 bg-gradient-to-r from-cyan-400 to-violet-500 font-black text-slate-950 shadow-[0_14px_38px_rgba(34,211,238,0.28)] hover:from-cyan-300 hover:to-violet-400"
            onClick={action === "choose-audio" ? onChooseAudio : onOpenMap}
          >
            {action === "choose-audio" ? (
              <Upload className="mr-2 size-4" aria-hidden="true" />
            ) : null}
            {action === "choose-audio" ? t("settingsChooseAudioButton") : t("settingsOpenMapButton")}
          </Button>
        </section>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <CloudOff className="size-4 text-cyan-300" aria-hidden="true" />
            {t("localFirst")}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">{t("localFirstDetail")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
