import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { test as base, expect, campaignDate, clickSideBar, logIn, openSave } from "./fixtures";
import { resetDb, saveFixture } from "../tests/support";

/**
 * The game folder is a directory of the origin private file system, which has
 * real handles and change records. Chromium cannot read its handles back from
 * IndexedDB in an incognito context, so the context has a profile on disk.
 */
const test = base.extend<{ player: BrowserContext; game: Page }>({
  player: async ({ baseURL }, use, info) => {
    await resetDb();
    const { launchOptions, viewport } = info.project.use;
    const player = await chromium.launchPersistentContext(info.outputPath("profile"), {
      ...launchOptions,
      viewport,
      baseURL,
    });
    await player.addInitScript(() => {
      const folder = async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle("save games", { create: true });
      window.showDirectoryPicker = folder;
      window.showOpenFilePicker = (async () => {
        const handles = [];
        for await (const handle of (await folder()).values()) {
          if (handle.kind === "file") handles.push(handle);
        }
        return handles;
      }) as typeof window.showOpenFilePicker;
    });
    await use(player);
    await player.close();
  },
  game: async ({ player }, use) => {
    const page = await player.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/saves/kept");
    await use(page);
    expect(errors, "uncaught errors in the page").toEqual([]);
  },
});

/** Write a file as the game does: into a swap file that replaces it. */
async function writeSave(page: Page, name: string, source: string) {
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "game-write";
    document.body.appendChild(input);
  });
  await page.locator("#game-write").setInputFiles(source);
  await page.evaluate(async (name) => {
    const input = document.querySelector<HTMLInputElement>("#game-write")!;
    const folder = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("save games", { create: true });
    const file = await folder.getFileHandle(name, { create: true });
    const stream = await file.createWritable();
    await stream.write(input.files![0]);
    await stream.close();
    input.remove();
  }, name);
}

/** The server compares the content of saves, so it refuses the same one again. */
async function expectUploaded(page: Page, source: string) {
  const name = path.basename(source);
  const response = await page.request.post("/api/saves", {
    multipart: {
      file: {
        name,
        mimeType: "application/octet-stream",
        buffer: await fs.readFile(source),
      },
      metadata: JSON.stringify({ aar: "", filename: name, content_type: "application/zip" }),
    },
  });
  expect(response.ok()).toBe(false);
  expect(await response.text()).toContain("save already exists");
}

const eu4 = (name: string) => saveFixture("eu4", name);

async function watchFromPage(page: Page, game: "EU4" | "EU5", { alsoKeep = true } = {}) {
  await page.getByRole("button", { name: `Choose ${game} folder` }).click();
  const dialog = page.getByRole("dialog");
  const keep = dialog.getByRole("checkbox", { name: /^Keep a copy of each new save/ });
  await expect(keep).not.toBeChecked();
  const also = dialog.getByRole("checkbox", { name: /^Also keep/ });
  await expect(also).toBeDisabled();
  await keep.check();
  if (alsoKeep) await also.check();
  await dialog.getByRole("button", { name: "Start watching" }).click();
  await expect(page.getByText("Watching “save games”, keeping copies")).toBeVisible();
}

const keptRow = (page: Page, date: string) =>
  page.getByRole("listitem").filter({ has: page.getByText(date, { exact: true }) });

const watchControl = (page: Page) => page.getByRole("group", { name: "Watch", exact: true });

async function openSaveFiles(page: Page) {
  await page.goto("/");
  // The section needs the client, so the page is ready for a click.
  await expect(page.getByRole("heading", { name: "Kept saves" })).toBeVisible();
  await page.getByRole("button", { name: /Choose file or drag and drop/ }).click();
}

async function expectEu4Date(page: Page, date: string) {
  await expect(campaignDate(page)).toHaveAttribute("aria-valuetext", new RegExp(date), {
    timeout: 90_000,
  });
}

