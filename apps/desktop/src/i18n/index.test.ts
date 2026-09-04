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
    it("localizes every supported section form label for Korean rehearsal copy", () => {
      expect(
        [
          "intro",
          "verse",
          "pre-chorus",
          "chorus",
          "bridge",
          "outro",
          "tag",
          "pickup",
          "stop",
          "handoff"
        ].map((label) => translateSectionFormLabel("ko", label as never))
      ).toEqual([
        "인트로",
        "벌스",
        "프리코러스",
        "코러스",
        "브리지",
        "아웃트로",
        "태그",
        "픽업",
        "스톱",
        "핸드오프"
      ]);
    });

    it("preserves every supported English section form label", () => {
      expect(translateSectionFormLabel("en", "verse")).toBe("verse");
      expect(translateSectionFormLabel("en", "outro")).toBe("outro");
    });

    it("does not treat inherited object keys as localized section labels", () => {
      const inheritedKey = "toString" as never;
      expect(translateSectionFormLabel("ko", inheritedKey)).toBe("toString");
    });

    it("keeps Korean first-open-comment next-action copy particle-safe", () => {
      const t = createTranslator("ko");
      expect(t("firstOpenCommentOpenAction")).toBe("{at} {role} 위치 열기");
      expect(t("firstOpenCommentBody")).toBe("{author}님이 {at} {section}에서 {role} 파트에 메모를 남겼습니다.");
      expect(t("firstOpenCommentArmed")).toBe("{at}에서 {role} 파트 메모를 확인하세요. 그 파트를 보고 있으세요.");
    });
  });
});
