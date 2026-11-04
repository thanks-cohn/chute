# Chutey production API laboratory

Run from the checkout using Python 3.10+. No mock filesystem engine, Chrome or real user folders are involved.

```
python tools/explorer_lab/chutey_explorer_lab.py doctor
python tools/explorer_lab/chutey_explorer_lab.py capabilities
python tools/explorer_lab/chutey_explorer_lab.py preflight --plan tools/explorer_lab/sample-plan.json
python tools/explorer_lab/chutey_explorer_lab.py run --plan tools/explorer_lab/sample-plan.json --dry-run
python tools/explorer_lab/chutey_explorer_lab.py run --plan tools/explorer_lab/sample-plan.json --out /tmp/chutey-lab-new
python tools/explorer_lab/chutey_explorer_lab.py report --run /tmp/chutey-lab-new
python tools/explorer_lab/chutey_explorer_lab.py cleanup --run /tmp/chutey-lab-new
```

`run` is the explicit authorization to create a fresh fixture under a **nonexistent** output directory. It never changes a supplied user root. `inventory --root` only reads. Cleanup defaults to a dry run; `--execute` removes only the owned fixture, preserving evidence. It refuses cleanup if the fixture differs from the final independently hashed snapshot. `snapshot --run DIR` or `snapshot --root DIR` reads an actual tree snapshot; optional `--out FILE` creates a new snapshot file and refuses to overwrite evidence. Plans alone are not observed snapshots. `run` also emits before/after inventories. `retry` allows only known read-only scenarios in a new output directory. No mutation retries exist.

Each registered scenario records intent then receipt and verdict. Independent `os.walk`, `lstat`, byte reads and SHA-256 snapshots verify names, sizes, pagination, seeded sort/page exploration, scoped handles, source survival, and no side effects after **every** scenario. Durable artifacts: before/after/diff JSON, journal JSONL, summary JSON, results CSV, report Markdown and replay plan. Seed controls generated binary files and 40 bounded navigation transitions. The owned corpus includes an original generated PNG, Unicode/deep/long names, duplicate basenames, an empty directory/file, a 1 MiB sparse fixture and an outside-root symlink. Video/PDF corpus and Windows-specific cases are not yet provided. Add scenarios with `@scenario`; missing registry entries fail preflight.

This is a bounded read-only model, not exhaustive filesystem coverage. Writes, Windows handles/locks/reparse points, native recovery and live website drags remain BLOCKED/unverified. The lab reports blocked commands separately even when their denial contract is correct. It does not yet simulate process interruption, transfer staging or mutation reconciliation. Media decoder and HTTP range checks live in the regression suite/browser test. Permission tests must use an unprivileged account; no fake permission verdicts on privileged runners.
