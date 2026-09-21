import { chromium } from "/home/nick/projects/rl-web/node_modules/playwright/index.mjs";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3001";
const OUT = "/home/nick/projects/pdx-tools/src/app/.impeccable/review";
const SAVE = "/mnt/lian/tmp/SP_GRL_1341_03_08_e6afe2e6-59be-4639-af93-17887dfecc8a.eu5";
const sql = (q) =>
  execSync(`docker exec -u postgres pdx_dev-db-1 psql -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();

const browser = await chromium.launch({
  args: [
    "--enable-unsafe-webgpu",
    "--enable-features=Vulkan,UseSkiaRenderer",
    "--use-angle=swiftshader",
    "--ignore-gpu-blocklist",
    "--disable-gpu-sandbox",
  ],
});

async function newPage(viewport, { login } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "light" });
  await ctx.addInitScript(() => {
    delete window.showOpenFilePicker;
  });
  const page = await ctx.newPage();
  if (login) {
    await page.goto(`${BASE}/api/login/steam-callback?returnTo=/`, { waitUntil: "networkidle" });
  }
  return page;
}

async function loadSave(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.setInputFiles("#analyze-box-file-input", SAVE);
  await page.waitForSelector("[aria-label='Share save'], [aria-label='Copy the permalink']", { timeout: 120000 });
  await page.waitForTimeout(1500);
}

async function railShot(page, name) {
  const rail = page.locator("[aria-label='Share save'], [aria-label='Copy the permalink']").first();
  await rail.hover();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${name}-hover.png`, clip: { x: 0, y: page.viewportSize().height - 260, width: 420, height: 260 } });
  await rail.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-plate.png`, clip: { x: 0, y: page.viewportSize().height - 420, width: 520, height: 420 } });
}

const step = process.argv[2] ?? "all";

if (step === "all" || step === "share") {
  // Reset: the admin user is 100. Remove earlier EU5 saves so the share is fresh.
  sql("UPDATE users SET account='admin' WHERE user_id='100'");
  sql("DELETE FROM eu5_saves WHERE user_id='100'");
  const page = await newPage({ width: 1440, height: 900 }, { login: true });
  await loadSave(page);
  await railShot(page, "rail-ready");
  // commit the share
  await page.getByRole("button", { name: "Share save", exact: true }).last().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/rail-uploading.png`, clip: { x: 0, y: 640, width: 420, height: 260 } });
  await page.waitForSelector("[aria-label='Copy the permalink']", { timeout: 180000 });
  await page.waitForTimeout(300);
  await railShot(page, "rail-shared");
  await page.screenshot({ path: `${OUT}/eu5-shared-full.png` });
  await page.close();
}

if (step === "all" || step === "profile") {
  // Admin + owner view of their own page, desktop and mobile.
  const page = await newPage({ width: 1440, height: 900 }, { login: true });
  await page.goto(`${BASE}/users/100`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/desktop.png`, fullPage: true });
  // Hover a card action row and the delete dialog.
  await page.getByRole("button", { name: "Delete save" }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/desktop-delete.png` });
  await page.keyboard.press("Escape");
  await page.close();

  const mobile = await newPage({ width: 390, height: 844 }, { login: true });
  await mobile.goto(`${BASE}/users/100`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1500);
  await mobile.screenshot({ path: `${OUT}/mobile.png`, fullPage: true });
  await mobile.close();

  // Visitor (guest) view.
  const guest = await newPage({ width: 1440, height: 900 });
  await guest.goto(`${BASE}/users/100`, { waitUntil: "networkidle" });
  await guest.waitForTimeout(1000);
  await guest.screenshot({ path: `${OUT}/desktop-guest.png`, fullPage: true });
  await guest.close();

  // Dark mode owner view.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const dark = await ctx.newPage();
  await dark.goto(`${BASE}/api/login/steam-callback?returnTo=/users/100`, { waitUntil: "networkidle" });
  await dark.waitForTimeout(1500);
  await dark.screenshot({ path: `${OUT}/desktop-dark.png`, fullPage: true });
  await dark.close();
}

if (step === "all" || step === "gated") {
  // Closed beta: demote the dev user, re-login for a fresh cookie.
  sql("UPDATE users SET account='free', features='{}' WHERE user_id='100'");
  const page = await newPage({ width: 1440, height: 900 }, { login: true });
  await loadSave(page);
  await railShot(page, "rail-closed-beta");
  await page.close();
  sql("UPDATE users SET account='admin' WHERE user_id='100'");

  const guest = await newPage({ width: 1440, height: 900 });
  await loadSave(guest);
  await railShot(guest, "rail-guest");
  await guest.close();
}

if (step === "all" || step === "empty") {
  sql("INSERT INTO users (user_id, steam_id, steam_name, account) VALUES ('200','2000','fresh-player','free') ON CONFLICT DO NOTHING");
  const page = await newPage({ width: 1440, height: 900 }, { login: true });
  await page.goto(`${BASE}/users/200`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/desktop-empty-admin.png`, fullPage: true });
  await page.close();
  const guest = await newPage({ width: 1440, height: 900 });
  await guest.goto(`${BASE}/users/200`, { waitUntil: "networkidle" });
  await guest.waitForTimeout(800);
  await guest.screenshot({ path: `${OUT}/desktop-empty-guest.png`, fullPage: true });
  await guest.close();
}

await browser.close();

if (step === "owner-empty") {
  const b = await chromium.launch();
  // Park the dev user's saves on user 200 for the capture, then put them back.
  sql("UPDATE saves SET user_id='200' WHERE user_id='100'");
  sql("UPDATE eu5_saves SET user_id='200' WHERE user_id='100'");
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/api/login/steam-callback?returnTo=/users/100`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/desktop-empty-owner.png`, fullPage: true });
  } finally {
    sql("UPDATE saves SET user_id='100' WHERE user_id='200'");
    sql("UPDATE eu5_saves SET user_id='100' WHERE user_id='200'");
  }
  await b.close();
}
