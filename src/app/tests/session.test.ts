import { parseBasicAuth } from "@/server-lib/auth/basic";
import { describe, expect, it } from "vitest";

describe("basic auth test", () => {
  it.each([
    [
      "Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==",
      { username: "Aladdin", password: "open sesame" },
    ],
  ])("auth", (header, expected) => {
    const actual = parseBasicAuth(header);
    expect(actual).toStrictEqual(expected);
  });
});
