/*
 * Collects the static web app files (and, optionally, the sample phonebook
 * directory) from the site the wizard is served from, ready to be zipped.
 */

// Files that make up the web app itself, relative to the web app folder.
const CORE_FILES = ["index.html", "phonebook.css", "phonebook.js"];

// index.html references the wizard's favicon one folder up; in the bundle
// it's shipped next to index.html instead.
const FAVICON_SOURCE = "../wizard/favicon.svg";
const FAVICON_PATH = "favicon.svg";
const SAMPLE_ROOT = "phonebook/main.xml";

async function fetchBytes(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

// Walks the sample directory starting at main.xml, following <MenuItem> URLs
// so the bundle never goes stale when sample files are added or renamed.
async function collectSampleFiles(webappBase) {
  const files = [];
  const seen = new Set();
  const samplesBase = new URL("phonebook/", webappBase).href;

  const visit = async (url) => {
    if (seen.has(url) || !url.startsWith(samplesBase)) return;
    seen.add(url);
    const data = await fetchBytes(url);
    files.push({ path: url.slice(webappBase.length), data });

    const doc = new DOMParser().parseFromString(
      new TextDecoder().decode(data),
      "application/xml",
    );
    for (const item of doc.querySelectorAll("MenuItem > URL")) {
      const href = item.textContent.trim();
      if (href) await visit(new URL(href, url).href);
    }
  };

  await visit(new URL(SAMPLE_ROOT, webappBase).href);
  return files;
}

/**
 * @param {string} webappBase absolute URL of the web app folder (trailing /)
 * @param {{ includeSamples: boolean }} options
 * @returns {Promise<{ path: string, data: Uint8Array }[]>}
 */
export async function collectWebappFiles(webappBase, { includeSamples }) {
  const encoder = new TextEncoder();
  const files = [];

  for (const path of CORE_FILES) {
    const data = await fetchBytes(new URL(path, webappBase).href);
    if (path === "index.html") {
      const html = new TextDecoder()
        .decode(data)
        .replaceAll(FAVICON_SOURCE, FAVICON_PATH);
      files.push({ path, data: encoder.encode(html) });
    } else {
      files.push({ path, data });
    }
  }
  files.push({
    path: FAVICON_PATH,
    data: await fetchBytes(new URL(FAVICON_SOURCE, webappBase).href),
  });

  if (includeSamples) {
    files.push(...(await collectSampleFiles(webappBase)));
  }
  return files;
}
