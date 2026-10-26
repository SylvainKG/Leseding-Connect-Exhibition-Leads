/**
 * Leseding AI Engine — Exhibition Lead Capture (backend)
 * ------------------------------------------------------
 * Data-only API for the GitHub Pages form. Bound to the spreadsheet
 * "Leseding AI Engine — Exhibition Leads & Analytics".
 *
 * Endpoints (one deployed /exec URL):
 *   GET  ?action=visit&member=<id>  -> logs a visit, returns a signed form token
 *   GET  ?action=ping               -> health check
 *   POST {action:"submit", ...}     -> validates + saves a lead (body sent as text/plain JSON)
 *
 * Scopes: spreadsheets.currentonly (this sheet only) + script.container.ui (admin menu).
 * No Gmail / Drive / external-request scopes.
 */

// ===================== SETTINGS =====================

var SHEET = { LEADS: 'Leads', EVENTS: 'Events', TEAM: 'Team', DASH: 'Dashboard' };

var LEAD_HEADERS = [
  'Lead ID', 'Submitted At', 'Source Member ID', 'Source Member Name', 'Full Name',
  'Organisation', 'Email', 'Phone', 'Interest Category', 'Message', 'Contact Consent',
  'Lead Priority', 'Follow-up Status', 'Assigned To', 'Next Action', 'Follow-up Date'
];
var EVENT_HEADERS = [
  'Event ID', 'Timestamp', 'Event Type', 'Source Member', 'Visit ID', 'Client Info', 'Submission ID'
];
var TEAM_HEADERS = ['Member ID', 'Display Name', 'Role', 'Project Name', 'Active'];

var DEFAULT_TEAM = [
  ['sylvain', 'Sylvain Kgosietsile Nalebomo', 'Founder & Project Lead', 'Leseding AI Engine', true],
  ['gorata', 'Gorata Blair Kareng', 'PR & Business Developer', 'Leseding AI Engine', true],
  ['arabang', 'Arabang Benville Mothofela', 'Systems Design', 'Leseding AI Engine', true]
];

// Must match `interests` in docs/config.js exactly.
var INTERESTS = [
  'Investment opportunities',
  'Business partnership',
  'Product demonstration / pilot',
  'Potential customer / organisation',
  'Technology collaboration',
  'General information',
  'Other'
];

var LIMITS = { fullName: 100, organisation: 150, email: 254, phone: 30, message: 1000 };
var TOKEN_TTL_MS = 24 * 60 * 60 * 1000;   // a form token is valid for 24 h
var MAX_SUBMITS_PER_VISIT = 10;           // allows a booth tablet to take several leads
var UNATTRIBUTED = 'unattributed';
var EVENT_VISIT = 'visit';
var EVENT_SUBMIT = 'submit_success';

// ===================== WEB API =====================

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'visit') return json_(handleVisit_(p.member));
    if (p.action === 'ping') return json_({ ok: true });
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server_error' });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'submit') return json_(handleSubmit_(body));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server_error' });
  }
}

function handleVisit_(memberParam) {
  var member = getTeamMember_(memberParam);
  var memberId = member ? member.id : UNATTRIBUTED;
  var visitId = Utilities.getUuid();

  withLock_(function () {
    appendRows_(SHEET.EVENTS, [[newId_('E'), new Date(), EVENT_VISIT, memberId, visitId, '', '']]);
  });

  return {
    ok: true,
    token: makeToken_({ m: memberId, v: visitId, t: Date.now() }),
    attributed: !!member
  };
}

