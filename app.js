/* ===========================================================================
   AvSec — тренажёр авиационной безопасности. Движок: квиз по доменам
   Приложения 17, XP/ранги, дневная цель, статистика, работа над ошибками,
   сертификат. (Адаптировано из движка AvEng.)
   =========================================================================== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const app = $("#app");
const SAVE_KEY = "avsec_game_v1";
/* Версия приложения. Обновлять вместе с версией кэша в sw.js. */
const APP_VERSION = "1.4.0";
const CONTACT_TG = "https://t.me/Ori_gemini_bot";   // контакт/поддержка в Telegram

function defaultState() {
  return {
    xp: 0, totalCorrect: 0, streakBest: 0, soundOn: true, voiceOn: true, lang: "ru", org: "",
    role: "airport",
    achievements: {}, mistakes: {}, catStats: {}, domainCorrect: {},
    daily: { day: "", streak: 0, count: 0, goal: 20 }
  };
}

/* ---------- Аудитории (роли) ----------
   Персонал аэропорта · Экипаж и авиакомпания · Руководители служб АБ.
   Роль определяет, какие плитки видны и из каких тем берутся экзамен/блиц. */
const ROLE_NAMES = { airport: "Персонал аэропорта", crew: "Экипаж и АК", manager: "Руководители" };
const ROLE_ORDER = ["airport", "crew", "manager"];
const COMMON_CATS = ["awareness", "access", "restricted", "screening", "prohibited",
                     "suspicious", "insider", "response", "culture", "cyber"];
const ROLE_CATS = {
  airport: COMMON_CATS.concat(["service"]),
  crew:    COMMON_CATS.concat(["operator"]),
  manager: COMMON_CATS.concat(["manager"])
};
function roleCats() { return ROLE_CATS[state.role] || ROLE_CATS.airport; }
function setRole(rk) { state.role = rk; save(); renderHome(); }
/* Банк вопросов текущей роли (для экзамена/блица/аттестации). */
function rolePool() {
  const cats = roleCats();
  const pool = (DATA.quiz || []).filter(q => cats.indexOf(q.cat) >= 0);
  return pool.length ? pool : (DATA.quiz || []);
}
function loadState() {
  try { return Object.assign(defaultState(), JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); }
  catch (e) { return defaultState(); }
}
let state = loadState();
function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  if (inTelegram) { try { TG.CloudStorage.setItem(SAVE_KEY, JSON.stringify(state), () => {}); } catch (e) {} }
}

/* ---------- Прогресс ---------- */
function todayStr() { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
function markDaily() {
  const t = todayStr();
  if (state.daily.day !== t) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const ystr = y.getFullYear() + "-" + (y.getMonth() + 1) + "-" + y.getDate();
    state.daily.streak = (state.daily.day === ystr) ? (state.daily.streak + 1) : 1;
    state.daily.day = t; state.daily.count = 0;
    if (state.daily.streak >= 3) unlock("day3");
  }
  state.daily.count++; save();
}
function recordQuiz(q, correct) {
  const c = q.cat || "other";
  if (!state.catStats[c]) state.catStats[c] = { correct: 0, total: 0 };
  state.catStats[c].total++;
  if (correct) { state.catStats[c].correct++; if (state.mistakes[q.q]) delete state.mistakes[q.q]; }
  else state.mistakes[q.q] = c;
}
function mistakeCount() { return Object.keys(state.mistakes).length; }

const CAT_NAMES = {
  awareness: "Основы АБ и угрозы", access: "Пропуска и доступ", restricted: "Зоны ограниченного доступа",
  screening: "Досмотр", prohibited: "Запрещённые предметы", suspicious: "Подозрительные предметы",
  insider: "Инсайдер и соцынженерия", response: "Действия при угрозе", culture: "Культура безопасности",
  cyber: "Киберигиена", service: "По службам аэропорта",
  operator: "АБ эксплуатанта ВС", manager: "Управление АБ", other: "Прочее"
};
const MENU = [
  { go: "lessons", icon: "📺", title: "Видеоуроки", sub: "Короткие ролики по процессам" },
  { go: "quiz-awareness", icon: "ℹ️", title: "Основы АБ и угрозы", sub: "Что такое АБ, АНВ, зона ответственности" },
  { go: "quiz-access", icon: "🪪", title: "Пропуска и доступ", sub: "Бейдж, проход «хвостом», сопровождение" },
  { go: "quiz-restricted", icon: "🚧", title: "Зоны ограниченного доступа", sub: "Правила поведения в ЗОД" },
  { go: "quiz-screening", icon: "🛂", title: "Досмотр", sub: "Зачем досматривают всех, что нельзя проносить" },
  { go: "quiz-prohibited", icon: "🚫", title: "Запрещённые предметы", sub: "Оружие, ЖГА, опасные грузы" },
  { go: "quiz-suspicious", icon: "🧳", title: "Подозрительные предметы", sub: "Бесхозный багаж: не трогать, сообщить" },
  { go: "quiz-insider", icon: "🕵️", title: "Инсайдер и соцынженерия", sub: "Подозрительные просьбы, давление" },
  { go: "quiz-response", icon: "🚨", title: "Действия при угрозе", sub: "Тревога, эвакуация, бомбовая угроза" },
  { go: "quiz-culture", icon: "🤝", title: "Культура безопасности", sub: "АБ — дело каждого, конфиденциальность" },
  { go: "quiz-cyber", icon: "🖥️", title: "Киберигиена", sub: "Пароли, фишинг, USB" },
  { go: "xray", icon: "🩻", title: "Распознавание на рентгене", sub: "Снимок интроскопа · найди запрещённый предмет" },
  { go: "quiz-service", icon: "🧑‍✈️", title: "По службам аэропорта", sub: "Перрон, регистрация, клининг, грузовая, ГСМ", roles: ["airport"] },
  { go: "quiz-operator", icon: "✈️", title: "АБ эксплуатанта ВС", sub: "ПАБ авиакомпании, безопасность и досмотр ВС", roles: ["crew"] },
  { go: "quiz-manager", icon: "🎖️", title: "Управление АБ", sub: "Программы, контроль качества, SOP, кризис-планы", roles: ["manager"] },
  { go: "exam", icon: "📝", title: "Аттестация", sub: "Проктор-экзамен · допуск экзаменатора + справка" },
  { go: "blitz", icon: "⏱️", title: "Экзамен на время", sub: "15 вопросов · таймер 20 c" },
  { go: "mistakes", icon: "🧯", title: "Работа над ошибками", sub: "" }
];
/* Плитка видна, если у неё нет ограничения по ролям либо текущая роль в списке. */
function menuForRole() { return MENU.filter(m => !m.roles || m.roles.indexOf(state.role) >= 0); }

/* ───────── Управление доступностью плиток и объёмом вопросов ─────────
   Активны первые WIP_AFTER плиток, остальные помечаются «на стадии разработки»
   и по нажатию показывают тост вместо запуска.
   В активных тестах показывается только доля QUIZ_KEEP вопросов категории
   (остальные «придержаны» до подключения).
   Чтобы подключить позже:
     • полностью открыть тест: добавь его id (поле `go`) в LIVE_EXTRA;
     • открыть больше плиток сразу: увеличь WIP_AFTER;
     • вернуть все вопросы: поставь QUIZ_KEEP = 1. */
const WIP_AFTER = 99;           // все разделы активны (аттестация, блиц, открытые вопросы включены)
const LIVE_EXTRA = [];          // id игр (go), всегда активных независимо от позиции
const QUIZ_KEEP = 1;            // доступны все вопросы категории (включая открытые)
function isWip(go, idx) { return idx >= WIP_AFTER && LIVE_EXTRA.indexOf(go) < 0; }
function trimPool(list) {        // оставить долю QUIZ_KEEP вопросов (минимум 1)
  if (QUIZ_KEEP >= 1) return list;
  const n = Math.max(1, Math.ceil(list.length * QUIZ_KEEP));
  return list.slice(0, n);
}

function closedPool(list) { return list.filter(q => q.type !== "open"); }   // открытые вопросы — не для блица/аттестации
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pick(arr, n) { return shuffle(arr).slice(0, n); }
function rankFor(xp) { let r = DATA.ranks[0]; for (const x of DATA.ranks) if (xp >= x.xp) r = x; return r; }
function nextRank(xp) { for (const x of DATA.ranks) if (xp < x.xp) return x; return null; }

/* ---------- Звук (WebAudio, работает и в Telegram) ---------- */
let _actx = null;
function beep(ok) {
  if (!state.soundOn) return;
  try {
    _actx = _actx || new (window.AudioContext || window.webkitAudioContext)();
    if (_actx.state === "suspended") _actx.resume();
    const now = _actx.currentTime, o = _actx.createOscillator(), g = _actx.createGain();
    o.connect(g); g.connect(_actx.destination);
    if (ok) { o.type = "sine"; o.frequency.setValueAtTime(660, now); o.frequency.setValueAtTime(990, now + 0.09); }
    else { o.type = "square"; o.frequency.setValueAtTime(220, now); o.frequency.setValueAtTime(150, now + 0.13); }
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.16, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    o.start(now); o.stop(now + 0.3);
  } catch (e) {}
}
function toast(msg, cls = "") {
  const t = document.createElement("div"); t.className = "toast " + cls; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2200);
}
function addXP(n) {
  const before = rankFor(state.xp); state.xp += n; const after = rankFor(state.xp);
  if (after.name !== before.name) { toast("Новый ранг: " + after.name + " " + after.icon, "rank"); tgHaptic("success"); }
  if (state.xp >= 600) unlock("expert");
  if (state.xp >= 900) unlock("audit");
  save();
}
function unlock(id) {
  if (state.achievements[id]) return;
  const a = DATA.achievements.find(x => x.id === id); if (!a) return;
  state.achievements[id] = true; save(); toast("Ачивка: " + a.name + " " + a.icon, "ach");
}

