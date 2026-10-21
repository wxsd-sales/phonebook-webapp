import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { injectConfig } from "../../wizard/snippet.js";

// Loads a copy of the macro with different CONFIG values (the real macro
// reads them from module-level constants, so they can't be changed at runtime).
const MACRO_SOURCE = readFileSync(
  new URL("../../macros/main.js", import.meta.url),
  "utf8",
);
// Kept inside the repo (gitignored) so the copies can resolve the "xapi"
// module mapping.
const tempDir = fileURLToPath(new URL("./.generated/", import.meta.url));
mkdirSync(tempDir, { recursive: true });
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));
let tempCount = 0;
async function importMacroWith(values) {
  const file = join(tempDir, `macro-${tempCount++}.mjs`);
  writeFileSync(file, injectConfig(MACRO_SOURCE, values));
  return import(file);
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("macros/main.js", () => {
  beforeEach(async () => {
    jest.resetModules();
    const { default: xapi } = await import("xapi");
    xapi.reset();
  });

  it("registers its home-screen panel on load", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID } = await import("../../macros/main.js");

    await new Promise((resolve) => setImmediate(resolve));

    expect(
      xapi.Command.UserInterface.Extensions.Panel.Save,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ PanelId: PANEL_ID }),
      expect.stringContaining("<Panel>"),
    );
  });

  it("ignores clicks from other panels", async () => {
    const { default: xapi } = await import("xapi");
    await import("../../macros/main.js");

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: "some-other-panel",
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(xapi.Command.UserInterface.WebView.Display).not.toHaveBeenCalled();
  });

  it("builds the WebView URL with autoClose/phonebookRoot hashes only when configured", async () => {
    const { WEBAPP_URL, buildWebAppUrl } = await import("../../macros/main.js");

    expect(buildWebAppUrl(0, "")).toBe(WEBAPP_URL);
    expect(buildWebAppUrl(45, "")).toBe(`${WEBAPP_URL}#autoClose=45`);
    expect(buildWebAppUrl(0, "https://xml.example.com/main.xml")).toBe(
      `${WEBAPP_URL}#phonebookRoot=https%3A%2F%2Fxml.example.com%2Fmain.xml`,
    );
    expect(buildWebAppUrl(45, "https://xml.example.com/main.xml")).toBe(
      `${WEBAPP_URL}#autoClose=45&phonebookRoot=https%3A%2F%2Fxml.example.com%2Fmain.xml`,
    );
  });

  it("opens the web app on the OSD when the click event carries no PeripheralId", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID } = await import("../../macros/main.js");

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: PANEL_ID,
      Origin: "OSD",
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(xapi.Command.UserInterface.WebView.Display).toHaveBeenCalledWith(
      expect.objectContaining({
        Target: "OSD",
        Url: expect.stringContaining("/webapp/"),
      }),
    );
  });

  it("opens the web app on the peripheral when the click event carries a PeripheralId", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID } = await import("../../macros/main.js");

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: PANEL_ID,
      Origin: "Controller",
      PeripheralId: "AA:BB:CC:DD:EE:FF",
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(xapi.Command.UserInterface.WebView.Display).toHaveBeenCalledWith(
      expect.objectContaining({
        PeripheralId: "AA:BB:CC:DD:EE:FF",
        Url: expect.stringContaining("/webapp/"),
      }),
    );
    expect(xapi.Command.UserInterface.WebView.Display).not.toHaveBeenCalledWith(
      expect.objectContaining({ Target: "OSD" }),
    );
  });

  describe("RoomOS version handling", () => {
    it("parses version strings in various formats", async () => {
      const { parseRoomOsVersion } = await import("../../macros/main.js");

      expect(parseRoomOsVersion("ce26.10.1.4.2a75dc140e6")).toEqual([
        26, 10, 1,
      ]);
      expect(parseRoomOsVersion("ce26.5.1.0.abcdef01234")).toEqual([26, 5, 1]);
      expect(parseRoomOsVersion("ce11.2.1.0.abc123")).toEqual([11, 2, 1]);
      expect(parseRoomOsVersion("RoomOS 11.27.3.0")).toEqual([11, 27, 3]);
      expect(parseRoomOsVersion("roomos-26.5")).toEqual([26, 5, 0]);
      expect(parseRoomOsVersion("26.5.1")).toEqual([26, 5, 1]);
      expect(parseRoomOsVersion("")).toBeNull();
      expect(parseRoomOsVersion("unknown")).toBeNull();
      expect(parseRoomOsVersion(undefined)).toBeNull();
      expect(parseRoomOsVersion(null)).toBeNull();
    });

    it("supports the peripheral target from 26.5.1 onwards only", async () => {
      const { supportsPeripheralTarget } = await import("../../macros/main.js");

      expect(supportsPeripheralTarget("ce26.5.1.0.abcdef01234")).toBe(true);
      expect(supportsPeripheralTarget("ce26.5.2.0.abcdef01234")).toBe(true);
      expect(supportsPeripheralTarget("ce26.6.0.0.abcdef01234")).toBe(true);
      expect(supportsPeripheralTarget("ce26.10.1.4.2a75dc140e6")).toBe(true);
      expect(supportsPeripheralTarget("ce27.1.0.0.abcdef01234")).toBe(true);
      expect(supportsPeripheralTarget("ce26.5.0.9.abcdef01234")).toBe(false);
      expect(supportsPeripheralTarget("ce26.4.9.0.abcdef01234")).toBe(false);
      expect(supportsPeripheralTarget("ce25.12.0.0.abcdef01234")).toBe(false);
      expect(supportsPeripheralTarget("ce11.27.3.0.abcdef01234")).toBe(false);
      expect(supportsPeripheralTarget("ce9.15.3.22.abcdef01234")).toBe(false);
      expect(supportsPeripheralTarget("26.5")).toBe(false);
    });

    it("treats unparseable or missing versions as current", async () => {
      const { supportsPeripheralTarget } = await import("../../macros/main.js");

      expect(supportsPeripheralTarget("unknown")).toBe(true);
      expect(supportsPeripheralTarget("")).toBe(true);
      expect(supportsPeripheralTarget(undefined)).toBe(true);
    });

    async function clickWithVersion(version, event) {
      const { default: xapi } = await import("xapi");
      const { PANEL_ID } = await import("../../macros/main.js");
      xapi.Status.SystemUnit.Software.Version.set(version);

      xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
        PanelId: PANEL_ID,
        ...event,
      });
      await tick();
      await tick();
      return xapi;
    }

    const peripheralClick = {
      Origin: "Controller",
      PeripheralId: "AA:BB:CC:DD:EE:FF",
    };

    it("uses the click Origin as the target below 26.5.1", async () => {
      const xapi = await clickWithVersion(
        "ce26.4.1.0.abcdef01234",
        peripheralClick,
      );

      const display = xapi.Command.UserInterface.WebView.Display;
      expect(display).toHaveBeenCalledWith(
        expect.objectContaining({ Target: "Controller" }),
      );
      expect(display).not.toHaveBeenCalledWith(
        expect.objectContaining({ PeripheralId: expect.anything() }),
      );
    });

    it.each(["ce26.5.1.0.abcdef01234", "ce26.10.1.4.2a75dc140e6"])(
      "uses the PeripheralId as the target on %s",
      async (version) => {
        const xapi = await clickWithVersion(version, peripheralClick);

        const display = xapi.Command.UserInterface.WebView.Display;
        expect(display).toHaveBeenCalledWith(
          expect.objectContaining({ PeripheralId: "AA:BB:CC:DD:EE:FF" }),
        );
        expect(display).not.toHaveBeenCalledWith(
          expect.objectContaining({ Target: expect.anything() }),
        );
      },
    );

    it("keeps using the PeripheralId when the version is unparseable", async () => {
      const xapi = await clickWithVersion("unknown", peripheralClick);

      expect(xapi.Command.UserInterface.WebView.Display).toHaveBeenCalledWith(
        expect.objectContaining({ PeripheralId: "AA:BB:CC:DD:EE:FF" }),
      );
    });

    it("keeps using OSD on old versions when there is no PeripheralId", async () => {
      const xapi = await clickWithVersion("ce11.2.1.0.abc123", {
        Origin: "OSD",
      });

      expect(xapi.Command.UserInterface.WebView.Display).toHaveBeenCalledWith(
        expect.objectContaining({ Target: "OSD" }),
      );
    });

    it("closes the Origin-targeted web view on old versions", async () => {
      const xapi = await clickWithVersion(
        "ce26.4.1.0.abcdef01234",
        peripheralClick,
      );
      const { WEBAPP_URL } = await import("../../macros/main.js");

      xapi.Status.UserInterface.WebView[1].Target.set("Controller");
      xapi.Status.UserInterface.WebView[1].URL.set(
        `${WEBAPP_URL}#command=exit`,
      );
      await tick();

      expect(xapi.Command.UserInterface.WebView.Clear).toHaveBeenCalledWith({
        Target: "Controller",
      });
    });
  });

  describe("OSD and controller web views open together", () => {
    const controllerClick = {
      Origin: "Controller",
      PeripheralId: "AA:BB:CC:DD:EE:FF",
    };

    async function openBoth(version = "ce26.10.1.4.2a75dc140e6") {
      const { default: xapi } = await import("xapi");
      const macro = await import("../../macros/main.js");
      xapi.Status.SystemUnit.Software.Version.set(version);
      for (const event of [{ Origin: "OSD" }, controllerClick]) {
        xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
          PanelId: macro.PANEL_ID,
          ...event,
        });
        await tick();
        await tick();
      }
      return { xapi, ...macro };
    }

    function exitOn(xapi, id, WEBAPP_URL, field, value) {
      xapi.Status.UserInterface.WebView[id][field].set(value);
      xapi.Status.UserInterface.WebView[id].URL.set(
        `${WEBAPP_URL}#command=exit`,
      );
      return tick();
    }

    it("exits each view independently, controller first then OSD", async () => {
      const { xapi, WEBAPP_URL } = await openBoth();
      const clear = xapi.Command.UserInterface.WebView.Clear;

      await exitOn(
        xapi,
        2,
        WEBAPP_URL,
        "PeripheralId",
        controllerClick.PeripheralId,
      );
      expect(clear).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenLastCalledWith({
        PeripheralId: controllerClick.PeripheralId,
      });

      await exitOn(xapi, 1, WEBAPP_URL, "Target", "OSD");
      expect(clear).toHaveBeenCalledTimes(2);
      expect(clear).toHaveBeenLastCalledWith({ Target: "OSD" });
    });

    it("exits each view independently, OSD first then controller", async () => {
      const { xapi, WEBAPP_URL } = await openBoth();
      const clear = xapi.Command.UserInterface.WebView.Clear;

      await exitOn(xapi, 1, WEBAPP_URL, "Target", "OSD");
      expect(clear).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenLastCalledWith({ Target: "OSD" });

      await exitOn(
        xapi,
        2,
        WEBAPP_URL,
        "PeripheralId",
        controllerClick.PeripheralId,
      );
      expect(clear).toHaveBeenCalledTimes(2);
      expect(clear).toHaveBeenLastCalledWith({
        PeripheralId: controllerClick.PeripheralId,
      });
    });

    it("keeps tracking the other view when one is cleared by the user", async () => {
      const { xapi, WEBAPP_URL } = await openBoth();
      const clear = xapi.Command.UserInterface.WebView.Clear;

      xapi.Event.UserInterface.WebView.Cleared.emit({ Target: "OSD" });

      await exitOn(
        xapi,
        2,
        WEBAPP_URL,
        "PeripheralId",
        controllerClick.PeripheralId,
      );
      expect(clear).toHaveBeenCalledWith({
        PeripheralId: controllerClick.PeripheralId,
      });
    });

    it("resolves the screen from the WebView status when an update only has id and URL", async () => {
      const { xapi, WEBAPP_URL, onWebViewChanged } = await openBoth();
      const clear = xapi.Command.UserInterface.WebView.Clear;
      xapi.Status.UserInterface.WebView[2].PeripheralId.set(
        controllerClick.PeripheralId,
      );

      await onWebViewChanged({ id: "2", URL: `${WEBAPP_URL}#command=exit` });

      expect(clear).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenCalledWith({
        PeripheralId: controllerClick.PeripheralId,
      });
    });

    it("tracks the OSD and an Origin-targeted controller separately on old versions", async () => {
      const { xapi, WEBAPP_URL } = await openBoth("ce26.4.1.0.abcdef01234");
      const clear = xapi.Command.UserInterface.WebView.Clear;

      await exitOn(xapi, 2, WEBAPP_URL, "Target", "Controller");
      expect(clear).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenLastCalledWith({ Target: "Controller" });

      await exitOn(xapi, 1, WEBAPP_URL, "Target", "OSD");
      expect(clear).toHaveBeenCalledTimes(2);
      expect(clear).toHaveBeenLastCalledWith({ Target: "OSD" });
    });
  });

  it("dials and closes the OSD web view after the dial-close delay", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID, WEBAPP_URL, DIAL_CLOSE_DELAY_MS } =
      await import("../../macros/main.js");

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: PANEL_ID,
      Origin: "OSD",
    });
    await new Promise((resolve) => setImmediate(resolve));

    xapi.Status.UserInterface.WebView[1].Target.set("OSD");
    xapi.Status.UserInterface.WebView[1].URL.set(
      `${WEBAPP_URL}#command=dial&number=1234`,
    );

    // The web app's "Dialing..." view gets a moment before anything happens.
    expect(xapi.Command.Dial).not.toHaveBeenCalled();
    expect(xapi.Command.UserInterface.WebView.Clear).not.toHaveBeenCalled();

    await new Promise((resolve) =>
      setTimeout(resolve, DIAL_CLOSE_DELAY_MS + 20),
    );

    expect(xapi.Command.Dial).toHaveBeenCalledWith({ Number: "1234" });
    expect(xapi.Command.UserInterface.WebView.Clear).toHaveBeenCalledWith({
      Target: "OSD",
    });
  });

  it("dials and closes the peripheral web view after the dial-close delay", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID, WEBAPP_URL, DIAL_CLOSE_DELAY_MS } =
      await import("../../macros/main.js");

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: PANEL_ID,
      Origin: "Controller",
      PeripheralId: "AA:BB:CC:DD:EE:FF",
    });
    await new Promise((resolve) => setImmediate(resolve));

    xapi.Status.UserInterface.WebView[1].PeripheralId.set("AA:BB:CC:DD:EE:FF");
    xapi.Status.UserInterface.WebView[1].URL.set(
      `${WEBAPP_URL}#command=dial&number=5678`,
    );

    expect(xapi.Command.Dial).not.toHaveBeenCalled();

    await new Promise((resolve) =>
      setTimeout(resolve, DIAL_CLOSE_DELAY_MS + 20),
    );

    expect(xapi.Command.Dial).toHaveBeenCalledWith({ Number: "5678" });
    expect(xapi.Command.UserInterface.WebView.Clear).toHaveBeenCalledWith({
      PeripheralId: "AA:BB:CC:DD:EE:FF",
    });
    jest.useRealTimers();
  });

  it("ignores web view URL updates that are not a dial request", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID, WEBAPP_URL } = await import("../../macros/main.js");

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: PANEL_ID,
      Origin: "OSD",
    });
    await new Promise((resolve) => setImmediate(resolve));

    xapi.Status.UserInterface.WebView[1].Target.set("OSD");
    xapi.Status.UserInterface.WebView[1].URL.set(
      `${WEBAPP_URL}#command=browse`,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(xapi.Command.Dial).not.toHaveBeenCalled();
    expect(xapi.Command.UserInterface.WebView.Clear).not.toHaveBeenCalled();
  });

  it("ignores web view URL updates from unrelated pages", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID } = await import("../../macros/main.js");

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: PANEL_ID,
      Origin: "OSD",
    });
    await new Promise((resolve) => setImmediate(resolve));

    xapi.Status.UserInterface.WebView[1].Target.set("OSD");
    xapi.Status.UserInterface.WebView[1].URL.set(
      "https://example.com/#command=dial&number=1234",
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(xapi.Command.Dial).not.toHaveBeenCalled();
  });

  it("closes the OSD web view without dialing when the URL reports exit", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID, WEBAPP_URL } = await import("../../macros/main.js");

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: PANEL_ID,
      Origin: "OSD",
    });
    await new Promise((resolve) => setImmediate(resolve));

    xapi.Status.UserInterface.WebView[1].Target.set("OSD");
    xapi.Status.UserInterface.WebView[1].URL.set(`${WEBAPP_URL}#command=exit`);
    await new Promise((resolve) => setImmediate(resolve));

    expect(xapi.Command.UserInterface.WebView.Clear).toHaveBeenCalledWith({
      Target: "OSD",
    });
    expect(xapi.Command.Dial).not.toHaveBeenCalled();
  });

  it("closes the peripheral web view without dialing when the URL reports exit", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID, WEBAPP_URL } = await import("../../macros/main.js");

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: PANEL_ID,
      Origin: "Controller",
      PeripheralId: "AA:BB:CC:DD:EE:FF",
    });
    await new Promise((resolve) => setImmediate(resolve));

    xapi.Status.UserInterface.WebView[1].PeripheralId.set("AA:BB:CC:DD:EE:FF");
    xapi.Status.UserInterface.WebView[1].URL.set(`${WEBAPP_URL}#command=exit`);
    await new Promise((resolve) => setImmediate(resolve));

    expect(xapi.Command.UserInterface.WebView.Clear).toHaveBeenCalledWith({
      PeripheralId: "AA:BB:CC:DD:EE:FF",
    });
    expect(xapi.Command.Dial).not.toHaveBeenCalled();
  });

  it("stops reacting once a directory web view is cleared", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID, WEBAPP_URL } = await import("../../macros/main.js");

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: PANEL_ID,
      Origin: "OSD",
    });
    await new Promise((resolve) => setImmediate(resolve));

    xapi.Event.UserInterface.WebView.Cleared.emit({ Target: "OSD" });

    xapi.Status.UserInterface.WebView[1].Target.set("OSD");
    xapi.Status.UserInterface.WebView[1].URL.set(
      `${WEBAPP_URL}#command=dial&number=1234`,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(xapi.Command.Dial).not.toHaveBeenCalled();
  });

  describe("insecure HTTPS", () => {
    const base = {
      name: "phonebook-webapp",
      buttonName: "Phone Book",
      buttonIcon: "Handset",
      buttonLocation: "HomeScreen",
    };

    it("does not touch the allow list or set AllowInsecureHttps by default", async () => {
      const { default: xapi } = await import("xapi");
      const { PANEL_ID } = await import("../../macros/main.js");
      await tick();

      xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
        PanelId: PANEL_ID,
        Origin: "OSD",
      });
      await tick();

      expect(
        xapi.Command.WebEngine.AllowInsecureHttps.Add,
      ).not.toHaveBeenCalled();
      const args = xapi.Command.UserInterface.WebView.Display.mock.calls[0][0];
      expect(args).not.toHaveProperty("AllowInsecureHttps");
    });

    it.each([
      ["an IP address", "https://10.1.2.3/phonebook/", "10.1.2.3"],
      [
        "an FQDN",
        "https://phonebook.example.com/app/",
        "phonebook.example.com",
      ],
      ["an IP with a port", "https://10.1.2.3:8443/", "10.1.2.3"],
    ])(
      "adds %s to the allow list and displays the web view with AllowInsecureHttps",
      async (_label, webappUrl, hostname) => {
        const { default: xapi } = await import("xapi");
        const { PANEL_ID } = await importMacroWith({
          ...base,
          webappUrl,
          allowInsecureHttps: true,
        });
        await tick();

        expect(
          xapi.Command.WebEngine.AllowInsecureHttps.Add,
        ).toHaveBeenCalledWith({ Hostname: hostname });
        expect(
          xapi.Command.UserInterface.Message.Alert.Display,
        ).not.toHaveBeenCalled();

        xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
          PanelId: PANEL_ID,
          Origin: "OSD",
        });
        await tick();

        expect(xapi.Command.UserInterface.WebView.Display).toHaveBeenCalledWith(
          expect.objectContaining({
            Url: expect.stringContaining(webappUrl),
            AllowInsecureHttps: "True",
          }),
        );
      },
    );

    it("shows an on-screen error and does not start when an https IP URL has insecure HTTPS disabled", async () => {
      const { default: xapi } = await import("xapi");
      await importMacroWith({
        ...base,
        webappUrl: "https://10.1.2.3/phonebook/",
        allowInsecureHttps: false,
      });
      await tick();

      expect(
        xapi.Command.UserInterface.Message.Alert.Display,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          Text: expect.stringContaining("will not function"),
        }),
      );
      expect(
        xapi.Command.UserInterface.Extensions.Panel.Save,
      ).not.toHaveBeenCalled();
      expect(
        xapi.Command.WebEngine.AllowInsecureHttps.Add,
      ).not.toHaveBeenCalled();
    });

    it.each([
      "https://phonebook.example.com/app/",
      "http://10.1.2.3/phonebook/",
    ])("starts normally without an error for %s", async (webappUrl) => {
      const { default: xapi } = await import("xapi");
      await importMacroWith({ ...base, webappUrl, allowInsecureHttps: false });
      await tick();

      expect(
        xapi.Command.UserInterface.Message.Alert.Display,
      ).not.toHaveBeenCalled();
      expect(
        xapi.Command.UserInterface.Extensions.Panel.Save,
      ).toHaveBeenCalled();
    });

    it("detects https IP URLs", async () => {
      const { needsInsecureHttps, getHostname, isIpAddress } =
        await import("../../macros/main.js");
      expect(needsInsecureHttps("https://192.168.1.10/webapp/")).toBe(true);
      expect(needsInsecureHttps("HTTPS://[fd00::1]:8443/webapp/")).toBe(true);
      expect(needsInsecureHttps("https://example.com/webapp/")).toBe(false);
      expect(needsInsecureHttps("http://192.168.1.10/webapp/")).toBe(false);
      expect(getHostname("https://user@host.example:8443/x?y#z")).toBe(
        "host.example",
      );
      expect(isIpAddress("10.0.0.1")).toBe(true);
      expect(isIpAddress("10.0.0.com")).toBe(false);
    });
  });
});
