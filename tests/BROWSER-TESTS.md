# Browser tests

Manual tests for the things the headless suites can't reach: Handsontable
rendering, the read-only lock, the modals, and the real Glide round-trip.

> **These write to the live Glide tables.** The backend's table IDs are hardcoded,
> so it does not matter which Render service is called — a submit is a real
> submit. **Use a disposable test part number for everything below**, and keep the
> Glide Child Parts / BO Parts / Drawing tables open in another tab to verify.

---

## Setup: getting a console inside the embed

The app runs in an iframe inside Glide. Commands must run **in the iframe**, not
the Glide page that hosts it — otherwise you are inspecting Glide's storage, not
ours.

**Brave / Chrome / Edge**

1. Open your Glide app and go to the screen containing the Web Embed.
2. Open DevTools — `Cmd+Option+I` (Mac) or `F12` (Windows).
3. Go to the **Network** tab and tick **Preserve log**, so the record survives
   Glide reloading the embed. Then go to the **Console** tab.
4. At the top of the Console there is a dropdown that says **`top`**. Click it and
   choose the entry showing the `veenu-wootz.github.io` URL.

Everything you type now runs inside the app. If you skip step 4, the snippets
below will appear to do nothing.

**Safari**

1. Safari → Settings → Advanced → tick **"Show features for web developers"**
   (older versions: "Show Develop menu in menu bar").
2. Open the app, then `Cmd+Option+I`.
3. Console tab → use the frame/context picker and select the `github.io` frame.

---

## The failure-injection snippet

Paste this into the iframe console. It makes one endpoint fail while everything
else works normally.

```js
// Save the real fetch once, so we can put it back later.
window.__origFetch = window.__origFetch || window.fetch;

// Choose what to break: '/add-bo-parts', '/add-child-parts',
// or '/generate-missing-childpart-pdf'
window.__breakUrl = '/add-bo-parts';

window.fetch = (url, opts) => {
  if (String(url).includes(window.__breakUrl)) {
    console.warn('[test] forcing failure for', window.__breakUrl);
    return Promise.resolve(new Response('forced failure for testing', { status: 500 }));
  }
  return window.__origFetch(url, opts);
};
console.log('[test] failure injection active for', window.__breakUrl);
```

**To stop breaking it** — use this exact snippet, which is safe to run at any time:

```js
if (typeof window.__origFetch === 'function') {
  window.fetch = window.__origFetch;
  console.log('[test] restored');
} else {
  console.log('[test] nothing to restore — fetch is already the real one');
}
```

> ⚠️ **Never run a bare `window.fetch = window.__origFetch;`.**
> If the page has reloaded since you injected the failure, `__origFetch` is
> `undefined`, and that line assigns `undefined` to `window.fetch` — **deleting the
> browser's fetch entirely.** Every request then fails with *"fetch is not a
> function"*, including ones you never meant to break. The tell is the console
> echoing `undefined` after the assignment. If it happens, just reload the page.

Three things to know:

- **Reloading the page undoes the injection by itself.** A reload gives a fresh
  `window`, so `fetch` is already normal and `__origFetch` is gone. After any
  reload you must paste the injection snippet again — and you do *not* need the
  undo.
- **A 500 is different from a blocked request.** This snippet returns a real HTTP
  error, so the stage is recorded as `failed`. Blocking the request in the Network
  panel makes fetch *throw*, which the app records as `pending` — "sent, outcome
  unknown" — and the modal warns you to check Glide before resending. Both paths
  retry correctly; the wording differs because the risk does.
- **Tick "Preserve log"** at the top of the Network panel before you start.
  Without it, the log is wiped every time Glide reloads the embed, and it will
  look as though no requests were made.

---

## Test A — staged submit does not duplicate rows

**The point:** after a partial failure, a retry must send only the missing part.

