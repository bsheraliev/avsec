/* ===========================================================================
   AvSec — клиентский слой лицензии (грузится МЕЖДУ data.js и app.js).
   Аноним видит пробник (SAMPLE_CATS). По коду организации сервер (GAS) отдаёт
   зашифрованную полную базу и ключ → расшифровываем, кэшируем, работаем офлайн.
   Ключа в статических файлах нет — он приходит с сервера после проверки лицензии.
   =========================================================================== */
(function () {
  var LIC_KEY = "avsec_license_v1";
  var GAS_URL = "https://script.google.com/macros/s/AKfycbzzPC5DZm_c36DIjrT5yaxhlEgheqq8U-KO_fgNhskpJ27h6a5j-9mfaqR9xIbHsLnIYw/exec";
  var ENC_URL = "./data.full.enc";

  function b64ToBytes(b64) { var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }

  /* AES-256-GCM расшифровка публичного шифра base64(iv|ct|tag) ключом из сервера */
  function decryptFull(encB64, keyB64) {
    var raw = b64ToBytes(encB64), key = b64ToBytes(keyB64);
    var iv = raw.slice(0, 12), body = raw.slice(12);   // Web Crypto ждёт tag в хвосте ct
    return crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"])
      .then(function (ck) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, ck, body); })
      .then(function (buf) { return JSON.parse(new TextDecoder().decode(new Uint8Array(buf))); });
  }

  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function loadCache() { try { return JSON.parse(localStorage.getItem(LIC_KEY) || "null"); } catch (e) { return null; } }
  function saveCache(o) { try { localStorage.setItem(LIC_KEY, JSON.stringify(o)); } catch (e) {} }
  function clearCache() { try { localStorage.removeItem(LIC_KEY); } catch (e) {} }

  var full = false, org = "", expires = "";

  /* Применить полную базу к глобальному DATA */
  function applyFull(quiz) {
    if (window.DATA && Array.isArray(quiz) && quiz.length) { window.DATA.quiz = quiz; full = true; }
  }

  /* При старте (СИНХРОННО): валидный кэш хранит уже открытую базу → сразу подставляем.
     Так app.js видит полные вопросы с первого рендера, без сети и без ожидания. */
  (function initFromCache() {
    var c = loadCache();
    if (!c || !c.quiz) return;
    if (c.expires && todayStr() > c.expires) { clearCache(); return; }   // TTL истёк
    applyFull(c.quiz); org = c.org || ""; expires = c.expires || "";
  })();

  /* Разблокировка по коду: сервер даёт ключ → берём публичный шифр → AES-расшифровка */
  function unlock(code) {
    code = String(code || "").trim();
    if (!code) return Promise.resolve({ ok: false, error: "empty" });
    var meta;
    return fetch(GAS_URL + "?action=unlock&code=" + encodeURIComponent(code))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) throw { soft: true, error: (res && res.error) || "invalid", expires: res && res.expires };
        meta = res;
        return fetch(ENC_URL).then(function (r) { return r.text(); });
      })
      .then(function (encB64) { return decryptFull(encB64, meta.key); })
      .then(function (obj) {
        var quiz = obj.quiz; applyFull(quiz);
        org = meta.org || ""; expires = meta.expires || "";
        saveCache({ code: code, org: org, expires: expires, quiz: quiz });
        return { ok: true, org: org, expires: expires, count: quiz.length };
      })
      .catch(function (e) {
        if (e && e.soft) return { ok: false, error: e.error, expires: e.expires };
        return { ok: false, error: "network" };
      });
  }

  function deactivate() { clearCache(); full = false; org = ""; expires = ""; }

  var SAMPLE = (typeof window.SAMPLE_CATS !== "undefined") ? window.SAMPLE_CATS : [];
  window.AvSecLic = {
    isFull: function () { return full; },
    org: function () { return org; },
    expires: function () { return expires; },
    /* тема заблокирована, если мы в демо и её нет в пробнике */
    locked: function (cat) { return !full && SAMPLE.indexOf(cat) === -1; },
    unlock: unlock,
    deactivate: deactivate
  };
})();
