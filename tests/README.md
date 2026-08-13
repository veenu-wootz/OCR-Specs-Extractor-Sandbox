# Logic tests

Headless tests for the draft-persistence and resumable-submit logic in
`frontend/index.html`. No browser and no dependencies beyond Node.

```bash
./tests/run.sh                     # defaults to ../frontend/index.html
./tests/run.sh path/to/index.html
```

## How it works

The app is a single HTML file, so `extract.py` pulls the self-contained logic
blocks out of it on every run — the tests can never drift from the source. Each
suite then supplies stub `window` / `document` / `localStorage` / `fetch`
objects and runs the real code under Node.

| Suite | Covers |
|---|---|
| 1 | storage adapter, draft key, TTL sweep, quota eviction, row normalisation, lock bookkeeping |
| 2 | storage fallback chain — sessionStorage, window.name, memory |
| 3 | submit payload construction, item numbering, physical vs visual rows, divergence detection |
| 4 | staged submit end-to-end against a mocked fetch: partial failure, retry, fix-and-retry, added rows, PDF stage |
| 5 | notification priority and hold-until-resolved behaviour |

## What this does NOT cover

Everything that needs a real browser: Handsontable rendering, `readOnly`
enforcement, modal display, cell styling, and the actual Glide round-trip.
Network calls are mocked throughout — no request reaches Glide, Render or
Cloudinary.
