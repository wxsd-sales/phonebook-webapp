import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * Start a tiny static file server rooted at `root`.
 * Used by both `npm run serve` and the screenshot script.
 *
 * @param {{ root: string, port?: number, host?: string }} options
 * @returns {Promise<{ server: import("node:http").Server, port: number, url: string, close: () => Promise<void> }>}
 */
export function startStaticServer({ root, port = 0, host = "127.0.0.1" }) {
  const rootNormalized = normalize(root);
  const rootPrefix = rootNormalized.endsWith(sep)
    ? rootNormalized
    : rootNormalized + sep;

  const server = http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", `http://${host}`);
      const decodedPath = decodeURIComponent(requestUrl.pathname);
      // Canonicalize and confine every request to the served root
      // (defense against path traversal such as `/../secret`).
      let filePath = normalize(join(rootNormalized, decodedPath));
      if (filePath !== rootNormalized && !filePath.startsWith(rootPrefix)) {
        res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }

      if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        filePath = join(filePath, "index.html");
      }

      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      res.writeHead(200, {
        "content-type":
          MIME_TYPES[extname(filePath).toLowerCase()] ??
          "application/octet-stream",
        "cache-control": "no-store",
      });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Internal server error");
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        server,
        port: actualPort,
        url: `http://${host}:${actualPort}`,
        close: () =>
          new Promise((res) => server.close(() => res(undefined))),
      });
    });
  });
}
