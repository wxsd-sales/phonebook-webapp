import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import jsxapi from "jsxapi";

/*
 * Upload a macro to a Webex device over xAPI (jsxapi). Credentials come from
 * environment variables only - never hardcode device passwords.
 *
 *   DEVICE_HOST      device hostname or IP (required)
 *   DEVICE_USERNAME  admin user (required)
 *   DEVICE_PASSWORD  admin password (required, may be empty for some setups)
 *   DEVICE_PROTOCOL  ssh (default) or wss
 *   MACRO_FILE       macro to deploy (default: macros/main.js)
 *   MACRO_NAME       macro name on the device (default: file name without .js)
 *   MACRO_ACTIVATE   "false" to upload without enabling (default: true)
 */

const { connect } = jsxapi;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function connectDevice(target, options) {
  return new Promise((resolvePromise, reject) => {
    const xapi = connect(target, options);
    xapi.on("error", reject);
    xapi.on("ready", () => resolvePromise(xapi));
  });
}

async function main() {
  const host = process.env.DEVICE_HOST || process.env.DEVICE;
  const username = process.env.DEVICE_USERNAME;
  const password = process.env.DEVICE_PASSWORD ?? "";

  if (!host) throw new Error("Set DEVICE_HOST to the device hostname or IP.");
  if (!username) {
    throw new Error("Set DEVICE_USERNAME to a device admin user.");
  }

  const protocol = process.env.DEVICE_PROTOCOL || "ssh";
  const macroFile = process.env.MACRO_FILE || "macros/main.js";
  const macroPath = resolve(ROOT, macroFile);
  const macroName =
    process.env.MACRO_NAME || basename(macroFile).replace(/\.js$/i, "");
  const activate = !/^(false|0|no)$/i.test(
    process.env.MACRO_ACTIVATE ?? "true",
  );

  const body = await readFile(macroPath, "utf8");
  const target = `${protocol}://${host}`;

  console.log(`Connecting to ${host} as ${username}...`);
  const xapi = await connectDevice(target, { username, password });
  try {
    console.log(`Uploading macro "${macroName}" from ${macroFile}...`);
    await xapi.command(
      "Macros.Macro.Save",
      { Name: macroName, Overwrite: "True", Transpile: "False" },
      body,
    );

    if (activate) {
      await xapi.command("Macros.Macro.Activate", { Name: macroName });
      await xapi.command("Macros.Runtime.Restart");
      console.log(`Activated "${macroName}" and restarted the macro runtime.`);
    } else {
      console.log(`Uploaded "${macroName}" (not activated).`);
    }
  } finally {
    xapi.close();
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
