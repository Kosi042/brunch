import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const code = await readFile(new URL('../Code.gs', import.meta.url), 'utf8');

function fixture(options = {}) {
  let locked = false;
  let failFlush = false;
  const props = new Map(options.unconfigured ? [] : [['BRUNCH_SHEET_ID', 'test-book'], ['BRUNCH_HOST_KEY', 'test-only-host-code-not-a-real-secret']]);
  class Sheet {
    constructor(name, rows = []) { this.name = name; this.rows = rows; }
    getLastRow() { return this.rows.length; }
    appendRow(row) { assert.equal(locked, true, 'Every write must hold the script lock'); this.rows.push([...row]); return this; }
    getRange(row, col, height = 1, width = 1) {
      const sheet = this;
      return {
        getValues() { return Array.from({length:height}, (_, i) => Array.from({length:width}, (_, j) => sheet.rows[row + i - 1]?.[col + j - 1] ?? '')); },
        setValues(values) { assert.equal(locked, true); values.forEach((valuesRow, i) => valuesRow.forEach((value, j) => { sheet.rows[row + i - 1] ??= []; sheet.rows[row + i - 1][col + j - 1] = value; })); return this; },
        setFormulas(values) { return this.setValues(values); },
        setBackground() { return this; }, setFontColor() { return this; }, setFontWeight() { return this; }, setNumberFormat() { return this; }
      };
    }
    setFrozenRows() {} setColumnWidth() {}
  }
  const foods = new Sheet('Foods', [['ID','Speise / Getränk','Einheit','Gesamt','Zählweise','Aktiv'], ['bread','Bread rolls','pieces','','quantity',true], ['coffee','Coffee','mugs','','quantity',true]]);
  const changes = new Sheet('Changes', [['Anfrage-ID','Auswahl-ID','Änderung','Zeitpunkt','Browser-ID','Ausgewählt']]);
  const sheets = options.empty ? new Map() : new Map([['Foods',foods], ['Changes',changes]]);
  const book = {getId: () => 'test-book', getSheetByName: name => sheets.get(name), insertSheet(name) { const sheet = new Sheet(name); sheets.set(name, sheet); return sheet; }};
  const context = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book,
      openById(id) { assert.equal(id, 'test-book'); return book; },
      flush() { if (failFlush) { failFlush = false; throw new Error('Simulated lost acknowledgement after append'); } }
    },
    PropertiesService: {getScriptProperties: () => ({getProperty: key => props.get(key), setProperty: (key, value) => props.set(key, value)})},
    LockService: {getScriptLock: () => ({waitLock() { assert.equal(locked, false); locked = true; }, releaseLock() { assert.equal(locked, true); locked = false; }})},
    Utilities: {getUuid: () => 'generated-' + Math.random().toString(16).slice(2)}
  });
  vm.runInContext(code, context);
  return { api: context, foods, changes, sheets, props, locked: () => locked, loseAcknowledgement: () => { failFlush = true; } };
}
const request = n => 'request-00000000-' + n;
const hostKey = 'test-only-host-code-not-a-real-secret';
const visitorA = 'anonymous-visitor-000001';
const visitorB = 'anonymous-visitor-000002';
const tea = {id:'tea',name:'Tee',unit:'',mode:'interest',active:true};