function handleSubmit_(body) {
  // Honeypot: real visitors never see or fill the "website" field.
  if (body.website) return { ok: true, leadId: 'ignored' };

  var tok = readToken_(body.token);
  if (!tok) return { ok: false, error: 'session_expired' };

  var submissionId = String(body.submissionId || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(submissionId)) return { ok: false, error: 'bad_request' };

  var v = validateLead_(body);
  if (!v.ok) return { ok: false, error: 'validation', fields: v.errors };

  // Source member comes from the signed token, never from a form field.
  // Re-check it is still an active member; otherwise store as unattributed.
  var member = tok.m === UNATTRIBUTED ? null : getTeamMember_(tok.m);
  var memberId = member ? member.id : UNATTRIBUTED;
  var memberName = member ? member.name : '';

  var cache = CacheService.getScriptCache();
  var rateKey = 'rate:' + tok.v;
  var count = Number(cache.get(rateKey) || 0);
  if (count >= MAX_SUBMITS_PER_VISIT) return { ok: false, error: 'rate_limited' };

  var result = withLock_(function () {
    // Idempotency: a retry of the same submission returns the original result.
    if (findLeadRow_(submissionId)) return { ok: true, leadId: submissionId, duplicate: true };

    var d = v.data;
    var now = new Date();
    appendRows_(SHEET.LEADS, [[
      submissionId, now, memberId, memberName, safe_(d.fullName), safe_(d.organisation),
      safe_(d.email), d.phone ? "'" + d.phone : '', d.interest, safe_(d.message), 'Yes',
      '', 'New', '', '', ''
    ]]);
    appendRows_(SHEET.EVENTS, [[newId_('E'), now, EVENT_SUBMIT, memberId, tok.v, '', submissionId]]);
    SpreadsheetApp.flush();
    return { ok: true, leadId: submissionId };
  });

  if (result.ok && !result.duplicate) cache.put(rateKey, String(count + 1), 6 * 60 * 60);
  return result;
}

// ===================== VALIDATION =====================

function validateLead_(b) {
  var errors = {};
  var d = {
    fullName: clean_(b.fullName),
    organisation: clean_(b.organisation),
    email: clean_(b.email).toLowerCase(),
    phone: clean_(b.phone),
    interest: clean_(b.interest),
    message: String(b.message == null ? '' : b.message).replace(/\r\n/g, '\n').trim()
  };

  if (!d.fullName) errors.fullName = 'Please enter your full name.';
  if (!d.email) errors.email = 'Please enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.email = 'Please enter a valid email address.';
  if (d.phone && !/^[+()\d\s.-]{5,}$/.test(d.phone)) errors.phone = 'Please enter a valid phone number.';
  if (INTERESTS.indexOf(d.interest) === -1) errors.interest = 'Please choose what you are interested in.';
  if (b.consent !== true) errors.consent = 'Please confirm we may contact you.';

  Object.keys(LIMITS).forEach(function (k) {
    if (d[k] && d[k].length > LIMITS[k]) errors[k] = 'Please keep this under ' + LIMITS[k] + ' characters.';
  });

  return { ok: Object.keys(errors).length === 0, errors: errors, data: d };
}

function clean_(s) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Stops visitor text being interpreted as a spreadsheet formula and keeps "+267…" as text. */
function safe_(s) {
  s = String(s || '');
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

// ===================== TEAM =====================

function getTeamMember_(id) {
  id = String(id || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(id) || id === UNATTRIBUTED) return null;
  var team = getTeam_();
  for (var i = 0; i < team.length; i++) {
    if (team[i].id === id && team[i].active) return team[i];
  }
  return null;
}

function getTeam_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('team');
  if (hit) return JSON.parse(hit);

  var sh = ss_().getSheetByName(SHEET.TEAM);
  var team = [];
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, TEAM_HEADERS.length).getValues().forEach(function (r) {
      var id = String(r[0] || '').trim().toLowerCase();
      if (!id) return; // skip blank / malformed rows
      var active = r[4] === true || String(r[4]).trim().toUpperCase() === 'TRUE' || String(r[4]).trim().toLowerCase() === 'yes';
      team.push({ id: id, name: String(r[1] || id).trim(), active: active });
    });
  }
  cache.put('team', JSON.stringify(team), 300);
  return team;
}

/** Simple trigger: edits on the Team tab take effect immediately. */
function onEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === SHEET.TEAM) {
    CacheService.getScriptCache().remove('team');
  }
}

// ===================== TOKENS =====================

function makeToken_(obj) {
  var data = Utilities.base64EncodeWebSafe(JSON.stringify(obj));
  return data + '.' + sign_(data);
}

function readToken_(token) {
  if (typeof token !== 'string' || token.length > 600) return null;
  var parts = token.split('.');
  if (parts.length !== 2 || !timingSafeEqual_(sign_(parts[0]), parts[1])) return null;
  try {
    var obj = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (!obj || typeof obj.m !== 'string' || typeof obj.v !== 'string' || typeof obj.t !== 'number') return null;
    if (Date.now() - obj.t > TOKEN_TTL_MS || obj.t > Date.now() + 60000) return null;
    return obj;
  } catch (err) {
    return null;
  }
}

