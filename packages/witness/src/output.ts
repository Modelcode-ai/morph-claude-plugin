import { fmtClock } from "./util.ts";

const useColor = process.stderr.isTTY && !process.env.NO_COLOR;
const c = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const color = { dim: c("2"), bold: c("1"), red: c("31"), green: c("32"), yellow: c("33") };

export class Progress {
  t0: number;
  quiet: boolean;
  lastAt = 0;
  constructor(t0 = Date.now(), quiet = false) {
    this.t0 = t0;
    this.quiet = quiet;
  }
  line(msg: string) {
    this.lastAt = Date.now();
    if (this.quiet) return;
    process.stderr.write(`witness  ${color.dim(`[${fmtClock(Date.now() - this.t0)}]`)} ${msg}\n`);
  }
  plain(msg: string) {
    if (!this.quiet) process.stderr.write(`witness  ${msg}\n`);
  }
}

export function outcomeColor(outcome: string): (s: string) => string {
  return outcome === "passed" ? color.green : outcome === "failed" ? color.red : color.yellow;
}
