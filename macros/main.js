import xapi from "xapi";

/*
 * Example Cisco RoomOS macro.
 *
 * Adds a home-screen button that opens the project's web app in a WebView so
 * the macro can offer richer functionality than the on-device UI extensions
 * alone. Paste this file into the device Macro Editor, or deploy it with your
 * preferred tooling.
 *
 * The values between the CONFIG markers are managed by `npm run apply-config`
 * (driven by project.config.json) - do not edit them by hand.
 */

// CONFIG:start
const MACRO_NAME = "my-macro";
const WEBAPP_URL = "https://wxsd-sales.github.io/my-macro/webapp/";
// CONFIG:end

const PANEL_ID = `${MACRO_NAME}-open`;

const PANEL_XML = `<Extensions>
  <Panel>
    <Order>1</Order>
    <PanelId>${PANEL_ID}</PanelId>
    <Location>HomeScreen</Location>
    <Icon>Custom</Icon>
    <Name>${MACRO_NAME}</Name>
    <ActivityType>Custom</ActivityType>
  </Panel>
</Extensions>`;

async function openWebApp() {
  await xapi.Command.UserInterface.WebView.Display({
    Url: WEBAPP_URL,
    Title: MACRO_NAME,
    Mode: "Modal",
  });
}

function onPanelClicked(event) {
  if (event.PanelId === PANEL_ID) {
    openWebApp().catch((error) =>
      console.error(`${MACRO_NAME}: failed to open web app`, error),
    );
  }
}

async function init() {
  try {
    await xapi.Command.UserInterface.Extensions.Panel.Save(
      { PanelId: PANEL_ID },
      PANEL_XML,
    );
  } catch (error) {
    console.error(`${MACRO_NAME}: failed to save UI panel`, error);
  }

  xapi.Event.UserInterface.Extensions.Panel.Clicked.on(onPanelClicked);
  console.log(`${MACRO_NAME}: started`);
}

init();

export { PANEL_ID, WEBAPP_URL, openWebApp, onPanelClicked };
