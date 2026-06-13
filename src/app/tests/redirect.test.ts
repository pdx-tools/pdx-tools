import { safeRedirect } from "@/server-lib/auth/redirect";
import { describe, expect, it } from "vitest";

describe("safeRedirect", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeRedirect("/account")).toBe("/account");
    expect(safeRedirect("/users/123?tab=saves")).toBe("/users/123?tab=saves");
  });

  it("falls back when missing", () => {
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
    expect(safeRedirect("")).toBe("/");
  });

  it("rejects open redirects", () => {
    expect(safeRedirect("//evil.com")).toBe("/");
    expect(safeRedirect("/\\evil.com")).toBe("/");
    expect(safeRedirect("https://evil.com")).toBe("/");
    expect(safeRedirect("mailto:foo@bar.com")).toBe("/");
    expect(safeRedirect("account")).toBe("/");
  });

  it("honors a custom fallback", () => {
    expect(safeRedirect(null, "/home")).toBe("/home");
    expect(safeRedirect("//evil.com", "/home")).toBe("/home");
  });
});
