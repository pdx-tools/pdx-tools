import { chromium } from "/home/nick/projects/rl-web/node_modules/playwright/index.mjs";
const b = await chromium.launch({ args: ["--enable-unsafe-webgpu","--use-angle=swiftshader","--ignore-gpu-blocklist","--disable-gpu-sandbox"] });
const p = await b.newPage({ viewport: { width: 1280, height: 640 } });
await p.goto(`http://localhost:3001/eu5/saves/${process.argv[2]}`, { waitUntil: "networkidle" });
await p.waitForSelector("[aria-label='Copy the permalink']", { timeout: 120000 });
await p.waitForTimeout(1500);
console.log(await p.evaluate(() => JSON.stringify({ scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, inner: innerWidth, scrollH: document.documentElement.scrollHeight })));
await b.close();
