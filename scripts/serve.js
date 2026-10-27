/* Tiny dependency-free static server for previewing this site on your own
   computer. Not part of the website — you can delete it.
     node scripts/serve.js            → http://127.0.0.1:4173
     node scripts/serve.js 8080       → http://127.0.0.1:8080                          */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2] || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[\/\\])+/, ""));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": TYPES[".html"] }).end("<h1>404</h1>");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    }).end(buf);
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log("ICHHAPUR market guide → http://127.0.0.1:" + PORT);
});
