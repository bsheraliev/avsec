// PreToolUse-барьер для Bash и PowerShell: агент не коммитит, не сливает и не пушит прямо в main/master/stable.
// В эти ветки изменения попадают только через PR, и сливает их владелец. Команду `gh pr merge` по его слову
// барьер не трогает. Отказ — код выхода 2, причина в stderr: так Claude Code блокирует вызов и показывает
// причину модели. Работает на ПК (Windows) и в облачной сессии (Linux), нужен только node.
// Проверка: node .claude/hooks/test-guard-main.mjs
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTECTED = /^(main|master|stable)$/;

function branchAt(dir) {
  try { return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

// Цель refspec в push: «main», «HEAD:main», «+main», «refs/heads/main», «:main»
function targetsProtected(tok) {
  const dst = tok.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '');
  return PROTECTED.test(dst);
}

export function verdict(command, cwd, branchOf = branchAt) {
  let dir = cwd || process.cwd();
  for (const raw of String(command).split(/\r?\n|;|&&|\|\|/)) {
    const seg = raw.trim();
    const cd = seg.match(/^(?:cd|Set-Location|sl|pushd)\s+(?:-Path\s+)?["']?([^"']+?)["']?$/i);
    if (cd) { dir = resolve(dir, cd[1]); continue; }
    const m = seg.match(/(?:^|[\s&(])git(?:\.exe)?\s+((?:-C\s+(?:"[^"]+"|'[^']+'|\S+)\s+|-c\s+\S+\s+)*)(push|commit|merge)\b(.*)$/);
    if (!m) continue;
    const c = m[1].match(/-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
    const at = c ? resolve(dir, c[1] || c[2] || c[3]) : dir;
    const verb = m[2];
    const args = m[3].split(/\s+/).filter(Boolean).filter(a => !/^[|>]/.test(a));
    const br = branchOf(at);
    if (verb === 'commit' && PROTECTED.test(br)) return `коммит прямо в ветку ${br}`;
    if (verb === 'merge' && PROTECTED.test(br)) return `слияние в ветку ${br} на месте`;
    if (verb === 'push') {
      if (args.includes('--delete') || args.includes('-d')) {
        if (args.some(a => !a.startsWith('-') && PROTECTED.test(a))) return 'удаление защищённой ветки';
        continue;
      }
      const pos = args.filter(a => !a.startsWith('-'));
      if (pos.slice(1).some(targetsProtected)) return 'push в защищённую ветку';
      if (pos.length <= 1 && PROTECTED.test(br)) return `push из ветки ${br}`;
    }
  }
  return '';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { buf += d; });
  process.stdin.on('end', () => {
    let inp;
    try { inp = JSON.parse(buf.replace(/^﻿/, '')); } catch { process.exit(0); }   // BOM — если вход пришёл из PowerShell
    const why = verdict(inp?.tool_input?.command || '', inp?.cwd);
    if (!why) process.exit(0);
    process.stderr.write(`Заблокировано: ${why}. В main, master и stable изменения попадают только через PR, сливает владелец. ` +
      'Работай в ветке claude/…: git checkout -b claude/<тема>, затем git push -u origin claude/<тема> и PR.\n');
    process.exit(2);
  });
}
