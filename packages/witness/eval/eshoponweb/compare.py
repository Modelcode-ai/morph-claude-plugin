import json, glob, sys, re, os, collections
import xml.etree.ElementTree as ET
run = sys.argv[1]
d = json.load(open(os.path.join(run, 'results.ctrf.json')))['results']
by = collections.defaultdict(lambda: collections.Counter())
ids = collections.defaultdict(set)
for t in d['tests']:
    w = t['extra']['witness']; by[w['suite']][t['status']] += 1; ids[w['suite']].add(w['id'])
ns = {'t': 'http://microsoft.com/schemas/VisualStudio/TeamTest/2010'}
print('summary', d['summary'])
for suite in sorted(by):
    trx = glob.glob(os.path.join(run, 'reports', suite, '**', '*.trx'), recursive=True)
    tc = collections.Counter(); names = []
    for f in trx:
        r = ET.parse(f).getroot()
        c = r.find('.//t:ResultSummary/t:Counters', ns)
        for res in r.iter('{%s}UnitTestResult' % ns['t']):
            tc[res.get('outcome')] += 1; names.append(res.get('testName'))
        cnt = dict(c.attrib) if c is not None else {}
    log = open(os.path.join(run, 'logs', suite + '.log')).read()
    m = re.search(r'total: (\d+)\s+failed: (\d+)\s+succeeded: (\d+)\s+skipped: (\d+)', log)
    print(f"{suite:12} ctrf={dict(by[suite])} unique_ids={len(ids[suite])} trx_results={dict(tc)} trx_counters={ {k:cnt.get(k) for k in ('total','executed','passed','failed')} if trx else None} dotnet_summary={m.groups() if m else None} dup_names={len(names)-len(set(names))}")
