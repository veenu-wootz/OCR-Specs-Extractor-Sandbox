        function refreshNotifications() {
            // The renderer runs while `hot = new Handsontable(...)` is still
            // evaluating, so during the first paint this global is not assigned
            // yet. Without this guard the call below throws, the renderer throws
            // with it, and Handsontable aborts — leaving a blank table.
            if (!hot) return;

            // Reset notification flag to allow new notifications
            hasWarningNotificationShown = false;
            
            let highestPriorityNotification = null;
            const dupRows = duplicateChildPartRows();

            // Scan all rows for current issues
            for (let row = 0; row < hot.countRows(); row++) {
                const rowData = hot.getSourceDataAtRow(row);
                if (!rowData) continue;
                
        // ADD THESE DEBUG LOGS:
        console.log(`🔍 Row ${row} debug:`, {
            rowData: rowData,
            similarityScore: rowData._similarityScore,
            hasScore: rowData._similarityScore !== undefined,
            scoreValue: rowData._similarityScore,
            isLowSimilarity: rowData._similarityScore > 0 && rowData._similarityScore < 0.95
        });            
                
                const type = rowData.Type?.trim();
                const qty = rowData.Quantity?.text?.trim(); 
                const partNumber = rowData["Matched Childpart"]?.trim();
                
                // Skip completely empty rows
                if (!type && !qty && !partNumber) continue;

                // PRIORITY 1: Missing Drawing Error (OCR mismatch) - RED ICON + NOTIFICATION
                if (rowData["_missingDrawing"]) {
                    // Same wording the validators use for this condition. Both
                    // describe the same row, and the validator's own call to
                    // requestNotificationRefreshOnce() (plus the renderer's, when
                    // it paints the red !) means this scan runs immediately after
                    // one is shown. Identical text makes that handover invisible
                    // instead of replacing a specific message with a vague one.
                    const badPart = (rowData["Matched Childpart"] || "").toString().trim();
                    highestPriorityNotification = {
                        message: badPart
                            ? `"${badPart}" is not a valid child part.`
                            : "Part Number Not Found",
                        type: "error",
                        priority: 1
                    };
                    break; // Highest priority, stop checking
                }
                
                // PRIORITY 2: Duplicate part number - RED ICON + NOTIFICATION
                // Wording matches the validators exactly, so whichever writes
                // first there is no visible swap.
                if (dupRows.has(row)) {
                    const dupPart = (rowData["Matched Childpart"] || "").toString().trim();
                    if (!highestPriorityNotification || highestPriorityNotification.priority > 2) {
                        highestPriorityNotification = {
                            message: `"${dupPart}" is already used in another Child Part row.`,
                            type: "error",
                            priority: 2
                        };
                    }
                }

                // PRIORITY 3: Low Similarity Warning - YELLOW ICON + NOTIFICATION  
                if (rowData.Type === "Child Part" && rowData._similarityScore !== undefined && rowData._similarityScore < 0.95) {
                    if (!highestPriorityNotification) {
                        highestPriorityNotification = { 
                            message: "Part Manually Selected", 
                            type: "warning",
                            priority: 2 
                        };
                    }
                }
                
                // NOTE: These have icons but NO real-time notifications (by design):
                // - Invalid Quantity (red !) - Only shows notification on Submit
                // - Type errors - Only shows notification on Submit  
                // - These are handled in validateRequiredFields() for Submit-time validation
            }
            
            // Show the highest priority notification found (if any)
            if (highestPriorityNotification) {
                showNotification(
                    highestPriorityNotification.message, 
                    highestPriorityNotification.type
                );
                hasWarningNotificationShown = true;
                
                console.log(`📢 Notification shown: ${highestPriorityNotification.message} (Priority ${highestPriorityNotification.priority})`);
            } else {
  console.log(`✅ No errors found`);
  const area = document.getElementById('notification-area');

  // If a SUCCESS is showing, leave it (it will auto-hide)
  if (area && area.classList.contains('notification-success')) return;

  // Otherwise keep our default instructions visible
  showDefaultInstructions();
}
        }

      // opts.skipRows  physical row indices already written to Glide. Their
      //                field-level problems cannot be fixed from here, so
      //                checking them would strand a resume permanently.
      // opts.resume    a resume already has content, so it does not need to find
      //                an otherwise-valid row (a PDF-only retry has none).