function sign_(data) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(data, getSecret_()));
}

function timingSafeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getSecret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('TOKEN_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('TOKEN_SECRET', s);
  }
  return s;
}

// ===================== SHEET HELPERS =====================

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // throws if the sheet is busy for >20 s -> client shows retry message
  try { return fn(); } finally { lock.releaseLock(); }
}

function appendRows_(name, rows) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name + ' — run Leseding Admin → Set up / repair sheets');
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

function findLeadRow_(leadId) {
  var sh = ss_().getSheetByName(SHEET.LEADS);
  if (!sh || sh.getLastRow() < 2) return null;
  var hit = sh.getRange(2, 1, sh.getLastRow() - 1, 1)
    .createTextFinder(leadId).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : null;
}

function newId_(prefix) {
  return prefix + '-' + Utilities.getUuid().split('-')[0].toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ===================== ADMIN MENU =====================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Leseding Admin')
    .addItem('Set up / repair sheets', 'setup')
    .addItem('Rebuild dashboard', 'buildDashboard')
    .addSeparator()
    .addItem('Reset: clear visits only (link previews / tests)', 'resetVisitsOnly')
    .addItem('Reset: clear ALL leads & events (fresh start)', 'resetAllData')
    .addToUi();
}

/** Creates any missing tabs, headers, team rows, dropdowns and the dashboard. Safe to re-run; never deletes data. */
function setup() {
  var ss = ss_();
  ss.setSpreadsheetTimeZone('Africa/Gaborone');

  var leads = ensureSheet_(SHEET.LEADS, LEAD_HEADERS);
  var events = ensureSheet_(SHEET.EVENTS, EVENT_HEADERS);
  var team = ensureSheet_(SHEET.TEAM, TEAM_HEADERS);

  if (team.getLastRow() < 2) {
    team.getRange(2, 1, DEFAULT_TEAM.length, TEAM_HEADERS.length).setValues(DEFAULT_TEAM);
  }
  team.getRange('E2:E').setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());

  leads.getRange('B2:B').setNumberFormat('yyyy-mm-dd hh:mm');
  leads.getRange('P2:P').setNumberFormat('yyyy-mm-dd');
  leads.getRange('L2:L').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['High', 'Medium', 'Low'], true).setAllowInvalid(true).build());
  leads.getRange('M2:M').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['New', 'Contacted', 'Meeting booked', 'Proposal sent', 'Won', 'Not a fit'], true).setAllowInvalid(true).build());
  events.getRange('B2:B').setNumberFormat('yyyy-mm-dd hh:mm:ss');

  getSecret_();
  CacheService.getScriptCache().remove('team');
  buildDashboard();

  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);

  toast_('Setup complete.');
}

function ensureSheet_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#101C2C').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  return sh;
}

