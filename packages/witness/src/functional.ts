import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import type { AdapterName } from "./adapters.ts";
import type { Config, Kind } from "./config.ts";
import { expandArgs, findTests, type Lang, langOf, mask } from "./lint.ts";
import { globFiles, shellWords } from "./util.ts";

type SigType = "api" | "http" | "call" | "host" | "url" | "self" | "ui" | "db" | "httpmock" | "note" | "cli" | "exec" | "desktop" | "mobile";

/** Languages the classifier reads; the extra ones are masked as the lint language in `as`. */
export type FLang = Lang | "rs" | "sh" | "swift" | "dart";
const EXTRA: Record<string, { lang: FLang; as: Lang }> = {
  ".rs": { lang: "rs", as: "go" },
  ".bats": { lang: "sh", as: "rb" },
  ".swift": { lang: "swift", as: "go" },
  ".dart": { lang: "dart", as: "js" },
};

export function fLangOf(file: string): { lang: FLang; as: Lang } | undefined {
  const l = langOf(file);
  return l ? { lang: l, as: l } : EXTRA[path.extname(file).toLowerCase()];
}

interface Rule {
  langs: FLang[];
  type: SigType;
  label: string;
  /** Matched on masked code. When it ends at a quote, `arg` must match the raw string that follows. */
  code?: RegExp;
  arg?: RegExp;
  /** Matched against each imported module name. */
  mod?: RegExp;
  /** Matched on raw lines that still hold a string literal after masking. */
  lit?: RegExp;
}

const MAX_SCAN = 4000;
const URLISH = /URL|HOST|ORIGIN|ENDPOINT|BASE/i;
const LOCALHOST = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0):\d+|https?:\/\/localhost\b/;
const ALL: Lang[] = ["py", "js", "cs", "java", "go", "rb", "php"];

