      function validateRequiredFields() {
  const missingColumns = new Set();
  const invalidColumns = new Set();
  let hasValidRow = false;

//  const hasChildList = Array.isArray(windowChildParts) && windowChildParts.length > 0;
//  const missingChildLabel = TYPE_DISPLAY_NAMES["Missing Childpart"]; // "Missing Drawing" label

  spreadsheetData.forEach((row, idx) => {
    const type = row.Type?.trim();
    const qty = row.Quantity?.text?.trim();
    const table_partNumber = (row["Matched Childpart"] || "").toString().trim();

    // Skip empty rows (no Type, Quantity, and PartNumber)
    if (!type && !qty && !table_partNumber) return;

    hasValidRow = true;

    // Collect missing fields
    if (!type) missingColumns.add("Type");
    if (!table_partNumber) missingColumns.add("Part Number");
    if (!qty) missingColumns.add("Quantity");

    // Collect invalid fields
    if (row.Quantity?.text && !/^\d+$/.test(row.Quantity.text.trim())) {
      invalidColumns.add("Quantity");
    }

    // ✅ BLOCK SUBMIT: UI already flagged "Part Number Not Found"
    // (this is the exact case you showed)
    if (row._missingDrawing) {
      invalidColumns.add("Part Number");
    }

    // ✅ Extra safety: if Type is Child Part and we have the list, ensure part is valid
    // (covers cases where validator didn't run / flag not set)
    // if (type === "Child Part" && table_partNumber && hasChildList) {
    //   if (!windowChildParts.includes(table_partNumber)) {
    //     invalidColumns.add("Part Number");
    //   }
    // }

    // Optional strictness: if list not loaded, don't allow Child Part submit
    // uncomment if you want HARD BLOCK until list loads
    // if (type === "Child Part" && table_partNumber && !hasChildList) {
    //   invalidColumns.add("Part Number");
    // }
  });

  // Backstop against duplicate child parts reaching Glide.
  //
  // The dropdown already prevents this by filtering used values out of its list,
  // but pasting or typing bypasses that filter, and of the four duplicate checks
  // only the auto-match one clears the value — the rest warn and keep it. Since
  // nothing flags the row, the warning is the only evidence, and it disappears as
  // soon as any other notification replaces it.
  //
  // This changes no UI and no input handling: it reuses the existing validation
  // result, so whichever route created the duplicate, it cannot be submitted.
  //
  // Compared after the same normalisation sendDataToBackend applies (trimmed,
  // dots stripped), so "D.1.0" and "D10" are correctly seen as one drawing —
  // they would otherwise land in Glide as two identical rows.
  const seenDrawings = new Map();
  const duplicateParts = new Set();
  spreadsheetData.forEach(row => {
    const type = (row.Type || "").trim();
    const qty = row.Quantity?.text?.trim();
    // Mirror the row filter in sendDataToBackend: incomplete rows are not sent,
    // and are already reported above as missing Type/Quantity.
    if (!qty || !type) return;
    if (type !== "Child Part" && type !== TYPE_DISPLAY_NAMES["Missing Childpart"]) return;
    const raw = (row["Matched Childpart"] || "").toString().trim();
    if (!raw) return;                       // already reported as a missing Part Number
    const key = raw.replaceAll(".", "");
    if (seenDrawings.has(key)) duplicateParts.add(raw);
    else seenDrawings.set(key, true);
  });

  const messages = [];
  if (missingColumns.size > 0) {
    messages.push(`(${Array.from(missingColumns).join(", ")})`);
  }
  if (invalidColumns.size > 0) {
    messages.push(`Invalid Data (${Array.from(invalidColumns).join(", ")})`);
  }
  if (duplicateParts.size > 0) {
    messages.push(`Duplicate Part Number (${Array.from(duplicateParts).join(", ")})`);
  }

  return {
    isValid: hasValidRow && messages.length === 0,
    missingFields: messages
  };
}

