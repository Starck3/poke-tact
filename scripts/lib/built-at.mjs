// builtAt estável (I4, PLANO-EXECUCAO-7): a data de montagem só muda quando o dado muda — antes toda montagem trocava a
// data em public/data/<jogo>.json e games.json, e o git mostrava arquivo alterado sem mudança real.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Se `next` e `prev` só diferem na data em `path` (ex.: ['game', 'builtAt']), põe em `next` a data de `prev`. Devolve
 * a data mantida (ou null). */
export function keepBuiltAt(next, prev, path = ['builtAt']) {
  const at = (o) => path.slice(0, -1).reduce((x, k) => x?.[k], o);
  const k = path.at(-1), a = at(prev), b = at(next);
  if (!a?.[k] || !b?.[k] || a[k] === b[k]) return null;
  const now = b[k];
  b[k] = a[k];
  if (JSON.stringify(prev) === JSON.stringify(next)) return a[k];
  b[k] = now;
  return null;
}

/** Depois da montagem de um jogo: compara public/data/<jogo>.json com a versão do git (HEAD); se só a data mudou, volta a
 * data do git no arquivo (troca só o texto da data — o resto do arquivo fica byte a byte). */
export function keepBuiltAtFromGit(rel, path = ['game', 'builtAt']) {
  const cwd = fileURLToPath(new URL('../..', import.meta.url));
  const file = new URL(`../../${rel}`, import.meta.url);
  let prev;
  try { prev = JSON.parse(execFileSync('git', ['show', `HEAD:${rel}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 })); } catch { return null; }
  const text = readFileSync(file, 'utf8');
  const next = JSON.parse(text);
  const now = path.reduce((x, k) => x?.[k], next);
  const kept = keepBuiltAt(next, prev, path);
  if (kept) writeFileSync(file, text.replace(JSON.stringify(now), JSON.stringify(kept)));
  return kept;
}
