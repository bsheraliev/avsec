# ============================================================================
#  AvSec — сборка ВНУТРЕННЕЙ версии (для обучения внутри организации).
#
#  Отличие от публичной версии на GitHub Pages:
#    • сюда МОЖНО класть реальные рентген-снимки (папка xray/);
#    • сборка НЕ публикуется в интернете — распространяется как папка/ZIP
#      для внутренней сети, флешки или офлайн-установки на устройство.
#
#  Запуск:  powershell -ExecutionPolicy Bypass -File .\build-internal.ps1
#  Результат: dist-internal\  и  dist-internal.zip
# ============================================================================
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$out = Join-Path $PSScriptRoot "dist-internal"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null

# --- файлы приложения ---
$files = @(
  "index.html", "app.js", "data.js", "xray.js", "i18n.js", "license.js",
  "sw.js", "manifest.webmanifest", "icon.svg", "TERMS.html"
)
foreach ($f in $files) {
  if (Test-Path $f) { Copy-Item $f -Destination $out }
  else { Write-Host "  пропущен (нет файла): $f" -ForegroundColor DarkYellow }
}
foreach ($p in @("icon-180.png", "icon-192.png", "icon-512.png")) {
  if (Test-Path $p) { Copy-Item $p -Destination $out }
}

# --- снимки: во внутренней сборке берём ВСЁ, включая реальные ---
$xr = Join-Path $out "xray"
New-Item -ItemType Directory -Path $xr | Out-Null
if (Test-Path "xray") {
  Get-ChildItem "xray" -File | Where-Object { $_.Name -ne "README.md" -and $_.Name -ne "scenes.example.json" } |
    ForEach-Object { Copy-Item $_.FullName -Destination $xr }
}
$imgs = @(Get-ChildItem $xr -File | Where-Object { $_.Extension -match '\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff)$' })
$hasManifest = Test-Path (Join-Path $xr "scenes.json")

# --- памятка внутри сборки ---
@"
AvSec — внутренняя учебная сборка
=================================

Назначение: подготовка персонала внутри организации.

РАСПРОСТРАНЕНИЕ
  • внутренняя сеть, локальный сервер, флешка, установка на устройство;
  • НЕ размещать на публичных сайтах и в открытых репозиториях.

ЕСЛИ В СБОРКЕ ЕСТЬ РЕАЛЬНЫЕ СНИМКИ (папка xray)
  • это материал ограниченного доступа: обращаться как со служебной информацией;
  • передавать только лицам, допущенным к подготовке по авиационной безопасности;
  • не публиковать, не пересылать во внешние мессенджеры и облака.

ЗАПУСК
  Откройте index.html через локальный веб-сервер, например:
      python -m http.server 8080
  затем в браузере: http://localhost:8080
  (Просто двойной клик по index.html не подойдёт: service worker и загрузка
   снимков требуют http:// , а не file:// )

Собрано: $(Get-Date -Format "yyyy-MM-dd HH:mm")
Снимков в папке xray: $($imgs.Count)
Файл scenes.json: $(if ($hasManifest) { "есть" } else { "НЕТ — реальные снимки не подключатся" })
"@ | Out-File -FilePath (Join-Path $out "ПРОЧТИ-МЕНЯ.txt") -Encoding utf8

# --- архив ---
$zip = Join-Path $PSScriptRoot "dist-internal.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $out "*") -DestinationPath $zip

Write-Host ""
Write-Host "Внутренняя сборка готова:" -ForegroundColor Green
Write-Host "   папка : $out"
Write-Host "   архив : $zip"
Write-Host "   снимков в xray: $($imgs.Count)$(if (-not $hasManifest -and $imgs.Count -gt 0) { '  <- нет scenes.json, снимки не подключатся!' })"
Write-Host ""
Write-Host "Проверить локально:  cd `"$out`"  ;  python -m http.server 8080" -ForegroundColor Cyan
