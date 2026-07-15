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
     POST {action:"check", subject,q,ref,crit,answer} → ИИ-оценка открытого ответа {score,verdict,feedback,missing}
     POST {action:"request", name,unit,subject,cat,catName} → выдать код экзаменатору в Telegram {ok,reqId,delivered}
     POST {action:"verify",  reqId,code}           → сверить код кандидата {ok}
     POST {action:"report",  name,unit,subject,catName,pct,ok,total,pass,switches,sec} → отчёт экзаменатору

   ИИ-ОЦЕНКА И ЭКЗАМЕН (открытые вопросы + аттестация) — свойства скрипта (Project Settings → Свойства скрипта):
     GROQ_API_KEY     — ключ Groq (groq.com, бесплатно; основной провайдер ИИ-оценки)
     GEMINI_KEY       — ключ Gemini (aistudio.google.com/apikey; резерв)
     TELEGRAM_TOKEN   — токен бота (BotFather) — для кодов допуска и отчётов экзаменатору
     TELEGRAM_CHAT_ID — chat_id экзаменатора/канала, куда слать коды и отчёты
   Ключи хранятся ТОЛЬКО на стороне сервера (0 токенов Claude). Без них ИИ-оценка откатывается
   на локальную проверку в приложении, а коды допуска работают в офлайн-резерве.
   =========================================================================== */

/* Ключ AvSec (base64). Подставляется build.mjs. СЕКРЕТ. */
var FULL_KEY = "__FULL_KEY__";
var SHEET_ID = "1sMtuXC-d2bo5aWRd5yQyZopRgT6nLO8FnYJGtbeHrgA";
var SHEET_SCORES = "scores";
var GROQ_MODEL   = "openai/gpt-oss-120b";   // ИИ-оценка: текст (быстро, бесплатно)
var GEMINI_MODEL = "gemini-flash-latest";   // резерв ИИ-оценки

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
  // Открытые вопросы + аттестация (ветвление по action). Иначе — запись в лидерборд.
  if (body.action === "check")   return json_(grade_(body));         // ИИ-оценка открытого ответа
  if (body.action === "request") return json_(examRequest_(body));   // код допуска экзаменатору
  if (body.action === "verify")  return json_(examVerify_(body));    // сверка кода кандидата
  if (body.action === "report")  return json_(examReport_(body));    // отчёт о результате
  var name = String(body.name || "Гость").slice(0, 48);
  var score = Math.max(0, Math.min(1000000, parseInt(body.score, 10) || 0));
  upsertScore_(name, score);
  return json_({ ok: true });
}

/* ===========================================================================
   ОТКРЫТЫЕ ВОПРОСЫ — ИИ-оценка (Groq основной, Gemini резерв). Схема как в СУБП.
   =========================================================================== */
function grade_(b) {
  if (!b.q || !b.answer) return { error: "no question/answer" };
  var crit = (b.crit || []).map(function (c, i) { return (i + 1) + ") " + c; }).join("; ");
  var prompt =
    "Ты — строгий, но справедливый экзаменатор. Предмет: " + (b.subject || "авиация") + ".\n" +
    "Оцени ответ обучаемого, сравнивая его С ЭТАЛОНОМ и КРИТЕРИЯМИ. Оценивай СМЫСЛ, а не дословность. Отвечай по-русски.\n" +
    "Верни СТРОГО JSON без markdown:\n" +
    '{"score": <целое 0-100>, "verdict": "зачтено|частично|незачтено", "feedback": "<1-3 предложения: что верно и чего не хватает>", "missing": ["<кратко пропущенный пункт>"]}\n\n' +
    "Вопрос: " + b.q + "\n" +
    "Эталон: " + (b.ref || "") + "\n" +
    "Критерии: " + (crit || "по смыслу эталона") + "\n" +
    "Ответ обучаемого: " + b.answer + "\n\n" +
    "Зачтено обычно при score >= 60.";
  var props = PropertiesService.getScriptProperties(), errors = [];
  var groqKey = props.getProperty("GROQ_API_KEY");
  if (groqKey) {
    try { var g = normalize_(parseJson_(callGroq_(groqKey, prompt))); if (g) { g.model = GROQ_MODEL; return g; } errors.push("groq parse"); }
    catch (err) { errors.push("groq: " + err); }
  }
  var gemKey = props.getProperty("GEMINI_KEY");
  if (gemKey) {
    try { var m = normalize_(parseJson_(callGemini_(gemKey, prompt))); if (m) { m.model = GEMINI_MODEL; return m; } errors.push("gemini parse"); }
    catch (err) { errors.push("gemini: " + err); }
  }
  if (!groqKey && !gemKey) return { error: "не задан ни GROQ_API_KEY, ни GEMINI_KEY в свойствах скрипта" };
  return { error: "ИИ недоступен: " + errors.join(" | ") };
}
function normalize_(p) {
  if (!p) return null;
  p.score = Math.max(0, Math.min(100, Math.round(Number(p.score) || 0)));
  if (!p.verdict) p.verdict = p.score >= 60 ? "зачтено" : "незачтено";
  if (!Array.isArray(p.missing)) p.missing = [];
  if (typeof p.feedback !== "string") p.feedback = "";
  return p;
}
function callGroq_(key, prompt) {
  var resp = UrlFetchApp.fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + key },
    payload: JSON.stringify({ model: GROQ_MODEL, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
    muteHttpExceptions: true });
  var code = resp.getResponseCode(), text = resp.getContentText();
  if (code >= 300) throw new Error("HTTP " + code + (code === 401 ? " (проверь GROQ_API_KEY)" : "") + ": " + text.slice(0, 120));
  return JSON.parse(text).choices[0].message.content || "";
}
function callGemini_(key, prompt) {
  var resp = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + key, {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
    muteHttpExceptions: true });
  var code = resp.getResponseCode(), text = resp.getContentText();
  if (code >= 300) throw new Error("HTTP " + code + ": " + text.slice(0, 120));
  return (((JSON.parse(text).candidates || [])[0] || {}).content || {}).parts[0].text || "";
}
function parseJson_(s) {
  if (!s) return null;
  var t = String(s).replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(t); } catch (e) {}
  var m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

