import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import { startStaticServer } from "./lib/server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "assets");
const WIDTH = Number(process.env.SCREENSHOT_WIDTH) || 1280;
const HEIGHT = Number(process.env.SCREENSHOT_HEIGHT) || 800;

function isExecutable(candidate) {
  if (candidate.includes("/") || candidate.includes("\\")) {
    return existsSync(candidate);
  }
  const probe = spawnSync(platform() === "win32" ? "where" : "which", [
    candidate,
  ]);
  return probe.status === 0;
}

function resolveChrome() {
  if (process.env.CHROME_BIN) {
    if (isExecutable(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
    throw new Error(
      `CHROME_BIN is set but not executable: ${process.env.CHROME_BIN}`,
    );
  }

  const candidatesByPlatform = {
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ],
    linux: [
      "google-chrome",
      "google-chrome-stable",
      "chromium",
      "chromium-browser",
      "chrome",
    ],
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ],
  };

  const candidates = candidatesByPlatform[platform()] ?? [];
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
  }

  throw new Error(
    "Could not find a headless Chrome/Chromium binary. Install Google Chrome or set CHROME_BIN to its path.",
  );
}

function capture(chromeBin, url, outPath) {
  return new Promise((resolvePromise, reject) => {
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      `--window-size=${WIDTH},${HEIGHT}`,
      "--virtual-time-budget=2500",
      `--screenshot=${outPath}`,
      url,
    ];
    const child = spawn(chromeBin, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolvePromise()
        : reject(
            new Error(`Chrome exited with code ${code} while capturing ${url}`),
          ),
    );
  });
}

const chromeBin = resolveChrome();
mkdirSync(OUT_DIR, { recursive: true });

const targets = [{ path: "/wizard/", name: "wizard" }];
if (existsSync(join(ROOT, "webapp", "index.html"))) {
  targets.push({ path: "/webapp/", name: "webapp" });
}

// Force each theme via the "#theme=" hash so captures are deterministic and do
// not depend on the CI runner's OS colour-scheme preference.
const themes = ["light", "dark"];

const { url, close } = await startStaticServer({ root: ROOT, port: 0 });
try {
  for (const target of targets) {
    for (const theme of themes) {
      const outName = `${target.name}-${theme}.png`;
      const outPath = join(OUT_DIR, outName);
      await capture(chromeBin, `${url}${target.path}#theme=${theme}`, outPath);
      console.log(`Captured ${outName}`);
    }
  }
} finally {
  await close();
}
