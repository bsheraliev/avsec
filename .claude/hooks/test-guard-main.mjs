// Проверка барьера guard-main.mjs: node .claude/hooks/test-guard-main.mjs → «Все проверки барьера выполнены»
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verdict } from './guard-main.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (cond, what) => { console.log((cond ? 'ok  ' : 'FAIL') + '  ' + what); if (!cond) fails++; };
const on = br => () => br;                                   // подставная текущая ветка

ok(verdict('git push origin main', '.', on('claude/x')), 'push origin main — блок');
ok(verdict('git push origin HEAD:main', '.', on('claude/x')), 'push HEAD:main — блок');
ok(verdict('git push -f origin +stable', '.', on('claude/x')), 'push +stable — блок');
ok(verdict('git push', '.', on('main')), 'push без цели, стоя на main — блок');
ok(verdict('git push origin', '.', on('stable')), 'push origin, стоя на stable — блок');
ok(verdict('git commit -m "x"', '.', on('main')), 'коммит на main — блок');
ok(verdict('git merge claude/x', '.', on('main')), 'merge на main — блок');
ok(verdict('git add .; git commit -m x', '.', on('main')), 'коммит во второй части команды — блок');
ok(verdict('git push origin --delete main', '.', on('claude/x')), 'удаление main — блок');
ok(!verdict('git push -u origin claude/security-gate', '.', on('claude/security-gate')), 'push своей ветки claude/… — можно');
ok(!verdict('git push', '.', on('claude/x')), 'push без цели со своей ветки — можно');
ok(!verdict('git commit -m x', '.', on('claude/x')), 'коммит в своей ветке — можно');
ok(!verdict('git push origin --delete transfer/procs-quiz', '.', on('main')), 'удаление временной ветки — можно');
ok(!verdict('git checkout main && git pull origin main', '.', on('main')), 'checkout и pull main — можно');
ok(!verdict('gh pr merge 263 --merge', '.', on('claude/x')), 'gh pr merge (по слову владельца) — можно');
ok(!verdict('git log --oneline -5 main', '.', on('main')), 'чтение истории — можно');
const seen = [];
verdict('cd sub && git commit -m x', '/repo', d => { seen.push(d.replace(/\\/g, '/')); return 'main'; });
ok(seen[0]?.endsWith('/repo/sub'), 'учитывает cd перед git');

// Целиком через stdin, как вызывает Claude Code: код 2 и причина в stderr
const run = cmd => spawnSync(process.execPath, [join(here, 'guard-main.mjs')], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: process.cwd() }), encoding: 'utf8' });
const r1 = run('git push origin main');
ok(r1.status === 2 && /Заблокировано/.test(r1.stderr), 'через stdin: push origin main → код 2');
const r2 = run('git status');
ok(r2.status === 0, 'через stdin: git status → код 0');
const r3 = spawnSync(process.execPath, [join(here, 'guard-main.mjs')], { input: 'not json', encoding: 'utf8' });
ok(r3.status === 0, 'через stdin: мусор на входе не мешает работе');

console.log(fails ? `\nНЕ ПРОЙДЕНО: ${fails}` : '\nВсе проверки барьера выполнены');
process.exit(fails ? 1 : 0);
