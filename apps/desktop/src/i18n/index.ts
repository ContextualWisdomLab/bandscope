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

/** Documented. */
export function createTranslator(locale: Locale = "en") {
  return function t(key: TranslationKey): string {
    return dictionaries[locale][key] ?? dictionaries.en[key];
  };
}

/**
 * Fill `{token}` placeholders in one pass.
 *
 * Values are substituted from the original template only, so a role name that
 * contains `{sectionLabel}` cannot rewrite a later placeholder. Unknown tokens
 * stay in the string so missing locale keys remain visible in tests.
 */
export function interpolateTemplate(
  template: string,
  values: Readonly<Record<string, string>>
): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, token: string) => {
    if (Object.prototype.hasOwnProperty.call(values, token)) {
      return values[token] ?? match;
    }
    return match;
  });
}

/** Documented. */
export function detectPreferredLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ko")) {
    return "ko";
  }

  return "en";
}
