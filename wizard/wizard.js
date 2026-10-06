import {
  buildSnippet,
  getHostname,
  injectConfig,
  needsInsecureHttps,
} from "./snippet.js";
import { collectWebappFiles } from "./webapp-bundle.js";
import { createZip } from "./zip.js";

// Defaults the wizard form starts with, and the project details it displays.
const config = {
  name: "phonebook-webapp",
  title: "Phonebook Web App",
  repoUrl: "https://github.com/wxsd-sales/phonebook-webapp",
  webappUrl: "https://wxsd-sales.github.io/phonebook-webapp/webapp/",
  buttonName: "Phone Book",
  buttonIcon: "Handset",
  buttonLocation: "HomeScreen",
  phonebookRootUrl: "",
  autoCloseSeconds: 0,
  allowInsecureHttps: false,
};

// The macro source is published alongside the wizard on GitHub Pages so the
// "Download macro" action can fetch it and inject the configured values.
const MACRO_SOURCE_URL = "../macros/main.js";

// The web app is published next to the wizard; the "Export Web App" tab
// bundles it (from here) into a zip for self-hosting.
const WEBAPP_BASE_URL = new URL("../webapp/", window.location.href).href;
const WEBAPP_BUNDLE_FOLDER = "phonebook-webapp";

const BUTTON_ICONS = [
  "Blinds",
  "Briefing",
  "Camera",
  "Concierge",
  "Disc",
  "Handset",
  "Help",
  "Helpdesk",
  "Home",
  "Hvac",
  "Info",
  "Input",
  "Language",
  "Laptop",
  "Lightbulb",
  "Media",
  "Microphone",
  "Power",
  "Proximity",
  "Record",
  "Sliders",
  "Tv",
];

const BUTTON_LOCATIONS = [
  "HomeScreen",
  "CallControls",
  "HomeScreenAndCallControls",
  "ControlPane",
  "RoomScheduler",
  "Hidden",
];

/* Header: product name and source-code link. */
(function initHeader() {
  const product = document.getElementById("app-product");
  const sourceLink = document.getElementById("source-link");

  if (product && config.title) {
    product.textContent = `${config.title} - Configuration Wizard`;
  }
  if (config.title) {
    document.title = `${config.title} - Wizard`;
  }
  if (sourceLink && config.repoUrl) {
    sourceLink.href = config.repoUrl;
  }
})();

