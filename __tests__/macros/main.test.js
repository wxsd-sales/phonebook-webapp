import { beforeEach, describe, expect, it, jest } from "@jest/globals";

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

  it("dials and closes the OSD web view when the URL reports a dial hash", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID, WEBAPP_URL } = await import("../../macros/main.js");

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: PANEL_ID,
      Origin: "OSD",
    });
    await new Promise((resolve) => setImmediate(resolve));

    xapi.Status.UserInterface.WebView[1].Target.set("OSD");
    xapi.Status.UserInterface.WebView[1].URL.set(
      `${WEBAPP_URL}#command=dial&number=1234`,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(xapi.Command.Dial).toHaveBeenCalledWith({ Number: "1234" });
    expect(xapi.Command.UserInterface.WebView.Clear).toHaveBeenCalledWith({
      Target: "OSD",
    });
  });

  it("dials and closes the peripheral web view when the URL reports a dial hash", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID, WEBAPP_URL } = await import("../../macros/main.js");

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
    await new Promise((resolve) => setImmediate(resolve));

    expect(xapi.Command.Dial).toHaveBeenCalledWith({ Number: "5678" });
    expect(xapi.Command.UserInterface.WebView.Clear).toHaveBeenCalledWith({
      PeripheralId: "AA:BB:CC:DD:EE:FF",
    });
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
});
