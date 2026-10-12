import fs from "node:fs/promises";
import type { Page, TestInfo } from "@playwright/test";
import { test, expect, campaignDate, clickSideBar, logIn } from "./fixtures";
import { readSaveFixture, saveFixture } from "../tests/support";

const EU4_SAVES = ["ita2.eu4", "ita2_later.eu4", "ita2_later13.eu4"];

async function openFiles(page: Page, files: string[]) {
  await page.goto("/");
  // Set file times so the first file opens on each platform.
  await page.evaluate(() => {
    document.addEventListener(
      "change",
      (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.id !== "analyze-box-file-input") return;
        const data = new DataTransfer();
        Array.from(input.files ?? []).forEach((file, index) => {
          data.items.add(
            new File([file], file.name, { type: file.type, lastModified: 1000 - index }),
          );
        });
        input.files = data.files;
      },
      { capture: true, once: true },
    );
  });
  await page.locator("#analyze-box-file-input").setInputFiles(files);
  if (files[0].endsWith(".eu5")) {
    await expect(page.getByRole("navigation", { name: "Map modes" })).toBeVisible();
  } else {
    await expect(campaignDate(page)).toBeVisible();
  }
}

async function expectEu5Date(page: Page, year: number) {
  const header = page.locator("header").filter({
    has: page.getByRole("link", { name: "Return to home" }),
  });
  await expect(header).toContainText(new RegExp(`${year}\\s*Apr 1`));
}

async function expectFranceSelection(page: Page) {
  const clear = page.getByRole("button", { name: "Clear selection" });
  await expect(clear).toBeVisible();
  await expect(clear.locator("..")).toContainText("France");
}

async function openListedSave(page: Page, name: string) {
  const list = page.getByRole("button", { name: /^Save \d+ of \d+, show all saves$/ }).first();
  const row = page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
  if (!(await row.isVisible())) await list.click();
  await expect(row).toBeVisible();
  if ((await row.getAttribute("aria-current")) === "true") {
    await list.click();
  } else {
    await row.getByRole("button", { name: "Open save", exact: true }).click();
  }
}

async function expectSaveIndex(page: Page, index: number, count: number) {
  await expect(
    page.getByRole("button", { name: `Save ${index} of ${count}, show all saves` }).first(),
  ).toBeVisible();
}

async function stepTimeline(page: Page) {
  const date = campaignDate(page);
  const before = Number(await date.getAttribute("aria-valuenow"));
  await page.getByRole("button", { name: "Back a day" }).click();
  await expect(date).toHaveAttribute("aria-valuenow", String(before - 1));
  await page.getByRole("button", { name: "Save date", exact: true }).click();
  await expect(date).toHaveAttribute("aria-valuenow", String(before));
}

// These files use one text save with different metadata dates.
// Equal field lengths keep the metadata length in the save header correct.
async function eu5Files(info: TestInfo) {
  const first = await saveFixture("eu5", "debug-1.0.eu5");
  const original = await fs.readFile(first);
  const later = Buffer.from(original);
  const date = later.indexOf("date=1337.4.1");
  expect(date).toBeGreaterThan(0);
  later.write("date=1338.4.1", date);
  const headerEnd = later.indexOf("\n") + 1;
  const metadataLength = Number.parseInt(
    later.subarray(headerEnd - 9, headerEnd - 1).toString(),
    16,
  );
  expect(metadataLength).toBeGreaterThan(0);
  const invalid = Buffer.from(later.subarray(0, headerEnd + metadataLength));
  invalid.write("date=1339.4.1", date);
  const broken = Buffer.concat([invalid, Buffer.from("invalid_gamestate={")]);
  const files = {
    first,
    later: info.outputPath("later.eu5"),
    broken: info.outputPath("broken.eu5"),
  };
  await fs.mkdir(info.outputDir, { recursive: true });
  await Promise.all([fs.writeFile(files.later, later), fs.writeFile(files.broken, broken)]);
  return files;
}

test.afterEach(async () => {
  const info = test.info();
  await Promise.all(
    ["later", "broken"].map((name) => fs.rm(info.outputPath(`${name}.eu5`), { force: true })),
  );
});