/* Settings form -> live macro config snippet + macro download. */
(function initSettings() {
  const buttonNameInput = document.getElementById("button-name");
  const buttonIconInput = document.getElementById("button-icon");
  const buttonLocationInput = document.getElementById("button-location");
  const webappUrlInput = document.getElementById("webapp-url");
  const phonebookRootUrlInput = document.getElementById("phonebook-root-url");
  const phonebookRootStatus = document.getElementById("phonebook-root-status");
  const webappUrlStatus = document.getElementById("webapp-url-status");
  const allowInsecureHttpsInput = document.getElementById(
    "allow-insecure-https",
  );
  const autoCloseEnabledInput = document.getElementById("auto-close-enabled");
  const autoCloseSecondsInput = document.getElementById("auto-close-seconds");
  const autoCloseSecondsField = document.getElementById(
    "auto-close-seconds-field",
  );
  const output = document.getElementById("output");
  const copyButton = document.getElementById("copy-button");
  const downloadButton = document.getElementById("download-button");
  const exportStatus = document.getElementById("export-status");

  if (
    !buttonNameInput ||
    !buttonIconInput ||
    !buttonLocationInput ||
    !webappUrlInput ||
    !phonebookRootUrlInput ||
    !phonebookRootStatus ||
    !webappUrlStatus ||
    !allowInsecureHttpsInput ||
    !autoCloseEnabledInput ||
    !autoCloseSecondsInput ||
    !autoCloseSecondsField ||
    !output
  ) {
    return;
  }

  const DEFAULT_AUTO_CLOSE_SECONDS = 60;
  const DEFAULT_BUTTON_ICON = "Handset";
  const DEFAULT_BUTTON_LOCATION = "HomeScreen";

  const populateSelect = (select, options, selected) => {
    select.innerHTML = "";
    for (const value of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    select.value = selected;
  };

  buttonNameInput.value = config.buttonName || "Phone Book";
  populateSelect(
    buttonIconInput,
    BUTTON_ICONS,
    config.buttonIcon || DEFAULT_BUTTON_ICON,
  );
  populateSelect(
    buttonLocationInput,
    BUTTON_LOCATIONS,
    config.buttonLocation || DEFAULT_BUTTON_LOCATION,
  );
  webappUrlInput.value = config.webappUrl ?? "";
  phonebookRootUrlInput.value = config.phonebookRootUrl ?? "";
  allowInsecureHttpsInput.checked = config.allowInsecureHttps === true;
  autoCloseEnabledInput.checked = Boolean(config.autoCloseSeconds);
  autoCloseSecondsInput.value = config.autoCloseSeconds
    ? String(config.autoCloseSeconds)
    : "";
  autoCloseSecondsField.hidden = !autoCloseEnabledInput.checked;

  const getValues = () => {
    const parsedSeconds = parseInt(autoCloseSecondsInput.value, 10);
    const autoCloseSeconds =
      autoCloseEnabledInput.checked &&
      Number.isInteger(parsedSeconds) &&
      parsedSeconds > 0
        ? parsedSeconds
        : 0;
    return {
      name: config.name ?? "",
      webappUrl: webappUrlInput.value.trim(),
      buttonName: buttonNameInput.value.trim(),
      buttonIcon: buttonIconInput.value,
      buttonLocation: buttonLocationInput.value,
      phonebookRootUrl: phonebookRootUrlInput.value.trim(),
      autoCloseSeconds,
      allowInsecureHttps: allowInsecureHttpsInput.checked,
    };
  };

  const downloadName = () => {
    const base =
      (getValues().buttonName || config.buttonName || config.name || "macro")
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "") || "macro";
    return `${base}.js`;
  };

  const setExportStatus = (message, kind = "") => {
    if (!exportStatus) return;
    exportStatus.textContent = message;
    if (kind) {
      exportStatus.dataset.kind = kind;
    } else {
      delete exportStatus.dataset.kind;
    }
  };

  const setPhonebookRootStatus = (message, kind = "") => {
    phonebookRootStatus.textContent = message;
    if (kind) {
      phonebookRootStatus.dataset.kind = kind;
    } else {
      delete phonebookRootStatus.dataset.kind;
    }
  };

  // Resolves the phonebook root against the web app URL (matching the web
  // app's own relative-or-absolute resolution) and flags:
  //   - HTTPS webapp + HTTP phonebook: blocking error (browsers refuse this
  //     mixed-content request outright).
  //   - Different hostnames: non-blocking CORS warning.
  // Returns true when export should be blocked.
  const validatePhonebookRoot = () => {
    const webappUrlValue = webappUrlInput.value.trim();
    const phonebookRootValue = phonebookRootUrlInput.value.trim();

    let webappUrlObj;
    try {
      webappUrlObj = new URL(webappUrlValue);
    } catch {
      setPhonebookRootStatus("");
      return false;
    }

    let resolvedUrl;
    try {
      resolvedUrl = new URL(
        phonebookRootValue || "phonebook/main.xml",
        webappUrlObj,
      );
    } catch {
      setPhonebookRootStatus("Enter a valid relative path or URL.", "error");
      return true;
    }

    if (
      webappUrlObj.protocol === "https:" &&
      resolvedUrl.protocol === "http:"
    ) {
      setPhonebookRootStatus(
        `The web app is served over HTTPS but this URL is HTTP (${resolvedUrl.origin}). ` +
          "Browsers block HTTPS pages from loading HTTP resources, so this " +
          "can't be exported until the phonebook is served over HTTPS too.",
        "error",
      );
      return true;
    }

    if (resolvedUrl.hostname !== webappUrlObj.hostname) {
      setPhonebookRootStatus(
        `This is a different host (${resolvedUrl.hostname}) than the web app ` +
          `(${webappUrlObj.hostname}). Make sure that server allows ` +
          `cross-origin requests from ${webappUrlObj.origin}, or the web ` +
          "app won't be able to load it.",
        "warning",
      );
      return false;
    }

    setPhonebookRootStatus("");
    return false;
  };

  // An https:// web app addressed by IP can't have a valid certificate, so
  // the macro refuses to run (and shows an on-screen error) unless "Allow
  // insecure HTTPS" is on. Warn here rather than block, since it's fixed by
  // flipping the toggle. Other https:// URLs may still be served with an
  // untrusted certificate, which can't be detected from here, so the toggle
  // is always available and only mentioned in the hint.
  const updateInsecureHttpsNotice = () => {
    const url = webappUrlInput.value.trim();
    let message = "";
    let kind = "";
    if (needsInsecureHttps(url)) {
      const host = getHostname(url);
      if (allowInsecureHttpsInput.checked) {
        message = `${host} is an IP address served over HTTPS. Allow insecure HTTPS is on, so the macro will add it to the device's WebEngine allow list.`;
      } else {
        message = `${host} is an IP address served over HTTPS, which can't have a certificate the device trusts. Turn on "Allow insecure HTTPS" below, otherwise the macro will show an error on the device and won't work.`;
        kind = "warning";
      }
    }
    webappUrlStatus.textContent = message;
    if (kind) {
      webappUrlStatus.dataset.kind = kind;
    } else {
      delete webappUrlStatus.dataset.kind;
    }
  };

  const updatePreview = () => {
    updateInsecureHttpsNotice();
    const blocked = validatePhonebookRoot();
    // Assign via textContent (never innerHTML) so user input is treated as text.
    output.textContent = buildSnippet(getValues());
    if (copyButton) copyButton.disabled = blocked;
    if (downloadButton) downloadButton.disabled = blocked;
  };

  buttonNameInput.addEventListener("input", updatePreview);
  buttonIconInput.addEventListener("change", updatePreview);
  buttonLocationInput.addEventListener("change", updatePreview);
  webappUrlInput.addEventListener("input", updatePreview);
  phonebookRootUrlInput.addEventListener("input", updatePreview);
  allowInsecureHttpsInput.addEventListener("change", updatePreview);

  autoCloseEnabledInput.addEventListener("change", () => {
    autoCloseSecondsField.hidden = !autoCloseEnabledInput.checked;
    if (autoCloseEnabledInput.checked && !autoCloseSecondsInput.value) {
      autoCloseSecondsInput.value = String(DEFAULT_AUTO_CLOSE_SECONDS);
    }
    updatePreview();
  });

  // Strip anything that isn't a digit as the user types, so the field can
  // only ever hold a positive integer (or be empty).
  autoCloseSecondsInput.addEventListener("input", () => {
    const digitsOnly = autoCloseSecondsInput.value.replace(/[^0-9]/g, "");
    if (digitsOnly !== autoCloseSecondsInput.value) {
      autoCloseSecondsInput.value = digitsOnly;
    }
    updatePreview();
  });

  updatePreview();

  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(output.textContent);
      } catch {
        setExportStatus(
          "Clipboard access was blocked by the browser.",
          "error",
        );
        return;
      }

      const label = copyButton.querySelector(".icon-button__label");
      const icon = copyButton.querySelector(".icon");
      const previousLabel = label.textContent;

      label.textContent = "Copied";
      icon.classList.remove("icon-copy-bold");
      icon.classList.add("icon-check-circle-bold");

      window.setTimeout(() => {
        label.textContent = previousLabel;
        icon.classList.remove("icon-check-circle-bold");
        icon.classList.add("icon-copy-bold");
      }, 1600);
    });
  }

  if (downloadButton) {
    downloadButton.addEventListener("click", async () => {
      setExportStatus("");

      let source;
      try {
        const response = await fetch(MACRO_SOURCE_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        source = await response.text();
      } catch {
        setExportStatus(
          "Could not load the macro source. Use Copy config instead.",
          "error",
        );
        return;
      }

      let macro;
      try {
        macro = injectConfig(source, getValues());
      } catch {
        setExportStatus(
          "The macro source is missing its CONFIG markers.",
          "error",
        );
        return;
      }

      const fileName = downloadName();
      const blob = new Blob([macro], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportStatus(`Downloaded ${fileName}.`, "success");
    });
  }
})();