test("EU4 keeps an overwritten save, which opens, uploads, and survives a reload", async ({
  game: page,
}) => {
  test.slow();
  await logIn(page);
  await writeSave(page, "ironman.eu4", await eu4("ita2.eu4"));
  await page.goto("/saves/kept");
  await watchFromPage(page, "EU4");
  await expect(keptRow(page, "1 July 1528")).toBeVisible();
  await openSaveFiles(page);
  await expectEu4Date(page, "1528 Jul 1");

  // Text keeps the map on this save.
  await clickSideBar(page, "Upload save");
  await page.getByRole("textbox", { name: "AAR" }).fill("Formed Italy");
  await writeSave(page, "ironman.eu4", await eu4("ita2_later13.eu4"));
  const latest = page.getByRole("button", { name: "Latest 1547 Mar 5" });
  await expect(latest).toBeVisible();
  await expectEu4Date(page, "1528 Jul 1");
  await expect(page.getByText("The game has written over ironman.eu4.")).toBeVisible();

  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const permalink = page.getByRole("link", { name: "Permalink" });
  await expect(permalink).toBeVisible({ timeout: 90_000 });
  await expectUploaded(page, await eu4("ita2.eu4"));
  await page.getByRole("textbox", { name: "AAR" }).fill("");
  await page.keyboard.press("Escape");

  // The closed sheet gives its focus back last.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await latest.focus();
  await page.keyboard.press("Enter");
  await expectEu4Date(page, "1547 Mar 5");
  await expect(page.getByRole("button", { name: "Save 2 of 2, show all saves" })).toBeFocused();
  await page.getByRole("button", { name: "Save 2 of 2, show all saves" }).click();
  const older = page.getByRole("listitem").filter({ hasText: "1528 Jul 1" });
  await expect(older).toContainText("The game has written over this file.");
  await expect(older.getByRole("link", { name: "Uploaded, open permalink" })).toBeVisible();

  // The dialog closes the list, so the focus goes to what opened the list.
  await older.getByRole("button", { name: /^Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Delete kept save" }).click();
  await expect(page.getByRole("dialog", { name: /^Delete 1 kept save/ })).toBeVisible();
  await page.keyboard.press("Escape");
  const list = page.getByRole("button", { name: "Save 2 of 2, show all saves" });
  await expect(list).toBeFocused();
  await list.click();
  await older.getByRole("button", { name: "Open save" }).click();
  await expectEu4Date(page, "1528 Jul 1");

  // The watch goes on, and does not take the player away from the older save.
  await writeSave(page, "manual.eu4", await eu4("ita2_later.eu4"));
  await expect(page.getByRole("button", { name: /Latest 1528 Aug 1/ })).toBeVisible();
  await expectEu4Date(page, "1528 Jul 1");

  await page.reload();
  await page.goto("/saves/kept");
  await expect(page.getByText(/^Watching “save games”/)).toBeVisible();
  const row = keptRow(page, "1 July 1528");
  await expect(row).toContainText("Written over by the game");
  await expect(row.getByRole("link", { name: "Uploaded, open permalink" })).toBeVisible();
  await row.getByRole("button", { name: "Open save" }).click();
  await expect(page).toHaveURL("/");
  await expectEu4Date(page, "1528 Jul 1");
  await expect(page.getByRole("button", { name: "Save 1 of 3, show all saves" })).toBeVisible();
});

test("EU4 uploads a kept save from its row", async ({ game: page }) => {
  await logIn(page);
  await writeSave(page, "ironman.eu4", await eu4("ita2.eu4"));
  await page.goto("/saves/kept");
  await watchFromPage(page, "EU4");
  await expect(keptRow(page, "1 July 1528")).toBeVisible();
  await writeSave(page, "ironman.eu4", await eu4("ita2_later13.eu4"));
  const row = keptRow(page, "1 July 1528");
  await expect(row).toContainText("Written over by the game");
  await row.getByRole("button", { name: /^Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Upload save" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Upload save" }).click();
  const link = row.getByRole("link", { name: "Uploaded, open permalink" });
  await expect(link).toBeVisible({ timeout: 90_000 });
  await expectUploaded(page, await eu4("ita2.eu4"));
});

test("EU4 follows the game on the same view", async ({ game: page }) => {
  const parsed: string[] = [];
  page.on("console", (message) => {
    const source = /Save parsed.*source: (\w+)/.exec(message.text())?.[1];
    if (source) parsed.push(source);
  });
  await writeSave(page, "ironman.eu4", await eu4("ita2.eu4"));
  await page.reload();
  await watchFromPage(page, "EU4");
  await openSaveFiles(page);
  await expectEu4Date(page, "1528 Jul 1");
  await clickSideBar(page, /^Watching, keeping copies/);
  await page.getByRole("button", { name: "Country ledger" }).click();
  const sheet = page.getByRole("dialog", { name: "Country ledger" });
  await expect(sheet.getByRole("button", { name: "Close" })).toBeFocused();
  const ledger = page.getByRole("table");
  await expect(ledger).toContainText("1528-07-01");
  await writeSave(page, "ironman.eu4", await eu4("ita2_later.eu4"));
  await expectEu4Date(page, "1528 Aug 1");
  await expect(ledger).toContainText("1528-07-01");
  await expect(ledger).toContainText("1528-08-01");
  // The copy and the update are not loads.
  expect(parsed).toEqual(["local", "watched"]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Watching, keeping copies/ })).toBeFocused();
});

