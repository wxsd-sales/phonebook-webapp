/*
 * Pure helpers shared by the wizard UI and the unit tests. Keeping these free
 * of DOM access means they can be imported directly in Node for testing and in
 * the browser as an ES module.
 */

export const CONFIG_START = "// CONFIG:start";
export const CONFIG_END = "// CONFIG:end";

/**
 * Normalises a value to a positive integer, or 0 (meaning "disabled") for
 * anything else - matches the "positive integers only" input constraint.
 */
function normalizeSeconds(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * The hostname (or IP) of an http(s) URL, or "" if the value isn't one.
 */
export function getHostname(url) {
  try {
    const parsed = new URL(String(url).trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.hostname
      : "";
  } catch {
    return "";
  }
}

export function isIpAddress(hostname) {
  return (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    (hostname.startsWith("[") && hostname.endsWith("]"))
  );
}

/**
 * An https:// web app URL addressed by IP can't present a certificate valid
 * for that address, so the macro must be told to allow insecure HTTPS.
 */
export function needsInsecureHttps(url) {
  return (
    String(url).trim().toLowerCase().startsWith("https://") &&
    isIpAddress(getHostname(url))
  );
}

/**
 * Build the CONFIG block (markers included) for the given values.
 */
export function buildSnippet({
  name = "",
  webappUrl = "",
  buttonName = "",
  buttonIcon = "",
  buttonLocation = "",
  phonebookRootUrl = "",
  autoCloseSeconds = 0,
  allowInsecureHttps = false,
} = {}) {
  return [
    CONFIG_START,
    `const BUTTON_NAME = ${JSON.stringify(buttonName)};`,
    `const BUTTON_ICON = ${JSON.stringify(buttonIcon)};`,
    `const BUTTON_LOCATION = ${JSON.stringify(buttonLocation)};`,
    `const MACRO_NAME = ${JSON.stringify(name)};`,
    `const WEBAPP_URL = ${JSON.stringify(webappUrl)};`,
    `const PHONEBOOK_ROOT_URL = ${JSON.stringify(phonebookRootUrl)};`,
    `const AUTO_CLOSE_SECONDS = ${normalizeSeconds(autoCloseSeconds)};`,
    `const ALLOW_INSECURE_HTTPS = ${allowInsecureHttps === true};`,
    CONFIG_END,
  ].join("\n");
}

/**
 * Replace the CONFIG block inside an existing macro source with fresh values,
 * preserving everything around the markers. Idempotent.
 */
export function injectConfig(source, values) {
  const startIdx = source.indexOf(CONFIG_START);
  const endIdx = source.indexOf(CONFIG_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(
      "Could not find the CONFIG:start / CONFIG:end markers in the macro source.",
    );
  }
  const before = source.slice(0, startIdx);
  const after = source.slice(endIdx + CONFIG_END.length);
  return `${before}${buildSnippet(values)}${after}`;
}
