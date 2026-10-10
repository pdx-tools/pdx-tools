import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { getEu5Session } from "./eu5Session";
import { useLoadEu5 } from "./useLoadEu5";
import { initialEu5SessionSnapshot } from "./eu5SessionState";

vi.mock("./eu5Session", () => ({
  getEu5Session: vi.fn(),
  findEu5Session: vi.fn(() => null),
  subscribeEu5Session: vi.fn(() => () => {}),
}));

it("renders without acquiring or replacing a session", () => {
  function Page() {
    const { host, data, loading } = useLoadEu5({
      kind: "server",
      saveId: "next",
      name: "next.eu5",
      uploaderId: null,
    });
    expect(host).toBeNull();
    expect(data).toBeNull();
    expect(loading).toBe(initialEu5SessionSnapshot.loading);
    return null;
  }
  renderToString(<Page />);
  expect(getEu5Session).not.toHaveBeenCalled();
});
