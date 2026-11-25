/** Suite kinds whose tests are expected to leave a screenshot or video. */
export const VISUAL_KINDS: readonly string[] = ["ui", "mobile", "desktop"];

export const CAPTURE_FIX = `switch on the test framework's own screenshot and video capture for passing tests when WITNESS_EVIDENCE is set, or add a per-test fixture that does it (the init skill's "Screenshots and video" step)`;

export interface VisualGap {
  suite: string;
  kind: string;
  passed: number;
  /** Passing tests with neither a screenshot nor a video. */
  bare: string[];
}

const isVisual = (type: string) => type === "screenshot" || type === "video";

/** Per ui, mobile or desktop suite with passing tests: those that left no screenshot or video on this side of the run. */
export function visualGaps(suites: { name: string; kind?: string }[], tests: { id: string; suite: string; status: string }[], artifacts: { file: string; test_id: string | null; artifact_type: string }[]): VisualGap[] {
  const seen = new Set(artifacts.filter((a) => a.test_id && isVisual(a.artifact_type) && !a.file.startsWith("against/")).map((a) => a.test_id));
  const out: VisualGap[] = [];
  for (const s of suites) {
    if (!VISUAL_KINDS.includes(s.kind ?? "")) continue;
    const passed = tests.filter((t) => t.suite === s.name && t.status === "passed");
    if (passed.length) out.push({ suite: s.name, kind: s.kind!, passed: passed.length, bare: passed.filter((t) => !seen.has(t.id)).map((t) => t.id) });
  }
  return out;
}

/** "30 of 36 passing tests in web (ui) left no screenshot or video", or undefined when none did. */
export function gapLine(g: VisualGap): string | undefined {
  if (!g.bare.length) return undefined;
  const n = g.bare.length === g.passed ? (g.passed === 1 ? "The passing test" : `All ${g.passed} passing tests`) : `${g.bare.length} of ${g.passed} passing tests`;
  return `${n} in ${g.suite} (${g.kind}) left no screenshot or video`;
}