test("kept saves stay out of a watch that the player started without them", async ({
  game: page,
}) => {
  await writeSave(page, "open.eu4", await eu4("ita2.eu4"));
  await page.reload();
  await watchFromPage(page, "EU4", { alsoKeep: false });
  await writeSave(page, "next.eu4", await eu4("ita2_later.eu4"));
  await expect(keptRow(page, "1 August 1528")).toBeVisible();
  await expect(keptRow(page, "1 July 1528")).toHaveCount(0);

  await page.getByRole("button", { name: "EU4 watch settings" }).click();
  await page.getByRole("menuitem", { name: "Stop keeping copies" }).click();
  await writeSave(page, "open.eu4", await eu4("ita2_later13.eu4"));
  await expect(page.getByText(/Last write 5 March 1547/)).toBeVisible();
  await expect(keptRow(page, "5 March 1547")).toHaveCount(0);
});

test("the limit, a range delete and a second tab", async ({ game: page, player }) => {
  const names = ["ita2.eu4", "ita2_later.eu4", "ita2_later13.eu4"];
  for (const name of names) await writeSave(page, name, await eu4(name));
  await page.reload();
  await watchFromPage(page, "EU4");
  await expect(keptRow(page, "5 March 1547")).toBeVisible();

  // A save that a tab has open stays.
  const other = await player.newPage();
  await other.goto("/saves/kept");
  await expect(other.getByText("Watching “save games” in another tab")).toBeVisible();
  await keptRow(other, "1 July 1528").getByRole("button", { name: "Open save" }).click();
  await expectEu4Date(other, "1528 Jul 1");

  // The notice opens the watch, and the click does not reach the map.
  await other.getByRole("button", { name: "Watching elsewhere" }).click();
  await expect(
    other.getByRole("dialog").getByRole("button", { name: "Watch in this tab" }),
  ).toBeVisible();
  await expect(other.getByRole("dialog")).toHaveCount(1);
  await other.keyboard.press("Escape");

  await keptRow(page, "5 March 1547").getByRole("checkbox").check();
  await keptRow(page, "1 July 1528")
    .getByRole("checkbox")
    .click({ modifiers: ["Shift"] });
  await expect(page.getByText(/^3 selected/)).toBeVisible();
  await page.getByRole("button", { name: "Delete 3 saves" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("1 open save is left out.");
  await dialog.getByRole("button", { name: "Delete 2 saves" }).click();
  await expect(keptRow(page, "5 March 1547")).toHaveCount(0);
  await expect(keptRow(page, "1 July 1528")).toBeVisible();

  // The limit is smaller than any choice of the page, to be reached by one save.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open("kept-saves");
        request.onsuccess = () => {
          const transaction = request.result.transaction("settings", "readwrite");
          const settings = transaction.objectStore("settings");
          settings.get("settings").onsuccess = (event) => {
            const { result } = event.target as IDBRequest;
            settings.put({ ...result, limit: 6e6 });
          };
          transaction.oncomplete = () => {
            request.result.close();
            resolve();
          };
        };
      }),
  );
  await writeSave(page, "ita2_later.eu4", await eu4("gra.eu4"));
  await expect(page.getByText("New saves are not being kept.")).toBeVisible();
  await expect(page).toHaveTitle(/^Not keeping - /);
  await page.getByRole("button", { name: "Raise to 2 GB" }).click();
  await expect(keptRow(page, "27 May 1463")).toBeVisible();
  await expect(page).not.toHaveTitle(/^Not keeping - /);
});

