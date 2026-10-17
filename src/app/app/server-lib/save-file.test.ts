import { afterEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { cloudflareContext } from "./cloudflare-context";
import type { CloudflareContext } from "./cloudflare-context";
import { saveFileResponse } from "./save-file";

function contextFor(value: Partial<CloudflareContext>) {
  const context = new RouterContextProvider();
  context.set(cloudflareContext, value as CloudflareContext);
  return context;
}

afterEach(() => vi.restoreAllMocks());

describe("saveFileResponse", () => {
  it.each(["eu4", "eu5"] as const)(
    "reads public %s saves through the production binding",
    async (game) => {
      const response = new Response("save data");
      const worker = { getSave: vi.fn().mockResolvedValue(response) };
      const path = `${game === "eu5" ? "/api/eu5" : "/api"}/saves/save-id/file`;
      const request = new Request(`https://preview.example${path}`, {
        headers: {
          "If-None-Match": '"save-etag"',
          "If-Modified-Since": "Sat, 17 Oct 2026 12:00:00 GMT",
        },
      });
      const result = await saveFileResponse({
        request,
        url: new URL(request.url),
        context: contextFor({ env: { PREVIEW_SAVES: worker } as unknown as CloudflareWorkerEnv }),
        saveId: "save-id",
        game,
      });

      expect(result).toBe(response);
      expect(worker.getSave).toHaveBeenCalledExactlyOnceWith(game, "save-id", {
        ifNoneMatch: '"save-etag"',
        ifModifiedSince: "Sat, 17 Oct 2026 12:00:00 GMT",
      });
    },
  );

  it("reports a missing preview binding", async () => {
    const request = new Request("https://preview.example/api/saves/save-id/file");

    await expect(
      saveFileResponse({
        request,
        url: new URL(request.url),
        context: contextFor({ env: {} as CloudflareWorkerEnv }),
        saveId: "save-id",
        game: "eu4",
      }),
    ).rejects.toThrow("PREVIEW_SAVES is not available in this environment");
  });

  it("uses the production cache when the save bucket is bound", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const response = new Response("cached save");
    const worker = { getSave: vi.fn() };
    const request = new Request("https://pdx.tools/api/saves/save-id/file");
    const result = await saveFileResponse({
      request,
      url: new URL(request.url),
      context: contextFor({
        env: { SAVE_BUCKET: {}, PREVIEW_SAVES: worker } as unknown as CloudflareWorkerEnv,
        caches: {
          default: { match: vi.fn().mockResolvedValue(response) },
        } as unknown as CacheStorage,
      }),
      saveId: "save-id",
      game: "eu4",
    });

    expect(result).toBe(response);
    expect(worker.getSave).not.toHaveBeenCalled();
  });
});
