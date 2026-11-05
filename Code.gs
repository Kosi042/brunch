/* Google Apps Script backend. Host secrets stay in Script Properties. */
const FOOD_HEADERS = ['ID', 'Speise / Getränk', 'Einheit', 'Gesamt', 'Zählweise', 'Aktiv'];
const CHANGE_HEADERS = ['Anfrage-ID', 'Auswahl-ID', 'Änderung', 'Zeitpunkt', 'Browser-ID', 'Ausgewählt'];
const MAX_TOTAL = 10000;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Brunch')
    .addItem('Planer vorbereiten / Summenformeln aktualisieren', 'setupBrunch_')
    .addItem('Gastgeber-Code anzeigen', 'showHostCode_').addToUi();
}
function setupBrunch_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Bitte die Einrichtung über das Skript deiner Google-Tabelle starten.');
  return withLock_(() => {
    const foods = ensureSheet_(book, 'Foods', FOOD_HEADERS);
    ensureSheet_(book, 'Changes', CHANGE_HEADERS);
    const props = PropertiesService.getScriptProperties();
    props.setProperty('BRUNCH_SHEET_ID', book.getId());
    if (!props.getProperty('BRUNCH_HOST_KEY')) props.setProperty('BRUNCH_HOST_KEY', Utilities.getUuid() + Utilities.getUuid());
    const used = new Set();
    dataRows_(foods, 6).forEach((row, i) => {
      if (!String(row[1]).trim()) return;
      const id = String(row[0] || Utilities.getUuid());
      if (used.has(id)) throw new Error('Jede Auswahl braucht eine eigene ID. Bitte die kopierte ID entfernen.');
      used.add(id);
      const mode = row[4] || 'quantity';
      if (!['quantity', 'interest'].includes(mode)) throw new Error('Die Zählweise muss quantity oder interest sein.');
      foods.getRange(i + 2, 1, 1, 6).setValues([[id, row[1], mode === 'interest' ? 'Personen' : (row[2] || 'Stück'), '', mode, row[5] === '' ? true : row[5]]]);
      setTotalFormula_(foods, i + 2);
    });
    foods.setColumnWidth(1, 275); foods.setColumnWidth(2, 240);
    foods.setColumnWidth(3, 130); foods.setColumnWidth(4, 100);
    SpreadsheetApp.flush();
  });
}
// Private functions cannot be called through google.script.run.
function showHostCode_() {
  const code = PropertiesService.getScriptProperties().getProperty('BRUNCH_HOST_KEY');
  if (!code) throw new Error('Bitte zuerst „Planer vorbereiten“ ausführen.');
  SpreadsheetApp.getUi().alert('Dein Gastgeber-Code', code + '\n\nNur für dich. Auf der Website unter „Gastgeber“ eingeben.', SpreadsheetApp.getUi().ButtonSet.OK);
}
function ensureSheet_(book, name, headers) {
  const sheet = book.getSheetByName(name) || book.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const oldFormat = current.slice(0, 4).every((v, i) => v === headers[i]) && current.slice(4).every(v => v === '');
  if (oldFormat) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  assertHeaders_(sheet, headers);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setBackground('#244b3e').setFontColor('#ffffff').setFontWeight('bold');
  return sheet;
}
function assertHeaders_(sheet, headers) {
  if (!sheet || sheet.getRange(1, 1, 1, headers.length).getValues()[0].some((value, i) => value !== headers[i])) {
    throw new Error('Die Tabellenblätter fehlen oder haben andere Überschriften. Bitte „Planer vorbereiten“ ausführen.');
  }
}
function setTotalFormula_(sheet, row) {
  sheet.getRange(row, 4, 1, 1).setFormulas([['=IF(A' + row + '="","",SUMIF(Changes!B:B,A' + row + ',Changes!C:C))']]);
  sheet.getRange(row, 4, 1, 1).setNumberFormat('0');
}
function dataRows_(sheet, columns) {
  return sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, columns).getValues() : [];
}
function withLock_(action) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return action(); } finally { lock.releaseLock(); }
}
function validId_(id, min) { return typeof id === 'string' && id.length >= min && /^[a-zA-Z0-9_-]{1,100}$/.test(id); }
function requireHost_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('BRUNCH_HOST_KEY');
  if (!expected || typeof key !== 'string' || key.length !== expected.length) throw new Error('Der Gastgeber-Code ist nicht gültig.');
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= key.charCodeAt(i) ^ expected.charCodeAt(i);
  if (difference) throw new Error('Der Gastgeber-Code ist nicht gültig.');
}
function textInput_(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /^[=+@-]/.test(value.trim()) || /[\r\n\t]/.test(value)) {
    throw new Error('Bitte einen kurzen Namen und eine gültige Einheit eingeben.');
  }
  return value.trim();
}
function doGet() {
  const html = HtmlService.createHtmlOutputFromFile('Index').getContent()
    .replace('<!-- CLIENT -->', HtmlService.createHtmlOutputFromFile('Client').getContent());
  return HtmlService.createHtmlOutput(html).setTitle('Gemeinsam brunchen')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function getMenu(visitorId, hostKey) {
  if (hostKey) requireHost_(hostKey);
  return snapshot_(readState_(), visitorId, Boolean(hostKey));
}
function saveFood(hostKey, input, visitorId) {
  requireHost_(hostKey);
  if (!input || !validId_(input.id, 1) || !['quantity', 'interest'].includes(input.mode) || typeof input.active !== 'boolean') throw new Error('Diese Auswahl ist ungültig.');
  const name = textInput_(input.name, 80);
  const unit = input.mode === 'interest' ? 'Personen' : textInput_(input.unit, 24);
  return withLock_(() => {
    const state = readState_();
    const existing = state.foods.find(food => food.id === input.id);
    if (existing && existing.mode !== input.mode) throw new Error('Die Zählweise bestehender Einträge bleibt erhalten. Bitte einen neuen Eintrag anlegen.');
    const row = existing ? existing.row : state.foodSheet.getLastRow() + 1;
    state.foodSheet.getRange(row, 1, 1, 6).setValues([[input.id, name, unit, '', input.mode, input.active]]);
    setTotalFormula_(state.foodSheet, row);
    SpreadsheetApp.flush();
    return snapshot_(readState_(), visitorId, true);
  });
}
function changeCount(foodId, delta, requestId, visitorId) {
  if (!validId_(foodId, 1) || !validId_(requestId, 16) || (delta !== 1 && delta !== -1)) throw new Error('Diese Änderung ist ungültig.');
  return withLock_(() => {
    const state = readState_();
    const previous = state.changes.find(row => row[0] === requestId);
    if (previous) {
      if (previous[1] !== foodId || previous[4]) throw new Error('Diese Anfrage wurde bereits für eine andere Auswahl verwendet.');
      return snapshot_(state, visitorId);
    }
    const food = state.foods.find(item => item.id === foodId && item.active);
    if (!food) return Object.assign(snapshot_(state, visitorId), {notice:'Dieser Eintrag ist nicht mehr auf der Liste. Deine Änderung wurde nicht übernommen.'});
    if (food.mode !== 'quantity') throw new Error('Bitte für diesen Eintrag die Ja/Nein-Auswahl verwenden.');
    const next = Math.max(0, Math.min(MAX_TOTAL, food.total + delta));
    state.changeSheet.appendRow([requestId, foodId, next - food.total, new Date(), '', '']);
    SpreadsheetApp.flush(); food.total = next;
    return snapshot_(state, visitorId);
  });
}
function setInterest(foodId, selected, visitorId, requestId) {
  if (!validId_(foodId, 1) || !validId_(requestId, 16) || !validId_(visitorId, 16) || typeof selected !== 'boolean') throw new Error('Diese Auswahl ist ungültig.');
  return withLock_(() => {
    const state = readState_();
    const previous = state.changes.find(row => row[0] === requestId);
    if (previous) {
      if (previous[1] !== foodId || previous[4] !== visitorId || previous[5] !== selected) throw new Error('Diese Anfrage wurde bereits für eine andere Auswahl verwendet.');
      return snapshot_(state, visitorId);
    }
    const food = state.foods.find(item => item.id === foodId && item.active);
    if (!food) return Object.assign(snapshot_(state, visitorId), {notice:'Dieser Eintrag ist nicht mehr auf der Liste. Deine Änderung wurde nicht übernommen.'});
    if (food.mode !== 'interest') throw new Error('Bitte für diesen Eintrag die Mengenwahl verwenden.');
    const delta = Number(selected) - Number(ownSelection_(state, foodId, visitorId));
    if (food.total + delta > MAX_TOTAL) throw new Error('Die maximale Anzahl ist erreicht.');
    state.changeSheet.appendRow([requestId, foodId, delta, new Date(), visitorId, selected]);
    SpreadsheetApp.flush();
    return snapshot_(readState_(), visitorId);
  });
}
function ownSelection_(state, foodId, visitorId) { return state.selections.get(foodId + ':' + visitorId) === true; }
function readState_() {
  const id = PropertiesService.getScriptProperties().getProperty('BRUNCH_SHEET_ID');
  if (!id) throw new Error('Der Gastgeber muss den Planer zuerst in Google Sheets vorbereiten.');
  const book = SpreadsheetApp.openById(id);
  const foodSheet = book.getSheetByName('Foods'), changeSheet = book.getSheetByName('Changes');
  assertHeaders_(foodSheet, FOOD_HEADERS); assertHeaders_(changeSheet, CHANGE_HEADERS);
  const changes = dataRows_(changeSheet, 6), totals = new Map(), selections = new Map();
  for (const row of changes) {
    if (!Number.isInteger(row[2]) || Math.abs(row[2]) > 1) throw new Error('Das Änderungsprotokoll enthält einen ungültigen Wert.');
    totals.set(String(row[1]), (totals.get(String(row[1])) || 0) + row[2]);
    if (row[4]) {
      if (typeof row[5] !== 'boolean') throw new Error('Das Änderungsprotokoll enthält eine ungültige Auswahl.');
      selections.set(row[1] + ':' + row[4], row[5]);
    }
  }
  const foods = [], used = new Set();
  dataRows_(foodSheet, 6).forEach((row, i) => {
    const name = String(row[1]).trim(); if (!name) return;
    const id = String(row[0]).trim(), mode = row[4] || 'quantity';
    if (!validId_(id, 1) || used.has(id)) throw new Error('Nach neuen Einträgen muss der Gastgeber „Planer vorbereiten“ ausführen.');
    if (!['quantity', 'interest'].includes(mode)) throw new Error('Die Zählweise ist ungültig.');
    used.add(id);
    const total = totals.get(id) || 0;
    if (total < 0 || total > MAX_TOTAL) throw new Error('Eine Gesamtmenge liegt außerhalb des erlaubten Bereichs.');
    foods.push({id, name, unit:mode === 'interest' ? 'Personen' : (String(row[2]).trim() || 'Stück'), mode, active:row[5] !== false, total, row:i + 2});
  });
  return {foods, changes, selections, foodSheet, changeSheet};
}
function snapshot_(state, visitorId, host) {
  return {foods:state.foods.filter(food => host || food.active).map(food => ({id:food.id, name:food.name, unit:food.unit, mode:food.mode, active:food.active, total:food.total, selected:ownSelection_(state, food.id, visitorId)})), maximum:MAX_TOTAL, updatedAt:new Date().toISOString()};
}
