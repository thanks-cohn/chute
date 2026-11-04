"""Bounded, redacted CI failure summary; preserves the pytest step's failure gate."""
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

report=Path(sys.argv[1])
if not report.is_file():
    text='## Explorer tests\n\nNo current pytest XML report was produced. Test readiness is unknown.\n'
else:
    root=ET.parse(report).getroot()
    cases=root.findall('.//testcase')
    failures=[]
    for case in cases:
        for failure in [*case.findall('failure'),*case.findall('error')]:
            detail=(failure.text or failure.attrib.get('message',''))[:10000]
            detail=detail.replace(str(Path.home()),'<user>').replace(str(Path.cwd()),'<checkout>')
            detail=re.sub(r'[A-Za-z0-9_-]{40,}','<opaque>',detail)
            failures.append(f"### {case.get('classname','')}.{case.get('name','')}\n\n```text\n{detail}\n```\n")
    text=f'## Explorer tests\n\nCurrent-run cases: {len(cases)}; failing cases: {len(failures)}. Platform skips remain skips.\n\n'+''.join(failures)
summary=os.environ.get('GITHUB_STEP_SUMMARY')
if summary:
    with Path(summary).open('a',encoding='utf-8') as output:output.write(text[:40000])
else:
    print(text[:40000])
