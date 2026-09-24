import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Load and validate project.config.json, returning the config plus derived URLs.
 */
export async function loadConfig() {
  const configPath = join(ROOT, "project.config.json");
  const raw = JSON.parse(await readFile(configPath, "utf8"));

  const required = ["name", "title", "org", "repo"];
  for (const key of required) {
    if (!raw[key] || typeof raw[key] !== "string") {
      throw new Error(
        `project.config.json: "${key}" is required and must be a non-empty string.`,
      );
    }
  }

  const pagesBaseUrl = `https://${raw.org}.github.io/${raw.repo}`;
  return {
    ...raw,
    author: raw.author ?? "",
    description: raw.description ?? "",
    webapp: raw.webapp !== false,
    pagesBaseUrl,
    wizardUrl: `${pagesBaseUrl}/wizard/`,
    webappUrl: `${pagesBaseUrl}/webapp/`,
    repoUrl: `https://github.com/${raw.org}/${raw.repo}`,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Replace the text between two markers (markers preserved). Idempotent.
 */
function replaceBetween(content, startMarker, endMarker, inner) {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { content, replaced: false };
  }
  const before = content.slice(0, startIdx + startMarker.length);
  const after = content.slice(endIdx);
  return { content: `${before}\n${inner}\n${after}`, replaced: true };
}

/**
 * Recursively list every *.js file under a directory (returns absolute paths).
 */
async function listJsFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listJsFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

async function updateFile(relPath, transform) {
  const filePath = join(ROOT, relPath);
  if (!existsSync(filePath)) return false;
  const original = await readFile(filePath, "utf8");
  const updated = transform(original);
  if (updated !== original) {
    await writeFile(filePath, updated);
    console.log(`  updated ${relPath}`);
    return true;
  }
  return false;
}

function appConfigFile(cfg) {
  const value = {
    name: cfg.name,
    title: cfg.title,
    pagesBaseUrl: cfg.pagesBaseUrl,
    wizardUrl: cfg.wizardUrl,
    webappUrl: cfg.webappUrl,
    repoUrl: cfg.repoUrl,
  };
  // A standalone, prettier-ignored file so generated JSON never fights the
  // formatter over key quoting or indentation inside index.html.
  return [
    "// Generated from project.config.json by scripts/apply-config.mjs - do not edit.",
    `window.APP_CONFIG = ${JSON.stringify(value, null, 2)};`,
    "",
  ].join("\n");
}

async function writeGenerated(relPath, content) {
  const filePath = join(ROOT, relPath);
  let original = null;
  try {
    original = await readFile(filePath, "utf8");
  } catch {
    // File does not exist yet; it will be created below.
  }
  if (original !== content) {
    await writeFile(filePath, content);
    console.log(`  wrote ${relPath}`);
  }
}

export async function applyConfig() {
  const cfg = await loadConfig();
  console.log(`Applying project.config.json (${cfg.name})`);

  // package.json
  await updateFile("package.json", (content) => {
    const pkg = JSON.parse(content);
    pkg.name = cfg.name;
    pkg.description = cfg.description;
    pkg.author = cfg.author;
    return JSON.stringify(pkg, null, 2) + "\n";
  });

  // Static apps: rewrite <title> in place and (re)generate app-config.js. The
  // HTML stays formatter-owned; only the generated JS carries derived values.
  for (const dir of ["wizard", "webapp"]) {
    if (!existsSync(join(ROOT, dir))) continue;
    await updateFile(`${dir}/index.html`, (content) =>
      content.replace(
        /<title>[\s\S]*?<\/title>/,
        `<title>${escapeHtml(cfg.title)}</title>`,
      ),
    );
    await writeGenerated(`${dir}/app-config.js`, appConfigFile(cfg));
  }

  // Macros: every *.js under macros/ that carries the CONFIG markers.
  const macroInner = [
    `const MACRO_NAME = ${JSON.stringify(cfg.name)};`,
    `const WEBAPP_URL = ${JSON.stringify(cfg.webappUrl)};`,
  ].join("\n");
  for (const filePath of await listJsFiles(join(ROOT, "macros"))) {
    await updateFile(relative(ROOT, filePath), (content) => {
      if (!content.includes("// CONFIG:start")) return content;
      return replaceBetween(
        content,
        "// CONFIG:start",
        "// CONFIG:end",
        macroInner,
      ).content;
    });
  }

  // README: title, description, and URLs. The inner content is padded with the
  // blank lines Prettier expects around Markdown headings/lists so the result
  // is a fixed point of both `apply-config` and `prettier`.
  await updateFile("README.md", (content) => {
    let next = replaceBetween(
      content,
      "<!-- title:start -->",
      "<!-- title:end -->",
      `\n# ${cfg.title}\n`,
    ).content;
    next = replaceBetween(
      next,
      "<!-- description:start -->",
      "<!-- description:end -->",
      `\n${cfg.description}`,
    ).content;
    const urls = [
      `- Wizard: ${cfg.wizardUrl}`,
      cfg.webapp ? `- Web app: ${cfg.webappUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    next = replaceBetween(
      next,
      "<!-- urls:start -->",
      "<!-- urls:end -->",
      `\n${urls}\n`,
    ).content;
    // Set the repo name in the Questions section mailto subject. Matches the
    // current value so it stays re-runnable if the repo is renamed later.
    next = next.replace(
      /(mailto:wxsd@external\.cisco\.com\?subject=)[^")\s]*/g,
      `$1${encodeURIComponent(cfg.repo)}`,
    );
    return next;
  });

  console.log("Done.");
  return cfg;
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  applyConfig().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
