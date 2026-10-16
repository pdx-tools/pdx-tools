// Captures the control panel foot (View / Share / Export rows) in every share state.
import { chromium } from "/home/nick/projects/rl-web/node_modules/playwright/index.mjs";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3001";
const OUT = "/home/nick/projects/pdx-tools/src/app/.impeccable/review";
const SAVE = "/mnt/lian/tmp/SP_GRL_1341_03_08_e6afe2e6-59be-4639-af93-17887dfecc8a.eu5";
const sql = (q) =>
  execSync(`docker exec -u postgres pdx_dev-db-1 psql -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();

const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,UseSkiaRenderer", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--disable-gpu-sandbox"],
});

async function newPage(viewport, { login } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "light" });
  await ctx.addInitScript(() => { delete window.showOpenFilePicker; });
  const page = await ctx.newPage();
  if (login) await page.goto(`${BASE}/api/login/steam-callback?returnTo=/`, { waitUntil: "networkidle" });
  return page;
}

async function loadSave(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.setInputFiles("#analyze-box-file-input", SAVE);
  await page.waitForSelector("text=Export", { timeout: 120000 });
  await page.waitForTimeout(1500);
}

const foot = (page) => ({ x: 0, y: page.viewportSize().height - 200, width: 332, height: 200 });
const shot = (page, name) => page.screenshot({ path: `${OUT}/foot-${name}.png`, clip: foot(page) });

const step = process.argv[2] ?? "all";

if (step === "all" || step === "share") {
  sql("UPDATE users SET account='admin' WHERE user_id='100'");
  sql("DELETE FROM eu5_saves WHERE user_id='100'");
  const page = await newPage({ width: 1440, height: 900 }, { login: true });
  await loadSave(page);
  await shot(page, "ready");
  const box = await page.getByRole("button", { name: "Screenshot", exact: true }).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  await shot(page, "export-hover");
  await page.mouse.move(160, 500, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Share save" }).click();
  await page.waitForTimeout(700);
  await shot(page, "uploading-1");
  await page.waitForTimeout(2500);
  await shot(page, "uploading-2");
  await page.waitForSelector("text=Copy link", { timeout: 180000 });
  console.log("landed animation:", await page.evaluate(() => getComputedStyle(document.querySelector("button:has(+ *), span").closest("div")).animationName));
  console.log("row animation:", await page.evaluate(() => [...document.querySelectorAll("div")].filter((d) => d.textContent.startsWith("ShareShared")).map((d) => getComputedStyle(d).animationName)));
  await shot(page, "landed");
  await page.waitForTimeout(1200);
  await shot(page, "shared");
  await page.getByRole("button", { name: "Copy link" }).click();
  await page.waitForTimeout(300);
  await shot(page, "copied");
  await page.screenshot({ path: `${OUT}/eu5-shared-full.png` });
  await page.close();
}

if (step === "all" || step === "gated") {
  sql("UPDATE users SET account='free', features='{}' WHERE user_id='100'");
  const page = await newPage({ width: 1440, height: 900 }, { login: true });
  await loadSave(page);
  await shot(page, "closed-beta");
  const help = await page.getByText("Closed beta").boundingBox();
  await page.mouse.move(help.x + help.width / 2, help.y + help.height / 2);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/foot-closed-beta-help.png`, clip: { x: 0, y: 900 - 300, width: 420, height: 300 } });
  await page.close();
  sql("UPDATE users SET account='admin' WHERE user_id='100'");

  const guest = await newPage({ width: 1440, height: 900 });
  await loadSave(guest);
  await shot(guest, "guest");
  await guest.close();
}

await browser.close();
