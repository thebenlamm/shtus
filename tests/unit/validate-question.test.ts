import { describe, it, expect } from "vitest";
import { validateExactQuestion } from "../../party/main";

describe("validateExactQuestion", () => {
  describe("valid inputs", () => {
    it("accepts normal question text", () => {
      expect(validateExactQuestion("What is your favorite color?")).toBe(
        "What is your favorite color?"
      );
    });

    it("accepts single character", () => {
      expect(validateExactQuestion("?")).toBe("?");
    });

    it("accepts 500 character string", () => {
      const longString = "a".repeat(500);
      expect(validateExactQuestion(longString)).toBe(longString);
    });

    it("trims whitespace", () => {
      expect(validateExactQuestion("  Hello  ")).toBe("Hello");
      expect(validateExactQuestion("\n\tQuestion\n\t")).toBe("Question");
    });

    it("preserves internal whitespace", () => {
      expect(validateExactQuestion("Hello World")).toBe("Hello World");
    });

    it("allows unicode characters", () => {
      expect(validateExactQuestion("Café résumé 日本語")).toBe(
        "Café résumé 日本語"
      );
    });
  });

  describe("null/undefined handling", () => {
    it("returns null for null input", () => {
      expect(validateExactQuestion(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(validateExactQuestion(undefined)).toBeNull();
    });
  });

  describe("length bounds", () => {
    it("returns null for empty string", () => {
      expect(validateExactQuestion("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      expect(validateExactQuestion("   ")).toBeNull();
      expect(validateExactQuestion("\n\t")).toBeNull();
    });

    it("returns null for string over 500 chars", () => {
      const tooLong = "a".repeat(501);
      expect(validateExactQuestion(tooLong)).toBeNull();
    });

    it("returns null for string that becomes empty after trimming", () => {
      expect(validateExactQuestion("     ")).toBeNull();
    });
  });

  describe("control character removal", () => {
    it("removes null bytes", () => {
      expect(validateExactQuestion("Hello\x00World")).toBe("HelloWorld");
    });

    it("removes control characters", () => {
      expect(validateExactQuestion("Test\x01\x02\x03")).toBe("Test");
      expect(validateExactQuestion("\x1FStart")).toBe("Start");
    });

    it("removes DEL character", () => {
      expect(validateExactQuestion("Hello\x7FWorld")).toBe("HelloWorld");
    });

    it("returns null if control character removal empties string", () => {
      expect(validateExactQuestion("\x00\x01\x02")).toBeNull();
    });
  });

  describe("type coercion", () => {
    it("returns null for non-string input", () => {
      // TypeScript would catch this, but runtime might not
      expect(validateExactQuestion(123 as unknown as string)).toBeNull();
      expect(validateExactQuestion({} as unknown as string)).toBeNull();
      expect(validateExactQuestion([] as unknown as string)).toBeNull();
    });
  });
});
