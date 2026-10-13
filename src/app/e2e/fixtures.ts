import { test as base, expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { resetDb, saveFixture } from "../tests/support";

/** Use the file input because tests cannot operate the native file picker. */
async function newPlayerPage(browser: Browser) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Reflect.deleteProperty(window, "showOpenFilePicker");
  });
  const page = await context.newPage();
  return { context, page, errors: watchErrors(page) };
}

/** Collect page and worker errors; worker failures appear in the browser console. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().startsWith("Uncaught")) {
      errors.push(msg.text());
    }
  });
  return errors;
}

type Fixtures = {
  /** A second player, who is not logged in. */
  visitor: Page;
};

export const test = base.extend<Fixtures>({
  page: async ({ browser }, use) => {
    await resetDb();
    const { context, page, errors } = await newPlayerPage(browser);
    await use(page);
    await context.close();
    expect(errors, "uncaught errors in the page or its workers").toEqual([]);
  },

  visitor: async ({ browser }, use) => {
    const { context, page, errors } = await newPlayerPage(browser);
    await use(page);
    await context.close();
    expect(errors, "uncaught errors in the visitor's page or its workers").toEqual([]);
  },
});

export { expect };

/** Log in. In test builds, the Steam callback signs in an admin, user 100. */
export async function logIn(page: Page) {
  await page.goto("/api/login/steam-callback");
  await page.waitForURL("/");
}

/** Drop a save on the landing page. */
export async function openSave(page: Page, game: "eu4" | "eu5", name: string) {
  const file = await saveFixture(game, name);
  if (new URL(page.url()).pathname !== "/") {
    await page.goto("/");
  }
  await page.locator("#analyze-box-file-input").setInputFiles(file);
}

/** The timeline scrubber, which EU4 and EU5 share. */
export function campaignDate(page: Page) {
  return page.getByRole("slider", { name: "Campaign date" });
}

/** Click the visible icon because closed side panel labels are clipped. */
export async function clickSideBar(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).locator("svg").click();
}
