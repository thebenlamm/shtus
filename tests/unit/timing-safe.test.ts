import { describe, it, expect } from "vitest";
import { timingSafeEqual } from "../../party/main";

describe("timingSafeEqual", () => {
  describe("equality checks", () => {
    it("returns true for equal strings", () => {
      expect(timingSafeEqual("secret", "secret")).toBe(true);
      expect(timingSafeEqual("abc123", "abc123")).toBe(true);
      expect(timingSafeEqual("admin-key-12345", "admin-key-12345")).toBe(true);
    });

    it("returns false for different strings of same length", () => {
      expect(timingSafeEqual("secret", "secrat")).toBe(false);
      expect(timingSafeEqual("abc123", "abc124")).toBe(false);
    });

    it("returns false for strings of different lengths", () => {
      expect(timingSafeEqual("short", "longer")).toBe(false);
      expect(timingSafeEqual("verylongstring", "short")).toBe(false);
    });

    it("returns false when one string is prefix of another", () => {
      expect(timingSafeEqual("admin", "admin-key")).toBe(false);
      expect(timingSafeEqual("admin-key", "admin")).toBe(false);
    });
  });

  describe("empty string handling", () => {
    it("returns true for two empty strings", () => {
      expect(timingSafeEqual("", "")).toBe(true);
    });

    it("returns false when comparing empty with non-empty", () => {
      expect(timingSafeEqual("", "nonempty")).toBe(false);
      expect(timingSafeEqual("nonempty", "")).toBe(false);
    });
  });

  describe("special characters", () => {
    it("handles unicode characters", () => {
      expect(timingSafeEqual("café", "café")).toBe(true);
      expect(timingSafeEqual("café", "cafe")).toBe(false);
    });

    it("handles special characters", () => {
      expect(timingSafeEqual("key!@#$%", "key!@#$%")).toBe(true);
      expect(timingSafeEqual("key!@#$%", "key!@#$&")).toBe(false);
    });

    it("handles whitespace", () => {
      expect(timingSafeEqual("key with spaces", "key with spaces")).toBe(true);
      expect(timingSafeEqual("key with spaces", "keywithspaces")).toBe(false);
    });
  });

  describe("case sensitivity", () => {
    it("is case sensitive", () => {
      expect(timingSafeEqual("Secret", "secret")).toBe(false);
      expect(timingSafeEqual("SECRET", "secret")).toBe(false);
      expect(timingSafeEqual("Secret", "Secret")).toBe(true);
    });
  });
});
