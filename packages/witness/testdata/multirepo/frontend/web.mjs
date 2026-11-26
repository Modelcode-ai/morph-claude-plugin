// Renders the backend's greeting as a page.
import http from "node:http";

const srv = http.createServer(async (req, res) => {
  if (req.url === "/health") return res.end("ok");
  if (req.url === "/") {
    const { greeting } = await (await fetch(`${process.env.API_URL}/api/greeting`)).json();
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(`<html><body><h1 class="greeting">${greeting}</h1></body></html>`);
  }
  res.writeHead(404).end();
});
srv.listen(Number(process.env.PORT), "127.0.0.1");
process.on("SIGTERM", () => srv.close(() => process.exit(0)));
