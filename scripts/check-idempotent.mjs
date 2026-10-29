// Verificador de idempotência (I1, PLANO-EXECUCAO-7): roda cada etapa do jogo duas vezes seguidas e compara os arquivos de
// public/data/<jogo>-*.json depois da 1ª e da 2ª vez — uma etapa que muda o resultado ao rodar de novo (duplica um local,
// sobe um estágio duas vezes…) aparece aqui. No fim devolve public/data ao estado do git (o resultado da montagem). Lê só
// o que já está em cache (data-sources/); não use com mudanças por salvar em public/data.
// Uso: node scripts/check-idempotent.mjs <jogo> [etapa ...]   (sem etapas: as etapas apply-*/sync/build-evo-items do jogo)
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const [gameId, ...only] = process.argv.slice(2);
if (!gameId) { console.log('uso: node scripts/check-idempotent.mjs <jogo> [etapa ...]'); process.exit(2); }
const dirty = execFileSync('git', ['status', '--porcelain', 'public/data', 'reports'], { cwd, encoding: 'utf8' }).trim();
if (dirty) { console.log('public/data ou reports têm mudanças por salvar — salve ou descarte antes (o verificador restaura pelo git)'); process.exit(2); }
const DEFAULT = ['apply-bulbapedia-rates', 'apply-bulbapedia-spawn-weights', 'apply-usum-dump-rates', 'apply-bulbapedia-exclusives', 'apply-bulbapedia-trainers', 'apply-smogon-subway', 'apply-bulbapedia-walkthrough', 'apply-bulbapedia-catchlimit',
  'apply-bulbapedia-trades', 'apply-bulbapedia-items', 'sync-walkthrough-modern', 'apply-breeding', 'build-evo-items'];
const steps = only.length ? only : DEFAULT;
const dataDir = new URL('../public/data/', import.meta.url);
// ordem das chaves não conta (uma etapa que reescreve o objeto pode mudar a ordem sem mudar o dado)
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const snap = () => Object.fromEntries(readdirSync(dataDir).filter((f) => f.startsWith(gameId + '-') || f === gameId + '.json')
  .map((f) => [f, JSON.stringify(canon(JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'))))]));
const run = (step) => execFileSync(process.execPath, [`scripts/${step}.mjs`, gameId], { cwd, stdio: 'pipe', encoding: 'utf8' });
/** 1ª diferença entre dois JSON (caminho e valores) — para o relatório */
function firstDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return `${path}: ${a.length} → ${b.length} itens`;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d; }
  }
  return `${path}: ${JSON.stringify(a)?.slice(0, 120)} → ${JSON.stringify(b)?.slice(0, 120)}`;
}

const bad = [];
const orig = snap();
try {
  for (const step of steps) {
    try { run(step); } catch (e) { console.log(`- ${step}: erro na 1ª vez (${e.status}) — pulada`); continue; }
    const one = snap();
    run(step);
    const two = snap();
    const diffs = Object.keys({ ...one, ...two }).filter((f) => one[f] !== two[f]).map((f) => `${f} ${firstDiff(JSON.parse(one[f] ?? 'null'), JSON.parse(two[f] ?? 'null'))}`);
    console.log(`${diffs.length ? '✖' : '✔'} ${step}${diffs.length ? '\n    ' + diffs.join('\n    ') : ''}`);
    if (diffs.length) bad.push(step);
  }
  // ciclo: as etapas, rodadas sobre o resultado da montagem (o que está no git), têm que devolver o mesmo resultado
  if (!only.length) {
    const end = snap();
    const diffs = Object.keys({ ...orig, ...end }).filter((f) => orig[f] !== end[f]).map((f) => `${f} ${firstDiff(JSON.parse(orig[f] ?? 'null'), JSON.parse(end[f] ?? 'null'))}`);
    console.log(`${diffs.length ? '✖' : '✔'} ciclo (todas as etapas sobre a montagem)${diffs.length ? '\n    ' + diffs.join('\n    ') : ''}`);
    if (diffs.length) bad.push('ciclo');
  }
} finally {
  execFileSync('git', ['checkout', '--', 'public/data', 'reports'], { cwd });
  execFileSync('git', ['clean', '-fdq', '--', 'public/data', 'reports'], { cwd }); // arquivo novo de uma etapa (relatório)
}
console.log(`[${gameId}] ${bad.length ? 'não idempotentes: ' + bad.join(', ') : 'todas as etapas idempotentes'}`);
process.exit(bad.length ? 1 : 0);