/* ---------- Главный экран ---------- */
function renderHome() {
  lessonStopSpeak(); attCleanup();
  const r = rankFor(state.xp), nx = nextRank(state.xp);
  const prog = nx ? Math.round(((state.xp - r.xp) / (nx.xp - r.xp)) * 100) : 100;
  tgBack(false);
  const todayC = (state.daily.day === todayStr()) ? state.daily.count : 0;
  app.innerHTML = `
    <div class="langrow">
      ${["ru", "tg", "en"].map(L => `<button class="langchip ${(state.lang || "ru") === L ? "on" : ""}" onclick="changeLang('${L}')">${LANG_NAMES[L]}</button>`).join("")}
    </div>
    <div class="brand">🛡️ <b>AvSec</b> <span>· ${t("авиационная безопасность")}</span></div>
    <div class="roles">
      ${ROLE_ORDER.map(rk => `<button class="rolechip ${state.role === rk ? "on" : ""}" onclick="setRole('${rk}')">${t(ROLE_NAMES[rk])}</button>`).join("")}
    </div>
    <div class="rankcard">
      <div class="rankicon">${r.icon}</div>
      <div class="rankinfo">
        <div class="rankname">${t(r.name)}</div>
        <div class="ranksub">${t("Ранг АБ:")} ${t(r.sub)}</div>
        <div class="bar"><div class="fill" style="width:${prog}%"></div></div>
        <div class="xpline">${state.xp} XP ${nx ? `· ${t("до")} «${t(nx.name)}» ${nx.xp - state.xp} XP` : "· " + t("максимум!")}</div>
      </div>
    </div>
    <div class="daily">
      <span>🎯 ${t("Сегодня")} <b>${Math.min(todayC, state.daily.goal)}/${state.daily.goal}</b></span>
      <div class="dbar"><div class="dfill" style="width:${Math.min(100, Math.round(todayC / state.daily.goal * 100))}%"></div></div>
      <span>🔥 <b>${state.daily.streak}</b> ${t("дн.")}</span>
    </div>
    ${licenseBanner()}
    <div class="menu">
      ${menuForRole().map((m, i) => {
        const cat = m.go.startsWith("quiz-") ? m.go.slice(5) : null;
        if (cat && window.AvSecLic && AvSecLic.locked(cat)) return lockedTile(m.icon, t(m.title), t(m.sub));
        return tile(m.go, m.icon, t(m.title), m.go === "mistakes"
          ? (mistakeCount() ? mistakeCount() + " " + t("на повторение") : t("ошибок пока нет")) : t(m.sub), isWip(m.go, i));
      }).join("")}
    </div>
    <div class="row2">
      <button class="ghost" onclick="renderAch()">${t("🏅 Ачивки")} (${Object.keys(state.achievements).length}/${DATA.achievements.length})</button>
      <button class="ghost" onclick="renderStats()">📊 ${t("Статистика")}</button>
    </div>
    <button class="ghost fullrow" onclick="renderLeaderboard()">${t("🏆 Лидерборд")}</button>
    <button class="ghost fullrow" onclick="renderCertificate()">${t("🎓 Сертификат о прохождении")}</button>
    <button class="ghost fullrow" onclick="shareApp()">${t("📨 Поделиться с коллегой")}</button>
    <a class="ghost fullrow" style="display:block;text-align:center;text-decoration:none" href="${CONTACT_TG}" target="_blank" rel="noopener">${t("✈️ Связаться / поддержка")}</a>
    <button class="ghost fullrow" onclick="renderSettings()">${t("⚙️ Настройки")}</button>
    <button class="ghost danger fullrow" onclick="resetAll()">${t("↺ Сброс прогресса")}</button>
    <p class="disclaimer">${t("Учебный тренажёр на основе ICAO Приложения 17, Doc 8973 и Национальной программы безопасности ГА РТ. Не заменяет официальные документы и аттестацию.")}</p>
    <p class="disclaimer">© 2026 AvSec. ${t("Все права защищены. Копирование содержимого и кода без письменного разрешения правообладателя запрещено.")} <a href="./TERMS.html" style="color:inherit;text-decoration:underline">${t("Условия")}</a></p>
    <p class="disclaimer verline">${t("Версия")} ${APP_VERSION} · ${t("вопросов")}: ${DATA.quiz.length}${window.XRAY ? " · " + t("снимков") + ": " + XRAY.scenes.length : ""}</p>
  `;
}
function tile(go, icon, title, sub, wip) {
  if (wip) {
    return `<button class="tile wip" onclick="wipToast()"><span class="wipbadge">🔧 ${t("в разработке")}</span><span class="ti">${icon}</span><span class="tt">${title}</span><span class="ts">${sub}</span></button>`;
  }
  return `<button class="tile" onclick="route('${go}')"><span class="ti">${icon}</span><span class="tt">${title}</span><span class="ts">${sub}</span></button>`;
}
function wipToast() { toast(t("Раздел на стадии разработки — скоро будет доступен"), "warn"); }

/* ===========================================================================
   ЛИЦЕНЗИЯ — баннер, заблокированные темы, экран ввода кода организации
   =========================================================================== */
function licenseBanner() {
  if (!window.AvSecLic) return "";
  if (AvSecLic.isFull()) {
    const org = AvSecLic.org(), exp = AvSecLic.expires();
    return `<div class="licbar ok">✅ ${t("Полный доступ")}${org ? " · " + org : ""}${exp ? " · " + t("до") + " " + exp : ""}</div>`;
  }
  const n = (DATA.quiz || []).length;
  return `<div class="licbar demo">
    <div class="licbar-txt">🔒 ${t("Демо-версия")} · ${n} ${t("вопр.")} ${t("из")} 175. ${t("Полный курс — по коду организации.")}</div>
    <button class="licbtn" onclick="renderUnlock()">${t("Ввести код")}</button>
  </div>`;
}
function lockedTile(icon, title, sub) {
  return `<button class="tile locked" onclick="renderUnlock()"><span class="lockbadge">🔒 ${t("по лицензии")}</span><span class="ti">${icon}</span><span class="tt">${title}</span><span class="ts">${sub}</span></button>`;
}
function renderUnlock() {
  track("open/unlock");
  app.innerHTML = `${topbar("Полный доступ")}
  <div class="unlock">
    <div class="unlock-hero">🛡️🔓</div>
    <h2>${t("Полный курс AvSec")}</h2>
    <p class="unlock-sub">${t("175 вопросов по 11 темам (включая открытые с ИИ-проверкой), привязанных к Приложению 17 ИКАО и национальной программе. Доступ выдаётся организации по лицензии.")}</p>
    <div class="unlock-form">
      <input id="licCode" type="text" autocomplete="off" placeholder="${t("Код организации")}" />
      <button class="primary" id="licGo" onclick="doUnlock()">${t("Разблокировать")}</button>
    </div>
    <div id="licMsg" class="unlock-msg"></div>
    <p class="unlock-note">${t("Нет кода? Обратитесь к вашей организации за кодом доступа.")}</p>
    <a class="primary" style="display:block;text-align:center;text-decoration:none;max-width:340px;margin:8px auto 0" href="${CONTACT_TG}" target="_blank" rel="noopener">${t("✈️ Связаться в Telegram")}</a>
  </div>`;
  const inp = document.getElementById("licCode");
  if (inp) { inp.focus(); inp.addEventListener("keydown", e => { if (e.key === "Enter") doUnlock(); }); }
}
function doUnlock() {
  const inp = document.getElementById("licCode"), btn = document.getElementById("licGo"), msg = document.getElementById("licMsg");
  const code = (inp && inp.value || "").trim();
  if (!code) { if (msg) msg.innerHTML = `<span class="err">${t("Введите код")}</span>`; return; }
  if (btn) { btn.disabled = true; btn.textContent = t("Проверка…"); }
  if (msg) msg.innerHTML = "";
  AvSecLic.unlock(code).then(res => {
    if (res.ok) {
      tgHaptic("success");
      toast(t("Доступ открыт") + (res.org ? " · " + res.org : ""), "ok");
      renderHome();
    } else {
      const map = {
        invalid: t("Код не найден. Проверьте правильность."),
        revoked: t("Лицензия отключена. Обратитесь к нам."),
        expired: t("Срок лицензии истёк") + (res.expires ? " (" + res.expires + ")" : "") + ". " + t("Обратитесь для продления."),
        network: t("Нет связи с сервером. Проверьте интернет."),
        empty: t("Введите код")
      };
      if (btn) { btn.disabled = false; btn.textContent = t("Разблокировать"); }
      if (msg) msg.innerHTML = `<span class="err">${map[res.error] || t("Не удалось разблокировать.")}</span>`;
      tgHaptic("error");
    }
  });
}
function route(go) {
  track("open/" + go);
  if (go === "lessons") return renderLessons();
  if (go === "xray") return startXray();
  if (go === "exam") return renderAttest();                       // проктор-аттестация (замена «экзамена»)
  if (go === "blitz") return startQuiz(pick(closedPool(rolePool()), 15), "Экзамен на время", null, { timed: true, secs: 20 });
  if (go === "mistakes") return startMistakes();
  if (go.startsWith("quiz-")) {
    const cat = go.slice(5);
    if (window.AvSecLic && AvSecLic.locked(cat)) return renderUnlock();
    return startQuiz(shuffle(trimPool(DATA.quiz.filter(q => q.cat === cat))), CAT_NAMES[cat] || "Тест", cat);
  }
}
/* ===========================================================================
   МОДУЛЬ «РАСПОЗНАВАНИЕ НА РЕНТГЕНЕ»
   Сцена интроскопа → пользователь указывает запрещённый предмет (или жмёт
   «Нарушений нет»). Проверка попадания по зонам targets в координатах viewBox.
   =========================================================================== */
let xr = null;        // { list, i, correct, found, done }
let xrView = "";      // режим просмотра: "" цвет · "bw" ч/б · "neg" негатив
function setXrView(v) {
  xrView = v;
  const w = $("#xrwrap"); if (w) w.className = "xrwrap " + v;
  $$(".xrmode").forEach((b, i) => b.classList.toggle("on", ["", "bw", "neg"][i] === v));
}
let _xrLocal = null;  // снимки из ./xray/scenes.json (реальные TIP, не в публичном репо)

/* Подхватываем локальные снимки, если папка xray/ заполнена (см. xray/README.md).
   На публичном сайте файла нет — модуль работает на встроенных векторных сценах. */
