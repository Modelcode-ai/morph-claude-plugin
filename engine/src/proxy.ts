import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as zlib from "node:zlib";

export const TEST_HEADER = "x-witness-test";
const MAX_BODY = 64 * 1024;

export interface Exchange {
  seq: number;
  side: string;
  run: string;
  test: string | null;
  ts: number;
  ms: number;
  method: string;
  path: string;
  reqHeaders: Record<string, string>;
  reqBody: string;
  status: number;
  resHeaders: Record<string, string>;
  resBody: string;
  truncated?: boolean;
  error?: string;
  /** Path actually sent upstream when a route map rewrote it. */
  upstreamPath?: string;
}

const KEEP_HEADERS = new Set(["content-type", "location", "accept", "authorization", "content-length"]);

function pickHeaders(h: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) if (KEEP_HEADERS.has(k) && v != null) out[k] = Array.isArray(v) ? v.join(", ") : v;
  if (out.authorization) out.authorization = "[redacted]";
  return out;
}

function decode(b: Buffer, encoding: string | string[] | undefined): Buffer {
  const enc = String(encoding ?? "").toLowerCase();
  try {
    if (enc.includes("gzip")) return zlib.gunzipSync(b);
    if (enc.includes("br")) return zlib.brotliDecompressSync(b);
    if (enc.includes("deflate")) return zlib.inflateSync(b);
  } catch {
    /* keep raw bytes */
  }
  return b;
}

const SECRET_KEY = /pass(word)?|secret|token|api[-_]?key|credential/i;

/** Mask values of secret-looking JSON fields so records are safe to share. */
export function redact(body: string): string {
  if (!SECRET_KEY.test(body)) return body;
  try {
    const walk = (v: any): any =>
      Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEY.test(k) && typeof x !== "object" ? "[redacted]" : walk(x)])) : v;
    return JSON.stringify(walk(JSON.parse(body)));
  } catch {
    return body;
  }
}

const clip = (b: Buffer) => (b.length > MAX_BODY ? b.subarray(0, MAX_BODY).toString("utf8") : b.toString("utf8"));

/** Recording reverse proxy. Strips the attribution header before forwarding. */
export class RecordingProxy {
  exchanges: Exchange[] = [];
  run = "primary";
  private server: http.Server;
  private seq = 0;
  port = 0;

  private target: { host: string; port: number };
  side: string;

  private rewrite: (url: string) => string;

  constructor(target: { host: string; port: number }, side: string, rewrite: (url: string) => string = (u) => u) {
    this.target = target;
    this.side = side;
    this.rewrite = rewrite;
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  listen(host = "127.0.0.1"): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(0, host, () => {
        this.port = (this.server.address() as AddressInfo).port;
        resolve(this.port);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((r) => {
      this.server.closeAllConnections?.();
      this.server.close(() => r());
    });
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const t0 = Date.now();
      const testHeader = req.headers[TEST_HEADER];
      const test = (Array.isArray(testHeader) ? testHeader[0] : testHeader) ?? null;
      const headers = { ...req.headers };
      delete headers[TEST_HEADER];
      headers.host = `${this.target.host}:${this.target.port}`;
      const ex: Exchange = {
        seq: ++this.seq,
        side: this.side,
        run: this.run,
        test,
        ts: t0,
        ms: 0,
        method: req.method ?? "GET",
        path: req.url ?? "/",
        reqHeaders: pickHeaders(req.headers),
        reqBody: redact(clip(body)),
        status: 0,
        resHeaders: {},
        resBody: "",
      };
      const upstreamPath = this.rewrite(req.url ?? "/");
      if (upstreamPath !== req.url) ex.upstreamPath = upstreamPath;
      const up = http.request(
        { host: this.target.host, port: this.target.port, method: req.method, path: upstreamPath, headers },
        (upRes) => {
          const out: Buffer[] = [];
          upRes.on("data", (c) => out.push(c));
          upRes.on("end", () => {
            const resBody = Buffer.concat(out);
            ex.status = upRes.statusCode ?? 0;
            ex.resHeaders = pickHeaders(upRes.headers);
            const ctype = String(upRes.headers["content-type"] ?? "");
            ex.resBody = /^(image|font|audio|video)\/|octet-stream|zip|pdf|wasm/.test(ctype)
              ? `[binary ${ctype.split(";")[0]}, ${resBody.length} bytes]`
              : redact(clip(decode(resBody, upRes.headers["content-encoding"])));
            ex.truncated = resBody.length > MAX_BODY || body.length > MAX_BODY;
            ex.ms = Date.now() - t0;
            this.exchanges.push(ex);
            res.writeHead(upRes.statusCode ?? 502, upRes.headers);
            res.end(resBody);
          });
        },
      );
      up.on("error", (e) => {
        ex.status = 502;
        ex.error = e.message;
        ex.ms = Date.now() - t0;
        this.exchanges.push(ex);
        res.writeHead(502, { "content-type": "text/plain" });
        res.end(`witness proxy: upstream error: ${e.message}`);
      });
      up.end(body);
    });
  }
}
