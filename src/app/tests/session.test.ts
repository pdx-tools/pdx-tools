import { parseBasicAuth } from "@/server-lib/session";

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
