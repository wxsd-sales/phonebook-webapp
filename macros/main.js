import xapi from "xapi";

/*
 * Phonebook Web App Macro
 *
 * Author:   William Mills
 *           Solutions Engineer
 *           wimills@cisco.com
 *           Cisco Systems
 *
 * Version:  1.0.1
 * Released: 2026-10-06
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
 * PHONEBOOK_ROOT_URL lets the directory XML be hosted separately from the
 * web app (a relative path resolved against WEBAPP_URL, or a full URL to
 * another host) - see buildWebAppUrl(). Leave it empty to use the web app's
 * own bundled phonebook/main.xml.
 *
 * ALLOW_INSECURE_HTTPS is for web servers without a trusted certificate
 * (typically one addressed by IP, or with a self-signed certificate). When
 * true, the macro adds the web app's hostname to the device's WebEngine
 * AllowInsecureHttps list on start and opens the WebView with
 * AllowInsecureHttps set. If WEBAPP_URL is an https:// URL with an IP address
 * and this is false, the macro can't work, so it shows an on-screen alert on
 * start instead of running.
 *
 * A web-based configuration wizard for this macro is available at:
 * https://wxsd-sales.github.io/phonebook-webapp/wizard/
 *
 * The full README, source code and license details are available on GitHub:
 * https://github.com/wxsd-sales/phonebook-webapp
 */

// CONFIG:start
const BUTTON_NAME = "Phone Book";
const BUTTON_ICON = "Handset";
const BUTTON_LOCATION = "HomeScreen";
const MACRO_NAME = "phonebook-webapp";
const WEBAPP_URL = "https://wxsd-sales.github.io/phonebook-webapp/webapp/";
const PHONEBOOK_ROOT_URL = "";
const AUTO_CLOSE_SECONDS = 60;
const ALLOW_INSECURE_HTTPS = false;
// CONFIG:end

const PANEL_ID = `${MACRO_NAME}-open`;

// How long to let the web app's "Dialing..." view stay on screen before the
// macro closes the WebView and places the call.
const DIAL_CLOSE_DELAY_MS = 1000;

// The WebViews this macro currently has open, one entry per screen. `target`
// is what WebView.Display/Clear take (`{ PeripheralId }` or `{ Target }`).
// `peripheralId` is kept for entries opened by Target so two screens can still
// be told apart when a status update reports which peripheral it came from.
let activeWebViews = [];

// Some RoomOS versions report a PeripheralId on the panel click event but
// WebView.Display only accepts it from this version onwards. Below it, the
// click's Origin ("OSD", "Controller", ...) is used as the Target instead.
const MIN_PERIPHERAL_VERSION = [26, 5, 1];

// Extracts [major, minor, patch] from a RoomOS version string such as
// "ce26.10.1.4.2a75dc140e6". Tolerates a missing/odd prefix ("ce", "RoomOS ",
// "roomos-") and a missing patch number. Returns null if it can't be parsed.
function parseRoomOsVersion(version) {
  if (typeof version !== "string") return null;
  const match = version.match(/(?:^|[^0-9])(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] || 0)];
}

// True if the version is >= MIN_PERIPHERAL_VERSION. An unparseable version is
// assumed to be current so newer, unknown formats keep the default behavior.
function supportsPeripheralTarget(version) {
  const parsed = parseRoomOsVersion(version);
  if (!parsed) return true;
  for (let i = 0; i < MIN_PERIPHERAL_VERSION.length; i++) {
    if (parsed[i] !== MIN_PERIPHERAL_VERSION[i]) {
      return parsed[i] > MIN_PERIPHERAL_VERSION[i];
    }
  }
  return true;
}

async function getRoomOsVersion() {
  try {
    return await xapi.Status.SystemUnit.Software.Version.get();
  } catch (error) {
    console.warn(`${MACRO_NAME}: could not read RoomOS version`, error);
    return null;
  }
}

