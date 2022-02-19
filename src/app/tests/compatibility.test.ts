import { userAgentCompatibility } from "../src/lib/compatibility";

test("user-agent: chrome on old ios", () => {
  const actual = userAgentCompatibility(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3 like Mac OS X) AppleWebKit/602.1.50 (KHTML, like Gecko) CriOS/56.0.2924.75 Mobile/14E5239e Safari/602.1"
  );
  expect(actual).toStrictEqual({
    webkit: {
      kind: "webkit",
      required: "605.1",
      supported: false,
      version: "602.1",
    },
  });
});

test("user-agent: safari on old ios", () => {
  const actual = userAgentCompatibility(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3 like Mac OS X) AppleWebKit/603.1.23 (KHTML, like Gecko) Version/10.0 Mobile/14E5239e Safari/602.1"
  );
  expect(actual).toStrictEqual({
    webkit: {
      kind: "safari",
      required: "15.2",
      supported: false,
      version: "10.0",
    },
  });
});

// https://developer.chrome.com/docs/multidevice/user-agent/#chrome_for_ios_user_agent
test("user-agent: chrome on old ios desktop requested", () => {
  const actual = userAgentCompatibility(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/85 Version/11.1.1 Safari/605.1.15"
  );
  expect(actual).toStrictEqual({
    webkit: {
      kind: "safari",
      required: "15.2",
      supported: false,
      version: "11.1",
    },
  });
});

test("user-agent: supported firefox", () => {
  const actual = userAgentCompatibility(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:97.0) Gecko/20100101 Firefox/97.0"
  );
  expect(actual).toStrictEqual({});
});

test("user-agent: supported safari", () => {
  const actual = userAgentCompatibility(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 12_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.2 Safari/605.1.15"
  );
  expect(actual).toStrictEqual({
    webkit: {
      kind: "safari",
      required: "15.2",
      supported: true,
      version: "15.2",
    },
  });
});

test("user-agent: safari on old ios 2", () => {
  const actual = userAgentCompatibility(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/10.0 Mobile/14E5239e Safari/604.1"
  );
  expect(actual).toStrictEqual({
    webkit: {
      kind: "safari",
      required: "15.2",
      supported: false,
      version: "10.0",
    },
  });
});

test("user-agent: android chrome", () => {
  const actual = userAgentCompatibility(
    "Mozilla/5.0 (Linux; Android 12; Pixel 3a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.87 Mobile Safari/537.36"
  );
  expect(actual).toStrictEqual({});
});

test("user-agent: desktop chrome", () => {
  const actual = userAgentCompatibility(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36"
  );
  expect(actual).toStrictEqual({});
});