test("an older save stays when the game writes, also before any write was seen", async ({
  game: page,
}) => {
  await writeSave(page, "old.eu4", await eu4("ita2.eu4"));
  await writeSave(page, "new.eu4", await eu4("ita2_later.eu4"));
  await page.reload();
  await watchFromPage(page, "EU4", { alsoKeep: false });
  await page.evaluate(() => {
    const folder = window.showDirectoryPicker;
    window.showOpenFilePicker = (async () => [
      await (await folder()).getFileHandle("old.eu4"),
    ]) as unknown as typeof window.showOpenFilePicker;
  });
  await page.getByRole("link", { name: "PDX Tools" }).first().click();
  await expect(page.getByRole("heading", { name: "Kept saves" })).toBeVisible();
  await page.getByRole("button", { name: /Choose file or drag and drop/ }).click();
  await expectEu4Date(page, "1528 Jul 1");
  await writeSave(page, "new.eu4", await eu4("ita2_later13.eu4"));
  await expect(page.getByRole("button", { name: "Latest 1547 Mar 5" })).toBeVisible();
  // Longer than a follow waits for the player.
  await page.waitForTimeout(3000);
  await expectEu4Date(page, "1528 Jul 1");
});

test("the map follows its campaign when another campaign has a newer file", async ({
  game: page,
}) => {
  await writeSave(page, "italy.eu4", await eu4("ita2.eu4"));
  await writeSave(page, "granada.eu4", await eu4("gra.eu4"));
  await page.reload();
  await watchFromPage(page, "EU4", { alsoKeep: false });
  await page.evaluate(() => {
    const folder = window.showDirectoryPicker;
    window.showOpenFilePicker = (async () => [
      await (await folder()).getFileHandle("italy.eu4"),
    ]) as unknown as typeof window.showOpenFilePicker;
  });
  await page.getByRole("link", { name: "PDX Tools" }).first().click();
  await expect(page.getByRole("heading", { name: "Kept saves" })).toBeVisible();
  await page.getByRole("button", { name: /Choose file or drag and drop/ }).click();
  await expectEu4Date(page, "1528 Jul 1");
  await writeSave(page, "italy.eu4", await eu4("ita2_later.eu4"));
  await expectEu4Date(page, "1528 Aug 1");
});

test("a tab that waits for the permission follows a stop in another tab", async ({
  game: page,
  player,
}) => {
  await writeSave(page, "ita2.eu4", await eu4("ita2.eu4"));
  await page.reload();
  await watchFromPage(page, "EU4");
  const other = await player.newPage();
  await other.addInitScript(() => {
    const handle = FileSystemHandle.prototype as unknown as Record<string, unknown>;
    handle.queryPermission = async () => "prompt";
  });
  await other.goto("/saves/kept");
  await keptRow(other, "1 July 1528").getByRole("button", { name: "Open save" }).click();
  await expectEu4Date(other, "1528 Jul 1");
  // The page under the map has the same button.
  const resume = other.locator("[data-watch-notice]", { hasText: "Resume watching" });
  const button = other.locator("#eu4-watch");
  await expect(resume).toBeVisible();
  const [chip, icon] = [(await resume.boundingBox())!, (await button.boundingBox())!];
  expect(chip.y + chip.height / 2).toBeCloseTo(icon.y + icon.height / 2, 0);
  await page.getByRole("button", { name: "Stop watching" }).click();
  await expect(resume).toHaveCount(0);
});

