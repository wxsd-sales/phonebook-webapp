import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyConfig } from "./apply-config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(ROOT, "project.config.json");

function detectOrgRepo() {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
    }).trim();
    const match = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/i);
    if (match) return { org: match[1], repo: match[2] };
  } catch {
    // No git remote configured yet; fall back to existing config defaults.
  }
  return {};
}

function toKebabCase(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const current = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const detected = detectOrgRepo();

const rl = createInterface({ input: stdin, output: stdout });

async function ask(label, fallback) {
  const suffix = fallback ? ` (${fallback})` : "";
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || fallback || "";
}

console.log(
  "Configure this macro template. Press Enter to accept the default.\n",
);

const name = toKebabCase(await ask("Project name (kebab-case)", current.name));
const title = await ask("Display title", current.title);
const description = await ask("Description", current.description);
const author = await ask("Author", current.author);
const org = await ask("GitHub org/user", detected.org || current.org);
const repo = toKebabCase(
  await ask("GitHub repo", detected.repo || current.repo || name),
);
const webappAnswer = await ask(
  "Include advanced web app? (y/n)",
  current.webapp !== false ? "y" : "n",
);

rl.close();

const config = {
  $schema: current.$schema ?? "./project.config.schema.json",
  name,
  title,
  description,
  author,
  org,
  repo,
  webapp: /^y(es)?$/i.test(webappAnswer),
};

await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
console.log("\nSaved project.config.json.\n");

await applyConfig();

console.log("\nSetup complete. Review the changes and commit when ready.");
