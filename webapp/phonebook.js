/*
 * Cisco IP phone style XML directory.
 *
 * Fetches a root "CiscoIPPhoneDirectory" XML file and renders it as a
 * browsable, dialable list of two entry kinds:
 *   - <DirectoryEntry>: a callable entry (<Name> + <Telephone>), rendered
 *     with "Call" and "Edit dial" buttons.
 *   - <MenuItem>: a folder (<Name> + <URL>, resolved relative to the file it
 *     came from), rendered with a "Select" button that fetches and pushes
 *     that XML file onto the navigation stack.
 *
 * "Call" and "Edit dial" both open a shared confirm/dial modal (styled after
 * the RoomOS SIP protocol-handler dial-confirmation prompt): "Call" shows
 * the name/number read-only, "Edit dial" shows an editable input instead.
 * Tapping the modal's own Call button writes
 * `#command=dial&number=<destination>` to the page's own URL hash and swaps
 * the Call button for a "Dialing..." state. Tapping "Exit" writes
 * `#command=exit`. The on-device macro watches the WebView's reported URL
 * for those hashes to close the view (and, for a dial, place the call).
 *
 * If the macro opened this page with an `#autoClose=<seconds>` hash param,
 * the page also watches for touch/click/keyboard activity and writes
 * `#command=exit` itself after that many seconds pass with none.
 */

const rootUrl = new URL("phonebook/main.xml", document.baseURI).href;

const els = {
  back: document.getElementById("phone-back"),
  title: document.getElementById("phone-title"),
  prompt: document.getElementById("phone-prompt"),
  status: document.getElementById("phone-status"),
  list: document.getElementById("phone-list"),
  exit: document.getElementById("phone-exit"),
  modalBackdrop: document.getElementById("modal-backdrop"),
  modalBack: document.getElementById("modal-back"),
  modalInfo: document.getElementById("modal-info"),
  modalName: document.getElementById("modal-name"),
  modalNumber: document.getElementById("modal-number"),
  modalInput: document.getElementById("modal-input"),
  modalInputValue: document.getElementById("modal-input-value"),
  modalCall: document.getElementById("modal-call"),
  modalDialing: document.getElementById("modal-dialing"),
};

// The number the modal's Call button should dial. Set when the modal opens.
let pendingNumber = "";

const state = {
  stack: [],
  current: null,
};

function setStatus(message, kind) {
  els.status.textContent = message || "";
  if (kind) {
    els.status.dataset.kind = kind;
  } else {
    delete els.status.dataset.kind;
  }
}

function textOf(parent, tagName) {
  return parent.querySelector(tagName)?.textContent?.trim() || "";
}

function parseDirectoryXml(xmlText, sourceUrl) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error(`Invalid directory XML at ${sourceUrl}`);
  }

  const root = doc.documentElement;
  const title = textOf(root, "Title") || "Directory";
  const prompt = textOf(root, "Prompt");
  const entries = Array.from(
    root.querySelectorAll("DirectoryEntry, MenuItem"),
  ).map((el) => {
    const name = textOf(el, "Name");
    if (el.tagName === "MenuItem") {
      return {
        kind: "menu",
        name,
        url: new URL(textOf(el, "URL"), sourceUrl).href,
      };
    }
    return { kind: "entry", name, telephone: textOf(el, "Telephone") };
  });

  return { title, prompt, entries };
}

async function fetchDirectory(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return parseDirectoryXml(await response.text(), url);
}