/** Rebuilds the Dashboard tab from the Team tab. All numbers are live formulas over Events. */
function buildDashboard() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET.DASH) || ss.insertSheet(SHEET.DASH, 0);
  sh.clear();

  CacheService.getScriptCache().remove('team');
  var members = getTeam_().filter(function (m) { return m.active; });
  var cols = [{ label: 'All team', id: '*' }]
    .concat(members.map(function (m) { return { label: m.name.split(' ')[0], id: m.id }; }))
    .concat([{ label: 'Unattributed', id: UNATTRIBUTED }]);
  var n = cols.length;

  sh.getRange('A1').setValue('Leseding AI Engine — Exhibition Dashboard').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setValue('Recorded visits = form page loads from a QR link (not unique people or guaranteed physical scans). Conversion = submissions ÷ visits.')
    .setFontColor('#667085').setFontStyle('italic');

  var header = [['Metric'].concat(cols.map(function (c) { return c.label; }))];
  var ids = [['Member ID'].concat(cols.map(function (c) { return c.id; }))];
  sh.getRange(4, 1, 1, n + 1).setValues(header).setFontWeight('bold').setBackground('#101C2C').setFontColor('#FFFFFF');
  sh.getRange(5, 1, 1, n + 1).setValues(ids).setFontColor('#98A2B3').setFontSize(8);

  var rows = [['Recorded visits'], ['Successful submissions'], ['Conversion rate']];
  for (var i = 0; i < n; i++) {
    var colLetter = columnLetter_(i + 2);
    var idRef = colLetter + '$5';
    if (cols[i].id === '*') {
      rows[0].push('=COUNTIF(Events!C2:C,"' + EVENT_VISIT + '")');
      rows[1].push('=COUNTIF(Events!C2:C,"' + EVENT_SUBMIT + '")');
    } else {
      rows[0].push('=COUNTIFS(Events!C2:C,"' + EVENT_VISIT + '",Events!D2:D,' + idRef + ')');
      rows[1].push('=COUNTIFS(Events!C2:C,"' + EVENT_SUBMIT + '",Events!D2:D,' + idRef + ')');
    }
    rows[2].push('=IF(' + colLetter + '6=0,"—",' + colLetter + '7/' + colLetter + '6)');
  }
  sh.getRange(6, 1, 3, n + 1).setValues(rows);
  sh.getRange(8, 2, 1, n).setNumberFormat('0.0%');
  sh.getRange(6, 1, 3, 1).setFontWeight('bold');
  sh.getRange(4, 1, 5, n + 1).setBorder(true, true, true, true, true, true, '#D9E0E8', SpreadsheetApp.BorderStyle.SOLID);

  // Trend tables (QUERY results expand automatically as events arrive)
  sh.getRange('A11').setValue('By day — all events').setFontWeight('bold');
  sh.getRange('A12').setFormula('=IFERROR(QUERY(Events!B2:C,"select toDate(B), count(C) where C is not null group by toDate(B) pivot C label toDate(B) \'Date\'",0),"No events yet")');

  sh.getRange('F11').setValue('By day — visits per member').setFontWeight('bold');
  sh.getRange('F12').setFormula('=IFERROR(QUERY(Events!B2:D,"select toDate(B), count(C) where C = \'' + EVENT_VISIT + '\' group by toDate(B) pivot D label toDate(B) \'Date\'",0),"No visits yet")');

  var hourCol = columnLetter_(Math.max(12, 7 + n + 1));
  sh.getRange(hourCol + '11').setValue('By hour of day — all events').setFontWeight('bold');
  sh.getRange(hourCol + '12').setFormula('=IFERROR(QUERY(Events!B2:C,"select hour(B), count(C) where C is not null group by hour(B) pivot C label hour(B) \'Hour\'",0),"No events yet")');

  sh.setColumnWidth(1, 190);
  sh.setFrozenRows(0);
  toast_('Dashboard rebuilt.');
}

function columnLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// ===================== RESET =====================

/** Clears visit events only. Leads and their submit_success events are kept. */
function resetVisitsOnly() {
  if (!confirmReset_('This deletes every VISIT event (link previews, test scans).\nLeads and submission events are kept.')) return;
  var removed = withLock_(function () {
    var sh = ss_().getSheetByName(SHEET.EVENTS);
    if (!sh || sh.getLastRow() < 2) return 0;
    var range = sh.getRange(2, 1, sh.getLastRow() - 1, EVENT_HEADERS.length);
    var all = range.getValues();
    var keep = all.filter(function (r) { return r[2] !== EVENT_VISIT; });
    range.clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, EVENT_HEADERS.length).setValues(keep);
    return all.length - keep.length;
  });
  toast_('Removed ' + removed + ' visit event(s).');
}

/** Clears ALL leads and events. Use once, right before the exhibition opens. */
function resetAllData() {
  if (!confirmReset_('This deletes ALL leads and ALL events (visits + submissions).\nUse this right before the exhibition opens.')) return;
  var counts = withLock_(function () {
    return [SHEET.LEADS, SHEET.EVENTS].map(function (name) {
      var sh = ss_().getSheetByName(name);
      if (!sh || sh.getLastRow() < 2) return 0;
      var rows = sh.getLastRow() - 1;
      sh.getRange(2, 1, rows, sh.getLastColumn()).clearContent();
      return rows;
    });
  });
  toast_('Cleared ' + counts[0] + ' lead(s) and ' + counts[1] + ' event(s). Ready for the exhibition.');
}

function confirmReset_(message) {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Confirm reset',
    message + '\n\nRecovery is only possible via File → Version history.\nType RESET to continue:',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK || res.getResponseText().trim() !== 'RESET') {
    ui.alert('Reset cancelled — nothing was deleted.');
    return false;
  }
  return true;
}

function toast_(msg) {
  try { ss_().toast(msg, 'Leseding Admin', 5); } catch (e) { console.log(msg); }
}
