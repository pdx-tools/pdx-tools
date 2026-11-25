import { expect, it, vi } from "vitest";
import { sha256File } from "@/lib/sha256";

const mocks = vi.hoisted(() => ({ compress: vi.fn() }));
type Options = { mutationFn: (variables: unknown) => Promise<unknown> };
vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: Options) => options,
  useQueryClient: () => ({}),
}));
vi.mock("@/features/eu4/worker/getEu4Worker", () => ({ getEu4Worker: vi.fn() }));
vi.mock("@/features/compress", () => ({
  createCompressionWorker: () => ({ compress: mocks.compress, release: () => {} }),
}));
import { pdxApi } from "./appApi";

class Request {
  upload = { addEventListener: () => {} };
  status = 200;
  response = JSON.stringify({ save_id: "id" });
  private load = () => {};
  open() {}
  setRequestHeader() {}
  addEventListener(type: string, listener: () => void) {
    if (type === "load") this.load = listener;
  }
  send() {
    this.load();
  }
}

it("gives the hash of the EU5 bytes that it sent, when the view had none at submit", async () => {
  vi.stubGlobal("XMLHttpRequest", Request);
  vi.stubGlobal("isSecureContext", true);
  // The compression worker takes the bytes.
  mocks.compress.mockImplementation(async (data: Uint8Array<ArrayBuffer>) => ({
    data: structuredClone(data, { transfer: [data.buffer] }),
    contentType: "application/zstd",
  }));
  const file = new File(["save"], "autosave.eu5");
  const { mutationFn } = pdxApi.eu5Saves.useAdd() as unknown as Options;
  const result = await mutationFn({
    save: { kind: "file", file },
    hash: null,
    filename: file.name,
    dispatch: () => {},
  });
  expect(result).toEqual({ save_id: "id", hash: await sha256File(file) });
  vi.unstubAllGlobals();
});