const RULES: Rule[] = [
  { langs: ["py"], type: "host", label: "TestClient", mod: /^(fastapi|starlette)\.testclient$/ },
  { langs: ["py"], type: "host", label: "TestClient", code: /\bTestClient\s*\(/ },
  { langs: ["py"], type: "host", label: "httpx ASGI/WSGI transport", code: /\b(ASGITransport|WSGITransport)\s*\(|\bAsyncClient\s*\(\s*app\s*=/ },
  { langs: ["py"], type: "host", label: "Flask test_client", code: /\.test_client\s*\(/ },
  { langs: ["py"], type: "host", label: "Django/DRF test client", code: /\bAPIClient\s*\(|\bAPITestCase\b|\bLiveServerTestCase\b|\blive_server\b/ },
  { langs: ["py"], type: "api", label: "Django test client", code: /\bself\.client\.(get|post|put|patch|delete|head|options)\s*\(/ },
  { langs: ["py"], type: "http", label: "HTTP requests on a client", code: /\b\w*client\.(get|post|put|patch|delete|head|options|request)\s*\(\s*(?:f|rf|fr)?["']/i, arg: /^(\/|https?:|\{)/ },
  { langs: ["py"], type: "api", label: "TestClient", code: /\bTestClient\s*\([^()]*\)\s*\.(get|post|put|patch|delete|head|options|request)\s*\(/ },
  { langs: ["py"], type: "call", label: "HTTP requests on a client", code: /\b\w*client\.(get|post|put|patch|delete|head|options|request|stream)\s*\(/i },
  { langs: ["py"], type: "call", label: "HTTP requests on a client", code: /\)\s*\.(get|post|put|patch|delete|head|options)\s*\(\s*(?:f|rf|fr)?["']/, arg: /^\// },
  { langs: ["py"], type: "http", label: "requests/httpx calls", code: /\b(requests|httpx|session|aiohttp)\.(get|post|put|patch|delete|head|request)\s*\(/ },
  { langs: ["py"], type: "url", label: "base URL from the environment", code: /\bos\.(?:environ\s*(?:\.get\s*\(|\[)|getenv\s*\()\s*["']/, arg: URLISH },
  { langs: ["py"], type: "ui", label: "browser driver", mod: /^(playwright|selenium|splinter|pyppeteer|pytest_playwright)\b/ },
  { langs: ["py"], type: "ui", label: "browser driver", code: /\bpage\.goto\s*\(/ },
  { langs: ["py"], type: "self", label: "starts a server", code: /\bsubprocess\.Popen\s*\(|\buvicorn\.(run|Server)\b/ },
  { langs: ["py"], type: "db", label: "database", mod: /^(sqlalchemy|sqlmodel|psycopg2?|asyncpg|pymongo|motor|redis|aiosqlite|sqlite3|alembic)\b/ },
  { langs: ["py"], type: "db", label: "database", code: /@pytest\.mark\.django_db\b/ },
  { langs: ["py"], type: "httpmock", label: "HTTP mock", mod: /^(responses|requests_mock|respx|httpretty|aioresponses|vcr|pytest_httpx)\b/ },
  { langs: ["py"], type: "httpmock", label: "HTTP mock", code: /\bpatch(\.object)?\s*\(\s*["']/, arg: /^(requests|httpx|aiohttp|urllib)\b/ },

  { langs: ["js"], type: "host", label: "supertest", mod: /^supertest$/ },
  { langs: ["js"], type: "api", label: "supertest request(app)", code: /\brequest\s*\(\s*[\w.]+\s*\)\s*\.(get|post|put|patch|delete|head|options)\s*\(/ },
  { langs: ["js"], type: "api", label: "fastify inject", code: /\.inject\s*\(\s*\{/ },
  { langs: ["js"], type: "api", label: "app.request", code: /\bapp\.request\s*\(/ },
  { langs: ["js"], type: "host", label: "app server started in the test", code: /\bapp\.listen\s*\(|\bcreateServer\s*\(\s*app\b/ },
  { langs: ["js"], type: "http", label: "HTTP client calls", code: /\bfetch\s*\(|\baxios(\.\w+)?\s*\(|\bgot(\.\w+)?\s*\(/ },
  { langs: ["js"], type: "http", label: "HTTP client", mod: /^(axios|got|ky|undici|node-fetch|superagent)$/ },
  { langs: ["js"], type: "url", label: "base URL from the environment", code: /\bprocess\.env\.\w*(URL|HOST|ORIGIN|ENDPOINT|BASE)\w*/i },
  { langs: ["js"], type: "url", label: "base URL from the environment", code: /\bprocess\.env\[\s*["'`]/, arg: URLISH },
  { langs: ["js"], type: "ui", label: "browser driver", mod: /^(playwright|playwright-core|puppeteer|puppeteer-core|selenium-webdriver|webdriverio|cypress|testcafe|nightwatch)$|^@wdio\// },
  { langs: ["js"], type: "ui", label: "browser driver", code: /\bcy\.(visit|get|contains|request)\s*\(|\bpage\.(goto|click|fill|locator|getBy\w+|waitFor\w*)\s*\(|\bbrowser\.url\s*\(/ },
  { langs: ["js"], type: "http", label: "Playwright request", code: /\brequest\.(get|post|put|patch|delete|fetch|head)\s*\(/ },
  { langs: ["js"], type: "url", label: "baseURL", code: /\bbaseURL\s*:/ },
  { langs: ["js"], type: "self", label: "Playwright webServer", code: /\bwebServer\s*:/ },
  { langs: ["js"], type: "db", label: "database", mod: /^(@prisma\/client|knex|typeorm|mongoose|pg|mysql2|sequelize|drizzle-orm|ioredis|redis|mongodb|better-sqlite3)$/ },
  { langs: ["js"], type: "httpmock", label: "HTTP mock", mod: /^(nock|msw|msw\/node|fetch-mock|jest-fetch-mock|axios-mock-adapter)$/ },
  { langs: ["js"], type: "httpmock", label: "HTTP mock", code: /\b(global|globalThis|window)\.fetch\s*=|\bspyOn\s*\(\s*(global|globalThis|window)\b/ },
  { langs: ["js"], type: "httpmock", label: "HTTP mock", code: /\b(jest|vi)\.mock\s*\(\s*["'`]/, arg: /^(axios|node-fetch|got|ky)\b/ },

  { langs: ["cs"], type: "host", label: "WebApplicationFactory", code: /\bWebApplicationFactory\s*</ },
  { langs: ["cs"], type: "host", label: "TestServer", code: /\bnew\s+TestServer\s*\(|\bUseTestServer\s*\(/ },
  { langs: ["cs"], type: "host", label: "Microsoft.AspNetCore.Mvc.Testing", mod: /^Microsoft\.AspNetCore\.(Mvc\.Testing|TestHost)$/ },
  { langs: ["cs"], type: "host", label: "Aspire CreateHttpClient", code: /\bCreateHttpClient\s*\(/ },
  { langs: ["cs"], type: "http", label: "HttpClient calls", code: /\bHttp(Client|RequestMessage|ResponseMessage|StatusCode|Method)\b|\.(Post|Put|Patch)AsJsonAsync\s*\(|\.GetFromJsonAsync\s*[(<]|\bGet(String|ByteArray|Stream)Async\s*\(/ },
  { langs: ["cs"], type: "http", label: "HttpClient calls", code: /\.(Get|Post|Put|Patch|Delete)Async\s*\(\s*\$?@?"/, arg: /^(\/|https?:|\{|[\w-]+\/)/ },
  { langs: ["cs"], type: "url", label: "base URL from the environment", code: /\bEnvironment\.GetEnvironmentVariable\s*\(\s*"/, arg: URLISH },
  { langs: ["cs"], type: "url", label: "HttpClient BaseAddress", code: /\bBaseAddress\s*=/ },
  { langs: ["cs"], type: "ui", label: "browser driver", mod: /^(Microsoft\.Playwright|OpenQA\.Selenium)\b/ },
  { langs: ["cs"], type: "ui", label: "browser driver", code: /\bGotoAsync\s*\(|\bIWebDriver\b/ },
  { langs: ["cs"], type: "self", label: "starts the app process", code: /\bProcessStartInfo\b|\bProcess\.Start\s*\(/ },
  { langs: ["cs"], type: "db", label: "database", code: /\bDbContext\b|\bUseInMemoryDatabase\b|\bUseSqlServer\b|\bUseSqlite\b|\bSqlConnection\b|\bNpgsqlConnection\b/ },
  { langs: ["cs"], type: "db", label: "database", mod: /^(Microsoft\.EntityFrameworkCore|Testcontainers|Dapper)\b/ },
  { langs: ["cs"], type: "note", label: "inspects the Aspire app model without starting the app or calling it", code: /\bDistributedApplicationTestingBuilder\b/ },

  { langs: ["java"], type: "api", label: "MockMvc", code: /\b(mockMvc|mvc)\.perform\s*\(/ },
  { langs: ["java"], type: "host", label: "Spring web test", code: /\bMockMvc\b|@SpringBootTest\b|@AutoConfigureMockMvc\b|@WebMvcTest\b|@WebFluxTest\b|@LocalServerPort\b|@QuarkusTest\b|@MicronautTest\b/ },
  { langs: ["java"], type: "http", label: "HTTP client", code: /\bTestRestTemplate\b|\bWebTestClient\b|\bRestAssured\b|\bgiven\s*\(\s*\)\s*\.|\bHttpClient\.newHttpClient\b|\bHttpRequest\.newBuilder\b|\bRestTemplate\b|\bOkHttpClient\b/ },
  { langs: ["java"], type: "http", label: "RestAssured", mod: /^io\.restassured\b/ },
  { langs: ["java"], type: "url", label: "base URL from the environment", code: /\bSystem\.getenv\s*\(\s*"/, arg: URLISH },
  { langs: ["java"], type: "ui", label: "browser driver", mod: /^(org\.openqa\.selenium|com\.microsoft\.playwright|com\.codeborne\.selenide)\b/ },
  { langs: ["java"], type: "db", label: "database", code: /@DataJpaTest\b|@JdbcTest\b|\bJdbcTemplate\b|\bEntityManager\b/ },
  { langs: ["java"], type: "db", label: "database", mod: /^org\.testcontainers\b/ },
  { langs: ["java"], type: "httpmock", label: "HTTP mock", mod: /^(com\.github\.tomakehurst\.wiremock|okhttp3\.mockwebserver|org\.mockserver)\b/ },

  { langs: ["go"], type: "host", label: "httptest server", code: /\bhttptest\.New(TLS)?Server\s*\(\s*(?!http\.HandlerFunc)/ },
  { langs: ["go"], type: "api", label: "router ServeHTTP", code: /\.ServeHTTP\s*\(/ },
  { langs: ["go"], type: "http", label: "HTTP calls", code: /\bhttp\.(Get|Post|Head|PostForm|NewRequest(WithContext)?)\s*\(|\bhttptest\.NewRequest\s*\(|\.Do\s*\(\s*req\b/ },
  { langs: ["go"], type: "url", label: "base URL from the environment", code: /\bos\.(Getenv|LookupEnv)\s*\(\s*"/, arg: URLISH },
  { langs: ["go"], type: "ui", label: "browser driver", mod: /(chromedp|go-rod|playwright-go|tebeka\/selenium)/ },
  { langs: ["go"], type: "db", label: "database", mod: /^(database\/sql|gorm\.io|github\.com\/jackc\/pgx|github\.com\/lib\/pq|go\.mongodb\.org)/ },
  { langs: ["go"], type: "httpmock", label: "HTTP mock", mod: /(jarcoal\/httpmock|h2non\/gock)/ },

  { langs: ["rb"], type: "host", label: "rails_helper", mod: /^(rails_helper|rack\/test)$/ },
  { langs: ["rb"], type: "api", label: "request spec", code: /\btype:\s*:request\b|\bActionDispatch::IntegrationTest\b/ },
  { langs: ["rb"], type: "http", label: "HTTP requests", code: /^\s*(get|post|put|patch|delete|head)\s*\(?\s*(["']|\w+_(path|url)\b)|\bRack::Test\b/m },
  { langs: ["rb"], type: "url", label: "base URL from the environment", code: /\bENV(\.fetch\s*\(|\[)\s*["']/, arg: URLISH },
  { langs: ["rb"], type: "ui", label: "browser driver", code: /\btype:\s*:(system|feature)\b|\bdriven_by\b|\bCapybara\b|^\s*visit\s*\(?\s*(["']|\w+_(path|url)\b)/m },
  { langs: ["rb"], type: "ui", label: "browser driver", mod: /^(capybara|selenium-webdriver|cuprite|ferrum)/ },
  { langs: ["rb"], type: "db", label: "database", code: /\bActiveRecord\b/ },

  { langs: ["php"], type: "api", label: "Laravel HTTP test", code: /\$this\s*->\s*(get|post|put|patch|delete|json|call|getJson|postJson|putJson|patchJson|deleteJson)\s*\(/ },
  { langs: ["php"], type: "host", label: "Symfony WebTestCase", code: /\bWebTestCase\b|\b(static|self)::createClient\s*\(|\bApiTestCase\b/ },
  { langs: ["php"], type: "http", label: "HTTP requests", code: /->\s*(request|jsonRequest|xmlHttpRequest)\s*\(\s*["']/ },
  { langs: ["php"], type: "http", label: "Guzzle", mod: /^GuzzleHttp\b/ },
  { langs: ["php"], type: "url", label: "base URL from the environment", code: /\b(getenv|env)\s*\(\s*["']|\$_ENV\s*\[\s*["']/, arg: URLISH },
  { langs: ["php"], type: "ui", label: "browser driver", mod: /^(Laravel\\Dusk|Symfony\\Component\\Panther|Facebook\\WebDriver)\b/ },
  { langs: ["php"], type: "ui", label: "browser driver", code: /\$browser\s*->\s*visit\s*\(/ },
  { langs: ["php"], type: "db", label: "database", code: /\bRefreshDatabase\b|\bDatabaseTransactions\b|\bDB::|\bKernelTestCase\b/ },

  { langs: ["py"], type: "exec", label: "subprocess", code: /\bsubprocess\.(run|call|check_call|check_output|Popen)\s*\(|\bpexpect\.(spawn|run)\s*\(|\bcreate_subprocess_(exec|shell)\s*\(|\bos\.system\s*\(/ },
  { langs: ["py"], type: "cli", label: "pytest-console-scripts", code: /\bscript_runner\.run\s*\(/ },
  { langs: ["js"], type: "exec", label: "child process", mod: /^(node:)?child_process$|^(execa|cross-spawn|zx|zx\/core)$/ },
  { langs: ["go"], type: "exec", label: "os/exec", code: /\bexec\.Command(Context)?\s*\(/ },
  { langs: ["go"], type: "cli", label: "testscript", mod: /go-internal\/testscript$/ },
  { langs: ["go"], type: "cli", label: "gexec.Build", code: /\bgexec\.Build\s*\(/ },
  { langs: ["rs"], type: "cli", label: "assert_cmd", code: /\bCommand::cargo_bin\s*\(|\bcargo_bin(_cmd)?!\s*\(|\benv!\s*\(\s*"/, arg: /^CARGO_BIN_EXE_/ },
  { langs: ["rs"], type: "cli", label: "assert_cmd", code: /\bCommand::cargo_bin\s*\(|\bcargo_bin(_cmd)?!\s*\(/ },
  { langs: ["rs"], type: "cli", label: "trycmd", code: /\btrycmd::TestCases\b|\bsnapbox::cmd\b/ },
  { langs: ["rs"], type: "exec", label: "std::process::Command", code: /\bCommand::new\s*\(/ },
  { langs: ["cs"], type: "exec", label: "Process.Start", code: /\bProcessStartInfo\b|\bProcess\.Start\s*\(|\bCli\.Wrap\s*\(/ },
  { langs: ["java"], type: "exec", label: "ProcessBuilder", code: /\bnew\s+ProcessBuilder\s*\(|\bRuntime\.getRuntime\s*\(\s*\)\s*\.exec\s*\(/ },

  { langs: ["js"], type: "desktop", label: "Playwright Electron", code: /\b_?electron\.launch\s*\(/ },
  { langs: ["js"], type: "desktop", label: "Electron driver", mod: /^(spectron|wdio-electron-service)$/ },
  { langs: ["js"], type: "mobile", label: "Detox", mod: /^detox$/ },
  { langs: ["js"], type: "mobile", label: "Detox", code: /\bdevice\.(launchApp|reloadReactNative|installApp)\s*\(/ },
  { langs: ["js", "py", "java", "cs"], type: "mobile", label: "Appium", code: /\bplatformName["']?\s*[:=,]\s*["']/, arg: /^(android|ios)$/i },
  { langs: ["js", "py", "java", "cs"], type: "desktop", label: "Appium desktop", code: /\bplatformName["']?\s*[:=,]\s*["']/, arg: /^(windows|mac)$/i },
  { langs: ["py"], type: "desktop", label: "pywinauto", mod: /^pywinauto\b/ },
  { langs: ["py"], type: "desktop", label: "Appium desktop", mod: /^appium\.options\.(windows|mac)\b/ },
  { langs: ["py"], type: "mobile", label: "Appium", mod: /^appium\b(?!\.options\.(windows|mac))/ },
  { langs: ["cs"], type: "desktop", label: "WinAppDriver", code: /\bWindowsDriver\b/ },
  { langs: ["cs"], type: "desktop", label: "desktop UI automation", mod: /^(OpenQA\.Selenium\.Appium\.Windows|FlaUI)\b/ },
  { langs: ["cs"], type: "mobile", label: "Appium", code: /\b(AndroidDriver|IOSDriver)\b/ },
  { langs: ["java"], type: "desktop", label: "TestFX", mod: /^org\.testfx\b/ },
  { langs: ["java"], type: "desktop", label: "Appium desktop", mod: /^io\.appium\.java_client\.(windows|mac)\b/ },
  { langs: ["java"], type: "mobile", label: "Appium", mod: /^io\.appium\.java_client\b(?!\.(windows|mac))/ },
  { langs: ["java"], type: "mobile", label: "Espresso", mod: /^androidx\.test\.(espresso|uiautomator)\b/ },
  { langs: ["swift"], type: "mobile", label: "XCUITest", code: /\bXCUIApplication\s*\(/ },
  { langs: ["dart"], type: "mobile", label: "Flutter integration_test", mod: /^package:(integration_test|flutter_driver|patrol)\// },

  { langs: ALL, type: "url", label: "localhost URL", lit: LOCALHOST },
];

/** What the app's own command line is called: console scripts, package bins, built binaries. */
export interface Entries {
  names: string[];
  paths: string[];
  /** Python functions behind console scripts (what CliRunner should invoke). */
  funcs: string[];
  /** Python packages runnable with `python -m`. */
  modules: string[];
}

const ENTRY_FILES = ["pyproject.toml", "setup.cfg", "setup.py", "package.json", "go.mod", "Cargo.toml", "pom.xml"];

/** The app's command-line entry points, read from the manifests in `dir` and its parents up to `root`. */
export function projectEntries(root: string, dir = "."): Entries {
  const e: Entries = { names: [], paths: [], funcs: [], modules: [] };
  const read = (f: string) => {
    try {
      return fs.readFileSync(f, "utf8");
    } catch {
      return "";
    }
  };
  const script = (name: string, target: string) => {
    e.names.push(name);
    const [mod, fn] = target.trim().split(":");
    if (fn) e.funcs.push(fn.trim().split(".").pop()!);
    if (mod) e.modules.push(mod.trim().split(".")[0]);
  };
  const top = path.resolve(root);
  for (let d = path.resolve(root, dir); ; d = path.dirname(d)) {
    for (const f of ENTRY_FILES) {
      const text = read(path.join(d, f));
      if (!text) continue;
      if (f === "pyproject.toml") {
        try {
          const t = parseToml(text) as any;
          for (const [n, v] of Object.entries({ ...t.project?.scripts, ...t.tool?.poetry?.scripts })) if (typeof v === "string") script(n, v);
          if (typeof t.project?.name === "string") e.modules.push(t.project.name.replace(/-/g, "_"));
        } catch {
          /* unreadable pyproject */
        }
      } else if (f === "setup.cfg" || f === "setup.py") {
        for (const m of text.matchAll(/^\s*["']?([\w.-]+)\s*=\s*([\w.]+:[\w.]+)["']?/gm)) script(m[1], m[2]);
      } else if (f === "package.json") {
        try {
          const p = JSON.parse(text);
          const bin = typeof p.bin === "string" ? { [String(p.name ?? "").replace(/^@[^/]+\//, "")]: p.bin } : (p.bin ?? {});
          for (const [n, v] of Object.entries(bin)) {
            if (n) e.names.push(n);
            if (typeof v === "string") e.paths.push(path.posix.normalize(path.relative(top, path.join(d, v)).replace(/\\/g, "/")));
          }
        } catch {
          /* unreadable package.json */
        }
      } else if (f === "go.mod") {
        const m = /^module\s+(\S+)/m.exec(text);
        if (m) e.names.push(m[1].split("/").pop()!);
        for (const c of globFiles(path.join(d, "cmd"), ["*/*.go"], { maxDepth: 2 })) e.names.push(c.split("/")[0]);
      } else if (f === "Cargo.toml") {
        try {
          const t = parseToml(text) as any;
          if (typeof t.package?.name === "string") e.names.push(t.package.name);
          for (const b of t.bin ?? []) if (typeof b?.name === "string") e.names.push(b.name);
        } catch {
          /* unreadable Cargo.toml */
        }
      } else if (f === "pom.xml") {
        const m = /<artifactId>([^<]+)<\/artifactId>/.exec(text.replace(/<parent>[\s\S]*?<\/parent>/, ""));
        if (m) e.names.push(m[1]);
      }
    }
    for (const b of globFiles(path.join(d, "bin"), ["*"], { maxDepth: 1 })) {
      e.names.push(b.replace(/\.[cm]?[jt]s$|\.sh$|\.py$/, ""));
      e.paths.push(path.relative(top, path.join(d, "bin", b)).replace(/\\/g, "/"));
    }
    for (const m of globFiles(d, ["*/__main__.py", "src/*/__main__.py"], { maxDepth: 3 })) e.modules.push(m.split("/").slice(-2)[0]);
    if (d === top || path.dirname(d) === d || !d.startsWith(top)) break;
  }
  const uniq = (xs: string[]) => [...new Set(xs.filter((x) => x && x !== "." && x.length > 1))];
  return { names: uniq(e.names), paths: uniq(e.paths), funcs: uniq(e.funcs), modules: uniq(e.modules) };
}

const BUILT = /^(\.{1,2}\/)*(bin|target\/(debug|release)|build|dist|out|publish)\/[\w.@-]+$|\.(jar|dll|exe)$|^-jar$/;

/** Which of the file's string literals name the app's command line. */
function cliTarget(lits: string[], e: Entries | undefined): string | undefined {
  const norm = (x: string) => x.replace(/\\/g, "/").replace(/^(\.{1,2}\/)+/, "");
  if (lits.includes("go") && lits.some((l) => l === "run" || l === "build")) return "go run";
  for (const l of lits) {
    if (/^go (run|build)\b/.test(l)) return "go run";
    if (BUILT.test(l)) return l;
    if (!e) continue;
    const first = l.trim().split(/\s+/)[0] ?? "";
    const base = first.split("/").pop() ?? "";
    const stem = base.replace(/\.([cm]?[jt]s|py|sh|exe|jar|dll)$/, "");
    if (e.names.some((n) => first === n || stem === n)) return first;
    if (e.paths.some((p) => (norm(first).endsWith(norm(p)) && norm(first).includes("/")) || (base === path.basename(p) && !/^(index|main)\./.test(base)))) return first;
    const m = /(?:^|\s)-m\s+([\w.]+)/.exec(l);
    if (m && e.modules.includes(m[1].split(".")[0])) return `python -m ${m[1]}`;
  }
  const i = lits.indexOf("-m");
  if (i >= 0 && e?.modules.includes((lits[i + 1] ?? "").split(".")[0])) return `python -m ${lits[i + 1]}`;
  return undefined;
}

const SH_NOT_APP = new Set("[ [[ ]] { } ( ) ! echo printf cd pushd popd export local declare readonly set unset skip if then else elif fi for while until do done case esac function return run load source . true false test cat grep egrep sed awk mkdir rm cp mv ln touch chmod diff cmp wc head tail sort uniq tr cut tee xargs find jq yq sleep eval exec bats_load_library bats_require_minimum_version setup teardown setup_file teardown_file".split(" "));

/** bats: the first command a test runs that is the app (a path, a variable, a known name, or a bare name after PATH was changed). */
function batsTarget(code: string, e: Entries | undefined): string | undefined {
  const defined = new Set([...code.matchAll(/^\s*(?:function\s+)?([\w-]+)\s*\(\s*\)/gm)].map((m) => m[1]));
  const pathChanged = /\bPATH=/.test(code);
  for (const line of code.split("\n").filter((l) => !/^\s*#/.test(l))) {
    const m = /^\s*(?:run\s+(?:-\d+\s+|--[\w-]+\s+|!\s+)*|!\s+)?(\S+)/.exec(line);
    const w = m?.[1].replace(/^["']|["']$/g, "");
    if (!w || /[(){}]/.test(w) || w.startsWith("@") || w.startsWith("#") || /^\w+=/.test(w) || /^(assert|refute)\w*$/.test(w) || SH_NOT_APP.has(w) || defined.has(w)) continue;
    if (/^\$\{?(output|status|lines|BATS_\w*OUTPUT|stderr|[0-9@*#?])\b/.test(w) || /^\$\{?[0-9@*#?]/.test(w)) continue;
    if (w.includes("/") || w.startsWith("$") || e?.names.includes(w) || pathChanged) return w;
  }
  return undefined;
}

export interface FileScan {
  rel: string;
  isTest: boolean;
  sigs: Map<SigType, Set<string>>;
  /** 1-based line where each signal label first matched. */
  lines?: Map<string, number>;
  tags: string[];
  namespace?: string;
  classes: string[];
}

const has = (f: FileScan, t: SigType) => !!f.sigs.get(t)?.size;

/** Raw string literal content starting at the opening quote `at`. */
function rawString(raw: string, at: number): string {
  const q = raw[at];
  if (q !== '"' && q !== "'" && q !== "`") return "";
  let j = at + 1;
  while (j < raw.length && raw[j] !== q && raw[j] !== "\n") j += raw[j] === "\\" ? 2 : 1;
  return raw.slice(at + 1, j);
}

/** Module names a file imports. */
export function importsOf(raw: string, code: string, lang: FLang): string[] {
  const out: string[] = [];
  const each = (re: RegExp, f: (m: RegExpExecArray) => void) => {
    for (const m of code.matchAll(re)) f(m as RegExpExecArray);
  };
  const quoted = (m: RegExpExecArray) => out.push(rawString(raw, m.index + m[0].length - 1));
  if (lang === "py") {
    each(/^\s*from\s+([\w.]+)\s+import\b/gm, (m) => out.push(m[1]));
    each(/^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm, (m) => out.push(...m[1].split(/\s*,\s*/)));
  } else if (lang === "js") {
    each(/\bimport\s+(?:type\s+)?(?:[^;'"`]*?\bfrom\s*)?["']/g, quoted);
    each(/\b(?:require|import)\s*\(\s*["']/g, quoted);
  } else if (lang === "cs") each(/^\s*(?:global\s+)?using\s+(?:static\s+)?([\w.]+)\s*;/gm, (m) => out.push(m[1]));
  else if (lang === "java") each(/^\s*import\s+(?:static\s+)?([\w.*]+)/gm, (m) => out.push(m[1]));
  else if (lang === "go") {
    each(/\bimport\s*\(([^)]*)\)/g, (m) => {
      const at = m.index + m[0].indexOf("(") + 1;
      [...m[1].matchAll(/"/g)].forEach((q, i) => i % 2 === 0 && out.push(rawString(raw, at + q.index)));
    });
    each(/\bimport\s+(?:\w+\s+)?"/g, quoted);
  } else if (lang === "rb") each(/\brequire(?:_relative)?\s*\(?\s*["']/g, quoted);
  else if (lang === "php") each(/^\s*use\s+([\w\\]+)/gm, (m) => out.push(m[1]));
  else if (lang === "rs") each(/^\s*(?:pub\s+)?use\s+([\w:]+)|^\s*extern\s+crate\s+(\w+)/gm, (m) => out.push(m[1] ?? m[2]));
  else if (lang === "swift") each(/^\s*(?:@testable\s+)?import\s+(\w+)/gm, (m) => out.push(m[1]));
  else if (lang === "dart") each(/^\s*import\s+["']/gm, quoted);
  else if (lang === "sh") each(/^\s*(?:load|source|\.)\s+["']?([^\s"']+)/gm, (m) => out.push(m[1]));
  return out.filter(Boolean);
}

const NOT_TAGS = new Set(["parametrize", "skip", "skipif", "xfail", "asyncio", "anyio", "usefixtures", "django_db", "timeout", "filterwarnings", "flaky", "order", "dependency"]);

function tagsOf(raw: string, code: string, lang: FLang): string[] {
  const t = new Set<string>();
  const add = (re: RegExp, src: string, f: (m: RegExpMatchArray) => string | undefined) => {
    for (const m of src.matchAll(re)) {
      const v = f(m);
      if (v) t.add(v);
    }
  };
  if (lang === "py") add(/\bpytest\.mark\.(\w+)/g, code, (m) => (NOT_TAGS.has(m[1]) ? undefined : m[1]));
  if (lang === "cs") {
    add(/\[\s*Trait\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g, raw, (m) => `${m[1]}=${m[2]}`);
    add(/\[\s*(?:TestCategory|Category)\s*\(\s*"([^"]+)"/g, raw, (m) => `Category=${m[1]}`);
  }
  if (lang === "java") add(/@Tag\s*\(\s*"([^"]+)"/g, raw, (m) => m[1]);
  if (lang === "rb") add(/\btype:\s*:(\w+)/g, code, (m) => `type:${m[1]}`);
  if (lang === "php") {
    add(/@group\s+([\w-]+)/g, raw, (m) => m[1]);
    add(/#\[Group\(\s*['"]([^'"]+)/g, raw, (m) => m[1]);
  }
  return [...t];
}

const EXTRA_TEST: Partial<Record<FLang, RegExp>> = {
  rs: /#\[\s*(?:[\w:]+::)?test\b/,
  sh: /^\s*@test\s/m,
  swift: /\bfunc\s+test\w*\s*\(/,
  dart: /\b(test|testWidgets|patrolTest)\s*\(\s*["']/,
};

/** Signals in one source file; `entries` name the app's command line, for telling CLI tests from unit tests. */
export function scanSource(rel: string, raw: string, opts: { isTest?: boolean; entries?: Entries; helpers?: string } = {}): FileScan | null {
  const fl = fLangOf(rel);
  if (!fl) return null;
  const lang = fl.lang;
  const code = mask(raw, fl.as);
  const mods = importsOf(raw, code, lang);
  const sigs = new Map<SigType, Set<string>>();
  const lines = new Map<string, number>();
  const lineAt = (i: number) => code.slice(0, i).split("\n").length;
  const hit = (r: Rule, line?: number) => {
    (sigs.get(r.type) ?? sigs.set(r.type, new Set()).get(r.type)!).add(r.label);
    if (line && !lines.has(r.label)) lines.set(r.label, line);
  };
  const rawLines = raw.split("\n");
  const codeLines = code.split("\n");
  for (const r of RULES) {
    if (!r.langs.includes(lang)) continue;
    const mod = r.mod && mods.find((m) => r.mod!.test(m));
    if (mod) hit(r, rawLines.findIndex((l) => l.includes(mod)) + 1);
    if (r.code) {
      const re = new RegExp(r.code.source, r.code.flags.includes("g") ? r.code.flags : `${r.code.flags}g`);
      for (const m of code.matchAll(re)) {
        if (!r.arg || r.arg.test(rawString(raw, m.index! + m[0].length - 1))) {
          hit(r, lineAt(m.index!));
          break;
        }
      }
    }
    const li = r.lit ? rawLines.findIndex((l, i) => /["'`]/.test(codeLines[i] ?? "") && r.lit!.test(l)) : -1;
    if (li >= 0) hit(r, li + 1);
  }
  const lits = [...code.matchAll(/(["'`])[ ]*\1/g)].map((m) => rawString(raw, m.index!));
  const mark = (type: SigType, label: string) => (sigs.get(type) ?? sigs.set(type, new Set()).get(type)!).add(label);
  if (lang === "sh") {
    const t = batsTarget(opts.helpers ? `${raw}\n${opts.helpers}` : raw, opts.entries);
    if (t) mark("cli", `runs ${t}`);
  } else if (sigs.has("exec")) {
    const t = cliTarget(lits, opts.entries);
    if (t) mark("cli", `runs ${t}`);
  }
  if (lang === "py" && /\bCliRunner\s*\(/.test(code)) {
    const funcs = opts.entries?.funcs.length ? opts.entries.funcs : ["cli", "main", "app"];
    const inv = [...code.matchAll(/\.invoke\s*\(\s*([\w.]+)/g)].map((m) => m[1].split(".").pop()!).find((f) => funcs.includes(f));
    if (inv) mark("cli", `CliRunner invokes ${inv}`);
  }
  const extra = EXTRA_TEST[lang];
  const isTest = opts.isTest ?? (extra ? extra.test(code) : findTests(raw, code, lang as Lang).length > 0);
  const ns = lang === "cs" || lang === "java" ? /^\s*(?:namespace|package)\s+([\w.]+)/m.exec(code)?.[1] : undefined;
  const classes = lang === "cs" || lang === "java" ? [...code.matchAll(/\bclass\s+(\w+)/g)].map((m) => m[1]) : [];
  return { rel, isTest, sigs, lines, tags: tagsOf(raw, code, lang), namespace: ns, classes };
}

export function scanFile(root: string, rel: string, isTest?: boolean, entries?: Entries): FileScan | null {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
  if (raw.length > 512 * 1024) return null;
  const helpers = rel.endsWith(".bats") ? batsHelpers(path.join(root, rel), raw) : undefined;
  return scanSource(rel, raw, { isTest, entries, helpers });
}

/** The text of the files a bats file loads (they often put the app on PATH). */
function batsHelpers(file: string, raw: string): string {
  const out: string[] = [];
  for (const m of raw.matchAll(/^\s*(load|source|\.)\s+["']?([^\s"']+)/gm)) {
    const rel = m[2].replace(/\$\{?BATS_TEST_DIRNAME\}?\/?/, "");
    for (const f of m[1] === "load" ? [`${rel}.bash`, rel] : [rel]) {
      try {
        out.push(fs.readFileSync(path.resolve(path.dirname(file), f), "utf8"));
        break;
      } catch {
        /* not this name */
      }
    }
  }
  return out.join("\n");
}

/** How a test file drives the app, given what the project's other files set up. */
export function fileKind(f: FileScan, ctx: { host: boolean; url: boolean }): Kind | null {
  if (has(f, "desktop")) return "desktop";
  if (has(f, "mobile")) return "mobile";
  if (has(f, "ui")) return "ui";
  if (has(f, "api")) return "api";
  if (has(f, "call") && (has(f, "host") || has(f, "self"))) return "api";
  if (has(f, "http") && !has(f, "httpmock") && (ctx.host || ctx.url || has(f, "host") || has(f, "url") || has(f, "self"))) return "api";
  if (has(f, "cli")) return "cli";
  return null;
}

/** One kind for a suite whose files differ: the most specific driver wins. */
const KIND_ORDER: Kind[] = ["desktop", "mobile", "ui", "api", "cli"];

export interface Verdict {
  status: "functional" | "excluded" | "mixed";
  kind?: Kind;
  reason: string;
  evidence: string;
  /** The tests start the app themselves (in the test process or as their own child process). */
  hostsApp: boolean;
  filter?: { dirs?: string[]; tag?: string; skip?: FileScan[] };
  tests: number;
  functional: FileScan[];
  other: FileScan[];
}

const labels = (files: FileScan[], types: SigType[]) => [...new Set(files.flatMap((f) => types.flatMap((t) => [...(f.sigs.get(t) ?? [])])))];

/** Classify a test project from its scanned files (test files plus helpers such as fixtures and conftest). */
export function classify(files: FileScan[], name = ""): Verdict {
  // A URL in a test file counts only for that file: a localhost string in a unit test is usually test data.
  const ctx = { host: files.some((f) => has(f, "host") || has(f, "self")), url: files.some((f) => !f.isTest && has(f, "url")) };
  const tests = files.filter((f) => f.isTest);
  const functional: FileScan[] = [];
  const other: FileScan[] = [];
  const kinds = new Set<Kind>();
  for (const f of tests) {
    const k = fileKind(f, ctx);
    if (k) {
      functional.push(f);
      kinds.add(k);
    } else other.push(f);
  }
  const hostsApp = files.some((f) => has(f, "host") || has(f, "self") || has(f, "api") || has(f, "cli"));
  const kind = KIND_ORDER.find((k) => kinds.has(k));
  const drivers = labels([...files.filter((f) => !f.isTest), ...functional], ["desktop", "mobile", "host", "self", "api", "ui", "cli"]);
  const evidence = functional.length ? `${[...drivers, ...labels(functional, ["http", "url"])].slice(0, 4).join(", ")}` : "";
  const base = { kind, hostsApp, tests: tests.length, functional, other, evidence };
  if (!tests.length) return { ...base, status: "excluded", reason: "no tests found" };
  if (!other.length) return { ...base, status: "functional", reason: `${tests.length} test file(s) drive the app` };
  if (!functional.length) {
    const db = tests.filter((f) => has(f, "db")).length;
    const integration = /integration/i.test(name) || db * 2 >= tests.length;
    const hosts = labels(files, ["host"]);
    const why = hosts.length ? `${hosts[0]} found, but no test sends a request through it` : "no app host, HTTP client, browser driver or run of the app's command";
    const notes = labels(files, ["note"]);
    return { ...base, status: "excluded", reason: `${integration ? "integration (database access; " : "unit ("}${why})${notes.length ? `; ${notes.join("; ")}` : ""}` };
  }
  const dirs = folderFilter(functional, other);
  const few = other.length <= 5 && functional.length >= 2 * other.length ? { skip: other } : undefined;
  const filter = dirs?.length === 1 ? { dirs } : (tagFilter(functional, other) ?? few ?? (dirs ? { dirs } : undefined));
  return { ...base, status: "mixed", reason: `${functional.length} of ${tests.length} test files drive the app`, filter };
}

/** The shallowest folders that hold every functional test file and no other test file. */
export function folderFilter(functional: FileScan[], other: FileScan[]): string[] | undefined {
  const inDir = (rel: string, d: string) => rel.startsWith(`${d}/`);
  const dirs = new Set<string>();
  for (const f of functional) {
    const parts = f.rel.split("/").slice(0, -1);
    let found: string | undefined;
    for (let i = 1; i <= parts.length; i++) {
      const d = parts.slice(0, i).join("/");
      if (!other.some((o) => inDir(o.rel, d))) {
        found = d;
        break;
      }
    }
    if (!found) return undefined;
    dirs.add(found);
  }
  const out = [...dirs].filter((d) => ![...dirs].some((o) => o !== d && inDir(d, o))).sort();
  return out.length && out.length <= 6 ? out : undefined;
}

function tagFilter(functional: FileScan[], other: FileScan[]): { tag: string } | undefined {
  const common = functional[0].tags.filter((t) => functional.every((f) => f.tags.includes(t)) && !other.some((o) => o.tags.includes(t)));
  return common.length ? { tag: common[0] } : undefined;
}

/** Dotnet namespace that covers every functional file in `dir`. */
function namespaceFor(v: Verdict, dir: string): string | undefined {
  const ns = v.functional.filter((f) => f.rel.startsWith(`${dir}/`)).map((f) => f.namespace ?? "");
  if (!ns.length || ns.some((n) => !n)) return undefined;
  let prefix = ns[0].split(".");
  for (const n of ns) {
    const p = n.split(".");
    let i = 0;
    while (i < prefix.length && prefix[i] === p[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix.join(".") || undefined;
}

const sq = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** The suite command narrowed to the functional tests, or undefined when it can't be expressed. */
export function filteredCmd(adapter: AdapterName, cmd: string, v: Verdict, opts: { xunitMtp?: boolean } = {}): string | undefined {
  const f = v.filter;
  if (!f) return undefined;
  const dirs = f.dirs;
  const skip = f.skip?.map((x) => x.rel);
  const each = (flag: string, xs: string[]) => xs.map((x) => `${flag}${sq(x)}`).join(" ");
  const reEsc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  switch (adapter) {
    case "pytest":
      return dirs ? `${cmd} ${dirs.map(sq).join(" ")}` : skip ? `${cmd} ${each("--ignore=", skip)}` : `${cmd} -m ${sq(f.tag!)}`;
    case "jest":
      return dirs ? `${cmd} ${dirs.map(sq).join(" ")}` : skip ? `${cmd} ${each("--testPathIgnorePatterns=", skip.map(reEsc))}` : undefined;
    case "vitest":
      return dirs ? `${cmd} ${dirs.map(sq).join(" ")}` : skip ? `${cmd} ${each("--exclude ", skip)}` : undefined;
    case "playwright":
      return dirs ? `${cmd} ${dirs.map(sq).join(" ")}` : undefined;
    case "mocha":
      return dirs ? `${cmd} --recursive ${dirs.map(sq).join(" ")}` : skip ? `${cmd} ${each("--ignore ", skip)}` : undefined;
    case "go":
      return dirs ? `${cmd.replace(/\s\.\/\.\.\.$/, "")} ${dirs.map((d) => `./${d}/...`).join(" ")}` : undefined;
    case "rspec":
      return dirs ? `${cmd} ${dirs.map(sq).join(" ")}` : skip ? `${cmd} --exclude-pattern ${sq(skip.length > 1 ? `{${skip.join(",")}}` : skip[0])}` : `${cmd} --tag ${sq(f.tag!)}`;
    case "phpunit":
      return dirs ? (dirs.length === 1 ? `${cmd} ${sq(dirs[0])}` : undefined) : f.tag ? `${cmd} --group ${sq(f.tag)}` : undefined;
    case "junit-maven": {
      if (f.tag) return `${cmd} -Dgroups=${sq(f.tag)}`;
      const pats = dirs ? dirs.map((d) => d.replace(/^.*?src\/test\/(java|kotlin)\/?/, "")).filter(Boolean).map((p) => `${p}/**/*`) : f.skip!.flatMap((x) => x.classes.map((c) => `!${c}`));
      return pats.length && (!dirs || pats.length === dirs.length) ? `${cmd} -Dtest=${sq(pats.join(","))} -Dsurefire.failIfNoSpecifiedTests=false` : undefined;
    }
    case "junit-gradle": {
      if (!dirs) return undefined;
      const pk = dirs.map((d) => d.replace(/^.*?src\/test\/(java|kotlin)\/?/, "").replace(/\//g, ".")).filter(Boolean);
      return pk.length === dirs.length ? `${cmd} ${pk.map((p) => `--tests ${sq(`${p}.*`)}`).join(" ")}` : undefined;
    }
    case "dotnet": {
      if (f.tag) return opts.xunitMtp ? `${cmd} --filter-trait ${sq(f.tag)}` : `${cmd} --filter ${sq(f.tag)}`;
      if (f.skip) {
        const fqns = f.skip.flatMap((x) => (x.namespace ? x.classes.map((c) => `${x.namespace}.${c}`) : []));
        if (!fqns.length || f.skip.some((x) => !x.namespace)) return undefined;
        return opts.xunitMtp ? `${cmd} ${each("--filter-not-class ", fqns)}` : `${cmd} --filter ${sq(fqns.map((n) => `FullyQualifiedName!~${n}`).join("&"))}`;
      }
      const ns = dirs!.map((d) => namespaceFor(v, d));
      if (ns.some((n) => !n)) return undefined;
      return opts.xunitMtp ? `${cmd} ${ns.map((n) => `--filter-namespace ${sq(`${n}*`)}`).join(" ")}` : `${cmd} --filter ${sq(ns.map((n) => `FullyQualifiedName~${n}`).join("|"))}`;
    }
    default:
      return undefined;
  }
}

/** What the filtered command runs, for a config comment. */
export function describeFilter(v: Verdict): string {
  const f = v.filter;
  if (!f) return "";
  if (f.dirs) return `runs only folder${f.dirs.length > 1 ? "s" : ""} ${f.dirs.join(", ")}`;
  if (f.tag) return `runs only tests tagged ${f.tag}`;
  return `skips ${f.skip!.map((x) => x.rel).join(", ")}`;
}

export interface SuiteWarning {
  suite: string;
  files: string[];
  message: string;
}

const FILTER_FLAG = /\s(--filter\S*|-m|-k|--tests|-Dtest=\S*|-Dgroups=\S*|--group|--tag|-run|--grep|-t|--testPathPattern\S*|--testNamePattern\S*|--exclude\S*|--ignore\S*|--testPathIgnorePatterns\S*|--deselect)(?=[\s=]|$)/;

/** Folders and files a suite's command points at (relative to cwd), or [] when it names none. */
function suiteTargets(cwd: string, cmd: string): string[] {
  const words = (shellWords(cmd) ?? cmd.split(/\s+/)).slice(1).filter((w) => w && !w.startsWith("-") && !w.includes("${"));
  const out: string[] = [];
  for (const w of words) {
    const abs = path.resolve(cwd, w.replace(/^--\w+=/, ""));
    if (!fs.existsSync(abs) || abs === cwd) continue;
    if (/\.(sln|slnx)$/.test(abs)) continue;
    out.push(/\.(csproj|fsproj|vbproj)$/.test(abs) ? path.dirname(abs) : abs);
  }
  return out;
}

/** Warnings for suites whose test files don't drive the app (`witness check`). */
export function functionalWarnings(cfg: Config): SuiteWarning[] {
  const out: SuiteWarning[] = [];
  for (const s of cfg.suites) {
    const cwd = path.resolve(cfg.root, s.cwd);
    const targets = suiteTargets(cwd, s.cmd);
    if (!targets.length && s.adapter === "generic") continue;
    const roots = targets.length ? targets : [cwd];
    const entries = projectEntries(cfg.root, s.cwd);
    const extra = roots.filter((r) => fs.statSync(r, { throwIfNoEntry: false })?.isDirectory()).flatMap((r) => globFiles(r, ["**/*.{bats,rs,swift,dart}"], { maxDepth: 12 }).map((f) => path.join(r, f)));
    const scans = [...new Set([...expandArgs(roots, cwd), ...extra])]
      .filter((f) => fLangOf(f))
      .slice(0, MAX_SCAN)
      .map((f) => scanFile(cfg.root, path.relative(cfg.root, f), undefined, entries))
      .filter((f): f is FileScan => !!f);
    const v = classify(scans, s.name);
    if (!v.tests) continue;
    const where = roots.map((r) => path.relative(cfg.root, r) || ".").join(", ");
    const fix = "Witness runs functional tests only: give the suite a filter that selects the tests that drive the app (over HTTP, in a browser, through its command line, window or device), or remove it";
    const sample = (xs: FileScan[]) => `${xs.slice(0, 3).map((f) => f.rel).join(", ")}${xs.length > 3 ? ", ..." : ""}`;
    if (v.status === "excluded") out.push({ suite: s.name, files: v.other.map((f) => f.rel), message: `suite ${s.name} looks non-functional: ${v.reason}. Scanned ${v.tests} test file(s) under ${where} (${sample(v.other)}). ${fix}.` });
    else if (v.status === "mixed" && !FILTER_FLAG.test(` ${s.cmd.replace(/^\s*\S*python\S*\s+-m\s+\S+/, "")}`)) out.push({ suite: s.name, files: v.other.map((f) => f.rel), message: `suite ${s.name}: ${v.other.length} of ${v.tests} test files under ${where} don't drive the app (${sample(v.other)}). ${fix}.` });
  }
  return out;
}
