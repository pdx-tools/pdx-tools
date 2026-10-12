import { test as base, expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { resetDb, saveFixture } from "../tests/support";

/**
 * Open a page like a player does. The landing page uses the file input
 * only when the File System Access API is absent, and a test cannot drive
 * the native picker.
 */
async function newPlayerPage(browser: Browser) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Reflect.deleteProperty(window, "showOpenFilePicker");
  });
  const page = await context.newPage();
  return { context, page, errors: watchErrors(page) };
}

/**
 * Collect uncaught errors from the page and its workers. A worker error
 * reaches the page console as "Uncaught ...", not as a page error.
 */
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

/**
 * Click the icon of an EU4 side bar button, as a player does. The closed
 * side bar shows only the icons. The label of each button is clipped, and
 * the map canvas gets clicks at the center of the button.
 */
export async function clickSideBar(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).locator("svg").click();
}
