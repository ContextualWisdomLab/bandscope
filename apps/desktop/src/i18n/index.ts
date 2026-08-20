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
  en: { "pre-chorus": "pre-chorus" },
  ko: { "pre-chorus": "프리코러스" }
};

/** Create a translation function that resolves keys for the selected locale. */
export function createTranslator(locale: Locale = "en") {
  return function t(key: TranslationKey): string {
    return dictionaries[locale][key] ?? dictionaries.en[key];
  };
}

/** Return localized copy for an own section-form entry, preserving unknown labels as data. */
export function translateSectionFormLabel(locale: Locale, label: SectionFormLabel): string {
  const labels = sectionFormLabels[locale];
  if (!Object.prototype.hasOwnProperty.call(labels, label)) {
    return label;
  }
  return labels[label] as string;
}

/** Documented. */
export function detectPreferredLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ko")) {
    return "ko";
  }

  return "en";
}
