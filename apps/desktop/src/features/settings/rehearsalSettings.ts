const ADMITTED_AUDIO_FORMAT = /^(wav|mp3|flac|m4a)$/;

/** Next Settings action named from whether tonight's song is ready. */
export type SettingsNextAction = "choose-audio" | "open-map";

/** Return lowercase audio extensions that this Settings surface may name. */
export function admittedAudioFormats(formats: readonly unknown[]): string[] {
  const admitted: string[] = [];
  const seen = new Set<string>();

  for (const format of formats) {
    if (typeof format !== "string") {
      continue;
    }

    const normalized = format.trim().toLowerCase();
    if (!ADMITTED_AUDIO_FORMAT.test(normalized) || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    admitted.push(normalized);
  }

  return admitted;
}

/** Name the next Settings action from whether tonight's song is already ready. */
export function settingsNextAction(songReady: boolean): SettingsNextAction {
  return songReady ? "open-map" : "choose-audio";
}
