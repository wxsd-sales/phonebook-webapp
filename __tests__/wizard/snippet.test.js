import { describe, expect, test } from "@jest/globals";
import { buildSnippet, injectConfig } from "../../wizard/snippet.js";

describe("buildSnippet", () => {
  test("emits CONFIG markers with JSON-encoded values", () => {
    const snippet = buildSnippet({
      name: "my-macro",
      webappUrl: "https://example.github.io/my-macro/webapp/",
    });
    expect(snippet).toBe(
      [
        "// CONFIG:start",
        'const MACRO_NAME = "my-macro";',
        'const WEBAPP_URL = "https://example.github.io/my-macro/webapp/";',
        "// CONFIG:end",
      ].join("\n"),
    );
  });

  test("safely encodes quotes in values", () => {
    const snippet = buildSnippet({ name: 'a"b', webappUrl: "" });
    expect(snippet).toContain('const MACRO_NAME = "a\\"b";');
  });

  test("defaults missing values to empty strings", () => {
    expect(buildSnippet()).toContain('const MACRO_NAME = "";');
  });
});

describe("injectConfig", () => {
  const macro = [
    'import xapi from "xapi";',
    "// CONFIG:start",
    'const MACRO_NAME = "old";',
    'const WEBAPP_URL = "old";',
    "// CONFIG:end",
    "init();",
    "",
  ].join("\n");

  test("replaces the block and preserves surrounding code", () => {
    const next = injectConfig(macro, {
      name: "new",
      webappUrl: "https://new/",
    });
    expect(next).toContain('const MACRO_NAME = "new";');
    expect(next.startsWith('import xapi from "xapi";')).toBe(true);
    expect(next.trimEnd().endsWith("init();")).toBe(true);
  });

  test("is idempotent", () => {
    const values = { name: "new", webappUrl: "https://new/" };
    const once = injectConfig(macro, values);
    const twice = injectConfig(once, values);
    expect(twice).toBe(once);
  });

  test("throws when the markers are missing", () => {
    expect(() => injectConfig("no markers here", { name: "x" })).toThrow();
  });
});
