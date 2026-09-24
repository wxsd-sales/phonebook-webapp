import xapi from "xapi";

/*
 * Example Cisco RoomOS macro.
 *
 * Adds a "Phone Book" button to the home screen that opens the project's web
 * app - a Cisco IP phone style XML directory - in a WebView. The button opens
 * the directory on whichever screen it was pressed from: the peripheral
 * (e.g. a paired Room Navigator) if the panel click event carries a
 * PeripheralId, otherwise the codec's own on-screen display (OSD).
 *
 * The macro then watches that WebView's reported URL for the hash the web
 * app writes when the user completes a dial or dial-edit action
 * (#command=dial&number=<destination>). On seeing it, the macro closes the
 * WebView on the same screen it was opened on and places the call.
 *
 * The values between the CONFIG markers are managed by `npm run apply-config`
 * (driven by project.config.json) - do not edit them by hand.
 */

// CONFIG:start
const MACRO_NAME = "phonebook-webapp";
const WEBAPP_URL = "https://wxsd-sales.github.io/phonebook-webapp/webapp/";
// CONFIG:end

const PANEL_ID = `${MACRO_NAME}-open`;

// RoomOS has no built-in "phone book" panel icon; Handset is the closest
// built-in match. Swap this for a custom uploaded icon (Icon: "Custom") if
// you want literal book artwork instead.
const PANEL_XML = `<Extensions>
  <Panel>
    <Order>1</Order>
    <PanelId>${PANEL_ID}</PanelId>
    <Location>HomeScreen</Location>
    <Icon>Handset</Icon>
    <Name>Phone Book</Name>
    <ActivityType>Custom</ActivityType>
  </Panel>
</Extensions>`;

// The WebView.Display/Clear target this macro currently has open, either
// `{ PeripheralId }` or `{ Target: "OSD" }`. Null when no directory is open.
let activeWebView = null;

function webViewTargetFor(event) {
  return event.PeripheralId
    ? { PeripheralId: event.PeripheralId }
    : { Target: "OSD" };
}

function sameTarget(a, b) {
  return a.PeripheralId
    ? a.PeripheralId === b.PeripheralId
    : b.Target === "OSD" && !b.PeripheralId;
}

async function openWebApp(target) {
  await xapi.Command.UserInterface.WebView.Display({
    ...target,
    Url: WEBAPP_URL,
    Title: MACRO_NAME,
    Mode: "Fullscreen",
  });
  activeWebView = target;
}

async function closeWebView(target) {
  try {
    await xapi.Command.UserInterface.WebView.Clear(target);
  } catch (error) {
    console.error(`${MACRO_NAME}: failed to close web view`, error);
  }
}

// Parses a "key=value&key2=value2" query-style string into an object. The
// RoomOS macro runtime has no URL/URLSearchParams, so this is done by hand.
function parseQueryParams(query) {
  const params = {};
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const eqIndex = pair.indexOf("=");
    const rawKey = eqIndex === -1 ? pair : pair.slice(0, eqIndex);
    const rawValue = eqIndex === -1 ? "" : pair.slice(eqIndex + 1);
    params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
  }
  return params;
}

// The web app signals a completed dial (direct call or dial-edit) by
// updating its own URL hash to `command=dial&number=<destination>`.
function parseDialRequest(url) {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return null;
  const params = parseQueryParams(url.slice(hashIndex + 1));
  return params.command === "dial" && params.number ? params.number : null;
}

function onPanelClicked(event) {
  if (event.PanelId !== PANEL_ID) return;
  openWebApp(webViewTargetFor(event)).catch((error) =>
    console.error(`${MACRO_NAME}: failed to open web app`, error),
  );
}

function onWebViewChanged(webview) {
  if (!activeWebView || !webview.URL) return;
  if (!webview.URL.startsWith(WEBAPP_URL)) return;

  const number = parseDialRequest(webview.URL);
  if (!number) return;

  const target = activeWebView;
  activeWebView = null; // stop reacting to further updates for this session
  closeWebView(target);
  xapi.Command.Dial({ Number: number }).catch((error) =>
    console.error(`${MACRO_NAME}: failed to dial ${number}`, error),
  );
}

function onWebViewCleared(event) {
  if (activeWebView && sameTarget(activeWebView, event)) {
    activeWebView = null;
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
  xapi.Status.UserInterface.WebView.on(onWebViewChanged);
  xapi.Event.UserInterface.WebView.Cleared.on(onWebViewCleared);
  console.log(`${MACRO_NAME}: started`);
}

init();

export {
  PANEL_ID,
  WEBAPP_URL,
  openWebApp,
  onPanelClicked,
  onWebViewChanged,
  onWebViewCleared,
  parseDialRequest,
  webViewTargetFor,
};
