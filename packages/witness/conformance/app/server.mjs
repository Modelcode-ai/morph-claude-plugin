// The app every kit project tests: JSON endpoints, one HTML page, and URLs that never answer (for timeouts).
import http from "node:http";

const items = [
  { id: 1, name: "apple" },
  { id: 2, name: "pear" },
];
const page = `<!doctype html>
<html>
  <head><title>Witness kit</title></head>
  <body>
    <h1 id="title">Items</h1>
    <ul id="items">${items.map((i) => `<li>${i.name}</li>`).join("")}</ul>
  </body>
</html>
`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const json = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/health") return json(200, { ok: true });
  if (url.pathname === "/api/items") return json(200, items);
  const m = /^\/api\/items\/(\d+)$/.exec(url.pathname);
  if (m) {
    const item = items.find((i) => i.id === Number(m[1]));
    return item ? json(200, item) : json(404, { error: "not found" });
  }
  if (url.pathname === "/api/hang" || url.pathname === "/hang") return;
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(page);
  }
  json(404, { error: "not found" });
});

server.listen(Number(process.env.PORT ?? 8080), process.env.HOST ?? "127.0.0.1", () => console.log(`kit app on ${process.env.HOST ?? "127.0.0.1"}:${server.address().port}`));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => process.exit(0));
