import { startStaticServer } from "./lib/server.mjs";

const root = process.cwd();
const port = Number(process.env.PORT) || 8080;

const { url } = await startStaticServer({ root, port });

console.log(`Serving ${root}`);
console.log(`  Root:   ${url}/`);
console.log(`  Wizard: ${url}/wizard/`);
console.log(`  Webapp: ${url}/webapp/`);
console.log("\nPress Ctrl+C to stop.");
