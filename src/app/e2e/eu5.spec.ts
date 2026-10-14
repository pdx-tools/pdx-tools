import { test, expect, logIn, openSave, campaignDate } from "./fixtures";

// An EU5 1.4 save with a campaign history. The compiled 1.4 game bundle must
// be present.
const SAVE = "SP_MLO_1617_04_01_166d38a1-bffb-4182-9e37-9540b0c2ac4f.eu5";

test("share a save, open its permalink, and delete it", async ({ page, visitor }) => {
  await logIn(page);
  await openSave(page, "eu5", SAVE);
  const saveDate = campaignDate(page);
  await expect(saveDate).toHaveAttribute("aria-valuetext", "1617 Apr 1");

  // Go to the campaign start and back to the save date.
  await page.getByRole("button", { name: "Campaign start" }).click();
  await expect(saveDate).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "Save date", exact: true }).click();
  await expect(saveDate).toHaveAttribute("aria-valuetext", "1617 Apr 1");

  // The browser compresses the save before the upload.
  await page.getByRole("button", { name: "Share save" }).click();
  const permalink = page.getByRole("link", { name: "Open permalink" });
  await expect(permalink).toBeVisible({ timeout: 90_000 });
  const path = await permalink.getAttribute("href");
  expect(path).toMatch(/^\/eu5\/saves\/\w+$/);

  // Close each map before the next one opens. Pages in one browser share the
  // GPU, and a busy map can block the other page for many seconds.
  await page.goto("/saves?game=eu5");
  const card = page.getByText("1 April 1617").first();
  await expect(card).toBeVisible();

  await visitor.goto(path!);
  await expect(campaignDate(visitor)).toHaveAttribute("aria-valuetext", "1617 Apr 1", {
    timeout: 60_000,
  });
  await expect(visitor.getByRole("button", { name: "Copy link" })).toBeVisible();
  await visitor.close();

  await page.getByRole("button", { name: "Delete save" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete save" }).click();
  await expect(card).toBeHidden();

  const gone = await page.request.get(`/api${path}`);
  expect(gone.status()).toBe(404);
});