async function xrayLoadLocal() {
  if (_xrLocal !== null) return _xrLocal;
  _xrLocal = [];
  try {
    const r = await fetch("./xray/scenes.json", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      if (j && Array.isArray(j.scenes)) _xrLocal = j.scenes.filter(s => s && s.img && Array.isArray(s.targets));
    }
  } catch (e) {}
  return _xrLocal;
}
function xrVW() { const s = xr && xr.list[xr.i]; return (s && s.vw) || 400; }
function xrVH() { const s = xr && xr.list[xr.i]; return (s && s.vh) || 260; }
async function startXray() {
  if (!window.XRAY || !XRAY.scenes.length) { toast("Модуль недоступен"); return; }
  const local = await xrayLoadLocal();
  xr = { list: shuffle(XRAY.scenes.concat(local)), i: 0, correct: 0 };
  renderXrayScene();
}
function renderXrayScene() {
  const s = xr.list[xr.i];
  xr.found = []; xr.done = false;
  const need = (s.targets || []).length;
  app.innerHTML = `${topbar("Распознавание на рентгене")}
    <div class="hud">
      <span>${t("Снимок")} ${xr.i + 1}/${xr.list.length}</span>
      <span class="xrtask">${t(s.task)}</span>
    </div>
    <div class="xrwrap ${xrView}" id="xrwrap">
      ${s.img ? `<img src="${s.img}" class="xrsvg" alt="">` : s.svg}
      <div class="xrmarks" id="xrmarks"></div>
    </div>
    <div class="xrmodes">
      ${[["", "Цвет"], ["bw", "Ч/Б"], ["neg", "Негатив"]].map(m =>
        `<button class="xrmode ${xrView === m[0] ? "on" : ""}" onclick="setXrView('${m[0]}')">${t(m[1])}</button>`).join("")}
    </div>
    <div class="xrbar">
      <button class="ghost" onclick="xrayHint()">💡 ${t("Подсказка")}</button>
      <button class="ghost" onclick="xrayNone()">✅ ${t("Нарушений нет")}</button>
    </div>
    <div class="feedback" id="xrfb">${need ? t("Нажмите на подозрительный предмет на снимке") : ""}</div>`;
  const wrap = $("#xrwrap");
  wrap.onclick = e => {
    if (xr.done) return;
    const el = wrap.querySelector(".xrsvg");
    const r = el.getBoundingClientRect();
    // координаты клика → систему координат сцены (viewBox SVG либо vw/vh снимка)
    const vx = (e.clientX - r.left) / r.width * xrVW();
    const vy = (e.clientY - r.top) / r.height * xrVH();
    xrayTap(vx, vy);
  };
}
function xrayTap(vx, vy) {
  const s = xr.list[xr.i], targets = s.targets || [];
  const hit = targets.findIndex((tg, idx) =>
    xr.found.indexOf(idx) < 0 && vx >= tg.x && vx <= tg.x + tg.w && vy >= tg.y && vy <= tg.y + tg.h);
  if (hit >= 0) {
    xr.found.push(hit);
    const tg = targets[hit];
    markBox(tg, "ok", tg.name);
    beep(true); tgHaptic("success");
    if (xr.found.length === targets.length) {
      xr.correct++; addXP(8); markDaily();
      xrayDone(`✅ <b>${t("Верно")}</b> — ${targets.map(x => x.name).join(", ")}.<br>${targets.map(x => x.why).join("<br>")}`, true);
    } else {
      $("#xrfb").innerHTML = `✅ ${t("Найдено")}: ${tg.name}. ${t("На снимке есть ещё нарушение — продолжайте.")}`;
    }
  } else {
    beep(false); tgHaptic("error");
    markDot(vx, vy);
    $("#xrfb").innerHTML = `❌ ${t("Здесь ничего запрещённого. Осмотрите снимок внимательнее.")}`;
  }
}
function xrayNone() {
  if (xr.done) return;
  const s = xr.list[xr.i], targets = s.targets || [];
  if (!targets.length) {
    xr.correct++; addXP(8); markDaily(); beep(true); tgHaptic("success");
    xrayDone(`✅ <b>${t("Верно")}</b> — ${t("сумка чистая")}.<br>${s.cleanWhy || ""}`, true);
  } else {
    beep(false); tgHaptic("error");
    targets.forEach((tg, i) => { if (xr.found.indexOf(i) < 0) markBox(tg, "miss", tg.name); });
    xrayDone(`❌ <b>${t("Пропуск угрозы")}</b> — ${targets.map(x => x.name).join(", ")}.<br>${targets.map(x => x.why).join("<br>")}`, false);
  }
}
function xrayHint() {
  const s = xr.list[xr.i];
  if (s.hint) $("#xrfb").innerHTML = `💡 ${t(s.hint)}`;
}
function markBox(tg, cls, label) {
  const m = $("#xrmarks"); if (!m) return;
  const d = document.createElement("div");
  d.className = "xrbox " + cls;
  const W = xrVW(), H = xrVH();
  d.style.left = (tg.x / W * 100) + "%"; d.style.top = (tg.y / H * 100) + "%";
  d.style.width = (tg.w / W * 100) + "%"; d.style.height = (tg.h / H * 100) + "%";
  d.innerHTML = `<span>${label}</span>`;
  m.appendChild(d);
}
function markDot(vx, vy) {
  const m = $("#xrmarks"); if (!m) return;
  const d = document.createElement("div");
  d.className = "xrdot";
  d.style.left = (vx / xrVW() * 100) + "%"; d.style.top = (vy / xrVH() * 100) + "%";
  m.appendChild(d);
  setTimeout(() => d.remove(), 900);
}
function xrayDone(html, ok) {
  xr.done = true;
  const last = xr.i >= xr.list.length - 1;
  $("#xrfb").innerHTML = `<div class="${ok ? "good" : "bad"}">${html}</div>`;
  const bar = document.querySelector(".xrbar");
  if (bar) bar.innerHTML = `<button class="next" onclick="${last ? "xrayResult()" : "xrayNext()"}">${last ? t("Итог") : t("Следующий снимок")} ›</button>`;
}
function xrayNext() { xr.i++; renderXrayScene(); }
function xrayResult() {
  const n = xr.list.length, pct = Math.round(xr.correct / n * 100);
  if (pct >= 80) unlock("expert");
  app.innerHTML = `${topbar("Распознавание на рентгене")}
    <div class="qcard">
      <div class="qtext">${pct >= 80 ? "🎯" : pct >= 50 ? "👍" : "📚"} ${t("Результат")}: <b>${xr.correct}/${n}</b> (${pct}%)</div>
      <div class="why">${t("Цветовая кодировка интроскопа: оранжевый — органика (взрывчатка, жидкости, ткань), синий — металл (оружие, инструменты), зелёный — неорганика и смеси, чёрный — плотные непроницаемые объекты.")}</div>
      <div class="src">${t("Учебная имитация снимка. Не заменяет подготовку на реальном оборудовании.")}</div>
      <button class="next" onclick="startXray()">↻ ${t("Ещё раз")}</button>
      <button class="ghost fullrow" onclick="renderHome()">${t("В меню")}</button>
    </div>`;
}

function topbar(title) {
  tgBack(true);
  return `<div class="topbar"><button class="back" onclick="renderHome()">${t("‹ Меню")}</button><span class="ttitle">${t(title)}</span><span class="xpchip">${state.xp} XP</span></div>`;
}
function changeLang(L) { state.lang = L; save(); renderHome(); }

/* ===========================================================================
   КВИЗ
   =========================================================================== */
let quiz = null, quizTimer = null;
function startQuiz(questions, title, cat, opts = {}) {
  if (!questions.length) { toast("Пока нет вопросов в этом разделе"); return; }
  quiz = { qs: questions, i: 0, correct: 0, streak: 0, lives: 3, title, cat, timed: !!opts.timed, secs: opts.secs || 20, log: [] };
  renderQuestion();
}
function locQ(q) {
  const L = state.lang;
  if (L && L !== "ru" && q.tr && q.tr[L]) {
    const tt = q.tr[L];
    return { q: tt.q || q.q, a: (tt.a && tt.a.length === 4) ? tt.a : q.a, why: tt.why || q.why };
  }
  return { q: q.q, a: q.a, why: q.why };
}
function renderQuestion() {
  if (quizTimer) { clearInterval(quizTimer); quizTimer = null; }
  if (quiz.i >= quiz.qs.length || quiz.lives <= 0) return renderQuizResult();
  const q = quiz.qs[quiz.i];
  if (q.type === "open") return renderOpenQuestion(q);
  const lq = locQ(q);
  const shown = shuffle(lq.a.map((t, idx) => ({ t, idx })));
  app.innerHTML = `
    ${topbar(quiz.title)}
    <div class="hud">
      <span>${t("Вопрос")} ${quiz.i + 1}/${quiz.qs.length}</span>
      <span class="lives">${"❤️".repeat(quiz.lives)}${"🖤".repeat(3 - quiz.lives)}</span>
      <span class="streak">🔥 ${quiz.streak}</span>
    </div>
    ${quiz.timed ? `<div class="tbar"><div class="tfill" id="tfill"></div></div>` : ""}
    <div class="qcard">
      <div class="qtext">${lq.q}</div>
      <div class="opts">${shown.map(o => `<button class="opt" data-i="${o.idx}">${o.t}</button>`).join("")}</div>
      <div class="feedback" id="fb"></div>
    </div>`;
  $$(".opt").forEach(b => b.addEventListener("click", () => answer(parseInt(b.dataset.i), b)));
  if (quiz.timed) {
    let left = quiz.secs * 1000;
    quizTimer = setInterval(() => {
      const bar = $("#tfill"); if (!bar) { clearInterval(quizTimer); quizTimer = null; return; }
      left -= 100; bar.style.width = Math.max(0, left / (quiz.secs * 1000) * 100) + "%";
      if (left <= 0) { clearInterval(quizTimer); quizTimer = null; if (!$("#fb").dataset.locked) answer(-1, null); }
    }, 100);
  }
}
function answer(chosen, btn) {
  if (quizTimer) { clearInterval(quizTimer); quizTimer = null; }
  const q = quiz.qs[quiz.i];
  const lq = locQ(q);
  if ($("#fb").dataset.locked) return;
  $("#fb").dataset.locked = "1";
  const correct = chosen === q.correct;
  tgHaptic(correct ? "success" : "error"); beep(correct);
  quiz.log.push({ cat: q.cat || "other", ok: correct });
  recordQuiz(q, correct); markDaily();
  $$(".opt").forEach(b => { const i = parseInt(b.dataset.i); b.disabled = true; if (i === q.correct) b.classList.add("right"); else if (b === btn) b.classList.add("wrong"); });
  if (correct) {
    quiz.correct++; quiz.streak++; state.totalCorrect++;
    state.streakBest = Math.max(state.streakBest, quiz.streak);
    unlock("first");
    if (quiz.streak >= 5) unlock("streak5");
    if (quiz.streak >= 10) unlock("streak10");
    if (q.cat === "screening") { state.domainCorrect.screening = (state.domainCorrect.screening || 0) + 1; if (state.domainCorrect.screening >= 20) unlock("screen20"); }
    const gain = 10 + Math.min(quiz.streak, 10); addXP(gain);
    $("#fb").innerHTML = `<div class="fb ok">✅ ${t("Верно")} +${gain} XP</div><div class="why">${lq.why}</div><div class="src">📄 ${q.src}</div>`;
  } else {
    quiz.streak = 0; quiz.lives--;
    $("#fb").innerHTML = `<div class="fb no">❌ ${t("Неверно. Правильно:")} «${lq.a[q.correct]}»</div><div class="why">${lq.why}</div><div class="src">📄 ${q.src}</div>`;
  }
  $("#fb").innerHTML += `<button class="next" id="next">${quiz.i + 1 >= quiz.qs.length || quiz.lives <= 0 ? t("Итог →") : t("Дальше →")}</button>`;
  $("#next").addEventListener("click", () => { quiz.i++; renderQuestion(); });
  save();
}
function resultBreakdown() {
  const by = {};
  quiz.log.forEach(e => { (by[e.cat] = by[e.cat] || { c: 0, t: 0 }), by[e.cat].t++; if (e.ok) by[e.cat].c++; });
  const cats = Object.keys(by); if (cats.length <= 1) return "";
  const rows = cats.map(c => {
    const p = Math.round(by[c].c / by[c].t * 100), cls = p >= 70 ? "ok" : "no";
    return `<div class="brrow"><span class="brname">${t(CAT_NAMES[c] || c)}</span><span class="brbar"><span class="brfill ${cls}" style="width:${p}%"></span></span><span class="brval">${by[c].c}/${by[c].t}</span></div>`;
  }).join("");
  return `<div class="breakdown"><div class="brtitle">${t("По темам")}</div>${rows}</div>`;
}
function renderQuizResult() {
  const pct = Math.round((quiz.correct / quiz.qs.length) * 100);
  const failed = quiz.lives <= 0;
  track("done/" + (quiz.cat || quiz.title || "quiz"));
  const vc = (!failed && pct >= 70) ? "ok" : "no";
  const verdict = failed ? t("Жизни закончились — потренируйтесь ещё")
    : pct >= 90 ? t("Отлично! Уверенный уровень по АБ")
    : pct >= 70 ? t("Хорошо — рабочий минимум") : t("Нужно повторить материал");
  if (!failed && pct >= 90 && quiz.cat === null) unlock("exam");
  const retry = quiz.cat === "review" ? "startMistakes()" : quiz.timed ? "route('blitz')" : quiz.cat ? `route('quiz-${quiz.cat}')` : "route('exam')";
  app.innerHTML = `
    ${topbar(quiz.title)}
    <div class="result">
      <div class="bigpct ${vc}">${pct}%</div>
      <div class="verdict ${vc}">${verdict}</div>
      <div class="rstats">${t("Правильно")} ${quiz.correct} ${t("из")} ${quiz.qs.length} · ${t("Лучшая серия")} 🔥 ${state.streakBest}</div>
      ${resultBreakdown()}
      <div class="row2">
        <button class="primary" onclick="shareResult(${pct}, ${quiz.correct}, ${quiz.qs.length})">${t("📲 Поделиться")}</button>
        <button class="ghost" onclick="${retry}">${t("↻ Ещё раз")}</button>
      </div>
      <button class="ghost fullrow" onclick="renderHome()">${t("В меню")}</button>
    </div>`;
  if (vc === "ok" && !failed) confetti();
}

