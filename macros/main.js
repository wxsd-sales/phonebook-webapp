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
 * The macro then watches that WebView's reported URL for hashes the web app
 * writes on completing a dial or dial-edit action
 * (#command=dial&number=<destination>), on Exit (#command=exit), or on its
 * own inactivity auto-close (#command=exit, see AUTO_CLOSE_SECONDS below).
 * On Exit it closes the WebView immediately. On a dial, it waits briefly (so
 * the web app's own "Dialing..." view has a moment to be seen) before
 * closing the WebView on the same screen it was opened on and placing the
 * call.
 *
 * The values between the CONFIG markers are managed by `npm run apply-config`
 * (driven by project.config.json) - do not edit them by hand.
 */

// CONFIG:start
const MACRO_NAME = "phonebook-webapp";
const WEBAPP_URL = "https://wxsd-sales.github.io/phonebook-webapp/webapp/";
const AUTO_CLOSE_SECONDS = 0;
// CONFIG:end

const PANEL_ID = `${MACRO_NAME}-open`;

// How long to let the web app's "Dialing..." view stay on screen before the
// macro closes the WebView and places the call.
const DIAL_CLOSE_DELAY_MS = 1000;

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

// Adds an `autoClose=<seconds>` hash param the web app reads on load, when
// the inactivity auto-close feature is enabled (AUTO_CLOSE_SECONDS > 0).
function buildWebAppUrl(autoCloseSeconds) {
  return autoCloseSeconds > 0
    ? `${WEBAPP_URL}#autoClose=${autoCloseSeconds}`
    : WEBAPP_URL;
}

async function openWebApp(target) {
  await xapi.Command.UserInterface.WebView.Display({
    ...target,
    Url: buildWebAppUrl(AUTO_CLOSE_SECONDS),
    Title: MACRO_NAME,
    Mode: "Modal",
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

// The web app signals a completed dial (direct call or dial-edit) with
// `command=dial&number=<destination>`, and Exit with `command=exit`.
function parseWebAppCommand(url) {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return null;
  const params = parseQueryParams(url.slice(hashIndex + 1));
  if (params.command === "dial" && params.number) {
    return { command: "dial", number: params.number };
  }
  if (params.command === "exit") {
    return { command: "exit" };
  }
  return null;
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

  const request = parseWebAppCommand(webview.URL);
  if (!request) return;

  const target = activeWebView;
  activeWebView = null; // stop reacting to further updates for this session

  if (request.command === "exit") {
    closeWebView(target);
    return;
  }

  setTimeout(() => {
    closeWebView(target);
    xapi.Command.Dial({ Number: request.number }).catch((error) =>
      console.error(`${MACRO_NAME}: failed to dial ${request.number}`, error),
    );
  }, DIAL_CLOSE_DELAY_MS);
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
  AUTO_CLOSE_SECONDS,
  DIAL_CLOSE_DELAY_MS,
  buildWebAppUrl,
  openWebApp,
  onPanelClicked,
  onWebViewChanged,
  onWebViewCleared,
  parseWebAppCommand,
  webViewTargetFor,
};