test('two guests with stale totals both add to the current shared count', () => {
  const { api, changes } = fixture();
  assert.equal(api.getMenu().foods[0].total, 0);
  assert.equal(api.getMenu().foods[0].total, 0);
  assert.equal(api.changeCount('bread', 1, request(1)).foods[0].total, 1);
  assert.equal(api.changeCount('bread', 1, request(2)).foods[0].total, 2);
  assert.equal(changes.rows.length, 3);
});
test('retry after an acknowledgement is lost never counts twice', () => {
  const f = fixture(); f.loseAcknowledgement();
  assert.throws(() => f.api.changeCount('bread', 1, request(1)), /lost acknowledgement/);
  assert.equal(f.locked(), false);
  assert.equal(f.api.changeCount('bread', 1, request(1)).foods[0].total, 1);
  assert.equal(f.changes.rows.length, 2);
});
test('a minus at zero stays zero and remains a no-op when retried later', () => {
  const { api } = fixture();
  assert.equal(api.changeCount('bread', -1, request(1)).foods[0].total, 0);
  api.changeCount('bread', 1, request(2));
  assert.equal(api.changeCount('bread', -1, request(1)).foods[0].total, 1);
  assert.equal(api.changeCount('bread', -1, request(3)).foods[0].total, 0);
});
test('renaming and sorting foods preserve totals and custom units', () => {
  const { api, foods } = fixture();
  api.changeCount('coffee', 1, request(1));
  foods.rows[2][1] = 'Decaf coffee'; foods.rows[2][2] = 'cups';
  [foods.rows[1], foods.rows[2]] = [foods.rows[2], foods.rows[1]];
  const food = api.getMenu().foods[0];
  assert.equal(food.name, 'Decaf coffee'); assert.equal(food.unit, 'cups'); assert.equal(food.total, 1);
});
test('removed food returns a recoverable notice with no write', () => {
  const { api, foods, changes } = fixture(); foods.rows.splice(1, 1);
  const result = api.changeCount('bread', 1, request(1));
  assert.match(result.notice, /nicht übernommen/); assert.equal(result.foods.length, 1); assert.equal(changes.rows.length, 1);
});
test('invalid mutations and reuse for another food are rejected', () => {
  const f = fixture();
  for (const args of [['bread',2,request(1)],['bread','1',request(1)],['=formula',1,request(1)],['bread',1,'short']]) {
    assert.throws(() => f.api.changeCount(...args), /ungültig/);
  }
  f.api.changeCount('bread',1,request(1));
  assert.throws(() => f.api.changeCount('coffee',1,request(1)), /andere Auswahl/);
  assert.equal(f.locked(), false); assert.equal(f.changes.rows.length, 2);
});
test('maximum count prevents an extra increment but allows decrementing', () => {
  const { api, changes } = fixture();
  for (let i=0;i<10000;i++) changes.rows.push([request(i), 'bread', 1, new Date()]);
  assert.equal(api.changeCount('bread',1,request(10001)).foods[0].total,10000);
  assert.equal(api.changeCount('bread',-1,request(10002)).foods[0].total,9999);
});
test('setup creates empty sheets, assigns IDs and formulas, and preserves existing entries', () => {
  const f = fixture({empty:true,unconfigured:true});
  f.api.setupBrunch_();
  assert.equal(f.props.get('BRUNCH_SHEET_ID'),'test-book');
  const foods = f.sheets.get('Foods'); assert.equal(foods.rows.length,1);
  foods.rows.push(['','Tea','cups','']);
  f.api.setupBrunch_();
  const id = foods.rows[1][0]; assert.match(id,/^generated-/);
  assert.match(foods.rows[1][3],/SUMIF/);
  f.api.changeCount(id,1,request(1));
  f.api.setupBrunch_();
  assert.equal(foods.rows[1][0],id); assert.equal(f.api.getMenu().foods[0].total,1);
});
test('missing setup, duplicate IDs, and damaged logs produce actionable errors', () => {
  assert.throws(() => fixture({unconfigured:true}).api.getMenu(), /Planer zuerst/);
  const f = fixture(); f.foods.rows[2][0] = 'bread';
  assert.throws(() => f.api.getMenu(), /Planer vorbereiten/);
  f.foods.rows[2][0] = 'coffee'; f.changes.rows.push([request(1),'bread',-1,new Date()]);
  assert.throws(() => f.api.getMenu(), /außerhalb/);
});

test('food administration is protected on the server, including hidden-item reads', () => {
  const f=fixture();
  for(const key of ['',undefined,'wrong',hostKey.replace('test','fake')]) {
    assert.throws(()=>f.api.saveFood(key,tea,visitorA),/Gastgeber-Code/);
  }
  assert.throws(()=>f.api.getMenu(visitorA,'wrong'),/Gastgeber-Code/);
  assert.equal(f.foods.rows.length,3);
  f.api.saveFood(hostKey,tea,visitorA);
  assert.equal(f.api.getMenu(visitorA).foods.find(food=>food.id==='tea').unit,'Personen');
});