1. Open the app with a disposable test part.
2. Console → paste the snippet with `__breakUrl = '/add-bo-parts'`.
3. Fill in at least **one Child Part row** and **one BO row**. Each needs Type,
   Quantity and Part Number, or submit-time validation will stop you.
4. Press **Submit**.

Expected:

- Notification names what already saved: *"Already saved to Glide (will not be
  resent): Child Parts."*
- The **Submit button now reads "Send remaining"**.
- The Child Part rows are dimmed with a green edge and **read-only** — click one
  and try to type; it should refuse.
- Network tab: `add-child-parts` → 200, `add-bo-parts` → 500.
- In Glide: Child Parts has your rows, BO Parts has nothing.

5. Console → `window.fetch = window.__origFetch;`
6. Press **Send remaining**.

Expected — **this is the assertion that matters**:

- In the Network tab, filter for `add-` and count. You should see
  **`add-child-parts` ×1** and **`add-bo-parts` ×2** for the whole session.
  A second `add-child-parts` would mean the fix is broken.
- Success notification, table clears, Submit reads "Submit" again.
- In Glide: Child Parts still has **exactly** the original rows — no duplicates.
  BO Parts now has its rows.

### A2 — the placeholder drawing

Same shape, for the non-idempotent PDF step.

1. Fresh test part. Set one row's Type to **Missing Drawing**.
2. Snippet with `__breakUrl = '/generate-missing-childpart-pdf'`.
3. Submit. Expect an error naming the part whose placeholder failed, and Child
   Parts already saved.
4. Restore fetch, press the button again.
5. In Glide's **Drawing** table: exactly **one** placeholder row for that part.
   Two would mean the per-part tracking is broken.

---

## Test B — fix-and-retry, and adding rows

**The point:** a retry must send your corrections and any rows you added, not a
stale copy of the original attempt.

1. Get into the failed state from Test A (BO parts failed, not yet retried).
2. **Correct** the BO row that failed — change its Quantity to something
   distinctive, e.g. `77`.
3. **Add a new BO row** — Type BO, a quantity, a part number.
4. Restore fetch, press **Send remaining**.
5. Network tab → click the `add-bo-parts` request → **Payload** tab (Chrome/Brave)
   or **Request** tab (Safari).

Expected in the JSON:

- `rows` has **2** entries — the corrected one and the new one.
- The first shows `"quantity": "77"` — your correction, not the original value.
- The new row has a **higher `itemNumber`**, and no `itemNumber` repeats.
- No `itemNumber` collides with the ones the Child Parts request already used
  (scroll back to that earlier request to compare).

---

## Test C — Safari storage reality check

You have already run the practical version of this; these are the precise steps
if you want to confirm.

In the **iframe console** on Safari:

```js
localStorage.setItem('t', String(Date.now()));
localStorage.getItem('t');   // note the number
```

Then check `localStorage.getItem('t')` again after each of:

1. Reloading the embed
2. Navigating away in Glide and coming back
3. **Quitting Safari entirely** (`Cmd+Q`) and reopening

Whatever returns `null` marks the boundary of what Safari keeps. Expected from
earlier testing: 1 and 2 survive, 3 does not — which is why the
**"Autosave: session only"** pill appears on Safari.

---

## Test D — draft restore behaviour

1. Enter some data. Reload. → Modal: *Unsaved work found*. Press **Restore**.
2. Reload again **without changing anything**. → No modal; a brief
   *"Restored N rows"* notification instead.
3. Note the age in the modal, wait a couple of minutes, reload. → The age should
   have **grown**. If it says "just now" every time, the timestamp fix regressed.
4. Change a cell, then reload. → Modal returns, because there is a new decision
   to make.
5. Open the app fresh, touch nothing, leave, come back. → **No modal at all**;
   an untouched session must not leave a draft behind.

---

## Test E — row styling

1. Set a row's Type to **BO** → the row goes italic.
2. Change it back to **Child Part** → the italic must clear.

This one regressed before: cell metadata persists between renders, so the class
was applied but never removed.
