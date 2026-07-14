/* ===========================================================================
   AvSec — единый бэкенд на Google Apps Script (бесплатно): лидерборд + лицензии.
   Это ШАБЛОН. Реальный файл с базой и ключом генерирует build.mjs в
   backend/_generated/avsec-backend.gs (он в .gitignore — НЕ публикуется).

   УСТАНОВКА:
   1) Откройте вашу Google Таблицу лидерборда → Extensions → Apps Script.
   2) Вставьте содержимое backend/_generated/avsec-backend.gs (не этот шаблон!).
   3) На листе создайте вкладку "licenses" с колонками (строка 1 — заголовки):
        A: code   B: org   C: expires(ГГГГ-ММ-ДД, пусто = бессрочно)   D: active(TRUE/FALSE)
      Каждая строка ниже — лицензия одной организации. Пример:
        DUSHANBE-2026 | Аэропорт Душанбе | 2027-01-01 | TRUE
   4) Deploy → Manage deployments → редактировать текущий → New version → Deploy.
      URL (…/exec) остаётся прежним — тот, что уже в app.js.

   ПРОТОКОЛ:
     GET  ?action=top                 → JSON топ-30 (лидерборд)
     GET  ?action=unlock&code=XXX     → {ok, org, expires, key} либо {ok:false, error}
                                         (key — ключ AES; сам шифр базы клиент берёт из data.full.enc)
     POST {name, score}               → запись результата в лидерборд
   =========================================================================== */

/* Ключ AES полной базы (base64). Подставляется build.mjs. СЕКРЕТ.
   Сам шифр базы — публичный файл data.full.enc; без этого ключа он бесполезен. */
var FULL_KEY = "__FULL_KEY__";

/* ID Google-таблицы (лидерборд + лицензии). openById надёжен в контексте веб-приложения,
   в отличие от getActiveSpreadsheet() (в doGet он часто null). */
var SHEET_ID       = "1sMtuXC-d2bo5aWRd5yQyZopRgT6nLO8FnYJGtbeHrgA";
var SHEET_SCORES   = "scores";
var SHEET_LICENSES = "licenses";

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "top";
  if (action === "unlock") return json_(unlock_((e.parameter.code || "")));
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

/* --- Разовая настройка: создать лист "licenses" с заголовками (+ тестовый код).
   Запустить ОДИН раз из редактора Apps Script (Run → setupLicenses), одобрить доступ. --- */
function setupLicenses() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_LICENSES) || ss.insertSheet(SHEET_LICENSES);
  if (sh.getLastRow() === 0) { sh.appendRow(["code", "org", "expires", "active"]); sh.setFrozenRows(1); }
  if (sh.getLastRow() < 2) sh.appendRow(["TEST-2026", "Тест (можно удалить)", "", true]);
  return "licenses ready: " + sh.getLastRow() + " rows";
}

/* --- Лицензии --- */
function unlock_(codeRaw) {
  var code = String(codeRaw || "").trim();
  if (!code) return { ok: false, error: "empty" };
  var sh = sheetByName_(SHEET_LICENSES);
  if (!sh) return { ok: false, error: "no_licenses_sheet" };
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {           // i=1 — пропускаем заголовок
    var rCode = String(rows[i][0] || "").trim();
    if (!rCode || rCode.toLowerCase() !== code.toLowerCase()) continue;
    var org     = String(rows[i][1] || "");
    var expires = rows[i][2] ? fmtDate_(rows[i][2]) : "";
    var active  = String(rows[i][3]).toUpperCase() !== "FALSE";
    if (!active) return { ok: false, error: "revoked" };
    if (expires && todayStr_() > expires) return { ok: false, error: "expired", expires: expires, org: org };
    return { ok: true, org: org, expires: expires, key: FULL_KEY };
  }
  return { ok: false, error: "invalid" };
}

/* --- Лидерборд --- */
function readTop_(n) {
  var sh = sheetByName_(SHEET_SCORES) || insertSheet_(SHEET_SCORES);
  var rows = sh.getDataRange().getValues();
  var data = rows.filter(function (r) { return r[0]; })
    .map(function (r) { return { username: String(r[0]), score: Number(r[1]) || 0 }; });
  data.sort(function (a, b) { return b.score - a.score; });
  return data.slice(0, n);
}
function upsertScore_(name, score) {
  var sh = sheetByName_(SHEET_SCORES) || insertSheet_(SHEET_SCORES);
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
function sheetByName_(n) { return SpreadsheetApp.openById(SHEET_ID).getSheetByName(n); }
function insertSheet_(n) { return SpreadsheetApp.openById(SHEET_ID).insertSheet(n); }
function todayStr_() { return fmtDate_(new Date()); }
function fmtDate_(d) {
  var tz = Session.getScriptTimeZone() || "Asia/Dushanbe";
  return Utilities.formatDate(new Date(d), tz, "yyyy-MM-dd");
}
