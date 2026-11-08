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

  // A compact figure keeps its exact value on keyboard focus and on hover.
  await page.getByRole("button", { name: "Wealth", exact: true }).click();
  await page.getByRole("button", { name: /^Open .* panel$/ }).click();
  const totalWealth = page.getByText("285.2K", { exact: true });
  const exactValue = page.getByRole("tooltip");
  await totalWealth.focus();
  await expect(exactValue).toHaveText("285,182.72");
  await page.keyboard.press("Escape");
  await expect(exactValue).toBeHidden();
  await totalWealth.hover();
  await expect(exactValue).toHaveText("285,182.72");

  // The cells of a table are one stop for Tab, and arrow keys go from cell to cell.
  const table = page
    .locator("table")
    .filter({ has: page.locator("td[data-exact]") })
    .first();
  const tabStop = table.locator('td[data-exact][tabindex="0"]');
  await expect(tabStop).toHaveCount(1);
  await tabStop.focus();
  await page.keyboard.press("ArrowRight");
  const focusedCell = table.locator("td[data-exact]:focus");
  await expect(focusedCell).toHaveCount(1);
  await expect(tabStop).not.toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tabStop).toBeFocused();

  // Left and right go on to the next row, so each cell can be reached.
  const firstRowCells = table.locator("tbody tr").first().locator("td[data-exact]");
  await firstRowCells.last().focus();
  await page.keyboard.press("ArrowRight");
  await expect(table.locator("tbody tr").nth(1).locator("td[data-exact]:focus")).toHaveCount(1);

  // The figures of a country's rail are one stop as well.
  await table.getByRole("button", { name: /Mali/ }).first().click();
  const railFigures = page.locator("[data-rail-value]");
  await expect(railFigures.first()).toBeVisible();
  const railStop = page.locator('[data-rail-value][tabindex="0"]');
  await expect(railStop).toHaveCount(1);
  await railStop.focus();
  await page.keyboard.press("ArrowDown");
  await expect(railFigures.nth(1)).toBeFocused();
  await expect(railStop).toHaveCount(1);
  await expect(page.getByRole("tooltip", { name: "1,913.11" })).toBeVisible();

  // A rank that hundreds of countries share reads as a tie.
  await expect(page.getByText("=#1", { exact: true })).toBeVisible();
  await expect(page.getByTitle("446 countries share this rank")).toBeVisible();

  // Escape hides a full value that covers other text, and it keeps the selection.
  const locationsTab = page.getByRole("tab", { name: "Locations" });
  await locationsTab.click();
  const profileCell = page.locator("td[data-exact]").first();
  await profileCell.focus();
  const afterDisplay = () =>
    profileCell.evaluate((cell) => getComputedStyle(cell, "::after").display);
  await expect.poll(afterDisplay).not.toBe("none");
  await page.keyboard.press("Escape");
  await expect.poll(afterDisplay).toBe("none");
  await expect(locationsTab).toBeVisible();

  // A header that names a defined term explains it, and the sort button keeps its one stop.
  await page.getByRole("button", { name: "Tax Base Gap", exact: true }).click();
  await page.getByRole("button", { name: "Sort by Tax Gap" }).focus();
  await expect(page.getByRole("tooltip", { name: /^Tax Base Gap:/ })).toBeVisible();

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
