/* Обход всех экранов AvSec на выбранном языке: собирает текст, оставшийся на русском.
   Запуск в консоли приложения (превью или сайт):
     await (await fetch('scripts/i18n-sweep.js', {cache:'no-store'})).text().then(eval);
     const r = await AVSEC_I18N_SWEEP('en'); r.count + ' — ' + r.left.join(' | ')
   Для en ищет любую кириллицу, для tg — буквы, которых нет в таджикском (ы щ ц ь),
   поэтому tg-проверка мягче: сначала гонять en, потом tg.
   Прогресс, язык и роль сохраняются до запуска и возвращаются в конце. */
window.AVSEC_I18N_SWEEP = async function (lang) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const saved = JSON.stringify(state), realFetch = window.fetch;
  window.fetch = () => Promise.reject(new TypeError("offline (проверка переводов)"));   // ничего не уходит на сервер
  const RU = lang === "en" ? /[А-Яа-яЁё]/ : /[ыщцьЫЩЦЬ]/;
  const SKIP = /^(Рус|Тоҷикӣ|Eng)$/;
  const left = new Map();
  const grab = where => {
    const roots = [document.getElementById("app"), ...document.querySelectorAll(".toast")];
    for (const root of roots) {
      if (!root) continue;
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n; (n = tw.nextNode());) {
        const s = n.nodeValue.replace(/\s+/g, " ").trim();
        if (s && RU.test(s) && !SKIP.test(s) && !left.has(s)) left.set(s, where);
      }
      root.querySelectorAll("[placeholder],[title],[aria-label]").forEach(el => ["placeholder", "title", "aria-label"].forEach(a => {
        const s = (el.getAttribute(a) || "").trim();
        if (s && RU.test(s) && !left.has(s)) left.set(s, where + " @" + a);
      }));
    }
  };
  // тосты исчезают через 2 с — ловим в момент появления
  const mo = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains("toast")) grab("тост"); })));
  mo.observe(document.body, { childList: true });
  try {
    state.lang = lang; state.soundOn = false;          // без сигналов «верно/неверно» на время обхода
    for (const role of ROLE_ORDER) {
      state.role = role; renderHome(); await wait(80); grab("меню/" + role);
      for (const m of menuForRole()) {
        renderHome(); await wait(30);
        try { await route(m.go); } catch (e) { left.set("ОШИБКА " + m.go + ": " + e.message, "route"); }
        await wait(120); grab(m.go);
        if (m.go.startsWith("quiz-") || m.go === "blitz") {        // ответ, пояснение, следующий… до итога
          for (let i = 0; i < 40; i++) {
            const opt = document.querySelector("#app .opt:not([disabled]), #app button.opt");
            const ta = document.querySelector("#app textarea");
            if (ta) { ta.value = "Test answer about access control and reporting."; ta.dispatchEvent(new Event("input")); const b = [...document.querySelectorAll("#app button")].find(x => /Провер|Check|Санҷ/i.test(x.textContent) || x.getAttribute("onclick") === "submitOpenAnswer()"); if (b) b.click(); await wait(300); }
            else if (opt) opt.click(); else break;
            await wait(40); grab(m.go + "/ответ");
            const nx = document.querySelector('#app [onclick^="answer"], #app .next, #app button[onclick*="next" i]');
            if (nx) nx.click(); await wait(40);
          }
          grab(m.go + "/итог");
        }
      }
    }
    // рентген: каждая сцена — неверный ответ (разбор с названиями и пояснениями), затем подсказка
    await route("xray"); await wait(100);
    for (let i = 0; i < xr.list.length; i++) {
      xr.i = i; renderXrayScene(); await wait(30); grab("рентген/сцена");
      xrayHint(); grab("рентген/подсказка");
      xrayNone(); await wait(30); grab("рентген/разбор");
      renderXrayScene(); const s = xr.list[i];
      for (const tg of s.targets || []) xrayTap(tg.x + tg.w / 2, tg.y + tg.h / 2);
      await wait(30); grab("рентген/верно");
    }
    xrayResult(); grab("рентген/итог");
    for (const fn of ["renderStats", "renderAch", "renderSettings", "renderLeaderboard", "renderCertificate", "renderUnlock", "renderAttest", "renderAttestLog", "renderLessons", "startMistakes"]) {
      try { window[fn](); await wait(120); grab(fn); } catch (e) { left.set("ОШИБКА " + fn + ": " + e.message, fn); }
    }
    for (let i = 0; i < LESSONS.length; i++) { renderLesson(i); await wait(60); for (let k = 0; k < 8; k++) { try { lessonStep(1); } catch (e) {} await wait(20); grab("урок " + (i + 1)); } try { lessonStop(); } catch (e) {} }
  } finally {
    mo.disconnect(); window.fetch = realFetch;
    Object.keys(state).forEach(k => delete state[k]); Object.assign(state, JSON.parse(saved)); save(); renderHome();
  }
  const list = [...left].map(([s, w]) => w + " | " + s);
  return { count: list.length, left: list };
};
