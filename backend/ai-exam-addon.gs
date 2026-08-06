/* ===========================================================================
   AI-EXAM ADD-ON — открытые вопросы (ИИ-оценка) + аттестация (коды допуска).
   Ставится РЯДОМ с основным бэкендом «Product copy protection» (Код.gs) как
   ОТДЕЛЬНЫЙ файл — Apps Script объединяет все .gs в одну область видимости.
   НИЧЕГО из лицензий/ключей/админки/rate-limit не трогает: свои функции +
   свои Script Properties. Обслуживает и AvSec, и AvEng (subject приходит из клиента).

   УСТАНОВКА (2 шага):
   1) Apps Script → «＋» рядом с «Файлы» → Script → назвать «AI» → вставить ВЕСЬ этот файл.
   2) В основном doPost(e), СРАЗУ после разбора тела запроса (var b/body = JSON.parse(...)),
      добавить 4 строки маршрутизации новых действий (json_ — ваша существующая обёртка):

        if (body.action === "check")   return json_(grade_(body));
        if (body.action === "request") return json_(examRequest_(body));
        if (body.action === "verify")  return json_(examVerify_(body));
        if (body.action === "report")  return json_(examReport_(body));

      (leaderboard-ветка {name, score} остаётся ниже без изменений.)

   Script Properties (Project Settings → Свойства скрипта):
     GROQ_API_KEY     — ключ Groq (тот же, что в edo-classifier) — основной ИИ-оценщик
     GEMINI_KEY       — ключ Gemini — резерв
     TELEGRAM_TOKEN   — токен бота-экзаменатора (BotFather) — коды допуска и отчёты
     TELEGRAM_CHAT_ID — chat_id экзаменатора/канала
   Без GROQ/GEMINI ИИ-оценка вернёт error → клиент откатится на локальную проверку.
   Без TELEGRAM_* коды допуска не рассылаются (клиент покажет «Telegram не настроен»).
   0 токенов Claude. Ключи живут только на сервере.

   ПРОТОКОЛ (POST, тело JSON):
     {action:"check",   subject,q,ref,crit,answer}                 → {score,verdict,feedback,missing}
     {action:"request", name,unit,subject,catName}                 → {ok,reqId,delivered}
     {action:"verify",  reqId,code}                                → {ok}
     {action:"report",  name,unit,subject,catName,pct,ok,total,pass,switches,sec} → {ok,logged,sent}
   Каждый report пишется строкой в общую Google-таблицу «Тренажёры — результаты аттестаций»
   (auto-создание, ID в свойстве RESULTS_SHEET_ID) И (если задан TELEGRAM_*) шлётся экзаменатору.
   ПОСЛЕ установки запустите в редакторе функцию showResultsSheet ОДИН раз — она создаст таблицу,
   запросит доступ к Google Таблицам и выведет её ссылку в «Журнал выполнения». Затем — New version.
   =========================================================================== */

var GROQ_MODEL   = "openai/gpt-oss-120b";   // ИИ-оценка: текст (быстро, бесплатно)
var GEMINI_MODEL = "gemini-flash-latest";   // резерв ИИ-оценки

/* ---------- Открытые вопросы: ИИ-оценка (Groq основной, Gemini резерв) ---------- */
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

/* ---------- Аттестация: код допуска экзаменатору в Telegram + отчёт ---------- */
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
  var logged = logResult_(b);                       // единая Google-таблица результатов
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty("TELEGRAM_TOKEN"), chat = p.getProperty("TELEGRAM_CHAT_ID");
  var sent = false;
  if (token && chat) {
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
    sent = r.getResponseCode() < 300;
  }
  return { ok: true, logged: logged, sent: sent };
}

/* ---------- Единая Google-таблица результатов (AvEng + AvSec; subject различает) ----------
   Создаётся автоматически при первом результате; ID в свойстве RESULTS_SHEET_ID.
   Функцию showResultsSheet запустить ОДИН раз в редакторе (создаст таблицу + запросит доступ
   к Таблицам), ссылка появится в «Журнале выполнения». */
function resultsSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("RESULTS_SHEET_ID"), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create("Тренажёры — результаты аттестаций");
    var sh = ss.getSheets()[0]; sh.setName("Результаты");
    sh.appendRow(["Дата и время", "ФИО", "Подразделение", "Предмет", "Категория",
      "Результат %", "Верно", "Всего", "Статус", "Выходов из приложения", "Время (сек)", "№ запроса"]);
    sh.setFrozenRows(1);
    props.setProperty("RESULTS_SHEET_ID", ss.getId());
  }
  return ss;
}
function logResult_(b) {
  try {
    var ss = resultsSheet_(), sh = ss.getSheetByName("Результаты") || ss.getSheets()[0];
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    sh.appendRow([now, b.name || "", b.unit || "", b.subject || "", b.catName || "",
      Number(b.pct) || 0, Number(b.ok) || 0, Number(b.total) || 0, b.pass ? "СДАН" : "НЕ СДАН",
      Number(b.switches) || 0, Number(b.sec) || 0, b.reqId || ""]);
    return true;
  } catch (e) { return false; }
}
function showResultsSheet() { var ss = resultsSheet_(); Logger.log("Таблица результатов: " + ss.getUrl()); }

/* ---------- Общий дашборд (вкладка «Дашборд») по всем аттестациям ----------
   Запустить в редакторе ОДИН раз (и повторно, если хотите пересобрать оформление).
   Сводка живая — обновляется формулами QUERY по мере новых результатов. */
function buildDashboard() {
  var ss = SpreadsheetApp.openById("1GLfQZ_n3gnl6DJnRmJclB745Ai1x9R0k5366hqIbKQ4"); // общая таблица результатов
  var old = ss.getSheetByName("Дашборд");
  if (old) ss.deleteSheet(old);
  var sh = ss.insertSheet("Дашборд", 0);
  sh.setHiddenGridlines(true);
  sh.getRange("A1").setValue("📊 Дашборд аттестаций / экзаменов").setFontSize(15).setFontWeight("bold");
  sh.getRange("A2").setValue("Обновляется автоматически по листу «Результаты». Пересобрать оформление — запустить buildDashboard.").setFontColor("#888888");

  // ----- Сводка (A4:B10) -----
  sh.getRange("A4").setValue("Сводка").setFontWeight("bold");
  var rows = [
    ["Всего", '=COUNTA(Результаты!A2:A)'],
    ["Сдано", '=COUNTIF(Результаты!I2:I,"СДАН")'],
    ["Не сдано", '=COUNTIF(Результаты!I2:I,"НЕ СДАН")'],
    ["% сдачи", '=IF(B6+B7=0,0,B6/(B6+B7))'],
    ["Средний балл", '=IFERROR(AVERAGE(Результаты!F2:F),0)'],
    ["Средн. уходов", '=IFERROR(AVERAGE(Результаты!J2:J),0)']
  ];
  for (var i = 0; i < rows.length; i++) {
    sh.getRange(5 + i, 1).setValue(rows[i][0]);
    sh.getRange(5 + i, 2).setFormula(rows[i][1]);
  }
  sh.getRange("A5:A10").setFontWeight("bold");
  sh.getRange("B8").setNumberFormat("0.0%");
  sh.getRange("B9:B10").setNumberFormat("0.0");

  // ----- По предмету / приложению (D4) -----
  sh.getRange("D4").setValue("По предмету / приложению").setFontWeight("bold");
  sh.getRange("D5").setFormula('=QUERY(Результаты!A2:L,"select D, count(A), avg(F) where A is not null group by D order by count(A) desc label D \'Предмет\', count(A) \'Кол-во\', avg(F) \'Ср.балл\'",0)');
  sh.getRange("F5:F200").setNumberFormat("0.0");

  // ----- По подразделению (H4) -----
  sh.getRange("H4").setValue("По подразделению").setFontWeight("bold");
  sh.getRange("H5").setFormula('=QUERY(Результаты!A2:L,"select C, count(A), avg(F) where A is not null group by C order by count(A) desc label C \'Подразделение\', count(A) \'Кол-во\', avg(F) \'Ср.балл\'",0)');
  sh.getRange("J5:J200").setNumberFormat("0.0");

  // ----- Последние 20 (A13) -----
  sh.getRange("A13").setValue("Последние 20").setFontWeight("bold");
  sh.getRange("A14").setFormula('=QUERY(Результаты!A2:L,"select A,B,C,D,F,I where A is not null order by A desc limit 20 label A \'Дата\', B \'ФИО\', C \'Подразделение\', D \'Предмет\', F \'%\', I \'Статус\'",0)');

  sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 170); sh.setColumnWidth(3, 160);
  sh.setColumnWidth(4, 180); sh.setColumnWidth(8, 180);
  Logger.log("Дашборд готов: " + ss.getUrl() + "#gid=" + sh.getSheetId());
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
