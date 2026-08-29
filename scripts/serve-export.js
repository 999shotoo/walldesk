/**
 * Minimal static file server for the `out/` export.
 *
 * Only used to exercise the shipped build in a browser — Tauri serves these
 * same files from disk, and `next start` does not support `output: export`.
 */
const http = require("http")
const fs = require("fs")
const path = require("path")

const ROOT = path.join(__dirname, "..", "out")
const PORT = Number(process.env.PORT || 3100)

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  // The App Router's RSC payloads for a static export. Load-bearing: the client
  // only treats a response as a flight payload when the type starts with
  // `text/x-component` or `text/plain`, and falls back to a full page reload
  // otherwise. Served as `application/octet-stream` (the old default here) every
  // client navigation became a hard document load, which looks exactly like a
  // broken page transition.
  ".txt": "text/x-component; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0])
    const candidates = [
      path.join(ROOT, url),
      path.join(ROOT, url + ".html"),
      path.join(ROOT, url, "index.html"),
    ]
    const hit = candidates.find(
      (p) => fs.existsSync(p) && fs.statSync(p).isFile()
    )
    if (!hit) {
      res.writeHead(404, { "content-type": "text/plain" })
      res.end("not found: " + url)
      return
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(hit)] || "application/octet-stream",
      "cache-control": "no-store",
    })
    fs.createReadStream(hit).pipe(res)
  })
  .listen(PORT, () => console.log("serving out/ on http://localhost:" + PORT))
