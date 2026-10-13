/* ===========================================================================
   Проводник («Как проходить экзамен») — сборка копии для сайта приложения.
   Исходник один: guide.src.html (он же публикуется страницей на claude.ai).
   Из него получается guide.html — полноценная страница, которая открывается
   прямо из приложения, без входа и без интернета (лежит в кэше sw.js).
   guide.html руками НЕ править: изменили guide.src.html → запустили сборку.
   Запуск:  node build-guide.mjs
   =========================================================================== */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const src = fs.readFileSync(path.join(ROOT, "guide.src.html"), "utf8");

if (!/<title>[^<]+<\/title>/.test(src)) throw new Error("guide.src.html: нет <title>");

/* data-site — метка «копия на сайте приложения» (скрипт проводника по ней меняет
   ссылку на «← В приложение»); data-theme="dark" — как у самого приложения. */
const head =
`<!DOCTYPE html>
<!-- СОБРАНО из guide.src.html командой «node build-guide.mjs» — не править руками -->
<html lang="ru" data-site data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#06121a">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<style>
html{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}
body{margin:0;font-size:14px}
img{max-width:100%}
[hidden]{display:none!important}
</style>
`;

fs.writeFileSync(path.join(ROOT, "guide.html"), head + src.trimEnd() + "\n</html>\n", "utf8");
console.log("guide.html собран из guide.src.html (" + src.length + " симв.)");
