import type { SectionFormLabel } from "@bandscope/shared-types";
import enCommon from "../locales/en/common.json";
import koCommon from "../locales/ko/common.json";

/** Documented. */
export type Locale = "en" | "ko";
/** Documented. */
export type TranslationKey = keyof typeof enCommon;

const dictionaries = {
  en: enCommon,
  ko: koCommon
} as const;

const sectionFormLabels: Readonly<
  Record<Locale, Partial<Record<SectionFormLabel, string>>>
> = {
  en: { handoff: "handoff" },
  ko: { handoff: "핸드오프" }
};

/** Documented. */
export function createTranslator(locale: Locale = "en") {
  return function t(key: TranslationKey): string {
    return dictionaries[locale][key] ?? dictionaries.en[key];
  };
}

/** Return localized copy for a section form label, preserving unknown labels as data. */
export function translateSectionFormLabel(locale: Locale, label: SectionFormLabel): string {
  return sectionFormLabels[locale][label] ?? label;
}

/** Documented. */
export function detectPreferredLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ko")) {
    return "ko";
  }

  return "en";
}
