import { describe, expect, test } from "@jest/globals";
import { buildSnippet, injectConfig } from "../../wizard/snippet.js";

describe("buildSnippet", () => {
  test("emits CONFIG markers with JSON-encoded values", () => {
    const snippet = buildSnippet({
      name: "my-macro",
      webappUrl: "https://example.github.io/my-macro/webapp/",
      autoCloseSeconds: 45,
    });
    expect(snippet).toBe(
      [
        "// CONFIG:start",
        'const MACRO_NAME = "my-macro";',
        'const WEBAPP_URL = "https://example.github.io/my-macro/webapp/";',
        "const AUTO_CLOSE_SECONDS = 45;",
        "// CONFIG:end",
      ].join("\n"),
    );
  });

  test("safely encodes quotes in values", () => {
    const snippet = buildSnippet({ name: 'a"b', webappUrl: "" });
    expect(snippet).toContain('const MACRO_NAME = "a\\"b";');
  });

  test("defaults missing values to empty strings and auto-close to disabled", () => {
    const snippet = buildSnippet();
    expect(snippet).toContain('const MACRO_NAME = "";');
    expect(snippet).toContain("const AUTO_CLOSE_SECONDS = 0;");
  });

  test.each([0, -5, 1.5, "60", null, undefined, NaN])(
    "normalises a non-positive-integer autoCloseSeconds (%p) to 0",
    (autoCloseSeconds) => {
      expect(buildSnippet({ autoCloseSeconds })).toContain(
        "const AUTO_CLOSE_SECONDS = 0;",
      );
    },
  );
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
