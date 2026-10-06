import { describe, expect, test } from "@jest/globals";
import {
  buildSnippet,
  getHostname,
  injectConfig,
  isIpAddress,
  needsInsecureHttps,
} from "../../wizard/snippet.js";

describe("buildSnippet", () => {
  test("emits CONFIG markers with JSON-encoded values", () => {
    const snippet = buildSnippet({
      name: "my-macro",
      webappUrl: "https://example.github.io/my-macro/webapp/",
      buttonName: "Phone Book",
      buttonIcon: "Handset",
      buttonLocation: "HomeScreen",
      phonebookRootUrl: "https://xml.example.com/main.xml",
      autoCloseSeconds: 45,
      allowInsecureHttps: true,
    });
    expect(snippet).toBe(
      [
        "// CONFIG:start",
        'const BUTTON_NAME = "Phone Book";',
        'const BUTTON_ICON = "Handset";',
        'const BUTTON_LOCATION = "HomeScreen";',
        'const MACRO_NAME = "my-macro";',
        'const WEBAPP_URL = "https://example.github.io/my-macro/webapp/";',
        'const PHONEBOOK_ROOT_URL = "https://xml.example.com/main.xml";',
        "const AUTO_CLOSE_SECONDS = 45;",
        "const ALLOW_INSECURE_HTTPS = true;",
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
    expect(snippet).toContain('const BUTTON_NAME = "";');
    expect(snippet).toContain('const BUTTON_ICON = "";');
    expect(snippet).toContain('const BUTTON_LOCATION = "";');
    expect(snippet).toContain('const PHONEBOOK_ROOT_URL = "";');
    expect(snippet).toContain("const AUTO_CLOSE_SECONDS = 0;");
    expect(snippet).toContain("const ALLOW_INSECURE_HTTPS = false;");
  });

  test.each(["true", 1, null])(
    "only an actual true enables ALLOW_INSECURE_HTTPS (%p)",
    (allowInsecureHttps) => {
      expect(buildSnippet({ allowInsecureHttps })).toContain(
        "const ALLOW_INSECURE_HTTPS = false;",
      );
    },
  );

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

describe("needsInsecureHttps", () => {
  test.each([
    ["https://10.0.0.5/phonebook/", true],
    ["HTTPS://192.168.1.2:8443/", true],
    ["https://[fd00::1]/", true],
    ["https://phonebook.example.com/", false],
    ["http://10.0.0.5/phonebook/", false],
    ["", false],
    ["not a url", false],
  ])("%s -> %s", (url, expected) => {
    expect(needsInsecureHttps(url)).toBe(expected);
  });

  test("getHostname / isIpAddress", () => {
    expect(getHostname("https://host.example:8443/x")).toBe("host.example");
    expect(getHostname("ftp://host.example/")).toBe("");
    expect(isIpAddress("10.0.0.1")).toBe(true);
    expect(isIpAddress("host.example")).toBe(false);
  });
});
