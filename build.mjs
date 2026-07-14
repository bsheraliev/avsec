/* ===========================================================================
   AvSec — сборка защиты «демо + лицензия».
   Из мастер-файла data.src.js (локальный, не публикуется) делает:
     • data.js         — ПУБЛИЧНЫЙ пробник (только SAMPLE_CATS)
     • data.full.enc   — ПУБЛИЧНЫЙ шифр полной базы (AES-256-GCM; без ключа бесполезен)
     • backend/_generated/avsec-backend.gs — крошечный GAS, отдаёт КЛЮЧ после проверки лицензии
     • .avsec-fullkey  — сохранённый ключ (gitignore), чтобы пересборки были стабильны
   Полный ОТКРЫТЫЙ текст 134 вопросов в публичный репозиторий не попадает.
   Запуск:  node build.mjs
   =========================================================================== */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SRC = path.join(ROOT, "data.src.js");

/* --- Настройки пробника: какие темы отдаём публично (витрина для продаж).
   По умолчанию — темы, которые и так уже запущены в UI (WIP_AFTER в app.js):
   awareness, access, restricted, screening. Меняйте набор под нужную «глубину» демо. --- */
const SAMPLE_CATS = ["awareness", "access", "restricted", "screening"];
const SAMPLE_KEY  = "AvSec-demo-2026";   // ключ пробника — не секрет (пробник и так открыт)

/* --- Ключ полной базы (AES-256, 32 байта). Секрет: живёт в GAS, клиенту выдаётся
       сервером после проверки лицензии. Стабилен между сборками (файл .avsec-fullkey). --- */
const KEY_FILE = path.join(ROOT, ".avsec-fullkey");
let FULL_KEY;
if (process.env.AVSEC_KEY) FULL_KEY = Buffer.from(process.env.AVSEC_KEY, "base64");
else if (fs.existsSync(KEY_FILE)) FULL_KEY = Buffer.from(fs.readFileSync(KEY_FILE, "utf8").trim(), "base64");
else { FULL_KEY = crypto.randomBytes(32); fs.writeFileSync(KEY_FILE, FULL_KEY.toString("base64"), "utf8"); }
const FULL_KEY_B64 = FULL_KEY.toString("base64");

/* --- Пробник: тот же лёгкий XOR (пробник и так открыт, шифр здесь — просто «не в лоб») --- */
function xorEnc(jsonStr, key) {
  const bytes = Buffer.from(jsonStr, "utf8"), kb = Buffer.from(key, "utf8");
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= kb[i % kb.length];
  return bytes.toString("base64");
}
/* --- Полная база: AES-256-GCM. Формат: base64( iv(12) | ciphertext | tag(16) ),
       совместим с Web Crypto subtle.decrypt на клиенте. --- */
function aesEnc(jsonStr, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(Buffer.from(jsonStr, "utf8")), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64");
}

/* --- Загрузка мастер-данных --- */
if (!fs.existsSync(SRC)) { console.error("НЕТ data.src.js рядом с build.mjs"); process.exit(1); }
const srcText = fs.readFileSync(SRC, "utf8");
const DATA = Function(srcText.replace(/const\s+DATA\s*=/, "return "))();
const total = DATA.quiz.length;

/* --- Пробник → data.js --- */
const sampleQuiz = DATA.quiz.filter(q => SAMPLE_CATS.includes(q.cat));
const sample = { ranks: DATA.ranks, achievements: DATA.achievements, quiz: sampleQuiz };
const sampleEnc = xorEnc(JSON.stringify(sample), SAMPLE_KEY);
const dataJs =
`/* AvSec — ПУБЛИЧНЫЙ пробник (${sampleQuiz.length} из ${total} вопросов). Полная база — по лицензии организации.
   Контент защищён авторским правом (см. LICENSE). Мастер для правок — локальный data.src.js (не публикуется). */
var _D="${sampleEnc}";
var DATA=(function(k){var b=atob(_D),a=new Uint8Array(b.length),i;for(i=0;i<b.length;i++)a[i]=b.charCodeAt(i);var kb=new TextEncoder().encode(k);for(i=0;i<a.length;i++)a[i]^=kb[i%kb.length];return JSON.parse(new TextDecoder().decode(a));})("${SAMPLE_KEY}");
var SAMPLE_CATS=${JSON.stringify(SAMPLE_CATS)};
`;
fs.writeFileSync(path.join(ROOT, "data.js"), dataJs, "utf8");

/* --- Полная база → публичный шифр data.full.enc (AES) --- */
const fullEnc = aesEnc(JSON.stringify({ quiz: DATA.quiz }), FULL_KEY);
fs.writeFileSync(path.join(ROOT, "data.full.enc"), fullEnc, "utf8");

/* --- Крошечный GAS с ключом → backend/_generated/avsec-backend.gs (gitignore) --- */
const outDir = path.join(ROOT, "backend", "_generated");
fs.mkdirSync(outDir, { recursive: true });
const templatePath = path.join(ROOT, "backend", "avsec-backend.template.gs");
if (!fs.existsSync(templatePath)) { console.error("НЕТ backend/avsec-backend.template.gs"); process.exit(1); }
let gs = fs.readFileSync(templatePath, "utf8").replace("__FULL_KEY__", FULL_KEY_B64);
fs.writeFileSync(path.join(outDir, "avsec-backend.gs"), gs, "utf8");

console.log("✔ data.js — пробник:", sampleQuiz.length, "вопр. (темы:", SAMPLE_CATS.join(", ") + ")");
console.log("✔ data.full.enc — полная база", total, "вопр., AES-256-GCM,", Math.round(fullEnc.length / 1024), "КБ (публичный, без ключа бесполезен)");
console.log("✔ backend/_generated/avsec-backend.gs — GAS с ключом (крошечный)");
console.log("✔ Ключ AES (base64, в .gs и .avsec-fullkey, храните в тайне):", FULL_KEY_B64);
