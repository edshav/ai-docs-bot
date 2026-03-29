/**
 * DatabaseService: Manages state and draft persistence in Google Sheets.
 */
const DatabaseService = (function () {
  const scriptProps = PropertiesService.getScriptProperties();
  const ssId = scriptProps.getProperty("DATABASE_SHEET_ID");
  const sheet = SpreadsheetApp.openById(ssId).getSheets()[0];

  /**
   * Task 3.1: Save or update a draft in the database.
   */
  function saveDraft(data) {
    // Get a public lock that lasts for 30 seconds
    const lock = LockService.getScriptLock();
    try {
      // Wait up to 10 seconds for other processes to finish before timing out
      lock.waitLock(10000);

      const rows = sheet.getDataRange().getValues();
      const tgMsgId = String(data.tg_msg_id);
      let rowIndex = -1;

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === tgMsgId) {
          rowIndex = i + 1;
          break;
        }
      }

      const rowData = [
        tgMsgId,
        data.branch_name,
        data.file_path,
        data.draft_content,
        data.status,
        new Date(),
      ];

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      } else {
        sheet.appendRow(rowData);
      }

      // Force changes to save immediately before releasing the lock
      SpreadsheetApp.flush();
    } catch (e) {
      console.error("Lock Timeout or Database Error: " + e.toString());
      throw e;
    } finally {
      // Always release the lock so other users can use the bot
      lock.releaseLock();
    }
  }

  /**
   * Task 4.1/4.2: Find a draft to check for locks or refinements.
   */
  function findDraftByMsgId(tgMsgId) {
    const rows = sheet.getDataRange().getValues();
    const row = rows.find((r) => String(r[0]) === String(tgMsgId));
    if (!row) return null;

    return {
      tg_msg_id: row[0],
      branch_name: row[1],
      file_path: row[2],
      draft_content: row[3],
      status: row[4],
    };
  }

  /**
   * Check if any file is currently being edited (status = PROCESSING or PENDING).
   */
  function getActiveLock() {
    const rows = sheet.getDataRange().getValues();
    // Look for any row that isn't 'COMMITTED' or 'CANCELED'
    return rows.find((r) => r[4] === "PROCESSING" || r[4] === "PENDING");
  }

  /**
   * Task 5.1: Force-clears any active locks for a specific file.
   */
  function clearLock(filePath) {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      // If the file is locked (PENDING/PROCESSING), mark it as FAILED or CANCELED
      if (
        rows[i][2] === filePath &&
        (rows[i][4] === "PENDING" || rows[i][4] === "PROCESSING")
      ) {
        sheet.getRange(i + 1, 5).setValue("CANCELED"); // Column 5 is 'status'
      }
    }
    SpreadsheetApp.flush();
  }

  // Add to return block:
  return {
    saveDraft,
    findDraftByMsgId,
    getActiveLock,
    clearLock,
  };
})();