/* Export Web App tab: zip the static web app for self-hosting. */
(function initWebappExport() {
  const includeSamplesInput = document.getElementById("include-samples");
  const includeSamplesStatus = document.getElementById(
    "include-samples-status",
  );
  const contents = document.getElementById("webapp-contents");
  const downloadButton = document.getElementById("download-webapp-button");
  const status = document.getElementById("webapp-export-status");
  const phonebookRootUrlInput = document.getElementById("phonebook-root-url");

  if (!includeSamplesInput || !contents || !downloadButton || !status) {
    return;
  }

  const setStatus = (message, kind = "") => {
    status.textContent = message;
    if (kind) {
      status.dataset.kind = kind;
    } else {
      delete status.dataset.kind;
    }
  };

  const CORE_LISTING = [
    "index.html",
    "phonebook.css",
    "phonebook.js",
    "favicon.svg",
  ];

  const updateContents = () => {
    const lines = [`${WEBAPP_BUNDLE_FOLDER}/`];
    const entries = [...CORE_LISTING];
    if (includeSamplesInput.checked) entries.push("phonebook/  (sample XML)");
    entries.forEach((entry, i) => {
      lines.push(`${i === entries.length - 1 ? "└─" : "├─"} ${entry}`);
    });
    contents.textContent = lines.join("\n");

    const needsRoot =
      !includeSamplesInput.checked &&
      !(phonebookRootUrlInput?.value ?? "").trim();
    includeSamplesStatus.textContent = needsRoot
      ? "Without the example directory you'll need to host your own directory XML and set the Phonebook root URL on the Configure tab."
      : "";
    if (needsRoot) {
      includeSamplesStatus.dataset.kind = "warning";
    } else {
      delete includeSamplesStatus.dataset.kind;
    }
  };

  includeSamplesInput.addEventListener("change", updateContents);
  phonebookRootUrlInput?.addEventListener("input", updateContents);
  updateContents();

  downloadButton.addEventListener("click", async () => {
    setStatus("Preparing bundle…");
    downloadButton.disabled = true;
    try {
      const files = await collectWebappFiles(WEBAPP_BASE_URL, {
        includeSamples: includeSamplesInput.checked,
      });
      const zip = createZip(
        files.map((file) => ({
          path: `${WEBAPP_BUNDLE_FOLDER}/${file.path}`,
          data: file.data,
        })),
      );
      const fileName = `${WEBAPP_BUNDLE_FOLDER}.zip`;
      const url = URL.createObjectURL(
        new Blob([zip], { type: "application/zip" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus(`Downloaded ${fileName} (${files.length} files).`, "success");
    } catch (error) {
      console.error(error);
      setStatus(
        "Could not load the web app files from this site. The web app may not be published alongside the wizard.",
        "error",
      );
    } finally {
      downloadButton.disabled = false;
    }
  });
})();

/*
 * Theme selector: toggles the menu and applies System / Light / Dark themes.
 * Light/Dark persist via the URL hash (read by the inline boot script), while
 * System clears the hash and follows the OS preference.
 */
(function initThemeSelect() {
  const root = document.documentElement;
  const select = document.getElementById("theme-select");
  const button = document.getElementById("theme-select-button");
  const menu = document.getElementById("theme-select-menu");
  const label = document.getElementById("theme-select-label");
  const currentIcon = document.getElementById("theme-select-current-icon");

  if (!select || !button || !menu || !label || !currentIcon) {
    return;
  }

  const options = Array.from(menu.querySelectorAll(".theme-select-option"));

  const META = {
    system: { label: "System", icon: "icon-laptop-regular" },
    light: { label: "Light", icon: "icon-brightness-high-filled" },
    dark: { label: "Dark", icon: "icon-quiet-hours-presence-filled" },
  };
  const ICON_CLASSES = Object.values(META).map((meta) => meta.icon);

  const readChoice = () => {
    const raw = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const theme = raw ? new URLSearchParams(raw).get("theme") : null;
    return theme === "light" || theme === "dark" ? theme : "system";
  };

  const applyTheme = (choice) => {
    const dark =
      choice === "dark" ||
      (choice === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.remove(
      "mds-theme-stable-lightWebex",
      "mds-theme-stable-darkWebex",
    );
    root.classList.add(
      dark ? "mds-theme-stable-darkWebex" : "mds-theme-stable-lightWebex",
    );
    root.style.colorScheme = dark ? "dark" : "light";
  };

  const syncButton = (choice) => {
    const meta = META[choice] || META.system;
    label.textContent = meta.label;
    currentIcon.classList.remove(...ICON_CLASSES);
    currentIcon.classList.add(meta.icon);
    options.forEach((option) => {
      option.setAttribute(
        "aria-selected",
        String(option.dataset.themeChoice === choice),
      );
    });
  };

  const setChoice = (choice) => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (choice === "system") {
      params.delete("theme");
    } else {
      params.set("theme", choice);
    }
    const hash = params.toString();
    history.replaceState(
      null,
      "",
      window.location.pathname +
        window.location.search +
        (hash ? `#${hash}` : ""),
    );
    applyTheme(choice);
    syncButton(choice);
  };

  const openMenu = () => {
    menu.hidden = false;
    select.dataset.open = "true";
    button.setAttribute("aria-expanded", "true");
  };

  const closeMenu = () => {
    menu.hidden = true;
    select.dataset.open = "false";
    button.setAttribute("aria-expanded", "false");
  };

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (menu.hidden) {
      openMenu();
    } else {
      closeMenu();
    }
  });

  options.forEach((option) => {
    option.addEventListener("click", () => {
      setChoice(option.dataset.themeChoice);
      closeMenu();
      button.focus();
    });
  });

  document.addEventListener("click", (event) => {
    if (!select.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      closeMenu();
      button.focus();
    }
  });

  syncButton(readChoice());
})();

/* Tab list: toggles which panel is visible. */
(function initTabs() {
  const tabs = Array.from(document.querySelectorAll(".tab"));
  if (!tabs.length) {
    return;
  }

  // Friendly "#tab=" values, mapped to the panel ids. The panel ids
  // themselves (general / export / hosting) are accepted too.
  const TAB_ALIASES = {
    configure: "general",
    macro: "export",
    webapp: "hosting",
  };
  const aliasFor = (panelId) =>
    Object.keys(TAB_ALIASES).find((key) => TAB_ALIASES[key] === panelId);

  const activateById = (id) => {
    const tab = tabs.find(
      (current) => current.dataset.tabTarget === (TAB_ALIASES[id] ?? id),
    );
    if (tab) activate(tab);
  };

  // Keeps "#tab=" in the URL in step with the open tab (preserving "theme"),
  // so the address bar is always a shareable link to the current tab.
  const syncHash = (tab) => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    params.set("tab", aliasFor(tab.dataset.tabTarget) ?? tab.dataset.tabTarget);
    history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${params}`,
    );
  };

  const activate = (tab) => {
    tabs.forEach((current) => {
      const selected = current === tab;
      current.setAttribute("aria-selected", String(selected));
      current.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(current.dataset.tabTarget);
      if (panel) {
        panel.hidden = !selected;
      }
    });
  };

  // In-page links (e.g. from the hosting steps) that jump to another tab.
  document.querySelectorAll("[data-tab-link]").forEach((link) => {
    link.addEventListener("click", () => {
      activateById(link.dataset.tabLink);
      const target = document.getElementById(`tab-${link.dataset.tabLink}`);
      if (target) syncHash(target);
      document.getElementById(`tab-${link.dataset.tabLink}`)?.focus();
    });
  });

  // "#tab=configure|macro|webapp" opens a tab directly (shareable links and
  // documentation screenshots).
  const readHashTab = () =>
    new URLSearchParams(window.location.hash.replace(/^#/, "")).get("tab");
  const initialTab = readHashTab();
  if (initialTab) activateById(initialTab);
  window.addEventListener("hashchange", () => {
    const requested = readHashTab();
    if (requested) activateById(requested);
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      activate(tab);
      syncHash(tab);
    });
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      next.focus();
      activate(next);
      syncHash(next);
    });
  });
})();
