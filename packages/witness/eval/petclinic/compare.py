"""Compare a witness run's CTRF counts with the JUnit XML it collected and with the runner's own summary line."""
import collections, glob, json, os, re, sys
import xml.etree.ElementTree as ET

run = sys.argv[1]
results = json.load(open(os.path.join(run, "results.ctrf.json")))["results"]
ctrf = collections.defaultdict(collections.Counter)
ids = collections.defaultdict(set)
for t in results["tests"]:
    w = t["extra"]["witness"]
    ctrf[w["suite"]][t["status"]] += 1
    ids[w["suite"]].add(w["id"])
print("summary", results["summary"])
for suite in sorted(ctrf):
    xml = collections.Counter()
    for f in glob.glob(os.path.join(run, "reports", suite, "**", "*.xml"), recursive=True):
        for tc in ET.parse(f).getroot().iter("testcase"):
            kids = {c.tag for c in tc}
            xml["failed" if kids & {"failure", "error"} else "skipped" if "skipped" in kids else "passed"] += 1
    log = open(os.path.join(run, "logs", suite + ".log"), errors="replace").read()
    runner = None
    m = re.findall(r"Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)\s*$", log, re.M)
    if m:
        runner = dict(zip(("run", "failures", "errors", "skipped"), m[-1]))
    m = re.search(r"assertions\s*│\s*(\d+)\s*│\s*(\d+)", log)
    if m:
        runner = {"assertions": m.group(1), "failed": m.group(2)}
    m = re.search(r"(\d+) passed.*?\((\d+(?:\.\d+)?[ms]+)\)", log)
    if runner is None and m:
        runner = {"playwright_passed": m.group(1)}
    print(f"{suite:10} ctrf={dict(ctrf[suite])} unique_ids={len(ids[suite])} xml={dict(xml)} runner={runner}")
