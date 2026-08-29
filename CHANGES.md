# Changes

## Version 1.0.0 — 29 August 2026

Draft autosave and resumable submission for the OCR Specs Extractor frontend.

Deployed to production (`dev-ocr-table-extractor`, branch `dev-changes`) as commit
`2812593`. Developed and tested in `OCR-Specs-Extractor-Sandbox`.

**Scope:** `frontend/index.html` only. The backend, `app.py`, the Dockerfile and
every deploy config are byte-identical to the previous release.

---

## 1. Why this was built

The frontend runs as a **Glide Web Embed** — a cross-origin iframe. Any remount or
reload wiped everything the user had entered: OCR results, manual edits, Type and
Part mappings. Reported symptoms were a spontaneous refresh during long sessions,
navigating away in Glide and back, and one case of duplicated data after a
reload-then-resubmit.

Investigation found a second, independent problem: **submission was not
idempotent**. Three writes ran sequentially inside one `try`:

1. `POST /add-child-parts`
2. `POST /generate-missing-childpart-pdf`, once per missing-drawing row
3. `POST /add-bo-parts`

If step 3 failed, the catch showed a generic error, the table was never cleared,
and it looked as though nothing had been saved. Resubmitting wrote step 1's rows
to Glide **a second time**. Step 2 was separately non-idempotent: Cloudinary
overwrites safely, but it then does an `add-row-to-table` into the Drawing table,
so every retry added another duplicate Drawing row. Its failures were only logged,
never surfaced — quietly defeating the "no silent misses" guarantee that feature
exists for.

---

## 2. What was added

### 2.1 Draft autosave

Table contents are saved locally per drawing and offered back on reload.

- **Key:** `ocrdraft:v1:{project}|{part}|{parentdrgnum}|{rowID}`.
  `item` is deliberately **excluded** — it changes after every submit and would
  orphan the draft the user is still working on.
- **Stored:** `spreadsheetData` only. **Never the uploaded images** — a realistic
  draft is under 20 KB.
- **Expiry:** 24 h, swept on load. Oldest-first eviction on `QuotaExceededError`.
- **Restore:** hooks into `initializeHandsontable()`, the single place that seeds
  the blank rows, and runs *after* `windowChildParts` is fetched so dropdowns are
  populated.

### 2.2 Storage adapter

All persistence goes through one `DraftStore` object (`load`/`save`/`clear`/`sweep`).
Call sites never touch `localStorage` directly, so a server-side backend can be
added later behind the same interface.

It probes `localStorage → sessionStorage → window.name → memory`, and **each
candidate must survive a real write/read/remove round-trip before being accepted**.
An earlier version accepted `window.name` without exercising it, which silently
swallowed every save where that store was unusable.

### 2.3 Resumable staged submission

The three writes became tracked stages, each carrying its own status:

| Status | Meaning |
|---|---|
| `todo` | built, not attempted |
| `pending` | request sent, **outcome unknown** |
| `failed` | server rejected it |
| `done` | landed in Glide |
| `skipped` | nothing to send |

Rules:

- A stage that already reached Glide is **never sent again**.
- Stages that did *not* land are **rebuilt from the live table** on retry, so both
  corrections and rows added since the failure go out.
- PDFs are tracked **per part**, because each call adds a Drawing row.
- Rows already written become **read-only** — the backend can only add rows, so an
  edit there could never reach Glide.

### 2.4 Duplicate child-part block

The dropdown already prevented duplicates by filtering used values out of its list,
but **pasting or typing bypassed that filter**, and of four duplicate checks only
one cleared the value. Nothing flagged the row, so the warning was the only
evidence and vanished with the next message.

Now blocked at submit, and marked with the red `!` on the offending row. Compared
after the same normalisation `sendDataToBackend` applies, so `D.1.0` and `D10` are
recognised as one drawing.

### 2.5 Storage warning

A line under Submit when persistence is unreliable:
*"Autosave not reliable — work may be lost after inactivity."*

---

## 3. Pre-existing bugs fixed along the way

| Bug | Cause |
|---|---|
| BO italics never cleared when Type changed back | `cells()` only assigned `className` on the BO branch; Handsontable's cell meta persists between renders, so nothing overwrote it |
| Red `!` icons survived a cleared table | `clearTableToDefault()` could not reach `PartNumber` (filtered out of `visibleColumns`, so Handsontable has no column for it) and never deleted the warning flags |
| A phantom "unsaved work" prompt right after a successful submit | same cause — leftover `PartNumber` text kept the row non-blank |
| Error messages erased a tick after appearing | the no-issue branch of `refreshNotifications()` protected success messages but not errors, so `showDefaultInstructions()` wiped them |
| Fixing the last issue left its message on screen | the renderer only requested a refresh when it had *found* a problem |

---

## 4. Design decisions, and why

**Storage keyed per drawing, not per user.** There is no auth. Drafts are
per-browser, so two people on one drawing never collide.

**Only `spreadsheetData` is persisted.** Every visual — confidence colours, warning
icons, Type colours, `bo-row` italics — is re-derived by the renderer from row
data. Restoring the data restores the appearance. Images are never stored.

**Derived state is computed, never stored.** Duplicates are recalculated on demand
rather than kept in a flag. A stored flag is how `_missingDrawing` ended up set in
five places and cleared in three; a derived one cannot go stale.

**Submitted rows are identified by a key on the row object, not by position.**
Positions shift when a row is inserted or deleted. An earlier version matched by
physical index, so inserting a row above a saved one caused it to be written to
Glide twice while the new row was silently dropped.

