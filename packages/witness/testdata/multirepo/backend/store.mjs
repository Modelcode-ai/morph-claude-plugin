// Holds the greeting word; the api reads it over HTTP.
import http from "node:http";

const srv = http.createServer((req, res) => {
  if (req.url === "/health") return res.end("ok");
  if (req.url === "/word") return res.end("hello");
  res.writeHead(404).end();
});
srv.listen(Number(process.env.PORT), "127.0.0.1");
process.on("SIGTERM", () => srv.close(() => process.exit(0)));
