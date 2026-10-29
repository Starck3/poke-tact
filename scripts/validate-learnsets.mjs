// Auditoria: compara os learnsets do dataset (PokeAPI) com o mod gen3frlg do Pokémon Showdown.
// Uso: node scripts/validate-learnsets.mjs   → imprime resumo e grava reports/learnset-audit.json
// Divergência NÃO significa que um lado está errado: é uma lista para conferência manual (ex.: Bulbapedia).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { nameKey } from './lib/names.mjs';

const SRC = 'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/gen3frlg/learnsets.ts';
const cache = new URL('../.cache/showdown-gen3frlg-learnsets.ts', import.meta.url);
if (!existsSync(cache)) await writeFile(cache, await (await fetch(SRC)).text());
const text = await readFile(cache, 'utf8');
const body = text.slice(text.indexOf('= {') + 2).replace(/;\s*$/, '');
const showdown = new Function(`return (${body})`)();

const data = JSON.parse(await readFile(new URL('../public/data/firered-leafgreen.json', import.meta.url), 'utf8'));
const norm = nameKey;

// Fonte → conjuntos comparáveis: level-up como "golpe@nível"; demais métodos como "golpe".
const METHOD = { machine: 'M', tutor: 'T', egg: 'E' };
function fromPokeapi(mon) {
  const s = { L: new Set(), M: new Set(), T: new Set(), E: new Set() };
  for (const l of mon.learnset) {
    if (l.method === 'level-up') s.L.add(`${norm(l.move)}@${l.level}`);
    else if (METHOD[l.method]) s[METHOD[l.method]].add(norm(l.move));
  }
  return s;
}
function fromShowdown(entry) {
  const s = { L: new Set(), M: new Set(), T: new Set(), E: new Set() };
  for (const [move, sources] of Object.entries(entry.learnset ?? {})) {
    for (const src of sources) {
      if (!src.startsWith('3')) continue; // só Gen 3
      const kind = src[1];
      if (kind === 'L') s.L.add(`${move}@${src.slice(2)}`);
      else if (s[kind]) s[kind].add(move); // 3S (evento) é ignorado: PokeAPI não modela
    }
  }
  return s;
}

const findShowdown = (mon) => showdown[norm(mon.name)] ?? showdown[norm(mon.name.split('-')[0])];
const divergences = [];
const stats = { checked: 0, identical: 0, missingInShowdown: [] };
const kindName = { L: 'level-up', M: 'machine', T: 'tutor', E: 'egg' };

for (const mon of data.pokemon) {
  const sd = findShowdown(mon);
  if (!sd) { stats.missingInShowdown.push(mon.name); continue; }
  stats.checked++;
  const a = fromPokeapi(mon);
  const b = fromShowdown(sd);
  let same = true;
  for (const k of Object.keys(kindName)) {
    for (const v of a[k]) if (!b[k].has(v)) { same = false; divergences.push({ pokemon: mon.name, id: mon.id, method: kindName[k], value: v, only: 'pokeapi' }); }
    for (const v of b[k]) if (!a[k].has(v)) { same = false; divergences.push({ pokemon: mon.name, id: mon.id, method: kindName[k], value: v, only: 'showdown' }); }
  }
  if (same) stats.identical++;
}

await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
await writeFile(new URL('../reports/learnset-audit.json', import.meta.url), JSON.stringify({ source: SRC, ...stats, divergences }, null, 1));

const by = {};
for (const d of divergences) { const key = `${d.method}/${d.only}`; by[key] = (by[key] ?? 0) + 1; }
console.log(`Comparados: ${stats.checked} | idênticos: ${stats.identical} | sem entrada no Showdown: ${stats.missingInShowdown.join(',') || '—'}`);
console.log('Divergências por tipo:', by);
