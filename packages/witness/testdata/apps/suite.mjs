// Fake test suite that writes JUnit XML to $WITNESS_REPORT_DIR. Usage: node suite.mjs <mode> [--only <id>]
import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2] ?? "pass";
const only = process.argv.includes("--only") ? process.argv.slice(process.argv.indexOf("--only") + 1) : null;
const dir = process.env.WITNESS_REPORT_DIR;
const base = process.env.WITNESS_API_URL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cases = [
  { cls: "Calc", name: "add", ok: true },
  { cls: "Calc", name: "sub", ok: mode !== "fail" },
  { cls: "Api", name: "hello", ok: true },
];
if (process.env.EXTRA_TEST) cases.push({ cls: "Api", name: process.env.EXTRA_TEST, ok: true });
if (process.env.FLIP) for (const c of cases) if (`${c.cls}#${c.name}` === process.env.FLIP) c.ok = false;

const FIXTURE = "Class fixture type 'BrowserFixture' threw in InitializeAsync";
if (process.env.FIXTURE_ERROR) for (const c of cases) c.ok = false;

function junit(list) {
  const fail = process.env.FIXTURE_ERROR ? `<failure message="${FIXTURE}">${FIXTURE}</failure>` : `<failure message="expected 1 got 2">AssertionError: expected 1 got 2</failure>`;
  const body = list
    .map((c) => `<testcase classname="${c.cls}" name="${c.name}" time="0.01">${process.env.SKIP_ALL ? "<skipped/>" : c.ok ? "" : fail}</testcase>`)
    .join("\n    ");
  return `<?xml version="1.0"?>\n<testsuites>\n  <testsuite name="fake">\n    ${body}\n  </testsuite>\n</testsuites>\n`;
}

async function main() {
  console.log(`fake suite: ${mode}${only ? ` only ${only.join(" ")}` : ""}`);
  if (base) {
    const r = await fetch(`${base}/hello`);
    console.log(`GET /hello -> ${r.status}`);
  }
  const list = only ? cases.filter((c) => only.includes(`${c.cls}#${c.name}`)) : cases;
  switch (mode) {
    case "hang":
      console.log("waiting forever");
      setInterval(() => {}, 1 << 30);
      break;
    case "slow":
      for (let i = 0; i < 100; i++) {
        console.log(`tick ${i}`);
        if (base) await fetch(`${base}/health`).catch(() => console.log("service unreachable"));
        await sleep(300);
      }
      break;
    case "broken-xml":
      if (only?.length === 1) {
        fs.writeFileSync(path.join(dir, "junit.xml"), junit(list));
        process.exit(list.every((c) => c.ok) ? 0 : 1);
      }
      fs.writeFileSync(path.join(dir, "junit.xml"), junit(list).slice(0, 120));
      console.error("Segmentation fault (core dumped)");
      process.exit(1);
    case "passed-nonzero":
      fs.writeFileSync(path.join(dir, "junit.xml"), junit(list));
      console.error("ERROR: coverage 41% is below the 80% threshold");
      process.exit(1);
    case "no-report":
      process.exit(0);
    case "artifacts": {
      const a = path.join(process.env.WITNESS_ARTIFACTS, "generic_Api_hello");
      fs.mkdirSync(a, { recursive: true });
      fs.writeFileSync(path.join(a, "01-home.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      fs.writeFileSync(path.join(a, "server.log"), "GET /hello 200\n");
      fs.writeFileSync(path.join(dir, "junit.xml"), junit(list));
      break;
    }
    default:
      fs.writeFileSync(path.join(dir, "junit.xml"), junit(list));
      process.exit(list.every((c) => c.ok) ? 0 : 1);
  }
}
main();
