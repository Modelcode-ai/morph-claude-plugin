const http = require("node:http");
http.createServer((req, res) => res.end("ok")).listen(process.env.PORT ?? 3000);
