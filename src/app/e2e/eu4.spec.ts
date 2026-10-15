import { test, expect, logIn, openSave, campaignDate, clickSideBar } from "./fixtures";

test("a second save replaces the first, and its timeline steps", async ({ page }) => {
  await openSave(page, "eu4", "ita1.eu4");
  await expect(campaignDate(page)).toHaveAttribute("aria-valuetext", "1583 Dec 12");
  await page.getByRole("button", { name: "Back a day" }).click();
  await expect(campaignDate(page)).toHaveAttribute("aria-valuetext", "1583 Dec 11");

  // A timeline cursor of the first save must not step the second (#921).
  await clickSideBar(page, "Close Save");
  await openSave(page, "eu4", "kandy2.bin.eu4");
  const saveDate = campaignDate(page);
  await expect(saveDate).not.toHaveAttribute("aria-valuetext", /^1583 Dec 1[12]$/);
  const before = await saveDate.getAttribute("aria-valuenow");
  await page.getByRole("button", { name: "Back a day" }).click();
  await expect(saveDate).toHaveAttribute("aria-valuenow", String(Number(before) - 1));
});

test("upload a save, share it, and delete it", async ({ page, visitor }) => {
  await logIn(page);
  await openSave(page, "eu4", "ita1.eu4");
  await expect(campaignDate(page)).toBeVisible();

  await clickSideBar(page, "Upload save");
  await page.getByLabel("AAR (optional):").fill("A long way from Milan");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const permalink = page.getByRole("link", { name: "Permalink" });
  await expect(permalink).toBeVisible();
  const path = await permalink.getAttribute("href");
  expect(path).toMatch(/^\/eu4\/saves\/\w+$/);
  const apiPath = `/api/saves/${path!.split("/").at(-1)}`;

  // A visitor opens the permalink: the server sends the file, and the
  // browser parses it again.
  await visitor.goto(path!);
  await expect(campaignDate(visitor)).toHaveAttribute("aria-valuetext", "1583 Dec 12");
  await clickSideBar(visitor, "Save Info");
  await expect(visitor.getByText("A long way from Milan")).toBeVisible();
  const existing = await visitor.request.get(apiPath);
  expect(existing.status()).toBe(200);

  // The save earns a place on the achievement leaderboard.
  await page.goto("/eu4/achievements/18");
  await expect(page.getByText("Gold is open")).toBeHidden();
  await expect(page.getByText("my-steam-name").first()).toBeVisible();

  // The uploader deletes it from the saves page.
  await page.goto("/saves");
  const card = page.getByRole("article", {
    name: "Italy, 12 December 1583",
    exact: true,
  });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Delete save" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(card).toBeHidden();

  const gone = await visitor.request.get(apiPath);
  expect(gone.status()).toBe(404);
});
