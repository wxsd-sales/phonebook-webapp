import { buildSnippet, injectConfig } from "./snippet.js";

const config = window.APP_CONFIG ?? {};

// The macro source is published alongside the wizard on GitHub Pages so the
// "Download macro" action can fetch it and inject the configured values.
const MACRO_SOURCE_URL = "../macros/main.js";

/* Header: product name and source-code link derived from APP_CONFIG. */
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
  const webappUrlInput = document.getElementById("webapp-url");
  const output = document.getElementById("output");
  const copyButton = document.getElementById("copy-button");
  const downloadButton = document.getElementById("download-button");
  const exportStatus = document.getElementById("export-status");

  if (!buttonNameInput || !webappUrlInput || !output) {
    return;
  }

  buttonNameInput.value = config.name ?? "";
  webappUrlInput.value = config.webappUrl ?? "";

  const getValues = () => ({
    name: buttonNameInput.value.trim(),
    webappUrl: webappUrlInput.value.trim(),
  });

  const downloadName = () => {
    const base =
      (getValues().name || config.name || "macro")
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

  const updatePreview = () => {
    // Assign via textContent (never innerHTML) so user input is treated as text.
    output.textContent = buildSnippet(getValues());
  };

  buttonNameInput.addEventListener("input", updatePreview);
  webappUrlInput.addEventListener("input", updatePreview);
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
    if (choice === "system") {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    } else {
      window.location.hash = "theme=" + choice;
    }
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

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      next.focus();
      activate(next);
    });
  });
})();
