import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { Eu5Loading } from "./Eu5Loading";
import { SavePreviewUnderlay } from "@/components/SavePreviewUnderlay";

vi.mock("@/components/SavePreviewUnderlay", () => ({ SavePreviewUnderlay: vi.fn(() => null) }));
beforeEach(() => vi.clearAllMocks());

it("does not mount loader content or its preview for an already loaded save", () => {
  const html = renderToString(
    <Eu5Loading loading={null} filename="ready.eu5" done={true} preview="/preview.png" />,
  );
  expect(html).toBe("");
  expect(SavePreviewUnderlay).not.toHaveBeenCalled();
});

it("shows the loader for a save that the page still needs to load", () => {
  const html = renderToString(
    <Eu5Loading
      loading={{ percent: 20, stage: "Parsing gamestate" }}
      filename="loading.eu5"
      done={false}
      preview="/preview.png"
    />,
  );
  expect(html).toContain("loading.eu5");
  expect(html).toContain('aria-valuenow="20"');
  expect(SavePreviewUnderlay).toHaveBeenCalledOnce();
});