**A `pending` stage is retried.** *Accepted risk:* if the original request actually
landed, this duplicates. Chosen because the alternative — skipping it — silently
discarded rows. The modal warns the user to check Glide first.

**Resume validates, but scoped.** Rows already in Glide are excluded from the field
checks, since nothing on screen can correct them and one bad row would block the
resume permanently. They still count for duplicates, so a new row colliding with a
saved one is caught.

**Notifications rank by type; errors hold until resolved.** Released only by an
equal-or-higher priority message, explicit dismissal, or the user's next edit.
State-derived messages are re-detected by the row scan, so they reappear for as
long as the row is actually wrong.

**Derived fields are excluded from the change fingerprint.** The renderer writes
`_similarityScore` into the data model during paint. Counting that as an edit
restamped `savedAt` on every visit, so an active draft never aged and the 24 h
expiry never fired.

---

## 5. Known limitations and accepted risks

- **Safari.** Storage in a cross-origin iframe is ephemeral. Observed: survives
  reload and in-app navigation; **lost on browser close, and lost after inactivity
  even with the browser open.** No client-side fix exists — only a server-side
  draft would close it. Chromium browsers hold a draft for the full 24 h
  (verified at 23 h).
- **An unfinished submission expires with the draft** — same key, same 24 h, same
  Safari fate. If someone does not return within a day, the table is empty with no
  indication that half the rows are already in Glide. *Accepted:* sent data is
  checkable in the app.
- **Browser detection for the warning is a user-agent heuristic.** No API reports
  whether storage will persist. Verified correct across Safari macOS/iOS, Chrome,
  Brave, Edge, Firefox and the iOS Chrome/Firefox variants.
- **No escape hatch from an unresolved submission.** While one is outstanding the
  restore prompt (and its *Start fresh*) is suppressed; the only exits are
  finishing it or waiting 24 h.

---

## 6. Deliberately not changed

All pre-existing, all documented rather than patched:

- **The "No Match Found" overlay** has four defects: an uncancelled `setTimeout`
  re-shows it over a valid dropdown; every keystroke starts another polling loop;
  the overlay and the dropdown use *different* definitions of "no match"
  (`windowChildParts` vs the used-filtered set); and `hot.getSelected()` is
  unguarded, so the loop can die and strand the overlay.
- **Item numbers skip blank rows** — `lastOcrBomItem + vRow + 1` uses the visual
  row index. May be intentional, to mirror the drawing's own layout.
- **Type cannot be cleared from its dropdown** — its `source` lacks the `""` entry
  that `Matched Childpart` has. One line, if wanted.
- **The table waits for `/fetch-drawings`** before rendering, so a slow Glide call
  shows a blank table.
- **The item counter is stale across concurrent users** — read once from the URL,
  and `update_last_ocr_bom_item_direct` does a blind `set`, so it can regress.
  Needs a backend change.
- **`allowInvalid` is declared twice** in the column object; the later `true` wins,
  so the earlier `false` is dead. Left in place — the validator deliberately keeps
  invalid values in order to flag them.

---

## 7. Open backend issue (not touched by this release)

`DocAI failed: cannot unpack non-iterable numpy.int32 object`, observed on the
sandbox Render service. Origin is the `add_top_bottom_borders` preprocessing chain
feeding `_map_to_bands`, which does `for (y1, y2) in bands:` and received flat
values. DocAI raises, the cascade catches it, and **every extraction silently
downgrades to GPT-4o** — correct output, but the wrong engine and needless cost.

Production is currently unaffected. Worth fixing while a reproduction exists,
because a rebuild that resolves different package versions could surface it there.

Related: `/fetch-drawings` creates its httpx client with **no timeout** (the write
endpoints use `timeout=30.0`), so an unreachable Glide hangs ~41 s instead of
failing fast. `httpx` is also the one unpinned dependency in `requirements.txt`.

---

## 8. Testing

`./tests/run.sh` — 243 assertions across 10 suites, plus a headless browser check.

The suites re-extract the logic from `frontend/index.html` on every run, so they
cannot drift from the source.

The **render check** exists because a change that passed every logic suite still
shipped a blank table: the renderer runs while `hot = new Handsontable(...)` is
still being evaluated, so anything dereferencing `hot` throws during the first
paint. It loads the page in headless Chrome and fails on any uncaught error or a
short cell count.

`tests/BROWSER-TESTS.md` covers what only a browser can verify — the staged-submit
retry, fix-and-retry, Safari storage limits, restore behaviour and row styling —
including a console snippet for injecting a single-endpoint failure.

---

## 9. Deployment

| Environment | Repo | Branch | `API_BASE` |
|---|---|---|---|
| Production | `dev-ocr-table-extractor` | `dev-changes` | `https://ocr-gemini-test.onrender.com` |
| Sandbox | `OCR-Specs-Extractor-Sandbox` | `main` | `https://dev-ocr-table-extractor.onrender.com` |

**GitHub Pages serves `dev-changes` directly, so a push to it deploys immediately.**

> ⚠️ **`API_BASE` is the only intended difference between the two.** Always check it
> when moving code either way. Pointing production at the sandbox backend would be a
> visible outage — that service has repeatedly been the unhealthy one.

Verification performed before the production push: the requests reaching Glide were
captured from both builds in a browser and compared — same endpoints, same fields,
same values, `itemNumber` included. Internal row markers (`_sentKey`, `_pRow`) are
stripped before sending.