test("EU4 local campaign saves keep the country and map mode, and each timeline works", async ({
  page,
}) => {
  await openFiles(page, await Promise.all(EU4_SAVES.map((name) => saveFixture("eu4", name))));
  await openListedSave(page, EU4_SAVES[0]);
  await expectSaveIndex(page, 1, 3);
  const firstDate = await campaignDate(page).getAttribute("aria-valuetext");
  await clickSideBar(page, "Country breakdown");
  await page.getByRole("combobox").click();
  await page.getByPlaceholder("Search countries").fill("France");
  await page.getByRole("option", { name: /France \(FRA\)/ }).click();
  await expect(page.getByRole("combobox").filter({ hasText: "France (FRA)" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  const mode = page.getByRole("button", { name: "religion mapmode" });
  await page.getByAltText("political mapmode").last().hover();
  await mode.click();
  await expect(mode).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("]");
  await expectSaveIndex(page, 2, 3);
  await expect(campaignDate(page)).not.toHaveAttribute("aria-valuetext", firstDate!);
  await expect(mode).toHaveAttribute("aria-pressed", "true");
  await clickSideBar(page, "Country breakdown");
  await expect(page.getByRole("combobox").filter({ hasText: "France (FRA)" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await stepTimeline(page);
  await page.keyboard.press("]");
  await expectSaveIndex(page, 3, 3);
  await stepTimeline(page);
  await page.keyboard.press("[");
  await expectSaveIndex(page, 2, 3);
});

test("EU5 campaign steps keep the view and recover from an invalid save", async ({
  page,
}, info) => {
  const files = await eu5Files(info);
  await openFiles(page, [files.first, files.later, files.broken]);
  await openListedSave(page, "debug-1.0.eu5");
  await expectEu5Date(page, 1337);
  await page.getByRole("button", { name: "Search countries or locations", exact: true }).click();
  await page.getByPlaceholder("Search countries or locations...").fill("FRA");
  await page.getByRole("option", { name: /FRA France/ }).click();
  await expectFranceSelection(page);
  const religion = page
    .getByRole("navigation", { name: "Map modes" })
    .getByRole("button", { name: "Religion", exact: true });
  await religion.click();
  await expect(religion).toHaveAttribute("aria-pressed", "true");
  const canvas = page.locator("canvas").first();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.wheel(0, -500);
  await page.mouse.move(0, 0);
  const clip = { x: bounds!.x + 340, y: bounds!.y + 120, width: 240, height: 300 };
  const mapImage = () => page.screenshot({ clip });
  let view = await mapImage();
  await expect
    .poll(async () => {
      const next = await mapImage();
      const stable = next.equals(view);
      view = next;
      return stable;
    })
    .toBe(true);
  await info.attach("campaign-view", { body: view, contentType: "image/png" });

  await openListedSave(page, "later.eu5");
  await expectEu5Date(page, 1338);
  await expect(religion).toHaveAttribute("aria-pressed", "true");
  await expectFranceSelection(page);
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await mapImage()).equals(view)).toBe(true);

  await openListedSave(page, "broken.eu5");
  await expect(page.getByText("Could not open the save", { exact: true }).first()).toBeVisible();
  await expectEu5Date(page, 1338);
  await expect(religion).toHaveAttribute("aria-pressed", "true");
  await openListedSave(page, "debug-1.0.eu5");
  await expectEu5Date(page, 1337);
});

test("EU5 warns about another campaign and resets its view when it opens", async ({ page }) => {
  const observer = "SP_MLO_1617_04_01_166d38a1-bffb-4182-9e37-9540b0c2ac4f.eu5";
  await openFiles(page, [
    await saveFixture("eu5", "debug-1.0.eu5"),
    await saveFixture("eu5", observer),
  ]);
  await openListedSave(page, "debug-1.0.eu5");
  const modes = page.getByRole("navigation", { name: "Map modes" });
  await modes.getByRole("button", { name: "Religion", exact: true }).click();
  await page
    .getByRole("button", { name: /^Save \d+ of 2, show all saves$/ })
    .first()
    .click();
  const row = page.getByRole("listitem").filter({ has: page.getByText(observer, { exact: true }) });
  await expect(row).toContainText("This save is from another campaign");
  await row.getByRole("button", { name: "Open save" }).click();
  await expectEu5Date(page, 1617);
  await expect(modes.getByRole("button", { name: "Political", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectSaveIndex(page, 2, 2);
  await stepTimeline(page);
});

test("a visitor steps through uploaded EU4 saves and a local file takes precedence", async ({
  page,
  visitor,
}) => {
  await logIn(page);
  const uploads: string[] = [];
  for (const name of EU4_SAVES.slice(0, 2)) {
    const response = await page.request.post("/api/saves", {
      multipart: {
        file: {
          name,
          mimeType: "application/octet-stream",
          buffer: await readSaveFixture("eu4", name),
        },
        metadata: JSON.stringify({ aar: "", filename: name, content_type: "application/zip" }),
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    uploads.push((await response.json()).save_id);
  }
  await visitor.goto(`/eu4/saves/${uploads[0]}`);
  await expectSaveIndex(visitor, 1, 2);
  await visitor.keyboard.press("]");
  await expect(visitor).toHaveURL(`/eu4/saves/${uploads[1]}`);
  await expectSaveIndex(visitor, 2, 2);
  await stepTimeline(visitor);
  await visitor.keyboard.press("[");
  await expect(visitor).toHaveURL(`/eu4/saves/${uploads[0]}`);

  await openFiles(page, [await saveFixture("eu4", EU4_SAVES[0])]);
  await expectSaveIndex(page, 1, 2);
  await page.keyboard.press("]");
  await expect(page).toHaveURL(`/eu4/saves/${uploads[1]}`);
  await expectSaveIndex(page, 2, 2);
  await page.getByRole("button", { name: "Save 2 of 2, show all saves" }).click();
  const first = page
    .getByRole("listitem")
    .filter({ has: page.getByText(EU4_SAVES[0], { exact: true }) });
  await expect(first).toContainText("Local file, also uploaded");
  await first.getByRole("button", { name: "Open save" }).click();
  await expect(page).toHaveURL("/");
  await expectSaveIndex(page, 1, 2);
  await stepTimeline(page);
});

test("EU5 keeps the selection when it steps between an upload and a local save", async ({
  page,
}, info) => {
  const files = await eu5Files(info);
  await logIn(page);
  await openFiles(page, [files.first]);
  await page.getByRole("button", { name: "Share save", exact: true }).click();
  const permalink = page.getByRole("link", { name: "Open permalink" });
  await expect(permalink).toBeVisible({ timeout: 90_000 });
  const path = await permalink.getAttribute("href");
  expect(path).toMatch(/^\/eu5\/saves\/\w+$/);

  await openFiles(page, [files.later]);
  await expectEu5Date(page, 1338);
  await expectSaveIndex(page, 2, 2);
  await page.getByRole("button", { name: "Search countries or locations", exact: true }).click();
  await page.getByPlaceholder("Search countries or locations...").fill("FRA");
  await page.getByRole("option", { name: /FRA France/ }).click();
  const religion = page
    .getByRole("navigation", { name: "Map modes" })
    .getByRole("button", { name: "Religion", exact: true });
  await religion.click();
  await expect(religion).toHaveAttribute("aria-pressed", "true");
  await expectFranceSelection(page);

  await page.keyboard.press("[");
  await expect(page).toHaveURL(path!);
  await expectEu5Date(page, 1337);
  await expectSaveIndex(page, 1, 2);
  await expect(religion).toHaveAttribute("aria-pressed", "true");
  await expectFranceSelection(page);
  await page.keyboard.press("]");
  await expect(page).toHaveURL("/");
  await expectEu5Date(page, 1338);
  await expectSaveIndex(page, 2, 2);
  await expect(religion).toHaveAttribute("aria-pressed", "true");
  await expectFranceSelection(page);
});
