/*
 * Cisco IP phone style XML directory.
 *
 * Fetches a root "CiscoIPPhoneDirectory" XML file and renders it as a
 * browsable, dialable list. A <DirectoryEntry> with a <Telephone> is a
 * callable leaf; one with a <URL> (resolved relative to the file it came
 * from) is a folder that is fetched and pushed onto a navigation stack.
 *
 * Completing a dial (direct or via Edit Dial) writes
 * `#command=dial&number=<destination>` to the page's own URL hash. The
 * on-device macro watches the WebView's reported URL for that hash to close
 * the view and place the call.
 */

const rootUrl = new URL("phonebook/main.xml", document.baseURI).href;

const els = {
  title: document.getElementById("phone-title"),
  prompt: document.getElementById("phone-prompt"),
  status: document.getElementById("phone-status"),
  list: document.getElementById("phone-list"),
  back: document.getElementById("softkey-back"),
  dial: document.getElementById("softkey-dial"),
  editDial: document.getElementById("softkey-editdial"),
  edit: document.getElementById("phone-edit"),
  editInput: document.getElementById("phone-edit-input"),
  editConfirm: document.getElementById("phone-edit-confirm"),
  editCancel: document.getElementById("phone-edit-cancel"),
  dialing: document.getElementById("phone-dialing"),
  dialingNumber: document.getElementById("phone-dialing-number"),
};

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
  const entries = Array.from(root.querySelectorAll("DirectoryEntry")).map(
    (entry) => {
      const name = textOf(entry, "Name");
      const telephone = textOf(entry, "Telephone");
      const url = textOf(entry, "URL");
      if (telephone) return { name, telephone };
      if (url) return { name, url: new URL(url, sourceUrl).href };
      return { name };
    },
  );

  return { title, prompt, entries, selectedIndex: -1 };
}

async function fetchDirectory(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return parseDirectoryXml(await response.text(), url);
}

function render() {
  const { title, prompt, entries, selectedIndex } = state.current;
  els.title.textContent = title;
  els.prompt.textContent = prompt;
  els.list.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "phone-empty";
    empty.textContent = "No entries";
    els.list.appendChild(empty);
  }

  entries.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = `phone-entry${entry.url ? " phone-entry--folder" : ""}`;
    item.setAttribute("role", "option");
    item.tabIndex = 0;
    item.setAttribute("aria-selected", String(index === selectedIndex));

    const name = document.createElement("span");
    name.className = "phone-entry__name";
    name.textContent = entry.name;

    const detail = document.createElement("span");
    detail.className = "phone-entry__detail";
    detail.textContent = entry.url ? "›" : entry.telephone;

    item.append(name, detail);
    item.addEventListener("click", () => selectEntry(index));
    els.list.appendChild(item);
  });

  els.back.disabled = state.stack.length === 0;
  const selected = entries[selectedIndex];
  const canCall = Boolean(selected && selected.telephone);
  els.dial.disabled = !canCall;
  els.editDial.disabled = !canCall;
}

function selectEntry(index) {
  const entry = state.current.entries[index];
  if (!entry) return;
  if (entry.url) {
    openDirectory(entry.url, { pushCurrent: true });
    return;
  }
  state.current.selectedIndex = index;
  render();
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

function selectedNumber() {
  const entry = state.current.entries[state.current.selectedIndex];
  return entry?.telephone || "";
}

function commitDial(number) {
  const digits = number.trim();
  if (!digits) return;
  showDialing(digits);

  const params = new URLSearchParams(
    window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "",
  );
  params.set("command", "dial");
  params.set("number", digits);
  window.location.hash = params.toString();
}

function showDialing(number) {
  els.dialingNumber.textContent = number;
  els.dialing.hidden = false;
}

function openEdit(prefill) {
  els.editInput.value = prefill;
  els.edit.hidden = false;
  requestAnimationFrame(() => {
    els.editInput.focus();
    els.editInput.select();
  });
}

function closeEdit() {
  els.edit.hidden = true;
}

els.back.addEventListener("click", goBack);
els.dial.addEventListener("click", () => commitDial(selectedNumber()));
els.editDial.addEventListener("click", () => openEdit(selectedNumber()));
els.editCancel.addEventListener("click", closeEdit);
els.editConfirm.addEventListener("click", () => {
  const number = els.editInput.value;
  closeEdit();
  commitDial(number);
});
els.editInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  els.editConfirm.click();
});

openDirectory(rootUrl, { pushCurrent: false });
