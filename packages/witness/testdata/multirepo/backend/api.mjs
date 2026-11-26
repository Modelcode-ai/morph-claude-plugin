// GET /api/greeting -> {"greeting": "<word from the store>, <GREETING_NAME>"}
import http from "node:http";
import { greet } from "./greeting.mjs";

const srv = http.createServer(async (req, res) => {
  if (req.url === "/health") return res.end("ok");
  if (req.url === "/api/greeting") {
    const word = await (await fetch(`${process.env.STORE_URL}/word`)).text();
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ greeting: greet(word, process.env.GREETING_NAME ?? "world") }));
  }
  res.writeHead(404).end();
});
srv.listen(Number(process.env.PORT), "127.0.0.1");
process.on("SIGTERM", () => srv.close(() => process.exit(0)));
