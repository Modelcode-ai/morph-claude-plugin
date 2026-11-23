import * as fs from "node:fs";
import { parseGoJson } from "./gotest.ts";
import { parseJestJson } from "./jest.ts";
import { parseJUnit } from "./junit.ts";
import { parsePlaywright } from "./playwright.ts";
import { parseTrx } from "./trx.ts";
import { type ParsedFile, type RawCase, ReportError, type ReportFormat } from "./types.ts";

export * from "./types.ts";

/** Parse one report; the format is sniffed from the content, the hint breaks ties. */
export function parseReportText(text: string, hint?: ReportFormat, cwd?: string): { format: ReportFormat; cases: RawCase[]; partial?: string } {
  const body = text.replace(/^﻿/, "").trim();
  if (!body) throw new ReportError("empty report");
  if (hint === "go-json") {
    const info: { cut?: string } = {};
    return { format: "go-json", cases: parseGoJson(body, info), partial: info.cut };
  }
  if (body.startsWith("<")) {
    if (/<TestRun[\s>]/.test(body.slice(0, 4000))) return { format: "trx", cases: parseTrx(body) };
    return { format: "junit", cases: parseJUnit(body) };
  }
  if (body.startsWith("{") || body.startsWith("[")) {
    let doc: unknown;
    try {
      doc = JSON.parse(body);
    } catch (e) {
      if (/^\{"(Time|Action)"/.test(body)) return { format: "go-json", cases: parseGoJson(body) };
      throw new ReportError(`invalid JSON: ${(e as Error).message}`);
    }
    const o = doc as Record<string, unknown>;
    if (o && typeof o === "object" && "testResults" in o) return { format: "jest-json", cases: parseJestJson(o, cwd) };
    if (o && typeof o === "object" && "suites" in o) return { format: "playwright-json", cases: parsePlaywright(o) };
    if (o && typeof o === "object" && "Action" in o) return { format: "go-json", cases: parseGoJson(body) };
    throw new ReportError("unrecognised JSON report");
  }
  throw new ReportError("unrecognised report format");
}

export function parseReportFile(file: string, hint?: ReportFormat, cwd?: string): ParsedFile {
  try {
    const { format, cases, partial } = parseReportText(fs.readFileSync(file, "utf8"), hint, cwd);
    return partial ? { file, format, cases, partial } : { file, format, cases };
  } catch (e) {
    return { file, cases: [], error: e instanceof ReportError ? e.message : `unreadable: ${(e as Error).message}` };
  }
}