async function webViewTargetFor(event) {
  if (!event.PeripheralId) return { Target: "OSD" };
  if (event.Origin && !supportsPeripheralTarget(await getRoomOsVersion())) {
    return { Target: event.Origin };
  }
  return { PeripheralId: event.PeripheralId };
}

// Whether a WebView status/Cleared payload (`info`) belongs to the active
// entry `view`. A payload with neither field is taken to be the OSD.
function isSameWebView(view, info) {
  const peripheralId = view.target.PeripheralId || view.peripheralId;
  if (peripheralId && info.PeripheralId)
    return peripheralId === info.PeripheralId;
  if (view.target.PeripheralId) return false;
  if (!info.Target && info.PeripheralId) return false;
  return (info.Target || "OSD") === view.target.Target;
}

// Status updates only carry the fields that changed (often just id + URL), so
// fill in Target/PeripheralId from the full WebView status when missing.
async function describeWebView(webview) {
  if (webview.Target || webview.PeripheralId) return webview;
  try {
    const all = await xapi.Status.UserInterface.WebView.get();
    const full = (Array.isArray(all) ? all : [all]).find(
      (item) => item && String(item.id) === String(webview.id),
    );
    return { ...full, ...webview };
  } catch (error) {
    console.warn(`${MACRO_NAME}: could not read WebView status`, error);
    return webview;
  }
}

function removeActiveWebView(view) {
  activeWebViews = activeWebViews.filter((item) => item !== view);
}

// Builds a "key=value&key2=value2" string from an object, skipping falsy
// values. The RoomOS macro runtime has no URLSearchParams, so this is done
// by hand.
function buildQueryString(params) {
  return Object.entries(params)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}

// Adds `autoClose=<seconds>` and/or `phonebookRoot=<url>` hash params the
// web app reads on load, when each feature is configured
// (AUTO_CLOSE_SECONDS > 0, PHONEBOOK_ROOT_URL non-empty).
function buildWebAppUrl(autoCloseSeconds, phonebookRootUrl) {
  const query = buildQueryString({
    autoClose: autoCloseSeconds > 0 ? autoCloseSeconds : "",
    phonebookRoot: phonebookRootUrl,
  });
  return query ? `${WEBAPP_URL}#${query}` : WEBAPP_URL;
}

