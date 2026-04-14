import { describe, expect, it } from "vitest";
import { WebKeyCode, encodeWebKeyCode } from "./key_codes.generated";

describe("encodeWebKeyCode", () => {
  it("encodes canonical keyboard codes", () => {
    expect(encodeWebKeyCode("KeyA")).toBe(WebKeyCode.KeyA);
    expect(encodeWebKeyCode("ArrowLeft")).toBe(WebKeyCode.ArrowLeft);
    expect(encodeWebKeyCode("Numpad0")).toBe(WebKeyCode.Numpad0);
  });

  it("maps browser aliases onto the canonical transport code", () => {
    expect(encodeWebKeyCode("OSLeft")).toBe(WebKeyCode.MetaLeft);
    expect(encodeWebKeyCode("SuperRight")).toBe(WebKeyCode.MetaRight);
  });

  it("falls back to Unknown for unmapped values", () => {
    expect(encodeWebKeyCode("Unidentified")).toBe(WebKeyCode.Unknown);
  });
});
