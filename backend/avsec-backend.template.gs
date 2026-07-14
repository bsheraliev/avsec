/* ===========================================================================
   AvSec + AvEng — единый бэкенд Apps Script: лидерборд + лицензии (МУЛЬТИАПП).
   Это ШАБЛОН. Рабочий файл с ключом AvSec генерирует build.mjs в
   backend/_generated/avsec-backend.gs (он в .gitignore — НЕ публикуется).

   Ключи:
     • AvSec — константа FULL_KEY (публичный шифр data.full.enc бесполезен без неё).
     • AvEng — Script Property AVENG_KEY (владелец задаёт в Project Settings →
       Свойства скрипта; редеплой не нужен, читается на лету). Отдельный ключ, чтобы
       лицензиат одного продукта не мог расшифровать базу другого.

   Листы лицензий (в таблице SHEET_ID): avsec → "licenses", aveng → "licenses_aveng".
   Колонки (строка 1 — заголовки): A:code  B:org  C:expires(ГГГГ-ММ-ДД, пусто=бессрочно)  D:active(TRUE/FALSE)

   УСТАНОВКА:
   1) Откройте Google Таблицу лидерборда → Extensions → Apps Script.
   2) Вставьте содержимое backend/_generated/avsec-backend.gs (не этот шаблон!).
   3) Разово: GET <exec>?action=setup&app=avsec  и  ?action=setup&app=aveng
      — создадут листы лицензий с заголовками (+тестовый код). Одобрите доступ.
   4) Для AvEng: Project Settings → Свойства скрипта → добавьте AVENG_KEY = ключ из .aveng-fullkey.
   5) Deploy → Manage deployments → New version → Deploy. URL (…/exec) остаётся прежним.

   ПРОТОКОЛ:
     GET  ?action=top                              → JSON топ-30 (лидерборд)
     GET  ?action=unlock&app=avsec|aveng&code=XXX  → {ok,org,expires,key} | {ok:false,error}
     GET  ?action=setup&app=avsec|aveng            → создать лист лицензий (+тестовый код)
     POST {name, score}                            → запись результата в лидерборд
   =========================================================================== */

/* Ключ AvSec (base64). Подставляется build.mjs. СЕКРЕТ. */
var FULL_KEY = "__FULL_KEY__";
var SHEET_ID = "1sMtuXC-d2bo5aWRd5yQyZopRgT6nLO8FnYJGtbeHrgA";
var SHEET_SCORES = "scores";

function keyFor_(app) {
  return app === "aveng" ? PropertiesService.getScriptProperties().getProperty("AVENG_KEY") : FULL_KEY;
}
function licSheetName_(app) { return app === "aveng" ? "licenses_aveng" : "licenses"; }

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || "top";
  var app = p.app || "avsec";
  if (action === "unlock") return json_(unlock_(p.code || "", app));
  if (action === "setup") return json_(setup_(app));
  return json_(readTop_(30));
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  var name = String(body.name || "Гость").slice(0, 48);
  var score = Math.max(0, Math.min(1000000, parseInt(body.score, 10) || 0));
  upsertScore_(name, score);
  return json_({ ok: true });
}

/* --- Разовая настройка листа лицензий (+ тестовый код). GET ?action=setup&app=… --- */
function setup_(app) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var name = licSheetName_(app);
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) { sh.appendRow(["code", "org", "expires", "active"]); sh.setFrozenRows(1); }
  if (sh.getLastRow() < 2) sh.appendRow([app === "aveng" ? "TEST-AVENG-2026" : "TEST-2026", "Тест (можно удалить)", "", true]);
  return { ok: true, sheet: name, rows: sh.getLastRow() };
}

/* --- Лицензии (мультиапп) --- */
function unlock_(codeRaw, app) {
  var code = String(codeRaw || "").trim();
  if (!code) return { ok: false, error: "empty" };
  var key = keyFor_(app);
  if (!key) return { ok: false, error: "no_key" };   // для aveng: не задан Script Property AVENG_KEY
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(licSheetName_(app));
  if (!sh) return { ok: false, error: "no_licenses_sheet" };
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {           // i=1 — пропускаем заголовок
    var rCode = String(rows[i][0] || "").trim();
    if (!rCode || rCode.toLowerCase() !== code.toLowerCase()) continue;
    var org = String(rows[i][1] || "");
    var expires = rows[i][2] ? fmtDate_(rows[i][2]) : "";
    var active = String(rows[i][3]).toUpperCase() !== "FALSE";
    if (!active) return { ok: false, error: "revoked" };
    if (expires && todayStr_() > expires) return { ok: false, error: "expired", expires: expires, org: org };
    return { ok: true, org: org, expires: expires, key: key };
  }
  return { ok: false, error: "invalid" };
}

/* --- Лидерборд --- */
function readTop_(n) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_SCORES) || ss.insertSheet(SHEET_SCORES);
  var rows = sh.getDataRange().getValues();
  var data = rows.filter(function (r) { return r[0]; })
    .map(function (r) { return { username: String(r[0]), score: Number(r[1]) || 0 }; });
  data.sort(function (a, b) { return b.score - a.score; });
  return data.slice(0, n);
}
function upsertScore_(name, score) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_SCORES) || ss.insertSheet(SHEET_SCORES);
  var rows = sh.getDataRange().getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === name) {
      if (score > (Number(rows[i][1]) || 0)) { sh.getRange(i + 1, 2).setValue(score); sh.getRange(i + 1, 3).setValue(new Date()); }
      return;
    }
  }
  sh.appendRow([name, score, new Date()]);
}

/* --- Утилиты --- */
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function todayStr_() { return fmtDate_(new Date()); }
function fmtDate_(d) {
  var tz = Session.getScriptTimeZone() || "Asia/Dushanbe";
  return Utilities.formatDate(new Date(d), tz, "yyyy-MM-dd");
}