function makePill(label, { primary = false, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = primary ? "phone-pill phone-pill--primary" : "phone-pill";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderEntry(entry) {
  const item = document.createElement("li");
  item.className = "phone-entry";

  const info = document.createElement("div");
  info.className = "phone-entry__info";

  const name = document.createElement("span");
  name.className = "phone-entry__name";
  name.textContent = entry.name;
  info.appendChild(name);

  const actions = document.createElement("div");
  actions.className = "phone-entry__actions";

  if (entry.kind === "menu") {
    actions.appendChild(
      makePill("Select", {
        primary: true,
        onClick: () => openDirectory(entry.url, { pushCurrent: true }),
      }),
    );
  } else {
    const number = document.createElement("span");
    number.className = "phone-entry__number";
    number.textContent = entry.telephone;
    info.appendChild(number);

    actions.appendChild(
      makePill("Call", {
        primary: true,
        onClick: () => openConfirmModal(entry),
      }),
    );
    actions.appendChild(
      makePill("Edit dial", { onClick: () => openEditModal(entry) }),
    );
  }

  item.append(info, actions);
  return item;
}

function render() {
  const { title, prompt, entries } = state.current;
  els.title.textContent = title;
  els.prompt.textContent = prompt;
  els.back.hidden = state.stack.length === 0;
  els.list.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "phone-empty";
    empty.textContent = "No entries";
    els.list.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    els.list.appendChild(renderEntry(entry));
  }
}

async function openDirectory(url, { pushCurrent }) {
  setStatus("Loading…");
  try {
    const directory = await fetchDirectory(url);
    if (pushCurrent && state.current) {
      state.stack.push(state.current);
    }
    state.current = directory;
    setStatus("");
    render();
  } catch (error) {
    console.error(error);
    setStatus("Could not load directory", "error");
  }
}

function goBack() {
  const previous = state.stack.pop();
  if (!previous) return;
  state.current = previous;
  render();
}

function setHash(params) {
  window.location.hash = new URLSearchParams(params).toString();
}

function commitExit() {
  setHash({ command: "exit" });
}

// Resets the modal to its idle (not-dialing) look before it's (re)opened.
function resetModal() {
  els.modalBack.hidden = false;
  els.modalCall.hidden = false;
  els.modalDialing.hidden = true;
  els.modalInputValue.hidden = true;
}

function openModal() {
  resetModal();
  els.modalBackdrop.hidden = false;
}

function closeModal() {
  els.modalBackdrop.hidden = true;
}

// "Call" on a directory entry: show its name/number read-only.
function openConfirmModal(entry) {
  pendingNumber = entry.telephone;
  els.modalName.textContent = entry.name;
  els.modalNumber.textContent = entry.telephone;
  els.modalInfo.hidden = false;
  els.modalInput.hidden = true;
  openModal();
}

// "Edit dial" on a directory entry: show an editable, focused input.
function openEditModal(entry) {
  pendingNumber = "";
  els.modalInfo.hidden = true;
  els.modalInput.hidden = false;
  els.modalInput.value = entry.telephone;
  openModal();
  requestAnimationFrame(() => {
    els.modalInput.focus();
    els.modalInput.select();
  });
}

// Tapping the modal's own Call button: place the dial hash and swap the
// Call button for "Dialing...", removing the back button so the modal can
// no longer be dismissed mid-dial. If dialing from the editable input, it's
// replaced with plain text (and blurred, to dismiss the on-screen keyboard)
// so it no longer reads as something the user can still change.
function startDialing() {
  const editing = !els.modalInput.hidden;
  const number = editing ? els.modalInput.value : pendingNumber;
  const digits = number.trim();
  if (!digits) return;

  els.modalBack.hidden = true;
  els.modalCall.hidden = true;
  els.modalDialing.hidden = false;

  if (editing) {
    els.modalInput.blur();
    els.modalInput.hidden = true;
    els.modalInputValue.textContent = digits;
    els.modalInputValue.hidden = false;
  }

  setHash({ command: "dial", number: digits });
}

els.back.addEventListener("click", goBack);
els.exit.addEventListener("click", commitExit);
els.modalCall.addEventListener("click", startDialing);
els.modalBack.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", (event) => {
  if (event.target !== els.modalBackdrop) return;
  if (!els.modalDialing.hidden) return; // no dismissing mid-dial
  closeModal();
});
els.modalInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  els.modalCall.click();
});

// Reads `autoClose` from the page's *initial* URL hash only - later hash
// changes are this page's own doing (dial/exit) and must not re-arm this.
function readInitialAutoCloseSeconds() {
  const raw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!raw) return 0;
  const seconds = Number(new URLSearchParams(raw).get("autoClose"));
  return Number.isInteger(seconds) && seconds > 0 ? seconds : 0;
}

// Exits after `seconds` pass with no touch, click, or keyboard input.
// `pointerdown` covers touch, mouse, and pen in one event.
function watchInactivity(seconds) {
  const ACTIVITY_EVENTS = ["pointerdown", "keydown"];
  let timer = null;

  const stopWatching = () => {
    clearTimeout(timer);
    ACTIVITY_EVENTS.forEach((type) =>
      document.removeEventListener(type, resetTimer, true),
    );
  };

  function resetTimer() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stopWatching();
      commitExit();
    }, seconds * 1000);
  }

  ACTIVITY_EVENTS.forEach((type) =>
    document.addEventListener(type, resetTimer, true),
  );
  resetTimer();
}

const initialAutoCloseSeconds = readInitialAutoCloseSeconds();
if (initialAutoCloseSeconds > 0) {
  watchInactivity(initialAutoCloseSeconds);
}

openDirectory(rootUrl, { pushCurrent: false });
