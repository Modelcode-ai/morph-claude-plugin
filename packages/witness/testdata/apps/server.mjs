// Tiny HTTP service for witness integration tests. Usage: node server.mjs <mode>
import http from "node:http";

const mode = process.argv[2] ?? "ok";
const port = Number(process.env.FIXED_PORT ?? process.env.PORT ?? 0);
if (mode === "missing-module") {
  console.error("Traceback (most recent call last):\nModuleNotFoundError: No module named 'fastapi'");
  process.exit(1);
}
if (mode === "dep-refused") {
  console.error("Error: connect ECONNREFUSED 127.0.0.1:5432");
  process.exit(1);
}
let ready = mode !== "never-ready";
const srv = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(ready ? 200 : 503);
    return res.end(ready ? "ok" : "starting");
  }
  if (req.url === "/hello") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ hello: process.env.GREETING ?? "world" }));
  }
  res.writeHead(404);
  res.end();
});
srv.on("error", (e) => {
  console.error(`Error: listen ${e.code}: address already in use 127.0.0.1:${port}`);
  process.exit(1);
});
srv.listen(port, "127.0.0.1", () => {
  console.log(`listening on ${srv.address().port} (${mode})`);
  if (mode === "crash-after-ready") setTimeout(() => {
    console.error("FATAL: out of memory (simulated)");
    process.exit(137);
  }, 1500);
});
process.on("SIGTERM", () => srv.close(() => process.exit(0)));
