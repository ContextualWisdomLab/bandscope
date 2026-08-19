import { describe, it, expect, vi, afterEach } from "vitest";
import { createTranslator, detectPreferredLocale, translateSectionFormLabel } from "./index";
import koCommon from "../locales/ko/common.json";

describe("i18n", () => {
  describe("detectPreferredLocale", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("returns 'ko' when navigator.language is 'ko'", () => {
      vi.stubGlobal("navigator", { language: "ko" });
      expect(detectPreferredLocale()).toBe("ko");
    });

    it("returns 'ko' when navigator.language starts with 'ko'", () => {
      vi.stubGlobal("navigator", { language: "ko-KR" });
      expect(detectPreferredLocale()).toBe("ko");
    });

    it("returns 'en' for non-Korean locales", () => {
      vi.stubGlobal("navigator", { language: "en-US" });
      expect(detectPreferredLocale()).toBe("en");

      vi.stubGlobal("navigator", { language: "fr" });
      expect(detectPreferredLocale()).toBe("en");
    });

    it("returns 'en' when navigator is undefined", () => {
      const originalNavigator = globalThis.navigator;
      // @ts-expect-error - simulating missing navigator
      delete (globalThis as unknown as { navigator?: Navigator }).navigator;

      expect(detectPreferredLocale()).toBe("en");

      if (originalNavigator !== undefined) {
        // @ts-expect-error - restoring navigator
        globalThis.navigator = originalNavigator;
      }
    });

    it("returns 'en' when navigator.language is undefined", () => {
      vi.stubGlobal("navigator", {});
      expect(detectPreferredLocale()).toBe("en");
    });
  });

  describe("createTranslator", () => {
    it("translates to English by default", () => {
      const t = createTranslator();
      expect(t("appTitle")).toBe("BandScope");
    });

    it("translates to English explicitly", () => {
      const t = createTranslator("en");
      expect(t("appTitle")).toBe("BandScope");
    });

    it("translates to Korean explicitly", () => {
      const t = createTranslator("ko");
      expect(t("appTitle")).toBe("BandScope");
      expect(t("appSubtitle")).toBe("합주 준비를 위한 로컬-퍼스트 분석 도구");
    });

    it("falls back to English when a Korean translation is missing", () => {
      const t = createTranslator("ko");
      const koDictionary = koCommon as Record<string, string | undefined>;
      const originalSubtitle = koDictionary.appSubtitle;
      delete koDictionary.appSubtitle;

      try {
        expect(t("appSubtitle")).toBe("Local-first desktop analysis tool for rehearsal prep");
      } finally {
        koDictionary.appSubtitle = originalSubtitle;
      }
    });
  });

  describe("translateSectionFormLabel", () => {
    it("localizes an intro label for Korean rehearsal copy", () => {
      expect(translateSectionFormLabel("ko", "intro")).toBe("인트로");
      expect(translateSectionFormLabel("en", "intro")).toBe("intro");
    });

    it("preserves unlabeled form values as data", () => {
      expect(translateSectionFormLabel("ko", "verse")).toBe("verse");
    });

    it("does not treat inherited object keys as localized section labels", () => {
      const inheritedKey = "toString" as never;
      expect(translateSectionFormLabel("ko", inheritedKey)).toBe("toString");
    });
  });
});