// The hostname (or IP) of an http(s) URL, or "" if it isn't one. The RoomOS
// macro runtime has no URL class, so this is done by hand.
function getHostname(url) {
  const match = /^https?:\/\/(?:[^/?#@]*@)?(\[[^\]]+\]|[^/?#:]+)/i.exec(
    String(url).trim(),
  );
  return match ? match[1] : "";
}

function isIpAddress(hostname) {
  return (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    (hostname.startsWith("[") && hostname.endsWith("]"))
  );
}

// An https:// web app addressed by IP can't present a certificate valid for
// that address, so it needs ALLOW_INSECURE_HTTPS to load at all.
function needsInsecureHttps(url) {
  return /^https:\/\//i.test(url) && isIpAddress(getHostname(url));
}

async function allowInsecureHttpsForWebApp() {
  const hostname = getHostname(WEBAPP_URL);
  if (!hostname) return;
  try {
    await xapi.Command.WebEngine.AllowInsecureHttps.Add({ Hostname: hostname });
  } catch (error) {
    console.error(
      `${MACRO_NAME}: failed to allow insecure HTTPS for ${hostname}`,
      error,
    );
  }
}

function showConfigError() {
  const message =
    `The web app URL (${WEBAPP_URL}) is an HTTPS address that uses an IP address, ` +
    "so Allow Insecure HTTPS must be enabled in the macro config. " +
    "This macro will not function until this config is fixed.";
  console.error(`${MACRO_NAME}: ${message}`);
  return xapi.Command.UserInterface.Message.Alert.Display({
    Title: `${BUTTON_NAME} macro: configuration error`,
    Text: message,
    Duration: 0,
  }).catch((error) =>
    console.error(`${MACRO_NAME}: failed to show config alert`, error),
  );
}

async function openWebApp(target, peripheralId) {
  await xapi.Command.UserInterface.WebView.Display({
    ...target,
    Url: buildWebAppUrl(AUTO_CLOSE_SECONDS, PHONEBOOK_ROOT_URL),
    Title: MACRO_NAME,
    Mode: "Modal",
    ...(ALLOW_INSECURE_HTTPS ? { AllowInsecureHttps: "True" } : {}),
  });
  // Re-opening on a screen replaces its view rather than tracking it twice.
  const info = target.PeripheralId
    ? target
    : { ...target, PeripheralId: peripheralId };
  activeWebViews = activeWebViews.filter((view) => !isSameWebView(view, info));
  activeWebViews.push({ target, peripheralId });
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
  webViewTargetFor(event)
    .then((target) => openWebApp(target, event.PeripheralId))
    .catch((error) =>
      console.error(`${MACRO_NAME}: failed to open web app`, error),
    );
}

async function onWebViewChanged(webview) {
  if (!activeWebViews.length || !webview.URL) return;
  if (!webview.URL.startsWith(WEBAPP_URL)) return;

  const request = parseWebAppCommand(webview.URL);
  if (!request) return;

  const info = await describeWebView(webview);
  const view = activeWebViews.find((item) => isSameWebView(item, info));
  if (!view) return;
  removeActiveWebView(view); // stop reacting to further updates for this one

  const { target } = view;
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
  activeWebViews = activeWebViews.filter((view) => !isSameWebView(view, event));
}

/**
 * Saves UI Extension Panel, changes the text, color and icon, depending on state
 */
async function createPanel() {
  console.log("Creating Panel");

  const order = await panelOrder(PANEL_ID);

  const panel = `<Extensions>
  <Panel>
    ${order}
    <Location>${BUTTON_LOCATION}</Location>
    <Icon>${BUTTON_ICON}</Icon>
    <Name>${BUTTON_NAME}</Name>
    <ActivityType>Custom</ActivityType>
  </Panel>
</Extensions>`;

  xapi.Command.UserInterface.Extensions.Panel.Save(
    { PanelId: PANEL_ID },
    panel,
  ).catch((e) => console.log("Error saving panel: " + e.message));
}

/*********************************************************
 * Gets the current Panel Order if exiting Macro panel is present
 * to preserve the order in relation to other custom UI Extensions
 **********************************************************/
async function panelOrder(panelId) {
  const list = await xapi.Command.UserInterface.Extensions.List({
    ActivityType: "Custom",
  });
  const panels = list?.Extensions?.Panel;
  if (!panels) return "";
  const existingPanel = panels.find((panel) => panel.PanelId == panelId);
  if (!existingPanel) return "";
  return `<Order>${existingPanel.Order}</Order>`;
}

async function init() {
  if (!ALLOW_INSECURE_HTTPS && needsInsecureHttps(WEBAPP_URL)) {
    await showConfigError();
    return;
  }
  if (ALLOW_INSECURE_HTTPS) await allowInsecureHttpsForWebApp();

  await createPanel();

  xapi.Event.UserInterface.Extensions.Panel.Clicked.on(onPanelClicked);
  xapi.Status.UserInterface.WebView.on(onWebViewChanged);
  xapi.Event.UserInterface.WebView.Cleared.on(onWebViewCleared);
  console.log(`${MACRO_NAME}: started`);
}

init();

export {
  PANEL_ID,
  WEBAPP_URL,
  PHONEBOOK_ROOT_URL,
  AUTO_CLOSE_SECONDS,
  ALLOW_INSECURE_HTTPS,
  DIAL_CLOSE_DELAY_MS,
  buildWebAppUrl,
  getHostname,
  isIpAddress,
  needsInsecureHttps,
  openWebApp,
  onPanelClicked,
  onWebViewChanged,
  onWebViewCleared,
  parseRoomOsVersion,
  parseWebAppCommand,
  supportsPeripheralTarget,
  webViewTargetFor,
};
