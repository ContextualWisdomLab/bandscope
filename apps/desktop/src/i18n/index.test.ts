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
    it("localizes supported section form labels", () => {
      expect(translateSectionFormLabel("ko", "chorus")).toBe("코러스");
      expect(translateSectionFormLabel("en", "pre-chorus")).toBe("pre-chorus");
    });

    it("does not read inherited Object keys as section labels", () => {
      const inheritedKey = "toString" as never;
      expect(translateSectionFormLabel("en", inheritedKey)).toBe("toString");
      expect(translateSectionFormLabel("ko", inheritedKey)).toBe("toString");
    });

    it("keeps Korean first-fade-plan next-action copy particle-safe and tonally consistent", () => {
      const t = createTranslator("ko");
      expect(t("firstFadePlanOpenAction")).toBe("{at} {role} 페이드 열기");
      expect(t("firstFadePlanBody")).toBe("{at} {section}에서 {role} 파트가 페이드합니다.");
      expect(t("firstFadePlanArmed")).toBe(
        "{at}에서 {role} 파트로 함께 페이드하세요. 더 조용하게 내려앉는 게 들리도록 줄이세요."
      );
      expect(t("firstFadePlanGeneratedGuidance")).toBe(
        "{target} 파트와 이 파트를 페이드하세요. 다음 다운비트까지 줄이세요."
      );
      expect(t("firstFadePlanGeneratedSoloGuidance")).toBe(
        "이 파트를 페이드하세요. 다음 다운비트까지 줄이세요."
      );
    });
  });

});