/* ===========================================================================
   АТТЕСТАЦИЯ — персональное одобрение (код экзаменатору в Telegram) + отчёт.
   =========================================================================== */
function examRequest_(b) {
  var code = "" + Math.floor(1000 + Math.random() * 9000);                    // 4 цифры для диктовки
  var reqId = "R" + Math.floor(100 + Math.random() * 900) + Date.now().toString().slice(-3);
  CacheService.getScriptCache().put("otp_" + reqId, code, 900);               // одноразовый, 15 минут
  var sent = notifyExaminer_(b, code, reqId);
  return { ok: true, reqId: reqId, delivered: sent };
}
function examVerify_(b) {
  var cache = CacheService.getScriptCache();
  var real = cache.get("otp_" + (b.reqId || ""));
  if (real && String(b.code || "") === String(real)) { cache.remove("otp_" + b.reqId); return { ok: true }; }
  return { ok: false };
}
function examReport_(b) {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty("TELEGRAM_TOKEN"), chat = p.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chat) return { ok: false };
  var sec = Number(b.sec) || 0, mm = Math.floor(sec / 60), ss = sec % 60, sw = Number(b.switches) || 0;
  var text = "📋 Результат аттестации" + (b.reqId ? " (№" + b.reqId + ")" : "") + "\n" +
    "ФИО: " + (b.name || "—") + "\n" +
    "Подразделение: " + (b.unit || "—") + "\n" +
    "Предмет: " + (b.subject || "—") + (b.catName ? " · " + b.catName : "") + "\n" +
    "Результат: " + b.pct + "% (" + b.ok + "/" + b.total + ") — " + (b.pass ? "СДАН ✅" : "НЕ СДАН ❌") + "\n" +
    "Время: " + mm + ":" + (ss < 10 ? "0" : "") + ss + "\n" +
    "Выходов из приложения: " + sw + (sw > 0 ? " ⚠️" : "");
  var r = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post", muteHttpExceptions: true, payload: { chat_id: chat, text: text } });
  return { ok: r.getResponseCode() < 300 };
}
function notifyExaminer_(b, code, reqId) {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty("TELEGRAM_TOKEN"), chat = p.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chat) return false;
  var text = "🎓 Запрос на аттестацию (№" + reqId + ")\n" +
    "ФИО: " + (b.name || "—") + "\n" +
    "Подразделение: " + (b.unit || "—") + "\n" +
    "Предмет: " + (b.subject || "—") + (b.catName ? " · " + b.catName : "") + "\n\n" +
    "🔑 Код для кандидата: " + code + "\n" +
    "(действует 15 минут; продиктуйте кандидату)";
  var r = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post", muteHttpExceptions: true, payload: { chat_id: chat, text: text } });
  return r.getResponseCode() < 300;
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
