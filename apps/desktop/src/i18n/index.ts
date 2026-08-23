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

const sectionFormLabels: Readonly<Record<Locale, Readonly<Record<SectionFormLabel, string>>>> = {
  en: {
    intro: "intro",
    verse: "verse",
    "pre-chorus": "pre-chorus",
    chorus: "chorus",
    bridge: "bridge",
    outro: "outro",
    tag: "tag",
    pickup: "pickup",
    stop: "stop",
    handoff: "handoff"
  },
  ko: {
    intro: "인트로",
    verse: "벌스",
    "pre-chorus": "프리코러스",
    chorus: "코러스",
    bridge: "브리지",
    outro: "아웃트로",
    tag: "태그",
    pickup: "픽업",
    stop: "스톱",
    handoff: "핸드오프"
  }
};

/** Documented. */
export function createTranslator(locale: Locale = "en") {
  return function t(key: TranslationKey): string {
    return dictionaries[locale][key] ?? dictionaries.en[key];
  };
}

/** Return localized buyer copy for an own supported section-form entry. */
export function translateSectionFormLabel(locale: Locale, label: SectionFormLabel): string {
  const labels = sectionFormLabels[locale] as Readonly<Record<PropertyKey, string>>;
  return Object.prototype.hasOwnProperty.call(labels, label) ? labels[label] : String(label);
}

/** Documented. */
export function detectPreferredLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ko")) {
    return "ko";
  }

  return "en";
}
