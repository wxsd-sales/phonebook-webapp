import { describe, expect, test } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyConfig, loadConfig } from "../../scripts/apply-config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const MANAGED_FILES = [
  "package.json",
  "README.md",
  "macros/main.js",
  "wizard/index.html",
  "webapp/index.html",
];

async function snapshot() {
  const entries = await Promise.all(
    MANAGED_FILES.map(async (file) => [
      file,
      await readFile(join(ROOT, file), "utf8"),
    ]),
  );
  return Object.fromEntries(entries);
}

describe("loadConfig", () => {
  test("derives Pages and repo URLs from org/repo", async () => {
    const cfg = await loadConfig();
    expect(cfg.pagesBaseUrl).toBe(`https://${cfg.org}.github.io/${cfg.repo}`);
    expect(cfg.wizardUrl).toBe(`${cfg.pagesBaseUrl}/wizard/`);
    expect(cfg.webappUrl).toBe(`${cfg.pagesBaseUrl}/webapp/`);
    expect(cfg.repoUrl).toBe(`https://github.com/${cfg.org}/${cfg.repo}`);
  });
});

describe("applyConfig", () => {
  test("is idempotent across managed files", async () => {
    // Normalise to the current config, then re-run and assert nothing changes.
    await applyConfig();
    const first = await snapshot();
    await applyConfig();
    const second = await snapshot();
    expect(second).toEqual(first);
  }, 20000);
});
