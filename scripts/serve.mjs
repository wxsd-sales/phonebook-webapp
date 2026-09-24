import { networkInterfaces } from "node:os";
import { startStaticServer } from "./server.mjs";

const root = process.cwd();
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || "127.0.0.1";

/** First non-loopback IPv4 address, if any (best-effort LAN IP guess). */
function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const { address, family, internal } of addresses ?? []) {
      if (family === "IPv4" && !internal) return address;
    }
  }
  return null;
}

const { url, port: actualPort } = await startStaticServer({
  root,
  port,
  host,
});

function printUrls(baseUrl) {
  console.log(`  Root:   ${baseUrl}/`);
  console.log(`  Wizard: ${baseUrl}/wizard/`);
  console.log(`  Webapp: ${baseUrl}/webapp/`);
}

console.log(`Serving ${root}`);
printUrls(url);

// When bound to a wildcard address, "http://0.0.0.0:PORT" isn't something
// another device can actually open, so print a real LAN URL alongside it.
if (host === "0.0.0.0" || host === "::") {
  const lanIp = lanAddress();
  if (lanIp) {
    console.log(`\nOn your LAN:`);
    printUrls(`http://${lanIp}:${actualPort}`);
  }
}

console.log("\nPress Ctrl+C to stop.");
