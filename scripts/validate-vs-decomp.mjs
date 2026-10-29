// Compara o dataset (PokeAPI) com o decomp pret/pokefirered (dados reais do jogo) para TODAS as espécies.
// Uso: node scripts/validate-vs-decomp.mjs → imprime resumo e grava reports/decomp-audit.json
import { readFileSync, writeFileSync } from 'node:fs';
import { loadDecomp } from './lib/decomp.mjs';
import { decompPaths } from './lib/decomp.mjs';
import { mkdirSync } from 'node:fs';
import { nameKey } from './lib/names.mjs';
const gameId = process.argv[2] ?? 'firered-leafgreen';
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });

const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const d = loadDecomp(gameId);
const norm = nameKey;
const decompByName = Object.fromEntries(Object.entries(d.species).map(([n, v]) => [norm(n), v]));
const moveIdOf = (name) => JSON.parse(readFileSync(new URL(`../.cache/move_${name}.json`, import.meta.url), 'utf8')).id;
const idCache = new Map();
const mid = (n) => idCache.get(n) ?? (idCache.set(n, moveIdOf(n)), idCache.get(n));
const moveName = Object.fromEntries(Object.entries(d.moveId).map(([n, i]) => [i, n.toLowerCase()]));

const KINDS = { 'level-up': 'level', machine: 'machine', tutor: 'tutor', egg: 'egg' };
const out = { commit: d.commit, compared: 0, missingInDecomp: [], identical: 0, divergences: [] };

for (const mon of data.pokemon) {
  const dec = decompByName[norm(mon.name)] ?? decompByName[norm(mon.name.split('-')[0])];
  if (!dec) { out.missingInDecomp.push(mon.name); continue; }
  out.compared++;
  const api = { level: new Set(), machine: new Set(), tutor: new Set(), egg: new Set() };
  for (const l of mon.learnset) {
    const k = KINDS[l.method];
    if (!k) { (out.skippedMethods ??= {})[l.method] = (out.skippedMethods[l.method] ?? 0) + 1; continue; } // ex.: light-ball-egg (Emerald), tratado em código pelo jogo
    api[k].add(k === 'level' ? `${mid(l.move)}@${l.level}` : mid(l.move));
  }
  let same = true;
  for (const k of Object.values(KINDS)) {
    for (const v of api[k]) if (!dec[k].has(v)) { same = false; out.divergences.push({ pokemon: mon.name, kind: k, value: String(v), label: label(v), only: 'pokeapi' }); }
    for (const v of dec[k]) if (!api[k].has(v)) { same = false; out.divergences.push({ pokemon: mon.name, kind: k, value: String(v), label: label(v), only: 'decomp' }); }
  }
  if (same) out.identical++;
}
function label(v) { const [id, lvl] = String(v).split('@'); return moveName[id] + (lvl ? `@${lvl}` : ''); }

writeFileSync(new URL(`../reports/${gameId}/decomp-audit.json`, import.meta.url), JSON.stringify(out, null, 1));
const by = {};
for (const x of out.divergences) by[`${x.kind}/${x.only}`] = (by[`${x.kind}/${x.only}`] ?? 0) + 1;
console.log(`decomp ${d.commit.slice(0, 7)} | comparados ${out.compared} | idênticos ${out.identical} | sem correspondência: ${out.missingInDecomp.join(',') || '—'}`);
console.log('divergências:', by);