test("a second tab changes the folder and opens a write that has no copy", async ({
  game: page,
  player,
}) => {
  test.slow();
  await writeSave(page, "a.eu4", await eu4("ita2.eu4"));
  await writeSave(page, "b.eu4", await eu4("ita2_later.eu4"));
  await page.reload();
  await watchFromPage(page, "EU4", { alsoKeep: false });
  const other = await player.newPage();
  await other.goto("/saves/kept");
  await expect(other.getByText("Watching “save games” in another tab")).toBeVisible();
  await other.getByRole("button", { name: "EU4 watch settings" }).click();
  await other.getByRole("menuitem", { name: "Change folder" }).click();
  const dialog = other.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: /^Keep a copy of each new save/ }).check();
  await dialog.getByRole("button", { name: "Start watching" }).click();
  await expect(other.getByRole("button", { name: "EU4 watch settings" })).toBeFocused();
  // The excluded files stay excluded, whichever tab watches.
  await writeSave(page, "c.eu4", await eu4("gra.eu4"));
  await expect(keptRow(page, "27 May 1463")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open save" })).toHaveCount(1);

  await page.getByRole("button", { name: "EU4 watch settings" }).click();
  await page.getByRole("menuitem", { name: "Stop keeping copies" }).click();
  const waiting = (tab: Page) => tab.getByText("in another tab").count();
  await expect.poll(async () => (await waiting(page)) + (await waiting(other))).toBe(1);
  const viewer = (await waiting(page)) === 1 ? page : other;
  await viewer.evaluate(() => {
    const folder = window.showDirectoryPicker;
    window.showOpenFilePicker = (async () => [
      await (await folder()).getFileHandle("b.eu4"),
    ]) as unknown as typeof window.showOpenFilePicker;
  });
  await viewer.getByRole("link", { name: "PDX Tools" }).first().click();
  await viewer.getByRole("button", { name: /Choose file or drag and drop/ }).click();
  await expectEu4Date(viewer, "1528 Aug 1");
  await writeSave(viewer, "b.eu4", await eu4("ita2_later13.eu4"));
  // The bytes come from the tab that watches.
  await expectEu4Date(viewer, "1547 Mar 5");
});

test("/saves/kept renders on the server", async ({ request }) => {
  const html = await (await request.get("/saves/kept")).text();
  expect(html).toContain("Kept saves");
});

test("a browser without folder access keeps its views", async ({ page }) => {
  await page.addInitScript(() => Reflect.deleteProperty(window, "FileSystemObserver"));
  await page.goto("/saves/kept");
  await expect(page.getByText("This browser cannot watch folders or keep copies.")).toBeVisible();

  await openSave(page, "eu4", "ita2.eu4");
  await expectEu4Date(page, "1528 Jul 1");
  await clickSideBar(page, "Watch save");
  await expect(page.getByText("This browser cannot watch folders or keep copies.")).toBeVisible();
});

test("EU5 loads the next save, and Back returns to the one on screen", async ({
  game: page,
}, info) => {
  test.slow();
  const first = await saveFixture("eu5", "debug-1.0.eu5");
  const data = await fs.readFile(first);
  data.write("date=1338.4.1", data.indexOf("date=1337.4.1"));
  const later = info.outputPath("later.eu5");
  await fs.writeFile(later, data);
  await writeSave(page, "autosave.eu5", first);
  await page.reload();
  await watchFromPage(page, "EU5");
  await expect(keptRow(page, "1 April 1337")).toBeVisible({ timeout: 60_000 });
  await openSaveFiles(page);
  await expect(page.getByRole("navigation", { name: "Map modes" })).toBeVisible();
  const header = page.locator("header").filter({
    has: page.getByRole("link", { name: "Return to home" }),
  });
  // The load can end before a click, so hold its call to the worker.
  await page.evaluate(() => {
    const { postMessage } = Worker.prototype;
    Worker.prototype.postMessage = function (this: Worker, ...args: [unknown]) {
      const [message] = args as [{ path?: string[] }];
      const send = () => postMessage.apply(this, args);
      if (!message?.path?.includes("loadSave")) return send();
      Worker.prototype.postMessage = postMessage;
      window.addEventListener("release-load", send, { once: true });
    } as Worker["postMessage"];
  });
  await writeSave(page, "autosave.eu5", later);
  const control = watchControl(page);
  const back = control.getByRole("button", { name: /^Back to 1337 Apr 1/ });
  await back.click({ timeout: 60_000 });
  await expect(control.getByRole("button", { name: "Going back" })).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("release-load")));
  const latest = control.getByRole("button", { name: "Latest 1338 Apr 1" });
  await expect(latest).toBeVisible({ timeout: 90_000 });
  await expect(header).toContainText(/1337\s*Apr 1/);
  await latest.click();
  await expect(header).toContainText(/1338\s*Apr 1/, { timeout: 90_000 });
});
