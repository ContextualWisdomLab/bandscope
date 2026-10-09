import en from "../locales/en/transcription.json";
import ko from "../locales/ko/transcription.json";
import { detectPreferredLocale, type Locale } from "./index";

/** Feature copy remains type-checked against both baseline locale resources. */
export type TranscriptionCopyKey = keyof typeof en;

const dictionaries: Record<Locale, Record<TranscriptionCopyKey, string>> = { en, ko };

/** Interpolate note counts and durations without admitting HTML from a source filename. */
export function createTranscriptionTranslator(locale: Locale = detectPreferredLocale()) {
  return function t(key: TranscriptionCopyKey, values: Record<string, string | number> = {}): string {
    return dictionaries[locale][key].replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
  };
}
