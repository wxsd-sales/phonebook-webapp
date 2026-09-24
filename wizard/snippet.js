/*
 * Pure helpers shared by the wizard UI and the unit tests. Keeping these free
 * of DOM access means they can be imported directly in Node for testing and in
 * the browser as an ES module.
 */

export const CONFIG_START = "// CONFIG:start";
export const CONFIG_END = "// CONFIG:end";

/**
 * Build the CONFIG block (markers included) for the given values.
 */
export function buildSnippet({ name = "", webappUrl = "" } = {}) {
  return [
    CONFIG_START,
    `const MACRO_NAME = ${JSON.stringify(name)};`,
    `const WEBAPP_URL = ${JSON.stringify(webappUrl)};`,
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
