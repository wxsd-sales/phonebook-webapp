import { beforeEach, describe, expect, it, jest } from "@jest/globals";

describe("macros/main.js", () => {
  beforeEach(async () => {
    jest.resetModules();
    const { default: xapi } = await import("xapi");
    xapi.reset();
  });

  it("opens the web app WebView when its panel is clicked", async () => {
    const { default: xapi } = await import("xapi");
    const { PANEL_ID } = await import("../../macros/main.js");

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: PANEL_ID,
    });

    // Allow the async click handler's WebView command to settle.
    await new Promise((resolve) => setImmediate(resolve));

    expect(xapi.Command.UserInterface.WebView.Display).toHaveBeenCalledWith(
      expect.objectContaining({ Url: expect.stringContaining("/webapp/") }),
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
});