test('adding with the same food ID is retry-safe and hiding preserves totals', () => {
  const f=fixture();
  f.api.saveFood(hostKey,tea,visitorA); f.api.saveFood(hostKey,tea,visitorA);
  assert.equal(f.foods.rows.filter(row=>row[0]==='tea').length,1);
  f.api.setInterest('tea',true,visitorA,request(1));
  f.api.saveFood(hostKey,{...tea,name:'Grüner Tee',active:false},visitorA);
  assert.equal(f.api.getMenu(visitorA).foods.some(food=>food.id==='tea'),false);
  const hidden=f.api.getMenu(visitorA,hostKey).foods.find(food=>food.id==='tea');
  assert.equal(hidden.total,1); assert.equal(hidden.selected,true);
  f.api.saveFood(hostKey,{...tea,name:'Grüner Tee'},visitorA);
  assert.equal(f.api.getMenu(visitorA).foods.find(food=>food.id==='tea').total,1);
});

test('interest counts people once, supports reversal, and isolates each visitor', () => {
  const {api}=fixture(); api.saveFood(hostKey,tea,visitorA);
  api.setInterest('tea',true,visitorA,request(1));
  api.setInterest('tea',true,visitorA,request(2));
  assert.equal(api.getMenu(visitorA).foods.find(food=>food.id==='tea').total,1);
  assert.equal(api.getMenu(visitorB).foods.find(food=>food.id==='tea').selected,false);
  api.setInterest('tea',false,visitorB,request(3));
  assert.equal(api.getMenu(visitorA).foods.find(food=>food.id==='tea').total,1);
  api.setInterest('tea',true,visitorB,request(4));
  assert.equal(api.getMenu(visitorA).foods.find(food=>food.id==='tea').total,2);
  api.setInterest('tea',false,visitorA,request(5));
  api.setInterest('tea',true,visitorA,request(1)); // old request retry must not restore an undone selection
  const result=api.getMenu(visitorA).foods.find(food=>food.id==='tea');
  assert.equal(result.total,1);assert.equal(result.selected,false);
  assert.equal(JSON.stringify(api.getMenu(visitorA)).includes(visitorB),false);
});

test('interest retry after lost acknowledgement counts only once', () => {
  const f=fixture();f.api.saveFood(hostKey,tea,visitorA);f.loseAcknowledgement();
  assert.throws(()=>f.api.setInterest('tea',true,visitorA,request(1)),/lost acknowledgement/);
  assert.equal(f.locked(),false);
  const result=f.api.setInterest('tea',true,visitorA,request(1)).foods.find(food=>food.id==='tea');
  assert.equal(result.total,1);assert.equal(result.selected,true);assert.equal(f.changes.rows.length,2);
});

test('quantity endpoints cannot manipulate interest totals or change an existing mode', () => {
  const {api}=fixture();api.saveFood(hostKey,tea,visitorA);
  assert.throws(()=>api.changeCount('tea',1,request(1),visitorA),/Ja\/Nein/);
  assert.throws(()=>api.setInterest('bread',true,visitorA,request(2)),/Mengenwahl/);
  assert.throws(()=>api.setInterest('tea',true,'',request(3)),/ungültig/);
  assert.throws(()=>api.saveFood(hostKey,{...tea,mode:'quantity',unit:'Tassen'},visitorA),/Zählweise/);
  assert.throws(()=>api.saveFood(hostKey,{...tea,name:'=IMPORTXML("x")'},visitorA),/gültige Einheit/);
});

test('setup upgrades the original four-column sheets without losing counts', () => {
  const f=fixture();f.foods.rows=f.foods.rows.map(row=>row.slice(0,4));f.changes.rows=f.changes.rows.map(row=>row.slice(0,4));
  f.changes.rows.push([request(1),'bread',1,new Date()]);f.api.setupBrunch_();
  assert.equal(f.api.getMenu(visitorA).foods[0].total,1);
  assert.equal(f.api.getMenu(visitorA).foods[0].mode,'quantity');
  assert.equal(f.props.get('BRUNCH_HOST_KEY'),hostKey);
});
