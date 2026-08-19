// Physical row indices that repeat a drawing already claimed by an earlier row.
// Derived on demand rather than stored as a flag, so it cannot go stale: fix or
// delete the offending row and it simply stops being reported.
//
// Only rows bound for the Child Parts table count (Child Part, Missing Drawing),
// matching the submit-time check. Compared after the same normalisation
// sendDataToBackend applies, so "D.1.0" and "D10" are one drawing.
//
// The FIRST occurrence is left clean and later ones are marked, so the row to
// correct is the obvious one. O(rows) per call, and the tool is designed for
// well under ten rows.
function duplicateChildPartRows() {
    const seen = new Map();
    const dupes = new Set();
    spreadsheetData.forEach((row, idx) => {
        if (!row) return;
        const type = (row.Type || "").trim();
        if (type !== "Child Part" && type !== TYPE_DISPLAY_NAMES["Missing Childpart"]) return;
        const raw = (row["Matched Childpart"] || "").toString().trim();
        if (!raw) return;
        const key = raw.replaceAll(".", "");
        if (seen.has(key)) dupes.add(idx);
        else seen.set(key, idx);
    });
    return dupes;
}
        // Fetch query-params (project, part, parentdrgnum) on load and fetch childParts
        