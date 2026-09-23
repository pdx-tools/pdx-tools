import { afterEach, describe, expect, it, vi } from "vitest";
import { redirect, RouterContextProvider } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { withCore } from "./middleware";
import { NotFoundError, ValidationError } from "./errors";
import { cloudflareContext } from "./cloudflare-context";
import type { CloudflareContext } from "./cloudflare-context";
import { log } from "./logging";

vi.mock("./posthog", () => ({ flushEvents: async () => {} }));

function args(): LoaderFunctionArgs {
  const context = new RouterContextProvider();
  context.set(cloudflareContext, {
    ctx: { waitUntil: () => {} },
  } as unknown as CloudflareContext);
  return {
    request: new Request("https://pdx.tools/api/saves?x=1", { method: "POST" }),
    params: {},
    context,
    unstable_pattern: "",
  } as unknown as LoaderFunctionArgs;
}

async function thrownBy(err: unknown) {
  return withCore(async () => {
    throw err;
  })(args()).then(
    () => expect.unreachable(),
    (thrown: unknown) => thrown,
  );
}

describe("withCore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rethrows a thrown response and logs 4xx at info", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    const response = Response.json({ msg: "Method not allowed" }, { status: 405 });

    expect(await thrownBy(response)).toBe(response);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", path: "/api/saves", status: 405 }),
    );
  });

  it("rethrows redirects without logging", async () => {
    const info = vi.spyOn(log, "info");
    const error = vi.spyOn(log, "error");
    const response = redirect("/login");

    expect(await thrownBy(response)).toBe(response);
    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("logs a thrown 5xx response at error", async () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => {});

    await thrownBy(new Response(null, { status: 503 }));
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }));
  });

  it.each([
    [new ValidationError("bad input"), 400, "bad input"],
    [new NotFoundError("save"), 404, "save not found"],
  ])("maps %o to %i", async (err, status, msg) => {
    vi.spyOn(log, "info").mockImplementation(() => {});
    const thrown = await thrownBy(err);

    expect(thrown).toBeInstanceOf(Response);
    const response = thrown as Response;
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ name: err.name, msg });
  });

  it("hides the message of an unexpected error from the client", async () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => {});
    const thrown = (await thrownBy(new Error("duplicate key saves_pkey"))) as Response;

    expect(thrown.status).toBe(500);
    expect(await thrown.text()).not.toContain("saves_pkey");
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ error: "duplicate key saves_pkey", thrownType: "Error" }),
    );
  });

  it("maps a non-error throw to a 500", async () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => {});
    const thrown = (await thrownBy({ status: 500, clone() {} })) as Response;

    expect(thrown.status).toBe(500);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ thrownType: "Object" }));
  });
});
