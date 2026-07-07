// Phase 1: plumbing only. No auth yet (added in Phase 2).

var SHEET_NAME = 'Weights';
var DATE_COL = 1;   // A
var WEIGHT_COL = 2; // B
var UPDATED_COL = 3; // C
var HEADER_ROWS = 1;

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (action === 'list') {
      return listEntries_();
    }
    return errorResponse_('Unknown or missing action');
  } catch (err) {
    return errorResponse_(err.message);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    if (action === 'add' || action === 'update') {
      return upsertEntry_(body.date, body.weight);
    }
    if (action === 'delete') {
      return deleteEntry_(body.date);
    }
    return errorResponse_('Unknown or missing action');
  } catch (err) {
    return errorResponse_(err.message);
  }
}

function listEntries_() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  var entries = [];
  if (lastRow > HEADER_ROWS) {
    var values = sheet.getRange(HEADER_ROWS + 1, 1, lastRow - HEADER_ROWS, UPDATED_COL).getValues();
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      if (row[DATE_COL - 1] === '') continue;
      entries.push({
        date: formatDateForClient_(row[DATE_COL - 1]),
        weight: row[WEIGHT_COL - 1],
        updatedAt: row[UPDATED_COL - 1] || null
      });
    }
  }
  entries.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return jsonResponse_({ ok: true, data: entries });
}

function upsertEntry_(dateStr, weight) {
  validateDate_(dateStr);
  validateWeight_(weight);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet_();
    var rowIndex = findRowByDate_(sheet, dateStr);
    var dateValue = parseDateFromClient_(dateStr);
    var now = new Date();

    if (rowIndex === -1) {
      sheet.appendRow([dateValue, weight, now]);
    } else {
      sheet.getRange(rowIndex, DATE_COL).setValue(dateValue);
      sheet.getRange(rowIndex, WEIGHT_COL).setValue(weight);
      sheet.getRange(rowIndex, UPDATED_COL).setValue(now);
    }
    return jsonResponse_({ ok: true, date: dateStr, weight: weight });
  } finally {
    lock.releaseLock();
  }
}

function deleteEntry_(dateStr) {
  validateDate_(dateStr);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet_();
    var rowIndex = findRowByDate_(sheet, dateStr);
    if (rowIndex === -1) {
      return errorResponse_('No entry found for date ' + dateStr);
    }
    sheet.deleteRow(rowIndex);
    return jsonResponse_({ ok: true, date: dateStr });
  } finally {
    lock.releaseLock();
  }
}

function findRowByDate_(sheet, dateStr) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROWS) return -1;
  var dates = sheet.getRange(HEADER_ROWS + 1, DATE_COL, lastRow - HEADER_ROWS, 1).getValues();
  for (var i = 0; i < dates.length; i++) {
    if (dates[i][0] === '') continue;
    if (formatDateForClient_(dates[i][0]) === dateStr) {
      return HEADER_ROWS + 1 + i;
    }
  }
  return -1;
}

function getSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet tab "' + SHEET_NAME + '" not found');
  return sheet;
}

function getTimeZone_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}

function formatDateForClient_(dateValue) {
  return Utilities.formatDate(dateValue, getTimeZone_(), 'yyyy-MM-dd');
}

function parseDateFromClient_(dateStr) {
  var parts = dateStr.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function validateDate_(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('date must be a string in yyyy-MM-dd format');
  }
}

function validateWeight_(weight) {
  if (typeof weight !== 'number' || !isFinite(weight) || weight <= 0) {
    throw new Error('weight must be a positive number');
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse_(message) {
  return jsonResponse_({ ok: false, error: message });
}