/* ---------- Работа над ошибками ---------- */
function startMistakes() {
  const qs = DATA.quiz.filter(q => state.mistakes[q.q]);
  if (!qs.length) { toast("Ошибок нет — отличная работа!"); return; }
  startQuiz(shuffle(qs), "Работа над ошибками", "review");
}

/* ===========================================================================
   ОТКРЫТЫЕ ВОПРОСЫ (развёрнутый ответ + ИИ-проверка) — в тренировке по темам.
   Формат вопроса: { cat, type:"open", q, ref, crit:[...], src }.
   ИИ-оценка идёт на общий бэкенд (LEADERBOARD.scriptUrl, action:"check");
   при недоступности — локальная проверка по ключевым словам эталона.
   =========================================================================== */
function esc(s) { const d = document.createElement("div"); d.textContent = (s == null ? "" : String(s)); return d.innerHTML; }
function backendUrl() { try { return LEADERBOARD.scriptUrl || ""; } catch (e) { return ""; } }
function aiUrl() { return (localStorage.getItem("avsec_ai_url") || backendUrl()).trim(); }
function setupAI() {
  const cur = (localStorage.getItem("avsec_ai_url") || "").trim();
  const v = prompt("URL эндпоинта ИИ-проверки открытых ответов (Apps Script, .../exec).\nПусто — использовать встроенный бэкенд по умолчанию:", cur);
  if (v === null) return;
  const s = v.trim(); if (s) localStorage.setItem("avsec_ai_url", s); else localStorage.removeItem("avsec_ai_url");
  toast(s ? "Свой ИИ-эндпоинт сохранён" : "Будет использован встроенный бэкенд", "ok");
}
function renderOpenQuestion(q) {
  const hasAI = !!aiUrl();
  app.innerHTML = `
    ${topbar(quiz.title)}
    <div class="hud">
      <span>${t("Вопрос")} ${quiz.i + 1}/${quiz.qs.length}</span>
      <span class="lives">${"❤️".repeat(quiz.lives)}${"🖤".repeat(3 - quiz.lives)}</span>
      <span class="streak">🔥 ${quiz.streak}</span>
    </div>
    <div class="qcard">
      <div class="open-badge">✍️ ${hasAI ? t("Развёрнутый ответ · проверка ИИ") : t("Развёрнутый ответ · локальная проверка")}</div>
      <div class="qtext">${q.q}</div>
      <textarea class="open-input" id="openIn" rows="5" placeholder="${t("Введите ответ своими словами…")}"></textarea>
      <button class="next" id="openGo">${t("Проверить ответ")}</button>
      <div class="feedback" id="fb"></div>
    </div>`;
  const ta = $("#openIn"); if (ta) setTimeout(() => ta.focus(), 40);
  $("#openGo").addEventListener("click", () => submitOpenAnswer(q));
}
async function submitOpenAnswer(q) {
  const ta = $("#openIn"), go = $("#openGo");
  if (!ta || ta.disabled) return;
  const answer = (ta.value || "").trim();
  if (answer.length < 3) { ta.focus(); return; }
  ta.disabled = true; go.disabled = true; go.textContent = t("Проверяю…");
  let res;
  try { res = await checkOpen(q, answer); } catch (e) { res = localCheck(q, answer); res._offline = true; }
  const correct = res.score >= 60;
  tgHaptic(correct ? "success" : "error"); beep(correct);
  quiz.log.push({ cat: q.cat || "other", ok: correct });
  recordQuiz(q, correct); markDaily();
  let gain = 0;
  if (correct) {
    quiz.correct++; quiz.streak++; state.totalCorrect++;
    state.streakBest = Math.max(state.streakBest, quiz.streak);
    unlock("first"); if (quiz.streak >= 5) unlock("streak5"); if (quiz.streak >= 10) unlock("streak10");
    gain = 10 + Math.min(quiz.streak, 10); addXP(gain);
  } else { quiz.streak = 0; quiz.lives--; }
  showOpenResult(q, res, gain);
  save();
}
async function checkOpen(q, answer) {
  const url = aiUrl();
  if (!url) return localCheck(q, answer);
  const body = JSON.stringify({ action: "check", subject: "Авиационная безопасность (ИКАО Приложение 17)", q: q.q, ref: q.ref, crit: q.crit || [], answer });
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body });
  if (!r.ok) throw new Error("http " + r.status);
  const d = await r.json();
  if (d && d.error) throw new Error(d.error);
  return { score: Math.max(0, Math.min(100, Math.round(Number(d.score) || 0))), verdict: d.verdict || "", feedback: d.feedback || "", missing: Array.isArray(d.missing) ? d.missing : [], _ai: true };
}
function localCheck(q, answer) {
  const norm = s => (s || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9 ]/g, " ");
  const stop = new Set("и в во не на с со что а то как по из у за от о об для при или это его ее к до же бы был быть есть их они она он мы вы я но да чтобы если так уже еще нет ли бо про над под без через между".split(" "));
  const terms = [...new Set(norm(q.ref).split(/\s+/).filter(w => w.length > 3 && !stop.has(w)))];
  const ans = norm(answer);
  const hit = terms.filter(term => ans.indexOf(term) >= 0);
  const score = terms.length ? Math.round(hit.length / terms.length * 100) : 0;
  return {
    score, verdict: score >= 60 ? "зачтено (локально)" : "сверьте с эталоном",
    feedback: "Локальная проверка по ключевым словам эталона (ИИ недоступен). Сверьте свой ответ с эталоном ниже.",
    missing: terms.filter(term => ans.indexOf(term) < 0).slice(0, 8), _local: true
  };
}
function showOpenResult(q, res, gain) {
  const ok = res.score >= 60, fb = $("#fb");
  let h = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "✅ " + t("Зачтено") : "❌ " + t("Незачтено")} · ${t("оценка")} ${res.score}/100${gain ? " +" + gain + " XP" : ""}</div>`;
  if (res.verdict) h += `<div class="why"><b>${t("Вердикт")}:</b> ${esc(res.verdict)}${res.feedback ? "<br>" + esc(res.feedback) : ""}</div>`;
  else if (res.feedback) h += `<div class="why">${esc(res.feedback)}</div>`;
  if (res.missing && res.missing.length) h += `<div class="why"><b>${t("Стоит добавить")}:</b> ${res.missing.map(esc).join(", ")}</div>`;
  h += `<div class="why"><b>${t("Эталонный ответ")}:</b><br>${esc(q.ref)}</div>`;
  if (q.src) h += `<div class="src">📄 ${q.src}</div>`;
  if (res._local || res._offline) h += `<div class="src">${t("Оценка локальная (без ИИ). Подключить ИИ-проверку — в «Настройках».")}</div>`;
  h += `<button class="next" id="next">${quiz.i + 1 >= quiz.qs.length || quiz.lives <= 0 ? t("Итог →") : t("Дальше →")}</button>`;
  fb.innerHTML = h;
  $("#next").addEventListener("click", () => { quiz.i++; renderQuestion(); });
}

/* ===========================================================================
   АТТЕСТАЦИЯ — проктор-экзамен (замена «Экзамена»): допуск экзаменатора
   (одноразовый код в Telegram), таймер, антисписывание, справка с ФИО,
   журнал прохождений, отчёт экзаменатору. Только закрытые вопросы.
   =========================================================================== */
const ATT = { N: 20, PASS: 0.75, TIME: 15 * 60, PER_Q: 45, HIST_KEY: "avsec_attest_hist", HIST_MAX: 60 };
let att = null, attTimer = null, attQTimer = null;
function attFmt(s) { const m = Math.floor(s / 60), x = s % 60; return m + ":" + String(x).padStart(2, "0"); }
function attCleanup() { attStopTimer(); attStopQ(); document.body.classList.remove("exam-lock"); }
function renderAttest() {
  attCleanup(); tgBack(true);
  att = { name: (att && att.name) || "", unit: (att && att.unit) || "", reqId: null };
  app.innerHTML = `${topbar("Аттестация")}
    <div class="qcard">
      <div class="open-badge">🎓 ${t("Проктор-экзамен · допуск экзаменатора")}</div>
      <p class="qsub">${t("20 вопросов · лимит 15 мин · проходной 75% · справка о прохождении. Старт — после ввода данных и получения кода допуска у экзаменатора.")}</p>
      <input id="attName" class="select" type="text" placeholder="${t("Фамилия, имя, отчество")}" value="${esc(att.name)}">
      <input id="attUnit" class="select" type="text" placeholder="${t("Подразделение / должность")}" value="${esc(att.unit)}">
      <button class="next" id="attReq" disabled>${t("Запросить допуск")}</button>
      <div id="attApprove" class="attapprove" style="display:none">
        <div class="why" id="attMsg"></div>
        <input id="attCode" class="select" type="text" inputmode="numeric" placeholder="${t("Код от экзаменатора")}">
        <button class="next" id="attGo">${t("Начать аттестацию")}</button>
      </div>
    </div>
    <button class="ghost fullrow" onclick="renderAttestLog()">📋 ${t("Журнал аттестаций")}</button>
    <button class="ghost fullrow" onclick="renderHome()">${t("В меню")}</button>`;
  const nm = $("#attName"), un = $("#attUnit"), rq = $("#attReq");
  const val = () => { rq.disabled = !(nm.value.trim() && un.value.trim()); };
  nm.addEventListener("input", val); un.addEventListener("input", val); val();
  rq.addEventListener("click", attestRequest);
  $("#attGo").addEventListener("click", attestVerify);
  $("#attCode").addEventListener("keydown", e => { if (e.key === "Enter") attestVerify(); });
}
async function attestRequest() {
  const nm = $("#attName"), un = $("#attUnit"), rq = $("#attReq");
  att.name = nm.value.trim(); att.unit = un.value.trim();
  if (!att.name || !att.unit) return;
  const lbl = rq.textContent; rq.disabled = true; rq.textContent = t("Отправляю запрос…");
  try {
    const r = await fetch(aiUrl(), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "request", name: att.name, unit: att.unit, subject: "AvSec · Авиационная безопасность", catName: "Аттестация" }) });
    if (!r.ok) throw new Error("http " + r.status);
    const d = await r.json();
    if (!d.ok || !d.reqId) throw new Error(d.error || "нет ответа сервера");
    att.reqId = d.reqId;
    rq.style.display = "none";
    $("#attMsg").innerHTML = `${t("Запрос")} <b>№${esc(d.reqId)}</b> ${t("отправлен экзаменатору")}${d.delivered ? "" : " <span style='color:var(--red)'>(" + t("Telegram не настроен") + ")</span>"}. ${t("Получите код у экзаменатора и введите ниже:")}`;
    $("#attApprove").style.display = "block";
    setTimeout(() => $("#attCode").focus(), 40);
  } catch (e) {
    toast(t("Не удалось запросить код. Проверьте связь."), "warn");
    rq.disabled = false; rq.textContent = lbl;
  }
}
async function attestVerify() {
  const code = $("#attCode").value.trim(); if (!code) return;
  const go = $("#attGo"), lbl = go.textContent; go.disabled = true; go.textContent = t("Проверяю…");
  try {
    const r = await fetch(aiUrl(), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "verify", reqId: att.reqId, code }) });
    if (!r.ok) throw new Error("http " + r.status);
    const d = await r.json();
    if (d.ok) { startAttest(); return; }
    toast(t("Неверный или просроченный код."), "warn");
  } catch (e) { toast(t("Ошибка проверки кода."), "warn"); }
  $("#attCode").value = ""; go.disabled = false; go.textContent = lbl; $("#attCode").focus();
}
function startAttest() {
  const pool = shuffle(closedPool(rolePool()));   // вопросы по аудитории (роли)
  const list = pool.slice(0, Math.min(ATT.N, pool.length));
  if (!list.length) { toast("Нет вопросов для аттестации"); return; }
  tgBack(false);
  att.list = list; att.i = 0; att.correct = 0; att.wrong = []; att.switches = 0; att.finished = false;
  att.startTs = Date.now(); att.timeLeft = ATT.TIME; att.answered = false;
  document.body.classList.add("exam-lock");
  attStartTimer(); attRenderQ();
}
function attStartTimer() { attStopTimer(); attUpdTimer(); attTimer = setInterval(() => { att.timeLeft--; attUpdTimer(); if (att.timeLeft <= 0) { attStopTimer(); attFinish(true); } }, 1000); }
function attStopTimer() { if (attTimer) { clearInterval(attTimer); attTimer = null; } }
function attUpdTimer() { const e = $("#attClock"); if (e) { e.textContent = "⏱ " + attFmt(Math.max(0, att.timeLeft)); e.classList.toggle("low", att.timeLeft <= 60); } }
function attStartQ() { attStopQ(); att.qLeft = ATT.PER_Q; attUpdQ(); attQTimer = setInterval(() => { att.qLeft--; attUpdQ(); if (att.qLeft <= 0) { attStopQ(); attAutoAdvance(); } }, 1000); }
function attStopQ() { if (attQTimer) { clearInterval(attQTimer); attQTimer = null; } }
function attUpdQ() { const e = $("#attQtime"); if (e) { e.textContent = "⏳ " + Math.max(0, att.qLeft) + " c"; e.classList.toggle("low", att.qLeft <= 10); } }
function attAutoAdvance() {
  if (!att.answered) { att.answered = true; const q = att.list[att.i], lq = locQ(q); att.wrong.push({ q: lq.q, your: "(не отвечено — время вышло)", right: lq.a[q.correct], why: lq.why || "" }); }
  attNext();
}
function attActive() { return att && !att.finished && !!$("#attQtime"); }
function attRenderQ() {
  const q = att.list[att.i]; att.answered = false;
  const lq = locQ(q);
  const shown = shuffle(lq.a.map((tx, idx) => ({ tx, idx })));
  app.innerHTML = `
    <div class="topbar"><span class="ttitle">${t("Аттестация")}</span><span class="attclock" id="attClock"></span></div>
    <div class="hud">
      <span>${t("Вопрос")} ${att.i + 1}/${att.list.length}</span>
      <span class="attqtime" id="attQtime"></span>
      <span class="attsw" id="attSw"></span>
    </div>
    <div class="qcard">
      <div class="qtext">${lq.q}</div>
      <div class="opts">${shown.map(o => `<button class="opt" data-i="${o.idx}">${o.tx}</button>`).join("")}</div>
      <div class="feedback" id="fb"></div>
    </div>`;
  $$(".opt").forEach(b => b.addEventListener("click", () => attAnswer(parseInt(b.dataset.i), b)));
  attUpdTimer(); attUpdSwitch(); attStartQ();
}
function attUpdSwitch() { const e = $("#attSw"); if (e) e.textContent = att.switches > 0 ? ("⚠ " + t("уходов") + ": " + att.switches) : ""; }
function attAnswer(chosen, btn) {
  if (att.answered) return; att.answered = true; attStopQ();
  const q = att.list[att.i], lq = locQ(q), ok = chosen === q.correct;
  if (ok) att.correct++; else att.wrong.push({ q: lq.q, your: lq.a[chosen], right: lq.a[q.correct], why: lq.why || "" });
  $$(".opt").forEach(b => { const i = parseInt(b.dataset.i); b.disabled = true; if (i === q.correct) b.classList.add("right"); else if (b === btn) b.classList.add("wrong"); });
  tgHaptic(ok ? "success" : "error"); beep(ok);
  $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "✅ " + t("Верно") : "❌ " + t("Неверно")}</div>` +
    `<button class="next" id="next">${att.i + 1 >= att.list.length ? t("Завершить") : t("Дальше →")}</button>`;
  $("#next").addEventListener("click", attNext);
}
function attNext() { if (att.i < att.list.length - 1) { att.i++; attRenderQ(); window.scrollTo({ top: 0, behavior: "smooth" }); } else attFinish(false); }
function attFinish(timeout) {
  if (!att || att.finished) return; att.finished = true; attCleanup(); tgBack(true);
  att.elapsed = Math.round((Date.now() - att.startTs) / 1000);
  const total = att.list.length, ok = att.correct, pct = Math.round(ok / total * 100), pass = pct >= ATT.PASS * 100;
  const now = new Date(), pad = n => String(n).padStart(2, "0");
  const ds = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  attSaveHist({ d: now.toISOString(), name: att.name, unit: att.unit, pct, ok, total, sec: att.elapsed, pass, sw: att.switches });
  attReport(pct, ok, total, pass);
  const vc = pass ? "ok" : "no";
  app.innerHTML = `${topbar("Аттестация")}
    <div class="result">
      <div class="bigpct ${vc}">${pct}%</div>
      <div class="verdict ${vc}">${pass ? t("Аттестация пройдена") : t("Аттестация не пройдена")}</div>
      <div class="rstats">${timeout ? t("Время вышло") + ". " : ""}${t("Правильно")} ${ok} ${t("из")} ${total} · ${t("время")} ${attFmt(att.elapsed)}${att.switches > 0 ? " · ⚠ " + t("уходов") + " " + att.switches : ""}</div>
    </div>
    <div class="cert-wrap" style="margin-top:14px"><div class="cert-card">
      <div class="cert-emblem">🛡️</div>
      <div class="cert-kicker">СПРАВКА О ПРОХОЖДЕНИИ</div>
      <h1 class="cert-title">AvSec — Аттестация по авиабезопасности</h1>
      <div class="cert-subtitle">ICAO Приложение 17 · Doc 8973 · НППБ РТ</div>
      <div class="cert-divider"></div>
      <div class="cert-rank"><div class="cert-rank-name">${esc(att.name)}</div><div class="cert-rank-sub">${esc(att.unit)}</div></div>
      <div class="cert-stats">
        <div class="cert-stat"><div class="cert-stat-val">${pct}%</div><div class="cert-stat-lbl">результат</div></div>
        <div class="cert-stat"><div class="cert-stat-val">${ok}/${total}</div><div class="cert-stat-lbl">верных</div></div>
        <div class="cert-stat"><div class="cert-stat-val" style="color:${pass ? "var(--green)" : "var(--red)"}">${pass ? "СДАН" : "НЕ СДАН"}</div><div class="cert-stat-lbl">статус</div></div>
      </div>
      <div class="cert-footer"><div class="cert-date">${ds}</div><div class="cert-sign">${att.reqId ? "№" + esc(att.reqId) : "AvSec"}</div></div>
    </div></div>
    <div class="row2" style="margin-top:14px">
      <button class="primary" onclick="window.print()">🖨 ${t("Печать / PDF")}</button>
      <button class="ghost" onclick="renderAttest()">↻ ${t("Ещё раз")}</button>
    </div>
    ${attReview()}
    <button class="ghost fullrow" onclick="renderHome()">${t("В меню")}</button>`;
  if (pass) confetti();
}
function attReview() {
  if (!att.wrong.length) return `<div class="chresult" style="margin-top:14px"><b>${t("Ошибок нет")}</b> — ${t("отличная работа!")}</div>`;
  let h = `<div class="breakdown" style="margin-top:16px"><div class="brtitle">${t("Разбор ошибок")} (${att.wrong.length})</div>`;
  att.wrong.forEach(w => { h += `<div class="qcard" style="margin-bottom:8px"><div class="qtext" style="font-size:14px">${esc(w.q)}</div><div class="why">${t("Ваш ответ")}: ${esc(w.your)}<br>${t("Верно")}: <b>${esc(w.right)}</b>${w.why ? "<br>" + esc(w.why) : ""}</div></div>`; });
  return h + `</div>`;
}
function attReport(pct, ok, total, pass) {
  try {
    fetch(aiUrl(), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "report", reqId: att.reqId, name: att.name, unit: att.unit, subject: "AvSec · Авиационная безопасность", catName: "Аттестация", pct, ok, total, pass, switches: att.switches, sec: att.elapsed }) });
  } catch (e) {}
}
function attLoadHist() { try { return JSON.parse(localStorage.getItem(ATT.HIST_KEY) || "[]"); } catch (e) { return []; } }
function attSaveHist(rec) { const h = attLoadHist(); h.unshift(rec); if (h.length > ATT.HIST_MAX) h.length = ATT.HIST_MAX; try { localStorage.setItem(ATT.HIST_KEY, JSON.stringify(h)); } catch (e) {} }
function renderAttestLog() {
  const h = attLoadHist();
  const rows = h.length ? h.map(r => {
    const d = new Date(r.d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
    return `<div class="lbrow"><span class="lbpos">${r.pass ? "✅" : "❌"}</span><span class="lbname">${esc(r.name)}<small class="lborg">${esc(r.unit)} · ${d}${r.sw > 0 ? " · ⚠" + r.sw : ""}</small></span><span class="lbscore">${r.pct}%</span></div>`;
  }).join("") : `<div class="qsub">${t("Записей пока нет. Пройдите аттестацию — результат сохранится здесь.")}</div>`;
  app.innerHTML = `${topbar("Журнал аттестаций")}<div class="qcard">${rows}</div>
    ${h.length ? `<button class="ghost danger fullrow" onclick="if(confirm('Очистить журнал аттестаций на этом устройстве?')){localStorage.removeItem('${ATT.HIST_KEY}');renderAttestLog();}">${t("Очистить журнал")}</button>` : ""}
    <button class="ghost fullrow" onclick="renderAttest()">${t("‹ Аттестация")}</button>`;
}
/* Антисписывание — активно только во время аттестации (body.exam-lock). */
function attOnVisibility() {
  if (document.hidden) { if (attActive()) { att.switches = (att.switches || 0) + 1; attUpdSwitch(); } }
  else if (attActive() && att.switches > 0) { toast("⚠️ " + t("Зафиксирован выход из аттестации") + " (" + att.switches + ")", "warn"); }
}
function attBlock(e) { if (document.body.classList.contains("exam-lock")) { e.preventDefault(); return false; } }
document.addEventListener("visibilitychange", attOnVisibility);
["copy", "cut", "contextmenu", "selectstart", "dragstart"].forEach(ev => document.addEventListener(ev, attBlock));

/* ---------- Ачивки / Статистика ---------- */
function renderAch() {
  app.innerHTML = `${topbar("Ачивки")}<div class="achlist">${DATA.achievements.map(a => {
    const got = state.achievements[a.id];
    return `<div class="achitem ${got ? "got" : "locked"}"><span class="achicon">${got ? a.icon : "🔒"}</span><span class="achinfo"><b>${a.name}</b><small>${a.desc}</small></span></div>`;
  }).join("")}</div><button class="ghost fullrow" onclick="renderHome()">В меню</button>`;
}
function renderStats() {
  const cats = Object.keys(state.catStats);
  const rows = cats.length ? cats.map(c => {
    const s = state.catStats[c], p = s.total ? Math.round(s.correct / s.total * 100) : 0;
    return `<div class="brrow"><span class="brname">${CAT_NAMES[c] || c}</span><span class="brbar"><span class="brfill ${p >= 70 ? "ok" : "no"}" style="width:${p}%"></span></span><span class="brval">${s.correct}/${s.total}</span></div>`;
  }).join("") : `<div class="qsub">Пока нет данных — пройдите несколько вопросов.</div>`;
  app.innerHTML = `${topbar("Статистика")}
    <div class="qcard">
      <div class="row2" style="margin-bottom:14px">
        <div class="bigstat"><b>${state.xp}</b><span>XP всего</span></div>
        <div class="bigstat"><b>${state.totalCorrect}</b><span>верных ответов</span></div>
      </div>
      <div class="breakdown">${rows}</div>
    </div><button class="ghost fullrow" onclick="renderHome()">В меню</button>`;
}

/* ---------- Лидерборд (Google Apps Script — публичный URL, не секрет) ---------- */
const LEADERBOARD = { scriptUrl: "https://script.google.com/macros/s/AKfycbzzPC5DZm_c36DIjrT5yaxhlEgheqq8U-KO_fgNhskpJ27h6a5j-9mfaqR9xIbHsLnIYw/exec" };
let lbMode = "players";

/* ---------- Аналитика использования (GoatCounter — бесплатно, без cookies) ----------
   Считает: визиты (просмотры) + события внутри игры (какие модули открывают, прохождения).
   Подключение: зарегистрируй бесплатный код на https://www.goatcounter.com/ (например "avsec",
   адрес будет https://avsec.goatcounter.com), и впиши его сюда. Пусто = аналитика выключена. */
const ANALYTICS = { goatcounter: "avsec" };
function plat() { return (typeof inTelegram !== "undefined" && inTelegram) ? "tg" : "web"; }
function initAnalytics() {
  if (!ANALYTICS.goatcounter || window.goatcounter) return;
  window.goatcounter = { no_onload: true };      // просмотр шлём сами — с меткой платформы (tg/web)
  const s = document.createElement("script");
  s.async = true; s.src = "//gc.zgo.at/count.js";
  s.setAttribute("data-goatcounter", "https://" + ANALYTICS.goatcounter + ".goatcounter.com/count");
  s.onload = function () { try { goatcounter.count({ path: plat() + "/visit", title: "visit-" + plat() }); } catch (e) {} };
  document.head.appendChild(s);
}
function track(path) {                            // событие внутри игры (не просмотр страницы), с меткой платформы
  try { if (window.goatcounter && goatcounter.count) goatcounter.count({ path: plat() + "/" + String(path), event: true }); } catch (e) {}
}
function trackSource() {                          // откуда пришёл: по приглашению (startapp=inv) и т.п.
  try {
    var sp = inTelegram && TG.initDataUnsafe && TG.initDataUnsafe.start_param;
    if (!sp) return;
    var src = String(sp).replace(/[^a-z0-9_-]/gi, "").slice(0, 24);
    if (src) track("src/" + src);
  } catch (e) {}
}

function lbReady() { return !!LEADERBOARD.scriptUrl; }
function lbName() {
  try { if (inTelegram && TG.initDataUnsafe && TG.initDataUnsafe.user) { const u = TG.initDataUnsafe.user; return ((u.first_name || "") + (u.last_name ? " " + u.last_name : "")) || u.username || "TG"; } } catch (e) {}
  return "Гость";
}
function lbSubmitName() { const n = lbName(); return state.org ? (n + " ▪ " + state.org).slice(0, 48) : n; }
function setLbMode(m) { lbMode = m; renderLeaderboard(); }
function renderLeaderboard() {
  if (!lbReady()) {
    app.innerHTML = `${topbar("Лидерборд")}
      <div class="qcard"><div class="qtext">🏆 Общий лидерборд ещё не подключён.</div>
      <div class="why">Нужен бесплатный «бэкенд» — Google Таблица + Apps Script Web App (код в <b>backend/leaderboard.gs</b>). Создаёте Таблицу → вставляете скрипт → Deploy as Web app (Anyone) → вписываете URL в <b>LEADERBOARD.scriptUrl</b>. URL публичный, не секрет.</div>
      <button class="next" onclick="renderHome()">В меню</button></div>`;
    return;
  }
  app.innerHTML = `${topbar("Лидерборд")}<div class="qcard"><div class="qsub">Загрузка…</div></div>`;
  fetch(LEADERBOARD.scriptUrl + "?action=top").then(r => r.json()).then(rows => {
    rows = (Array.isArray(rows) ? rows : []).map(x => { const p = String(x.username || "—").split(" ▪ "); return { name: p[0].replace(/</g, ""), org: (p[1] || "").replace(/</g, ""), score: +x.score || 0 }; });
    const toggle = `<div class="lbtoggle"><button class="lbtab ${lbMode === "players" ? "on" : ""}" onclick="setLbMode('players')">👤 Игроки</button><button class="lbtab ${lbMode === "teams" ? "on" : ""}" onclick="setLbMode('teams')">👥 Команды</button></div>`;
    let list;
    if (lbMode === "teams") {
      const teams = {}; rows.forEach(r => { if (!r.org) return; if (!teams[r.org] || r.score > teams[r.org]) teams[r.org] = r.score; });
      const arr = Object.keys(teams).map(o => ({ org: o, score: teams[o] })).sort((a, b) => b.score - a.score).slice(0, 30);
      list = arr.map((x, i) => `<div class="lbrow"><span class="lbpos">${i + 1}</span><span class="lbname">${x.org}</span><span class="lbscore">${x.score} XP</span></div>`).join("") || `<div class="qsub">Пока нет команд. Укажите аэропорт/организацию в «Настройках».</div>`;
    } else {
      list = rows.sort((a, b) => b.score - a.score).slice(0, 30).map((x, i) => `<div class="lbrow"><span class="lbpos">${i + 1}</span><span class="lbname">${x.name}${x.org ? `<small class="lborg">${x.org}</small>` : ""}</span><span class="lbscore">${x.score} XP</span></div>`).join("") || `<div class="qsub">Пока пусто — будьте первым!</div>`;
    }
    app.innerHTML = `${topbar("Лидерборд")}${toggle}<div class="qcard"><div class="qsub">Топ-30</div>${list}</div>
      <button class="next" onclick="submitScore()">📤 Отправить мой результат (${state.xp} XP)</button>
      <button class="ghost fullrow" onclick="renderHome()">В меню</button>`;
  }).catch(() => { app.innerHTML = `${topbar("Лидерборд")}<div class="qcard"><div class="qtext">Не удалось загрузить лидерборд.</div><button class="next" onclick="renderHome()">В меню</button></div>`; });
}
function submitScore() {
  if (!lbReady()) return;
  fetch(LEADERBOARD.scriptUrl, { method: "POST", body: JSON.stringify({ name: lbSubmitName(), score: state.xp }) })
    .then(r => r.json()).then(() => { toast("Результат отправлен 🏆"); renderLeaderboard(); }).catch(() => toast("Не удалось отправить"));
}

/* ---------- Поделиться приложением с коллегой ---------- */
const APP_LINK = "https://bsheraliev.github.io/avsec/";
const BOT_LINK = "https://t.me/AvSecApp_bot";
function shareApp() {
  track("share/invite");
  const text = "AvSec — тренажёр по авиационной безопасности 🛡️ Проверь свои знания: " + BOT_LINK;
  if (inTelegram) { try { TG.openTelegramLink("https://t.me/share/url?url=" + encodeURIComponent(BOT_LINK + "?startapp=inv") + "&text=" + encodeURIComponent("AvSec — тренажёр по авиационной безопасности 🛡️ Проверь свои знания!")); return; } catch (e) {} }
  if (navigator.share) { navigator.share({ title: "AvSec", text: "AvSec — тренажёр по авиационной безопасности 🛡️", url: APP_LINK }).catch(() => {}); return; }
  if (navigator.clipboard) { navigator.clipboard.writeText(APP_LINK).then(() => toast("Ссылка скопирована")).catch(() => toast("Ссылка: " + APP_LINK)); }
  else toast("Ссылка: " + APP_LINK);
}

/* ===========================================================================
   ВИДЕОУРОКИ — самовоспроизводящиеся анимированные ролики по процессам
   =========================================================================== */
const LESSONS = [
  { icon: "🧳", title: "Подозрительный предмет", cat: "suspicious", voiced: true, scenes: [
    { e: "⚠️", role: "amber", step: "Ситуация", cap: "Обнаружен бесхозный предмет", why: "Сумка или пакет без владельца рядом с людьми." },
    { e: "✋", role: "red", step: "Шаг 1 из 4", cap: "Не трогать и не перемещать", why: "Не открывайте, не сдвигайте и не накрывайте предмет." },
    { e: "↔️", role: "amber", step: "Шаг 2 из 4", cap: "Отвести людей и оградить зону", why: "Уведите людей на безопасное расстояние." },
    { e: "📵", role: "amber", step: "Шаг 3 из 4", cap: "Не пользоваться связью рядом", why: "Сигнал рации или телефона может сработать как детонатор." },
    { e: "🛡️", role: "green", step: "Шаг 4 из 4", cap: "Сообщить службе безопасности", why: "Сообщите о находке и действуйте по их указаниям." }
  ]},
  { icon: "🚪", title: "Проход «хвостом»", cat: "access", scenes: [
    { e: "👀", role: "amber", step: "Ситуация", cap: "Кто-то идёт следом к служебной двери", why: "Незнакомец пытается пройти «на хвосте» за вами." },
    { e: "🪪", role: "blue", step: "Правило", cap: "Один проход — один пропуск", why: "Каждый проходит по своему действующему пропуску." },
    { e: "✋", role: "red", step: "Шаг 1 из 3", cap: "Не пропускать следом за собой", why: "Вежливо, но твёрдо не давайте пройти без пропуска." },
    { e: "🔒", role: "amber", step: "Шаг 2 из 3", cap: "Убедиться, что дверь закрылась", why: "Не оставляйте дверь открытой или подпёртой." },
    { e: "📞", role: "green", step: "Шаг 3 из 3", cap: "Сообщить о попытке прохода", why: "Сообщите службе безопасности о постороннем." }
  ]},
  { icon: "🚨", title: "Тревога и эвакуация", cat: "response", scenes: [
    { e: "🔔", role: "red", step: "Сигнал", cap: "Объявлена тревога или эвакуация", why: "Звучит сигнал или поступила команда покинуть здание." },
    { e: "🧭", role: "amber", step: "Шаг 1 из 4", cap: "Спокойно идти к выходу по указателям", why: "Без паники, по ближайшему безопасному маршруту." },
    { e: "🎒", role: "red", step: "Шаг 2 из 4", cap: "Не возвращаться за вещами", why: "Личные вещи не стоят риска для жизни." },
    { e: "🤝", role: "blue", step: "Шаг 3 из 4", cap: "Помочь тем, кому трудно", why: "Подскажите дорогу, поддержите растерявшихся." },
    { e: "🧯", role: "green", step: "Шаг 4 из 4", cap: "Выполнять команды служб", why: "Слушайте указания службы безопасности и персонала." }
  ]},
  { icon: "🕵️", title: "Подозрительная просьба", cat: "insider", scenes: [
    { e: "🗣️", role: "amber", step: "Ситуация", cap: "Просят пронести предмет или дать пропуск", why: "Даже знакомый или «начальник» может быть прикрытием." },
    { e: "🚫", role: "red", step: "Шаг 1 из 3", cap: "Не выполнять подозрительную просьбу", why: "Не проносите вещи и не передавайте пропуск." },
    { e: "💬", role: "amber", step: "Шаг 2 из 3", cap: "Не поддаваться на давление и уговоры", why: "Обещание денег или срочность — повод насторожиться." },
    { e: "📞", role: "green", step: "Шаг 3 из 3", cap: "Сообщить о просьбе", why: "Расскажите о случившемся службе безопасности." }
  ]},
  { icon: "🛂", title: "Досмотр персонала", cat: "screening", scenes: [
    { e: "🛂", role: "blue", step: "Правило", cap: "Досмотр проходят все, включая персонал", why: "Служебный вход в стерильную зону — через досмотр." },
    { e: "🚫", role: "red", step: "Шаг 1 из 3", cap: "Не проносить запрещённые предметы", why: "Правила одинаковы для сотрудников и пассажиров." },
    { e: "🙅", role: "amber", step: "Шаг 2 из 3", cap: "Не помогать обойти досмотр", why: "Нельзя проносить вещи для других «в обход»." },
    { e: "✅", role: "green", step: "Шаг 3 из 3", cap: "Проходить спокойно и по правилам", why: "Выполняйте требования сотрудника досмотра." }
  ]},
  { icon: "🛫", title: "Доступ на перрон", cat: "access", scenes: [
    { e: "🦺", role: "blue", step: "Правило", cap: "На перрон — только в жилете и с пропуском", why: "Светоотражающий жилет и бейдж на видном месте." },
    { e: "🚗", role: "amber", step: "Шаг 1 из 3", cap: "Спецтранспорт — только с допуском", why: "Не пропускайте машины без пропуска на перрон." },
    { e: "👀", role: "red", step: "Шаг 2 из 3", cap: "Заметили постороннего у самолёта", why: "Человек без жилета и пропуска рядом с воздушным судном." },
    { e: "📞", role: "green", step: "Шаг 3 из 3", cap: "Не подходить, сообщить охране", why: "Держитесь на расстоянии и вызовите службу безопасности." }
  ]},
  { icon: "📦", title: "Груз и багаж", cat: "service", scenes: [
    { e: "📦", role: "blue", step: "Правило", cap: "Груз — по документам и через досмотр", why: "Принимайте груз только с документами и проверкой." },
    { e: "🧳", role: "red", step: "Шаг 1 из 3", cap: "Бесхозное место багажа", why: "Не вскрывать и не перемещать — сразу сообщить." },
    { e: "🔁", role: "amber", step: "Шаг 2 из 3", cap: "Защитить досмотренный багаж от подмены", why: "Никто посторонний не должен подходить к багажу." },
    { e: "📞", role: "green", step: "Шаг 3 из 3", cap: "Подозрительный груз — доложить", why: "Странный запах, протечка или нет документов — сообщите." }
  ]},
  { icon: "🖥️", title: "Кибергигиена", cat: "cyber", scenes: [
    { e: "🔑", role: "blue", step: "Правило", cap: "Надёжный пароль и не передавать его", why: "Длинный пароль, нигде не записан, известен только вам." },
    { e: "🎣", role: "red", step: "Шаг 1 из 3", cap: "Не открывать подозрительные письма", why: "Не переходите по ссылкам и вложениям от незнакомцев." },
    { e: "🔌", role: "amber", step: "Шаг 2 из 3", cap: "Не вставлять чужие USB-носители", why: "Найденная флешка может заразить рабочую систему." },
    { e: "🔒", role: "green", step: "Шаг 3 из 3", cap: "Блокировать компьютер, отходя", why: "И сообщать об инцидентах в ИТ или службу безопасности." }
  ]}
];
function renderLessons() {
  app.innerHTML = `${topbar("Видеоуроки")}
    <div class="lesslist">${LESSONS.map((l, idx) => `<button class="lesscard" onclick="renderLesson(${idx})"><span class="lessico">${l.icon}</span><span class="lessmeta"><b>${t(l.title)}</b><small>${l.scenes.length} ${t("сцен · видеоурок")}</small></span><span class="lessplay">▶</span></button>`).join("")}</div>
    <button class="ghost fullrow" onclick="renderHome()">${t("В меню")}</button>`;
}
let lessonTimer = null, lessonIdx = 0, lessonOn = true, lessonId = 0;
function renderLesson(id) {
  lessonId = id; lessonIdx = 0; lessonOn = true;
  const L = LESSONS[id];
  app.innerHTML = `${topbar(L.title)}
    <div class="lstage">
      <div class="ltag">📺 ${t("Видеоурок")}</div>
      <div class="lbody" id="lbody"></div>
      <div class="ldots" id="ldots">${L.scenes.map(() => `<span class="ldot"></span>`).join("")}</div>
      <div class="lprog"><div class="lbar" id="lbar"></div></div>
    </div>
    <div class="lctrls">
      <button class="ghost" id="lpp" onclick="lessonToggle()">⏸ ${t("Пауза")}</button>
      <button class="ghost" onclick="lessonRestart()">↻ ${t("Сначала")}</button>
      <button class="ghost" id="lvoice" onclick="lessonVoiceToggle()">${state.voiceOn ? "🔊" : "🔇"} ${t("Голос")}</button>
    </div>
    <button class="next" onclick="route('quiz-${L.cat}')">📝 ${t("Пройти тест по теме")}</button>
    <button class="ghost fullrow" onclick="renderLessons()">${t("‹ Видеоуроки")}</button>`;
  lessonRender(); lessonStart();
}
let _lessonAudio = null;
function lessonRender() {
  const L = LESSONS[lessonId], s = L.scenes[lessonIdx], body = $("#lbody");
  if (!body) { if (lessonTimer) { clearInterval(lessonTimer); lessonTimer = null; } lessonStopSpeak(); return; }
  body.innerHTML = `<div class="lico role-${s.role}">${s.e}</div><div class="lstep">${t(s.step)}</div><div class="lcap">${t(s.cap)}</div><div class="lwhy">${t(s.why)}</div>`;
  $$(".ldot").forEach((d, k) => { d.className = "ldot" + (k <= lessonIdx ? " on" : ""); });
  const bar = $("#lbar"); if (bar) bar.style.width = Math.round((lessonIdx + 1) / L.scenes.length * 100) + "%";
  if (lessonVoiced()) lessonPlayClip(lessonId, lessonIdx);
  else lessonSpeak(t(s.cap) + ". " + t(s.why));
}
/* Урок с записанным голосом — только если voiced, звук вкл, язык рус и есть Audio */
function lessonVoiced() { return !!(LESSONS[lessonId] && LESSONS[lessonId].voiced && state.voiceOn && state.lang === "ru" && ("Audio" in window)); }
function lessonPlayClip(id, idx) {
  lessonStopSpeak();
  const s = LESSONS[id].scenes[idx];
  const fb = () => { lessonSpeak(t(s.cap) + ". " + t(s.why)); setTimeout(() => { if (lessonOn && $("#lbody") && lessonIdx === idx) lessonStep(); }, 5000); };
  try {
    const a = new Audio("./audio/lesson-" + id + "-" + idx + ".mp3");
    _lessonAudio = a;
    a.onended = () => { if (lessonOn && _lessonAudio === a && $("#lbody")) lessonStep(); };
    a.onerror = fb;
    a.play().catch(fb);
  } catch (e) { fb(); }
}
function lessonSpeak(text) {
  if (!state.voiceOn || !("speechSynthesis" in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = state.lang === "en" ? "en-US" : "ru-RU"; u.rate = 0.98; speechSynthesis.speak(u); } catch (e) {}
}
function lessonStopSpeak() {
  try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (e) {}
  try { if (_lessonAudio) { _lessonAudio.onended = null; _lessonAudio.pause(); _lessonAudio = null; } } catch (e) {}
}
function lessonVoiceToggle() {
  state.voiceOn = !state.voiceOn; save();
  const b = $("#lvoice"); if (b) b.innerHTML = (state.voiceOn ? "🔊 " : "🔇 ") + t("Голос");
  if (!state.voiceOn) lessonStopSpeak();
  else if (lessonVoiced()) lessonPlayClip(lessonId, lessonIdx);
  else { const s = LESSONS[lessonId].scenes[lessonIdx]; lessonSpeak(t(s.cap) + ". " + t(s.why)); }
}
function lessonStep() {
  if (!$("#lbody")) { if (lessonTimer) { clearInterval(lessonTimer); lessonTimer = null; } lessonStopSpeak(); return; }
  const L = LESSONS[lessonId];
  if (lessonIdx < L.scenes.length - 1) { lessonIdx++; lessonRender(); } else lessonStop(true);
}
function lessonStart() {
  lessonOn = true; const b = $("#lpp"); if (b) b.innerHTML = "⏸ " + t("Пауза");
  if (lessonTimer) { clearInterval(lessonTimer); lessonTimer = null; }
  if (!lessonVoiced()) lessonTimer = setInterval(lessonStep, 3800);
}
function lessonStop(end) { lessonOn = false; if (lessonTimer) { clearInterval(lessonTimer); lessonTimer = null; } lessonStopSpeak(); const b = $("#lpp"); if (b) b.innerHTML = "▶ " + (end ? t("Повтор") : t("Дальше →")); }
function lessonToggle() {
  if (lessonOn) { lessonStop(false); return; }
  lessonOn = true; const b = $("#lpp"); if (b) b.innerHTML = "⏸ " + t("Пауза");
  const L = LESSONS[lessonId];
  if (lessonIdx >= L.scenes.length - 1) { lessonIdx = 0; lessonRender(); lessonStart(); return; }
  if (lessonVoiced()) lessonPlayClip(lessonId, lessonIdx);
  else { const s = L.scenes[lessonIdx]; lessonSpeak(t(s.cap) + ". " + t(s.why)); if (lessonTimer) clearInterval(lessonTimer); lessonTimer = setInterval(lessonStep, 3800); }
}
function lessonRestart() { lessonOn = true; if (lessonTimer) { clearInterval(lessonTimer); lessonTimer = null; } lessonStopSpeak(); lessonIdx = 0; lessonRender(); lessonStart(); }

/* ---------- Шаринг результатом-картинкой ---------- */
function makeShareCanvas(pct, correct, total) {
  const S = 1080, c = document.createElement("canvas"); c.width = S; c.height = S;
  const ctx = c.getContext("2d"), cx = S / 2;
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const bg = ctx.createLinearGradient(0, 0, S, S); bg.addColorStop(0, "#06121a"); bg.addColorStop(.5, "#0b1f2a"); bg.addColorStop(1, "#0e2632"); ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
  const p = 56; ctx.lineWidth = 3; ctx.strokeStyle = "#27e0a0"; rr(p, p, S - p * 2, S - p * 2, 40); ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#46c2ff"; ctx.font = "120px 'Segoe UI Emoji', system-ui, sans-serif"; ctx.fillText("🛡️", cx, 250);
  ctx.fillStyle = "#e8f4f8"; ctx.font = "800 64px system-ui, sans-serif"; ctx.fillText("AvSec", cx, 330);
  ctx.fillStyle = "#8fb3c2"; ctx.font = "28px system-ui, sans-serif"; ctx.fillText("Авиационная безопасность · ICAO Прил.17", cx, 375);
  ctx.fillStyle = pct >= 70 ? "#27e0a0" : "#ffc14d"; ctx.font = "800 220px system-ui, sans-serif"; ctx.fillText(pct + "%", cx, 620);
  ctx.fillStyle = "#e8f4f8"; ctx.font = "600 40px system-ui, sans-serif"; ctx.fillText("Правильно " + correct + " из " + total, cx, 695);
  ctx.fillStyle = "#27e0a0"; ctx.font = "700 38px system-ui, sans-serif"; ctx.fillText(rankFor(state.xp).name, cx, 820);
  ctx.fillStyle = "#8fb3c2"; ctx.font = "30px system-ui, sans-serif"; ctx.fillText("Тренажёр по авиабезопасности", cx, 975);
  return c;
}
async function shareResult(pct, correct, total) {
  const c = makeShareCanvas(pct, correct, total);
  const txt = "Мой результат в AvSec — тренажёре по авиационной безопасности 🛡️ " + pct + "%";
  try {
    if (navigator.canShare) {
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      const file = new File([blob], "AvSec-result.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: txt }); return; }
    }
  } catch (e) {}
  try { const a = document.createElement("a"); a.download = "AvSec-result.png"; a.href = c.toDataURL("image/png"); document.body.appendChild(a); a.click(); document.body.removeChild(a); toast("Картинка сохранена"); } catch (e) {}
}
function confetti() {
  try {
    const colors = ["#27e0a0", "#46c2ff", "#ffc14d", "#ff6b6b", "#e8f4f8"];
    const wrap = document.createElement("div"); wrap.className = "confetti";
    for (let i = 0; i < 30; i++) { const s = document.createElement("i"); s.style.left = (Math.random() * 100) + "vw"; s.style.background = colors[i % colors.length]; s.style.animationDelay = (Math.random() * 0.35) + "s"; s.style.animationDuration = (1.6 + Math.random() * 0.9) + "s"; wrap.appendChild(s); }
    document.body.appendChild(wrap); setTimeout(() => wrap.remove(), 2600);
  } catch (e) {}
}

/* ---------- Сертификат ---------- */
function renderCertificate() {
  const rank = rankFor(state.xp), xp = state.xp || 0, correct = state.totalCorrect || 0, streak = (state.daily && state.daily.streak) || 0;
  const d = new Date(), pad = n => String(n).padStart(2, "0");
  const dateStr = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  app.innerHTML = `${topbar("Сертификат")}
    <div class="cert-wrap"><div class="cert-card">
      <div class="cert-emblem">🛡️</div>
      <div class="cert-kicker">CERTIFICATE OF COMPLETION</div>
      <h1 class="cert-title">AvSec — Авиационная безопасность</h1>
      <div class="cert-subtitle">Тренажёр по АБ · ICAO Приложение 17 / Doc 8973 / НППБ РТ</div>
      <div class="cert-divider"></div>
      <div class="cert-rank"><div class="cert-rank-name">${rank.name}</div><div class="cert-rank-sub">${rank.sub || "уровень"}</div></div>
      <div class="cert-stats">
        <div class="cert-stat"><div class="cert-stat-val">${xp}</div><div class="cert-stat-lbl">XP</div></div>
        <div class="cert-stat"><div class="cert-stat-val">${correct}</div><div class="cert-stat-lbl">верных ответов</div></div>
        <div class="cert-stat"><div class="cert-stat-val">${streak}</div><div class="cert-stat-lbl">дней подряд</div></div>
      </div>
      <div class="cert-footer"><div class="cert-date">${dateStr}</div><div class="cert-sign">AvSec PWA</div></div>
    </div>
    <div class="cert-actions">
      <button class="cert-btn cert-btn-primary" id="certDownloadBtn">⬇ Скачать PNG</button>
      <button class="cert-btn cert-btn-ghost" onclick="renderHome()">В меню</button>
    </div></div>`;
  const btn = $("#certDownloadBtn");
  if (btn) btn.onclick = function () {
    const W = 1000, H = 700, c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d");
    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#06121a"); bg.addColorStop(1, "#0e2632"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const p = 40; rr(p, p, W - p * 2, H - p * 2, 28); ctx.fillStyle = "#0b1f2a"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#27e0a0"; rr(p, p, W - p * 2, H - p * 2, 28); ctx.stroke();
    ctx.textAlign = "center"; const cx = W / 2;
    ctx.fillStyle = "#46c2ff"; ctx.font = "76px 'Segoe UI Emoji', system-ui, sans-serif"; ctx.fillText("🛡️", cx, 170);
    ctx.fillStyle = "#8fb3c2"; ctx.font = "600 20px system-ui, sans-serif"; ctx.fillText("C E R T I F I C A T E   O F   C O M P L E T I O N", cx, 225);
    ctx.fillStyle = "#e8f4f8"; ctx.font = "700 44px system-ui, sans-serif"; ctx.fillText("AvSec — Авиационная безопасность", cx, 285);
    ctx.fillStyle = "#8fb3c2"; ctx.font = "19px system-ui, sans-serif"; ctx.fillText("ICAO Приложение 17 · Doc 8973 · НППБ РТ", cx, 322);
    ctx.strokeStyle = "rgba(39,224,160,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 120, 350); ctx.lineTo(cx + 120, 350); ctx.stroke();
    ctx.fillStyle = "#27e0a0"; ctx.font = "700 38px system-ui, sans-serif"; ctx.fillText(rank.name, cx, 410);
    const stats = [[String(xp), "XP"], [String(correct), "верных ответов"], [String(streak), "дней подряд"]];
    const colW = (W - p * 2 - 60) / 3, sx = p + 30 + colW / 2, sy = 530;
    stats.forEach((s, i) => { const x = sx + i * colW; ctx.fillStyle = "#46c2ff"; ctx.font = "700 44px system-ui, sans-serif"; ctx.fillText(s[0], x, sy); ctx.fillStyle = "#8fb3c2"; ctx.font = "18px system-ui, sans-serif"; ctx.fillText(s[1], x, sy + 32); });
    ctx.fillStyle = "#e8f4f8"; ctx.font = "600 24px system-ui, sans-serif"; ctx.fillText(dateStr, cx, 630);
    const a = document.createElement("a"); a.download = "AvSec-certificate.png"; a.href = c.toDataURL("image/png"); document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
}

/* ---------- Настройки ---------- */
function renderSettings() {
  app.innerHTML = `${topbar("Настройки")}<div class="qcard">
    <div class="setrow"><div class="setlbl"><b>Звук</b><small>сигналы верно/неверно</small></div>
      <button class="ghost" onclick="toggleSound()">${state.soundOn ? "🔊 Вкл" : "🔇 Выкл"}</button></div>
    <div class="setrow col"><div class="setlbl"><b>Аэропорт / организация</b><small>для командного лидерборда (напр. DYU)</small></div>
      <input id="orgInput" class="select" type="text" maxlength="24" placeholder="напр. DYU" value="${(state.org || "").replace(/"/g, "&quot;")}"></div>
    <div class="setrow"><div class="setlbl"><b>ИИ-проверка открытых ответов</b><small>${(localStorage.getItem("avsec_ai_url") || "").trim() ? "свой эндпоинт" : "встроенный бэкенд"}</small></div>
      <button class="ghost" onclick="setupAI()">⚙️ Настроить</button></div>
    <div class="setrow col"><div class="setlbl"><b>О тренажёре</b><small>версия 1.0</small></div>
      <small class="qsub">AvSec — учебный тренажёр по авиационной безопасности на основе ICAO Приложения 17, Doc 8973 и Национальной программы безопасности ГА РТ. Не заменяет официальные документы и аттестацию.</small></div>
  </div><button class="ghost fullrow" onclick="renderHome()">В меню</button>`;
  const oi = $("#orgInput");
  if (oi) oi.addEventListener("change", () => { state.org = oi.value.trim().slice(0, 24); save(); toast("Сохранено"); });
}
function toggleSound() { state.soundOn = !state.soundOn; save(); renderSettings(); }
function resetAll() {
  if (confirm("Сбросить весь прогресс, XP и ачивки?")) { localStorage.removeItem(SAVE_KEY); Object.assign(state, defaultState()); renderHome(); toast("Прогресс сброшен"); }
}

/* ===========================================================================
   TELEGRAM MINI APP (под защитой — в обычном браузере не мешает)
   =========================================================================== */
const TG = (window.Telegram && window.Telegram.WebApp) || null;
const inTelegram = !!(TG && TG.platform && TG.platform !== "unknown");
function tgBack(show) { if (!inTelegram) return; try { show ? TG.BackButton.show() : TG.BackButton.hide(); } catch (e) {} }
function tgHaptic(type) { if (!inTelegram) return; try { TG.HapticFeedback.notificationOccurred(type); } catch (e) {} }

function startApp() {
  initAnalytics(); track("app-open"); trackSource();
  if (inTelegram) {
    try {
      TG.ready(); TG.expand();
      if (TG.setBackgroundColor) TG.setBackgroundColor("#06121a");
      if (TG.setHeaderColor) TG.setHeaderColor("#06121a");
      if (TG.disableVerticalSwipes) TG.disableVerticalSwipes();
      TG.BackButton.onClick(() => renderHome());
    } catch (e) {}
    try {
      TG.CloudStorage.getItem(SAVE_KEY, (err, val) => {
        if (!err && val) { try { const cloud = JSON.parse(val); if ((cloud.xp || 0) > (state.xp || 0)) Object.assign(state, defaultState(), cloud); } catch (e) {} }
        renderHome();
      });
      return;
    } catch (e) {}
  }
  renderHome();
}
startApp();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
